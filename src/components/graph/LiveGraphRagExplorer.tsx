import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  Activity,
  ArrowRight,
  Cpu,
  Database,
  RefreshCw,
  Terminal,
  Zap,
  Sparkles,
  Wrench,
  Radio,
  Globe,
  BookOpen,
} from "lucide-react";
import { TiltCard, ScrambleText } from "@/components/motion/VariantMotion";
import { FederationPanel, TraceOverlayPanel } from "@/components/mcp/ToolInsightPanel";
import { SafeCodeLoopEngine } from "@/components/graph/SafeCodeLoopEngine";
import { TOOLS as MCP_TOOLS } from "@/lib/mcp-guides";
import { cn } from "@/lib/utils";
import type { CodeTarget } from "@/components/graph/CodeProblemInspector";

export type LiveSelfAnalysis = {
  repository: string;
  generatedAt: string;
  method: string;
  stats: {
    treeFiles: number;
    sourceFiles: number;
    analyzedFiles: number;
    internalEdges: number;
    externalPackages: number;
    unresolvedImports: number;
    skippedFiles: number;
    loc: number;
    durationMs: number;
  };
  domains: {
    domain: string;
    files: number;
    loc: number;
    edgesOut: number;
    edgesIn: number;
    sampleFiles: string[];
  }[];
  services: {
    id: string;
    name: string;
    category: string;
    fileCount: number;
    envVars: string[];
    packages: string[];
    evidence: { path: string; reason: string; line?: number }[];
  }[];
  resources: {
    id: string;
    kind: string;
    name: string;
    service: string;
    definedIn: string[];
    usageCount: number;
    files: string[];
    columns?: { name: string; type: string; nullable: boolean }[];
    columnDrift?: {
      kind: "unknown-column" | "dropped-column";
      table: string;
      column: string;
      message: string;
      references: { path: string; line: number; operation: string }[];
    }[];
  }[];
  cycles: string[][];
  topHubs: {
    path: string;
    role: string;
    loc: number;
    exports: string[];
    importers: number;
    runtimeImporters: number;
    services: string[];
    rankScore?: number;
  }[];
  selectedTarget: {
    path: string;
    file: {
      path: string;
      language: string;
      loc: number;
      role: string;
      exports: string[];
      functions: string[];
      classes: string[];
      envVars: string[];
      services: string[];
    } | null;
    briefing: {
      impact: {
        level: "Low" | "Moderate" | "High" | "Critical";
        runtime_dependents: number;
        type_only_dependents: number;
        direct_importers: { path: string; line: number; imports: string; type_only: boolean }[];
        entrypoints: { path: string; role: string; chain: string[] }[];
        tests_that_cover_it: string[];
        areas: { area: string; files: number }[];
      };
      limitations: string[];
    };
  };
  toolOutput?: unknown;
  ingestedRepositories?: Array<{
    repository: string;
    branch: string | null;
    commitSha: string | null;
    analyzedAt: string;
    fileCount: number;
    edgeCount: number;
    cycleCount: number;
  }>;
};

type McpToolName =
  | "list_repositories"
  | "get_architecture"
  | "get_impact"
  | "find_usages"
  | "search_files"
  | "search_memory"
  | "get_federation"
  | "get_trace_overlay"
  | "simulate_change"
  | "generate_fix_patch"
  | "run_safe_code_loop";

const ARCHITECTURE_LAYERS = [
  {
    step: "01",
    name: "Polyglot & TypeScript AST Compiler",
    metric: "ts.createSourceFile + Python, Go, Rust adapters · tsconfig alias & workspace resolver",
    naiveFail:
      "Lexical search and chunked text indexers split files arbitrarily, severing function signatures from imports and missing cross-file path aliases.",
    nykstTruth:
      "Parses JS/TS/TSX, Python, Go, and Rust sources into a unified dependency graph, resolving tsconfig aliases, workspace packages, exported symbol arity, and exact line numbers.",
    proofFile: "src/lib/analysis/engine.server.ts",
  },
  {
    step: "02",
    name: "Dependency cycles and connections",
    metric: "Iterative Tarjan strongly-connected components + 6-level radial trie",
    naiveFail:
      "Text similarity cannot detect circular runtime imports or distinguish a leaf UI component from a high-fan-in authentication hub.",
    nykstTruth:
      "Builds a 6-level radial hierarchy (Organization → Domain → Capability → Service → Module → File) and isolates circular runtime loops from type-only imports.",
    proofFile: "src/lib/analysis/graph.ts",
  },
  {
    step: "03",
    name: "Reverse BFS Blast-Radius Reachability",
    metric: "Exact line-level importer chains → API & route entrypoints",
    naiveFail:
      "Heuristic impact checks guess what might break from file names, missing transitive callers several hops away.",
    nykstTruth:
      "Computes breadth-first reverse reachability from any seed file or SQL table to every affected route, API endpoint, and covering test.",
    proofFile: "src/lib/analysis/impact.ts",
  },
  {
    step: "04",
    name: "SQL Column Contracts & Service Lineage",
    metric: "DDL migration replay + PostgREST/Prisma column drift verifier",
    naiveFail:
      "Standard code indexers treat SQL migrations, environment variables, and SDK calls as unlinked strings.",
    nykstTruth:
      "Replays CREATE TABLE and ALTER TABLE migrations in order, linking columns directly to .from().select()/insert()/update() call sites and flagging column drift.",
    proofFile: "src/lib/analysis/sql.ts",
  },
  {
    step: "05",
    name: "Pre-Flight Simulation & Verified Remediation",
    metric: "simulate_change overlay + generate_fix_patch in-memory verification",
    naiveFail:
      "Agents edit files on disk first and discover broken imports or new cycles only after the build fails.",
    nykstTruth:
      "Overlays proposed writes or deletions on an in-memory graph clone and emits a unified remediation diff only when unresolved imports drop and cycles do not grow.",
    proofFile: "src/lib/analysis/simulate.ts",
  },
  {
    step: "06",
    name: `Streamable HTTP MCP Server (${MCP_TOOLS.length} Read-Only Tools)`,
    metric: `${MCP_TOOLS.length} readOnlyHint MCP tools · OTLP trace overlay · OpenAPI/gRPC federation`,
    naiveFail: "IDE agents burn context tokens grepping hundreds of files before making a change.",
    nykstTruth: `Claude Code, Cursor, VS Code, Windsurf, and Codex call all ${MCP_TOOLS.length} read-only tools over /api/mcp in milliseconds before touching a line of code.`,
    proofFile: "src/lib/mcp.server.ts",
  },
];

export function LiveGraphRagExplorer({
  initialData,
  activeRepo,
  onDataUpdate,
  onOpenCode,
  onLoopVerdict,
}: {
  initialData: LiveSelfAnalysis | null;
  activeRepo?: string | null;
  onDataUpdate?: (data: LiveSelfAnalysis) => void;
  onOpenCode?: (target: CodeTarget) => void;
  onLoopVerdict?: (verdict: "safe" | "breaking" | "simulating") => void;
}) {
  const [data, setData] = useState<LiveSelfAnalysis | null>(initialData);
  const [selectedPath, setSelectedPath] = useState("src/lib/integrations/github.ts");
  const [activeLayer, setActiveLayer] = useState(0);
  const [activeTab, setActiveTab] = useState<"blast" | "sql" | "mcp">("blast");
  const [mcpTool, setMcpTool] = useState<McpToolName>("get_impact");
  const [mcpQuery, setMcpQuery] = useState("repository_ingestions");
  const [simContent, setSimContent] = useState(
    `// Pre-flight simulated edit\nimport { parseRepoSlug } from "./wrong-folder/code-links";\nexport const simulated = parseRepoSlug;\n`,
  );
  const [mcpResult, setMcpResult] = useState<unknown>(null);
  const [loadingTarget, setLoadingTarget] = useState(false);
  const [loadingMcp, setLoadingMcp] = useState(false);

  useEffect(() => {
    if (initialData) {
      setData(initialData);
      setSelectedPath(initialData.selectedTarget.path);
    }
  }, [initialData]);

  const repoParam = activeRepo ?? data?.repository ?? "flawsom/nykst";

  const inspectFile = async (path: string, forceRefresh = false) => {
    setSelectedPath(path);
    setLoadingTarget(true);
    try {
      const res = await fetch(
        `/api/analysis/self?repo=${encodeURIComponent(repoParam)}&path=${encodeURIComponent(path)}${forceRefresh ? "&refresh=1" : ""}`,
      );
      if (res.ok) {
        const next = (await res.json()) as LiveSelfAnalysis;
        setData(next);
        onDataUpdate?.(next);
      }
    } finally {
      setLoadingTarget(false);
    }
  };

  const runLiveMcpTool = async (toolName: McpToolName, queryOverride?: string) => {
    setMcpTool(toolName);
    setLoadingMcp(true);
    try {
      const q = queryOverride ?? mcpQuery;
      if (
        toolName === "simulate_change" ||
        toolName === "generate_fix_patch" ||
        toolName === "run_safe_code_loop"
      ) {
        const res = await fetch("/api/analysis/self", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            repo: repoParam,
            path: selectedPath,
            tool: toolName,
            query: q,
            content: simContent,
          }),
        });
        if (res.ok) {
          const payload = (await res.json()) as { toolOutput?: unknown };
          setMcpResult(payload.toolOutput);
        }
        return;
      }

      const res = await fetch(
        `/api/analysis/self?repo=${encodeURIComponent(repoParam)}&path=${encodeURIComponent(selectedPath)}&tool=${encodeURIComponent(toolName)}&query=${encodeURIComponent(q)}`,
      );
      if (res.ok) {
        const next = (await res.json()) as LiveSelfAnalysis;
        setMcpResult(next.toolOutput);
      }
    } finally {
      setLoadingMcp(false);
    }
  };

  useEffect(() => {
    if (activeTab === "mcp" && !mcpResult) {
      void runLiveMcpTool("get_impact");
    }
  }, [activeTab]);

  if (!data) {
    return (
      <div className="border-border bg-card/70 rounded-3xl border p-8 text-center">
        <RefreshCw className="text-primary mx-auto size-6 animate-spin" />
        <p className="text-muted-foreground mt-3 font-mono text-xs uppercase tracking-widest">
          Reading the repository…
        </p>
      </div>
    );
  }

  const { selectedTarget, topHubs, resources, services, stats } = data;
  const impact = selectedTarget.briefing.impact;
  const levelColor =
    impact.level === "Critical"
      ? "border-red-500/40 bg-red-500/15 text-red-300"
      : impact.level === "High"
        ? "border-amber-500/40 bg-amber-500/15 text-amber-300"
        : impact.level === "Moderate"
          ? "border-sky-500/40 bg-sky-500/15 text-sky-300"
          : "border-emerald-500/40 bg-emerald-500/15 text-emerald-300";

  const ALL_MCP_TOOLS: Array<{ id: McpToolName; label: string; badge?: string }> = [
    { id: "list_repositories", label: "list_repositories()" },
    { id: "get_architecture", label: "get_architecture()" },
    { id: "get_impact", label: `get_impact("${selectedPath.split("/").pop()}")` },
    { id: "find_usages", label: `find_usages("${mcpQuery}")` },
    { id: "search_files", label: `search_files("${mcpQuery}")` },
    { id: "search_memory", label: "search_memory()", badge: "ADR/SQL" },
    { id: "get_federation", label: "get_federation()", badge: "OpenAPI/gRPC" },
    { id: "get_trace_overlay", label: "get_trace_overlay()", badge: "OTLP" },
    { id: "simulate_change", label: "simulate_change()", badge: "Overlay" },
    { id: "generate_fix_patch", label: "generate_fix_patch()", badge: "Diff" },
    { id: "run_safe_code_loop", label: "run_safe_code_loop()", badge: "Loop" },
  ];

  return (
    <div className="space-y-16">
      {/* PART 1: Sticky Scroll-Storytelling Architecture Pipeline */}
      <div className="grid gap-8 lg:grid-cols-[0.92fr_1.08fr] lg:items-start">
        <div className="lg:sticky lg:top-24 space-y-5">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.22em] text-primary">
            <Cpu className="size-3.5" /> A live map of this site
          </div>
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Every change starts somewhere.{" "}
            <span className="text-gradient">See everything that depends on it.</span>
          </h2>
          <p className="text-muted-foreground text-sm leading-relaxed sm:text-base">
            Nykst reads the repository, follows every connection between files, links the database
            tables your code uses, and shows what a change will touch before you or your coding
            assistant make it.
          </p>

          {/* Active Layer Spotlight Card */}
          <TiltCard className="border-primary/35 bg-card/90 rounded-2xl border p-5 shadow-2xl">
            <div className="flex items-center justify-between gap-2">
              <span className="text-primary font-mono text-[10px] uppercase tracking-[0.24em]">
                STAGE {ARCHITECTURE_LAYERS[activeLayer]!.step} · ACTIVE SPEC
              </span>
              <button
                onClick={() => {
                  setActiveTab("blast");
                  void inspectFile(ARCHITECTURE_LAYERS[activeLayer]!.proofFile);
                }}
                className="text-primary hover:underline font-mono text-[11px] flex items-center gap-1"
              >
                Inspect {ARCHITECTURE_LAYERS[activeLayer]!.proofFile.split("/").pop()} →
              </button>
            </div>
            <h3 className="mt-2 text-lg font-semibold">
              <ScrambleText text={ARCHITECTURE_LAYERS[activeLayer]!.name} />
            </h3>
            <p className="text-primary/80 mt-1 font-mono text-[11px]">
              {ARCHITECTURE_LAYERS[activeLayer]!.metric}
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-red-500/25 bg-red-500/5 p-3">
                <p className="font-mono text-[10px] uppercase tracking-wider text-red-300">
                  ✗ Without Structural Graph
                </p>
                <p className="text-muted-foreground mt-1 text-xs leading-relaxed">
                  {ARCHITECTURE_LAYERS[activeLayer]!.naiveFail}
                </p>
              </div>
              <div className="border-primary/30 bg-primary/10 rounded-xl border p-3">
                <p className="text-primary font-mono text-[10px] uppercase tracking-wider">
                  ✓ Nykst Verified Evidence
                </p>
                <p className="text-foreground/90 mt-1 text-xs leading-relaxed">
                  {ARCHITECTURE_LAYERS[activeLayer]!.nykstTruth}
                </p>
              </div>
            </div>
          </TiltCard>

          {/* Live Self-Analysis Proof Bar */}
          <div className="border-border bg-surface/70 flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 font-mono text-[11px]">
            <span className="flex items-center gap-2">
              <span className="bg-primary glow-ring size-2 rounded-full" />
              <span>
                Compiler run: <strong>{stats.durationMs}ms</strong> · {stats.analyzedFiles} AST
                files · {stats.internalEdges} edges
              </span>
            </span>
            <button
              onClick={() => void inspectFile(selectedPath, true)}
              disabled={loadingTarget}
              className="text-primary hover:underline inline-flex items-center gap-1"
            >
              <RefreshCw className={cn("size-3", loadingTarget && "animate-spin")} />
              Re-compile live AST
            </button>
          </div>
        </div>

        {/* Right: Interactive 6-Stage Pipeline Cards */}
        <div className="space-y-3">
          {ARCHITECTURE_LAYERS.map((layer, index) => {
            const active = index === activeLayer;
            return (
              <div
                key={layer.step}
                onMouseEnter={() => setActiveLayer(index)}
                onClick={() => setActiveLayer(index)}
                className={cn(
                  "cursor-pointer rounded-2xl border p-5 transition-all duration-300",
                  active
                    ? "border-primary/60 bg-primary/10 shadow-lg shadow-primary/10 translate-x-1"
                    : "border-border bg-card/60 hover:border-primary/30 hover:bg-card/90",
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span
                      className={cn(
                        "flex size-8 shrink-0 items-center justify-center rounded-lg border font-mono text-xs font-bold",
                        active
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-surface text-muted-foreground",
                      )}
                    >
                      {layer.step}
                    </span>
                    <div>
                      <h3 className="text-sm font-semibold sm:text-base">{layer.name}</h3>
                      <p className="text-muted-foreground font-mono text-[11px]">{layer.metric}</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenCode?.({
                        repository: data.repository,
                        path: layer.proofFile,
                        line: 1,
                        label: layer.name,
                        reason: layer.nykstTruth,
                      });
                    }}
                    className="border-border bg-surface text-muted-foreground hover:border-primary/40 hover:text-primary hidden rounded-md border px-2 py-0.5 font-mono text-[10px] transition-colors sm:inline"
                  >
                    {layer.proofFile}:1
                  </button>
                </div>
                <p className="text-muted-foreground mt-3 text-xs leading-relaxed">
                  {layer.nykstTruth}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      {/* PART 2: Live Interactive AST & Blast-Radius Workbench */}
      <div
        id="live-workbench"
        className="border-primary/30 bg-card/95 relative overflow-hidden rounded-3xl border p-5 shadow-2xl sm:p-8"
      >
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-5">
          <div>
            <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.24em] text-primary">
              <Activity className="size-3.5" /> Live AST & Blast-Radius Workbench
            </div>
            <h3 className="mt-1 text-xl font-semibold tracking-tight sm:text-2xl">
              Inspect{" "}
              <code className="text-primary font-mono text-base sm:text-lg">{data.repository}</code>{" "}
              in real time
            </h3>
            <p className="text-muted-foreground mt-1 text-xs sm:text-sm">
              Every node, import line, SQL resource, and MCP tool payload below is computed live by{" "}
              <code className="font-mono text-foreground">analyzeRepository()</code>. Click any{" "}
              <code className="text-primary font-mono">file:line</code> badge to inspect the exact
              source code.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-border bg-surface p-1">
            {(
              [
                { id: "blast", label: "Blast Radius & Importers", icon: Zap },
                {
                  id: "sql",
                  label: `SQL & Services (${resources.length + services.length})`,
                  icon: Database,
                },
                { id: "mcp", label: "11-Tool MCP Runner", icon: Terminal },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                data-testid={`workbench-tab-${tab.id}`}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors",
                  activeTab === tab.id
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <tab.icon className="size-3.5" />
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {activeTab === "blast" && (
          <div className="mt-6 grid gap-6 lg:grid-cols-[0.42fr_0.58fr]">
            {/* Left: Most Depended-On AST Hubs */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground font-mono text-[11px] uppercase tracking-wider">
                  Highest-impact AST hubs (click to trace)
                </span>
                <span className="text-primary font-mono text-[11px]">
                  {topHubs.length} ranked hubs
                </span>
              </div>
              <div className="max-h-[460px] space-y-2 overflow-y-auto pr-1">
                {topHubs.map((hub) => {
                  const isSelected = hub.path === selectedTarget.path;
                  return (
                    <button
                      key={hub.path}
                      onClick={() => void inspectFile(hub.path)}
                      className={cn(
                        "w-full rounded-xl border p-3 text-left transition-all",
                        isSelected
                          ? "border-primary bg-primary/15 shadow-md"
                          : "border-border bg-surface/70 hover:border-primary/40 hover:bg-surface",
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate font-mono text-xs font-semibold text-foreground">
                          {hub.path}
                        </span>
                        <span
                          className={cn(
                            "shrink-0 rounded-full border px-2 py-0.5 font-mono text-[10px]",
                            isSelected
                              ? "border-primary/50 bg-primary/20 text-primary"
                              : "border-border bg-card text-muted-foreground",
                          )}
                        >
                          {hub.importers} importers
                        </span>
                      </div>
                      <div className="text-muted-foreground mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[10px]">
                        <span>{hub.role}</span>
                        <span>·</span>
                        <span>{hub.loc} LOC</span>
                        {hub.services.length > 0 && (
                          <>
                            <span>·</span>
                            <span className="text-primary">{hub.services.join(", ")}</span>
                          </>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Right: Live Reverse-Reachability Blast Envelope */}
            <div className="border-border bg-surface/60 flex flex-col justify-between rounded-2xl border p-5">
              <div>
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-4">
                  <div>
                    <span className="text-primary font-mono text-[10px] uppercase tracking-[0.2em]">
                      Selected AST Target
                    </span>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <h4 className="font-mono text-base font-bold sm:text-lg">
                        {selectedTarget.path}
                      </h4>
                      <button
                        type="button"
                        onClick={() =>
                          onOpenCode?.({
                            repository: data.repository,
                            path: selectedTarget.path,
                            line: 1,
                            label: selectedTarget.path,
                            reason: `Source file (${selectedTarget.file?.loc ?? 0} LOC · ${impact.direct_importers.length} direct importers)`,
                          })
                        }
                        className="border-primary/40 bg-primary/10 text-primary hover:bg-primary/20 rounded-md border px-2 py-0.5 font-mono text-[10px] font-semibold transition-colors"
                      >
                        Open source →
                      </button>
                    </div>
                    {selectedTarget.file && (
                      <p className="text-muted-foreground mt-1 font-mono text-[11px]">
                        Role: {selectedTarget.file.role} · {selectedTarget.file.loc} LOC · Exports:{" "}
                        {selectedTarget.file.exports.slice(0, 5).join(", ") || "none"}
                      </p>
                    )}
                  </div>
                  <span
                    className={cn(
                      "rounded-full border px-3 py-1 font-mono text-xs font-semibold uppercase",
                      levelColor,
                    )}
                  >
                    {impact.level} Blast Radius
                  </span>
                </div>

                {/* Blast Radius Counters */}
                <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                  <div className="border-border bg-card/80 rounded-xl border p-3">
                    <p className="text-xl font-bold">{impact.direct_importers.length}</p>
                    <p className="text-muted-foreground font-mono text-[10px] uppercase">
                      Direct Importers
                    </p>
                  </div>
                  <div className="border-border bg-card/80 rounded-xl border p-3">
                    <p className="text-xl font-bold">
                      {impact.runtime_dependents + impact.type_only_dependents}
                    </p>
                    <p className="text-muted-foreground font-mono text-[10px] uppercase">
                      Transitive Reach
                    </p>
                  </div>
                  <div className="border-border bg-card/80 rounded-xl border p-3">
                    <p className="text-primary text-xl font-bold">{impact.entrypoints.length}</p>
                    <p className="text-muted-foreground font-mono text-[10px] uppercase">
                      Routes & APIs Hit
                    </p>
                  </div>
                  <div className="border-border bg-card/80 rounded-xl border p-3">
                    <p className="text-emerald-300 text-xl font-bold">
                      {impact.tests_that_cover_it.length}
                    </p>
                    <p className="text-muted-foreground font-mono text-[10px] uppercase">
                      Covering Tests
                    </p>
                  </div>
                </div>

                {/* Affected Entrypoints & Import Chains */}
                <div className="mt-5 space-y-3">
                  <p className="text-muted-foreground font-mono text-[10px] uppercase tracking-[0.18em]">
                    Affected Page Routes & API Endpoints (Click to inspect source)
                  </p>
                  {impact.entrypoints.length > 0 ? (
                    <div className="max-h-44 space-y-1.5 overflow-y-auto pr-1">
                      {impact.entrypoints.slice(0, 8).map((ep) => (
                        <button
                          key={ep.path}
                          type="button"
                          onClick={() =>
                            onOpenCode?.({
                              repository: data.repository,
                              path: ep.path,
                              line: 1,
                              label: `${ep.role.toUpperCase()} entrypoint`,
                              reason: `Entrypoint reached via: ${ep.chain.join(" → ")}`,
                            })
                          }
                          className="border-border bg-card/70 hover:border-primary/40 block w-full rounded-lg border px-3 py-2 text-left font-mono text-[11px] transition-colors"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-foreground font-semibold">{ep.path}</span>
                            <span className="text-primary text-[10px] uppercase">{ep.role}</span>
                          </div>
                          <p className="text-muted-foreground mt-1 truncate text-[10px]">
                            Chain: {ep.chain.join(" → ")}
                          </p>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="text-muted-foreground rounded-lg border border-dashed border-border p-3 text-xs">
                      No route or API entrypoints transitively import this file.
                    </p>
                  )}
                </div>

                {/* Direct Importers with Line Numbers */}
                <div className="mt-4 space-y-2">
                  <p className="text-muted-foreground font-mono text-[10px] uppercase tracking-[0.18em]">
                    Direct Importers (Click file:line to open exact import statement)
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {impact.direct_importers.slice(0, 10).map((d) => (
                      <button
                        key={`${d.path}:${d.line}`}
                        data-testid="impact-teleport-row"
                        data-path={d.path}
                        data-line={d.line}
                        onClick={() => {
                          onOpenCode?.({
                            repository: data.repository,
                            path: d.path,
                            line: d.line,
                            label: `imports ${selectedTarget.path}`,
                            reason: `Direct importer of ${selectedTarget.path} at line ${d.line}.`,
                          });
                        }}
                        className="border-border bg-card hover:border-primary/50 rounded-lg border px-2.5 py-1 font-mono text-[11px] transition-colors"
                      >
                        {d.path}
                        <span className="text-primary">:{d.line}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
                <span className="text-muted-foreground font-mono text-[10px]">
                  Covering tests:{" "}
                  {impact.tests_that_cover_it.length > 0
                    ? impact.tests_that_cover_it.join(", ")
                    : "none detected"}
                </span>
                <Link
                  to="/graph"
                  className="bg-primary text-primary-foreground hover:bg-primary-glow inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-semibold transition-colors"
                >
                  Open full 6-level navigator <ArrowRight className="size-3.5" />
                </Link>
              </div>
            </div>
          </div>
        )}

        {activeTab === "sql" && (
          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            {/* SQL Tables & RPCs */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-primary font-mono text-[11px] uppercase tracking-wider">
                  SQL Schema & Data Resources ({resources.length})
                </span>
                <span className="text-muted-foreground font-mono text-[10px]">
                  Parsed from migrations/*.sql & .from() calls
                </span>
              </div>
              <div className="max-h-[420px] space-y-2.5 overflow-y-auto pr-1">
                {resources.map((res) => (
                  <div
                    key={res.id}
                    className="border-border bg-surface/70 rounded-xl border p-3.5 text-xs"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono font-semibold text-foreground">
                        {res.kind.toUpperCase()}: <span className="text-primary">{res.name}</span>
                      </span>
                      <span className="border-primary/30 bg-primary/10 text-primary rounded-full border px-2 py-0.5 font-mono text-[10px]">
                        {res.usageCount} call sites
                      </span>
                    </div>
                    {res.definedIn.length > 0 && (
                      <div className="mt-1 flex flex-wrap items-center gap-1.5 font-mono text-[10px]">
                        <span className="text-muted-foreground">DDL:</span>
                        {res.definedIn.map((ddlPath) => (
                          <button
                            key={ddlPath}
                            type="button"
                            onClick={() =>
                              onOpenCode?.({
                                repository: data.repository,
                                path: ddlPath,
                                line: 1,
                                label: `DDL for ${res.name}`,
                                reason: `Migration defining ${res.kind} ${res.name}`,
                              })
                            }
                            className="text-primary hover:underline"
                          >
                            {ddlPath}
                          </button>
                        ))}
                      </div>
                    )}
                    {res.columns?.length ? (
                      <p className="text-muted-foreground mt-1 font-mono text-[10px]">
                        {res.columns
                          .slice(0, 8)
                          .map((column) => `${column.name}:${column.type}`)
                          .join(" · ")}
                        {res.columns.length > 8 ? ` +${res.columns.length - 8}` : ""}
                      </p>
                    ) : null}
                    {res.columnDrift?.length ? (
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[10px] text-amber-300">
                        <span>Contract drift:</span>
                        {res.columnDrift.slice(0, 4).map((finding) => {
                          const first = finding.references[0];
                          return (
                            <button
                              key={`${finding.kind}-${finding.column}`}
                              onClick={() =>
                                first &&
                                onOpenCode?.({
                                  repository: data.repository,
                                  path: first.path,
                                  line: first.line,
                                  label: `${res.name}.${finding.column}`,
                                  reason: finding.message,
                                })
                              }
                              className="border-amber-500/40 bg-amber-500/10 hover:border-amber-400 rounded border px-1.5 py-0.5 font-mono transition-colors"
                            >
                              {finding.column}
                              {first ? `:${first.line}` : ""}
                            </button>
                          );
                        })}
                      </div>
                    ) : null}
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {res.files.map((f) => (
                        <button
                          key={f}
                          onClick={() => {
                            onOpenCode?.({
                              repository: data.repository,
                              path: f,
                              line: 1,
                              label: `Uses ${res.name}`,
                              reason: `Client call site reading or writing ${res.kind} ${res.name}`,
                            });
                          }}
                          className="border-border bg-card hover:border-primary/40 rounded-md border px-2 py-0.5 font-mono text-[10px]"
                        >
                          {f}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* External Services & SDK Evidence */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-primary font-mono text-[11px] uppercase tracking-wider">
                  Detected External Services ({services.length})
                </span>
                <span className="text-muted-foreground font-mono text-[10px]">
                  Verified from packages, API hosts & env vars
                </span>
              </div>
              <div className="max-h-[420px] space-y-2.5 overflow-y-auto pr-1">
                {services.map((svc) => (
                  <div
                    key={svc.id}
                    className="border-border bg-surface/70 rounded-xl border p-3.5 text-xs"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <span className="font-semibold text-foreground">{svc.name}</span>
                        <span className="text-muted-foreground ml-2 font-mono text-[10px] uppercase">
                          {svc.category}
                        </span>
                      </div>
                      <span className="text-muted-foreground font-mono text-[10px]">
                        {svc.fileCount} files
                      </span>
                    </div>
                    {svc.envVars.length > 0 && (
                      <p className="text-primary/90 mt-1.5 font-mono text-[10px]">
                        Env: {svc.envVars.join(", ")}
                      </p>
                    )}
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {svc.evidence.map((ev, i) => (
                        <button
                          key={`${ev.path}-${i}`}
                          type="button"
                          onClick={() =>
                            onOpenCode?.({
                              repository: data.repository,
                              path: ev.path,
                              line: ev.line ?? 1,
                              label: `${svc.name} (${ev.reason})`,
                              reason: `${svc.name} evidence in ${ev.path}${ev.line ? `:${ev.line}` : ""}: ${ev.reason}`,
                            })
                          }
                          className="border-border bg-card hover:border-primary/40 rounded-md border px-2 py-0.5 text-left font-mono text-[10px] transition-colors"
                        >
                          <span className="text-foreground">{ev.path}</span>
                          {ev.line ? <span className="text-primary">:{ev.line}</span> : ""}{" "}
                          <span className="text-muted-foreground">({ev.reason})</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === "mcp" && (
          <div className="mt-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap gap-1.5">
                {ALL_MCP_TOOLS.map((t) => (
                  <button
                    key={t.id}
                    data-testid={`mcp-tool-${t.id}`}
                    onClick={() => void runLiveMcpTool(t.id)}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 font-mono text-[11px] transition-colors",
                      mcpTool === t.id
                        ? "border-primary bg-primary/15 text-primary font-semibold"
                        : "border-border bg-surface text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <span>{t.label}</span>
                    {t.badge && (
                      <span className="border-primary/30 bg-primary/10 text-primary rounded px-1 py-0.2 text-[9px] uppercase">
                        {t.badge}
                      </span>
                    )}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <input
                  data-testid="mcp-query-input"
                  value={mcpQuery}
                  onChange={(e) => setMcpQuery(e.target.value)}
                  placeholder="Table, symbol, or ADR query…"
                  className="border-border bg-surface rounded-lg border px-3 py-1.5 font-mono text-xs outline-none focus:border-primary"
                />
                <button
                  data-testid="mcp-execute-button"
                  onClick={() => void runLiveMcpTool(mcpTool, mcpQuery)}
                  disabled={loadingMcp}
                  className="bg-primary text-primary-foreground rounded-lg px-3 py-1.5 font-mono text-xs font-semibold"
                >
                  {loadingMcp ? "Running…" : "Execute"}
                </button>
              </div>
            </div>

            {(mcpTool === "simulate_change" ||
              mcpTool === "generate_fix_patch" ||
              mcpTool === "run_safe_code_loop") && (
              <div
                data-testid="mcp-simulate-overlay-panel"
                className="border-border bg-surface/70 rounded-xl border p-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-primary font-mono text-[10px] uppercase tracking-wider">
                    {mcpTool === "simulate_change"
                      ? `In-Memory Overlay Buffer for ${selectedPath} (nothing written to disk)`
                      : mcpTool === "run_safe_code_loop"
                        ? `Safe-code loop buffer for ${selectedPath} (nothing written to disk)`
                        : `Machine-Verified Remediation Buffer for ${selectedPath} (in-memory diff generator)`}
                  </span>
                  <button
                    type="button"
                    data-testid="mcp-run-overlay-button"
                    onClick={() => void runLiveMcpTool(mcpTool)}
                    className="border-primary/40 bg-primary/10 text-primary hover:bg-primary/20 rounded-md border px-2.5 py-1 font-mono text-[10px] font-semibold"
                  >
                    Run {mcpTool} →
                  </button>
                </div>
                <textarea
                  data-testid="mcp-simulate-textarea"
                  value={simContent}
                  onChange={(e) => setSimContent(e.target.value)}
                  rows={3}
                  className="border-border bg-card mt-2 w-full rounded-lg border p-2.5 font-mono text-[11px] outline-none focus:border-primary"
                />
              </div>
            )}

            {mcpTool === "get_trace_overlay" && (
              <TraceOverlayPanel result={mcpResult} testId="mcp-trace-overlay-panel" />
            )}
            {mcpTool === "get_federation" && (
              <FederationPanel result={mcpResult} testId="mcp-federation-panel" />
            )}

            <div className="border-border bg-surface/90 max-h-[420px] overflow-auto rounded-2xl border p-4 font-mono text-[11px] leading-relaxed">
              <pre data-testid="mcp-output-pre" className="text-foreground">
                {mcpResult
                  ? JSON.stringify(mcpResult, null, 2)
                  : `Select any of the ${MCP_TOOLS.length} read-only MCP tools above to inspect the live JSON-RPC payload returned to Claude Code, Cursor, or Codex.`}
              </pre>
            </div>
          </div>
        )}
      </div>

      <SafeCodeLoopEngine
        repository={repoParam}
        path={selectedPath}
        {...(onOpenCode ? { onOpenCode } : {})}
        {...(onLoopVerdict ? { onVerdict: onLoopVerdict } : {})}
      />
    </div>
  );
}
