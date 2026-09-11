import { Link, createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  Network,
  ShieldAlert,
  Cpu,
  GitBranch,
  BookOpen,
  Folder,
  FileCode,
  Sparkles,
  RefreshCw,
  ArrowLeft,
  Database,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  buildCoreModules,
  buildGroundedAiBrief,
  type CoreModule,
  type CoreFile,
} from "@/lib/intelligence-core";
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
    id: "structural",
    title: "1. Intelligence Memory",
    subtitle: "Global Structural Baseline",
    icon: Network,
    description: "Live 24/7 dependency graph, API contracts, and multi-repo linkage map.",
    files: [
      {
        name: "DependencyGraph.json",
        path: "/memory/structural/DependencyGraph.json",
        size: "42 KB",
        summary: "Live node adjacency matrix across connected repositories",
        content:
          '{\n  "org": "acme-enterprise",\n  "nodes": 214,\n  "edges": 1428,\n  "syncStatus": "active 24/7",\n  "apiContracts": "verified"\n}',
      },
      {
        name: "ApiContracts.ts",
        path: "/memory/structural/ApiContracts.ts",
        size: "18 KB",
        summary: "gRPC and REST endpoint specifications preventing drift",
        content:
          "export interface ApiContract {\n  endpoint: string;\n  version: string;\n  payloadSchema: Record<string, any>;\n}",
      },
      {
        name: "MultiRepoLinkage.yaml",
        path: "/memory/structural/MultiRepoLinkage.yaml",
        size: "12 KB",
        summary: "Cross-repository module mapping rules",
        content:
          'repos:\n  - name: streaming-engine\n    linkedModules: ["cdn-edge", "playback-api"]\n  - name: payments-api\n    linkedModules: ["ledger-sync", "webhook-router"]',
      },
    ],
  },
  {
    id: "vault",
    title: "2. Failure & Resolution Vault",
    subtitle: "Immune System Data",
    icon: ShieldAlert,
    description: "Historical software breaks, stack traces, and verified human patches.",
    files: [
      {
        name: "ERR_CONCURRENCY_092.json",
        path: "/memory/vault/ERR_CONCURRENCY_092.json",
        size: "8.4 KB",
        summary: "Deadlock stack trace in SessionStore.ts & mutex fix",
        content:
          '{\n  "incidentId": "ERR_CONCURRENCY_092",\n  "component": "SessionStore.ts",\n  "rootCause": "Race condition in TTL update",\n  "patchApplied": "Mutex lock around session writes",\n  "status": "Immunized"\n}',
      },
      {
        name: "ERR_JWT_MISMATCH_412.json",
        path: "/memory/vault/ERR_JWT_MISMATCH_412.json",
        size: "6.1 KB",
        summary: "RS256 algorithm fallback failure in AuthMiddleware",
        content:
          '{\n  "incidentId": "ERR_JWT_MISMATCH_412",\n  "component": "AuthMiddleware.ts",\n  "patchApplied": "Strict algorithm header enforcement",\n  "status": "Immunized"\n}',
      },
    ],
  },
  {
    id: "behavioral",
    title: "3. Behavioral Preference",
    subtitle: "RLHF & Alignment Logs",
    icon: Cpu,
    description: "Tracked record of human engineering choices and coding standards.",
    files: [
      {
        name: "CodingStandards.yaml",
        path: "/memory/behavioral/CodingStandards.yaml",
        size: "14 KB",
        summary: "Team style preferences and monad/async rules",
        content:
          'preferences:\n  errorHandling: "Explicit Result monads for core, try-catch for edge"\n  strictCasts: true\n  riskTolerance: "Strict"\n',
      },
      {
        name: "RlhfWeights.json",
        path: "/memory/behavioral/RlhfWeights.json",
        size: "9.2 KB",
        summary: "Active reinforcement learning reward weights",
        content:
          '{\n  "model": "nykst-architect-v2",\n  "safetyPreference": 0.98,\n  "totalPatchesEvaluated": 312\n}',
      },
    ],
  },
  {
    id: "treepub",
    title: "4. Tree-Split Learning",
    subtitle: "High- vs Low-Quality Pipeline",
    icon: GitBranch,
    description: "Pipeline separating clean production code from quarantined workarounds.",
    files: [
      {
        name: "PositiveCorpusIndex.json",
        path: "/memory/treepub/PositiveCorpusIndex.json",
        size: "22 KB",
        summary: "List of clean 100% typed production files (94.2%)",
        content:
          '{\n  "corpusType": "positive",\n  "filesCount": 3840,\n  "typeCoverage": "100%"\n}',
      },
      {
        name: "QuarantinedWorkarounds.json",
        path: "/memory/treepub/QuarantinedWorkarounds.json",
        size: "5.5 KB",
        summary: "Quarantined anti-patterns for negative reinforcement",
        content:
          '{\n  "corpusType": "negative_reinforcement",\n  "quarantinedFiles": ["legacy_auth_hack.js", "temp_bypass_cors.ts"]\n}',
      },
    ],
  },
  {
    id: "instruction",
    title: "5. Instruction-Tuning",
    subtitle: "Contextual QA & Prompt Logs",
    icon: BookOpen,
    description: "Developer prompts, ADRs, and internal documentation for AI architect.",
    files: [
      {
        name: "ADR-042-AuthFederation.md",
        path: "/memory/instruction/ADR-042-AuthFederation.md",
        size: "16 KB",
        summary: "Architecture Decision Record for OIDC and session clustering",
        content:
          "# ADR-042: OIDC Identity Federation\n\nStatus: Accepted\nDate: 2026-02-14\n\nContext: Decentralized authentication across microservices without single-point bottlenecks.",
      },
      {
        name: "InternalRunbooks.md",
        path: "/memory/instruction/InternalRunbooks.md",
        size: "24 KB",
        summary: "Incident response runbooks and failover protocols",
        content:
          "# Incident Response Runbook\n\n1. Check dependency graph for downstream blast radius.\n2. Verify failure vault for historical immunity patches.",
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
        const liveModules = buildCoreModules(snapshot);
        setRepositorySnapshot(snapshot);
        setModules(liveModules);
        setActiveModule(liveModules[0]!);
        setActiveFile(liveModules[0]!.files[0]!);
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

        {/* 5 Memory Modules Selector */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
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
