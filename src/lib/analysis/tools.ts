import { impactBriefing } from "./context";
import { historyFor, indexAnalysis } from "./impact";
import { summarizeSymbol } from "./symbols";
import { searchMemory } from "../memory/evidence";
import type { MemoryKind, RepoAnalysis, RepoHistory } from "./types";

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
  {
    name: "search_memory",
    title: "Search evidence memory",
    description:
      "Search cited memory extracted from ADRs, Mermaid diagrams, SQL migrations and image references. Every result carries a file citation and a checksum; nothing is model-generated.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Case-insensitive text to find." },
        kind: {
          type: "string",
          enum: ["adr", "diagram", "migration", "contract", "image"],
          description: "Optional memory kind filter.",
        },
        ...repositoryArg,
      },
      required: ["query"],
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: "get_federation",
    title: "Federate OpenAPI and gRPC contracts",
    description:
      "Match provider OpenAPI operations and gRPC methods across every analyzed repository against literal consumer routes in the graph. Returns cross-repository edges, unmatched endpoints and honest contract limitations.",
    inputSchema: { type: "object", properties: { ...repositoryArg } },
    annotations: { readOnlyHint: true },
  },
  {
    name: "simulate_change",
    title: "Simulate a change before writing it",
    description:
      "Apply file writes or deletions to an in-memory graph overlay and return the blast radius, new cycles, newly unresolved imports and SQL column drift. Nothing is persisted; the stored snapshot is never modified.",
    inputSchema: {
      type: "object",
      properties: {
        changes: {
          type: "array",
          items: {
            type: "object",
            properties: {
              path: { type: "string", description: "Repository-relative path." },
              content: {
                type: ["string", "null"],
                description: "New file content, or null to simulate deletion.",
              },
            },
            required: ["path"],
          },
          description: "At most 50 file writes or deletions to overlay.",
        },
        paths: {
          type: "array",
          items: { type: "string" },
          description: "Optional paths to measure; defaults to the changed paths.",
        },
        ...repositoryArg,
      },
      required: ["changes"],
    },
    annotations: { readOnlyHint: true, destructiveHint: false },
  },
  {
    name: "generate_fix_patch",
    title: "Generate a verified fix diff",
    description:
      "Deterministically remediate four breakage classes on an in-memory clone: unresolved import rewrites, arity and restored-export compatibility shims, runtime cycle conversion to `import type`, and SQL column drift renames. A unified diff is returned only when the verified breaking score falls without adding cycles. Pass the current file content.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Repository-relative source file to repair." },
        content: {
          type: "string",
          description: "Current file content, used to build and verify the exact diff.",
        },
        issue: {
          type: "string",
          enum: ["auto", "unresolved-import", "arity-shim", "cycle", "column-drift"],
          description:
            "Optional remediation class. `auto` (default) evaluates all four deterministic strategies.",
        },
        ...repositoryArg,
      },
      required: ["path", "content"],
    },
    annotations: { readOnlyHint: true, destructiveHint: false },
  },
  {
    name: "run_safe_code_loop",
    title: "Check a proposed file with the safe coding loop",
    description:
      "Run the four-stage in-memory loop over a complete proposed file: bounded architecture and six-layer memory, AST call-site verification (scope, overloads, namespace calls, barrel re-exports), a deterministic verdict, Trinity root-cause cards with causal chains, and a verified four-strategy auto-heal. Nothing is written; a clean overlay is not a substitute for a full typecheck and test run.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Repository-relative analyzed source file." },
        content: { type: "string", description: "Complete proposed replacement content." },
        ...repositoryArg,
      },
      required: ["path", "content"],
    },
    annotations: { readOnlyHint: true, destructiveHint: false },
  },
  {
    name: "get_trace_overlay",
    title: "Overlay OpenTelemetry spans on the graph",
    description:
      "Attach OTLP JSON spans to analyzed files by code.filepath, then mark observed caller-callee edges that also exist in the static import graph. Unmatched spans are reported, never guessed. Read-only.",
    inputSchema: {
      type: "object",
      properties: {
        spans: {
          anyOf: [{ type: "object" }, { type: "array" }],
          description: "OTLP JSON export ({ resourceSpans: [...] }) or a flat span array.",
        },
        ...repositoryArg,
      },
      required: ["spans"],
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
      columns: resource.columns?.slice(0, 80) ?? [],
      column_drift: resource.columnDrift ?? [],
    })),
    most_depended_on: [...index.dependents.entries()]
      .map(([path, edges]) => ({ path, importers: new Set(edges.map((edge) => edge.path)).size }))
      .sort((a, b) => b.importers - a.importers)
      .slice(0, 15),
    entrypoints: analysis.files.filter((file) => file.role === "route" || file.role === "api")
      .length,
    languages: analysis.files.reduce<Record<string, number>>((counts, file) => {
      counts[file.language] = (counts[file.language] ?? 0) + 1;
      return counts;
    }, {}),
    contracts: {
      openapi: analysis.contracts?.openapi.length ?? 0,
      grpc: analysis.contracts?.grpc.length ?? 0,
      operations:
        (analysis.contracts?.openapi ?? []).reduce(
          (total, contract) => total + contract.operations.length,
          0,
        ) +
        (analysis.contracts?.grpc ?? []).reduce((total, service) => total + service.rpcs.length, 0),
    },
    memory: {
      records: analysis.memory?.length ?? 0,
      by_kind: (analysis.memory ?? []).reduce<Record<string, number>>((counts, record) => {
        counts[record.kind] = (counts[record.kind] ?? 0) + 1;
        return counts;
      }, {}),
    },
    circular_imports: analysis.cycles.slice(0, 10),
    limitations: analysis.limitations,
  };
}

export function expandPaths(analysis: RepoAnalysis, inputs: string[]) {
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
        ...(resource.columnDrift ?? []).flatMap((finding) =>
          finding.references.map((reference) => ({
            path: reference.path,
            line: reference.line,
            reason: `${finding.kind}: ${resource.id}.${finding.column} via ${reference.operation}`,
          })),
        ),
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
    const resources = table
      ? analysis.resources.filter(
          (resource) =>
            resource.name.toLowerCase() === table || resource.id.toLowerCase() === table,
        )
      : [];
    return {
      ...header,
      subject,
      columns: resources.flatMap((resource) => resource.columns ?? []),
      column_drift: resources.flatMap((resource) => resource.columnDrift ?? []),
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
        signatures: (file.symbols ?? [])
          .filter((symbol) => symbol.name.toLowerCase().includes(query))
          .slice(0, 8)
          .map(summarizeSymbol),
        last_changed: historyFor(history, [file.path]).commits[0]?.date?.slice(0, 10) ?? null,
      }));
    return { ...header, results: hits };
  }

  if (name === "search_memory") {
    const query = str(args["query"]);
    if (!query) throw new Error("Pass a query.");
    const kinds: MemoryKind[] = ["adr", "diagram", "migration", "contract", "image"];
    const requested = str(args["kind"]) as MemoryKind;
    const kind = kinds.includes(requested) ? requested : undefined;
    const results = searchMemory(analysis.memory ?? [], query, kind);
    return {
      ...header,
      query,
      ...(kind ? { kind } : {}),
      total: results.length,
      results: results.map((record) => ({
        id: record.id,
        kind: record.kind,
        title: record.title,
        summary: record.summary,
        status: record.status ?? null,
        tags: record.tags,
        citations: record.citations,
        entities: record.entities.slice(0, 30),
        media: record.media ?? null,
        checksum: record.checksum,
      })),
    };
  }

  throw new Error(`Unknown tool: ${name}`);
}
