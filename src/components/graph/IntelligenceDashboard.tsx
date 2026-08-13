import { useState } from "react";
import { 
  Network, 
  ShieldAlert, 
  Cpu, 
  GitBranch, 
  BookOpen, 
  CheckCircle2, 
  XCircle, 
  Terminal, 
  Folder, 
  FileCode, 
  Search, 
  Sparkles,
  ChevronRight,
  RefreshCw,
  Database,
  Layers,
  Lock,
  ArrowRight
} from "lucide-react";
import { cn } from "@/lib/utils";

interface FileItem {
  name: string;
  type: "file" | "folder";
  path: string;
  size?: string;
  summary: string;
  content?: string;
}

interface MemoryCategory {
  id: "structural" | "vault" | "behavioral" | "treepub" | "instruction";
  title: string;
  subtitle: string;
  icon: any;
  description: string;
  files: FileItem[];
}

const MEMORY_CATEGORIES: MemoryCategory[] = [
  {
    id: "structural",
    title: "1. Intelligence Memory",
    subtitle: "Global Structural Baseline",
    icon: Network,
    description: "Live 24/7 dependency graph, API contracts, and multi-repo linkage map giving AI structural context across the enterprise.",
    files: [
      {
        name: "architecture",
        type: "folder",
        path: "/memory/structural/architecture",
        summary: "Cross-repo dependency maps and gRPC schemas",
        content: "Contains enterprise topology graphs, service linkage matrices, and protocol buffers."
      },
      {
        name: "DependencyGraph.json",
        type: "file",
        path: "/memory/structural/architecture/DependencyGraph.json",
        size: "42 KB",
        summary: "Live node adjacency matrix across 14 connected repos",
        content: "{\n  \"org\": \"acme-enterprise\",\n  \"nodes\": 214,\n  \"edges\": 1428,\n  \"syncStatus\": \"active\",\n  \"lastIndexed\": \"2026-08-13T12:00:00Z\"\n}"
      },
      {
        name: "ApiContracts.ts",
        type: "file",
        path: "/memory/structural/architecture/ApiContracts.ts",
        size: "18 KB",
        summary: "Verified gRPC and REST endpoint specifications",
        content: "export interface ApiContract {\n  endpoint: string;\n  version: string;\n  payloadSchema: Record<string, any>;\n  rateLimit: number;\n}"
      },
      {
        name: "MultiRepoLinkage.yaml",
        type: "file",
        path: "/memory/structural/architecture/MultiRepoLinkage.yaml",
        size: "12 KB",
        summary: "Cross-repository module mapping rules",
        content: "repos:\n  - name: netflix/streaming-engine\n    linkedModules: [\"cdn-edge\", \"playback-api\"]\n  - name: stripe/payments-api\n    linkedModules: [\"ledger-sync\", \"webhook-router\"]"
      }
    ]
  },
  {
    id: "vault",
    title: "2. Failure & Resolution Vault",
    subtitle: "Immune System Data",
    icon: ShieldAlert,
    description: "Permanent log of historical software breaks, stack traces, and verified human patches acting as an automated immune response.",
    files: [
      {
        name: "incidents",
        type: "folder",
        path: "/memory/vault/incidents",
        summary: "Historical stack traces and verified fix patches",
        content: "Permanent archive of resolved production incidents and automated regression guards."
      },
      {
        name: "ERR_CONCURRENCY_092.json",
        type: "file",
        path: "/memory/vault/incidents/ERR_CONCURRENCY_092.json",
        size: "8.4 KB",
        summary: "Deadlock stack trace in SessionStore.ts & mutex fix",
        content: "{\n  \"id\": \"ERR_CONCURRENCY_092\",\n  \"component\": \"SessionStore.ts\",\n  \"rootCause\": \"Race condition in TTL update\",\n  \"patch\": \"Mutex lock applied around session writes\",\n  \"status\": \"Immunized\"\n}"
      },
      {
        name: "ERR_JWT_MISMATCH_412.json",
        type: "file",
        path: "/memory/vault/incidents/ERR_JWT_MISMATCH_412.json",
        size: "6.1 KB",
        summary: "RS256 algorithm fallback failure in AuthMiddleware",
        content: "{\n  \"id\": \"ERR_JWT_MISMATCH_412\",\n  \"component\": \"AuthMiddleware.ts\",\n  \"rootCause\": \"Legacy token decoding fallback error\",\n  \"patch\": \"Strict algorithm header enforcement\",\n  \"status\": \"Immunized\"\n}"
      }
    ]
  },
  {
    id: "behavioral",
    title: "3. Behavioral Preference",
    subtitle: "RLHF & Alignment Logs",
    icon: Cpu,
    description: "Tracked record of human engineering choices (accepted vs rejected virtual simulation patches) aligning AI generation style.",
    files: [
      {
        name: "alignment",
        type: "folder",
        path: "/memory/behavioral/alignment",
        summary: "Human engineering preference weights and coding standards",
        content: "Stores team risk tolerance profiles and simulated patch approval histories."
      },
      {
        name: "CodingStandards.yaml",
        type: "file",
        path: "/memory/behavioral/alignment/CodingStandards.yaml",
        size: "14 KB",
        summary: "Team style preferences and monad/async rules",
        content: "preferences:\n  errorHandling: \"Explicit Result monads for core, try-catch for edge\"\n  strictCasts: true\n  maxCyclomaticComplexity: 12"
      },
      {
        name: "RlhfWeights.json",
        type: "file",
        path: "/memory/behavioral/alignment/RlhfWeights.json",
        size: "9.2 KB",
        summary: "Active reinforcement learning reward weights",
        content: "{\n  \"model\": \"nykst-architect-v2\",\n  \"safetyPreference\": 0.98,\n  \"concisenessWeight\": 0.85,\n  \"totalPatchesEvaluated\": 312\n}"
      }
    ]
  },
  {
    id: "treepub",
    title: "4. Tree-Split Learning",
    subtitle: "High- vs Low-Quality Pipeline",
    icon: GitBranch,
    description: "Self-cleaning data pipeline separating clean production code from messy workarounds for active model training.",
    files: [
      {
        name: "corpus",
        type: "folder",
        path: "/memory/treepub/corpus",
        summary: "Positive production corpus and quarantined negative workarounds",
        content: "Manages data separation for generative fine-tuning and negative reinforcement."
      },
      {
        name: "PositiveCorpusIndex.json",
        type: "file",
        path: "/memory/treepub/corpus/PositiveCorpusIndex.json",
        size: "22 KB",
        summary: "List of clean, 100% typed production files (94.2% of codebase)",
        content: "{\n  \"corpusType\": \"positive\",\n  \"filesCount\": 3840,\n  \"averageLocPerFile\": 145,\n  \"typeCoverage\": \"100%\"\n}"
      },
      {
        name: "QuarantinedWorkarounds.json",
        type: "file",
        path: "/memory/treepub/corpus/QuarantinedWorkarounds.json",
        size: "5.5 KB",
        summary: "Quarantined anti-patterns used for negative reinforcement",
        content: "{\n  \"corpusType\": \"negative_reinforcement\",\n  \"quarantinedFiles\": [\"legacy_auth_hack.js\", \"temp_bypass_cors.ts\"],\n  \"purpose\": \"Teach AI anti-patterns to avoid\"\n}"
      }
    ]
  },
  {
    id: "instruction",
    title: "5. Instruction-Tuning",
    subtitle: "Contextual QA & Prompt Logs",
    icon: BookOpen,
    description: "Repository of developer prompts, architecture decision records (ADRs), and internal documentation powering the expert AI architect.",
    files: [
      {
        name: "docs",
        type: "folder",
        path: "/memory/instruction/docs",
        summary: "Architecture Decision Records (ADRs) and internal runbooks",
        content: "Comprehensive internal documentation indexed for instantaneous context retrieval."
      },
      {
        name: "ADR-042-AuthFederation.md",
        type: "file",
        path: "/memory/instruction/docs/ADR-042-AuthFederation.md",
        size: "16 KB",
        summary: "Architecture Decision Record for OIDC and session clustering",
        content: "# ADR-042: OIDC Identity Federation\n\nStatus: Accepted\nDate: 2026-02-14\n\nContext: We needed decentralized authentication across microservices without single-point database bottlenecks..."
      },
      {
        name: "InternalRunbooks.md",
        type: "file",
        path: "/memory/instruction/docs/InternalRunbooks.md",
        size: "24 KB",
        summary: "Incident response runbooks and failover protocols",
        content: "# Incident Response Runbook\n\n1. Check dependency graph for downstream blast radius.\n2. Verify failure vault for historical immunity patches.\n3. Dispatch gRPC health probe."
      }
    ]
  }
];

interface IntelligenceDashboardProps {
  projectName: string;
  repo: string;
}

export function IntelligenceDashboard({ projectName, repo }: IntelligenceDashboardProps) {
  const [selectedCategory, setSelectedCategory] = useState<MemoryCategory>(MEMORY_CATEGORIES[0]!);
  const [selectedFile, setSelectedFile] = useState<FileItem>(selectedCategory.files[0]!);
  const [question, setQuestion] = useState("How does the system ensure zero downtime during schema migrations across microservices?");
  const [aiAnswer, setAiAnswer] = useState<string | null>(null);
  const [isAsking, setIsAsking] = useState(false);

  const handleSelectCategory = (cat: MemoryCategory) => {
    setSelectedCategory(cat);
    setSelectedFile(cat.files[0]!);
    setAiAnswer(null);
  };

  const handleAskAi = () => {
    setIsAsking(true);
    setAiAnswer(null);
    setTimeout(() => {
      setIsAsking(false);
      setAiAnswer(`[Nykst Expert Architect Memory — ${repo}]
Based on structural baseline graph analysis and instruction-tuning records (${selectedCategory.title}):
1. Schema migrations utilize backward-compatible protobuf field additions governed by ApiContracts.ts.
2. The DependencyGraph ensures dependent microservices maintain contract compatibility before traffic is routed.
3. Historical immunity vaults confirm zero regression failures across 1,428 indexed endpoints.`);
    }, 900);
  };

  return (
    <div className="border-border bg-card/95 mt-10 rounded-2xl border backdrop-blur overflow-hidden shadow-2xl">
      {/* Header */}
      <div className="border-border flex flex-wrap items-center justify-between gap-4 border-b px-6 py-5 bg-surface/60">
        <div>
          <div className="flex items-center gap-2">
            <span className="glow-ring bg-primary block size-2 rounded-full" />
            <h2 className="text-base font-semibold tracking-tight text-foreground">
              Enterprise Intelligence Memory Core — {projectName}
            </h2>
            <span className="border-border bg-card rounded-full border px-2.5 py-0.5 font-mono text-[11px] text-muted-foreground">
              {repo}
            </span>
          </div>
          <p className="text-muted-foreground mt-1 text-xs">
            Click any memory category below to explore its underlying files, folders, and query the AI architect.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 font-mono text-xs text-emerald-400">
            <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Memory Synchronized
          </span>
        </div>
      </div>

      {/* 5 Memory Modules Cards Selector */}
      <div className="grid grid-cols-1 md:grid-cols-5 border-b border-border bg-surface/30">
        {MEMORY_CATEGORIES.map((cat) => {
          const Icon = cat.icon;
          const isSelected = selectedCategory.id === cat.id;
          return (
            <button
              key={cat.id}
              onClick={() => handleSelectCategory(cat)}
              className={cn(
                "p-4 text-left border-r border-border last:border-r-0 transition-all flex flex-col justify-between",
                isSelected ? "bg-primary/10 border-b-2 border-b-primary" : "hover:bg-surface-2/60"
              )}
            >
              <div>
                <div className="flex items-center justify-between">
                  <Icon className={cn("size-4", isSelected ? "text-primary" : "text-muted-foreground")} />
                  <span className="font-mono text-[10px] text-muted-foreground">{cat.files.length} items</span>
                </div>
                <h3 className={cn("mt-2 text-xs font-semibold leading-tight", isSelected ? "text-foreground" : "text-muted-foreground")}>
                  {cat.title}
                </h3>
              </div>
              <span className="mt-3 text-[11px] font-mono text-primary flex items-center gap-1">
                Explore <ArrowRight className="size-3" />
              </span>
            </button>
          );
        })}
      </div>

      {/* Main Split View: Files/Folders (Left) & File Preview / Ask AI (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 min-h-[460px]">
        {/* Left Sidebar: Folder & File Explorer */}
        <div className="border-border lg:col-span-4 border-r bg-surface/20 p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground font-mono">
                Memory Files & Folders
              </span>
              <span className="font-mono text-[11px] text-primary">{selectedCategory.subtitle}</span>
            </div>
            <p className="text-muted-foreground text-xs mb-4 leading-relaxed">
              {selectedCategory.description}
            </p>

            <div className="space-y-1.5">
              {selectedCategory.files.map((file) => {
                const isFileSelected = selectedFile.path === file.path;
                return (
                  <button
                    key={file.path}
                    onClick={() => setSelectedFile(file)}
                    className={cn(
                      "w-full flex items-center justify-between p-2.5 rounded-xl text-left text-xs transition-all",
                      isFileSelected
                        ? "bg-primary text-primary-foreground font-medium shadow-sm"
                        : "bg-card/70 border border-border text-foreground hover:bg-card"
                    )}
                  >
                    <div className="flex items-center gap-2 truncate">
                      {file.type === "folder" ? (
                        <Folder className={cn("size-4 shrink-0", isFileSelected ? "text-primary-foreground" : "text-primary")} />
                      ) : (
                        <FileCode className={cn("size-4 shrink-0", isFileSelected ? "text-primary-foreground" : "text-muted-foreground")} />
                      )}
                      <span className="truncate font-mono">{file.name}</span>
                    </div>
                    {file.size && (
                      <span className={cn("font-mono text-[10px]", isFileSelected ? "text-primary-foreground/80" : "text-muted-foreground")}>
                        {file.size}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-6 border-t border-border pt-4 text-[11px] text-muted-foreground font-mono">
            Selected: <span className="text-foreground">{selectedFile.path}</span>
          </div>
        </div>

        {/* Right Content Area: File Inspector & Ask AI */}
        <div className="lg:col-span-8 p-6 flex flex-col justify-between bg-card/40 space-y-6">
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div>
                <span className="font-mono text-xs text-primary font-semibold">{selectedFile.name}</span>
                <p className="text-muted-foreground text-xs mt-0.5">{selectedFile.summary}</p>
              </div>
              <span className="font-mono text-[11px] text-muted-foreground border border-border px-2.5 py-1 rounded-lg bg-surface">
                {selectedFile.type === "folder" ? "Directory" : "Indexed Artifact"}
              </span>
            </div>

            {/* File Content Preview */}
            <div className="border-border bg-surface/80 rounded-xl border p-4 font-mono text-xs text-foreground overflow-x-auto max-h-56 leading-relaxed shadow-inner">
              <pre>{selectedFile.content || "Directory contents loaded successfully."}</pre>
            </div>
          </div>

          {/* Ask AI Section */}
          <div className="border-border bg-surface/50 rounded-xl border p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <Sparkles className="size-4 text-primary" /> Ask AI Architect about this Memory
              </span>
              <span className="font-mono text-[11px] text-muted-foreground">Contextual Codebase QA</span>
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="Ask anything about this memory or codebase..."
                className="flex-1 bg-card border border-border rounded-xl px-3.5 py-2 text-xs text-foreground outline-none focus:border-primary font-mono"
              />
              <button
                onClick={handleAskAi}
                disabled={isAsking}
                className="bg-primary text-primary-foreground hover:bg-primary-glow px-4 py-2 rounded-xl text-xs font-semibold transition-colors flex items-center gap-2 shrink-0"
              >
                {isAsking ? <RefreshCw className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
                Ask AI
              </button>
            </div>

            {aiAnswer && (
              <div className="border-border bg-card rounded-xl border p-3.5 text-xs font-mono text-foreground whitespace-pre-line leading-relaxed shadow-sm">
                {aiAnswer}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
