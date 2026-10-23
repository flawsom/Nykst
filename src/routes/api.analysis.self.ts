import { createFileRoute } from "@tanstack/react-router";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { analyzeRepository, MAX_SOURCE_BYTES, wantsContent } from "@/lib/analysis/engine.server";
import { impactBriefing } from "@/lib/analysis/context";
import { federateRepositories } from "@/lib/analysis/federation";
import { generateFixPatch } from "@/lib/analysis/fix";
import { indexAnalysis } from "@/lib/analysis/impact";
import { buildLoopRun } from "@/lib/analysis/loop.server";
import type { LoopScenarioId } from "@/lib/loop";
import { selfSnapshot } from "@/lib/analysis/self-snapshot.server";
import { simulateChange } from "@/lib/analysis/simulate";
import { overlayTelemetry, parseOtlpSpans } from "@/lib/analysis/telemetry";
import { runAnalysisTool, type AnalysisSnapshot } from "@/lib/analysis/tools";
import type { RepoAnalysis } from "@/lib/analysis/types";
import { githubToken, githubUser, json } from "@/lib/integrations/github";
import { latestIngestion, listIngestedWorkspaces } from "@/lib/integrations/ingestions.server";
import { isSelfRepository, parseRepoSlug } from "@/lib/code-links";
import type { RepositorySnapshot } from "@/lib/repository-graph";

let cachedSelfAnalysis: { analysis: RepoAnalysis; computedAt: number } | null = null;
const CACHE_TTL_MS = 15_000;
const MIN_SOURCE_FILES = 80;

const IGNORED_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  ".output",
  ".vinxi",
  ".tanstack",
  ".vercel",
  ".wrangler",
  ".nitro",
  "coverage",
  // Browser-test artifacts contain minified bundles with unresolvable relative
  // imports. They are not repository source and must never enter the live graph.
  "playwright-report",
  "test-results",
  "BUFFY_TASK_OUTPUT",
]);

function walkWorkspace(root: string, rel = "", out: string[] = []): string[] {
  const fullDir = rel ? join(root, rel) : root;
  if (!existsSync(fullDir)) return out;
  for (const entry of readdirSync(fullDir, { withFileTypes: true })) {
    if (IGNORED_DIRS.has(entry.name)) continue;
    const nextRel = rel ? `${rel}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      walkWorkspace(root, nextRel, out);
    } else if (entry.isFile()) {
      out.push(nextRel);
    }
  }
  return out;
}

export async function getSelfAnalysis(force = false): Promise<RepoAnalysis> {
  const root = process.cwd();
  if (!existsSync(join(root, "src"))) return selfSnapshot;
  if (!force && cachedSelfAnalysis && Date.now() - cachedSelfAnalysis.computedAt < CACHE_TTL_MS) {
    return cachedSelfAnalysis.analysis;
  }
  const paths = walkWorkspace(root);
  const contents = new Map<string, string>();
  let skipped = 0;

  for (const p of paths) {
    try {
      const fullPath = join(root, p);
      const st = statSync(fullPath);
      if (st.size > MAX_SOURCE_BYTES) {
        skipped += 1;
        continue;
      }
      if (wantsContent(p, st.size)) {
        contents.set(p, readFileSync(fullPath, "utf8"));
      }
    } catch {
      // Ignore unreadable transient files
    }
  }

  const analysis = await analyzeRepository({
    ref: "live-workspace",
    paths,
    contents,
    skipped,
  });

  if (analysis.stats.sourceFiles < MIN_SOURCE_FILES) return selfSnapshot;

  cachedSelfAnalysis = { analysis, computedAt: Date.now() };
  return analysis;
}

async function resolveTargetAnalysis(
  request: Request,
  requestedRepo: string | null,
  force: boolean,
): Promise<{
  repository: string;
  analysis: RepoAnalysis;
  snapshotPayload: RepositorySnapshot;
  ingestedRepositories: Array<{
    repository: string;
    branch: string | null;
    commitSha: string | null;
    analyzedAt: string;
    fileCount: number;
    edgeCount: number;
    cycleCount: number;
  }>;
}> {
  const token = githubToken(request);
  let ingestedRepositories: Array<{
    repository: string;
    branch: string | null;
    commitSha: string | null;
    analyzedAt: string;
    fileCount: number;
    edgeCount: number;
    cycleCount: number;
  }> = [];

  if (token) {
    try {
      const user = await githubUser(token);
      const workspaces = await listIngestedWorkspaces(String(user.id));
      ingestedRepositories = workspaces.map((w) => ({
        repository: w.repository,
        branch: w.branch,
        commitSha: w.commit,
        analyzedAt: w.created_at,
        fileCount: w.sourceFiles || w.files,
        edgeCount: w.edges,
        cycleCount: w.cycles ?? 0,
      }));

      const slug = parseRepoSlug(requestedRepo)?.slug ?? null;
      if (slug && !isSelfRepository(slug)) {
        const row = await latestIngestion(String(user.id), slug);
        const payload = (row?.payload ?? null) as RepositorySnapshot | null;
        if (row && payload?.analysis) {
          return {
            repository: row.repository_full_name,
            analysis: payload.analysis,
            snapshotPayload: payload,
            ingestedRepositories,
          };
        }
      }
    } catch {
      // Fall back cleanly to self analysis if GitHub token is expired
    }
  }

  const analysis = await getSelfAnalysis(force);
  const snapshotPayload: RepositorySnapshot = {
    repository: {
      full_name: "flawsom/nykst",
      default_branch: "main",
      description:
        "Deterministic AST + dependency graph + temporal commit-history Graph-RAG architecture.",
      html_url: "https://github.com/flawsom/nykst",
    },
    files: analysis.files.map((f) => ({ path: f.path, type: "blob", size: f.loc * 38 })),
    commits: [],
    branches: [{ name: "main" }],
    pull_requests: [],
    issues: [],
    contributors: [],
    analysis,
  };

  return {
    repository: "flawsom/nykst",
    analysis,
    snapshotPayload,
    ingestedRepositories,
  };
}

async function executeWorkbenchTool(
  snapshot: AnalysisSnapshot,
  tool: string,
  validTarget: string,
  query: string,
  ingestedRepositories: Array<{
    repository: string;
    branch: string | null;
    commitSha: string | null;
    analyzedAt: string;
    fileCount: number;
    edgeCount: number;
    cycleCount: number;
  }>,
  customChanges?: Array<{ path: string; content: string | null }>,
  customContent?: string,
): Promise<unknown> {
  switch (tool) {
    case "list_repositories":
      return {
        repositories: [
          {
            repository: "flawsom/nykst",
            analyzed_at: snapshot.created_at,
            files: snapshot.analysis.stats.analyzedFiles,
            edges: snapshot.analysis.stats.internalEdges,
          },
          ...ingestedRepositories.map((r) => ({
            repository: r.repository,
            analyzed_at: r.analyzedAt,
            files: r.fileCount,
            edges: r.edgeCount,
          })),
        ],
      };
    case "get_architecture":
      return runAnalysisTool(snapshot, "get_architecture", {});
    case "get_impact":
      return runAnalysisTool(snapshot, "get_impact", { paths: [validTarget] });
    case "find_usages": {
      const firstTable = snapshot.analysis.resources[0]?.name ?? "repository_ingestions";
      return runAnalysisTool(snapshot, "find_usages", {
        table: query || firstTable,
      });
    }
    case "search_files":
      return runAnalysisTool(snapshot, "search_files", {
        query:
          query ||
          validTarget
            .split("/")
            .pop()
            ?.replace(/\.[jt]sx?$/, "") ||
          "graph",
      });
    case "search_memory":
      return runAnalysisTool(snapshot, "search_memory", {
        query: query || "architecture",
      });
    case "get_federation":
      return {
        ...federateRepositories([
          { repository: snapshot.repository_full_name, analysis: snapshot.analysis },
        ]),
        repositories: [
          { repository: snapshot.repository_full_name, analyzed_at: snapshot.created_at },
        ],
      };
    case "simulate_change": {
      const changes =
        customChanges && customChanges.length > 0
          ? customChanges
          : [
              {
                path: validTarget,
                content:
                  customContent !== undefined
                    ? customContent
                    : `// Pre-flight simulated edit on ${validTarget}\nimport { nonExistentSymbol } from "./missing-module";\n`,
              },
            ];
      return simulateChange(snapshot, changes, [validTarget]);
    }
    case "generate_fix_patch": {
      let content = customContent;
      const targetFile = snapshot.analysis.files.find((f) => f.path === validTarget);
      const hasUnresolvedOnDisk =
        (targetFile?.imports.filter((i) => i.kind === "unresolved").length ?? 0) > 0;
      if (
        content === undefined &&
        hasUnresolvedOnDisk &&
        isSelfRepository(snapshot.repository_full_name)
      ) {
        const fullPath = join(process.cwd(), validTarget);
        if (existsSync(fullPath)) {
          try {
            content = readFileSync(fullPath, "utf8");
          } catch {
            content = undefined;
          }
        }
      }
      if (!content) {
        content = `import { parseRepoSlug } from "./wrong-folder/code-links";\nexport const verified = parseRepoSlug;\n`;
      }
      return generateFixPatch(snapshot, {
        path: validTarget,
        content,
        issue: "unresolved-import",
      });
    }
    case "get_trace_overlay": {
      // Spans are shaped as OTLP JSON (attributes carry code.filepath) and are
      // anchored on the real target file plus its real internal imports, so the
      // overlay resolves against the compiled graph instead of inventing files.
      const internalImports = (
        snapshot.analysis.files
          .find((f) => f.path === validTarget)
          ?.imports.filter((i) => i.kind === "internal" && i.target)
          .slice(0, 3) ?? []
      ).map((imp) => imp.target!);
      const sampleSpans = [
        {
          traceId: "trace-live-ast-01",
          spanId: "span-root-01",
          name: `EXEC ${validTarget}`,
          startMs: 1000,
          durationMs: snapshot.analysis.stats.durationMs,
          status: "ok",
          attributes: { "code.filepath": validTarget },
        },
        ...internalImports.map((target, idx) => ({
          traceId: "trace-live-ast-01",
          spanId: `span-child-0${idx + 2}`,
          parentSpanId: "span-root-01",
          name: `CALL ${target}`,
          startMs: 1002 + idx * 3,
          durationMs: snapshot.analysis.files.find((f) => f.path === target)?.loc ?? 1,
          status: "ok",
          attributes: { "code.filepath": target },
        })),
      ];
      return {
        repository: snapshot.repository_full_name,
        commit: snapshot.analysis.ref,
        analyzed_at: snapshot.created_at,
        ...overlayTelemetry(snapshot.analysis, parseOtlpSpans(sampleSpans)),
      };
    }
    default:
      return null;
  }
}

function buildResponsePayload(
  repository: string,
  analysis: RepoAnalysis,
  snapshotPayload: RepositorySnapshot,
  validTarget: string,
  toolOutput: unknown,
  ingestedRepositories: Array<{
    repository: string;
    branch: string | null;
    commitSha: string | null;
    analyzedAt: string;
    fileCount: number;
    edgeCount: number;
    cycleCount: number;
  }>,
) {
  const index = indexAnalysis(analysis);
  const briefing = impactBriefing(analysis, snapshotPayload.history, [validTarget], {
    maxItems: 30,
  });

  // Architectural Impact Ranking:
  // (directImporters * 3 + transitiveDependents + sqlResources * 4 + isEntrypoint * 5)
  const topHubs = [...index.files.values()]
    .map((file) => {
      const edges = index.dependents.get(file.path) ?? [];
      const directImporters = new Set(edges.map((e) => e.path)).size;
      const runtimeImporters = new Set(edges.filter((e) => !e.typeOnly).map((e) => e.path)).size;
      const sqlResourcesCount = file.resources.length;
      const isEntrypoint = file.role === "route" || file.role === "api" ? 1 : 0;
      const rankScore =
        directImporters * 3 + runtimeImporters + sqlResourcesCount * 4 + isEntrypoint * 5;
      return {
        path: file.path,
        role: file.role,
        loc: file.loc,
        exports: file.exports.slice(0, 6),
        importers: directImporters,
        runtimeImporters,
        services: file.services,
        rankScore,
      };
    })
    .filter((h) => h.importers > 0 || h.rankScore > 0)
    .sort((a, b) => b.rankScore - a.rankScore || b.importers - a.importers || b.loc - a.loc)
    .slice(0, 18);

  const domainMap = new Map<
    string,
    {
      domain: string;
      files: number;
      loc: number;
      edgesOut: number;
      edgesIn: number;
      sampleFiles: string[];
    }
  >();
  const domainOf = (p: string) => {
    const parts = p.split("/");
    return parts.length > 2 ? `${parts[0]}/${parts[1]}` : (parts[0] ?? "root");
  };

  for (const file of analysis.files) {
    const d = domainOf(file.path);
    const entry = domainMap.get(d) ?? {
      domain: d,
      files: 0,
      loc: 0,
      edgesOut: 0,
      edgesIn: 0,
      sampleFiles: [],
    };
    entry.files += 1;
    entry.loc += file.loc;
    if (entry.sampleFiles.length < 4) entry.sampleFiles.push(file.path);
    for (const dep of index.dependencies.get(file.path) ?? []) {
      if (domainOf(dep.path) !== d) entry.edgesOut += 1;
    }
    for (const dep of index.dependents.get(file.path) ?? []) {
      if (domainOf(dep.path) !== d) entry.edgesIn += 1;
    }
    domainMap.set(d, entry);
  }

  return {
    repository,
    generatedAt: analysis.generatedAt,
    method: analysis.method,
    stats: analysis.stats,
    snapshotPayload,
    ingestedRepositories,
    domains: [...domainMap.values()].sort(
      (a, b) => b.edgesIn + b.edgesOut - (a.edgesIn + a.edgesOut),
    ),
    services: analysis.services.map((s) => ({
      id: s.id,
      name: s.name,
      category: s.category,
      fileCount: s.files.length,
      envVars: s.envVars,
      packages: s.packages,
      evidence: s.evidence.slice(0, 4),
    })),
    resources: analysis.resources.map((r) => ({
      id: r.id,
      kind: r.kind,
      name: r.name,
      service: r.service,
      definedIn: r.definedIn,
      usageCount: r.uses.length,
      files: [...new Set(r.uses.map((u) => u.path))],
      columns: r.columns ?? [],
      columnDrift: r.columnDrift ?? [],
    })),
    envVars: analysis.envVars.slice(0, 30),
    cycles: analysis.cycles,
    topHubs,
    selectedTarget: {
      path: validTarget,
      file: index.files.get(validTarget) ?? null,
      briefing,
    },
    toolOutput,
  };
}

export const Route = createFileRoute("/api/analysis/self")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const url = new URL(request.url);
          const force = url.searchParams.get("refresh") === "1";
          const requestedRepo = url.searchParams.get("repo")?.trim() || null;
          const target = url.searchParams.get("path")?.trim() || "src/lib/integrations/github.ts";
          const tool = url.searchParams.get("tool")?.trim() || "";
          const query = url.searchParams.get("query")?.trim() || "";

          const { repository, analysis, snapshotPayload, ingestedRepositories } =
            await resolveTargetAnalysis(request, requestedRepo, force);
          const index = indexAnalysis(analysis);

          const validTarget = index.files.has(target)
            ? target
            : (analysis.files.find((f) => f.path.includes(target))?.path ??
              analysis.files[0]?.path ??
              "src/lib/analysis/engine.server.ts");

          let toolOutput: unknown = null;
          if (tool) {
            const snapshot: AnalysisSnapshot = {
              repository_full_name: repository,
              created_at: analysis.generatedAt,
              analysis,
              history: snapshotPayload.history,
            };
            toolOutput = await executeWorkbenchTool(
              snapshot,
              tool,
              validTarget,
              query,
              ingestedRepositories,
            );
          }

          return json(
            buildResponsePayload(
              repository,
              analysis,
              snapshotPayload,
              validTarget,
              toolOutput,
              ingestedRepositories,
            ),
            { headers: { "cache-control": "no-store" } },
          );
        } catch (error) {
          return json(
            { error: error instanceof Error ? error.message : "Live AST analysis failed." },
            { status: 500 },
          );
        }
      },
      POST: async ({ request }) => {
        try {
          const body = (await request.json().catch(() => ({}))) as {
            repo?: string;
            path?: string;
            tool?: string;
            query?: string;
            changes?: Array<{ path: string; content: string | null }>;
            content?: string;
            scenario?: LoopScenarioId;
          };
          const requestedRepo = body.repo?.trim() || null;
          const target = body.path?.trim() || "src/lib/integrations/github.ts";
          const tool = body.tool?.trim() || "simulate_change";
          const query = body.query?.trim() || "";

          const { repository, analysis, snapshotPayload, ingestedRepositories } =
            await resolveTargetAnalysis(request, requestedRepo, false);
          const index = indexAnalysis(analysis);
          const validTarget = index.files.has(target)
            ? target
            : (analysis.files.find((f) => f.path.includes(target))?.path ??
              analysis.files[0]?.path ??
              "src/lib/analysis/engine.server.ts");

          const snapshot: AnalysisSnapshot = {
            repository_full_name: repository,
            created_at: analysis.generatedAt,
            analysis,
            history: snapshotPayload.history,
          };

          const toolOutput =
            tool === "run_loop"
              ? await buildLoopRun(snapshot, {
                  path: validTarget,
                  ...(body.scenario ? { scenario: body.scenario } : {}),
                  ...(body.content !== undefined ? { content: body.content } : {}),
                  token: githubToken(request) ?? null,
                })
              : await executeWorkbenchTool(
                  snapshot,
                  tool,
                  validTarget,
                  query,
                  ingestedRepositories,
                  body.changes,
                  body.content,
                );

          return json(
            {
              repository,
              path: validTarget,
              tool,
              toolOutput,
            },
            { headers: { "cache-control": "no-store" } },
          );
        } catch (error) {
          return json(
            { error: error instanceof Error ? error.message : "Simulation execution failed." },
            { status: 500 },
          );
        }
      },
    },
  },
});
