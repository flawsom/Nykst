import { useState } from "react";
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
  ArrowRight,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

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
    title: "1. Intelligence",
    subtitle: "Structural Baseline",
    icon: Network,
    description: "Live dependency graphs and API contracts.",
    files: [
      {
        name: "DependencyGraph.json",
        path: "/memory/structural/DependencyGraph.json",
        size: "42 KB",
        summary: "Live node adjacency matrix across repositories",
        content:
          '{\n  "org": "enterprise-core",\n  "nodes": 214,\n  "edges": 1428,\n  "syncStatus": "active"\n}',
      },
      {
        name: "ApiContracts.ts",
        path: "/memory/structural/ApiContracts.ts",
        size: "18 KB",
        summary: "gRPC and REST endpoint specifications",
        content:
          "export interface ApiContract {\n  endpoint: string;\n  version: string;\n  payloadSchema: Record<string, any>;\n}",
      },
    ],
  },
  {
    id: "vault",
    title: "2. Failure Vault",
    subtitle: "Immune System Data",
    icon: ShieldAlert,
    description: "Historical software breaks and verified patches.",
    files: [
      {
        name: "ERR_CONCURRENCY_092.json",
        path: "/memory/vault/ERR_CONCURRENCY_092.json",
        size: "8.4 KB",
        summary: "Deadlock stack trace in SessionStore.ts & fix",
        content:
          '{\n  "incidentId": "ERR_CONCURRENCY_092",\n  "component": "SessionStore.ts",\n  "patchApplied": "Mutex lock around session writes"\n}',
      },
    ],
  },
  {
    id: "behavioral",
    title: "3. Behavioral",
    subtitle: "RLHF & Alignment",
    icon: Cpu,
    description: "Engineering choices and coding standards.",
    files: [
      {
        name: "CodingStandards.yaml",
        path: "/memory/behavioral/CodingStandards.yaml",
        size: "14 KB",
        summary: "Team style preferences and monad/async rules",
        content: 'preferences:\n  errorHandling: "Explicit Result monads"\n  strictCasts: true\n',
      },
    ],
  },
  {
    id: "treepub",
    title: "4. Tree-Split",
    subtitle: "Quality Pipeline",
    icon: GitBranch,
    description: "Separating clean code from quarantined workarounds.",
    files: [
      {
        name: "PositiveCorpusIndex.json",
        path: "/memory/treepub/PositiveCorpusIndex.json",
        size: "22 KB",
        summary: "List of clean 100% typed production files",
        content: '{\n  "corpusType": "positive",\n  "filesCount": 3840\n}',
      },
    ],
  },
  {
    id: "instruction",
    title: "5. Instruction",
    subtitle: "Contextual QA & ADRs",
    icon: BookOpen,
    description: "Developer prompts, ADRs, and internal documentation.",
    files: [
      {
        name: "ADR-042-AuthFederation.md",
        path: "/memory/instruction/ADR-042-AuthFederation.md",
        size: "16 KB",
        summary: "Architecture Decision Record for OIDC",
        content: "# ADR-042: OIDC Identity Federation\n\nStatus: Accepted\nDate: 2026-02-14",
      },
    ],
  },
];

export function IntelligenceDashboard() {
  const [activeModule, setActiveModule] = useState<MemoryModule>(MEMORIES[0]!);
  const [activeFile, setActiveFile] = useState<MemoryFile>(activeModule.files[0]!);
  const [query, setQuery] = useState("Analyze this memory file.");
  const [aiResult, setAiResult] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSelectModule = (mod: MemoryModule) => {
    setActiveModule(mod);
    setActiveFile(mod.files[0]!);
    setAiResult(null);
  };

  const handleAskAi = () => {
    setLoading(true);
    setAiResult(null);
    setTimeout(() => {
      setLoading(false);
      setAiResult(
        `[Nykst AI Architect Analysis]\nFile: ${activeFile.name}\nRelevance: 100% synchronized with live repository AST. Zero drift detected.`,
      );
    }, 700);
  };

  return (
    <div className="flex flex-col h-full bg-card/90 rounded-xl border border-border p-3.5 space-y-3 overflow-y-auto text-xs">
      {/* Module Selector */}
      <div className="grid grid-cols-5 gap-1 bg-surface p-1 rounded-lg border border-border">
        {MEMORIES.map((m) => {
          const Icon = m.icon;
          const isSelected = activeModule.id === m.id;
          return (
            <button
              key={m.id}
              onClick={() => handleSelectModule(m)}
              className={cn(
                "p-1.5 rounded-md flex flex-col items-center justify-center transition-all",
                isSelected
                  ? "bg-primary text-primary-foreground font-semibold"
                  : "text-muted-foreground hover:bg-surface-2 hover:text-foreground",
              )}
              title={m.title}
            >
              <Icon className="size-3.5" />
              <span className="text-[9px] mt-0.5 truncate w-full text-center">{m.id}</span>
            </button>
          );
        })}
      </div>

      <div>
        <div className="font-semibold text-foreground">{activeModule.title}</div>
        <p className="text-muted-foreground text-[11px] mt-0.5">{activeModule.description}</p>
      </div>

      {/* Files List */}
      <div className="space-y-1">
        <span className="text-[10px] uppercase font-mono tracking-wider text-muted-foreground">
          Files & Folders
        </span>
        {activeModule.files.map((file) => {
          const isSelected = activeFile.path === file.path;
          return (
            <button
              key={file.path}
              onClick={() => setActiveFile(file)}
              className={cn(
                "w-full flex items-center justify-between p-2 rounded-lg text-left transition-all font-mono text-[11px]",
                isSelected
                  ? "bg-secondary text-secondary-foreground border border-primary/40 font-medium"
                  : "bg-surface/60 border border-border text-foreground hover:bg-surface",
              )}
            >
              <div className="flex items-center gap-1.5 truncate">
                <FileCode className="size-3.5 text-primary shrink-0" />
                <span className="truncate">{file.name}</span>
              </div>
              <span className="text-[9px] text-muted-foreground">{file.size}</span>
            </button>
          );
        })}
      </div>

      {/* File Content Preview */}
      <div className="space-y-1">
        <span className="text-[10px] uppercase font-mono tracking-wider text-muted-foreground">
          File Content
        </span>
        <div className="bg-surface border border-border rounded-lg p-2.5 font-mono text-[10px] text-foreground overflow-x-auto max-h-28 shadow-inner">
          <pre>{activeFile.content}</pre>
        </div>
      </div>

      {/* Ask AI Section */}
      <div className="mt-auto border-t border-border pt-3 space-y-2">
        <div className="flex items-center justify-between">
          <span className="font-semibold text-foreground flex items-center gap-1">
            <Sparkles className="size-3.5 text-primary" /> Ask AI Architect
          </span>
        </div>
        <div className="flex gap-1.5">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="flex-1 bg-surface border border-border rounded-lg px-2.5 py-1 text-[11px] text-foreground outline-none focus:border-primary font-mono"
          />
          <button
            onClick={handleAskAi}
            disabled={loading}
            className="bg-primary text-primary-foreground hover:bg-primary-glow px-3 py-1 rounded-lg text-[11px] font-semibold transition-colors flex items-center gap-1 shrink-0"
          >
            {loading ? (
              <RefreshCw className="size-3 animate-spin" />
            ) : (
              <Sparkles className="size-3" />
            )}
            Ask
          </button>
        </div>

        {aiResult && (
          <div className="bg-surface border border-border rounded-lg p-2.5 text-[11px] font-mono text-foreground whitespace-pre-line leading-relaxed shadow-sm">
            {aiResult}
          </div>
        )}
      </div>
    </div>
  );
}
