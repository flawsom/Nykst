import { Link, createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
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
import { buildGroundedAiBrief, type CoreModule, type CoreFile } from "@/lib/intelligence-core";
import type { RepositorySnapshot } from "@/lib/repository-graph";

export const Route = createFileRoute("/intelligence")({
  head: () => ({
    meta: [
      { title: "Memory — Nykst" },
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

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("demo") === "1") return;
    fetch("/api/integrations/github/latest")
      .then(async (response) => {
        if (!response.ok) return null;
        const data = (await response.json()) as {
          ingestion?: { payload?: RepositorySnapshot } | null;
        };
        return data.ingestion?.payload ?? null;
      })
      .then((snapshot) => {
        if (!snapshot) return;
        setRepositorySnapshot(snapshot);
        // Keep the six memory types as the stable navigation model in live mode too.
        // Repository evidence grounds the Memory query below without replacing the taxonomy.
      })
      .catch(() => undefined);
  }, []);

  const handleSelectModule = (mod: MemoryModule | CoreModule) => {
    setActiveModule(mod);
    setActiveFile(mod.files[0]!);
    setAiResult(null);
  };

  const handleAskAi = () => {
    setLoading(true);
    setAiResult(null);
    window.setTimeout(() => {
      setLoading(false);
      setAiResult(
        repositorySnapshot
          ? buildGroundedAiBrief(repositorySnapshot, query, activeFile)
          : `[Nykst Memory Analysis — ${activeFile.name}]\n1. File Purpose: ${activeFile.summary}\n2. Structural Relevance: Directly tied to ${activeModule.subtitle}.\n3. Verification Status: Demo memory only; connect GitHub to ground this analysis in a real repository.`,
      );
    }, 450);
  };

  return (
    <main className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Header */}
      <header className="border-border flex items-center justify-between gap-4 border-b px-6 py-4 bg-card/90 backdrop-blur sticky top-0 z-50">
        <div className="flex items-center gap-4">
          <Link
            to="/graph"
            className="border-border bg-surface hover:bg-surface-2 flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors"
          >
            <ArrowLeft className="size-3.5" /> Back to Graph
          </Link>
          <div className="flex items-center gap-2.5">
            <span className="glow-ring bg-primary block size-2 rounded-full" />
            <span className="text-sm font-semibold text-foreground">Nykst Memory</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 font-mono text-xs text-emerald-400">
            <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" />
            24/7 Live Sync Active
          </span>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 max-w-7xl mx-auto w-full p-6 space-y-6">
        <div>
          <span className="text-primary font-mono text-xs tracking-widest uppercase">
            System memory & collaborative analysis
          </span>
          <h1 className="text-gradient mt-2 text-3xl font-semibold tracking-tight">
            Memory workspace
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Select a system memory category, inspect its evidence, and work with Nykst Memory.
          </p>
        </div>

        {/* Six Memory Types Selector */}
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-6">
          {modules.map((m) => {
            const Icon = m.icon;
            const isSelected = activeModule.id === m.id;
            return (
              <button
                key={m.id}
                onClick={() => handleSelectModule(m)}
                className={cn(
                  "p-4 rounded-xl border text-left transition-all flex flex-col justify-between",
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
        <div className="border-border bg-card/90 rounded-2xl border backdrop-blur overflow-hidden shadow-2xl grid grid-cols-1 lg:grid-cols-12 min-h-[480px]">
          {/* Left: Files and Folders list */}
          <div className="border-border lg:col-span-4 border-r bg-surface/30 p-5 flex flex-col justify-between">
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
          <div className="lg:col-span-8 p-6 flex flex-col justify-between bg-card/50 space-y-6">
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
              <div className="border-border bg-surface/90 rounded-xl border p-4 font-mono text-xs text-foreground overflow-x-auto max-h-56 leading-relaxed shadow-inner">
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
