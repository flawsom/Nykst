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
      description: `Live structure read from ${files.length} repository files across ${topLevel.length} top-level areas${analysis ? `, with ${analysis.stats.internalEdges} connections between them` : ""}.`,
      files: [
        {
          name: "RepositoryTree.json",
          path: `/live/${repo}/RepositoryTree.json`,
          size: size(files.reduce((sum, file) => sum + (file.size ?? 0), 0)),
          summary:
            "The file tree and connection counts used to group your system into areas, services, modules, and files.",
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
      title: "2. Connections and data",
      subtitle: "What connects to what?",
      icon: Network,
      description: analysis
        ? `${analysis.stats.internalEdges} connections between files, ${astServices.length} external services, and ${astResources.length} database tables and data sources linked.`
        : `${manifests.length} dependency manifests detected; package and module boundaries are ready for deeper linkage analysis.`,
      files: [
        ...(analysis
          ? [
              {
                name: "Connections.json",
                path: `/live/${repo}/Connections.json`,
                size: `${Math.max(2, Math.round(analysis.stats.internalEdges / 12))} KB`,
                summary:
                  "Connections between files, external services, and the database tables your code uses.",
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
              summary: "Dependency manifest found in the connected repository.",
              content: `Repository: ${repo}\nPath: ${file.path}\n\nConnections in this manifest are read directly from your code.`,
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
                  note: "Connect a repository to see its commit history here.",
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
      title: "4. Risk",
      subtitle: "Where should you be careful?",
      icon: ShieldAlert,
      description: `${openIssues.length} open issue signals and ${astCycles.length} circular import loops inspected for file-level risk tracing.`,
      files: [
        {
          name: "ArchitecturalRiskProfile.json",
          path: `/live/${repo}/ArchitecturalRiskProfile.json`,
          size: "6 KB",
          summary:
            "Circular dependencies, unresolved imports, and files that many other files rely on.",
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
              content: `# ${repo}\n\nDefault branch: ${snapshot.repository?.default_branch ?? "main"}\n\n${snapshot.repository?.description ?? "System intelligence for your codebase."}`,
            },
          ],
    },
  ];
}

/**
 * Evidence envelope for Memory Q&A.
 *
 * The model is given real file paths, resolved imports, importers, exported
 * symbols with line numbers, SQL/column usage and commit history from the
 * snapshot. Nothing here is templated prose about "the connected repository":
 * if the snapshot does not contain a fact, the brief says so instead.
 */
export const GROUNDED_BRIEF_MAX_CHARS = 7_000;

function queryTokens(query: string) {
  return [
    ...new Set(
      query
        .toLowerCase()
        .split(/[^a-z0-9_./@]+/)
        .filter((token) => token.length > 2),
    ),
  ];
}

/** Crude but symmetric stemming so "coding" and "code" compare equal. */
function stem(token: string) {
  return token.replace(/(ing|ed|es|s)$/, "").replace(/e$/, "");
}

function relevance(tokens: string[], path: string, symbols: string[]) {
  const lowerPath = path.toLowerCase();
  const lowerSymbols = symbols.join(" ").toLowerCase();
  let score = 0;
  for (const token of tokens) {
    const needle = stem(token);
    if (needle.length < 3) continue;
    if (lowerPath.includes(needle)) score += 3;
    else if (lowerSymbols.includes(needle)) score += 2;
  }
  return score;
}

export function buildGroundedAiBrief(snapshot: RepositorySnapshot, query: string, file: CoreFile) {
  const repo = snapshot.repository?.full_name ?? "connected repository";
  const branch = snapshot.repository?.default_branch ?? "main";
  const analysis = snapshot.analysis;
  const history = snapshot.history;
  const analyzed = analysis?.files ?? [];
  const lines: string[] = [];
  const push = (line: string) => {
    if (lines.join("\n").length + line.length > GROUNDED_BRIEF_MAX_CHARS) return;
    lines.push(line);
  };

  push(`[Nykst grounded repository evidence]`);
  push(`Repository: ${repo} (default branch ${branch})`);
  if (analysis) {
    push(
      `Analysis: ${analysis.method} at ${analysis.generatedAt}; ${analysis.stats.analyzedFiles} analyzed source files, ${analysis.stats.loc} LOC, ${analysis.stats.internalEdges} internal import edges, ${analysis.stats.unresolvedImports} unresolved imports, ${analysis.stats.skippedFiles} skipped`,
    );
  } else {
    push(
      `Detail: this repository has only a file list stored, so file-level detail is not available (${snapshot.files?.length ?? 0} files listed).`,
    );
  }
  push(`Question: ${query}`);
  push("");

  const focus = analyzed.find((entry) => entry.path === file.path);
  push(`Focus artifact: ${file.path}`);
  if (focus) {
    push(
      `  ${focus.language}, ${focus.loc} LOC, role ${focus.role}${focus.packageDir ? `, package ${focus.packageDir}` : ""}`,
    );
    if (focus.exports.length) push(`  Exports: ${focus.exports.join(", ")}`);
    if (focus.symbols?.length)
      push(
        `  Symbols: ${focus.symbols
          .slice(0, 14)
          .map((symbol) => `${symbol.name} (${symbol.kind}, line ${symbol.line})`)
          .join("; ")}`,
      );
    const internalImports = focus.imports.filter((item) => item.target);
    if (internalImports.length)
      push(
        `  Imports: ${internalImports
          .slice(0, 14)
          .map((item) => `${item.specifier} -> ${item.target} (line ${item.line})`)
          .join("; ")}`,
      );
    const externalImports = focus.imports.filter((item) => !item.target);
    if (externalImports.length)
      push(
        `  External packages: ${[...new Set(externalImports.map((item) => item.specifier))].slice(0, 12).join(", ")}`,
      );
    if (focus.resources.length)
      push(`  SQL/resources: ${[...new Set(focus.resources.map((item) => item.id))].join(", ")}`);
    if (focus.columnRefs?.length)
      push(
        `  Columns: ${[...new Set(focus.columnRefs.map((item) => `${item.table}.${item.column}`))].join(", ")}`,
      );
    if (focus.endpoints?.length)
      push(`  Endpoints: ${[...new Set(focus.endpoints.map((item) => item.path))].join(", ")}`);
    const importers = analyzed.filter((entry) =>
      entry.imports.some((item) => item.target === focus.path),
    );
    push(
      importers.length
        ? `  Importers (${importers.length}): ${importers
            .slice(0, 12)
            .map((entry) => entry.path)
            .join(", ")}`
        : "  Importers: none in this snapshot",
    );
  } else {
    push(`  ${file.summary}`);
    push(
      "  This artifact is not a single analyzed source file, so per-symbol evidence is not applicable.",
    );
  }

  const tokens = queryTokens(`${query} ${file.path}`);
  const related = analyzed
    .filter((entry) => entry.path !== file.path)
    .map((entry) => ({ entry, score: relevance(tokens, entry.path, entry.exports) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.entry.path.localeCompare(b.entry.path))
    .slice(0, 10);
  if (related.length) {
    push("");
    push("Files that match the question (real paths from the analysis):");
    for (const { entry } of related) {
      const imports = entry.imports
        .map((item) => item.target ?? item.specifier)
        .filter(Boolean)
        .slice(0, 8);
      push(
        `- ${entry.path} (${entry.loc} LOC${entry.exports.length ? `; exports ${entry.exports.slice(0, 6).join(", ")}` : ""}${imports.length ? `; imports ${imports.join(", ")}` : ""})`,
      );
    }
  }

  if (analysis?.services.length) {
    push("");
    push(
      `External services: ${analysis.services
        .slice(0, 8)
        .map((service) => `${service.id} (${service.files.length} file(s))`)
        .join(", ")}`,
    );
  }
  if (analysis?.cycles.length) {
    push(
      `Import cycles: ${analysis.cycles
        .slice(0, 3)
        .map((cycle) => cycle.slice(0, 4).join(" -> "))
        .join(" | ")}`,
    );
  }

  const commits = history?.commits ?? [];
  const touching = commits.filter((commit) => commit.files.includes(file.path)).slice(0, 4);
  const recent = (touching.length ? touching : commits.slice(0, 4)) || [];
  if (recent.length) {
    push("");
    push(touching.length ? "Commits touching this file:" : "Most recent commits in the snapshot:");
    for (const commit of recent)
      push(
        `- ${commit.sha.slice(0, 7)} ${commit.date.slice(0, 10)} ${commit.author}: ${commit.message.split("\n")[0]}`,
      );
  }
  const pulls = (history?.pullRequests ?? []).slice(0, 4);
  if (pulls.length) {
    push("");
    push("Recent pull requests:");
    for (const pull of pulls) push(`- #${pull.number} [${pull.state}] ${pull.title}`);
  }
  if (!commits.length && !pulls.length)
    push("\nCommit and pull-request history: not available for this example repository.");

  const openIssues = (snapshot.issues ?? []).filter(
    (issue) => text(issue["state"]).toLowerCase() !== "closed" && text(issue["title"]),
  );
  if (openIssues.length) {
    push("");
    push("Open issues:");
    for (const issue of openIssues.slice(0, 5)) push(`- ${text(issue["title"])}`);
  }

  if (analysis?.limitations.length) {
    push("");
    push(`Known analysis limitations: ${analysis.limitations.join(" ")}`);
  }

  push("");
  push(
    "Answer only from the evidence above. Cite exact paths and line numbers. If a fact is missing, say what is missing instead of guessing.",
  );
  return lines.join("\n");
}

export { Cpu };
