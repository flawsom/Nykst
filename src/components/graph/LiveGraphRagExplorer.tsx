import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Cpu,
  Database,
  FileCode2,
  GitBranch,
  Layers,
  Network,
  RefreshCw,
  Search,
  Server,
  ShieldCheck,
  Sparkles,
  Terminal,
  Zap,
} from "lucide-react";
import { TiltCard, ScrambleText } from "@/components/motion/VariantMotion";
import { cn } from "@/lib/utils";

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
};

const ARCHITECTURE_LAYERS = [
  {
    step: "01",
    name: "Deterministic TypeScript AST Compiler",
    metric: "ts.createSourceFile · tsconfig alias & workspace resolver",
    wrapperFail:
      "Flat RAG wrappers split files every ~500 tokens, severing class methods from imports and hallucinating cross-file references.",
    nykstTruth:
      "Nykst parses 100% of JS/TS/TSX files into an exact syntax tree, resolving path aliases, monorepo exports, runtime vs type-only imports, and line numbers.",
    proofFile: "src/lib/analysis/engine.server.ts",
  },
  {
    step: "02",
    name: "Tarjan SCC Cycle & Dependency Topology",
    metric: "Iterative Tarjan strongly-connected components + 6-level trie",
    wrapperFail:
      "Vector similarity cannot detect circular runtime imports or distinguish a leaf UI component from a core authentication hub.",
    nykstTruth:
      "Builds a 6-level navigable hierarchy (Organization → Domain → Capability → Service → Module → File) and flags circular runtime loops automatically.",
    proofFile: "src/lib/analysis/graph.ts",
  },
  {
    step: "03",
    name: "Reverse BFS Blast-Radius Reachability",
    metric: "Exact line-level importer chains → API & route entrypoints",
    wrapperFail:
      "LLM wrappers guess what might break based on naming similarity, missing transitive callers 4 hops away.",
    nykstTruth:
      "Computes breadth-first reverse reachability from any seed file or SQL table to every affected route, API endpoint, and covering test.",
    proofFile: "src/lib/analysis/impact.ts",
  },
  {
    step: "04",
    name: "SQL Migration & External Service Evidence",
    metric: "DDL parser + PostgREST/Prisma call-site linker",
    wrapperFail:
      "Standard code indexers treat SQL migrations, environment variables, and SDK calls as opaque strings.",
    nykstTruth:
      "Links CREATE TABLE / FUNCTION statements in supabase/migrations/*.sql directly to .from() and .rpc() call sites with exact file:line citations.",
    proofFile: "src/lib/analysis/catalog.ts",
  },
  {
    step: "05",
    name: "6-Layer Outcome-Weighted Architectural Memory",
    metric: "Outcome · Failure · Decision · Incident · Convention · Continuity",
    wrapperFail:
      "Stateless chat wrappers forget why a pattern was reverted last month and suggest the exact same anti-pattern again.",
    nykstTruth:
      "Preserves temporal co-change coupling, PR outcomes, and incident playbooks tied directly to the graph nodes they govern.",
    proofFile: "src/lib/before-you-act.ts",
  },
  {
    step: "06",
    name: "Streamable HTTP MCP Server for Coding Agents",
    metric: "5 readOnlyHint MCP tools · SHA-256 nyk_ tokens",
    wrapperFail:
      "IDE agents edit blind, burning context tokens grepping hundreds of files before making a breaking change.",
    nykstTruth:
      "Claude Code, Cursor, VS Code, Windsurf, and Codex call get_impact and find_usages over /api/mcp in <50ms before touching a line of code.",
    proofFile: "src/lib/mcp.server.ts",
  },
];

export function LiveGraphRagExplorer({
  initialData,
  onDataUpdate,
}: {
  initialData: LiveSelfAnalysis | null;
  onDataUpdate?: (data: LiveSelfAnalysis) => void;
}) {
  const [data, setData] = useState<LiveSelfAnalysis | null>(initialData);
  const [selectedPath, setSelectedPath] = useState("src/lib/integrations/github.ts");
  const [activeLayer, setActiveLayer] = useState(0);
  const [activeTab, setActiveTab] = useState<"blast" | "sql" | "mcp">("blast");
  const [mcpTool, setMcpTool] = useState<
    "get_impact" | "get_architecture" | "find_usages" | "search_files"
  >("get_impact");
  const [mcpQuery, setMcpQuery] = useState("repository_ingestions");
  const [mcpResult, setMcpResult] = useState<unknown>(null);
  const [loadingTarget, setLoadingTarget] = useState(false);
  const [loadingMcp, setLoadingMcp] = useState(false);

  useEffect(() => {
    if (initialData) {
      setData(initialData);
      setSelectedPath(initialData.selectedTarget.path);
    }
  }, [initialData]);

  const inspectFile = async (path: string, forceRefresh = false) => {
    setSelectedPath(path);
    setLoadingTarget(true);
    try {
      const res = await fetch(
        `/api/analysis/self?path=${encodeURIComponent(path)}${forceRefresh ? "&refresh=1" : ""}`,
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

  const runLiveMcpTool = async (
    toolName: "get_impact" | "get_architecture" | "find_usages" | "search_files",
    queryOverride?: string,
  ) => {
    setMcpTool(toolName);
    setLoadingMcp(true);
    try {
      const q = queryOverride ?? mcpQuery;
      const res = await fetch(
        `/api/analysis/self?path=${encodeURIComponent(selectedPath)}&tool=${encodeURIComponent(toolName)}&query=${encodeURIComponent(q)}`,
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
          Executing TypeScript AST compiler over live repository…
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

  return (
    <div className="space-y-16">
      {/* PART 1: Sticky Scroll-Storytelling Architecture Pipeline & Wrapper vs Graph-RAG Matrix */}
      <div className="grid gap-8 lg:grid-cols-[0.92fr_1.08fr] lg:items-start">
        <div className="lg:sticky lg:top-24 space-y-5">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.22em] text-primary">
            <Cpu className="size-3.5" /> Deterministic Graph-RAG Engine
          </div>
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            We are not an LLM wrapper.{" "}
            <span className="text-gradient">We are the RAG architecture itself.</span>
          </h2>
          <p className="text-muted-foreground text-sm leading-relaxed sm:text-base">
            Every code-chat wrapper on the market chunks your files into flat 500-token vectors,
            runs cosine similarity, and hopes an LLM can guess your architecture. Nykst compiles the
            repository into a deterministic AST, resolves every alias and SQL table, computes Tarjan
            strongly-connected components, and traces exact blast radius before any model is
            invoked.
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
                  ✗ Flat Vector Wrapper
                </p>
                <p className="text-muted-foreground mt-1 text-xs leading-relaxed">
                  {ARCHITECTURE_LAYERS[activeLayer]!.wrapperFail}
                </p>
              </div>
              <div className="border-primary/30 bg-primary/10 rounded-xl border p-3">
                <p className="text-primary font-mono text-[10px] uppercase tracking-wider">
                  ✓ Nykst Graph-RAG Truth
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
                  <span className="border-border bg-surface text-muted-foreground hidden rounded-md border px-2 py-0.5 font-mono text-[10px] sm:inline">
                    {layer.proofFile}
                  </span>
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
        className="border-primary/30 bg-card/85 relative overflow-hidden rounded-3xl border p-5 shadow-2xl backdrop-blur sm:p-8"
      >
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-5">
          <div>
            <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.24em] text-primary">
              <Activity className="size-3.5" /> Live AST & Blast-Radius Workbench · Zero Mock Data
            </div>
            <h3 className="mt-1 text-xl font-semibold tracking-tight sm:text-2xl">
              Inspect{" "}
              <code className="text-primary font-mono text-base sm:text-lg">{data.repository}</code>{" "}
              in real time
            </h3>
            <p className="text-muted-foreground mt-1 text-xs sm:text-sm">
              Every node, import line, SQL resource, and MCP tool payload below is computed live by{" "}
              <code className="font-mono text-foreground">analyzeRepository()</code> on this server.
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
                { id: "mcp", label: "Live MCP Tool Runner", icon: Terminal },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
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
                  Most depended-on files (click to trace)
                </span>
                <span className="text-primary font-mono text-[11px]">
                  {topHubs.length} core hubs
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
                    <h4 className="mt-1 font-mono text-base font-bold sm:text-lg">
                      {selectedTarget.path}
                    </h4>
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
                    Affected Page Routes & API Endpoints (Reverse Import Chains)
                  </p>
                  {impact.entrypoints.length > 0 ? (
                    <div className="max-h-44 space-y-1.5 overflow-y-auto pr-1">
                      {impact.entrypoints.slice(0, 8).map((ep) => (
                        <div
                          key={ep.path}
                          className="border-border bg-card/70 rounded-lg border px-3 py-2 font-mono text-[11px]"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-foreground font-semibold">{ep.path}</span>
                            <span className="text-primary text-[10px] uppercase">{ep.role}</span>
                          </div>
                          <p className="text-muted-foreground mt-1 truncate text-[10px]">
                            Chain: {ep.chain.join(" → ")}
                          </p>
                        </div>
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
                    Direct Importers (Exact File & Line Citations)
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {impact.direct_importers.slice(0, 10).map((d) => (
                      <button
                        key={`${d.path}:${d.line}`}
                        onClick={() => void inspectFile(d.path)}
                        className="border-border bg-card hover:border-primary/40 rounded-lg border px-2.5 py-1 font-mono text-[11px] transition-colors"
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
                  Parsed from supabase/migrations/*.sql & .from() calls
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
                      <p className="text-muted-foreground mt-1 font-mono text-[10px]">
                        DDL: {res.definedIn.join(", ")}
                      </p>
                    )}
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {res.files.map((f) => (
                        <button
                          key={f}
                          onClick={() => {
                            setActiveTab("blast");
                            void inspectFile(f);
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
                    <div className="mt-2 space-y-1">
                      {svc.evidence.map((ev, i) => (
                        <div
                          key={`${ev.path}-${i}`}
                          className="text-muted-foreground font-mono text-[10px]"
                        >
                          <span className="text-foreground">{ev.path}</span>
                          {ev.line ? `:${ev.line}` : ""}: {ev.reason}
                        </div>
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
              <div className="flex flex-wrap gap-2">
                {(
                  [
                    { id: "get_impact", label: `get_impact("${selectedPath.split("/").pop()}")` },
                    { id: "get_architecture", label: "get_architecture()" },
                    { id: "find_usages", label: `find_usages(table: "${mcpQuery}")` },
                    { id: "search_files", label: `search_files(query: "${mcpQuery}")` },
                  ] as const
                ).map((t) => (
                  <button
                    key={t.id}
                    onClick={() => void runLiveMcpTool(t.id)}
                    className={cn(
                      "rounded-lg border px-3 py-1.5 font-mono text-xs transition-colors",
                      mcpTool === t.id
                        ? "border-primary bg-primary/15 text-primary font-semibold"
                        : "border-border bg-surface text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <input
                  value={mcpQuery}
                  onChange={(e) => setMcpQuery(e.target.value)}
                  placeholder="Table or symbol name…"
                  className="border-border bg-surface rounded-lg border px-3 py-1.5 font-mono text-xs outline-none focus:border-primary"
                />
                <button
                  onClick={() => void runLiveMcpTool(mcpTool, mcpQuery)}
                  disabled={loadingMcp}
                  className="bg-primary text-primary-foreground rounded-lg px-3 py-1.5 font-mono text-xs font-semibold"
                >
                  {loadingMcp ? "Running…" : "Execute"}
                </button>
              </div>
            </div>

            <div className="border-border bg-surface/90 max-h-[420px] overflow-auto rounded-2xl border p-4 font-mono text-[11px] leading-relaxed">
              <pre className="text-foreground">
                {mcpResult
                  ? JSON.stringify(mcpResult, null, 2)
                  : "Select a read-only MCP tool above to inspect the live JSON-RPC payload returned to Claude Code, Cursor, or Codex."}
              </pre>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
