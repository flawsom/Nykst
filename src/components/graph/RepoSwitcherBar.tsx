import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  GitBranch,
  Github,
  Layers,
  Loader2,
  Plus,
  Search,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

export interface RepoWorkspace {
  repository: string;
  created_at: string;
  status?: string;
  branch?: string | null;
  commit?: string | null;
  files?: number;
  sourceFiles?: number;
  edges?: number;
}

interface AvailableRepository {
  full_name: string;
  name?: string;
  private?: boolean;
  default_branch?: string;
  description?: string | null;
  owner?: string;
}

const SELF_REPOSITORY = "flawsom/nykst";

const PROGRESS_STEPS = [
  "Downloading tarball",
  "Compiling AST",
  "Linking SQL and services",
  "Saving snapshot",
];

function formatWhen(iso: string | null | undefined) {
  if (!iso) return "not analyzed yet";
  const when = Date.parse(iso);
  if (Number.isNaN(when)) return "unknown time";
  const seconds = Math.max(0, Math.round((Date.now() - when) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function shortCommit(commit: string | null | undefined) {
  return commit ? commit.slice(0, 7) : null;
}

function splitRepository(fullName: string) {
  const [owner, repo] = fullName.split("/");
  return { owner: owner ?? "", repo: repo ?? fullName };
}

export function RepoSwitcherBar({
  activeRepo,
  onSwitch,
  onAnalyzed,
  className,
}: {
  activeRepo: string | null;
  onSwitch: (repository: string) => void;
  onAnalyzed?: (repository: string) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"workspaces" | "connect">("workspaces");
  const [workspaces, setWorkspaces] = useState<RepoWorkspace[]>([]);
  const [available, setAvailable] = useState<AvailableRepository[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [search, setSearch] = useState("");
  const [branches, setBranches] = useState<Record<string, string>>({});
  const [analyzing, setAnalyzing] = useState<string | null>(null);
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [connectRequired, setConnectRequired] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const active = activeRepo ?? SELF_REPOSITORY;
  const activeWorkspace = workspaces.find((item) => item.repository === active) ?? null;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setConnectRequired(false);
    try {
      const [latestResponse, repositoryResponse] = await Promise.all([
        fetch("/api/integrations/github/latest", { cache: "no-store" }),
        fetch("/api/integrations/github/repositories", { cache: "no-store" }),
      ]);
      if (latestResponse.status === 401 || repositoryResponse.status === 401) {
        setConnectRequired(true);
        return;
      }
      if (latestResponse.ok) {
        const payload = (await latestResponse.json()) as { repositories?: RepoWorkspace[] };
        setWorkspaces(payload.repositories ?? []);
      }
      if (repositoryResponse.ok) {
        const payload = (await repositoryResponse.json()) as {
          repositories?: AvailableRepository[];
        };
        const list = payload.repositories ?? [];
        setAvailable(list);
        setBranches((current) => {
          const next = { ...current };
          for (const repository of list)
            if (!next[repository.full_name])
              next[repository.full_name] = repository.default_branch ?? "main";
          return next;
        });
      } else {
        const payload = (await repositoryResponse.json().catch(() => ({}))) as { error?: string };
        setError(payload.error ?? "Could not load your GitHub repositories.");
      }
    } catch {
      setError("Network error while loading repositories.");
    } finally {
      setLoading(false);
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (open && !loaded) void load();
  }, [open, loaded, load]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  useEffect(() => {
    if (!analyzing) return;
    setStep(0);
    const timer = window.setInterval(
      () => setStep((current) => Math.min(current + 1, PROGRESS_STEPS.length - 1)),
      1700,
    );
    return () => window.clearInterval(timer);
  }, [analyzing]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    const list = available.filter(
      (repository) =>
        !query ||
        repository.full_name.toLowerCase().includes(query) ||
        (repository.description ?? "").toLowerCase().includes(query),
    );
    return list.slice(0, 120);
  }, [available, search]);

  const choose = (repository: string) => {
    setOpen(false);
    onSwitch(repository);
  };

  const analyze = async (repository: AvailableRepository) => {
    const { owner, repo } = splitRepository(repository.full_name);
    if (!owner || !repo) return;
    setAnalyzing(repository.full_name);
    setError(null);
    setStep(0);
    try {
      const response = await fetch("/api/integrations/github/ingest", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ owner, repo, branch: branches[repository.full_name] || undefined }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        repository?: { full_name?: string };
      };
      if (!response.ok) throw new Error(payload.error ?? "Analysis failed.");
      const analyzed = payload.repository?.full_name ?? repository.full_name;
      setStep(PROGRESS_STEPS.length);
      setOpen(false);
      onAnalyzed?.(analyzed);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Analysis failed.");
    } finally {
      setAnalyzing(null);
    }
  };

  const workspaceRow = (repository: RepoWorkspace, live: boolean) => {
    const isActive = repository.repository === active;
    return (
      <button
        key={`${repository.repository}-${live ? "live" : "ingested"}`}
        onClick={() => choose(repository.repository)}
        className={cn(
          "flex w-full items-start justify-between gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors",
          isActive
            ? "border-primary/50 bg-primary/10"
            : "border-border bg-surface/70 hover:border-primary/40 hover:bg-surface",
        )}
      >
        <div className="min-w-0">
          <p className="truncate font-mono text-xs font-semibold">{repository.repository}</p>
          <p className="text-muted-foreground mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 font-mono text-[10px]">
            {live ? (
              <span className="text-foreground inline-flex items-center gap-1.5">
                <span className="bg-live size-1 rounded-full" /> Live Workspace
              </span>
            ) : (
              <>
                <span>{formatWhen(repository.created_at)}</span>
                {repository.branch && (
                  <span className="inline-flex items-center gap-1">
                    <GitBranch className="size-2.5" />
                    {repository.branch}
                  </span>
                )}
                {shortCommit(repository.commit) && <span>{shortCommit(repository.commit)}</span>}
                {typeof repository.sourceFiles === "number" && (
                  <span>{repository.sourceFiles} files</span>
                )}
                {typeof repository.edges === "number" && <span>{repository.edges} edges</span>}
              </>
            )}
          </p>
        </div>
        {isActive && <Check className="text-brand-ivory mt-0.5 size-4 shrink-0" />}
      </button>
    );
  };

  return (
    <div
      ref={containerRef}
      data-testid="workspace-repo-switcher"
      data-active-repo={active}
      className={cn("relative min-w-0 max-w-full shrink-0", className)}
    >
      <div className="border-border bg-surface/80 flex max-w-full items-center gap-2 rounded-xl border px-2.5 py-1.5">
        <Layers className="text-subtle-foreground size-3.5 shrink-0" />
        <div className="min-w-0">
          <p className="text-muted-foreground font-mono text-[9px] tracking-[0.18em] uppercase">
            Active repository
          </p>
          <p className="max-w-[46vw] truncate font-mono text-xs font-semibold sm:max-w-[260px]">
            {active}
            {active === SELF_REPOSITORY && (
              <span className="text-subtle-foreground ml-1.5 hidden text-[10px] sm:inline">
                live workspace
              </span>
            )}
          </p>
        </div>
        <div className="text-muted-foreground hidden items-center gap-2 font-mono text-[10px] sm:flex">
          {activeWorkspace?.branch && (
            <span className="inline-flex items-center gap-1">
              <GitBranch className="size-2.5" />
              {activeWorkspace.branch}
            </span>
          )}
          {shortCommit(activeWorkspace?.commit) && (
            <span>{shortCommit(activeWorkspace?.commit)}</span>
          )}
          {activeWorkspace && <span>{formatWhen(activeWorkspace.created_at)}</span>}
        </div>
        <button
          onClick={() => setOpen((current) => !current)}
          aria-expanded={open}
          aria-haspopup="dialog"
          aria-label="Switch repository"
          className="border-border text-foreground hover:border-primary/45 hover:bg-surface/70 ml-auto inline-flex shrink-0 items-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-semibold transition-colors sm:px-2.5"
        >
          <span className="hidden sm:inline">Switch repository</span>
          <ChevronDown className={cn("size-3 transition-transform", open && "rotate-180")} />
        </button>
      </div>

      {open && (
        <>
          <button
            aria-label="Close repository switcher"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-[70] cursor-default bg-black/40"
            tabIndex={-1}
          />
          <div
            role="dialog"
            aria-label="Switch repository"
            className="border-border bg-card fixed inset-x-2 top-16 z-[71] max-h-[78vh] overflow-y-auto rounded-2xl border p-3 shadow-2xl sm:absolute sm:inset-x-auto sm:top-auto sm:right-0 sm:mt-2 sm:w-[460px]"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex rounded-lg border border-border bg-surface p-1">
                <button
                  onClick={() => setTab("workspaces")}
                  className={cn(
                    "rounded-md px-2.5 py-1 text-[11px] font-semibold transition-colors",
                    tab === "workspaces"
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  Analyzed Workspaces
                </button>
                <button
                  onClick={() => setTab("connect")}
                  className={cn(
                    "flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-semibold transition-colors",
                    tab === "connect"
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Plus className="size-3" />
                  Analyze another repo
                </button>
              </div>
              <button
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="text-muted-foreground hover:text-foreground rounded-lg p-1"
              >
                <X className="size-4" />
              </button>
            </div>

            {error && (
              <p className="border-risk/40 bg-risk/10 text-foreground mt-3 flex items-start gap-1.5 rounded-lg border px-2.5 py-2 text-[11px] leading-relaxed">
                <AlertTriangle className="text-risk mt-0.5 size-3 shrink-0" />
                {error}
              </p>
            )}

            {connectRequired && (
              <div className="border-border bg-surface/60 mt-3 rounded-lg border px-3 py-2.5">
                <p className="text-xs font-medium">GitHub is not connected yet.</p>
                <p className="text-muted-foreground mt-1 text-[11px] leading-relaxed">
                  The live self-indexed workspace stays available. Connect GitHub to switch between
                  your own repositories.
                </p>
                <a
                  href="/api/integrations/github/start"
                  className="bg-primary text-primary-foreground mt-2 inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-semibold"
                >
                  <Github className="size-3.5" /> Connect GitHub
                </a>
              </div>
            )}

            {tab === "workspaces" ? (
              <div className="mt-3 space-y-2">
                {workspaceRow(
                  {
                    repository: SELF_REPOSITORY,
                    created_at: new Date().toISOString(),
                    branch: "main",
                  },
                  true,
                )}
                {workspaces
                  .filter((workspace) => workspace.repository !== SELF_REPOSITORY)
                  .map((workspace) => workspaceRow(workspace, false))}
                {loading && (
                  <p className="text-muted-foreground flex items-center gap-2 px-1 py-2 font-mono text-[11px]">
                    <Loader2 className="size-3 animate-spin" /> Loading analyzed workspaces…
                  </p>
                )}
                {!loading &&
                  !workspaces.filter((item) => item.repository !== SELF_REPOSITORY).length && (
                    <p className="text-muted-foreground border-border rounded-lg border border-dashed p-3 text-[11px] leading-relaxed">
                      No other repository has been analyzed yet. Open the second tab, pick a
                      repository and Nykst compiles it into the same circular graph.
                    </p>
                  )}
              </div>
            ) : (
              <div className="mt-3 space-y-2">
                <label className="border-border bg-surface flex items-center gap-2 rounded-lg border px-2.5 py-1.5">
                  <Search className="text-muted-foreground size-3.5" />
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search your GitHub repositories"
                    className="text-foreground placeholder:text-muted-foreground w-full bg-transparent text-xs outline-none"
                  />
                </label>
                {loading && (
                  <p className="text-muted-foreground flex items-center gap-2 px-1 py-2 font-mono text-[11px]">
                    <Loader2 className="size-3 animate-spin" /> Loading repositories…
                  </p>
                )}
                <div className="max-h-[44vh] space-y-1.5 overflow-y-auto pr-1">
                  {filtered.map((repository) => {
                    const busy = analyzing === repository.full_name;
                    return (
                      <div
                        key={repository.full_name}
                        className="border-border bg-surface/70 rounded-lg border px-3 py-2"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate font-mono text-[11px] font-semibold">
                              {repository.full_name}
                            </p>
                            <p className="text-muted-foreground mt-0.5 flex items-center gap-1.5 font-mono text-[10px]">
                              {repository.private && <span>private</span>}
                              {repository.default_branch && (
                                <span>{repository.default_branch}</span>
                              )}
                            </p>
                          </div>
                          <input
                            value={
                              branches[repository.full_name] ?? repository.default_branch ?? "main"
                            }
                            onChange={(event) =>
                              setBranches((current) => ({
                                ...current,
                                [repository.full_name]: event.target.value,
                              }))
                            }
                            aria-label={`Branch for ${repository.full_name}`}
                            className="border-border bg-card w-24 shrink-0 rounded-md border px-2 py-1 font-mono text-[10px]"
                          />
                        </div>
                        <div className="mt-2 flex items-center justify-between gap-2">
                          <span className="text-muted-foreground truncate text-[10px]">
                            {repository.description ?? "No description"}
                          </span>
                          <button
                            onClick={() => void analyze(repository)}
                            disabled={Boolean(analyzing)}
                            className="bg-primary text-primary-foreground disabled:opacity-60 inline-flex shrink-0 items-center gap-1 rounded-md px-2.5 py-1 text-[10px] font-semibold"
                          >
                            {busy ? <Loader2 className="size-3 animate-spin" /> : null}
                            {busy ? "Analyzing…" : "Analyze Repo"}
                          </button>
                        </div>
                        {busy && (
                          <ol className="mt-2 space-y-1">
                            {PROGRESS_STEPS.map((label, index) => {
                              const done = step > index;
                              const activeStep = step === index;
                              return (
                                <li
                                  key={label}
                                  className={cn(
                                    "flex items-center gap-1.5 font-mono text-[10px]",
                                    done
                                      ? "text-emerald-300"
                                      : activeStep
                                        ? "text-primary"
                                        : "text-muted-foreground/70",
                                  )}
                                >
                                  {done ? (
                                    <Check className="size-3" />
                                  ) : activeStep ? (
                                    <Loader2 className="size-3 animate-spin" />
                                  ) : (
                                    <span className="border-border size-2 rounded-full border" />
                                  )}
                                  {label}
                                </li>
                              );
                            })}
                          </ol>
                        )}
                      </div>
                    );
                  })}
                </div>
                {!loading && !filtered.length && (
                  <p
                    data-testid="repo-search-empty"
                    className="text-muted-foreground border-border rounded-lg border border-dashed p-3 text-[11px] leading-relaxed"
                  >
                    {search.includes("/")
                      ? `${search.trim()} is treated as a public repository. Public precomputed graphs are not loaded in this build, so it cannot be browsed yet. Nykst does not fall back to sample data for a repo it cannot load.`
                      : available.length
                        ? "No repository matches that search."
                        : "No repositories are available. Connect GitHub or grant the Nykst app access to the repositories you want to map."}
                  </p>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
