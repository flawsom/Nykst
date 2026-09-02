import type { GraphNode, NodeKind } from "./graph-data";

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
};
export type ProblemTrace = {
  id: string;
  title: string;
  state: string;
  url?: string;
  likelyFiles: string[];
  evidence: string;
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
    ...(label.endsWith(".tsx") || label.endsWith(".ts") ? { language: "TypeScript" } : {}),
    expandable: kind !== "file",
  };
}

export function buildRepositoryGraph(snapshot: RepositorySnapshot): GraphNode {
  const repo = snapshot.repository?.full_name ?? "connected repository";
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
        const fileNodes = paths
          .sort()
          .map((path) =>
            node(
              `${repo}/file:${path}`,
              "file",
              path.split("/").pop() ?? path,
              `Real file from ${repo}.`,
              [],
              repo,
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
  return node(
    `org:${repo}`,
    "org",
    repo,
    `Repository-derived system map for ${repo}.`,
    domainNodes,
    repo,
  );
}

export function traceRepositoryProblems(snapshot: RepositorySnapshot): ProblemTrace[] {
  const paths = (snapshot.files ?? [])
    .map((file) => file.path)
    .filter((path): path is string => Boolean(path));
  return (snapshot.issues ?? []).slice(0, 100).map((issue, index) => {
    const title = text(issue['title']) || `Repository issue ${index + 1}`;
    const body = text(issue['body']);
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
    return {
      id: text(issue['id']) || text(issue['number']) || `issue-${index + 1}`,
      title,
      state: text(issue['state']) || "open",
      ...(text(issue['html_url']) ? { url: text(issue['html_url']) } : {}),
      likelyFiles,
      evidence: likelyFiles.length
        ? "Issue language overlaps repository paths."
        : "No direct path match; review recent commits and pull requests manually.",
    };
  });
}
