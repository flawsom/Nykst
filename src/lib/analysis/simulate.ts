import { impactBriefing } from "./context";
import { patchRepositoryAnalysis, type ChangedFile } from "./patch.server";
import { resolveExportOrigin } from "./reexports";
import { columnDriftFindings } from "./sql";
import type { RepoAnalysis, RepoHistory } from "./types";

export interface SimulationSnapshot {
  repository_full_name: string;
  created_at: string;
  analysis: RepoAnalysis;
  history: RepoHistory | undefined;
}

export function cloneForOverlay(analysis: RepoAnalysis): RepoAnalysis {
  return {
    ...analysis,
    files: analysis.files.map((file) => ({
      ...file,
      imports: file.imports.map((ref) => ({ ...ref })),
      exports: [...file.exports],
      functions: [...file.functions],
      classes: [...file.classes],
      envVars: [...file.envVars],
      services: [...file.services],
      resources: file.resources.map((use) => ({ ...use })),
      ...(file.endpoints ? { endpoints: file.endpoints.map((endpoint) => ({ ...endpoint })) } : {}),
      ...(file.symbols ? { symbols: file.symbols.map((symbol) => ({ ...symbol })) } : {}),
      ...(file.reExports ? { reExports: file.reExports.map((reExport) => ({ ...reExport })) } : {}),
      ...(file.columnRefs ? { columnRefs: file.columnRefs.map((ref) => ({ ...ref })) } : {}),
    })),
    resources: analysis.resources.map((resource) => ({
      ...resource,
      definedIn: [...resource.definedIn],
      uses: resource.uses.map((use) => ({ ...use })),
      ...(resource.columns ? { columns: resource.columns.map((column) => ({ ...column })) } : {}),
      ...(resource.sqlEvents
        ? { sqlEvents: resource.sqlEvents.map((event) => ({ ...event })) }
        : {}),
      ...(resource.columnDrift
        ? {
            columnDrift: resource.columnDrift.map((finding) => ({
              ...finding,
              references: finding.references.map((reference) => ({ ...reference })),
            })),
          }
        : {}),
    })),
    services: analysis.services.map((service) => ({
      ...service,
      packages: [...service.packages],
      envVars: [...service.envVars],
      files: [...service.files],
      evidence: service.evidence.map((item) => ({ ...item })),
    })),
  };
}

function normalize(path: string) {
  return path.replace(/^\.?\//, "");
}

function expandPaths(analysis: RepoAnalysis, inputs: string[]) {
  const all = analysis.files.map((file) => file.path);
  const out = new Set<string>();
  for (const raw of inputs) {
    const input = normalize(raw);
    if (!input) continue;
    if (all.includes(input)) out.add(input);
    else {
      const prefix = input.endsWith("/") ? input : `${input}/`;
      all.filter((path) => path.startsWith(prefix)).forEach((path) => out.add(path));
    }
  }
  return [...out];
}

function cycleKey(cycle: string[]) {
  return [...cycle].sort().join("\u0000");
}

/**
 * Applies file writes and deletions to a cloned graph. Nothing is persisted and the
 * stored snapshot is never mutated; the result is safe to hand back to an agent.
 */
export async function simulateChange(
  snapshot: SimulationSnapshot,
  changes: ChangedFile[],
  requestedPaths: string[] = [],
) {
  if (!changes.length) throw new Error("Pass at least one change.");
  if (changes.length > 50) throw new Error("At most 50 changes can be simulated at once.");
  for (const change of changes) {
    if (!change.path.trim()) throw new Error("Every change needs a repository-relative path.");
    if (change.content !== null && typeof change.content !== "string")
      throw new Error(`Change for ${change.path} needs string content or null to delete.`);
  }

  const before = snapshot.analysis;
  const after = await patchRepositoryAnalysis(
    cloneForOverlay(before),
    changes.map((change) => ({ path: normalize(change.path), content: change.content })),
  );
  const changedPaths = changes
    .filter((change) => change.content !== null)
    .map((change) => normalize(change.path));
  const deletedPaths = changes
    .filter((change) => change.content === null)
    .map((change) => normalize(change.path));
  const requested = requestedPaths.length ? requestedPaths : changedPaths;
  const seeds = expandPaths(after, requested).filter((path) =>
    after.files.some((file) => file.path === path),
  );
  const deletedSeeds = expandPaths(before, deletedPaths).filter((path) =>
    before.files.some((file) => file.path === path),
  );

  const changedBriefing = seeds.length
    ? impactBriefing(after, snapshot.history, seeds, { maxItems: 60 })
    : null;
  const deletedBriefing = deletedSeeds.length
    ? impactBriefing(before, snapshot.history, deletedSeeds, { maxItems: 40 })
    : null;
  const previousCycles = new Set(before.cycles.map(cycleKey));
  const newCycles = after.cycles.filter((cycle) => !previousCycles.has(cycleKey(cycle)));
  const previousUnresolved = new Set(
    before.files.flatMap((file) =>
      file.imports
        .filter((ref) => ref.kind === "unresolved")
        .map((ref) => `${file.path}\u0000${ref.specifier}`),
    ),
  );
  const oldDrift = new Set(
    columnDriftFindings(before).flatMap((finding) =>
      finding.references.map(
        (ref) => `${finding.table}\u0000${finding.column}\u0000${ref.path}\u0000${ref.operation}`,
      ),
    ),
  );
  const newColumnDrift = columnDriftFindings(after).flatMap((finding) => {
    const references = finding.references.filter(
      (ref) =>
        !oldDrift.has(
          `${finding.table}\u0000${finding.column}\u0000${ref.path}\u0000${ref.operation}`,
        ),
    );
    return references.length ? [{ ...finding, references }] : [];
  });
  const newUnresolved = after.files.flatMap((file) =>
    file.imports
      .filter(
        (ref) =>
          ref.kind === "unresolved" &&
          !previousUnresolved.has(`${file.path}\u0000${ref.specifier}`),
      )
      .map((ref) => ({ path: file.path, line: ref.line, specifier: ref.specifier })),
  );
  // Compare only observed direct named/default bindings. Namespace, re-export,
  // shadowing, overloads and dynamic usage require a type-aware compiler.
  const removedExportCallers: {
    targetPath: string;
    symbolName: string;
    importerPath: string;
    importerLine: number;
  }[] = [];
  const signatureArityBreaks: {
    targetPath: string;
    symbolName: string;
    importerPath: string;
    callLine: number;
    passedArgs: number;
    expectedArity: string;
  }[] = [];
  const propertyContractBreaks: {
    targetPath: string;
    symbolName: string;
    property: string;
    importerPath: string;
    accessLine: number;
  }[] = [];
  const beforeByPath = new Map(before.files.map((file) => [file.path, file]));
  const afterByPath = new Map(after.files.map((file) => [file.path, file]));
  const changedSet = new Set(changedPaths);
  const changedTargets = new Set([...changedPaths, ...deletedPaths]);
  const missingUsageFiles = before.files
    .filter(
      (file) =>
        !changedSet.has(file.path) &&
        !deletedPaths.includes(file.path) &&
        !file.importedSymbolUsages &&
        file.imports.some((ref) => ref.target && changedTargets.has(ref.target)),
    )
    .map((file) => file.path);
  for (const targetPath of new Set([...changedPaths, ...deletedPaths])) {
    const original = beforeByPath.get(targetPath);
    const updated = afterByPath.get(targetPath);
    if (!original) continue;
    for (const importer of after.files) {
      const importerBefore = beforeByPath.get(importer.path) ?? importer;
      for (const usage of importer.importedSymbolUsages ?? []) {
        const directTarget = importerBefore.imports.find(
          (ref) => ref.specifier === usage.specifier && ref.target,
        )?.target;
        if (!directTarget) continue;
        const isNamespace = usage.importedName === "*";

        // A changed barrel can remove an export even though the declaring file
        // never changed. Compare the `export ... from` declarations directly.
        if (directTarget === targetPath) {
          const removedReExport = (original.reExports ?? []).find(
            (reExport) =>
              (reExport.exportedName === usage.importedName ||
                (isNamespace && reExport.exportedName === "*")) &&
              !(updated?.reExports ?? []).some(
                (next) =>
                  next.specifier === reExport.specifier &&
                  next.exportedName === reExport.exportedName &&
                  next.importedName === reExport.importedName,
              ),
          );
          if (removedReExport) {
            const members = isNamespace
              ? [...new Set(usage.callSites.flatMap((call) => (call.member ? [call.member] : [])))]
              : [usage.importedName];
            for (const member of members)
              removedExportCallers.push({
                targetPath,
                symbolName: member,
                importerPath: importer.path,
                importerLine: usage.importLine,
              });
            continue;
          }
        }

        const members = isNamespace
          ? [...new Set(usage.callSites.flatMap((call) => (call.member ? [call.member] : [])))]
          : [usage.importedName];
        for (const member of members) {
          // Follow `export *` and `export { a as b }` chains to the declaring file.
          const origin = resolveExportOrigin(before, directTarget, member);
          if (!origin || origin.path !== targetPath) continue;
          const symbolName = origin.name;
          if (original.exports.includes(symbolName) && !updated?.exports.includes(symbolName)) {
            removedExportCallers.push({
              targetPath,
              symbolName,
              importerPath: importer.path,
              importerLine: usage.importLine,
            });
            continue;
          }
          const oldSymbol = original.symbols?.find((symbol) => symbol.name === symbolName);
          const newSymbol = updated?.symbols?.find((symbol) => symbol.name === symbolName);
          if (!oldSymbol || !newSymbol) continue;
          if (
            oldSymbol.kind === "function" &&
            newSymbol.kind === "function" &&
            (newSymbol.requiredArity ?? 0) > (oldSymbol.requiredArity ?? 0)
          ) {
            const calls = usage.callSites.filter((call) =>
              isNamespace ? call.member === symbolName : !call.member,
            );
            for (const call of calls)
              if (!call.hasSpreadArg && call.argCount < (newSymbol.requiredArity ?? 0))
                signatureArityBreaks.push({
                  targetPath,
                  symbolName,
                  importerPath: importer.path,
                  callLine: call.line,
                  passedArgs: call.argCount,
                  expectedArity: `${newSymbol.requiredArity ?? 0}+`,
                });
          }
          if (isNamespace) continue;
          const removed = new Set(
            (oldSymbol.typeProperties ?? [])
              .map((property) => property.name)
              .filter(
                (name) =>
                  !(newSymbol.typeProperties ?? []).some((property) => property.name === name),
              ),
          );
          for (const access of usage.propertyAccesses)
            if (removed.has(access.property))
              propertyContractBreaks.push({
                targetPath,
                symbolName,
                property: access.property,
                importerPath: importer.path,
                accessLine: access.line,
              });
        }
      }
    }
  }
  const removedExports = [...new Set([...changedPaths, ...deletedPaths])].flatMap((path) => {
    const original = beforeByPath.get(path);
    const updated = afterByPath.get(path);
    return (original?.exports ?? [])
      .filter((name) => !updated?.exports.includes(name))
      .map((name) => ({ path, name }));
  });
  const changedFiles = after.files
    .filter((file) => changedPaths.includes(file.path))
    .map((file) => ({
      path: file.path,
      exports: file.exports.slice(0, 20),
      signatures: (file.symbols ?? []).slice(0, 12),
      columns: (file.columnRefs ?? []).slice(0, 30),
      resources: file.resources,
    }));

  return {
    repository: snapshot.repository_full_name,
    commit: after.ref,
    analyzed_at: snapshot.created_at,
    overlay: {
      kind: "in-memory",
      persisted: false,
      changed: changedPaths,
      deleted: deletedPaths,
    },
    before: {
      files: before.stats.analyzedFiles,
      unresolved: before.stats.unresolvedImports,
      cycles: before.cycles.length,
      column_drift: columnDriftFindings(before).length,
    },
    after: {
      files: after.stats.analyzedFiles,
      unresolved: after.stats.unresolvedImports,
      cycles: after.cycles.length,
      column_drift: columnDriftFindings(after).length,
      duration_ms: after.stats.durationMs,
    },
    changed_files: changedFiles,
    impact: changedBriefing?.impact ?? null,
    deleted_impact: deletedBriefing?.impact ?? null,
    new_cycles: newCycles,
    new_unresolved_imports: newUnresolved,
    column_drift: columnDriftFindings(after),
    new_column_drift: newColumnDrift,
    removed_exports: removedExports,
    removed_export_callers: removedExportCallers,
    signature_arity_breaks: signatureArityBreaks,
    property_contract_breaks: propertyContractBreaks,
    missing_symbol_usage_files: missingUsageFiles,
    limitations: [
      "Symbol usage checks are syntactic, not a typecheck. Lexical shadowing, barrel re-exports, namespace calls and overload arity envelopes are resolved from the AST; dynamically dispatched calls, computed members and full TypeScript assignability are not verified. Older snapshots require re-analysis.",
      ...after.limitations,
      "simulate_change is an in-memory overlay: no repository, snapshot or database row is written.",
    ],
  };
}
