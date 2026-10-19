import { createFileRoute } from "@tanstack/react-router";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { analyzeRepository, MAX_SOURCE_BYTES, wantsContent } from "@/lib/analysis/engine.server";
import { impactBriefing } from "@/lib/analysis/context";
import { indexAnalysis } from "@/lib/analysis/impact";
import { selfSnapshot } from "@/lib/analysis/self-snapshot.server";
import { runAnalysisTool } from "@/lib/analysis/tools";
import type { RepoAnalysis } from "@/lib/analysis/types";
import { json } from "@/lib/integrations/github";

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
  "coverage",
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

async function getSelfAnalysis(force = false): Promise<RepoAnalysis> {
  const root = process.cwd();
  // A bundled deployment has no src tree to walk, so it serves the committed snapshot.
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

  // A handful of files means the walk landed on build output, not on a source tree.
  if (analysis.stats.sourceFiles < MIN_SOURCE_FILES) return selfSnapshot;

  cachedSelfAnalysis = { analysis, computedAt: Date.now() };
  return analysis;
}

export const Route = createFileRoute("/api/analysis/self")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const url = new URL(request.url);
          const force = url.searchParams.get("refresh") === "1";
          const target = url.searchParams.get("path")?.trim() || "src/lib/integrations/github.ts";
          const tool = url.searchParams.get("tool")?.trim() || "";
          const query = url.searchParams.get("query")?.trim() || "";

          const analysis = await getSelfAnalysis(force);
          const index = indexAnalysis(analysis);

          const validTarget = index.files.has(target)
            ? target
            : (analysis.files.find((f) => f.path.includes(target))?.path ??
              "src/lib/analysis/engine.server.ts");

          const briefing = impactBriefing(analysis, undefined, [validTarget], { maxItems: 30 });

          const topHubs = [...index.dependents.entries()]
            .map(([path, edges]) => {
              const file = index.files.get(path);
              return {
                path,
                role: file?.role ?? "lib",
                loc: file?.loc ?? 0,
                exports: file?.exports.slice(0, 6) ?? [],
                importers: new Set(edges.map((e) => e.path)).size,
                runtimeImporters: new Set(edges.filter((e) => !e.typeOnly).map((e) => e.path)).size,
                services: file?.services ?? [],
              };
            })
            .sort((a, b) => b.importers - a.importers || b.loc - a.loc)
            .slice(0, 18);

          const domainMap = new Map<
            string,
            { domain: string; files: number; loc: number; edgesOut: number; edgesIn: number; sampleFiles: string[] }
          >();
          const domainOf = (p: string) => {
            const parts = p.split("/");
            return parts.length > 2 ? `${parts[0]}/${parts[1]}` : parts[0] ?? "root";
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

          let toolOutput: unknown = null;
          if (tool && ["get_architecture", "get_impact", "find_usages", "search_files"].includes(tool)) {
            const snapshot = {
              repository_full_name: "flawsom/nykst",
              created_at: analysis.generatedAt,
              analysis,
              history: undefined,
            };
            if (tool === "get_architecture") {
              toolOutput = runAnalysisTool(snapshot, "get_architecture", {});
            } else if (tool === "get_impact") {
              toolOutput = runAnalysisTool(snapshot, "get_impact", { paths: [validTarget] });
            } else if (tool === "find_usages") {
              const firstTable = analysis.resources[0]?.name ?? "repository_ingestions";
              toolOutput = runAnalysisTool(snapshot, "find_usages", {
                table: query || firstTable,
              });
            } else if (tool === "search_files") {
              toolOutput = runAnalysisTool(snapshot, "search_files", {
                query: query || "graph",
              });
            }
          }

          const snapshotPayload = {
            repository: {
              full_name: "flawsom/nykst",
              default_branch: "main",
              description: "Deterministic AST + dependency graph + temporal commit-history Graph-RAG architecture.",
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

          return json(
            {
              repository: "flawsom/nykst",
              generatedAt: analysis.generatedAt,
              method: analysis.method,
              stats: analysis.stats,
              snapshotPayload,
              domains: [...domainMap.values()].sort((a, b) => b.edgesIn + b.edgesOut - (a.edgesIn + a.edgesOut)),
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
            },
            { headers: { "cache-control": "no-store" } },
          );
        } catch (error) {
          return json(
            { error: error instanceof Error ? error.message : "Live AST analysis failed." },
            { status: 500 },
          );
        }
      },
    },
  },
});
