import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GraphCanvas } from "@/components/graph/GraphCanvas";
import { RepoSwitcherBar } from "@/components/graph/RepoSwitcherBar";
import { NodeDossier } from "@/components/graph/NodeDossier";
import { CodeProblemInspector, type CodeTarget } from "@/components/graph/CodeProblemInspector";
import { isSelfRepository } from "@/lib/code-links";
import { MentorPanel } from "@/components/graph/MentorPanel";
import { NodeInspector } from "@/components/graph/NodeInspector";
import { BeforeYouAct } from "@/components/graph/BeforeYouAct";
import { SafeCodeLoopEngine } from "@/components/graph/SafeCodeLoopEngine";
import { WebGLFieldCanvas } from "@/components/motion/WebGLFieldCanvas";
import { ConnectAiTools } from "@/components/graph/ConnectAiTools";
import { ConnectorsPanel } from "@/components/graph/ConnectorsPanel";
import { OnboardingTour } from "@/components/graph/OnboardingTour";
import { TreePanel } from "@/components/graph/TreePanel";
import { canView, useRole } from "@/lib/access";
import { childKindLabel, childrenOf, kindLabel, type GraphNode } from "@/lib/graph-data";
import {
  buildRepositoryGraph,
  traceRepositoryProblems,
  type RepositorySnapshot,
} from "@/lib/repository-graph";
import { subscribeToIngestion } from "@/lib/realtime";
import { NykstBrand } from "@/components/brand/NykstLogo";
import { List, Orbit, Search, X } from "lucide-react";

type IngestionSnapshot = {
  repository_full_name: string;
  created_at: string;
  payload: RepositorySnapshot;
};

/** The deepest node that stands for a real file path, so code jumps keep context. */
function findNodeByPath(node: GraphNode, path: string): GraphNode | null {
  if (node.analysisRef?.paths.includes(path)) return node;
  for (const child of childrenOf(node)) {
    const hit = findNodeByPath(child, path);
    if (hit) return hit;
  }
  return null;
}

export const Route = createFileRoute("/graph")({
  head: () => ({
    meta: [
      { title: "Software Graph & Navigator · Nykst" },
      {
        name: "description",
        content:
          "Navigate your organization's software graph: drill from core domains into capabilities, services, modules and individual files, with dependencies and blast radius.",
      },
      { property: "og:title", content: "Software Graph & Navigator · Nykst" },
      {
        property: "og:description",
        content: "Drill from core domains down to a single file, one click at a time.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: GraphPage,
});

function GraphPage() {
  const [pathIds, setPathIds] = useState<string[]>([]);
  const [selected, setSelected] = useState<GraphNode | null>(null);
  const [dossier, setDossier] = useState<GraphNode | null>(null);
  const [snapshot, setSnapshot] = useState<IngestionSnapshot | null>(null);
  const [realtimeTopic, setRealtimeTopic] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [lastChecked, setLastChecked] = useState<number | null>(null);
  const [polling, setPolling] = useState(true);
  const [beforeYouActOpen, setBeforeYouActOpen] = useState(false);
  const [softModal, setSoftModal] = useState<"premium" | null>(null);
  const [aiToolsOpen, setAiToolsOpen] = useState(false);
  const [connectorsOpen, setConnectorsOpen] = useState(false);
  const [connectorMessage, setConnectorMessage] = useState<string | null>(null);
  const [reanalyzing, setReanalyzing] = useState(false);
  const [reanalyzeError, setReanalyzeError] = useState<string | null>(null);
  const [activeRepo, setActiveRepo] = useState<string | null>(null);
  const [codeTarget, setCodeTarget] = useState<CodeTarget | null>(null);
  const [graphView, setGraphView] = useState<"orbit" | "list">("orbit");
  const [listQuery, setListQuery] = useState("");
  const [loopPath, setLoopPath] = useState("src/lib/integrations/github.ts");
  const [loopVerdict, setLoopVerdict] = useState<"safe" | "breaking" | "simulating">("safe");
  const repoRef = useRef<string | null>(null);

  const focusLoop = (path: string) => {
    setLoopPath(path);
    window.setTimeout(() => {
      document
        .querySelector('[data-testid="safe-code-loop-engine"]')
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 60);
  };

  const reanalyze = async () => {
    const [owner, repo] = (snapshot?.repository_full_name ?? "").split("/");
    if (!owner || !repo) return;
    setReanalyzing(true);
    setReanalyzeError(null);
    setPolling(false);
    try {
      const response = await fetch("/api/integrations/github/ingest", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ owner, repo }),
      });
      const payload = (await response.json()) as { error?: string } & RepositorySnapshot;
      if (!response.ok) throw new Error(payload.error ?? "Analysis failed.");
      const { ingestionId: _id, ...rest } = payload as RepositorySnapshot & {
        ingestionId?: string;
      };
      setSnapshot({
        repository_full_name: snapshot!.repository_full_name,
        created_at: new Date().toISOString(),
        payload: rest,
      });
      setPathIds([]);
      setSelected(null);
      setLastChecked(Date.now());
    } catch (error) {
      setReanalyzeError(error instanceof Error ? error.message : "Analysis failed.");
    } finally {
      setReanalyzing(false);
      setPolling(true);
    }
  };

  /** The live self-indexed AST of this repository, used when no GitHub ingestion is selected. */
  const loadSelf = useCallback(async () => {
    const selfRes = await fetch("/api/analysis/self", { cache: "no-store" });
    if (!selfRes.ok) return false;
    const selfData = (await selfRes.json()) as {
      repository: string;
      generatedAt: string;
      snapshotPayload?: RepositorySnapshot;
    };
    if (!selfData.snapshotPayload) return false;
    setSnapshot({
      repository_full_name: selfData.repository,
      created_at: selfData.generatedAt,
      payload: selfData.snapshotPayload,
    });
    setActiveRepo(selfData.repository);
    repoRef.current = selfData.repository;
    return true;
  }, []);

  /**
   * Loads the requested repository snapshot (or the newest one), falling back to the
   * live self-indexed AST of this repository when the visitor is not signed in.
   */
  const loadLatest = useCallback(
    async (silent = false, repository?: string | null) => {
      const target = repository === undefined ? repoRef.current : repository;
      if (!silent) setLoading(true);
      try {
        if (target && isSelfRepository(target)) {
          if (await loadSelf()) {
            setLoadError(null);
            setLastChecked(Date.now());
            setLoading(false);
            return;
          }
        }
        const query = target ? `?repo=${encodeURIComponent(target)}` : "";
        const response = await fetch(`/api/integrations/github/latest${query}`, {
          cache: "no-store",
        });
        if (response.ok) {
          const payload = (await response.json()) as {
            ingestion?: IngestionSnapshot | null;
            realtime?: { topic?: string };
          };
          if (payload.realtime?.topic) setRealtimeTopic(payload.realtime.topic);
          if (payload.ingestion) {
            setSnapshot(payload.ingestion);
            setActiveRepo(payload.ingestion.repository_full_name);
            repoRef.current = payload.ingestion.repository_full_name;
            setLoadError(null);
            return;
          }
        }
        // No stored analysis for the request: fall back to the live self-indexed AST.
        if (await loadSelf()) {
          setLoadError(null);
          return;
        }
        if (response.status === 401) {
          setSnapshot(null);
          setLoadError("unauthenticated");
          return;
        }
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        setSnapshot(null);
        setLoadError(payload.error ?? `Could not load your system map (${response.status}).`);
      } catch {
        setLoadError("Network error while loading your system map.");
      } finally {
        setLastChecked(Date.now());
        setLoading(false);
      }
    },
    [loadSelf],
  );

  /** Moves the whole workspace (graph, dossier, envelope) to another repository. */
  const switchRepository = useCallback(
    (repository: string) => {
      setActiveRepo(repository);
      repoRef.current = repository;
      if (typeof window !== "undefined") {
        const url = new URL(window.location.href);
        url.searchParams.set("repo", repository);
        window.history.replaceState({ nykstPath: [] }, "", url.toString());
      }
      setPathIds([]);
      setSelected(null);
      setDossier(null);
      setCodeTarget(null);
      void loadLatest(false, repository);
    },
    [loadLatest],
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const returned = params.get("connector");
    if (returned) {
      setConnectorMessage(
        returned.endsWith("-failed")
          ? `Connecting ${returned.startsWith("slack") ? "Slack" : "Jira"} failed: ${params.get("reason") ?? "unknown error"}`
          : `${returned === "slack" ? "Slack" : "Jira"} connected.`,
      );
      setConnectorsOpen(true);
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, []);

  // Real-time freshness: reload on focus and every 30s while the tab is visible, so the
  // map never shows a superseded analysis. Polling pauses while a re-analysis runs.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const requested = new URLSearchParams(window.location.search).get("repo");
    repoRef.current = requested;
    if (requested) setActiveRepo(requested);
    void loadLatest(false, requested ?? undefined);
    const reload = () => {
      if (polling) void loadLatest(true);
    };
    const onFocus = () => {
      if (document.visibilityState === "visible") reload();
    };
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") reload();
    }, 30_000);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
      window.clearInterval(timer);
    };
  }, [loadLatest, polling]);

  // Real-time push: the server broadcasts on the user's Realtime channel the moment a new
  // analysis is stored, so every open graph updates immediately. The interval above stays
  // as a fallback for a dropped socket.
  useEffect(() => {
    if (!realtimeTopic) return;
    return subscribeToIngestion(realtimeTopic, () => {
      if (polling) void loadLatest(true);
    });
  }, [realtimeTopic, polling, loadLatest]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    // Restore the drill path after a reload: the history entry is the deepest state we keep,
    // so refreshing a page five levels down does not throw the user back to the organization.
    const state = window.history.state as { nykstPath?: string[] } | null;
    const restored = Array.isArray(state?.nykstPath) ? state.nykstPath : [];
    setPathIds(restored);
    window.history.replaceState({ nykstPath: restored }, "", window.location.href);

    const onPopState = () => {
      const next = window.history.state as { nykstPath?: string[] } | null;
      setPathIds(Array.isArray(next?.nykstPath) ? next.nykstPath : []);
      setSelected(null);
      setDossier(null);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const root = useMemo(
    () => (snapshot ? buildRepositoryGraph(snapshot.payload) : null),
    [snapshot],
  );
  const problems = useMemo(
    () => (snapshot ? traceRepositoryProblems(snapshot.payload) : []),
    [snapshot],
  );

  const path = useMemo(() => {
    if (!root) return [];
    const out: GraphNode[] = [root];
    for (const id of pathIds) {
      const parent = out[out.length - 1]!;
      const next = childrenOf(parent).find((c) => c.id === id);
      if (!next) break;
      out.push(next);
    }
    return out;
  }, [root, pathIds]);

  const role = useRole();
  const center = path[path.length - 1] ?? null;
  const allChildren = useMemo(() => (center ? childrenOf(center) : []), [center]);
  const centerChildren = useMemo(
    () => allChildren.filter((n) => canView(role, n)),
    [allChildren, role],
  );
  const openIds = useMemo(() => new Set(path.map((n) => n.id)), [path]);
  const filteredChildren = useMemo(() => {
    const query = listQuery.trim().toLowerCase();
    if (!query) return centerChildren;
    return centerChildren.filter((node) =>
      [node.label, node.kind, node.detail?.path ?? "", ...(node.analysisRef?.paths ?? [])]
        .join(" ")
        .toLowerCase()
        .includes(query),
    );
  }, [centerChildren, listQuery]);

  // A new centre is a new list; keeping the old filter would hide its children.
  useEffect(() => {
    setListQuery("");
  }, [center?.id]);

  const checkedSecondsAgo = lastChecked
    ? Math.max(0, Math.round((Date.now() - lastChecked) / 1000))
    : null;

  if (loading && !snapshot) {
    return (
      <main className="bg-background flex min-h-screen items-center justify-center">
        <p className="text-muted-foreground font-mono text-xs tracking-[0.2em] uppercase">
          Loading your system map…
        </p>
      </main>
    );
  }

  if (!snapshot || !root || !center) {
    const unauthenticated = loadError === "unauthenticated";
    return (
      <main className="bg-background flex min-h-screen items-center justify-center px-4">
        <section className="border-border bg-card w-full max-w-xl rounded-2xl border p-7">
          <p className="text-primary font-mono text-[10px] tracking-[0.24em] uppercase">
            Software graph
          </p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight">
            {unauthenticated
              ? "Connect a repository to build your map"
              : "Your map is not available"}
          </h1>
          <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
            {unauthenticated
              ? "Nykst only ever renders a real system. Connect GitHub, pick a repository, and the graph is built from your actual import graph, commit history and entry points, nothing is simulated."
              : (loadError ?? "The latest analysis could not be loaded.")}
          </p>
          {loadError && !unauthenticated && (
            <p className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 font-mono text-[11px] text-amber-400">
              {loadError}
            </p>
          )}
          <ol className="text-muted-foreground mt-5 space-y-1.5 text-[12px]">
            <li>1 · Authorize the read-only GitHub connection.</li>
            <li>2 · Choose the repository to analyze.</li>
            <li>3 · The graph, dossier and impact envelope are built from that analysis.</li>
          </ol>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <a
              href="/api/integrations/github/start"
              className="bg-primary text-primary-foreground rounded-lg px-4 py-2 text-xs font-semibold"
            >
              Connect GitHub
            </a>
            <button
              onClick={() => void loadLatest()}
              className="border-border bg-surface hover:bg-surface-2 rounded-lg border px-4 py-2 text-xs font-semibold"
            >
              Retry
            </button>
            <Link to="/" className="text-primary text-xs underline">
              What Nykst reads
            </Link>
          </div>
        </section>
      </main>
    );
  }

  const drill = (node: GraphNode) => {
    if (node.expandable) {
      const nextPath = [...pathIds, node.id];
      window.history.pushState({ nykstPath: nextPath }, "", window.location.href);
      setPathIds(nextPath);
      setSelected(null);
    } else {
      setSelected(node);
    }
  };

  const jumpTo = (node: GraphNode) => {
    const chain: string[] = [];
    let cursor: GraphNode = root;
    while (cursor.id !== node.id) {
      const next = childrenOf(cursor).find((c) => node.id.startsWith(c.id));
      if (!next) break;
      chain.push(next.id);
      cursor = next;
    }
    if (node.expandable) {
      window.history.pushState({ nykstPath: chain }, "", window.location.href);
      setPathIds(chain);
      setSelected(null);
    } else {
      const nextPath = chain.slice(0, -1);
      window.history.pushState({ nykstPath: nextPath }, "", window.location.href);
      setPathIds(nextPath);
      setSelected(node);
    }
  };

  const childKind = (centerChildren[0]?.kind ?? "file") as GraphNode["kind"];
  const inspected = selected ?? center;

  return (
    <main className="bg-background relative flex min-h-screen flex-col overflow-hidden lg:h-screen">
      <WebGLFieldCanvas
        fixed={false}
        accentState={
          loopVerdict === "breaking" ? "amber" : loopVerdict === "simulating" ? "cyan" : "emerald"
        }
        className="absolute inset-0 z-0 opacity-40"
      />
      <header className="border-border relative z-10 flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b px-3 py-3 sm:px-5 sm:py-3">
        <div className="flex items-center gap-2.5">
          <Link
            to="/"
            className="border-border bg-surface text-muted-foreground hover:bg-surface-2 hover:text-foreground inline-flex size-8 items-center justify-center rounded-lg border transition-colors"
            aria-label="Return to opening dashboard"
            title="Return to opening dashboard"
          >
            <X className="size-4" />
          </Link>
          <Link to="/" className="flex items-center gap-2.5">
            <NykstBrand subtitle={null} size={26} />
          </Link>
        </div>

        <nav
          data-testid="graph-breadcrumb"
          aria-label="Graph depth"
          className="order-3 flex w-full min-w-0 items-center gap-1.5 overflow-x-auto pb-0.5 text-sm sm:order-none sm:w-auto sm:flex-1 sm:gap-2.5"
        >
          {path.map((node, i) => (
            <span key={node.id} className="flex shrink-0 items-center gap-1.5">
              {i > 0 && <span className="text-muted-foreground/60 px-1 text-xs">/</span>}
              <button
                onClick={() => {
                  const nextPath = pathIds.slice(0, i);
                  window.history.pushState({ nykstPath: nextPath }, "", window.location.href);
                  setPathIds(nextPath);
                  setSelected(null);
                }}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                  i === path.length - 1
                    ? "bg-secondary text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {node.label}
              </button>
            </span>
          ))}
        </nav>

        <div className="order-2 flex w-full items-center gap-2 overflow-x-auto sm:order-none sm:w-auto sm:gap-3">
          <button
            onClick={() => setBeforeYouActOpen(true)}
            className="border-primary/30 bg-primary/10 text-primary hover:bg-primary/15 flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors"
          >
            Before You Act <span aria-hidden="true">→</span>
          </button>
          {snapshot && (
            <button
              onClick={() => setConnectorsOpen(true)}
              className="border-border bg-surface text-foreground hover:bg-surface-2 inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors"
            >
              Connectors
            </button>
          )}
          {snapshot && (
            <button
              onClick={() => setAiToolsOpen(true)}
              className="border-border bg-surface text-foreground hover:bg-surface-2 inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors"
            >
              Connect AI tools
            </button>
          )}
          <button
            onClick={() => setSoftModal("premium")}
            className="border-primary/40 bg-primary/10 text-primary hover:bg-primary/20 inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors"
          >
            Premium
          </button>
          <RepoSwitcherBar
            activeRepo={activeRepo ?? snapshot.repository_full_name}
            onSwitch={switchRepository}
            onAnalyzed={switchRepository}
          />
        </div>
      </header>

      <div className="relative z-10 flex min-h-0 flex-1 flex-col overflow-visible md:flex-row md:overflow-hidden">
        <TreePanel
          root={root}
          openIds={openIds}
          activeId={inspected.id}
          onSelect={jumpTo}
          visible={(n) => canView(role, n)}
        />

        <section className="flex min-h-[calc(100vh-150px)] min-w-0 flex-1 flex-col overflow-y-auto p-3 sm:p-5 md:min-h-0">
          <div className="flex items-center justify-between gap-4">
            <div>
              <span className="text-primary text-[10px] tracking-[0.28em] uppercase font-mono">
                {kindLabel[center.kind]}
              </span>
              <h1 className="text-2xl font-bold tracking-tight mt-0.5">{center.label}</h1>
            </div>
          </div>

          {center.summary && (
            <p className="text-muted-foreground mt-1.5 max-w-2xl text-[12px] leading-relaxed">
              {center.summary}
            </p>
          )}

          {center.metrics && (
            <div className="mt-2.5 flex flex-wrap gap-x-5 gap-y-1.5">
              {center.metrics.map((m) => (
                <div key={m.label} className="flex items-baseline gap-1.5">
                  <span className="text-sm font-semibold">{m.value}</span>
                  <span className="text-muted-foreground text-[10px] tracking-wide uppercase">
                    {m.label}
                  </span>
                </div>
              ))}
            </div>
          )}

          {snapshot && (
            <div className="border-primary/25 bg-primary/5 mt-4 rounded-xl border px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-primary text-[10px] font-mono tracking-[0.2em] uppercase">
                    Live repository intelligence
                  </p>
                  <p className="mt-1 text-sm font-semibold">{snapshot.repository_full_name}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground font-mono text-[10px]">
                    analyzed {new Date(snapshot.created_at).toLocaleString()}
                    {checkedSecondsAgo !== null &&
                      ` · rechecked ${checkedSecondsAgo < 5 ? "just now" : `${checkedSecondsAgo}s ago`}`}
                  </span>
                  <button
                    onClick={reanalyze}
                    disabled={reanalyzing}
                    className="border-primary/30 bg-primary/10 text-primary hover:bg-primary/15 rounded-lg border px-3 py-1 text-[11px] font-semibold disabled:opacity-60"
                  >
                    {reanalyzing ? "Analyzing…" : "Re-analyze"}
                  </button>
                </div>
              </div>
              {reanalyzeError && <p className="mt-2 text-[11px] text-red-400">{reanalyzeError}</p>}
              {snapshot.payload.analysis ? (
                <p className="text-muted-foreground mt-2 text-[11px]">
                  Parsed {snapshot.payload.analysis.stats.analyzedFiles.toLocaleString("en-US")}{" "}
                  source files with the TypeScript compiler ·{" "}
                  {snapshot.payload.analysis.stats.internalEdges.toLocaleString("en-US")} import
                  edges · {snapshot.payload.analysis.services.length} external services ·{" "}
                  {snapshot.payload.analysis.resources.length} data resources
                  {snapshot.payload.analysis.stats.unresolvedImports
                    ? ` · ${snapshot.payload.analysis.stats.unresolvedImports} unresolved imports`
                    : ""}
                </p>
              ) : (
                <p className="mt-2 text-[11px] text-amber-400">
                  This snapshot predates the code analysis engine, the map below only reflects
                  folder names. Re-analyze to get real dependencies and impact.
                </p>
              )}
              <div className="text-muted-foreground mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px]">
                <span>{snapshot.payload.files?.length ?? 0} files</span>
                <span>{snapshot.payload.commits?.length ?? 0} commits</span>
                <span>{snapshot.payload.branches?.length ?? 0} branches</span>
                <span>{snapshot.payload.pull_requests?.length ?? 0} pull requests</span>
                <span>{snapshot.payload.issues?.length ?? 0} issues</span>
                <span>{snapshot.payload.contributors?.length ?? 0} contributors</span>
              </div>
              {problems.length > 0 && (
                <div className="border-border/70 mt-3 border-t pt-3">
                  <p className="text-primary text-[10px] font-mono tracking-[0.2em] uppercase">
                    Traceable code problems
                  </p>
                  <div className="mt-2 space-y-1.5">
                    {problems.slice(0, 5).map((problem) => (
                      <div
                        key={problem.id}
                        className="flex items-start justify-between gap-3 text-[11px]"
                      >
                        <span className="min-w-0 truncate">{problem.title}</span>
                        <span className="text-muted-foreground shrink-0 font-mono">
                          {problem.likelyFiles.length} related files
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
            <div
              role="group"
              aria-label="Graph view"
              className="border-border bg-surface flex items-center gap-1 rounded-lg border p-1"
            >
              <button
                type="button"
                data-testid="graph-view-orbit"
                aria-pressed={graphView === "orbit"}
                onClick={() => setGraphView("orbit")}
                className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                  graphView === "orbit"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Orbit className="size-3" /> Orbit
              </button>
              <button
                type="button"
                data-testid="graph-view-list"
                aria-pressed={graphView === "list"}
                onClick={() => setGraphView("list")}
                className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                  graphView === "list"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <List className="size-3" /> List
              </button>
            </div>
            <p
              className="text-muted-foreground font-mono text-[10px]"
              data-testid="graph-node-total"
              data-total={centerChildren.length}
            >
              {centerChildren.length} {childKindLabel[center.kind].toLowerCase()}
              {centerChildren.length === 1 ? "" : "s"} at this level
            </p>
          </div>

          {graphView === "orbit" ? (
            <div className="relative mt-3 min-h-[390px] flex-1 sm:min-h-[520px]">
              <GraphCanvas
                key={`${center.id}-${role.id}`}
                center={center}
                nodes={centerChildren}
                childKind={childKind}
                onSelect={drill}
                onInspect={setDossier}
                selectedId={selected?.id}
                technical={true}
              />
            </div>
          ) : (
            <section
              data-testid="graph-node-list"
              data-selected-id={selected?.id ?? ""}
              aria-label={`${center.label} children`}
              className="border-border bg-card/80 mt-3 flex min-h-[390px] flex-1 flex-col overflow-hidden rounded-xl border sm:min-h-[520px]"
            >
              <div className="border-border flex flex-wrap items-center gap-2 border-b px-3 py-2.5">
                <label className="border-border bg-surface flex min-w-0 flex-1 items-center gap-2 rounded-lg border px-2.5 py-1.5">
                  <Search className="text-muted-foreground size-3.5 shrink-0" />
                  <span className="sr-only">Search this graph level</span>
                  <input
                    data-testid="graph-node-search"
                    value={listQuery}
                    onChange={(event) => setListQuery(event.target.value)}
                    placeholder="Search files, signatures or paths at this level"
                    className="text-foreground placeholder:text-muted-foreground w-full bg-transparent text-xs outline-none"
                  />
                </label>
                <span className="text-muted-foreground font-mono text-[10px]" aria-live="polite">
                  {filteredChildren.length} of {centerChildren.length} shown
                </span>
              </div>
              <ul className="divide-border min-h-0 flex-1 divide-y overflow-y-auto">
                {filteredChildren.map((node) => {
                  const metric =
                    node.analysisRef?.type === "file"
                      ? `${node.detail?.loc ?? 0} LOC · ${node.dependents.length} importer${node.dependents.length === 1 ? "" : "s"}`
                      : node.analysisRef
                        ? `${node.analysisRef.paths.length} file${node.analysisRef.paths.length === 1 ? "" : "s"} · ${node.dependents.length} importer${node.dependents.length === 1 ? "" : "s"}`
                        : (node.metrics ?? [])
                            .slice(0, 3)
                            .map((item) => `${item.value} ${item.label}`)
                            .join(" · ");
                  return (
                    <li key={node.id} className="flex items-stretch gap-1 px-2 py-1">
                      <button
                        type="button"
                        data-testid="graph-node-row"
                        data-node-id={node.id}
                        data-expandable={node.expandable ? "true" : "false"}
                        onClick={() => drill(node)}
                        className="hover:bg-surface-2 focus-visible:ring-primary/60 flex min-w-0 flex-1 items-center justify-between gap-3 rounded-lg px-2 py-2 text-left transition-colors focus-visible:ring-2 focus-visible:outline-none"
                      >
                        <span className="min-w-0">
                          <span
                            data-node-label
                            className="block truncate text-[12px] font-semibold"
                          >
                            {node.label}
                          </span>
                          <span className="text-muted-foreground mt-0.5 block truncate font-mono text-[10px]">
                            {metric}
                          </span>
                        </span>
                        <span className="text-muted-foreground flex shrink-0 items-center gap-2 font-mono text-[10px]">
                          <span className="border-border bg-surface rounded-full border px-2 py-0.5">
                            {kindLabel[node.kind]}
                          </span>
                          <span className="text-primary">
                            {node.expandable ? "Drill in" : "Inspect"}
                          </span>
                        </span>
                      </button>
                      <button
                        type="button"
                        data-testid="graph-node-details"
                        aria-label={`Show details for ${node.label}`}
                        onClick={() => setDossier(node)}
                        className="border-border bg-surface text-muted-foreground hover:text-foreground hover:bg-surface-2 shrink-0 self-center rounded-lg border px-2 py-1 text-[10px] font-semibold transition-colors"
                      >
                        Details
                      </button>
                    </li>
                  );
                })}
              </ul>
              {!filteredChildren.length && (
                <p className="text-muted-foreground p-6 text-center text-[11px]">
                  No child of {center.label} matches that search.
                </p>
              )}
            </section>
          )}

          <div className="mt-4 flex flex-col items-start gap-2 border-t border-border pt-4 text-xs text-muted-foreground font-mono sm:flex-row sm:items-center sm:justify-between">
            <span>
              Software Navigator · {center.analysisRef ? "Contents" : childKindLabel[center.kind]} (
              {centerChildren.length})
            </span>
            <span>Choose a node or tree item to drill deeper</span>
          </div>

          <div className="mt-5">
            <NodeDossier
              node={inspected}
              analysis={snapshot.payload.analysis}
              snapshot={snapshot.payload}
              activeRepo={activeRepo ?? snapshot.repository_full_name}
              onInspectNode={(path) => {
                const node = findNodeByPath(root, path);
                if (node) jumpTo(node);
              }}
              onOpenCode={setCodeTarget}
            />
          </div>

          <div className="mt-5">
            <SafeCodeLoopEngine
              repository={activeRepo ?? snapshot.repository_full_name}
              path={loopPath}
              onOpenCode={setCodeTarget}
              onVerdict={setLoopVerdict}
            />
          </div>
        </section>

        <MentorPanel
          node={inspected}
          role={role}
          related={
            inspected.expandable ? childrenOf(inspected).filter((n) => canView(role, n)) : []
          }
          onOpen={drill}
          onOpenCode={(path) =>
            setCodeTarget({
              repository: activeRepo ?? snapshot?.repository_full_name ?? null,
              path,
              line: 1,
              label: "Mentor evidence source",
            })
          }
          {...(snapshot ? { repositoryProblems: problems } : {})}
          {...(snapshot ? { repositorySnapshot: snapshot.payload } : {})}
        />
      </div>

      <OnboardingTour />

      <NodeInspector
        node={dossier}
        open={dossier !== null}
        onClose={() => setDossier(null)}
        {...(snapshot ? { repositorySnapshot: snapshot.payload } : {})}
      />
      <CodeProblemInspector
        target={codeTarget}
        onClose={() => setCodeTarget(null)}
        onInspectNode={(path) => {
          const node = findNodeByPath(root, path);
          if (node) jumpTo(node);
        }}
        onRunLoop={(target) => {
          setCodeTarget(null);
          focusLoop(target.path);
        }}
      />
      <ConnectAiTools open={aiToolsOpen} onClose={() => setAiToolsOpen(false)} />
      <ConnectorsPanel
        open={connectorsOpen}
        message={connectorMessage}
        onClose={() => setConnectorsOpen(false)}
      />
      <BeforeYouAct
        node={inspected}
        snapshot={snapshot?.payload ?? null}
        open={beforeYouActOpen}
        onClose={() => setBeforeYouActOpen(false)}
        onOpenCode={setCodeTarget}
      />
      {softModal && (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm"
          role="presentation"
          onClick={() => setSoftModal(null)}
        >
          <section
            className="border-border bg-card w-full max-w-md rounded-2xl border p-6 shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="graph-soft-modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-primary text-[10px] font-mono uppercase tracking-[0.24em]">
                  Nykst access
                </p>
                <h2 id="graph-soft-modal-title" className="mt-1 text-lg font-semibold">
                  Premium workspace
                </h2>
              </div>
              <button
                onClick={() => setSoftModal(null)}
                className="text-muted-foreground hover:text-foreground rounded-lg p-1"
                aria-label="Close"
              >
                <X className="size-4" />
              </button>
            </div>
            <p className="text-muted-foreground mt-4 text-sm leading-relaxed">
              Premium access adds deeper repository history, broader system context, and team-ready
              workflows. You can keep exploring the graph without signing in.
            </p>
            <button
              onClick={() => setSoftModal(null)}
              className="border-border bg-surface hover:bg-surface-2 mt-5 rounded-lg border px-4 py-2 text-xs font-semibold"
            >
              Keep exploring
            </button>
          </section>
        </div>
      )}
    </main>
  );
}
