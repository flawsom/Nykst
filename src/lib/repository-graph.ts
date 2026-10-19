import type { FileDetail, GraphNode, NodeKind } from "./graph-data";
import { buildAnalysisGraph } from "./analysis/graph";
import type { RepoAnalysis, RepoHistory } from "./analysis/types";

type RepoFile = { path?: string; type?: string; size?: number };
type RepoRecord = Record<string, unknown>;
export type RepositorySnapshot = {
  repository?: {
    full_name?: string;
    default_branch?: string;
    description?: string | null;
    html_url?: string;
  };
  files?: RepoFile[];
  commits?: RepoRecord[];
  branches?: RepoRecord[];
  pull_requests?: RepoRecord[];
  issues?: RepoRecord[];
  contributors?: RepoRecord[];
  dependency_graph?: {
    generated_at?: string;
    method?: string;
    scanned_files?: number;
    edges?: Array<{ from?: string; to?: string; kind?: "internal" | "external" }>;
  };
  validation_profile?: {
    generated_at?: string;
    package_manager?: "npm" | "pnpm" | "yarn" | "bun" | null;
    install_command?: string | null;
    commands?: string[];
    source?: string;
    can_execute?: boolean;
    key_libraries?: string[];
  };
  /** TypeScript-compiler analysis; absent on snapshots ingested before the engine existed */
  analysis?: RepoAnalysis;
  history?: RepoHistory;
};
export type ProblemTrace = {
  id: string;
  title: string;
  state: string;
  url?: string;
  likelyFiles: string[];
  evidence: string;
  area: string;
  severity: string;
  owner: string;
};

function text(value: unknown) {
  return typeof value === "string" ? value : "";
}
function slug(value: string) {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "root"
  );
}
function node(
  id: string,
  kind: NodeKind,
  label: string,
  summary: string,
  children: GraphNode[] = [],
  repo?: string,
  detail?: FileDetail,
): GraphNode {
  return {
    id,
    kind,
    label,
    summary,
    children,
    owners: [],
    dependencies: [],
    dependents: [],
    blast: {
      level: children.length > 20 ? "High" : children.length > 5 ? "Moderate" : "Low",
      services: children.length,
      modules: children.length,
      files: kind === "file" ? 1 : children.length,
      teams: 0,
    },
    ...(repo ? { repo } : {}),
    ...(detail ? { detail } : {}),
    ...(label.endsWith(".tsx") || label.endsWith(".ts") ? { language: "TypeScript" } : {}),
    expandable: kind !== "file",
  };
}

function descendants(node: GraphNode): GraphNode[] {
  return [node, ...(node.children ?? []).flatMap(descendants)];
}

function enrichRepositoryGraph(root: GraphNode, snapshot: RepositorySnapshot) {
  const fileNodes = descendants(root).filter((candidate) => candidate.kind === "file");
  const byPath = new Map(fileNodes.map((candidate) => [candidate.detail?.path ?? "", candidate]));
  const dependencyEdges = snapshot.dependency_graph?.edges ?? [];
  const upstream = new Map<string, Set<string>>();
  const downstream = new Map<string, Set<string>>();
  for (const edge of dependencyEdges) {
    if (!edge.from || !edge.to) continue;
    if (!byPath.has(edge.from)) continue;
    const target = byPath.has(edge.to) ? edge.to : edge.to;
    const deps = upstream.get(edge.from) ?? new Set<string>();
    deps.add(target);
    upstream.set(edge.from, deps);
    if (byPath.has(edge.to)) {
      const dependents = downstream.get(edge.to) ?? new Set<string>();
      dependents.add(edge.from);
      downstream.set(edge.to, dependents);
    }
  }
  for (const candidate of fileNodes) {
    const path = candidate.detail?.path ?? "";
    candidate.dependencies = [...(upstream.get(path) ?? [])];
    candidate.dependents = [...(downstream.get(path) ?? [])];
  }
  for (const candidate of descendants(root).filter((item) => item.kind !== "file")) {
    const leaves = descendants(candidate).filter((item) => item.kind === "file");
    const dependencyPaths = new Set(leaves.flatMap((leaf) => leaf.dependencies));
    const dependentPaths = new Set(leaves.flatMap((leaf) => leaf.dependents));
    candidate.dependencies = [...dependencyPaths];
    candidate.dependents = [...dependentPaths];
    const reachable = new Set<string>();
    const visit = (path: string) => {
      if (reachable.has(path)) return;
      reachable.add(path);
      for (const next of downstream.get(path) ?? []) visit(next);
    };
    for (const leaf of leaves) visit(leaf.detail?.path ?? "");
    const descendantFiles = leaves.length;
    const descendantModules = new Set(
      leaves.map((leaf) => leaf.detail?.path?.split("/").slice(0, -1).join("/") ?? ""),
    );
    const downstreamFiles = [...reachable].filter(
      (path) => !leaves.some((leaf) => leaf.detail?.path === path),
    );
    const downstreamServices = new Set(
      downstreamFiles.map((path) => path.split("/").slice(0, 2).join("/")),
    );
    candidate.blast = {
      services: downstreamServices.size,
      modules: descendantModules.size,
      files: descendantFiles + downstreamFiles.length,
      teams: 0,
      level:
        downstreamFiles.length > 50
          ? "Critical"
          : downstreamFiles.length > 20
            ? "High"
            : downstreamFiles.length > 5
              ? "Moderate"
              : "Low",
    };
  }
  return root;
}

export function buildRepositoryGraph(snapshot: RepositorySnapshot): GraphNode {
  const repo = snapshot.repository?.full_name ?? "connected repository";
  if (snapshot.analysis?.files)
    return buildAnalysisGraph(repo, snapshot.analysis, snapshot.history);
  // Legacy snapshots: folder-derived tree until the repository is re-ingested.
  const files = (snapshot.files ?? []).filter((file) => file.type === "blob" && file.path);
  const domains = new Map<string, Map<string, Map<string, string[]>>>();
  for (const file of files) {
    const parts = file.path!.split("/");
    const domain = parts[0] ?? "root";
    const service = parts[1] ?? "shared";
    const module = parts.length > 3 ? parts.slice(2, -1).join("/") : "root";
    const byService = domains.get(domain) ?? new Map<string, Map<string, string[]>>();
    const byModule = byService.get(service) ?? new Map<string, string[]>();
    const paths = byModule.get(module) ?? [];
    paths.push(file.path!);
    byModule.set(module, paths);
    byService.set(service, byModule);
    domains.set(domain, byService);
  }
  const domainNodes = [...domains.entries()].map(([domainName, services]) => {
    const serviceNodes = [...services.entries()].map(([serviceName, modules]) => {
      const moduleNodes = [...modules.entries()].map(([moduleName, paths]) => {
        const fileNodes = paths.sort().map((path) =>
          node(
            `${repo}/file:${path}`,
            "file",
            path.split("/").pop() ?? path,
            `Real file from ${repo}.`,
            [],
            repo,
            {
              path,
              language: path.split(".").pop()?.toUpperCase() || "Unknown",
              loc: 0,
              classes: [],
              functions: [],
              tests: [],
              history: [],
            },
          ),
        );
        return node(
          `${repo}/module:${domainName}/${serviceName}/${moduleName}`,
          "module",
          moduleName,
          `${fileNodes.length} files in this module.`,
          fileNodes,
          repo,
        );
      });
      return node(
        `${repo}/service:${domainName}/${serviceName}`,
        "service",
        serviceName,
        `${moduleNodes.length} modules derived from the repository tree.`,
        moduleNodes,
        repo,
      );
    });
    return node(
      `${repo}/domain:${domainName}`,
      "domain",
      domainName,
      `${serviceNodes.length} services derived from repository paths.`,
      serviceNodes,
      repo,
    );
  });
  return enrichRepositoryGraph(
    node(
      `org:${repo}`,
      "org",
      repo,
      `Repository-derived system map for ${repo}.`,
      domainNodes,
      repo,
    ),
    snapshot,
  );
}

export function traceRepositoryProblems(snapshot: RepositorySnapshot): ProblemTrace[] {
  const paths = (snapshot.files ?? [])
    .map((file) => file.path)
    .filter((path): path is string => Boolean(path));
  return (snapshot.issues ?? []).slice(0, 100).map((issue, index) => {
    const title = text(issue["title"]) || `Repository issue ${index + 1}`;
    const body = text(issue["body"]);
    const tokens = `${title} ${body}`
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((token) => token.length >= 4);
    const likelyFiles = paths
      .filter((path) => {
        const lower = path.toLowerCase();
        return tokens.some((token) => lower.includes(token));
      })
      .slice(0, 8);
    const rawLabels = issue["labels"];
    const labels = Array.isArray(rawLabels)
      ? rawLabels
          .map((label) =>
            typeof label === "object" && label !== null ? text(label.name) : text(label),
          )
          .filter(Boolean)
      : [];
    const labelText = labels.join(" ").toLowerCase();
    const severity = /critical|blocker|urgent/.test(labelText)
      ? "Critical"
      : /high|security|bug/.test(labelText)
        ? "High"
        : /low|documentation|chore/.test(labelText)
          ? "Low"
          : "Medium";
    const area = labels[0] || (issue["pull_request"] ? "Change" : "Repository issue");
    const rawUser = issue["user"];
    const user =
      typeof rawUser === "object" && rawUser !== null && "login" in rawUser
        ? text(rawUser.login)
        : "";
    return {
      id: text(issue["id"]) || text(issue["number"]) || `issue-${index + 1}`,
      title,
      state: text(issue["state"]) || "open",
      ...(text(issue["html_url"]) ? { url: text(issue["html_url"]) } : {}),
      likelyFiles,
      evidence: likelyFiles.length
        ? `Issue language overlaps ${likelyFiles.length} repository path${likelyFiles.length === 1 ? "" : "s"}.`
        : "No direct path match; review recent commits and pull requests manually.",
      area,
      severity,
      owner: user || "Unassigned",
    };
  });
}
