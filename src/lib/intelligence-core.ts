import type { LucideIcon } from "lucide-react";
import { BookOpen, Cpu, GitBranch, Network, ShieldAlert } from "lucide-react";
import type { RepositorySnapshot } from "./repository-graph";

export type CoreFile = {
  name: string;
  path: string;
  size: string;
  summary: string;
  content: string;
};
export type CoreModule = {
  id: string;
  title: string;
  subtitle: string;
  icon: LucideIcon;
  description: string;
  files: CoreFile[];
};

const json = (value: unknown) => JSON.stringify(value, null, 2);
const text = (value: unknown) => (typeof value === "string" ? value : "");
const size = (bytes: number) =>
  bytes > 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;

export function buildCoreModules(snapshot: RepositorySnapshot): CoreModule[] {
  const files = (snapshot.files ?? []).filter((file) => file.type === "blob" && file.path);
  const repo = snapshot.repository?.full_name ?? "connected repository";
  const topLevel = [...new Set(files.map((file) => file.path!.split("/")[0]))].slice(0, 8);
  const openIssues = (snapshot.issues ?? []).filter((issue) => text(issue["state"]) !== "closed");
  const manifests = files.filter((file) =>
    /(^|\/)(package\.json|pnpm-lock\.yaml|yarn\.lock|package-lock\.json|requirements\.txt|go\.mod|Cargo\.toml|pom\.xml)$/.test(
      file.path!,
    ),
  );
  const docs = files
    .filter((file) => /(^|\/)(README|docs?|adr|architecture|runbook)/i.test(file.path!))
    .slice(0, 8);
  const commitItems = (snapshot.commits ?? []).slice(0, 8);
  const pullItems = (snapshot.pull_requests ?? []).slice(0, 8);
  const analysis = snapshot.analysis;
  const astServices = analysis?.services ?? [];
  const astResources = analysis?.resources ?? [];
  const astCycles = analysis?.cycles ?? [];

  return [
    {
      id: "structural",
      title: "1. System Map",
      subtitle: "What exists?",
      icon: Network,
      description: `Live structure inferred from ${files.length} repository files across ${topLevel.length} top-level areas${analysis ? ` (${analysis.stats.internalEdges} AST import edges)` : ""}.`,
      files: [
        {
          name: "RepositoryTree.json",
          path: `/live/${repo}/RepositoryTree.json`,
          size: size(files.reduce((sum, file) => sum + (file.size ?? 0), 0)),
          summary: "The file tree and AST statistics used to derive domains, services, modules, and files.",
          content: json({
            repository: repo,
            domains: topLevel,
            files: files.length,
            ...(analysis ? { astStats: analysis.stats } : {}),
          }),
        },
        ...topLevel.map((area) => ({
          name: area ?? "root",
          path: `/live/${repo}/${area}`,
          size: `${files.filter((file) => file.path!.startsWith(`${area}/`)).length} files`,
          summary: "Top-level repository area mapped as a core domain.",
          content: files
            .filter((file) => file.path!.startsWith(`${area}/`))
            .slice(0, 40)
            .map((file) => file.path)
            .join("\n"),
        })),
      ],
    },
    {
      id: "dependencies",
      title: "2. Dependency & SQL Graph",
      subtitle: "What connects to what?",
      icon: Network,
      description: analysis
        ? `${analysis.stats.internalEdges} internal AST edges, ${astServices.length} external services, and ${astResources.length} SQL/data resources linked.`
        : `${manifests.length} dependency manifests detected; package and module boundaries are ready for deeper linkage analysis.`,
      files: [
        ...(analysis
          ? [
              {
                name: "AstDependencyTopology.json",
                path: `/live/${repo}/AstDependencyTopology.json`,
                size: `${Math.max(2, Math.round(analysis.stats.internalEdges / 12))} KB`,
                summary: "TypeScript AST compiler dependency edges, external services, and SQL data resources.",
                content: json({
                  repository: repo,
                  stats: analysis.stats,
                  services: astServices.map((s) => ({
                    id: s.id,
                    name: s.name,
                    category: s.category,
                    files: s.files.length,
                    envVars: s.envVars,
                  })),
                  sqlResources: astResources.map((r) => ({
                    id: r.id,
                    definedIn: r.definedIn,
                    callSites: r.uses.length,
                  })),
                }),
              },
            ]
          : []),
        ...(manifests.length
          ? manifests.map((file) => ({
              name: file.path!.split("/").pop() ?? file.path!,
              path: file.path!,
              size: size(file.size ?? 0),
              summary: "Dependency manifest discovered in the connected repository.",
              content: `Repository: ${repo}\nPath: ${file.path}\n\nDependency edges are derived from this manifest and the TypeScript AST compiler.`,
            }))
          : []),
      ],
    },
    {
      id: "changes",
      title: "3. Change Intelligence",
      subtitle: "What has changed and where?",
      icon: GitBranch,
      description: `${commitItems.length} recent commits and ${pullItems.length} pull requests are available in the latest snapshot.`,
      files: [
        {
          name: "RecentCommits.json",
          path: `/live/${repo}/RecentCommits.json`,
          size: "8 KB",
          summary: "Recent change history and commit authors.",
          content: json(
            commitItems.length
              ? commitItems.map((commit) => ({
                  sha: text(commit["sha"]).slice(0, 8),
                  message:
                    text(commit["message"]) ||
                    text((commit["commit"] as Record<string, unknown> | undefined)?.["message"]),
                  author: text(commit["author"]),
                }))
              : {
                  repository: repo,
                  note: "Connect GitHub to hydrate full commit blame history alongside live AST analysis.",
                  analyzedAt: analysis?.generatedAt ?? new Date().toISOString(),
                },
          ),
        },
        {
          name: "PullRequests.json",
          path: `/live/${repo}/PullRequests.json`,
          size: "8 KB",
          summary: "Pull requests and collaboration signals.",
          content: json(
            pullItems.map((pr) => ({
              number: pr["number"],
              title: pr["title"],
              state: pr["state"],
              author: text(pr["user"]),
            })),
          ),
        },
      ],
    },
    {
      id: "risk",
      title: "4. Risk & Blast-Radius",
      subtitle: "Where should you be careful?",
      icon: ShieldAlert,
      description: `${openIssues.length} open issue signals and ${astCycles.length} circular import loops inspected for file-level risk tracing.`,
      files: [
        {
          name: "ArchitecturalRiskProfile.json",
          path: `/live/${repo}/ArchitecturalRiskProfile.json`,
          size: "6 KB",
          summary: "Circular runtime dependencies, unresolved imports, and high-fan-in AST hubs.",
          content: json({
            repository: repo,
            circularRuntimeCycles: astCycles,
            unresolvedImports: analysis?.stats.unresolvedImports ?? 0,
            openIssuesCount: openIssues.length,
            highFanInHubs: (analysis?.files ?? [])
              .map((f) => ({
                path: f.path,
                role: f.role,
                loc: f.loc,
                services: f.services,
                resources: f.resources.length,
              }))
              .sort((a, b) => b.loc - a.loc)
              .slice(0, 12),
          }),
        },
        {
          name: "OpenProblems.json",
          path: `/live/${repo}/OpenProblems.json`,
          size: "6 KB",
          summary: "Open GitHub issues that may represent operational or architectural risk.",
          content: json(
            openIssues.slice(0, 30).map((issue) => ({
              number: issue["number"],
              title: issue["title"],
              labels: issue["labels"],
              url: issue["html_url"],
            })),
          ),
        },
      ],
    },
    {
      id: "memory",
      title: "5. System Memory",
      subtitle: "Why is the system this way?",
      icon: BookOpen,
      description: `${docs.length} documentation and architecture artifacts provide context for the connected system.`,
      files: docs.length
        ? docs.map((file) => ({
            name: file.path!.split("/").pop() ?? file.path!,
            path: file.path!,
            size: size(file.size ?? 0),
            summary: "Repository documentation retained as system memory.",
            content: `Indexed from ${repo}\n\n${file.path}`,
          }))
        : [
            {
              name: "RepositoryContext.md",
              path: `/live/${repo}/RepositoryContext.md`,
              size: "2 KB",
              summary: "System context generated from repository metadata and change history.",
              content: `# ${repo}\n\nDefault branch: ${snapshot.repository?.default_branch ?? "main"}\n\n${snapshot.repository?.description ?? "Deterministic AST + Graph-RAG system intelligence."}`,
            },
          ],
    },
  ];
}

export function buildGroundedAiBrief(snapshot: RepositorySnapshot, query: string, file: CoreFile) {
  const files = snapshot.files?.length ?? 0;
  const issues = snapshot.issues?.length ?? 0;
  const prs = snapshot.pull_requests?.length ?? 0;
  const commits = snapshot.commits?.length ?? 0;
  return `[Nykst AI Architect: grounded repository analysis]\n\nQuestion: ${query}\nArtifact: ${file.name}\nRepository: ${snapshot.repository?.full_name ?? "connected repository"}\n\nSystem evidence\n• ${files} files indexed into the system map\n• ${commits} commits and ${prs} pull requests available for change context\n• ${issues} issues available for problem and risk tracing\n\nInterpretation\n${file.summary} The safest next step is to inspect this artifact’s path in the graph, compare its recent changes, and review related open problems before modifying it. This answer is grounded in the latest repository snapshot of the connected repository.`;
}

export { Cpu };
