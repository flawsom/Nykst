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
  Layers, 
  FileCode, 
  Search, 
  Sparkles,
  ArrowUpRight,
  RefreshCw,
  Sliders,
  Database
} from "lucide-react";
import { cn } from "@/lib/utils";

interface IntelligenceDashboardProps {
  projectName: string;
  repo: string;
}

export function IntelligenceDashboard({ projectName, repo }: IntelligenceDashboardProps) {
  const [activeTab, setActiveTab] = useState<
    "structural" | "vault" | "behavioral" | "treepub" | "instruction"
  >("structural");

  const [simulatedPatchStatus, setSimulatedPatchStatus] = useState<"idle" | "simulating" | "accepted" | "rejected">("idle");
  const [activePrompt, setActivePrompt] = useState("Explain how the auth middleware handles token expiration across microservices.");
  const [aiResponse, setAiResponse] = useState<string | null>(null);
  const [isAsking, setIsAsking] = useState(false);

  const handleRunSimulation = (accept: boolean) => {
    setSimulatedPatchStatus("simulating");
    setTimeout(() => {
      setSimulatedPatchStatus(accept ? "accepted" : "rejected");
    }, 800);
  };

  const handleAskArchitect = () => {
    setIsAsking(true);
    setAiResponse(null);
    setTimeout(() => {
      setIsAsking(false);
      setAiResponse(`[Architect Memory Core] Based on ADR-042 and multi-repo linkage across ${repo}:
1. The JWTHandler intercepts requests via AuthMiddleware.ts before route dispatch.
2. Token expiration triggers an automatic sliding window refresh if the refresh token stored in SessionStore.ts is valid within the 7-day grace period.
3. Downstream services receive validated claims via internal gRPC headers with zero performance overhead.`);
    }, 1000);
  };

  return (
    <div className="border-border bg-card/90 mt-8 rounded-2xl border backdrop-blur">
      {/* Header */}
      <div className="border-border flex flex-wrap items-center justify-between gap-4 border-b px-6 py-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="glow-ring bg-primary block size-2 rounded-full" />
            <h2 className="text-base font-semibold tracking-tight text-foreground">
              Nykst Intelligence Core — {projectName}
            </h2>
            <span className="border-border bg-surface rounded-full border px-2.5 py-0.5 font-mono text-[11px] text-muted-foreground">
              {repo}
            </span>
          </div>
          <p className="text-muted-foreground mt-1 text-xs">
            Autonomous enterprise memory, immune system data, RLHF alignment, and active learning pipelines.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 font-mono text-xs text-emerald-400">
            <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" />
            24/7 Live Sync Active
          </span>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="border-border flex overflow-x-auto border-b bg-surface/50 px-6 py-2">
        <div className="flex gap-2">
          <button
            onClick={() => setActiveTab("structural")}
            className={cn(
              "flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-medium transition-all",
              activeTab === "structural"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:bg-surface-2 hover:text-foreground"
            )}
          >
            <Network className="size-4" />
            1. Intelligence Memory <span className="opacity-60">(Structural Baseline)</span>
          </button>

          <button
            onClick={() => setActiveTab("vault")}
            className={cn(
              "flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-medium transition-all",
              activeTab === "vault"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:bg-surface-2 hover:text-foreground"
            )}
          >
            <ShieldAlert className="size-4" />
            2. Failure & Resolution <span className="opacity-60">(Immune Vault)</span>
          </button>

          <button
            onClick={() => setActiveTab("behavioral")}
            className={cn(
              "flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-medium transition-all",
              activeTab === "behavioral"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:bg-surface-2 hover:text-foreground"
            )}
          >
            <Cpu className="size-4" />
            3. Behavioral Preference <span className="opacity-60">(RLHF & Alignment)</span>
          </button>

          <button
            onClick={() => setActiveTab("treepub")}
            className={cn(
              "flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-medium transition-all",
              activeTab === "treepub"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:bg-surface-2 hover:text-foreground"
            )}
          >
            <GitBranch className="size-4" />
            4. Tree-Split Learning <span className="opacity-60">(Quality Pipeline)</span>
          </button>

          <button
            onClick={() => setActiveTab("instruction")}
            className={cn(
              "flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-medium transition-all",
              activeTab === "instruction"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:bg-surface-2 hover:text-foreground"
            )}
          >
            <BookOpen className="size-4" />
            5. Instruction-Tuning <span className="opacity-60">(Contextual QA)</span>
          </button>
        </div>
      </div>

      {/* Tab Contents */}
      <div className="p-6">
        {activeTab === "structural" && (
          <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-3">
              <div className="border-border bg-surface rounded-xl border p-4">
                <span className="text-muted-foreground text-[11px] uppercase tracking-wider">Multi-Repo Linkage</span>
                <p className="mt-1 font-mono text-2xl font-semibold text-foreground">14 Connected</p>
                <p className="text-muted-foreground mt-1 text-xs">Cross-service API contracts mapped securely.</p>
              </div>
              <div className="border-border bg-surface rounded-xl border p-4">
                <span className="text-muted-foreground text-[11px] uppercase tracking-wider">API Contracts Indexed</span>
                <p className="mt-1 font-mono text-2xl font-semibold text-foreground">1,428 Endpoints</p>
                <p className="text-muted-foreground mt-1 text-xs">Zero drift between client and backend schemas.</p>
              </div>
              <div className="border-border bg-surface rounded-xl border p-4">
                <span className="text-muted-foreground text-[11px] uppercase tracking-wider">Graph Completeness</span>
                <p className="mt-1 font-mono text-2xl font-semibold text-foreground">99.8%</p>
                <p className="text-muted-foreground mt-1 text-xs">Derived purely from AST & commit history.</p>
              </div>
            </div>

            <div className="border-border bg-surface/40 rounded-xl border p-5">
              <h3 className="text-sm font-medium text-foreground flex items-center gap-2">
                <Database className="size-4 text-primary" />
                Global Structural Baseline & Dependency Map
              </h3>
              <p className="text-muted-foreground mt-1 text-xs leading-relaxed">
                Nykst maintains a live 24/7 dependency graph and API contract registry across {repo}. This gives the AI deep structural context so it understands how components connect across the entire enterprise without hallucinating file boundaries.
              </p>

              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <div className="border-border bg-card rounded-lg border p-3.5">
                  <span className="font-mono text-xs text-primary font-medium">Core Domain Linkages</span>
                  <ul className="mt-2 space-y-1.5 text-xs text-muted-foreground">
                    <li className="flex items-center justify-between">
                      <span>Gateway → Auth Middleware</span>
                      <span className="text-emerald-400 font-mono">Synced (gRPC)</span>
                    </li>
                    <li className="flex items-center justify-between">
                      <span>Payment Service → Ledger DB</span>
                      <span className="text-emerald-400 font-mono">Synced (TLS 1.3)</span>
                    </li>
                    <li className="flex items-center justify-between">
                      <span>Streaming Edge → CDN Routing</span>
                      <span className="text-emerald-400 font-mono">Synced (HTTP/3)</span>
                    </li>
                  </ul>
                </div>
                <div className="border-border bg-card rounded-lg border p-3.5">
                  <span className="font-mono text-xs text-primary font-medium">Active Schema Contracts</span>
                  <ul className="mt-2 space-y-1.5 text-xs text-muted-foreground">
                    <li className="flex items-center justify-between">
                      <span>UserIdentity.proto</span>
                      <span className="font-mono text-foreground">v2.4.1</span>
                    </li>
                    <li className="flex items-center justify-between">
                      <span>BillingLedger.graphql</span>
                      <span className="font-mono text-foreground">v4.0.0</span>
                    </li>
                    <li className="flex items-center justify-between">
                      <span>TelemetryEventStream.json</span>
                      <span className="font-mono text-foreground">v1.8.2</span>
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === "vault" && (
          <div className="space-y-6">
            <div className="border-border bg-surface/40 rounded-xl border p-5">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium text-foreground flex items-center gap-2">
                  <ShieldAlert className="size-4 text-amber-400" />
                  Immune System Data — Historical Faults & Verified Patches
                </h3>
                <span className="rounded-full bg-amber-500/10 border border-amber-500/30 px-2.5 py-0.5 text-xs text-amber-400 font-mono">
                  32 Incidents Immunized
                </span>
              </div>
              <p className="text-muted-foreground mt-1 text-xs leading-relaxed">
                The permanent log of historical software breaks, stack traces, and verified human patches. Acts as an automated immune response—when a past bug threatens the system again, it instantly retrieves the fix.
              </p>

              <div className="mt-4 space-y-3">
                <div className="border-border bg-card rounded-lg border p-4">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-semibold text-rose-400">
                      ERR_CONCURRENCY_DEADLOCK_092
                    </span>
                    <span className="font-mono text-[11px] text-muted-foreground">Resolved 3 days ago by @shuzalniraula</span>
                  </div>
                  <p className="mt-2 text-xs text-foreground font-mono bg-surface p-2.5 rounded border border-border">
                    Stack Trace: deadlock in SessionStore.ts during high-volume token refresh bursts under race conditions.
                  </p>
                  <div className="mt-3 flex items-center justify-between text-xs">
                    <span className="text-emerald-400 flex items-center gap-1 font-medium">
                      <CheckCircle2 className="size-3.5" /> Immune Patch Applied: Mutex lock implemented around session TTL updates.
                    </span>
                    <span className="font-mono text-muted-foreground">Auto-Prevented 4 potential regressions</span>
                  </div>
                </div>

                <div className="border-border bg-card rounded-lg border p-4">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-semibold text-amber-400">
                      ERR_JWT_SIGNATURE_MISMATCH_412
                    </span>
                    <span className="font-mono text-[11px] text-muted-foreground">Resolved 2 weeks ago by @core-team</span>
                  </div>
                  <p className="mt-2 text-xs text-foreground font-mono bg-surface p-2.5 rounded border border-border">
                    Stack Trace: RS256 algorithm fallback failure when decoding tokens issued by legacy Auth v1 gateway.
                  </p>
                  <div className="mt-3 flex items-center justify-between text-xs">
                    <span className="text-emerald-400 flex items-center gap-1 font-medium">
                      <CheckCircle2 className="size-3.5" /> Immune Patch Applied: Strict algorithm validation header check.
                    </span>
                    <span className="font-mono text-muted-foreground">Auto-Prevented 12 potential regressions</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === "behavioral" && (
          <div className="space-y-6">
            <div className="border-border bg-surface/40 rounded-xl border p-5">
              <h3 className="text-sm font-medium text-foreground flex items-center gap-2">
                <Cpu className="size-4 text-primary" />
                Behavioral Preference Memory (RLHF & Alignment Logs)
              </h3>
              <p className="text-muted-foreground mt-1 text-xs leading-relaxed">
                The tracked record of human engineering choices (accepted vs. rejected virtual simulation patches). Aligns the AI’s generation style and risk tolerance precisely with the team's custom coding standards.
              </p>

              <div className="mt-5 border-border bg-card rounded-xl border p-4">
                <span className="text-xs font-medium text-foreground">Interactive Virtual Simulation Patch Test</span>
                <p className="text-muted-foreground mt-1 text-xs">
                  Proposed AI Refactoring for <code className="text-primary">TokenValidator.ts</code>: Replace manual try-catch with functional Result monads.
                </p>

                <div className="mt-4 flex items-center gap-3">
                  <button
                    onClick={() => handleRunSimulation(true)}
                    className="flex items-center gap-1.5 rounded-lg bg-emerald-600/20 border border-emerald-500/40 px-4 py-2 text-xs font-medium text-emerald-300 hover:bg-emerald-600/30 transition-colors"
                  >
                    <CheckCircle2 className="size-4 text-emerald-400" /> Accept Virtual Patch (RLHF Positive)
                  </button>
                  <button
                    onClick={() => handleRunSimulation(false)}
                    className="flex items-center gap-1.5 rounded-lg bg-rose-600/20 border border-rose-500/40 px-4 py-2 text-xs font-medium text-rose-300 hover:bg-rose-600/30 transition-colors"
                  >
                    <XCircle className="size-4 text-rose-400" /> Reject Virtual Patch (RLHF Negative)
                  </button>
                </div>

                {simulatedPatchStatus === "simulating" && (
                  <p className="mt-3 font-mono text-xs text-muted-foreground animate-pulse">
                    Logging engineering preference into team alignment weights...
                  </p>
                )}

                {simulatedPatchStatus === "accepted" && (
                  <div className="mt-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-300">
                    <span className="font-semibold">Preference Recorded:</span> Patch accepted. AI preference weights updated to favor functional Result monads across backend modules for this repo.
                  </div>
                )}

                {simulatedPatchStatus === "rejected" && (
                  <div className="mt-3 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300">
                    <span className="font-semibold">Preference Recorded:</span> Patch rejected. AI preference weights updated to stick with standard async/await try-catch patterns for this repo.
                  </div>
                )}
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-2 font-mono text-xs">
                <div className="border-border bg-surface rounded-lg p-3">
                  <span className="text-muted-foreground">Team Risk Tolerance:</span>
                  <p className="mt-1 font-semibold text-emerald-400">Strict (Zero Unsafe Casts)</p>
                </div>
                <div className="border-border bg-surface rounded-lg p-3">
                  <span className="text-muted-foreground">Alignment Drift Score:</span>
                  <p className="mt-1 font-semibold text-primary">0.02% (High Fidelity)</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === "treepub" && (
          <div className="space-y-6">
            <div className="border-border bg-surface/40 rounded-xl border p-5">
              <h3 className="text-sm font-medium text-foreground flex items-center gap-2">
                <GitBranch className="size-4 text-primary" />
                Tree-Split Active Learning Memory (High- vs. Low-Quality Logs)
              </h3>
              <p className="text-muted-foreground mt-1 text-xs leading-relaxed">
                A self-cleaning data pipeline that separates clean, production-ready code from messy workarounds. Trains the active model on high-performance code while using quarantined bad code for negative reinforcement (teaching the AI what not to do).
              </p>

              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <div className="border-border bg-card rounded-xl border p-4">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-semibold text-emerald-400 flex items-center gap-1.5">
                      <CheckCircle2 className="size-4" /> Production-Ready Branch (Positive Corpus)
                    </span>
                    <span className="font-mono text-[11px] text-muted-foreground">94.2% of codebase</span>
                  </div>
                  <ul className="mt-3 space-y-2 text-xs text-muted-foreground">
                    <li className="flex items-center justify-between bg-surface p-2 rounded">
                      <span className="font-mono text-foreground">AuthController.ts</span>
                      <span className="text-emerald-400 font-mono">Clean AST / 100% Typed</span>
                    </li>
                    <li className="flex items-center justify-between bg-surface p-2 rounded">
                      <span className="font-mono text-foreground">JWTHandler.ts</span>
                      <span className="text-emerald-400 font-mono">Zero Memory Leaks</span>
                    </li>
                  </ul>
                  <p className="mt-3 text-[11px] text-muted-foreground">
                    Used for active generative fine-tuning and pattern synthesis.
                  </p>
                </div>

                <div className="border-border bg-card rounded-xl border p-4">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-semibold text-rose-400 flex items-center gap-1.5">
                      <XCircle className="size-4" /> Quarantined Workarounds (Negative Corpus)
                    </span>
                    <span className="font-mono text-[11px] text-muted-foreground">5.8% of codebase</span>
                  </div>
                  <ul className="mt-3 space-y-2 text-xs text-muted-foreground">
                    <li className="flex items-center justify-between bg-surface p-2 rounded">
                      <span className="font-mono text-foreground">legacy_auth_hack.js</span>
                      <span className="text-rose-400 font-mono">Any casts / unvalidated</span>
                    </li>
                    <li className="flex items-center justify-between bg-surface p-2 rounded">
                      <span className="font-mono text-foreground">temp_bypass_cors.ts</span>
                      <span className="text-rose-400 font-mono">Security Anti-Pattern</span>
                    </li>
                  </ul>
                  <p className="mt-3 text-[11px] text-muted-foreground">
                    Used exclusively for negative reinforcement training (teaching AI anti-patterns to avoid).
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === "instruction" && (
          <div className="space-y-6">
            <div className="border-border bg-surface/40 rounded-xl border p-5">
              <h3 className="text-sm font-medium text-foreground flex items-center gap-2">
                <BookOpen className="size-4 text-primary" />
                Instruction-Tuning Memory (Contextual QA & Prompt Logs)
              </h3>
              <p className="text-muted-foreground mt-1 text-xs leading-relaxed">
                The repository of developer prompts, architecture decision records (ADRs), and internal documentation. Powers the system to act as an expert senior architect capable of answering deep internal codebase questions instantly.
              </p>

              <div className="mt-5 border-border bg-card rounded-xl p-4 border">
                <label className="text-xs font-medium text-foreground block mb-2">
                  Ask the Enterprise Architectural Assistant ({repo})
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={activePrompt}
                    onChange={(e) => setActivePrompt(e.target.value)}
                    className="flex-1 bg-surface border border-border rounded-xl px-3.5 py-2.5 text-xs text-foreground outline-none focus:border-primary font-mono"
                  />
                  <button
                    onClick={handleAskArchitect}
                    disabled={isAsking}
                    className="bg-primary text-primary-foreground hover:bg-primary-glow px-4 py-2.5 rounded-xl text-xs font-semibold transition-colors flex items-center gap-2 shrink-0"
                  >
                    {isAsking ? <RefreshCw className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
                    Ask Architect
                  </button>
                </div>

                {aiResponse && (
                  <div className="mt-4 border-border bg-surface rounded-xl border p-4 text-xs font-mono text-foreground whitespace-pre-line leading-relaxed">
                    {aiResponse}
                  </div>
                )}
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-3">
                <div className="border-border bg-surface rounded-lg p-3">
                  <span className="text-muted-foreground text-[11px] uppercase tracking-wider">ADRs Indexed</span>
                  <p className="mt-1 font-mono text-lg font-semibold text-foreground">42 Records</p>
                </div>
                <div className="border-border bg-surface rounded-lg p-3">
                  <span className="text-muted-foreground text-[11px] uppercase tracking-wider">Internal Runbooks</span>
                  <p className="mt-1 font-mono text-lg font-semibold text-foreground">18 Runbooks</p>
                </div>
                <div className="border-border bg-surface rounded-lg p-3">
                  <span className="text-muted-foreground text-[11px] uppercase tracking-wider">Prompt Success Rate</span>
                  <p className="mt-1 font-mono text-lg font-semibold text-foreground">99.4%</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
