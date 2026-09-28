import type {
  AnalyzedFile,
  DataResource,
  ExternalService,
  RepoAnalysis,
  RepoHistory,
} from "./types";

export interface Edge {
  path: string;
  line: number;
  typeOnly: boolean;
}

export interface AnalysisIndex {
  analysis: RepoAnalysis;
  files: Map<string, AnalyzedFile>;
  /** file -> files it imports */
  dependencies: Map<string, Edge[]>;
  /** file -> files that import it (with the importing line) */
  dependents: Map<string, Edge[]>;
  resources: Map<string, DataResource>;
  services: Map<string, ExternalService>;
}

const indexCache = new WeakMap<RepoAnalysis, AnalysisIndex>();

export function indexAnalysis(analysis: RepoAnalysis): AnalysisIndex {
  const cached = indexCache.get(analysis);
  if (cached) return cached;
  const files = new Map(analysis.files.map((file) => [file.path, file]));
  const dependencies = new Map<string, Edge[]>();
  const dependents = new Map<string, Edge[]>();
  for (const file of analysis.files) {
    const out: Edge[] = [];
    for (const ref of file.imports) {
      if (ref.kind !== "internal" || !ref.target) continue;
      out.push({ path: ref.target, line: ref.line, typeOnly: ref.typeOnly });
      const incoming = dependents.get(ref.target) ?? [];
      incoming.push({ path: file.path, line: ref.line, typeOnly: ref.typeOnly });
      dependents.set(ref.target, incoming);
    }
    dependencies.set(file.path, out);
  }
  const index: AnalysisIndex = {
    analysis,
    files,
    dependencies,
    dependents,
    resources: new Map(analysis.resources.map((resource) => [resource.id, resource])),
    services: new Map(analysis.services.map((service) => [service.id, service])),
  };
  indexCache.set(analysis, index);
  return index;
}

export interface ImpactedFile {
  path: string;
  depth: number;
  /** the file through which this one is reached (closer to the change) */
  via: string;
  line: number;
  /** true when every path to this file goes through a type-only import */
  typeOnly: boolean;
  role: AnalyzedFile["role"] | "unknown";
}

export type ImpactLevel = "Low" | "Moderate" | "High" | "Critical";

export interface ImpactReport {
  seeds: string[];
  impacted: ImpactedFile[];
  direct: ImpactedFile[];
  entrypoints: ImpactedFile[];
  tests: ImpactedFile[];
  /** top-level areas (first two path segments) touched, with counts */
  areas: { area: string; files: number }[];
  level: ImpactLevel;
  runtimeCount: number;
}

export function areaOf(path: string) {
  const parts = path.split("/");
  return parts.length > 2 ? parts.slice(0, 2).join("/") : (parts[0] ?? path);
}

export function levelFor(
  runtimeCount: number,
  entrypoints: number,
  totalFiles: number,
): ImpactLevel {
  const share = totalFiles ? runtimeCount / totalFiles : 0;
  if (runtimeCount >= 50 || share >= 0.25) return "Critical";
  if (runtimeCount >= 15 || share >= 0.1 || entrypoints >= 8) return "High";
  if (runtimeCount >= 4 || entrypoints >= 2) return "Moderate";
  return "Low";
}

/**
 * Everything that can break when the seed files change: reverse import reachability,
 * breadth-first so each file carries its shortest chain back to the change.
 */
export function impactOf(index: AnalysisIndex, seeds: string[], maxDepth = 12): ImpactReport {
  const seedSet = new Set(seeds);
  const reached = new Map<string, ImpactedFile>();
  let frontier = seeds.map((path) => ({ path, typeOnly: false }));
  for (let depth = 1; depth <= maxDepth && frontier.length; depth += 1) {
    const next: { path: string; typeOnly: boolean }[] = [];
    for (const current of frontier) {
      for (const edge of index.dependents.get(current.path) ?? []) {
        if (seedSet.has(edge.path)) continue;
        const typeOnly = current.typeOnly || edge.typeOnly;
        const existing = reached.get(edge.path);
        if (existing) {
          // A runtime path beats a type-only one found at the same or later depth.
          if (existing.typeOnly && !typeOnly) {
            existing.typeOnly = false;
            next.push({ path: edge.path, typeOnly: false });
          }
          continue;
        }
        reached.set(edge.path, {
          path: edge.path,
          depth,
          via: current.path,
          line: edge.line,
          typeOnly,
          role: index.files.get(edge.path)?.role ?? "unknown",
        });
        next.push({ path: edge.path, typeOnly });
      }
    }
    frontier = next;
  }
  const impacted = [...reached.values()].sort(
    (a, b) => a.depth - b.depth || a.path.localeCompare(b.path),
  );
  const runtime = impacted.filter((item) => !item.typeOnly);
  const entrypoints = runtime.filter((item) => item.role === "route" || item.role === "api");
  const areaCounts = new Map<string, number>();
  for (const item of impacted)
    areaCounts.set(areaOf(item.path), (areaCounts.get(areaOf(item.path)) ?? 0) + 1);
  return {
    seeds,
    impacted,
    direct: impacted.filter((item) => item.depth === 1),
    entrypoints,
    tests: impacted.filter((item) => item.role === "test"),
    areas: [...areaCounts.entries()]
      .map(([area, files]) => ({ area, files }))
      .sort((a, b) => b.files - a.files),
    level: levelFor(
      runtime.filter((item) => item.role !== "test").length,
      entrypoints.length,
      index.analysis.files.length,
    ),
    runtimeCount: runtime.length,
  };
}

/** The import chain from an impacted file back to the changed file. */
export function chainFor(report: ImpactReport, path: string) {
  const byPath = new Map(report.impacted.map((item) => [item.path, item]));
  const chain = [path];
  let cursor = byPath.get(path);
  while (cursor && chain.length < 20) {
    chain.push(cursor.via);
    cursor = byPath.get(cursor.via);
  }
  return chain;
}

/** Files that make up a resource or service, used as impact seeds. */
export function seedsForResource(index: AnalysisIndex, id: string) {
  const resource = index.resources.get(id);
  return resource ? [...new Set(resource.uses.map((use) => use.path))] : [];
}

export function seedsForService(index: AnalysisIndex, id: string) {
  return (index.services.get(id)?.files ?? []).filter((path) => index.files.has(path));
}

/* ------------------------------- history -------------------------------- */

export interface FileHistory {
  commits: RepoHistory["commits"];
  pullRequests: RepoHistory["pullRequests"];
  closedIssues: number[];
  coChange: { path: string; count: number }[];
  authors: { name: string; commits: number }[];
}

export function historyFor(history: RepoHistory | undefined, paths: string[]): FileHistory {
  const empty: FileHistory = {
    commits: [],
    pullRequests: [],
    closedIssues: [],
    coChange: [],
    authors: [],
  };
  if (!history || !paths.length) return empty;
  const targets = new Set(paths);
  const touches = (files: string[]) => files.some((file) => targets.has(file));
  const commits = history.commits.filter((commit) => touches(commit.files));
  const pullRequests = history.pullRequests.filter((pull) => touches(pull.files));
  const coChange = new Map<string, number>();
  for (const change of [...commits.map((c) => c.files), ...pullRequests.map((p) => p.files)])
    for (const file of change)
      if (!targets.has(file)) coChange.set(file, (coChange.get(file) ?? 0) + 1);
  const authors = new Map<string, number>();
  for (const commit of commits) authors.set(commit.author, (authors.get(commit.author) ?? 0) + 1);
  return {
    commits,
    pullRequests,
    closedIssues: [...new Set(pullRequests.flatMap((pull) => pull.closes))],
    coChange: [...coChange.entries()]
      .map(([path, count]) => ({ path, count }))
      .filter((item) => item.count >= 2)
      .sort((a, b) => b.count - a.count)
      .slice(0, 20),
    authors: [...authors.entries()]
      .map(([name, count]) => ({ name, commits: count }))
      .sort((a, b) => b.commits - a.commits),
  };
}
