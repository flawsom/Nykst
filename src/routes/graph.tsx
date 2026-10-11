import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Bot,
  FileCode2,
  GitPullRequestArrow,
  Network,
  PanelRight,
  RefreshCw,
  Search,
} from "lucide-react";
import { ActivityView } from "@/components/workspace/ActivityView";
import { ChangeView } from "@/components/workspace/ChangeView";
import { CommandPalette } from "@/components/workspace/CommandPalette";
import { Explorer } from "@/components/workspace/Explorer";
import { FindingsView } from "@/components/workspace/FindingsView";
import { IngestProgress } from "@/components/workspace/IngestProgress";
import { Inspector } from "@/components/workspace/Inspector";
import { MapView } from "@/components/workspace/MapView";
import { WorkspaceProvider } from "@/components/workspace/WorkspaceContext";
import { Badge, EmptyState, Kbd, Spinner, buttonClass } from "@/components/workspace/ui";
import { Wordmark } from "@/components/site/SiteHeader";
import { ConnectAiTools } from "@/components/graph/ConnectAiTools";
import { cn } from "@/lib/utils";
import { createWorkspaceApi, demoApi } from "@/lib/workspace/api-client";
import { runIngest, type IngestStageId } from "@/lib/workspace/ingest-client";
import {
  timeAgo,
  toWorkspace,
  type SnapshotResult,
  type StoredSnapshot,
  type WorkspaceView,
} from "@/lib/workspace/model";

const VIEWS: WorkspaceView[] = ["map", "findings", "activity", "change"];

export const Route = createFileRoute("/graph")({
  validateSearch: (search: Record<string, unknown>) => ({
    demo: search["demo"] === 1 || search["demo"] === "1" ? (1 as const) : undefined,
    file: typeof search["file"] === "string" ? search["file"] : undefined,
    view: VIEWS.includes(search["view"] as WorkspaceView)
      ? (search["view"] as WorkspaceView)
      : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Workspace — Nykst" },
      {
        name: "description",
        content:
          "Explore a repository's real import graph, see the blast radius of any file, review findings and check changes before they land.",
      },
    ],
  }),
  component: WorkspacePage,
});

type Load =
  | { state: "loading" }
  | { state: "signed-out" }
  | { state: "empty" }
  | { state: "error"; message: string }
  | { state: "ready"; result: SnapshotResult };

function WorkspacePage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const demo = search.demo === 1;
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [reanalyzing, setReanalyzing] = useState<string | null>(null);

  const fetchSnapshot = useCallback(async () => {
    setLoad({ state: "loading" });
    try {
      if (demo) {
        const response = await fetch("/demo/snapshot.json");
        if (!response.ok) throw new Error("The example could not be loaded.");
        const snapshot = (await response.json()) as StoredSnapshot;
        setLoad({ state: "ready", result: toWorkspace(snapshot, "demo") });
        return;
      }
      const response = await fetch("/api/integrations/github/latest");
      if (response.status === 401) return setLoad({ state: "signed-out" });
      if (!response.ok) throw new Error("Could not load your analysis.");
      const body = (await response.json()) as { ingestion?: StoredSnapshot | null };
      if (!body.ingestion) return setLoad({ state: "empty" });
      setLoad({ state: "ready", result: toWorkspace(body.ingestion, "github") });
    } catch (error) {
      setLoad({
        state: "error",
        message: error instanceof Error ? error.message : "Something went wrong.",
      });
    }
  }, [demo]);

  useEffect(() => {
    void fetchSnapshot();
  }, [fetchSnapshot]);

  if (reanalyzing)
    return (
      <Centered>
        <ReanalyzeRun
          repository={reanalyzing}
          onDone={() => {
            setReanalyzing(null);
            void fetchSnapshot();
          }}
          onCancel={() => setReanalyzing(null)}
        />
      </Centered>
    );

  if (load.state === "loading")
    return (
      <Centered>
        <Spinner label="Loading your analysis…" />
      </Centered>
    );
  if (load.state === "signed-out")
    return (
      <Centered>
        <EmptyState
          title="Connect GitHub to open your workspace"
          action={
            <Link to="/" className={buttonClass.primary}>
              Go to connect
            </Link>
          }
        >
          Nykst needs read access to a repository to build its graph. You can also look around the
          example first.
        </EmptyState>
        <a href="/graph?demo=1" className="text-primary text-sm font-medium hover:underline">
          Open the example workspace
        </a>
      </Centered>
    );
  if (load.state === "empty")
    return (
      <Centered>
        <EmptyState
          title="No repository analyzed yet"
          action={
            <Link to="/" className={buttonClass.primary}>
              Choose a repository
            </Link>
          }
        >
          Pick a repository on the home page and Nykst will analyze it. It takes a minute or two.
        </EmptyState>
      </Centered>
    );
  if (load.state === "error")
    return (
      <Centered>
        <EmptyState
          title="Could not open the workspace"
          action={
            <button onClick={() => void fetchSnapshot()} className={buttonClass.primary}>
              Try again
            </button>
          }
        >
          {load.message}
        </EmptyState>
      </Centered>
    );

  const { result } = load;
  if (!result.ok)
    return (
      <Centered>
        <EmptyState
          title={
            result.reason === "outdated"
              ? "This analysis is out of date"
              : "This repository needs a fresh analysis"
          }
          action={
            <button
              onClick={() => setReanalyzing(result.repository)}
              className={buttonClass.primary}
            >
              <RefreshCw className="size-4" aria-hidden /> Analyze {result.repository}
            </button>
          }
        >
          {result.reason === "outdated"
            ? "Nykst's analysis has improved since this repository was analyzed (call sites, signatures, findings). Analyze it again to use the new features."
            : "The stored snapshot has no code analysis. Analyze it to see the graph."}
        </EmptyState>
      </Centered>
    );

  return (
    <Workspace
      key={result.data.repository + result.data.createdAt}
      data={result.data}
      file={search.file ?? null}
      view={search.view ?? "map"}
      onNavigate={(next) =>
        void navigate({
          search: (previous) => ({ ...previous, ...next }),
          replace: false,
        })
      }
      onReanalyze={() => setReanalyzing(result.data.repository)}
    />
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <main className="bg-background flex min-h-screen flex-col items-center justify-center gap-4 p-6">
      {children}
    </main>
  );
}

function ReanalyzeRun({
  repository,
  onDone,
  onCancel,
}: {
  repository: string;
  onDone(): void;
  onCancel(): void;
}) {
  const [stage, setStage] = useState<IngestStageId | null>(null);
  const [detail, setDetail] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [complete, setComplete] = useState(false);
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const [owner, repo] = repository.split("/");
    runIngest(owner!, repo!, (update) => {
      setStage(update.stage);
      setDetail(update.detail);
    })
      .then(() => {
        setComplete(true);
        window.setTimeout(onDone, 600);
      })
      .catch((failure: Error) => setError(failure.message));
  }, [repository, onDone]);
  return (
    <>
      <IngestProgress
        repository={repository}
        stage={stage}
        detail={detail}
        complete={complete}
        error={error}
      />
      {error && (
        <button onClick={onCancel} className={buttonClass.secondary}>
          Back
        </button>
      )}
    </>
  );
}

const VIEW_META: Record<WorkspaceView, { label: string; icon: typeof Network }> = {
  map: { label: "Map", icon: Network },
  findings: { label: "Findings", icon: AlertTriangle },
  activity: { label: "Activity", icon: Activity },
  change: { label: "Change", icon: GitPullRequestArrow },
};

type Pane = "files" | "main" | "inspector";

function Workspace(props: {
  data: Extract<SnapshotResult, { ok: true }>["data"];
  file: string | null;
  view: WorkspaceView;
  onNavigate(next: { file?: string | undefined; view?: WorkspaceView | undefined }): void;
  onReanalyze(): void;
}) {
  const { data, onNavigate } = props;
  const known = useMemo(() => new Set(data.analysis.files.map((file) => file.path)), [data]);
  const selected = props.file && known.has(props.file) ? props.file : null;
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [agentsOpen, setAgentsOpen] = useState(false);
  const [pane, setPane] = useState<Pane>("main");
  const select = useCallback(
    (path: string | null) => {
      onNavigate({ file: path ?? undefined });
      if (path) setPane((current) => (current === "files" ? "main" : current));
    },
    [onNavigate],
  );
  const setView = useCallback(
    (view: WorkspaceView) => {
      onNavigate({ view });
      setPane("main");
    },
    [onNavigate],
  );
  const api = useMemo(
    () => (data.source === "demo" ? demoApi : createWorkspaceApi(data.repository)),
    [data.source, data.repository],
  );
  const openFindings = data.findings.length;

  return (
    <WorkspaceProvider
      data={data}
      selected={selected}
      select={select}
      view={props.view}
      setView={setView}
      api={api}
    >
      <div className="bg-background flex h-screen flex-col">
        <header className="border-border flex shrink-0 items-center gap-3 border-b px-3 py-2 sm:px-4">
          <Wordmark />
          <span className="text-border" aria-hidden>
            /
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="truncate font-mono text-sm font-medium">{data.repository}</span>
              {data.source === "demo" && <Badge tone="info">Example</Badge>}
            </div>
            <p className="text-muted-foreground truncate text-xs">
              {data.analysis.stats.analyzedFiles.toLocaleString("en-US")} files at{" "}
              <span className="font-mono">{data.analysis.ref.slice(0, 7)}</span> · analyzed{" "}
              {timeAgo(data.createdAt)}
            </p>
          </div>
          <button
            onClick={() => setPaletteOpen(true)}
            className={cn(buttonClass.secondary, "hidden sm:inline-flex")}
            aria-label="Go to file"
          >
            <Search className="size-4" aria-hidden /> Go to file <Kbd>⌘K</Kbd>
          </button>
          <button
            onClick={() => setPaletteOpen(true)}
            className={cn(buttonClass.ghost, "sm:hidden")}
            aria-label="Go to file"
          >
            <Search className="size-4" aria-hidden />
          </button>
          {data.source === "github" && (
            <>
              <button onClick={() => setAgentsOpen(true)} className={buttonClass.secondary}>
                <Bot className="size-4" aria-hidden />
                <span className="hidden md:inline">Connect AI tools</span>
              </button>
              <button
                onClick={props.onReanalyze}
                className={buttonClass.ghost}
                aria-label="Analyze again"
              >
                <RefreshCw className="size-4" aria-hidden />
                <span className="hidden lg:inline">Re-analyze</span>
              </button>
            </>
          )}
          {data.source === "demo" && (
            <Link to="/" className={buttonClass.primary}>
              Use your repository
            </Link>
          )}
        </header>

        <div className="flex min-h-0 flex-1">
          <aside
            aria-label="Files"
            className={cn(
              "border-border bg-surface min-h-0 w-full shrink-0 border-r lg:block lg:w-72 xl:w-80",
              pane === "files" ? "block" : "hidden",
            )}
          >
            <Explorer />
          </aside>

          <main
            className={cn("min-w-0 flex-1 flex-col lg:flex", pane === "main" ? "flex" : "hidden")}
          >
            <div
              role="tablist"
              aria-label="Views"
              className="border-border flex shrink-0 gap-1 overflow-x-auto border-b px-3 pt-2"
            >
              {VIEWS.map((id) => {
                const { label, icon: Icon } = VIEW_META[id];
                const active = props.view === id;
                return (
                  <button
                    key={id}
                    role="tab"
                    aria-selected={active}
                    onClick={() => setView(id)}
                    className={cn(
                      "-mb-px inline-flex min-h-10 items-center gap-2 border-b-2 px-3 text-sm font-medium whitespace-nowrap transition-colors",
                      active
                        ? "border-primary text-foreground"
                        : "text-muted-foreground hover:text-foreground border-transparent",
                    )}
                  >
                    <Icon className="size-4" aria-hidden />
                    {label}
                    {id === "findings" && openFindings > 0 && (
                      <span className="bg-muted text-muted-foreground tabular rounded-full px-1.5 text-xs">
                        {openFindings}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            <div role="tabpanel" className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
              {props.view === "map" && <MapView />}
              {props.view === "findings" && <FindingsView />}
              {props.view === "activity" && <ActivityView />}
              {props.view === "change" && <ChangeView />}
            </div>
          </main>

          <aside
            aria-label="Inspector"
            className={cn(
              "border-border bg-surface min-h-0 w-full shrink-0 border-l lg:block lg:w-[22rem] xl:w-96",
              pane === "inspector" ? "block" : "hidden",
            )}
          >
            <Inspector />
          </aside>
        </div>

        <nav
          aria-label="Panels"
          className="border-border bg-surface grid shrink-0 grid-cols-3 border-t lg:hidden"
        >
          {(
            [
              ["files", "Files", FileCode2],
              ["main", VIEW_META[props.view].label, Network],
              ["inspector", selected ? "Inspector" : "Inspector", PanelRight],
            ] as const
          ).map(([id, label, Icon]) => (
            <button
              key={id}
              onClick={() => setPane(id)}
              aria-current={pane === id ? "page" : undefined}
              className={cn(
                "flex min-h-14 flex-col items-center justify-center gap-0.5 text-xs font-medium",
                pane === id ? "text-primary" : "text-muted-foreground",
              )}
            >
              <Icon className="size-5" aria-hidden />
              {label}
            </button>
          ))}
        </nav>
      </div>
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
      <ConnectAiTools open={agentsOpen} onClose={() => setAgentsOpen(false)} />
    </WorkspaceProvider>
  );
}
