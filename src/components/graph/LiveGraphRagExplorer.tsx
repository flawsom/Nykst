import { useCallback, useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  Activity,
  ArrowRight,
  Database,
  RefreshCw,
  Terminal,
  Zap,
  Wrench,
  Radio,
} from "lucide-react";
import { FederationPanel, TraceOverlayPanel } from "@/components/mcp/ToolInsightPanel";
import { fetchWithTimeout, readableRequestError } from "@/lib/fetch-with-timeout";
import { SafeCodeLoopEngine } from "@/components/graph/SafeCodeLoopEngine";
import { TOOLS as MCP_TOOLS } from "@/lib/mcp-guides";
import { cn } from "@/lib/utils";
import { SectionLabel } from "@/components/site/SectionLabel";
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
    name: "Reads your code",
    metric: "TypeScript, JavaScript, Python, Go and Rust · aliases and workspace packages resolved",
    naiveFail:
      "Lexical search and chunked text indexers split files arbitrarily, severing function signatures from imports and missing cross-file path aliases.",
    nykstTruth:
      "Parses JS/TS/TSX, Python, Go, and Rust sources into a unified dependency graph, resolving tsconfig aliases, workspace packages, exported symbol arity, and exact line numbers.",
    proofFile: "src/lib/analysis/engine.server.ts",
  },
  {
    step: "02",
    name: "Finds two-way connections",
    metric: "Circular links isolated from one-way imports · six-level map",
    naiveFail:
      "Text similarity cannot detect circular runtime imports or distinguish a leaf UI component from a high-fan-in authentication hub.",
    nykstTruth:
      "Builds a 6-level radial hierarchy (Organization → Domain → Capability → Service → Module → File) and isolates circular runtime loops from type-only imports.",
    proofFile: "src/lib/analysis/graph.ts",
  },
  {
    step: "03",
    name: "Follows every file that depends on a change",
    metric: "Exact file and line → the page or API endpoint it reaches",
    naiveFail:
      "Heuristic impact checks guess what might break from file names, missing transitive callers several hops away.",
    nykstTruth:
      "Computes breadth-first reverse reachability from any seed file or SQL table to every affected route, API endpoint, and covering test.",
    proofFile: "src/lib/analysis/impact.ts",
  },
  {
    step: "04",
    name: "Links database tables to the code that uses them",
    metric: "Migrations replayed in order · columns checked against the calls that read them",
    naiveFail:
      "Standard code indexers treat SQL migrations, environment variables, and SDK calls as unlinked strings.",
    nykstTruth:
      "Replays CREATE TABLE and ALTER TABLE migrations in order, linking columns directly to .from().select()/insert()/update() call sites and flagging column drift.",
    proofFile: "src/lib/analysis/sql.ts",
  },
  {
    step: "05",
    name: "Tries a change before you make it",
    metric: "Safe copy of the map + an exact fix when something breaks",
    naiveFail:
      "Agents edit files on disk first and discover broken imports or new cycles only after the build fails.",
    nykstTruth:
      "Overlays proposed writes or deletions on an in-memory graph clone and emits a unified remediation diff only when unresolved imports drop and cycles do not grow.",
    proofFile: "src/lib/analysis/simulate.ts",
  },
  {
    step: "06",
    name: `Connects to your coding assistant (${MCP_TOOLS.length} read-only tools)`,
    metric: `${MCP_TOOLS.length} read-only tools · trace overlay · API contracts`,
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
  loadError,
  onRetry,
}: {
  initialData: LiveSelfAnalysis | null;
  activeRepo?: string | null;
  onDataUpdate?: (data: LiveSelfAnalysis) => void;
  onOpenCode?: (target: CodeTarget) => void;
  onLoopVerdict?: (verdict: "safe" | "breaking" | "simulating") => void;
  loadError?: string | null;
  onRetry?: () => void;
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
  const [actionError, setActionError] = useState<string | null>(null);

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
    setActionError(null);
    try {
      const res = await fetchWithTimeout(
        `/api/analysis/self?repo=${encodeURIComponent(repoParam)}&path=${encodeURIComponent(path)}${forceRefresh ? "&refresh=1" : ""}`,
        { cache: "no-store" },
        15_000,
      );
      if (!res.ok) throw new Error(`Could not read that file (${res.status}).`);
      const next = (await res.json()) as LiveSelfAnalysis;
      setData(next);
      onDataUpdate?.(next);
    } catch (error) {
      setActionError(readableRequestError(error, "Could not refresh this file."));
    } finally {
      setLoadingTarget(false);
    }
  };

  const runLiveMcpTool = useCallback(
    async (toolName: McpToolName, queryOverride?: string) => {
      setMcpTool(toolName);
      setLoadingMcp(true);
      setActionError(null);
      try {
        const q = queryOverride ?? mcpQuery;
        if (
          toolName === "simulate_change" ||
          toolName === "generate_fix_patch" ||
          toolName === "run_safe_code_loop"
        ) {
          const res = await fetchWithTimeout(
            "/api/analysis/self",
            {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                repo: repoParam,
                path: selectedPath,
                tool: toolName,
                query: q,
                content: simContent,
              }),
            },
            15_000,
          );
          if (!res.ok) throw new Error(`The tool did not finish (${res.status}).`);
          const payload = (await res.json()) as { toolOutput?: unknown };
          setMcpResult(payload.toolOutput);
          return;
        }

        const res = await fetchWithTimeout(
          `/api/analysis/self?repo=${encodeURIComponent(repoParam)}&path=${encodeURIComponent(selectedPath)}&tool=${encodeURIComponent(toolName)}&query=${encodeURIComponent(q)}`,
          { cache: "no-store" },
          15_000,
        );
        if (!res.ok) throw new Error(`The tool did not finish (${res.status}).`);
        const next = (await res.json()) as LiveSelfAnalysis;
        setMcpResult(next.toolOutput);
      } catch (error) {
        setActionError(readableRequestError(error, "The live tool did not finish."));
      } finally {
        setLoadingMcp(false);
      }
    },
    [mcpQuery, repoParam, selectedPath, simContent],
  );

  useEffect(() => {
    if (activeTab === "mcp" && !mcpResult) {
      void runLiveMcpTool("get_impact");
    }
  }, [activeTab, mcpResult, runLiveMcpTool]);

  if (!data) {
    return (
      <div className="border-border bg-card/70 rounded-3xl border p-8 text-center">
        {loadError ? (
          <>
            <p className="text-sm font-semibold">The live workbench is not available yet.</p>
            <p className="text-muted-foreground mx-auto mt-2 max-w-md text-xs leading-relaxed">
              {loadError}
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {onRetry && (
                <button
                  type="button"
                  onClick={onRetry}
                  className="bg-primary text-primary-foreground inline-flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold"
                >
                  <RefreshCw className="size-3.5" /> Try the live view again
                </button>
              )}
              <Link
                to="/graph"
                className="border-border bg-surface hover:bg-surface-2 inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-xs font-semibold"
              >
                Open the full map <ArrowRight className="size-3.5" />
              </Link>
            </div>
            <p className="text-muted-foreground mt-3 text-[10px]">
              The saved map above is still real evidence from the last compiled repository.
            </p>
          </>
        ) : (
          <>
            <RefreshCw className="text-subtle-foreground mx-auto size-5 animate-spin" />
            <p className="text-sm font-semibold">Reading the live map</p>
            <p className="text-muted-foreground mx-auto mt-1 max-w-sm text-xs leading-relaxed">
              This usually takes a few seconds. The saved map above is already usable while the
              server reads the current files.
            </p>
          </>
        )}
      </div>
    );
  }

  const { selectedTarget, topHubs, resources, services, stats } = data;
  const impact = selectedTarget.briefing.impact;
  // Impact is a risk scale, not a rainbow. The word carries the level; the
  // border and tint only add urgency for the two serious cases.
  const levelColor =
    impact.level === "Critical"
      ? "border-risk/50 bg-risk/15 text-foreground"
      : impact.level === "High"
        ? "border-risk/30 bg-risk/[0.08] text-foreground"
        : impact.level === "Moderate"
          ? "border-border bg-surface-2 text-foreground"
          : "border-border bg-surface text-subtle-foreground";

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
      {actionError && (
        <p
          role="alert"
          className="border-risk/40 bg-risk/10 text-foreground rounded-xl border px-4 py-3 text-xs leading-relaxed"
        >
          {actionError}
        </p>
      )}
      {/* PART 1: Sticky Scroll-Storytelling Architecture Pipeline */}
      <div className="grid gap-8 lg:grid-cols-[0.92fr_1.08fr] lg:items-start">
        <div className="lg:sticky lg:top-24 space-y-5">
          <SectionLabel>A live map of this site</SectionLabel>
          <h2 className="font-display text-3xl leading-[1.08] tracking-tight sm:text-4xl">
            Every change starts somewhere. See everything that depends on it.
          </h2>
          <p className="text-muted-foreground text-sm leading-relaxed sm:text-base">
            Nykst reads the repository, follows every connection between files, links the database
            tables your code uses, and shows what a change will touch before you or your coding
            assistant make it.
          </p>

          {/* Active Layer Spotlight Card */}
          <div className="border-border bg-card/90 rounded-2xl border p-5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-subtle-foreground font-mono text-[10px] tracking-[0.24em] uppercase">
                STAGE {ARCHITECTURE_LAYERS[activeLayer]!.step} · ACTIVE SPEC
              </span>
              <button
                onClick={() => {
                  setActiveTab("blast");
                  void inspectFile(ARCHITECTURE_LAYERS[activeLayer]!.proofFile);
                }}
                className="text-foreground flex items-center gap-1 font-mono text-[11px] underline decoration-primary/55 decoration-1 underline-offset-4 hover:decoration-primary"
              >
                Inspect {ARCHITECTURE_LAYERS[activeLayer]!.proofFile.split("/").pop()} →
              </button>
            </div>
            <h3 className="mt-2 text-lg font-semibold">{ARCHITECTURE_LAYERS[activeLayer]!.name}</h3>
            <p className="text-subtle-foreground mt-1 font-mono text-[11px]">
              {ARCHITECTURE_LAYERS[activeLayer]!.metric}
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="border-risk/30 bg-risk/[0.07] rounded-xl border p-3">
                <p className="text-foreground font-mono text-[10px] tracking-wider uppercase">
                  ✗ Without Structural Graph
                </p>
                <p className="text-muted-foreground mt-1 text-xs leading-relaxed">
                  {ARCHITECTURE_LAYERS[activeLayer]!.naiveFail}
                </p>
              </div>
              <div className="border-border bg-surface/70 rounded-xl border p-3">
                <p className="text-foreground flex items-center gap-2 font-mono text-[10px] tracking-wider uppercase">
                  <span aria-hidden="true" className="bg-brand-ivory h-px w-3 shrink-0" />
                  Nykst verified evidence
                </p>
                <p className="text-foreground/90 mt-1 text-xs leading-relaxed">
                  {ARCHITECTURE_LAYERS[activeLayer]!.nykstTruth}
                </p>
              </div>
            </div>
          </div>

          {/* Live Self-Analysis Proof Bar */}
          <div className="border-border bg-surface/70 flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 font-mono text-[11px]">
            <span className="flex items-center gap-2">
              <span className="bg-brand-ivory size-2 rounded-full" />
              <span>
                Read in <strong>{stats.durationMs}ms</strong> · {stats.analyzedFiles} files ·{" "}
                {stats.internalEdges} connections
              </span>
            </span>
            <button
              onClick={() => void inspectFile(selectedPath, true)}
              disabled={loadingTarget}
              className="text-foreground inline-flex items-center gap-1 underline decoration-primary/55 decoration-1 underline-offset-4 hover:decoration-primary"
            >
              <RefreshCw className={cn("size-3", loadingTarget && "animate-spin")} />
              Read the code again
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
                    ? "border-primary/60 bg-primary/10 translate-x-1"
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
                    className="border-border bg-surface text-subtle-foreground hover:border-primary/40 hover:text-foreground hidden rounded-md border px-2 py-0.5 font-mono text-[10px] transition-colors sm:inline"
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
        className="border-border bg-card relative overflow-hidden rounded-3xl border p-5 sm:p-8"
      >
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-5">
          <div>
            <div className="text-subtle-foreground flex items-center gap-2 font-mono text-[10px] tracking-[0.24em] uppercase">
              <Activity className="size-3.5" /> See what a change would touch
            </div>
            <h3 className="mt-1 text-xl font-semibold tracking-tight sm:text-2xl">
              Inspect{" "}
              <code className="text-foreground font-mono text-base sm:text-lg">
                {data.repository}
              </code>{" "}
              in real time
            </h3>
            <p className="text-muted-foreground mt-1 text-xs sm:text-sm">
              Every node, import line, SQL resource, and MCP tool payload below is computed live by{" "}
              <code className="font-mono text-foreground">analyzeRepository()</code>. Click any{" "}
              <code className="text-foreground font-mono">file:line</code> badge to inspect the
              exact source code.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-border bg-surface p-1">
            {(
              [
                { id: "blast", label: "What a change touches", icon: Zap },
                {
                  id: "sql",
                  label: `SQL & Services (${resources.length + services.length})`,
                  icon: Database,
                },
                {
                  id: "mcp",
                  label: `MCP Runner (${MCP_TOOLS.length} read-only tools)`,
                  icon: Terminal,
                },
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
                  Files other code depends on most (click to trace)
                </span>
                <span className="text-foreground font-mono text-[11px]">
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
                          ? "border-primary bg-primary/15"
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
                              ? "border-primary/60 bg-primary/10 text-foreground"
                              : "border-border bg-card text-muted-foreground",
                          )}
                        >
                          {hub.importers} files use it
                        </span>
                      </div>
                      <div className="text-muted-foreground mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[10px]">
                        <span>{hub.role}</span>
                        <span>·</span>
                        <span>{hub.loc} lines</span>
                        {hub.services.length > 0 && (
                          <>
                            <span>·</span>
                            <span className="text-subtle-foreground">
                              {hub.services.join(", ")}
                            </span>
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
                    <span className="text-subtle-foreground font-mono text-[10px] tracking-[0.2em] uppercase">
                      Selected file
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
                            reason: `${selectedTarget.file?.loc ?? 0} lines · ${impact.direct_importers.length} files use it`,
                          })
                        }
                        className="border-border text-foreground hover:border-primary/45 hover:bg-surface/70 rounded-md border px-2 py-0.5 font-mono text-[10px] font-semibold transition-colors"
                      >
                        Open source →
                      </button>
                    </div>
                    {selectedTarget.file && (
                      <p className="text-muted-foreground mt-1 font-mono text-[11px]">
                        What it does: {selectedTarget.file.role} · {selectedTarget.file.loc} lines ·{" "}
                        Exports: {selectedTarget.file.exports.slice(0, 5).join(", ") || "none"}
                      </p>
                    )}
                  </div>
                  <span
                    className={cn(
                      "rounded-full border px-3 py-1 font-mono text-xs font-semibold uppercase",
                      levelColor,
                    )}
                  >
                    {impact.level} impact
                  </span>
                </div>

                {/* Blast Radius Counters */}
                <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                  <div className="border-border bg-card/80 rounded-xl border p-3">
                    <p className="text-xl font-bold">{impact.direct_importers.length}</p>
                    <p className="text-muted-foreground font-mono text-[10px] uppercase">
                      Files that use it
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
                    <p className="text-foreground text-xl font-bold">{impact.entrypoints.length}</p>
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
                            <span className="text-subtle-foreground text-[10px] uppercase">
                              {ep.role}
                            </span>
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
                    Files that use it (click a file and line to open the exact import)
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
                        <span className="text-subtle-foreground">:{d.line}</span>
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
                  Open the full map <ArrowRight className="size-3.5" />
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
                <span className="text-subtle-foreground font-mono text-[11px] tracking-wider uppercase">
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
                        {res.kind.toUpperCase()}:{" "}
                        <span className="text-foreground">{res.name}</span>
                      </span>
                      <span className="border-border text-subtle-foreground rounded-full border px-2 py-0.5 font-mono text-[10px]">
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
                            className="text-foreground underline decoration-primary/55 decoration-1 underline-offset-4 hover:decoration-primary"
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
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[10px] text-foreground">
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
                              className="border-risk/40 bg-risk/10 hover:border-risk/65 rounded border px-1.5 py-0.5 font-mono transition-colors"
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
                <span className="text-subtle-foreground font-mono text-[11px] tracking-wider uppercase">
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
                      <p className="text-subtle-foreground mt-1.5 font-mono text-[10px]">
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
                          {ev.line ? (
                            <span className="text-subtle-foreground">:{ev.line}</span>
                          ) : (
                            ""
                          )}{" "}
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
                        ? "border-primary bg-primary/10 text-foreground font-semibold"
                        : "border-border bg-surface text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <span>{t.label}</span>
                    {t.badge && (
                      <span className="border-border text-subtle-foreground rounded px-1 py-0.2 text-[9px] uppercase">
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
                  <span className="text-subtle-foreground font-mono text-[10px] tracking-wider uppercase">
                    {mcpTool === "simulate_change"
                      ? `Trying your change in a safe copy of ${selectedPath}. Nothing is written to your project.`
                      : mcpTool === "run_safe_code_loop"
                        ? `Trying your change safely in ${selectedPath}. Nothing is written to your project.`
                        : `Proposed patch for ${selectedPath}. Nothing is written to your project.`}
                  </span>
                  <button
                    type="button"
                    data-testid="mcp-run-overlay-button"
                    onClick={() => void runLiveMcpTool(mcpTool)}
                    className="border-border text-foreground hover:border-primary/45 hover:bg-surface/70 rounded-md border px-2.5 py-1 font-mono text-[10px] font-semibold"
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
