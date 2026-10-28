import { dirname, relative } from "node:path";
import type TS from "typescript";
import { patchRepositoryAnalysis } from "./patch.server";
import { cloneForOverlay, simulateChange, type SimulationSnapshot } from "./simulate";
import { loadParser } from "./parse.server";
import type { ImportRef, RepoAnalysis } from "./types";

export type FixIssue = "unresolved-import" | "arity-shim" | "cycle" | "column-drift" | "auto";

export type RemediationStrategy =
  | "unresolved_import_rewrite"
  | "arity_and_export_compatibility_shim"
  | "runtime_cycle_to_import_type"
  | "sql_column_drift_rename";

export interface FixPatchInput {
  path: string;
  content?: string;
  issue?: FixIssue;
}

export interface FixCandidate {
  specifier: string;
  target: string;
  replacement: string;
  score: number;
}

type DraftSimulation = Awaited<ReturnType<typeof simulateChange>>;

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

/** Every structural fact the healer can remove, counted from one overlay. */
function breakingScore(analysis: RepoAnalysis, simulation: DraftSimulation, path: string) {
  return (
    countUnresolved(analysis, path) +
    simulation.new_unresolved_imports.length +
    simulation.new_cycles.length +
    simulation.removed_export_callers.length +
    simulation.signature_arity_breaks.length +
    simulation.property_contract_breaks.length +
    simulation.new_column_drift.length
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
  const source = withoutExtension(path);
  if (!source) return { ambiguous: [] };
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

async function typeScript() {
  const mod = (await import("typescript")) as typeof import("typescript") & {
    default?: typeof import("typescript");
  };
  return mod.default ?? mod;
}

/** Rewrites unresolved specifiers to an exact existing target. */
function rewriteUnresolvedImports(content: string, path: string, analysis: RepoAnalysis) {
  const file = analysis.files.find((candidate) => candidate.path === path);
  const unresolved = file?.imports.filter((ref) => ref.kind === "unresolved") ?? [];
  const found: FixCandidate[] = [];
  const ambiguous: { specifier: string; line: number; candidates: string[] }[] = [];
  const changes: { line: number; before: string; after: string; target: string }[] = [];
  const used = new Set<string>();
  for (const ref of unresolved) {
    const result = candidateFor(analysis, path, ref);
    if (result.candidate) found.push(result.candidate);
    else if (result.ambiguous.length)
      ambiguous.push({ specifier: ref.specifier, line: ref.line, candidates: result.ambiguous });
  }
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
  return { content, candidates: found, ambiguous, changes };
}

/**
 * Strategy 2a: make newly required trailing parameters optional so every
 * observed caller with fewer arguments remains type-compatible.
 */
async function optionalizeArity(
  content: string,
  path: string,
  symbolName: string,
  targetRequired: number,
) {
  const ts = await typeScript();
  const sf = ts.createSourceFile(path, content, ts.ScriptTarget.Latest, true);
  const javascript = /\.(?:[cm]?jsx?)$/i.test(path);
  const declarations: (TS.FunctionLikeDeclaration | TS.FunctionDeclaration)[] = [];
  const collect = (node: TS.Node) => {
    if (ts.isFunctionDeclaration(node) && node.name?.text === symbolName) declarations.push(node);
    if (ts.isVariableStatement(node)) {
      for (const declaration of node.declarationList.declarations) {
        if (
          ts.isIdentifier(declaration.name) &&
          declaration.name.text === symbolName &&
          declaration.initializer &&
          (ts.isArrowFunction(declaration.initializer) ||
            ts.isFunctionExpression(declaration.initializer))
        )
          declarations.push(declaration.initializer);
      }
    }
    ts.forEachChild(node, collect);
  };
  collect(sf);
  const edits: { start: number; text: string }[] = [];
  for (const declaration of declarations) {
    const parameters = [...declaration.parameters];
    let required = parameters.filter(
      (parameter) =>
        !parameter.questionToken && !parameter.initializer && !parameter.dotDotDotToken,
    ).length;
    for (let index = parameters.length - 1; index >= 0 && required > targetRequired; index -= 1) {
      const parameter = parameters[index]!;
      if (parameter.questionToken || parameter.initializer || parameter.dotDotDotToken) continue;
      required -= 1;
      edits.push({
        start: parameter.name.getEnd(),
        text: javascript ? " = void 0" : "?",
      });
    }
  }
  if (!edits.length) return null;
  let next = content;
  for (const edit of [...edits].sort((a, b) => b.start - a.start))
    next = `${next.slice(0, edit.start)}${edit.text}${next.slice(edit.start)}`;
  return next;
}

/** Strategy 2b: restore a backwards-compatible export for a retained declaration. */
function restoreExport(content: string, symbolName: string) {
  const escaped = symbolName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (new RegExp(`\\bexport\\b[^\\n;]*\\b${escaped}\\b`).test(content)) return null;
  const declaration = new RegExp(
    `\\b(?:declare\\s+)?(interface|type|function|class|const|let|var|enum)\\s+${escaped}\\b`,
  ).exec(content);
  if (!declaration) return null;
  const typeOnly = declaration[1] === "interface" || declaration[1] === "type";
  return `${content.replace(/\s*$/, "")}\n\nexport${typeOnly ? " type" : ""} { ${symbolName} };\n`;
}

/** True when an identifier only appears inside a type position. */
function isTypePosition(ts: typeof import("typescript"), node: TS.Node) {
  let current: TS.Node | undefined = node.parent;
  while (current) {
    if (ts.isTypeNode(current)) return true;
    if (ts.isInterfaceDeclaration(current) || ts.isTypeAliasDeclaration(current)) return true;
    if (ts.isStatement(current) || ts.isSourceFile(current)) return false;
    current = current.parent;
  }
  return false;
}

/** Strategy 3: make a runtime-only cycle edge type-only when nothing uses it at runtime. */
export async function convertCycleImportsToType(
  content: string,
  path: string,
  analysis: RepoAnalysis,
  cyclePaths: Set<string>,
) {
  const ts = await typeScript();
  // Parent links are required to distinguish type positions from value usage.
  const sf = ts.createSourceFile(path, content, ts.ScriptTarget.Latest, true);
  const file = analysis.files.find((candidate) => candidate.path === path);
  if (!file) return null;
  const edits: { start: number; end: number; text: string }[] = [];
  for (const statement of sf.statements) {
    if (!ts.isImportDeclaration(statement) || !statement.importClause) continue;
    if (statement.importClause.isTypeOnly) continue;
    const specifier = statement.moduleSpecifier;
    if (!ts.isStringLiteral(specifier)) continue;
    const ref = file.imports.find(
      (candidate) =>
        candidate.specifier === specifier.text &&
        Math.abs(
          candidate.line - (sf.getLineAndCharacterOfPosition(statement.getStart(sf)).line + 1),
        ) <= 1,
    );
    if (!ref?.target || !cyclePaths.has(ref.target)) continue;
    const locals = new Set<string>();
    const clause = statement.importClause;
    if (clause.name) locals.add(clause.name.text);
    if (clause.namedBindings) {
      if (ts.isNamespaceImport(clause.namedBindings)) locals.add(clause.namedBindings.name.text);
      else for (const element of clause.namedBindings.elements) locals.add(element.name.text);
    }
    if (!locals.size) continue;
    let valueUsage = false;
    const visit = (node: TS.Node) => {
      if (node === statement) return;
      if (ts.isIdentifier(node) && locals.has(node.text) && !isTypePosition(ts, node)) {
        valueUsage = true;
        return;
      }
      ts.forEachChild(node, visit);
    };
    ts.forEachChild(sf, visit);
    if (valueUsage) continue;
    edits.push({
      start: statement.getStart(sf),
      end: statement.getStart(sf) + 6,
      text: "import type",
    });
  }
  if (!edits.length) return null;
  let next = content;
  for (const edit of [...edits].sort((a, b) => b.start - a.start))
    next = `${next.slice(0, edit.start)}${edit.text}${next.slice(edit.end)}`;
  return next;
}

function levenshtein(a: string, b: string) {
  const rows = [Array.from({ length: b.length + 1 }, (_, index) => index)];
  for (let i = 1; i <= a.length; i += 1) {
    const row = [i];
    for (let j = 1; j <= b.length; j += 1)
      row[j] = Math.min(
        rows[i - 1]![j]! + 1,
        row[j - 1]! + 1,
        rows[i - 1]![j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    rows.push(row);
  }
  return rows[a.length]![b.length]!;
}

/** Strategy 4: rename a drifted literal column to the closest active DDL column. */
function renameDriftedColumns(
  content: string,
  path: string,
  analysis: RepoAnalysis,
  simulation: DraftSimulation,
) {
  const lines = content.split("\n");
  let changed = false;
  for (const finding of simulation.new_column_drift) {
    const references = finding.references.filter((reference) => reference.path === path);
    if (!references.length) continue;
    const resource = analysis.resources.find(
      (candidate) =>
        candidate.kind === "table" && candidate.name.toLowerCase() === finding.table.toLowerCase(),
    );
    const columns = resource?.columns?.map((column) => column.name) ?? [];
    // Prefer an exact rename lineage from ALTER TABLE ... RENAME COLUMN.
    const renamed = resource?.sqlEvents?.find(
      (event) => event.op === "rename" && event.from === finding.column,
    )?.column;
    const candidate =
      renamed ??
      columns
        .map((name) => ({ name, distance: levenshtein(name, finding.column) }))
        .filter((entry) => entry.distance <= 3 && entry.distance > 0)
        .sort((a, b) => a.distance - b.distance || a.name.localeCompare(b.name))[0]?.name;
    if (!candidate) continue;
    const escaped = finding.column.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // Column literals can sit inside a comma-separated select string, so match
    // the identifier token rather than a whole quoted cell.
    const pattern = new RegExp(`\\b${escaped}\\b`, "g");
    for (const reference of references) {
      const index = reference.line - 1;
      if (index < 0 || index >= lines.length) continue;
      const line = lines[index]!;
      if (!pattern.test(line)) continue;
      pattern.lastIndex = 0;
      const replaced = line.replace(pattern, candidate);
      if (replaced === line) continue;
      lines[index] = replaced;
      changed = true;
    }
  }
  if (!changed) return null;
  return lines.join("\n");
}

async function overlay(snapshot: SimulationSnapshot, path: string, content: string) {
  return patchRepositoryAnalysis(cloneForOverlay(snapshot.analysis), [{ path, content }]);
}

/**
 * Builds and verifies deterministic AST remediation for all four supported
 * breakage classes. A patch is marked verified only after applying it to an
 * in-memory clone of the real graph and observing the breaking score fall
 * without adding cycles.
 */
export async function generateFixPatch(snapshot: SimulationSnapshot, input: FixPatchInput) {
  const path = normalize(input.path);
  const analysis = snapshot.analysis;
  const file = analysis.files.find((candidate) => candidate.path === path);
  if (!file)
    return {
      verified: false,
      remediation: "machine-verified" as const,
      path,
      issue: input.issue ?? "auto",
      reason: `${path} is not an analyzed source file.`,
      candidates: [],
      strategiesApplied: [],
    };

  const unresolved = file.imports.filter((ref) => ref.kind === "unresolved");
  if (input.content === undefined) {
    if (!unresolved.length)
      return {
        verified: false,
        remediation: "machine-verified" as const,
        path,
        issue: input.issue ?? "auto",
        reason: `${path} has no unresolved imports in the stored snapshot.`,
        candidates: [],
        strategiesApplied: [],
      };
    const found: FixCandidate[] = [];
    for (const ref of unresolved) {
      const result = candidateFor(analysis, path, ref);
      if (result.candidate) found.push(result.candidate);
    }
    return {
      verified: false,
      needs_content: true,
      path,
      issue: input.issue ?? "auto",
      reason:
        "Pass the current file content so Nykst can build the exact line diff and apply it in memory.",
      candidates: found,
      strategiesApplied: [],
    };
  }

  let content = input.content;
  const draftSimulation = await simulateChange(snapshot, [{ path, content }], [path]);
  const draftAnalysis = await overlay(snapshot, path, content);
  const beforeScore = breakingScore(draftAnalysis, draftSimulation, path);
  const beforeCycles = draftSimulation.new_cycles.length;
  const applied: RemediationStrategy[] = [];
  const details: string[] = [];
  const usedStrategies = new Set<RemediationStrategy>();

  // Strategy 1: unresolved import specifiers.
  const rewrite = rewriteUnresolvedImports(content, path, draftAnalysis);
  if (rewrite.changes.length) {
    content = rewrite.content;
    usedStrategies.add("unresolved_import_rewrite");
    details.push(
      `${rewrite.changes.length} unresolved import${rewrite.changes.length === 1 ? "" : "s"} rewritten to an exact existing module.`,
    );
  }
  let currentAnalysis = rewrite.changes.length
    ? await overlay(snapshot, path, content)
    : draftAnalysis;
  let currentSimulation = rewrite.changes.length
    ? await simulateChange(snapshot, [{ path, content }], [path])
    : draftSimulation;

  // Strategy 2b: restore an export that still has a declaration in this file.
  const removedCallers = currentSimulation.removed_export_callers.filter(
    (item) => item.targetPath === path,
  );
  const restored = new Set<string>();
  for (const caller of removedCallers) {
    if (restored.has(caller.symbolName)) continue;
    const next = restoreExport(content, caller.symbolName);
    if (!next) continue;
    content = next;
    restored.add(caller.symbolName);
    usedStrategies.add("arity_and_export_compatibility_shim");
    details.push(
      `Restored the export of ${caller.symbolName} for ${caller.importerPath}:${caller.importerLine}.`,
    );
  }
  if (restored.size) {
    currentAnalysis = await overlay(snapshot, path, content);
    currentSimulation = await simulateChange(snapshot, [{ path, content }], [path]);
  }

  // Strategy 2a: arity compatibility shim over the observed caller envelope.
  const arityBreaks = currentSimulation.signature_arity_breaks.filter(
    (item) => item.targetPath === path,
  );
  const shimmed = new Set<string>();
  for (const breakage of arityBreaks) {
    if (shimmed.has(breakage.symbolName)) continue;
    const targetRequired = Math.min(
      breakage.passedArgs,
      file.symbols?.find((symbol) => symbol.name === breakage.symbolName)?.requiredArity ??
        breakage.passedArgs,
    );
    const next = await optionalizeArity(content, path, breakage.symbolName, targetRequired);
    if (!next) continue;
    content = next;
    shimmed.add(breakage.symbolName);
    usedStrategies.add("arity_and_export_compatibility_shim");
    details.push(
      `Made ${breakage.symbolName} accept ${targetRequired} required argument${targetRequired === 1 ? "" : "s"} so the caller at ${breakage.importerPath}:${breakage.callLine} stays valid.`,
    );
  }
  if (shimmed.size) {
    currentAnalysis = await overlay(snapshot, path, content);
    currentSimulation = await simulateChange(snapshot, [{ path, content }], [path]);
  }

  // Strategy 3: turn runtime-only cycle edges into type-only imports.
  const cyclePaths = new Set(currentSimulation.new_cycles.flat());
  if (cyclePaths.has(path)) {
    const next = await convertCycleImportsToType(content, path, currentAnalysis, cyclePaths);
    if (next) {
      content = next;
      usedStrategies.add("runtime_cycle_to_import_type");
      details.push("Converted a runtime-only cycle edge to an `import type` edge.");
      currentAnalysis = await overlay(snapshot, path, content);
      currentSimulation = await simulateChange(snapshot, [{ path, content }], [path]);
    }
  }

  // Strategy 4: SQL column drift rename.
  if (currentSimulation.new_column_drift.length) {
    const next = renameDriftedColumns(content, path, currentAnalysis, currentSimulation);
    if (next) {
      content = next;
      usedStrategies.add("sql_column_drift_rename");
      details.push("Renamed a literal column reference to the closest active DDL column.");
    }
  }

  const afterAnalysis =
    content === input.content ? draftAnalysis : await overlay(snapshot, path, content);
  const afterSimulation =
    content === input.content
      ? draftSimulation
      : await simulateChange(snapshot, [{ path, content }], [path]);
  const afterScore = breakingScore(afterAnalysis, afterSimulation, path);
  const verified =
    content !== input.content &&
    afterScore < beforeScore &&
    afterSimulation.new_cycles.length <= beforeCycles;
  const patch = unifiedDiff(path, input.content, content);
  applied.push(...usedStrategies);

  return {
    verified,
    remediation: "machine-verified" as const,
    path,
    issue: input.issue ?? "auto",
    patch,
    healedContent: content,
    strategiesApplied: applied,
    strategyDetails: details,
    changes: rewrite.changes,
    verification: {
      unresolved_before: countUnresolved(draftAnalysis, path),
      unresolved_after: countUnresolved(afterAnalysis, path),
      total_unresolved_before: draftAnalysis.stats.unresolvedImports,
      total_unresolved_after: afterAnalysis.stats.unresolvedImports,
      cycles_before: draftSimulation.new_cycles.length,
      cycles_after: afterSimulation.new_cycles.length,
      added_cycles: afterSimulation.new_cycles,
      breaking_before: beforeScore,
      breaking_after: afterScore,
      applied_in_memory: true,
      persisted: false,
    },
    candidates: rewrite.candidates,
    ambiguous: rewrite.ambiguous,
    limitations: verified
      ? [
          `Machine-verified remediation (${applied.length} strateg${applied.length === 1 ? "y" : "ies"}) applied to an in-memory clone; the repository was not modified.`,
        ]
      : [
          "The candidate did not reduce the verified breaking findings without adding cycles; no patch was accepted.",
        ],
  };
}
