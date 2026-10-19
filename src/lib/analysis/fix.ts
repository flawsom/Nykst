import { dirname, relative } from "node:path";
import { patchRepositoryAnalysis, type ChangedFile } from "./patch.server";
import { cloneForOverlay, type SimulationSnapshot } from "./simulate";
import type { ImportRef, RepoAnalysis } from "./types";

export interface FixPatchInput {
  path: string;
  content?: string;
  issue?: "unresolved-import";
}

export interface FixCandidate {
  specifier: string;
  target: string;
  replacement: string;
  score: number;
}

const SOURCE_EXTENSION = /\.(?:[cm]?[jt]sx?)$/i;

function normalize(path: string) {
  return path.replace(/^\.?\//, "");
}

function withoutExtension(path: string) {
  return path.replace(SOURCE_EXTENSION, "");
}

function basename(path: string) {
  return withoutExtension(path.split("/").pop() ?? "");
}

function countUnresolved(analysis: RepoAnalysis, path: string) {
  return (
    analysis.files
      .find((file) => file.path === path)
      ?.imports.filter((ref) => ref.kind === "unresolved").length ?? 0
  );
}

function candidateFor(
  analysis: RepoAnalysis,
  path: string,
  ref: ImportRef,
): { candidate?: FixCandidate; ambiguous: string[] } {
  const specifier = ref.specifier;
  const base = basename(specifier);
  if (!base || specifier.startsWith("node:")) return { ambiguous: [] };
  const wantedDirectory = specifier.startsWith(".") ? dirname(path) : "";
  const matches = analysis.files
    .filter((file) => file.path !== path && basename(file.path) === base)
    .map((file) => {
      let score = 0;
      if (wantedDirectory && dirname(file.path) === wantedDirectory) score += 4;
      if (file.path.endsWith(`${specifier.replace(/^\.\//, "")}.ts`)) score += 6;
      if (file.path.endsWith(`${specifier.replace(/^\.\//, "")}.tsx`)) score += 6;
      if (file.path.endsWith(specifier.replace(/^\.\//, ""))) score += 6;
      const depth = file.path.split("/").length - path.split("/").length;
      score -= Math.abs(depth);
      return { path: file.path, score };
    })
    .sort((a, b) => b.score - a.score || a.path.localeCompare(b.path));
  if (!matches.length) return { ambiguous: [] };
  const best = matches.filter((match) => match.score === matches[0]!.score);
  if (best.length > 1) return { ambiguous: best.map((match) => match.path) };
  const target = matches[0]!.path;
  const targetBase = withoutExtension(target);
  let replacement: string;
  if (specifier.startsWith(".")) {
    const rel = relative(dirname(path), targetBase).replace(/\\/g, "/");
    replacement = rel.startsWith(".") ? rel : `./${rel}`;
  } else if (specifier.startsWith("@/")) {
    replacement = target.startsWith("src/") ? `@/${targetBase.slice(4)}` : `@/${targetBase}`;
  } else {
    return { ambiguous: [] };
  }
  if (specifier.endsWith(".js") && !replacement.endsWith(".js")) replacement += ".js";
  if (specifier.endsWith(".ts") && !replacement.endsWith(".ts")) replacement += ".ts";
  if (replacement === specifier) return { ambiguous: [] };
  return { candidate: { specifier, target, replacement, score: matches[0]!.score }, ambiguous: [] };
}

function replaceSpecifier(
  content: string,
  line: number,
  specifier: string,
  replacement: string,
): { content: string; before: string; after: string } | null {
  const lines = content.split("\n");
  const current = lines[line - 1];
  if (current === undefined) return null;
  const escaped = specifier.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`(["'])${escaped}\\1`);
  if (!pattern.test(current)) return null;
  const next = current.replace(
    pattern,
    (_match, quote: string) => `${quote}${replacement}${quote}`,
  );
  if (next === current) return null;
  lines[line - 1] = next;
  return { content: lines.join("\n"), before: current, after: next };
}

function unifiedDiff(path: string, before: string, after: string) {
  const oldLines = before.split("\n");
  const newLines = after.split("\n");
  const changed: { index: number; before: string; after: string }[] = [];
  const max = Math.max(oldLines.length, newLines.length);
  for (let index = 0; index < max; index += 1)
    if (oldLines[index] !== newLines[index])
      changed.push({
        index,
        before: oldLines[index] ?? "",
        after: newLines[index] ?? "",
      });
  if (!changed.length) return "";
  const groups: (typeof changed)[] = [];
  for (const change of changed) {
    const last = groups[groups.length - 1];
    if (last && change.index - last[last.length - 1]!.index <= 4) last.push(change);
    else groups.push([change]);
  }
  const output = [`--- a/${path}`, `+++ b/${path}`];
  for (const group of groups) {
    const start = Math.max(0, group[0]!.index - 2);
    const end = Math.min(max, group[group.length - 1]!.index + 3);
    const oldCount = end - start;
    const newCount = oldCount;
    output.push(`@@ -${start + 1},${oldCount} +${start + 1},${newCount} @@`);
    const byIndex = new Map(group.map((change) => [change.index, change]));
    for (let index = start; index < end; index += 1) {
      const change = byIndex.get(index);
      if (change) {
        output.push(`-${change.before}`);
        if (change.after !== change.before) output.push(`+${change.after}`);
      } else output.push(` ${oldLines[index] ?? ""}`);
    }
  }
  return `${output.join("\n")}\n`;
}

/**
 * Builds a deterministic import rewrite, applies it to a cloned graph, and returns
 * the diff only when the unresolved-import count actually falls and cycles do not grow.
 */
export async function generateFixPatch(snapshot: SimulationSnapshot, input: FixPatchInput) {
  const path = normalize(input.path);
  const analysis = snapshot.analysis;
  const file = analysis.files.find((candidate) => candidate.path === path);
  if (!file)
    return {
      verified: false,
      path,
      issue: input.issue ?? "unresolved-import",
      reason: `${path} is not an analyzed source file.`,
      candidates: [],
    };
  const unresolved = file.imports.filter((ref) => ref.kind === "unresolved");
  if (!unresolved.length)
    return {
      verified: false,
      path,
      issue: input.issue ?? "unresolved-import",
      reason: `${path} has no unresolved imports.`,
      candidates: [],
    };
  const found: FixCandidate[] = [];
  const ambiguous: { specifier: string; line: number; candidates: string[] }[] = [];
  for (const ref of unresolved) {
    const result = candidateFor(analysis, path, ref);
    if (result.candidate) found.push(result.candidate);
    else if (result.ambiguous.length)
      ambiguous.push({ specifier: ref.specifier, line: ref.line, candidates: result.ambiguous });
  }
  if (!found.length)
    return {
      verified: false,
      path,
      issue: input.issue ?? "unresolved-import",
      reason:
        "No exact candidate target was found for these unresolved imports; Nykst will not guess a file.",
      candidates: [],
      ambiguous,
    };
  if (input.content === undefined)
    return {
      verified: false,
      needs_content: true,
      path,
      issue: input.issue ?? "unresolved-import",
      reason:
        "Pass the current file content so Nykst can build the exact line diff and apply it in memory.",
      candidates: found,
      ambiguous,
    };

  let content = input.content;
  const changes: { line: number; before: string; after: string; target: string }[] = [];
  const used = new Set<string>();
  for (const candidate of found) {
    if (used.has(candidate.specifier)) continue;
    const ref = unresolved.find((item) => item.specifier === candidate.specifier);
    if (!ref) continue;
    const replaced = replaceSpecifier(
      content,
      ref.line,
      candidate.specifier,
      candidate.replacement,
    );
    if (!replaced) continue;
    used.add(candidate.specifier);
    content = replaced.content;
    changes.push({
      line: ref.line,
      before: replaced.before,
      after: replaced.after,
      target: candidate.target,
    });
  }
  if (!changes.length)
    return {
      verified: false,
      path,
      issue: input.issue ?? "unresolved-import",
      reason:
        "The current content does not contain the unresolved specifiers on their recorded lines.",
      candidates: found,
      ambiguous,
    };

  const changedFiles: ChangedFile[] = [{ path, content }];
  const after = await patchRepositoryAnalysis(cloneForOverlay(analysis), changedFiles);
  const beforeCount = countUnresolved(analysis, path);
  const afterCount = countUnresolved(after, path);
  const cycleKey = (cycle: string[]) => [...cycle].sort().join("\u0000");
  const beforeCycles = new Set(analysis.cycles.map(cycleKey));
  const addedCycles = after.cycles.filter((cycle) => !beforeCycles.has(cycleKey(cycle)));
  const verified = afterCount < beforeCount && addedCycles.length === 0;
  const patch = unifiedDiff(path, input.content, content);
  return {
    verified,
    path,
    issue: input.issue ?? "unresolved-import",
    patch,
    changes,
    verification: {
      unresolved_before: beforeCount,
      unresolved_after: afterCount,
      total_unresolved_before: analysis.stats.unresolvedImports,
      total_unresolved_after: after.stats.unresolvedImports,
      cycles_before: analysis.cycles.length,
      cycles_after: after.cycles.length,
      added_cycles: addedCycles,
      applied_in_memory: true,
      persisted: false,
    },
    candidates: found,
    ambiguous,
    limitations: verified
      ? [
          "The diff was verified by applying it to an in-memory clone; the repository was not modified.",
        ]
      : [
          "The candidate did not reduce unresolved imports without adding cycles; no patch was accepted.",
        ],
  };
}
