import { catalogEntry } from "./catalog";
import { cyclePath, findCycles } from "./cycles";
import { dataCallTargets } from "./data-calls";
import { describeFile } from "./engine.server";
import { exportOrigin, exportsOf } from "./exports";
import { createDependencyChecker, isSecretEnvName } from "./findings";
import { impactOf, indexAnalysis } from "./impact";
import { loadParser, parseSource, syntaxProblems, type ParsedSource } from "./parse.server";
import { ImportResolver, isSourcePath, type AliasScope, type PackageManifest } from "./resolve";
import type { AnalyzedFile, ImportRef, RepoAnalysis } from "./types";
import type { ProposedEdit, VerifyIssue, VerifyReport } from "./verify-types";

export type { ProposedEdit, VerifyIssue, VerifyReport } from "./verify-types";

/**
 * Checks proposed file edits against the analysis of the repository. Everything reported is
 * derived from the code and the import graph: nothing is guessed. What it cannot see is listed
 * in the report (types and behavior are not checked), so a "clear" verdict is never read as
 * "this works".
 */

const GENERATED_PATH =
  /(^|\/)(generated|__generated__|\.generated|\.next|\.prisma|\.output|dist)\//i;

const CHECKED = [
  "Syntax of every changed file (TypeScript parser)",
  "Every import resolves to a file in the repository or an installed package",
  "Named imports exist in the module they come from",
  "Exports other files still import (removed, renamed or deleted), including through re-export files",
  "Argument counts of calls to changed or existing functions",
  "New circular imports",
  "New secrets read when a module loads",
  "New packages, external services and database tables",
  "Pages, API routes and tests the change reaches",
];

const NOT_CHECKED = [
  "Types: the TypeScript type checker is not run, so a wrong argument or return type is not detected.",
  "Behavior: nothing is executed. Run the tests listed under impact.",
  "Imports built at runtime and framework file conventions are invisible to the analysis.",
  "Files that are not JavaScript or TypeScript.",
];

const basename = (path: string) => path.split("/").pop() ?? path;

/** Line of one imported name, as an editor would underline it. */
const nameLine = (ref: ImportRef, name: string) => {
  const at = ref.names.indexOf(name);
  return (at >= 0 ? ref.nameLines?.[at] : undefined) ?? ref.line;
};
const stemOf = (path: string) => basename(path).replace(/\.[^.]+$/, "");

export async function verifyChange(
  analysis: RepoAnalysis,
  rawEdits: ProposedEdit[],
  options: { scope?: string[] } = {},
): Promise<VerifyReport> {
  await loadParser();
  const issues: VerifyIssue[] = [];
  const seen = new Set<string>();
  const add = (issue: VerifyIssue) => {
    const key = `${issue.check}|${issue.path}|${issue.line ?? ""}|${issue.message}`;
    if (seen.has(key) || issues.length >= 300) return;
    seen.add(key);
    issues.push(issue);
  };

  /* ------------------------------ normalize edits ------------------------------ */
  const editMap = new Map<string, ProposedEdit>();
  for (const edit of rawEdits) {
    const path = edit.path.trim().replace(/^\.?\//, "");
    if (!path || path.includes("..") || path.startsWith("/")) {
      add({
        severity: "error",
        check: "path",
        path: edit.path,
        message: "Not a valid repository path.",
      });
      continue;
    }
    editMap.set(path, { path, content: edit.content });
  }
  const edits = [...editMap.values()];
  const oldFiles = new Map(analysis.files.map((file) => [file.path, file]));
  const deleted = new Set(edits.filter((edit) => edit.content === null).map((edit) => edit.path));
  const written = edits.filter((edit) => edit.content !== null);
  const sourceEdits = written.filter((edit) => isSourcePath(edit.path));

  /* ------------------------------ build the new graph ------------------------------ */
  const pathSet = new Set([...oldFiles.keys()].filter((path) => !deleted.has(path)));
  for (const edit of sourceEdits) pathSet.add(edit.path);
  const resolver = new ImportResolver(
    pathSet,
    analysis.resolver.manifests as PackageManifest[],
    analysis.resolver.aliases as AliasScope[],
  );
  const packageDirs = analysis.resolver.manifests
    .map((m) => m.dir)
    .sort((a, b) => b.length - a.length);
  const packageDirOf = (path: string) =>
    packageDirs.find((dir) => dir === "" || path.startsWith(`${dir}/`)) ?? "";

  const newFiles = new Map(oldFiles);
  for (const path of deleted) newFiles.delete(path);
  const sources = new Map<string, ParsedSource>();
  const broken = new Set<string>();

  for (const edit of sourceEdits) {
    const content = edit.content!;
    const problems = syntaxProblems(edit.path, content);
    if (problems.length) {
      for (const problem of problems.slice(0, 5))
        add({
          severity: "error",
          check: "syntax",
          path: edit.path,
          line: problem.line,
          message: `Syntax error: ${problem.message}`,
        });
      broken.add(edit.path);
      continue;
    }
    try {
      const source = parseSource(edit.path, content);
      sources.set(edit.path, source);
      newFiles.set(
        edit.path,
        describeFile(edit.path, source, resolver, packageDirOf(edit.path)).file,
      );
    } catch (error) {
      add({
        severity: "error",
        check: "syntax",
        path: edit.path,
        message: `Could not be parsed: ${error instanceof Error ? error.message : "unknown error"}`,
      });
      broken.add(edit.path);
    }
  }
  const edited = new Set([...sources.keys()]); // edited files that parsed
  const touched = new Set([...edited, ...deleted]);

  // Calls inside edited files point at whatever they import; follow re-exports to the real function.
  for (const path of edited) {
    const file = newFiles.get(path)!;
    file.calls = file.calls.flatMap((call) => {
      const origin = exportOrigin(newFiles, call.target, call.name);
      return origin?.sig.kind === "function" ? [{ ...call, target: origin.path }] : [];
    });
  }

  const importers = new Map<string, { from: AnalyzedFile; ref: ImportRef }[]>();
  for (const file of newFiles.values())
    for (const ref of file.imports)
      if (ref.kind === "internal" && ref.target)
        importers.set(ref.target, [...(importers.get(ref.target) ?? []), { from: file, ref }]);

  /* ----------------------------- checks per edited file ----------------------------- */
  const dependencies = createDependencyChecker(analysis);
  const usesSupabase = analysis.services.some((service) => service.id === "supabase");
  const knownResources = new Set(analysis.resources.map((resource) => resource.id));
  const repoDefinesTables = analysis.resources.some(
    (resource) => resource.kind === "table" && resource.definedIn.length,
  );
  const repoDefinesModels = analysis.resources.some(
    (resource) => resource.kind === "model" && resource.definedIn.length,
  );

  for (const path of edited) {
    const file = newFiles.get(path)!;
    const old = oldFiles.get(path);

    // imports that do not resolve
    for (const ref of file.imports) {
      if (ref.kind !== "unresolved") continue;
      if (
        old?.imports.some((item) => item.kind === "unresolved" && item.specifier === ref.specifier)
      )
        continue;
      const generated = GENERATED_PATH.test(ref.specifier);
      const lookalikes = [...oldFiles.keys()]
        .filter(
          (candidate) => stemOf(candidate) === stemOf(ref.specifier) && !deleted.has(candidate),
        )
        .slice(0, 2);
      add({
        severity: generated ? "warning" : "error",
        check: "unresolved-import",
        path,
        line: ref.line,
        message: `Import "${ref.specifier}" does not resolve to a file in the repository.`,
        ...(lookalikes.length ? { detail: `Did you mean ${lookalikes.join(" or ")}?` } : {}),
      });
    }

    // named imports that do not exist
    for (const ref of file.imports) {
      if (ref.kind !== "internal" || !ref.target || ref.reexportAll) continue;
      const wanted = ref.names.filter((name) => name !== "*");
      if (!wanted.length) continue;
      const available = exportsOf(newFiles, ref.target);
      if (!available.complete || !available.names.size) continue;
      const missing = wanted.filter((name) => !available.names.has(name));
      if (!missing.length) continue;
      add({
        severity: "error",
        check: "missing-export",
        path,
        line: nameLine(ref, missing[0]!),
        message: `Imports ${missing.map((name) => `\`${name}\``).join(", ")} from ${ref.target}, which does not export ${missing.length > 1 ? "them" : "it"}.`,
        detail: `${basename(ref.target)} exports: ${[...available.names].slice(0, 10).join(", ")}`,
      });
    }

    // calls whose argument count does not match the function's signature
    for (const call of file.calls) {
      if (call.spread) continue;
      const sig = newFiles.get(call.target)?.exportSigs[call.name];
      if (sig?.kind !== "function" || sig.required === undefined) continue;
      if (call.args < sig.required)
        add({
          severity: "error",
          check: "signature",
          path,
          line: call.line,
          message: `Calls ${call.name}() with ${call.args} argument${call.args === 1 ? "" : "s"}, but it requires ${sig.required}.`,
          detail: `Declared in ${call.target}`,
        });
      else if (sig.max !== null && sig.max !== undefined && call.args > sig.max)
        add({
          severity: "warning",
          check: "signature",
          path,
          line: call.line,
          message: `Calls ${call.name}() with ${call.args} arguments, but it accepts at most ${sig.max}.`,
          detail: `Declared in ${call.target}`,
        });
    }

    // new packages, services, tables
    const oldExternal = new Set(
      (old?.imports ?? []).filter((ref) => ref.kind === "external").map((ref) => ref.target),
    );
    const reportedPackages = new Set<string>();
    for (const ref of file.imports) {
      if (
        ref.kind !== "external" ||
        !ref.target ||
        oldExternal.has(ref.target) ||
        reportedPackages.has(ref.target)
      )
        continue;
      reportedPackages.add(ref.target);
      if (dependencies && !dependencies.isDeclared(file.packageDir, ref.target))
        add({
          severity: "warning",
          check: "undeclared-package",
          path,
          line: ref.line,
          message: `Imports "${ref.target}", which is not in package.json.`,
          detail: `Add it to ${file.packageDir ? `${file.packageDir}/package.json` : "package.json"} or the install will not provide it.`,
        });
    }
    for (const id of file.services.filter((service) => !old?.services.includes(service))) {
      const name =
        analysis.services.find((service) => service.id === id)?.name ??
        catalogEntry(id)?.name ??
        id;
      add({
        severity: "info",
        check: "service",
        path,
        message: `Now talks to ${name}${analysis.services.some((s) => s.id === id) ? "" : " (new to this repository)"}.`,
      });
    }
    const oldSecretNames = new Set((old?.moduleScopeEnv ?? []).map((env) => env.name));
    for (const env of file.moduleScopeEnv)
      if (!oldSecretNames.has(env.name) && isSecretEnvName(env.name))
        add({
          severity: "warning",
          check: "module-scope-secret",
          path,
          line: env.line,
          message: `Reads ${env.name} when the module loads.`,
          detail:
            "Read it inside the function that needs it: values read at import time are fixed before serverless and edge runtimes provide them.",
        });
    const oldResources = new Set((old?.resources ?? []).map((use) => use.id));
    for (const target of dataCallTargets(sources.get(path)!.dataCalls, usesSupabase, (kind, name) =>
      knownResources.has(`${kind}:${name}`),
    )) {
      const id = `${target.kind}:${target.name}`;
      if (oldResources.has(id)) continue;
      if (knownResources.has(id))
        add({
          severity: "info",
          check: "data",
          path,
          line: target.line,
          message: `Now uses ${target.kind} \`${target.name}\`.`,
        });
      else if (
        (target.kind === "table" && repoDefinesTables) ||
        (target.kind === "model" && repoDefinesModels)
      )
        add({
          severity: "warning",
          check: "data",
          path,
          line: target.line,
          message: `References ${target.kind} \`${target.name}\`, which is not defined in this repository's ${target.kind === "model" ? "Prisma schema" : "migrations"}.`,
        });
    }
  }

  /* ------------- exports that disappear, and who still depends on them ------------- */
  const reportedImports = new Set<string>();
  const propagate = (
    path: string,
    removed: Set<string>,
    whole: boolean,
    depth: number,
    visited: Set<string>,
  ) => {
    for (const { from, ref } of importers.get(path) ?? []) {
      if (deleted.has(from.path)) continue;
      const fresh = edited.has(from.path); // its imports were already checked in full above
      if (ref.reexportAll) {
        const own = new Set(from.exports);
        const passed = new Set([...removed].filter((name) => name !== "default" && !own.has(name)));
        const key = `${from.path}|${[...passed].sort().join(",")}`;
        if ((passed.size || whole) && depth < 5 && !visited.has(key)) {
          visited.add(key);
          propagate(from.path, passed, whole, depth + 1, visited);
        }
        continue;
      }
      if (fresh && !whole) continue;
      const key = `${from.path}:${ref.line}:${path}`;
      if (reportedImports.has(key)) continue;
      if (whole) {
        reportedImports.add(key);
        add({
          severity: "error",
          check: "deleted-file",
          path: from.path,
          line: ref.line,
          message: `Imports ${path}, which this change deletes.`,
        });
        continue;
      }
      const hits = ref.names.filter((name) => removed.has(name));
      if (hits.length) {
        reportedImports.add(key);
        add({
          severity: "error",
          check: "removed-export",
          path: from.path,
          line: nameLine(ref, hits[0]!),
          message: `Imports ${hits.map((name) => `\`${name}\``).join(", ")} from ${path}, which no longer exports ${hits.length > 1 ? "them" : "it"}.`,
          detail: "This file is not part of the change, so it would break.",
        });
      } else if (ref.names.includes("*") && removed.size) {
        reportedImports.add(key);
        add({
          severity: "warning",
          check: "removed-export",
          path: from.path,
          line: ref.line,
          message: `Uses everything from ${path} (namespace import), which no longer exports ${[...removed].slice(0, 4).join(", ")}.`,
          detail: "Check whether this file uses any of them.",
        });
      }
    }
  };
  for (const path of touched) {
    const old = oldFiles.get(path);
    if (!old) continue;
    if (deleted.has(path)) {
      propagate(path, new Set(), true, 0, new Set());
      continue;
    }
    const before = exportsOf(oldFiles, path);
    const after = exportsOf(newFiles, path);
    if (!after.complete) continue;
    const removed = new Set([...before.names].filter((name) => !after.names.has(name)));
    if (removed.size) propagate(path, removed, false, 0, new Set());
  }

  /* --------------------- changed function signatures vs their callers --------------------- */
  for (const path of edited) {
    const old = oldFiles.get(path);
    const file = newFiles.get(path)!;
    if (!old) continue;
    for (const [name, sig] of Object.entries(file.exportSigs)) {
      const before = old.exportSigs[name];
      if (before?.kind !== "function") continue;
      if (sig.kind !== "function") {
        const callers = [...newFiles.values()].filter((other) =>
          other.calls.some((call) => call.target === path && call.name === name),
        );
        if (callers.length)
          add({
            severity: "warning",
            check: "signature",
            path,
            message: `\`${name}\` is no longer a function, but ${callers.length} file${callers.length === 1 ? "" : "s"} call it.`,
            detail: callers
              .slice(0, 4)
              .map((caller) => caller.path)
              .join(", "),
          });
        continue;
      }
      if (before.required === sig.required && before.max === sig.max) continue;
      let checked = 0;
      let broke = 0;
      for (const other of newFiles.values()) {
        if (edited.has(other.path)) continue; // reported with the rest of that file's checks
        for (const call of other.calls) {
          if (call.target !== path || call.name !== name || call.spread) continue;
          checked += 1;
          const tooFew = call.args < (sig.required ?? 0);
          const tooMany = sig.max !== null && sig.max !== undefined && call.args > sig.max;
          if (!tooFew && !tooMany) continue;
          broke += 1;
          add({
            severity: tooFew ? "error" : "warning",
            check: "signature",
            path: other.path,
            line: call.line,
            message: tooFew
              ? `Calls ${name}() with ${call.args} argument${call.args === 1 ? "" : "s"}, but the change makes it require ${sig.required}.`
              : `Calls ${name}() with ${call.args} arguments, but the change makes it accept at most ${sig.max}.`,
            detail: `${name} changed from ${describe(before)} to ${describe(sig)} in ${path}`,
          });
        }
      }
      add({
        severity: "info",
        check: "signature",
        path,
        message: `\`${name}\` changed from ${describe(before)} to ${describe(sig)}; ${checked} call site${checked === 1 ? "" : "s"} outside this change checked${broke ? `, ${broke} would break` : ", all compatible"}.`,
      });
    }
  }

  /* ------------------------------------ cycles ------------------------------------ */
  const adjacency = (files: Map<string, AnalyzedFile>) => {
    const map = new Map<string, string[]>();
    for (const file of files.values())
      map.set(
        file.path,
        file.imports
          .filter((ref) => ref.kind === "internal" && !ref.typeOnly && ref.target)
          .map((ref) => ref.target!),
      );
    return map;
  };
  if (edited.size) {
    const oldKeys = new Set(findCycles(adjacency(oldFiles)).map((members) => members.join("|")));
    const graph = adjacency(newFiles);
    for (const members of findCycles(graph)) {
      if (oldKeys.has(members.join("|")) || !members.some((member) => edited.has(member))) continue;
      const start = members.find((member) => edited.has(member))!;
      const chain = cyclePath(graph, members, start);
      const next = chain[1] ?? start;
      const line = newFiles
        .get(start)
        ?.imports.find((ref) => ref.target === next && !ref.typeOnly)?.line;
      add({
        severity: "warning",
        check: "cycle",
        path: start,
        ...(line ? { line } : {}),
        message: `Introduces a circular import: ${chain.map(basename).join(" → ")}.`,
        detail: "Files that import each other load in an order you do not control.",
      });
    }
  }

  /* -------------------------- non-source files and scope -------------------------- */
  for (const edit of written.filter((item) => !isSourcePath(item.path))) {
    if (edit.path.endsWith(".json")) {
      try {
        JSON.parse(edit.content!);
      } catch (error) {
        add({
          severity: "error",
          check: "syntax",
          path: edit.path,
          message: `Invalid JSON: ${error instanceof Error ? error.message : "parse error"}`,
        });
        continue;
      }
    }
    add({
      severity: "info",
      check: "not-analyzed",
      path: edit.path,
      message: "Changed, but not JavaScript or TypeScript, so it is not analyzed.",
    });
  }
  const scope = (options.scope ?? []).map((path) => path.replace(/\/+$/, ""));
  if (scope.length)
    for (const edit of edits) {
      if (scope.some((path) => edit.path === path || edit.path.startsWith(`${path}/`))) continue;
      add({
        severity: "info",
        check: "scope",
        path: edit.path,
        message: "Outside the code you selected. Make sure this is intended.",
      });
    }

  /* ------------------------------------- impact ------------------------------------- */
  const index = indexAnalysis(analysis);
  const seeds = [...touched].filter((path) => oldFiles.has(path));
  const impact = impactOf(index, seeds);
  const dependents = impact.impacted.filter(
    (item) => !item.typeOnly && item.role !== "test",
  ).length;
  const editedTests = [...touched].filter(
    (path) => (newFiles.get(path) ?? oldFiles.get(path))?.role === "test",
  );
  const tests = [...new Set([...impact.tests.map((item) => item.path), ...editedTests])];
  if (seeds.length && !tests.length && analysis.files.some((file) => file.role === "test"))
    add({
      severity: "warning",
      check: "tests",
      path: seeds[0]!,
      message: "No test imports the changed code, directly or indirectly.",
      detail: "Nothing in the test suite would notice if this change broke something.",
    });

  const order = { error: 0, warning: 1, info: 2 } as const;
  issues.sort(
    (a, b) =>
      order[a.severity] - order[b.severity] ||
      a.path.localeCompare(b.path) ||
      (a.line ?? 0) - (b.line ?? 0),
  );
  const counts = {
    errors: issues.filter((issue) => issue.severity === "error").length,
    warnings: issues.filter((issue) => issue.severity === "warning").length,
    infos: issues.filter((issue) => issue.severity === "info").length,
  };
  return {
    verdict: counts.errors ? "blocked" : counts.warnings ? "review" : "clear",
    counts,
    issues,
    files: edits.map((edit) => ({
      path: edit.path,
      status:
        edit.content === null
          ? "deleted"
          : !isSourcePath(edit.path)
            ? "other"
            : oldFiles.has(edit.path)
              ? "modified"
              : "new",
      loc: edit.content ? edit.content.split("\n").filter((line) => line.trim()).length : 0,
    })),
    impact: {
      level: impact.level,
      dependents,
      entrypoints: impact.entrypoints.slice(0, 15).map((item) => item.path),
      tests: tests.slice(0, 30),
      areas: impact.areas.slice(0, 8),
    },
    checked: CHECKED,
    notChecked: NOT_CHECKED,
    basis: { commit: analysis.ref, analyzedAt: analysis.generatedAt },
  };
}

function describe(sig: { required?: number | undefined; max?: number | null | undefined }) {
  const required = sig.required ?? 0;
  if (sig.max === null || sig.max === undefined) return `${required}+ arguments`;
  return required === sig.max
    ? `${required} argument${required === 1 ? "" : "s"}`
    : `${required}–${sig.max} arguments`;
}
