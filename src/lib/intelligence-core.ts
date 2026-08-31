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
  const openIssues = (snapshot.issues ?? []).filter((issue) => text(issue.state) !== "closed");
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

  return [
    {
      id: "structural",
      title: "1. System Map",
      subtitle: "What exists?",
      icon: Network,
      description: `Live structure inferred from ${files.length} repository files across ${topLevel.length} top-level areas.`,
      files: [
        {
          name: "RepositoryTree.json",
          path: `/live/${repo}/RepositoryTree.json`,
          size: size(files.reduce((sum, file) => sum + (file.size ?? 0), 0)),
          summary: "The file tree used to derive domains, services, modules, and files.",
          content: json({ repository: repo, domains: topLevel, files: files.length }),
        },
        ...topLevel.map((area) => ({
          name: area,
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
      title: "2. Dependency Intelligence",
      subtitle: "What connects to what?",
      icon: Network,
      description: `${manifests.length} dependency manifests detected; package and module boundaries are ready for deeper linkage analysis.`,
      files: manifests.length
        ? manifests.map((file) => ({
            name: file.path!.split("/").pop()!,
            path: file.path!,
            size: size(file.size ?? 0),
            summary: "Dependency manifest discovered in the connected repository.",
            content: `Repository: ${repo}\nPath: ${file.path}\n\nDependency edges are derived from this manifest and the repository tree.`,
          }))
        : [
            {
              name: "DependencySurface.json",
              path: `/live/${repo}/DependencySurface.json`,
              size: "1 KB",
              summary:
                "No conventional manifest found; inferred module boundaries are still available.",
              content: json({ repository: repo, manifests: 0, modules: topLevel.length }),
            },
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
            commitItems.map((commit) => ({
              sha: text(commit.sha).slice(0, 8),
              message:
                text(commit.message) ||
                text((commit.commit as Record<string, unknown> | undefined)?.message),
              author: text(commit.author),
            })),
          ),
        },
        {
          name: "PullRequests.json",
          path: `/live/${repo}/PullRequests.json`,
          size: "8 KB",
          summary: "Pull requests and collaboration signals.",
          content: json(
            pullItems.map((pr) => ({
              number: pr.number,
              title: pr.title,
              state: pr.state,
              author: text(pr.user),
            })),
          ),
        },
      ],
    },
    {
      id: "risk",
      title: "4. Risk Intelligence",
      subtitle: "Where should you be careful?",
      icon: ShieldAlert,
      description: `${openIssues.length} open issue signals are available for impact review and file-level tracing.`,
      files: [
        {
          name: "OpenProblems.json",
          path: `/live/${repo}/OpenProblems.json`,
          size: "6 KB",
          summary: "Open GitHub issues that may represent operational or architectural risk.",
          content: json(
            openIssues.slice(0, 30).map((issue) => ({
              number: issue.number,
              title: issue.title,
              labels: issue.labels,
              url: issue.html_url,
            })),
          ),
        },
        {
          name: "RiskSignals.json",
          path: `/live/${repo}/RiskSignals.json`,
          size: "3 KB",
          summary: "Risk indicators derived from issue, change, and repository activity.",
          content: json({
            openIssues: openIssues.length,
            pullRequests: snapshot.pull_requests?.length ?? 0,
            contributors: snapshot.contributors?.length ?? 0,
          }),
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
            name: file.path!.split("/").pop()!,
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
              content: `# ${repo}\n\nDefault branch: ${snapshot.repository?.default_branch ?? "unknown"}\n\n${snapshot.repository?.description ?? "No repository description was provided."}`,
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
  return `[Nykst AI Architect — grounded repository analysis]\n\nQuestion: ${query}\nArtifact: ${file.name}\nRepository: ${snapshot.repository?.full_name ?? "connected repository"}\n\nSystem evidence\n• ${files} files indexed into the system map\n• ${commits} commits and ${prs} pull requests available for change context\n• ${issues} issues available for problem and risk tracing\n\nInterpretation\n${file.summary} The safest next step is to inspect this artifact’s path in the graph, compare its recent changes, and review related open problems before modifying it. This answer is grounded in the latest repository snapshot, not the demo organization.`;
}

export { Cpu };
