import { impactBriefing } from "./context";
import { historyFor, indexAnalysis } from "./impact";
import type { RepoAnalysis, RepoHistory } from "./types";

/** Read-only tools over a repository analysis, shared by the MCP endpoint. */

const repositoryArg = {
  repository: {
    type: "string",
    description:
      "owner/name of an analyzed repository. Defaults to the most recently analyzed one.",
  },
};

export const TOOLS = [
  {
    name: "list_repositories",
    title: "List analyzed repositories",
    description:
      "Repositories this user has analyzed in Nykst, with the time of the latest analysis.",
    inputSchema: { type: "object", properties: {} },
    annotations: { readOnlyHint: true },
  },
  {
    name: "get_architecture",
    title: "Get architecture overview",
    description:
      "Overview of a repository's structure from its import graph: top-level areas, external services (with evidence), database tables/functions/models, most depended-on files, circular imports and known blind spots. Call this first when you need orientation in an unfamiliar codebase.",
    inputSchema: { type: "object", properties: { ...repositoryArg } },
    annotations: { readOnlyHint: true },
  },
  {
    name: "get_impact",
    title: "What breaks if I change this?",
    description:
      "Before editing, pass the file paths (or a directory) you plan to change. Returns every file that imports them directly or transitively with the exact import lines, affected page/API entry points with their import chains, tests that cover them, files that historically change together with them, and recent commits/PRs.",
    inputSchema: {
      type: "object",
      properties: {
        paths: {
          type: "array",
          items: { type: "string" },
          description:
            'Repository-relative file paths or directory prefixes, e.g. ["src/lib/auth.ts"] or ["src/lib/billing/"].',
        },
        ...repositoryArg,
      },
      required: ["paths"],
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: "find_usages",
    title: "Find usages of a table, service or env var",
    description:
      "Every file and line that touches a database table/RPC/model, an external service (e.g. supabase, stripe, github) or an environment variable, plus the combined impact of changing it.",
    inputSchema: {
      type: "object",
      properties: {
        table: {
          type: "string",
          description: 'Table, RPC function or ORM model name, e.g. "users".',
        },
        service: {
          type: "string",
          description: 'Service id or name, e.g. "supabase" or "Stripe".',
        },
        env: {
          type: "string",
          description: 'Environment variable name, e.g. "STRIPE_SECRET_KEY".',
        },
        ...repositoryArg,
      },
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: "search_files",
    title: "Search files and exports",
    description: "Find analyzed files whose path or exported symbol names contain the query.",
    inputSchema: {
      type: "object",
      properties: { query: { type: "string" }, ...repositoryArg },
      required: ["query"],
    },
    annotations: { readOnlyHint: true },
  },
];

export type AnalysisSnapshot = {
  repository_full_name: string;
  created_at: string;
  analysis: RepoAnalysis;
  history: RepoHistory | undefined;
};

export function str(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function architecture(snapshot: AnalysisSnapshot) {
  const { analysis } = snapshot;
  const index = indexAnalysis(analysis);
  const areas = new Map<string, { files: number; loc: number; importedFromOutside: Set<string> }>();
  const areaOf = (path: string) => {
    const parts = path.split("/");
    return parts.length > 2
      ? parts.slice(0, 2).join("/")
      : parts.length === 2
        ? parts[0]!
        : "(root)";
  };
  for (const file of analysis.files) {
    const area = areaOf(file.path);
    const entry = areas.get(area) ?? { files: 0, loc: 0, importedFromOutside: new Set<string>() };
    entry.files += 1;
    entry.loc += file.loc;
    for (const edge of index.dependents.get(file.path) ?? [])
      if (areaOf(edge.path) !== area) entry.importedFromOutside.add(edge.path);
    areas.set(area, entry);
  }
  return {
    repository: snapshot.repository_full_name,
    analyzed_at: snapshot.created_at,
    commit: analysis.ref,
    stats: analysis.stats,
    workspaces: analysis.packages,
    areas: [...areas.entries()]
      .map(([area, value]) => ({
        area,
        files: value.files,
        loc: value.loc,
        imported_by_other_areas: value.importedFromOutside.size,
      }))
      .sort((a, b) => b.imported_by_other_areas - a.imported_by_other_areas || b.files - a.files)
      .slice(0, 40),
    external_services: analysis.services.map((service) => ({
      id: service.id,
      name: service.name,
      category: service.category,
      files: service.files.length,
      env: service.envVars,
      evidence: service.evidence
        .slice(0, 4)
        .map((item) => `${item.path}${item.line ? `:${item.line}` : ""} ${item.reason}`),
    })),
    data: analysis.resources.slice(0, 60).map((resource) => ({
      id: resource.id,
      defined_in: resource.definedIn,
      used_by_files: new Set(resource.uses.map((use) => use.path)).size,
    })),
    most_depended_on: [...index.dependents.entries()]
      .map(([path, edges]) => ({ path, importers: new Set(edges.map((edge) => edge.path)).size }))
      .sort((a, b) => b.importers - a.importers)
      .slice(0, 15),
    entrypoints: analysis.files.filter((file) => file.role === "route" || file.role === "api")
      .length,
    circular_imports: analysis.cycles.slice(0, 10),
    limitations: analysis.limitations,
  };
}

function expandPaths(analysis: RepoAnalysis, inputs: string[]) {
  const all = analysis.files.map((file) => file.path);
  const out = new Set<string>();
  for (const raw of inputs) {
    const input = raw.replace(/^\.?\//, "");
    if (all.includes(input)) out.add(input);
    else {
      const prefix = input.endsWith("/") ? input : `${input}/`;
      all.filter((path) => path.startsWith(prefix)).forEach((path) => out.add(path));
    }
  }
  return [...out];
}

/** Runs one read-only analysis tool against a loaded snapshot. */
export function runAnalysisTool(
  snapshot: AnalysisSnapshot,
  name: string,
  args: Record<string, unknown>,
) {
  const { analysis, history } = snapshot;
  const header = {
    repository: snapshot.repository_full_name,
    commit: analysis.ref,
    analyzed_at: snapshot.created_at,
  };

  if (name === "get_architecture") return architecture(snapshot);

  if (name === "get_impact") {
    const requested = Array.isArray(args["paths"])
      ? args["paths"].map(str).filter(Boolean)
      : [str(args["paths"])].filter(Boolean);
    if (!requested.length) throw new Error("Pass at least one path.");
    const paths = expandPaths(analysis, requested);
    if (!paths.length)
      return {
        ...header,
        error: `None of ${requested.join(", ")} matched an analyzed JS/TS source file. Use search_files to find the right path.`,
      };
    return { ...header, ...impactBriefing(analysis, history, paths, { maxItems: 60 }) };
  }

  if (name === "find_usages") {
    const index = indexAnalysis(analysis);
    const table = str(args["table"]).toLowerCase();
    const serviceQuery = str(args["service"]).toLowerCase();
    const env = str(args["env"]);
    let uses: { path: string; line?: number; reason: string }[] = [];
    let subject = "";
    if (table) {
      const matches = analysis.resources.filter(
        (resource) => resource.name.toLowerCase() === table || resource.id.toLowerCase() === table,
      );
      if (!matches.length)
        return {
          ...header,
          error: `No table, RPC or model named "${table}". Known: ${analysis.resources
            .slice(0, 40)
            .map((r) => r.name)
            .join(", ")}`,
        };
      subject = matches.map((m) => m.id).join(", ");
      uses = matches.flatMap((resource) => [
        ...resource.definedIn.map((path) => ({ path, reason: `defines ${resource.id}` })),
        ...resource.uses.map((use) => ({
          path: use.path,
          line: use.line,
          reason: `uses ${resource.id}`,
        })),
      ]);
    } else if (serviceQuery) {
      const service = analysis.services.find(
        (item) => item.id === serviceQuery || item.name.toLowerCase() === serviceQuery,
      );
      if (!service)
        return {
          ...header,
          error: `No service "${serviceQuery}". Known: ${analysis.services.map((s) => s.id).join(", ")}`,
        };
      subject = service.name;
      uses = service.evidence.map((item) => ({
        path: item.path,
        ...(item.line ? { line: item.line } : {}),
        reason: item.reason,
      }));
    } else if (env) {
      const entry = analysis.envVars.find((item) => item.name === env);
      if (!entry) return { ...header, error: `No code reads ${env}.` };
      subject = env;
      uses = entry.files.map((path) => ({ path, reason: `reads ${env}` }));
    } else {
      throw new Error("Pass one of table, service or env.");
    }
    const sourcePaths = [...new Set(uses.map((use) => use.path))].filter((path) =>
      index.files.has(path),
    );
    const briefing = impactBriefing(analysis, history, sourcePaths, { maxItems: 40 });
    return {
      ...header,
      subject,
      uses: uses.slice(0, 150),
      impact_of_changing_it: briefing.impact,
      limitations: briefing.limitations,
    };
  }

  if (name === "search_files") {
    const query = str(args["query"]).toLowerCase();
    if (!query) throw new Error("Pass a query.");
    const hits = analysis.files
      .filter(
        (file) =>
          file.path.toLowerCase().includes(query) ||
          file.exports.some((name) => name.toLowerCase().includes(query)),
      )
      .slice(0, 50)
      .map((file) => ({
        path: file.path,
        role: file.role,
        exports: file.exports.filter((name) => name.toLowerCase().includes(query)).slice(0, 10),
        last_changed: historyFor(history, [file.path]).commits[0]?.date?.slice(0, 10) ?? null,
      }));
    return { ...header, results: hits };
  }

  throw new Error(`Unknown tool: ${name}`);
}
