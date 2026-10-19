import { Link, createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import {
  Network,
  ShieldAlert,
  Folder,
  FileCode,
  Sparkles,
  RefreshCw,
  ArrowLeft,
  Database,
  Scale,
  Siren,
  Users,
  History,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { askNykstAi } from "@/lib/ai-client";
import {
  buildCoreModules,
  buildGroundedAiBrief,
  type CoreModule,
  type CoreFile,
} from "@/lib/intelligence-core";
import type { RepositorySnapshot } from "@/lib/repository-graph";
import { subscribeToIngestion } from "@/lib/realtime";
import { NykstBrand } from "@/components/brand/NykstLogo";

export const Route = createFileRoute("/intelligence")({
  head: () => ({
    meta: [
      { title: "Memory · Nykst" },
      {
        name: "description",
        content: "Explore system memory, repository evidence, and work with Nykst Memory.",
      },
    ],
  }),
  component: IntelligencePage,
});

interface MemoryFile {
  name: string;
  path: string;
  size: string;
  summary: string;
  content: string;
}

interface MemoryModule {
  id: string;
  title: string;
  subtitle: string;
  icon: LucideIcon;
  description: string;
  files: MemoryFile[];
}

const MEMORIES: MemoryModule[] = [
  {
    id: "outcome-weighted",
    title: "1. Outcome-Weighted Memory",
    subtitle: "Decisions tagged by what happened next",
    icon: Scale,
    description:
      "Stores architectural and code decisions with outcomes: held up, reverted, or caused issues. Built from changes over time, later modifications, reversions, and linked incidents. Used to filter durable patterns from failed ones.",
    files: [
      {
        name: "DecisionOutcomes.json",
        path: "/memory/outcome-weighted/DecisionOutcomes.json",
        size: "18 KB",
        summary: "Decisions paired with observed outcomes and confidence",
        content:
          '{\n  "heldUp": 42,\n  "reverted": 7,\n  "causedIssues": 5,\n  "source": "commits, pull requests, incidents"\n}',
      },
    ],
  },
  {
    id: "failure-pattern",
    title: "2. Failure-Pattern Memory",
    subtitle: "What broke, why, and the early warning signs",
    icon: ShieldAlert,
    description:
      "Stores structured records of failures, root causes, warning signals, and resolution paths. Built from incident logs, error tracking, and postmortems when integrated. Used for predictive alerts when a change resembles a past failure.",
    files: [
      {
        name: "FailurePatterns.json",
        path: "/memory/failure-pattern/FailurePatterns.json",
        size: "22 KB",
        summary: "Failure signatures mapped to root causes and warning signals",
        content:
          '{\n  "patterns": 18,\n  "warningSignals": ["retry spike", "error-rate drift"],\n  "source": "incidents, errors, postmortems"\n}',
      },
    ],
  },
  {
    id: "architectural-decision",
    title: "3. Architectural Decision Memory",
    subtitle: "Why the system was built this way",
    icon: Network,
    description:
      "Captures the reason behind a system or component at decision time, rather than reconstructing it later. Built from commit messages, pull requests, documentation, and direct input. Used to answer why instantly.",
    files: [
      {
        name: "ArchitectureDecisions.md",
        path: "/memory/architectural-decision/ArchitectureDecisions.md",
        size: "16 KB",
        summary: "Decision records with context, constraints, and rejected alternatives",
        content:
          "# Architecture Decision\n\nStatus: Accepted\n\nContext: The decision is recorded when made, with evidence and alternatives.\n\nSources: commits, PRs, docs, direct input.",
      },
    ],
  },
  {
    id: "incident-resolution",
    title: "4. Incident-Resolution Memory",
    subtitle: "What broke, what was tried, what fixed it",
    icon: Siren,
    description:
      "Stores paired incident and resolution records. Built from incident tools, ticketing systems, and resolved issue threads. Used to give engineers a direct playbook instead of repeating old investigations.",
    files: [
      {
        name: "ResolutionPlaybooks.json",
        path: "/memory/incident-resolution/ResolutionPlaybooks.json",
        size: "24 KB",
        summary: "Verified fixes paired with the incidents they resolved",
        content:
          '{\n  "playbooks": 12,\n  "verifiedFixes": 9,\n  "source": "incident tools, tickets, issue threads"\n}',
      },
    ],
  },
  {
    id: "team-convention",
    title: "5. Team Convention Memory",
    subtitle: "How this team writes and reviews code",
    icon: Users,
    description:
      "Stores accepted and rejected coding patterns plus recurring review feedback. Built from code-review comments and PR approval or rejection patterns. Requires code-review tool integration to become richer.",
    files: [
      {
        name: "TeamConventions.yaml",
        path: "/memory/team-convention/TeamConventions.yaml",
        size: "14 KB",
        summary: "Observed review preferences and accepted implementation patterns",
        content:
          'conventions:\n  accepted: ["explicit error paths", "small focused modules"]\n  rejected: ["hidden retries", "unowned migrations"]\n  source: "code review integration"',
      },
    ],
  },
  {
    id: "continuity",
    title: "6. Continuity Memory",
    subtitle: "The evolving timeline of system understanding",
    icon: History,
    description:
      "Stores the chain of how understanding changed across updates. It is not separately collected: it emerges automatically as the other five memory types accumulate over time.",
    files: [
      {
        name: "SystemContinuity.timeline",
        path: "/memory/continuity/SystemContinuity.timeline",
        size: "31 KB",
        summary: "A living timeline synthesized from the other five memories",
        content:
          '{\n  "timeline": "emergent",\n  "source": "outcome, failure, decisions, resolutions, conventions",\n  "collection": "automatic"\n}',
      },
    ],
  },
];

const MEMORY_GUIDE: Record<string, { does: string; source: string; usedFor: string }> = {
  "outcome-weighted": {
    does: "Connects each decision to what happened after it shipped.",
    source: "Change history, later modifications, reversions, and linked issues or incidents.",
    usedFor: "Finding patterns that held up and warning when an approach has failed before.",
  },
  "failure-pattern": {
    does: "Structures failures into symptoms, root causes, warning signs, and resolutions.",
    source: "Incident logs, error tracking, and postmortems when integrated.",
    usedFor: "Predictive alerts when a change resembles a known failure pattern.",
  },
  "architectural-decision": {
    does: "Preserves why a system or component was built a particular way.",
    source: "Commits, pull requests, linked documentation, and direct team input.",
    usedFor: "Answering why something exists without reconstructing the history manually.",
  },
  "incident-resolution": {
    does: "Pairs what broke with what was tried and what actually fixed it.",
    source: "Incident tools, tickets, and resolved issue threads.",
    usedFor: "Giving engineers a verified playbook instead of repeating an old investigation.",
  },
  "team-convention": {
    does: "Learns accepted and rejected implementation patterns from team reviews.",
    source: "Code-review comments and pull-request approval or rejection patterns.",
    usedFor: "Making suggestions match the team's real standards.",
  },
  continuity: {
    does: "Builds the evolving timeline of how system understanding changed.",
    source: "Automatically synthesized from the other five memory types over time.",
    usedFor: "Showing system evolution with no separate collection mechanism.",
  },
};

function IntelligencePage() {
  const [modules, setModules] = useState<Array<MemoryModule | CoreModule>>(MEMORIES);
  const [activeModule, setActiveModule] = useState<MemoryModule | CoreModule>(MEMORIES[0]!);
  const [activeFile, setActiveFile] = useState<MemoryFile | CoreFile>(activeModule.files[0]!);
  const [repositorySnapshot, setRepositorySnapshot] = useState<RepositorySnapshot | null>(null);
  const [query, setQuery] = useState(
    "Analyze this system artifact and explain its architectural significance.",
  );
  const [aiResult, setAiResult] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [realtimeTopic, setRealtimeTopic] = useState<string | null>(null);

  /** Loads the newest stored analysis, or falls back to the live self-indexed AST of this repository. */
  const loadLatest = useCallback(async () => {
    try {
      const response = await fetch("/api/integrations/github/latest", { cache: "no-store" });
      if (response.ok) {
        const data = (await response.json()) as {
          ingestion?: { payload?: RepositorySnapshot } | null;
          realtime?: { topic?: string };
        };
        if (data.realtime?.topic) setRealtimeTopic(data.realtime.topic);
        const snapshot = data.ingestion?.payload;
        if (snapshot) {
          setRepositorySnapshot(snapshot);
          const real = buildCoreModules(snapshot);
          const first = real.find((mod) => mod.files.length > 0);
          if (first) {
            setModules(real);
            setActiveModule(first);
            setActiveFile(first.files[0]!);
          }
          return;
        }
      }
      // Fall back to live self-indexed AST of this repository
      const selfRes = await fetch("/api/analysis/self", { cache: "no-store" });
      if (selfRes.ok) {
        const selfData = (await selfRes.json()) as { snapshotPayload?: RepositorySnapshot };
        if (selfData.snapshotPayload) {
          setRepositorySnapshot(selfData.snapshotPayload);
          const real = buildCoreModules(selfData.snapshotPayload);
          const first = real.find((mod) => mod.files.length > 0);
          if (first) {
            setModules(real);
            setActiveModule(first);
            setActiveFile(first.files[0]!);
          }
        }
      }
    } catch {
      // No repository evidence, no memory: the empty state stands.
    }
  }, []);

  useEffect(() => {
    void loadLatest();
  }, [loadLatest]);

  // Real-time push: the server broadcasts the moment a new analysis is stored, so this
  // page never shows a superseded snapshot once a repository is connected.
  useEffect(
    () => subscribeToIngestion(realtimeTopic, () => void loadLatest()),
    [realtimeTopic, loadLatest],
  );

  const handleSelectModule = (mod: MemoryModule | CoreModule) => {
    setActiveModule(mod);
    setActiveFile(mod.files[0]!);
    setAiResult(null);
  };

  const memoryGuide = MEMORY_GUIDE[activeModule.id];

  const handleAskAi = async () => {
    if (!repositorySnapshot) return;
    setLoading(true);
    setAiResult(null);
    const evidence = buildGroundedAiBrief(repositorySnapshot, query, activeFile);
    const answer = await askNykstAi(
      [
        query,
        "",
        "Answer only from the supplied repository evidence and cite the file paths, commit SHAs, pull request and issue numbers that appear in it.",
        "Never invent files, owners, incidents, dates or history that the evidence does not contain. If the evidence is insufficient, say exactly what is missing.",
      ].join("\n"),
      evidence,
    );
    setLoading(false);
    setAiResult(
      answer.ok
        ? answer.answer
        : `No AI provider answered this request (${answer.error}). The repository evidence sent with it is reproduced below, with nothing added.\n\n${evidence}`,
    );
  };

  if (!repositorySnapshot) {
    return (
      <main className="bg-background text-foreground flex min-h-screen flex-col">
        <header className="border-border bg-card/90 sticky top-0 z-50 flex items-center justify-between gap-3 border-b px-3 py-3 backdrop-blur sm:px-6 sm:py-4">
          <div className="flex min-w-0 items-center gap-2 sm:gap-4">
            <Link
              to="/graph"
              className="border-border bg-surface hover:bg-surface-2 flex min-h-9 items-center gap-1.5 rounded-lg border px-2.5 py-2 text-[11px] font-medium transition-colors sm:px-3 sm:text-xs"
            >
              <ArrowLeft className="size-3.5" /> Back to Graph
            </Link>
            <span className="glow-ring bg-primary block size-2 rounded-full" />
            <span className="text-foreground truncate text-sm font-semibold">Nykst Memory</span>
          </div>
          <span className="text-muted-foreground font-mono text-[10px] sm:text-xs">
            no repository connected
          </span>
        </header>

        <section className="mx-auto w-full max-w-3xl px-4 py-14 sm:px-6 sm:py-20">
          <p className="text-primary font-mono text-[10px] tracking-[0.24em] uppercase">
            System memory
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight">
            Nothing is remembered until a repository is connected.
          </h1>
          <p className="text-muted-foreground mt-4 text-sm leading-relaxed">
            Memory is built from the stored analysis of your repository: commits, pull requests,
            issues and the import graph. There is no seeded example history, so this page stays
            empty until you connect GitHub.
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <a
              href="/api/integrations/github/start"
              className="bg-primary text-primary-foreground rounded-lg px-4 py-2 text-xs font-semibold"
            >
              Connect GitHub
            </a>
            <Link to="/graph" className="text-primary text-xs underline">
              See what the analysis contains
            </Link>
          </div>

          <div className="border-border mt-10 border-t pt-8">
            <h2 className="text-lg font-semibold tracking-tight">
              The six memory types Nykst builds from that analysis
            </h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {MEMORIES.map((memory) => (
                <div key={memory.id} className="border-border bg-card/70 rounded-xl border p-4">
                  <div className="flex items-center gap-2">
                    <memory.icon className="text-primary size-4" />
                    <p className="text-sm font-medium">{memory.title}</p>
                  </div>
                  <p className="text-muted-foreground mt-0.5 font-mono text-[10px]">
                    {memory.subtitle}
                  </p>
                  <p className="text-muted-foreground mt-2 text-[11px] leading-relaxed">
                    {memory.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Header */}
      <header className="border-border sticky top-0 z-50 flex items-center justify-between gap-3 border-b bg-card/90 px-3 py-3 backdrop-blur sm:px-6 sm:py-4">
        <div className="flex min-w-0 items-center gap-2 sm:gap-4">
          <Link
            to="/graph"
            className="border-border bg-surface hover:bg-surface-2 flex min-h-9 items-center gap-1.5 rounded-lg border px-2.5 py-2 text-[11px] font-medium transition-colors sm:px-3 sm:text-xs"
          >
            <ArrowLeft className="size-3.5" /> Back to Graph
          </Link>
          <div className="flex items-center gap-2.5">
            <NykstBrand subtitle="Memory" size={26} />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="border-primary/30 bg-primary/10 text-primary inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-2 py-1 font-mono text-[10px] sm:px-3 sm:text-xs">
            <span className="bg-primary size-1.5 rounded-full" />
            {repositorySnapshot.repository?.full_name ?? "connected repository"}
          </span>
        </div>
      </header>

      {/* Main Content */}
      <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col space-y-5 p-3 sm:space-y-6 sm:p-6">
        <div>
          <span className="text-primary font-mono text-xs tracking-widest uppercase">
            System memory & collaborative analysis
          </span>
          <h1 className="text-gradient mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
            Memory workspace
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Select any memory type to see what it does, where its evidence comes from, and how it
            helps. In connected mode, evidence is grounded in your GitHub repository.
          </p>
        </div>

        {/* Six Memory Types Selector */}
        <div className="grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-3 xl:grid-cols-6">
          {modules.map((m) => {
            const Icon = m.icon;
            const isSelected = activeModule.id === m.id;
            return (
              <button
                key={m.id}
                onClick={() => handleSelectModule(m)}
                className={cn(
                  "min-h-[132px] rounded-xl border p-3 text-left transition-all flex flex-col justify-between sm:min-h-[150px] sm:p-4",
                  isSelected
                    ? "bg-primary/15 border-primary shadow-md"
                    : "border-border bg-card/70 hover:bg-card",
                )}
              >
                <div>
                  <div className="flex items-center justify-between">
                    <Icon
                      className={cn(
                        "size-4",
                        isSelected ? "text-primary" : "text-muted-foreground",
                      )}
                    />
                    <span className="font-mono text-[10px] text-muted-foreground">
                      {m.files.length} files
                    </span>
                  </div>
                  <h3
                    className={cn(
                      "mt-3 text-xs font-semibold leading-tight",
                      isSelected ? "text-foreground" : "text-muted-foreground",
                    )}
                  >
                    {m.title}
                  </h3>
                </div>
                <span className="mt-4 font-mono text-[11px] text-primary">Explore →</span>
              </button>
            );
          })}
        </div>

        {/* File Explorer & Memory Dashboard */}
        <div className="border-border bg-card/90 grid min-h-[480px] grid-cols-1 overflow-hidden rounded-2xl border shadow-2xl backdrop-blur lg:grid-cols-12">
          {/* Left: Files and Folders list */}
          <div className="border-border bg-surface/30 flex flex-col justify-between border-b p-4 sm:p-5 lg:col-span-4 lg:border-r lg:border-b-0">
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground font-mono">
                  {activeModule.subtitle}
                </span>
                <span className="font-mono text-[11px] text-primary">Folders & Files</span>
              </div>
              <p className="text-muted-foreground text-xs mb-4 leading-relaxed">
                {activeModule.description}
              </p>
              {repositorySnapshot && (
                <div className="border-primary/20 bg-primary/5 mb-4 rounded-lg border px-3 py-2 text-[10px] leading-relaxed">
                  <span className="text-primary font-mono uppercase tracking-wider">
                    Live GitHub evidence
                  </span>
                  <span className="text-muted-foreground mt-1 block">
                    {repositorySnapshot.repository?.full_name ?? "Connected repository"} ·{" "}
                    {repositorySnapshot.files?.length ?? 0} files ·{" "}
                    {repositorySnapshot.commits?.length ?? 0} commits ·{" "}
                    {repositorySnapshot.issues?.length ?? 0} issues
                  </span>
                </div>
              )}

              <div className="space-y-2">
                {activeModule.files.map((file) => {
                  const isSelected = activeFile.path === file.path;
                  return (
                    <button
                      key={file.path}
                      onClick={() => setActiveFile(file)}
                      className={cn(
                        "w-full flex items-center justify-between p-3 rounded-xl text-left text-xs transition-all",
                        isSelected
                          ? "bg-primary text-primary-foreground font-medium shadow-sm"
                          : "bg-surface/80 border border-border text-foreground hover:bg-surface",
                      )}
                    >
                      <div className="flex items-center gap-2 truncate">
                        <FileCode
                          className={cn(
                            "size-4 shrink-0",
                            isSelected ? "text-primary-foreground" : "text-primary",
                          )}
                        />
                        <span className="truncate font-mono">{file.name}</span>
                      </div>
                      <span
                        className={cn(
                          "font-mono text-[10px]",
                          isSelected ? "text-primary-foreground/80" : "text-muted-foreground",
                        )}
                      >
                        {file.size}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="mt-6 border-t border-border pt-4 text-[11px] text-muted-foreground font-mono">
              Path: <span className="text-foreground">{activeFile.path}</span>
            </div>
          </div>

          {/* Right: File Content & Ask AI */}
          <div className="flex flex-col justify-between space-y-5 bg-card/50 p-4 sm:space-y-6 sm:p-6 lg:col-span-8">
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-border pb-3">
                <div>
                  <span className="font-mono text-xs text-primary font-semibold">
                    {activeFile.name}
                  </span>
                  <p className="text-muted-foreground text-xs mt-0.5">{activeFile.summary}</p>
                </div>
                <span className="font-mono text-[11px] text-muted-foreground border border-border px-2.5 py-1 rounded-lg bg-surface">
                  Indexed Artifact
                </span>
              </div>

              {/* File Content Preview */}
              <div className="border-border bg-surface/90 max-h-64 overflow-x-auto rounded-xl border p-3 font-mono text-[11px] leading-relaxed text-foreground shadow-inner sm:p-4 sm:text-xs">
                <pre>{activeFile.content}</pre>
              </div>
            </div>

            {/* Memory Section */}
            <div className="border-border bg-surface/60 rounded-xl border p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <Sparkles className="size-4 text-primary" /> Work with Memory on this file
                </span>
                <span className="font-mono text-[11px] text-muted-foreground">
                  Instant Codebase QA
                </span>
              </div>
              {memoryGuide && (
                <div className="grid gap-3 border-t border-border pt-3 text-[11px] md:grid-cols-3">
                  <div>
                    <span className="text-primary font-mono uppercase tracking-wider">
                      What it does
                    </span>
                    <p className="text-muted-foreground mt-1 leading-relaxed">
                      {memoryGuide.does}
                    </p>
                  </div>
                  <div>
                    <span className="text-primary font-mono uppercase tracking-wider">
                      Data source
                    </span>
                    <p className="text-muted-foreground mt-1 leading-relaxed">
                      {memoryGuide.source}
                    </p>
                  </div>
                  <div>
                    <span className="text-primary font-mono uppercase tracking-wider">
                      Used for
                    </span>
                    <p className="text-muted-foreground mt-1 leading-relaxed">
                      {memoryGuide.usedFor}
                    </p>
                  </div>
                </div>
              )}

              <div className="flex gap-2">
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="flex-1 bg-card border border-border rounded-xl px-3.5 py-2.5 text-xs text-foreground outline-none focus:border-primary font-mono"
                />
                <button
                  onClick={handleAskAi}
                  disabled={loading}
                  className="bg-primary text-primary-foreground hover:bg-primary-glow px-4 py-2.5 rounded-xl text-xs font-semibold transition-colors flex items-center gap-2 shrink-0"
                >
                  {loading ? (
                    <RefreshCw className="size-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="size-3.5" />
                  )}
                  Ask Memory
                </button>
              </div>

              {aiResult && (
                <div className="border-border bg-card rounded-xl border p-3.5 text-xs font-mono text-foreground whitespace-pre-line leading-relaxed shadow-sm">
                  {aiResult}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
