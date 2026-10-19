import { impactBriefing } from "./context";
import { patchRepositoryAnalysis, type ChangedFile } from "./patch.server";
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
  const newUnresolved = after.files.flatMap((file) =>
    file.imports
      .filter(
        (ref) =>
          ref.kind === "unresolved" &&
          !previousUnresolved.has(`${file.path}\u0000${ref.specifier}`),
      )
      .map((ref) => ({ path: file.path, line: ref.line, specifier: ref.specifier })),
  );
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
    limitations: [
      ...after.limitations,
      "simulate_change is an in-memory overlay: no repository, snapshot or database row is written.",
    ],
  };
}
