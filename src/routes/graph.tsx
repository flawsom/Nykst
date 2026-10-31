import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GraphCanvas } from "@/components/graph/GraphCanvas";
import { RepoSwitcherBar } from "@/components/graph/RepoSwitcherBar";
import { NodeDossier } from "@/components/graph/NodeDossier";
import { CodeProblemInspector, type CodeTarget } from "@/components/graph/CodeProblemInspector";
import { SELF_REPOSITORY, isSelfRepository } from "@/lib/code-links";
import { MentorPanel } from "@/components/graph/MentorPanel";
import { NodeInspector } from "@/components/graph/NodeInspector";
import { BeforeYouAct } from "@/components/graph/BeforeYouAct";
import { SafeCodeLoopEngine } from "@/components/graph/SafeCodeLoopEngine";
import { ConnectAiTools } from "@/components/graph/ConnectAiTools";
import { ApiSettingsButton } from "@/components/graph/ApiSettings";
import { ConnectorsPanel } from "@/components/graph/ConnectorsPanel";
import { OnboardingTour } from "@/components/graph/OnboardingTour";
import { TracePathDialog } from "@/components/graph/TracePathDialog";
import { TreePanel } from "@/components/graph/TreePanel";
import { canView, useRole } from "@/lib/access";
import { childKindLabel, childrenOf, kindLabel, type GraphNode } from "@/lib/graph-data";
import {
  buildRepositoryGraph,
  traceRepositoryProblems,
  type RepositorySnapshot,
} from "@/lib/repository-graph";
import { subscribeToIngestion } from "@/lib/realtime";
import { fetchWithTimeout, readableRequestError } from "@/lib/fetch-with-timeout";
import { canonicalUrl, shareMeta } from "@/lib/seo";
import { NykstBrand } from "@/components/brand/NykstLogo";
import { GitBranch, Github, List, Loader2, Orbit, Search, X } from "lucide-react";

type IngestionSnapshot = {
  repository_full_name: string;
  created_at: string;
  payload: RepositorySnapshot;
};

/**
 * The node for one exact file. Every ancestor group also lists the file in
 * analysisRef.paths, so a plain includes() match would return the organisation
 * root and select the whole repository on reload instead of the file.
 */
function isFileNode(node: GraphNode, path: string): boolean {
  return node.analysisRef?.type === "file" && node.analysisRef.paths.includes(path);
}

/** The deepest node that stands for a real file path, so code jumps keep context. */
function findNodeByPath(node: GraphNode, path: string): GraphNode | null {
  if (isFileNode(node, path)) return node;
  for (const child of childrenOf(node)) {
    const hit = findNodeByPath(child, path);
    if (hit) return hit;
  }
  return null;
}

/** The full drill chain to the node that stands for a file path, file included. */
function chainToPath(node: GraphNode, path: string, trail: string[] = []): string[] | null {
  const next = [...trail, node.id];
  if (isFileNode(node, path)) return next;
  for (const child of childrenOf(node)) {
    const hit = chainToPath(child, path, next);
    if (hit) return hit;
  }
  return null;
}

export const Route = createFileRoute("/graph")({
  head: () => ({
    meta: [
      { title: "System map · Nykst" },
      {
        name: "description",
        content:
          "See your whole project as a map. Start with the parts, open one, and follow it down to the files and database tables a change will touch.",
      },
      ...shareMeta({
        title: "System map · Nykst",
        description: "See your whole project as a map, then open the part a change will touch.",
        path: "/graph",
      }),
    ],
    links: [{ rel: "canonical", href: canonicalUrl("/graph") }],
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
  const [traceOpen, setTraceOpen] = useState(false);
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
  const [notAnalysedRepo, setNotAnalysedRepo] = useState<string | null>(null);
  const [showingExample, setShowingExample] = useState(false);
  const [analysing, setAnalysing] = useState(false);
  const [analyseError, setAnalyseError] = useState<string | null>(null);
  const repoRef = useRef<string | null>(null);

  const selectFile = useCallback((node: GraphNode) => {
    setSelected(node);
    const path = node.detail?.path ?? node.analysisRef?.paths[0];
    if (!path) return;
    setLoopPath(path);
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    url.searchParams.set("file", path);
    window.history.replaceState(window.history.state, "", url.toString());
  }, []);

  const clearSelectedFile = useCallback(() => {
    setSelected(null);
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (!url.searchParams.has("file")) return;
    url.searchParams.delete("file");
    window.history.replaceState(window.history.state, "", url.toString());
  }, []);

  const focusLoop = (path: string) => {
    setLoopPath(path);
    window.setTimeout(() => {
      document
        .querySelector('[data-testid="safe-code-loop-engine"]')
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 60);
  };

  const reanalyze = async () => {
    const repositoryName = snapshot?.repository_full_name ?? "";
    setReanalyzing(true);
    setReanalyzeError(null);
    setPolling(false);
    try {
      // The example project is this site's own code, so it is rebuilt from the
      // server snapshot. Sending it through GitHub ingestion would ask an
      // anonymous visitor to sign in for a map they are already looking at.
      if (showingExample || isSelfRepository(repositoryName)) {
        const refreshed = await loadSelf();
        if (!refreshed) throw new Error("We could not rebuild the example map. Please try again.");
        setLastChecked(Date.now());
        return;
      }
      const [owner, repo] = repositoryName.split("/");
      if (!owner || !repo) return;
      const response = await fetchWithTimeout(
        "/api/integrations/github/ingest",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ owner, repo }),
        },
        25_000,
      );
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
      setReanalyzeError(readableRequestError(error, "Analysis failed."));
    } finally {
      setReanalyzing(false);
      setPolling(true);
    }
  };

  /** The live self-indexed AST of this repository, used when no GitHub ingestion is selected. */
  const loadSelf = useCallback(async () => {
    const selfRes = await fetchWithTimeout("/api/analysis/self", { cache: "no-store" }, 15_000);
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
   * Loads the requested repository snapshot.
   *
   * A repository with no saved map never falls back to another project. The
   * page says plainly that this project is not mapped yet and offers the two
   * real next steps. The Nykst example project is only shown when no
   * repository was requested, and is always labelled as an example.
   */
  const loadLatest = useCallback(
    async (silent = false, repository?: string | null) => {
      const target = repository === undefined ? repoRef.current : repository;
      const explicit = Boolean(target);
      if (!silent) setLoading(true);
      try {
        if (target && isSelfRepository(target)) {
          if (await loadSelf()) {
            setNotAnalysedRepo(null);
            setShowingExample(true);
            setLoadError(null);
            setLastChecked(Date.now());
            setLoading(false);
            return;
          }
        }
        const query = target ? `?repo=${encodeURIComponent(target)}` : "";
        const response = await fetchWithTimeout(
          `/api/integrations/github/latest${query}`,
          { cache: "no-store" },
          15_000,
        );
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
            setNotAnalysedRepo(null);
            setShowingExample(false);
            setLoadError(null);
            return;
          }
        }
        if (explicit && target) {
          // This account has no saved map for this repository. Never render a
          // different project in its place, and never present the example as it.
          setSnapshot(null);
          setNotAnalysedRepo(target);
          setShowingExample(false);
          setLoadError(null);
          return;
        }
        if (await loadSelf()) {
          setShowingExample(true);
          setNotAnalysedRepo(null);
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
        setLoadError(payload.error ?? `Could not load this map (${response.status}).`);
      } catch (error) {
        setLoadError(readableRequestError(error, "Network error while loading this map."));
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
      setShowingExample(false);
      setNotAnalysedRepo(null);
      setAnalyseError(null);
      if (typeof window !== "undefined") {
        const url = new URL(window.location.href);
        url.searchParams.delete("file");
        window.history.replaceState({ nykstPath: [] }, "", url.toString());
      }
      void loadLatest(false, repository);
    },
    [loadLatest],
  );

  /** Build a map for a repository the visitor typed or chose, on demand. */
  const analyzeRepository = async (repository: string) => {
    const [owner, repo] = repository.split("/");
    if (!owner || !repo) return;
    setAnalysing(true);
    setAnalyseError(null);
    try {
      const response = await fetchWithTimeout(
        "/api/integrations/github/ingest",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ owner, repo }),
        },
        25_000,
      );
      const payload = (await response.json()) as { error?: string } & RepositorySnapshot;
      if (!response.ok) throw new Error(payload.error ?? "We could not build this map.");
      const { ingestionId: _id, ...rest } = payload as RepositorySnapshot & {
        ingestionId?: string;
      };
      setSnapshot({
        repository_full_name: repository,
        created_at: new Date().toISOString(),
        payload: rest,
      });
      setActiveRepo(repository);
      repoRef.current = repository;
      setNotAnalysedRepo(null);
      setShowingExample(false);
      setPathIds([]);
      setSelected(null);
      setLastChecked(Date.now());
    } catch (error) {
      setAnalyseError(
        readableRequestError(error, "We could not build this map. Please try again."),
      );
    } finally {
      setAnalysing(false);
    }
  };

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
      clearSelectedFile();
      setDossier(null);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [clearSelectedFile]);

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

  // Restore the file from the URL after a reload, so the same file is selected
  // in every panel instead of falling back to the parent folder.
  useEffect(() => {
    if (!root || typeof window === "undefined") return;
    const requested = new URLSearchParams(window.location.search).get("file");
    if (!requested) return;
    const node = findNodeByPath(root, requested);
    const chain = chainToPath(root, requested);
    if (!node || !chain) return;
    setPathIds(chain.slice(0, -1));
    setSelected(node);
    setLoopPath(requested);
  }, [root]);
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

  // Freshness is stated, never implied. A map saved more than a day ago is stale,
  // a rebuild in progress says so, and the code ref ties the map to a commit.
  const savedAt = snapshot ? new Date(snapshot.created_at) : null;
  const savedAgeHours = savedAt ? (Date.now() - savedAt.getTime()) / 3_600_000 : 0;
  const freshness = reanalyzing ? "Updating" : savedAgeHours > 24 ? "Stale" : "Current";
  // Only a commit SHA is meaningful to show as "code at". A worktree label such
  // as the self snapshot's name would look like a hash and mean nothing.
  const rawRef = snapshot?.payload.analysis?.ref ?? null;
  const codeRef = rawRef && /^[0-9a-f]{7,40}$/i.test(rawRef) ? rawRef : null;
  const graphEdges = snapshot?.payload.dependency_graph;
  const edgesStored = graphEdges?.edges?.length ?? 0;
  const edgesTotal = graphEdges?.edges_total ?? edgesStored;
  const mapLimits = [
    ...(snapshot?.payload.analysis?.limitations ?? []),
    ...(snapshot?.payload.history?.limitations ?? []),
  ].slice(0, 6);

  if (loading && !snapshot) {
    return (
      <main aria-busy="true" className="bg-background min-h-screen">
        <p role="status" className="sr-only">
          Loading this map. Reading the files, then linking them.
        </p>
        <div className="border-border flex items-center justify-between border-b px-4 py-3 sm:px-5">
          <div className="bg-surface h-7 w-32 animate-pulse rounded-lg" />
          <div className="flex gap-2">
            <div className="bg-surface h-7 w-24 animate-pulse rounded-lg" />
            <div className="bg-surface h-7 w-20 animate-pulse rounded-lg" />
          </div>
        </div>
        <div className="flex flex-col md:flex-row">
          <aside className="border-border w-full border-b p-3 md:w-64 md:border-r md:border-b-0">
            {[0, 1, 2, 3, 4, 5, 6].map((row) => (
              <div
                key={row}
                className="bg-surface mb-2 h-6 animate-pulse rounded"
                style={{ width: `${88 - row * 6}%` }}
              />
            ))}
          </aside>
          <section className="flex-1 p-3 sm:p-5">
            <div className="bg-surface mb-3 h-3 w-24 animate-pulse rounded" />
            <div className="bg-surface mb-6 h-8 w-64 max-w-full animate-pulse rounded-lg" />
            <div className="bg-surface mx-auto aspect-square w-full max-w-sm animate-pulse rounded-full" />
            <p className="text-muted-foreground mt-6 text-center text-xs">
              Loading this map. Reading the files, then linking them.
            </p>
          </section>
        </div>
      </main>
    );
  }

  if (!snapshot || !root || !center) {
    if (notAnalysedRepo) {
      return (
        <main className="bg-background flex min-h-screen items-center justify-center px-4">
          <section className="border-border bg-card w-full max-w-xl rounded-2xl border p-7">
            <p className="text-primary font-mono text-[10px] tracking-[0.24em] uppercase">
              Map of this project
            </p>
            <h1 className="mt-2 text-2xl font-bold tracking-tight">This is not your project yet</h1>
            <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
              Nykst has no saved map for{" "}
              <span className="font-mono text-foreground">{notAnalysedRepo}</span> in this account.
              Nothing is shown in its place, so you never read another project's code by mistake.
            </p>
            <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
              A map is built from the files in the project and the connections between them. Nothing
              is filled in from a sample.
            </p>
            <ol className="text-muted-foreground mt-5 space-y-1.5 text-[12px] leading-relaxed">
              <li>1 - Connect GitHub so Nykst may read this repository.</li>
              <li>2 - Press Analyse this repo to build the map from the code itself.</li>
              <li>3 - From then on, the map and what it affects open straight away.</li>
            </ol>
            {analyseError && (
              <p
                role="alert"
                className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-[11px] leading-relaxed text-amber-300"
              >
                {analyseError}
              </p>
            )}
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <a
                href="/api/integrations/github/start"
                className="bg-primary text-primary-foreground hover:bg-primary-glow inline-flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold"
              >
                <Github className="size-4" /> Connect GitHub
              </a>
              <button
                onClick={() => void analyzeRepository(notAnalysedRepo)}
                disabled={analysing}
                className="border-primary/40 bg-primary/10 text-primary hover:bg-primary/20 inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-xs font-semibold disabled:opacity-60"
              >
                {analysing && <Loader2 className="size-4 animate-spin" />}
                {analysing ? "Building the map" : "Analyse this repo"}
              </button>
              <button
                onClick={() => switchRepository(SELF_REPOSITORY)}
                className="border-border bg-surface hover:bg-surface-2 rounded-lg border px-4 py-2 text-xs font-semibold"
              >
                See the example project
              </button>
            </div>
            <p className="text-muted-foreground mt-4 text-[11px] leading-relaxed">
              This build reads JavaScript and TypeScript source. Files over 400,000 bytes are
              skipped and counted, so a mixed repository shows a partial map rather than an empty
              one.
            </p>
          </section>
        </main>
      );
    }
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
              ? "Nykst only ever shows a real project. Connect GitHub, pick a repository, and the map is built from the files and connections in that code. Nothing is simulated."
              : (loadError ?? "The latest map could not be loaded.")}
          </p>
          {loadError && !unauthenticated && (
            <p className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 font-mono text-[11px] text-amber-400">
              {loadError}
            </p>
          )}
          <ol className="text-muted-foreground mt-5 space-y-1.5 text-[12px]">
            <li>1 · Connect your GitHub account and choose which repositories we may read.</li>
            <li>2 · Pick the repository you want to map.</li>
            <li>3 · The map and its impact view are built from that repository.</li>
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
      clearSelectedFile();
      window.history.pushState({ nykstPath: nextPath }, "", window.location.href);
      setPathIds(nextPath);
    } else {
      selectFile(node);
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
      clearSelectedFile();
      window.history.pushState({ nykstPath: chain }, "", window.location.href);
      setPathIds(chain);
    } else {
      const nextPath = chain.slice(0, -1);
      window.history.pushState({ nykstPath: nextPath }, "", window.location.href);
      setPathIds(nextPath);
      selectFile(node);
    }
  };

  const childKind = (centerChildren[0]?.kind ?? "file") as GraphNode["kind"];
  // One selected file state for the whole workspace: the header, breadcrumb,
  // orbit highlight, dossier, mentor and Safe Code Loop all read this value.
  const focus: GraphNode = selected ?? center;
  const inspected = focus;
  const selectedFile = selected?.detail?.path ?? selected?.analysisRef?.paths[0] ?? null;

  return (
    <main className="bg-background relative flex min-h-screen flex-col overflow-hidden lg:h-screen">
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
                  clearSelectedFile();
                  window.history.pushState({ nykstPath: nextPath }, "", window.location.href);
                  setPathIds(nextPath);
                }}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                  !selected && i === path.length - 1
                    ? "bg-secondary text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {node.label}
              </button>
            </span>
          ))}
          {selected && (
            <span className="flex shrink-0 items-center gap-1.5">
              <span className="text-muted-foreground/60 px-1 text-xs">/</span>
              <span
                data-testid="graph-selected-file"
                title={selected.detail?.path ?? selected.label}
                className="bg-secondary text-foreground max-w-56 truncate rounded-lg px-3 py-1.5 font-mono text-[11px] font-semibold"
              >
                {selected.label}
              </span>
            </span>
          )}
        </nav>

        <div className="order-2 flex w-full flex-wrap items-center gap-2 sm:order-none sm:w-auto sm:flex-nowrap sm:gap-3">
          <button
            onClick={() => setBeforeYouActOpen(true)}
            className="border-primary/30 bg-primary/10 text-primary hover:bg-primary/15 flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors"
          >
            Before You Act <span aria-hidden="true">→</span>
          </button>
          <button
            onClick={() => setTraceOpen(true)}
            className="border-border bg-surface text-foreground hover:bg-surface-2 inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors"
            title="Trace the shortest import connection between two files"
          >
            <GitBranch className="size-3.5" /> Trace a path
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
          <ApiSettingsButton className="shrink-0" />
          <Link
            to="/subscribe"
            className="border-primary/40 bg-primary/10 text-primary hover:bg-primary/20 inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors"
          >
            Plans
          </Link>
          <RepoSwitcherBar
            activeRepo={activeRepo ?? snapshot.repository_full_name}
            onSwitch={switchRepository}
            onAnalyzed={switchRepository}
          />
        </div>
      </header>

      {showingExample && (
        <div
          role="note"
          className="border-primary/25 bg-primary/10 relative z-10 flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2 sm:px-5"
        >
          <p className="text-[11px] leading-relaxed">
            <span className="font-semibold">You are looking at the Nykst example project.</span>{" "}
            <span className="text-muted-foreground">
              This is our own codebase, shown so you can see what a map looks like. Connect GitHub
              to map yours.
            </span>
          </p>
          <a
            href="/api/integrations/github/start"
            className="border-primary/40 bg-primary/15 text-primary hover:bg-primary/25 inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[11px] font-semibold"
          >
            <Github className="size-3.5" /> Connect GitHub
          </a>
        </div>
      )}

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
                {kindLabel[focus.kind]}
                {selected ? " · selected file" : ""}
              </span>
              <h1 className="text-2xl font-bold tracking-tight mt-0.5">{focus.label}</h1>
              {selectedFile && (
                <p
                  data-testid="graph-selected-path"
                  className="text-muted-foreground mt-1 font-mono text-[11px] break-all"
                >
                  {selectedFile} · {focus.detail?.loc ?? 0} lines · {focus.dependents.length}{" "}
                  {focus.dependents.length === 1 ? "file uses" : "files use"} it
                </p>
              )}
              {!selected && centerChildren.length > 0 && (
                <p className="text-muted-foreground mt-2 max-w-2xl text-xs leading-relaxed">
                  This is everything in this part. Click a card to open it, or switch to List to
                  search every item at this level.
                </p>
              )}
            </div>
          </div>

          {focus.summary && (
            <p className="text-muted-foreground mt-1.5 max-w-2xl text-[12px] leading-relaxed">
              {focus.summary}
            </p>
          )}

          {focus.metrics && (
            <div className="mt-2.5 flex flex-wrap gap-x-5 gap-y-1.5">
              {focus.metrics.map((m) => (
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
                <div className="min-w-0">
                  <p className="text-primary text-[10px] font-mono tracking-[0.2em] uppercase">
                    Map of this project
                  </p>
                  <p className="mt-1 text-sm font-semibold">{snapshot.repository_full_name}</p>
                  <p
                    data-testid="graph-freshness"
                    className="text-muted-foreground mt-0.5 font-mono text-[10px]"
                  >
                    Saved map from {savedAt ? savedAt.toLocaleString() : "an unknown date"}
                    {codeRef ? ` · code at ${codeRef.slice(0, 7)}` : ""}
                    {snapshot.payload.repository?.commit
                      ? ` · commit ${snapshot.payload.repository.commit.slice(0, 7)}`
                      : ""}
                    {checkedSecondsAgo !== null &&
                      ` · rechecked ${checkedSecondsAgo < 5 ? "just now" : `${checkedSecondsAgo}s ago`}`}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    data-testid="graph-freshness-label"
                    className={`rounded-lg border px-2 py-1 text-[10px] font-semibold tracking-wide uppercase ${
                      freshness === "Stale"
                        ? "border-amber-500/40 bg-amber-500/10 text-amber-300"
                        : freshness === "Updating"
                          ? "border-primary/40 bg-primary/10 text-primary"
                          : "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                    }`}
                  >
                    {freshness}
                  </span>
                  <button
                    onClick={reanalyze}
                    disabled={reanalyzing}
                    className="border-primary/30 bg-primary/10 text-primary hover:bg-primary/15 rounded-lg border px-3 py-1 text-[11px] font-semibold disabled:opacity-60"
                  >
                    {reanalyzing ? "Re-checking this project…" : "Re-check this project now"}
                  </button>
                </div>
              </div>
              {freshness === "Stale" && (
                <p className="mt-2 text-[11px] text-amber-300">
                  This map was saved more than a day ago, so the code may have changed since. Press
                  Re-check this project now before you trust it.
                </p>
              )}
              {freshness === "Updating" && (
                <p className="text-muted-foreground mt-2 text-[11px]">
                  Re-checking this project now. Everything below is the last saved map until it
                  finishes.
                </p>
              )}
              {reanalyzeError && <p className="mt-2 text-[11px] text-red-400">{reanalyzeError}</p>}
              {snapshot.payload.analysis ? (
                <p className="text-muted-foreground mt-2 text-[11px]">
                  {snapshot.payload.analysis.stats.analyzedFiles.toLocaleString("en-US")} files ·{" "}
                  {snapshot.payload.analysis.stats.internalEdges.toLocaleString("en-US")}{" "}
                  connections · {snapshot.payload.analysis.services.length} outside services ·{" "}
                  {snapshot.payload.analysis.resources.length} database tables
                </p>
              ) : (
                <p className="mt-2 text-[11px] text-amber-400">
                  This repository was mapped before the current version, so this view shows folders
                  only. Connect it again to see files and what they depend on.
                </p>
              )}
              {edgesTotal > edgesStored && (
                <p data-testid="graph-edge-cap" className="mt-2 text-[11px] text-amber-300">
                  This map stores the first {edgesStored.toLocaleString("en-US")} of{" "}
                  {edgesTotal.toLocaleString("en-US")} links between files. Open proof on a file to
                  see the links that file needs.
                </p>
              )}
              <div className="text-muted-foreground mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px]">
                <span>{snapshot.payload.files?.length ?? 0} files mapped</span>
              </div>
              {mapLimits.length > 0 && (
                <details className="mt-2">
                  <summary className="text-muted-foreground hover:text-foreground cursor-pointer text-[11px]">
                    What this map does not include ({mapLimits.length})
                  </summary>
                  <ul className="text-muted-foreground mt-1 list-disc space-y-1 pl-4 text-[11px]">
                    {mapLimits.map((limit) => (
                      <li key={limit}>{limit}</li>
                    ))}
                  </ul>
                </details>
              )}
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
                key={`${focus.id}-${role.id}`}
                center={focus}
                nodes={centerChildren}
                childKind={childKind}
                onSelect={drill}
                onInspect={setDossier}
                selectedId={selected?.id}
                technical={true}
              />
              {selected && (
                <p className="text-muted-foreground mt-2 font-mono text-[10px]">
                  The selected file sits in the middle. The ring shows the other items at this
                  level.
                </p>
              )}
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
                      ? `${node.detail?.loc ?? 0} lines · ${node.dependents.length} file${node.dependents.length === 1 ? " uses" : "s use"} it`
                      : node.analysisRef
                        ? `${node.analysisRef.paths.length} file${node.analysisRef.paths.length === 1 ? "" : "s"} · ${node.dependents.length} file${node.dependents.length === 1 ? " uses" : "s use"} it`
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
                        data-selected={selected?.id === node.id ? "true" : "false"}
                        aria-current={selected?.id === node.id ? "true" : undefined}
                        onClick={() => drill(node)}
                        className={`focus-visible:ring-primary/60 flex min-w-0 flex-1 items-center justify-between gap-3 rounded-lg px-2 py-2 text-left transition-colors focus-visible:ring-2 focus-visible:outline-none ${selected?.id === node.id ? "bg-primary/10 ring-primary/40 ring-1" : "hover:bg-surface-2"}`}
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
                        onClick={() => {
                          if (!node.expandable) selectFile(node);
                          setDossier(node);
                        }}
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
              {center.analysisRef ? "Inside this part" : childKindLabel[center.kind]} (
              {centerChildren.length})
            </span>
            <span>Choose a card or tree item to open it</span>
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
              onRecheck={() => void reanalyze()}
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
      <TracePathDialog
        open={traceOpen}
        onClose={() => setTraceOpen(false)}
        snapshot={snapshot?.payload ?? null}
        initialPath={selectedFile}
        onOpenPath={(path) => {
          const node = findNodeByPath(root, path);
          if (node) jumpTo(node);
          setTraceOpen(false);
        }}
      />
    </main>
  );
}
