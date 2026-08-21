import { useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import type { GraphNode } from "@/lib/graph-data";
import { cn } from "@/lib/utils";
import { Code, Layers, Cpu, GitCommit, Activity, AlertTriangle, Sparkles, Send } from "lucide-react";

type TabId = "code" | "architecture" | "dependencies" | "changes" | "runtime" | "incidents" | "ask";

export function NodeInspector({
  node,
  open,
  onClose,
}: {
  node: GraphNode | null;
  open: boolean;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<TabId>("code");
  const [chatPrompt, setChatPrompt] = useState("");
  const [chatLog, setChatLog] = useState<{ role: "user" | "ai"; text: string }[]>([
    {
      role: "ai",
      text: `Hello! I am Nykst AI, your principal architectural assistant for ${node?.label ?? "this system"}. How can I help you understand this component's codebase, history, or runtime behavior?`,
    },
  ]);

  if (!node) return null;

  const repoName = node.repo || `acme/${node.label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  const ownerName = node.owners?.length ? node.owners[0] : "@engineering-lead";

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatPrompt.trim()) return;
    const q = chatPrompt;
    setChatPrompt("");
    setChatLog((prev) => [
      ...prev,
      { role: "user", text: q },
      {
        role: "ai",
        text: `Analyzing enterprise memory for "${q}" across ${repoName}...\n\nBased on Nykst's continuous reality-checking engine, this component interacts directly with 4 upstream microservices and maintains a p99 latency of 42ms. The architectural decision record (ADR #412) specifies strict idempotency here.`,
      },
    ]);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-card border-border h-[88vh] max-w-[min(1150px,95vw)] gap-0 overflow-hidden p-0 sm:max-w-[min(1150px,95vw)]">
        <div className="flex h-full min-h-0">
          {/* Sidebar Navigation matching dashboard style */}
          <aside className="border-border bg-surface w-72 shrink-0 flex flex-col border-r p-4">
            <div className="flex items-center gap-3 pb-4 border-b border-border">
              <div className="size-8 rounded-lg bg-primary/20 text-primary flex items-center justify-center font-bold font-mono">
                i
              </div>
              <div>
                <span className="text-[10px] font-mono text-primary uppercase tracking-widest block">System Dossier</span>
                <h3 className="text-sm font-semibold truncate max-w-[160px]">{node.label}</h3>
              </div>
            </div>

            <nav className="flex-1 space-y-1 pt-3 overflow-y-auto">
              {[
                { id: "code", label: "1. Code Analysis", icon: Code },
                { id: "architecture", label: "2. Architecture", icon: Layers },
                { id: "dependencies", label: "3. Dependencies", icon: Cpu },
                { id: "changes", label: "4. Changes & Evolution", icon: GitCommit },
                { id: "runtime", label: "5. Runtime Metrics", icon: Activity },
                { id: "incidents", label: "6. Data Incidents & Learning", icon: AlertTriangle },
                { id: "ask", label: "7. Ask Nykst AI", icon: Sparkles },
              ].map((item) => {
                const Icon = item.icon;
                const active = tab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => setTab(item.id as TabId)}
                    className={cn(
                      "w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-medium transition-all text-left",
                      active
                        ? "bg-primary/20 text-primary border border-primary/30 font-semibold"
                        : "text-muted-foreground hover:text-foreground hover:bg-surface-2"
                    )}
                  >
                    <Icon className="size-4 shrink-0" /> {item.label}
                  </button>
                );
              })}
            </nav>

            <div className="pt-3 border-t border-border text-[11px] text-muted-foreground font-mono space-y-1">
              <div>Kind: {node.kind}</div>
              <div>Primary Owner: {ownerName}</div>
            </div>
          </aside>

          {/* Main Content Area */}
          <main className="flex-1 flex flex-col min-h-0 bg-background/50 overflow-y-auto p-6 space-y-6">
            <div className="border-b border-border pb-4">
              <h2 className="text-xl font-semibold tracking-tight capitalize">{tab.replace("-", " ")} Inspection</h2>
              <p className="text-muted-foreground text-xs mt-1">
                Deep structural intelligence and telemetry for <span className="text-foreground font-mono">{node.label}</span>.
              </p>
            </div>

            {/* Layer 1: Code Analysis */}
            {tab === "code" && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="border border-border bg-surface p-4 rounded-xl space-y-2">
                    <span className="text-[11px] font-mono uppercase text-primary font-semibold">Repository & Branching</span>
                    <div className="text-sm font-medium font-mono">{repoName}</div>
                    <div className="text-xs text-muted-foreground">Branch: <span className="text-foreground font-mono">main</span> · Tag: <span className="text-foreground font-mono">v2.4.1</span></div>
                  </div>
                  <div className="border border-border bg-surface p-4 rounded-xl space-y-2">
                    <span className="text-[11px] font-mono uppercase text-primary font-semibold">Releases & Commits</span>
                    <div className="text-sm font-medium font-mono">HEAD @ 4f89b2c (Latest Release: v2.4.0)</div>
                    <div className="text-xs text-muted-foreground">Active Pull Requests: <span className="text-foreground">2 open</span></div>
                  </div>
                </div>

                <div className="border border-border bg-surface p-4 rounded-xl space-y-3">
                  <span className="text-[11px] font-mono uppercase text-primary font-semibold">Files, Functions & Classes</span>
                  <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                    <div className="bg-card p-3 rounded-lg border border-border">
                      <span className="text-muted-foreground block text-[10px]">CLASSES</span>
                      <span className="text-foreground font-semibold">{node.detail?.classes?.length ? node.detail.classes.join(", ") : `${node.label}Controller, ${node.label}Service`}</span>
                    </div>
                    <div className="bg-card p-3 rounded-lg border border-border">
                      <span className="text-muted-foreground block text-[10px]">MODULES & FILES</span>
                      <span className="text-foreground font-semibold">{node.blast?.files ?? 14} files across 4 modules</span>
                    </div>
                  </div>
                </div>

                <div className="border border-border bg-surface p-4 rounded-xl space-y-3">
                  <span className="text-[11px] font-mono uppercase text-primary font-semibold">Imports, Exports & APIs</span>
                  <div className="text-xs font-mono space-y-1.5 text-muted-foreground">
                    <div>• Imports: <span className="text-foreground">@tanstack/react, express, pg-pool, redis</span></div>
                    <div>• Exports: <span className="text-foreground">Default Router, GraphQL Resolvers, gRPC Client</span></div>
                    <div>• Config: <span className="text-foreground">env: production, timeout_ms: 5000, max_conn: 50</span></div>
                  </div>
                </div>
              </div>
            )}

            {/* Layer 2: Architecture */}
            {tab === "architecture" && (
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-3">
                  <div className="border border-border bg-surface p-4 rounded-xl space-y-1">
                    <span className="text-[10px] font-mono uppercase text-primary">Frontend</span>
                    <div className="text-sm font-semibold">React 19 / Vite</div>
                  </div>
                  <div className="border border-border bg-surface p-4 rounded-xl space-y-1">
                    <span className="text-[10px] font-mono uppercase text-primary">Backend</span>
                    <div className="text-sm font-semibold">Node.js / Express</div>
                  </div>
                  <div className="border border-border bg-surface p-4 rounded-xl space-y-1">
                    <span className="text-[10px] font-mono uppercase text-primary">Database</span>
                    <div className="text-sm font-semibold">PostgreSQL 16</div>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div className="border border-border bg-surface p-4 rounded-xl space-y-1">
                    <span className="text-[10px] font-mono uppercase text-primary">Queues & Caches</span>
                    <div className="text-sm font-semibold">Redis / Kafka</div>
                  </div>
                  <div className="border border-border bg-surface p-4 rounded-xl space-y-1">
                    <span className="text-[10px] font-mono uppercase text-primary">Authentication</span>
                    <div className="text-sm font-semibold">OAuth2 / JWT / mTLS</div>
                  </div>
                  <div className="border border-border bg-surface p-4 rounded-xl space-y-1">
                    <span className="text-[10px] font-mono uppercase text-primary">Infrastructure</span>
                    <div className="text-sm font-semibold">Kubernetes / Istio</div>
                  </div>
                </div>

                <div className="border border-border bg-surface p-4 rounded-xl space-y-3">
                  <span className="text-[11px] font-mono uppercase text-primary font-semibold">Architectural Flow & Service Topology</span>
                  <div className="bg-card p-4 rounded-lg border border-border font-mono text-xs text-foreground flex items-center justify-between overflow-x-auto">
                    <span>Frontend</span>
                    <span className="text-primary">→</span>
                    <span>API Gateway</span>
                    <span className="text-primary">→</span>
                    <span className="bg-primary/20 px-2 py-1 rounded text-primary">[Auth]</span>
                    <span className="text-primary">→</span>
                    <span className="bg-primary/20 px-2 py-1 rounded text-primary">[Services]</span>
                    <span className="text-primary">→</span>
                    <span className="bg-primary/20 px-2 py-1 rounded text-primary">[Database]</span>
                  </div>
                </div>
              </div>
            )}

            {/* Layer 3: Dependencies */}
            {tab === "dependencies" && (
              <div className="space-y-4">
                <div className="border border-border bg-surface p-4 rounded-xl space-y-3">
                  <span className="text-[11px] font-mono uppercase text-primary font-semibold">Package Versions (npm / pip)</span>
                  <div className="space-y-2 text-xs font-mono">
                    <div className="bg-card p-2.5 rounded-lg border border-border flex items-center justify-between">
                      <span className="text-foreground">express</span>
                      <span className="text-muted-foreground">v4.19.2 (Secure)</span>
                    </div>
                    <div className="bg-card p-2.5 rounded-lg border border-border flex items-center justify-between">
                      <span className="text-foreground">pg (PostgreSQL client)</span>
                      <span className="text-muted-foreground">v8.11.3 (Secure)</span>
                    </div>
                    <div className="bg-card p-2.5 rounded-lg border border-border flex items-center justify-between">
                      <span className="text-foreground">redis</span>
                      <span className="text-muted-foreground">v4.6.13 (Secure)</span>
                    </div>
                  </div>
                </div>

                <div className="border border-border bg-surface p-4 rounded-xl space-y-3">
                  <span className="text-[11px] font-mono uppercase text-primary font-semibold">Internal Libraries, SDKs & Cloud Services</span>
                  <div className="text-xs font-mono text-muted-foreground space-y-1.5">
                    <div>• Internal SDKs: <span className="text-foreground">@nykst/auth-sdk (v2.1.0), @nykst/telemetry-core (v4.0.2)</span></div>
                    <div>• External APIs: <span className="text-foreground">Stripe Billing API v2024, AWS S3 SDK v3</span></div>
                    <div>• Cloud Services: <span className="text-foreground">AWS RDS PostgreSQL, Redis Cloud Cluster</span></div>
                  </div>
                </div>
              </div>
            )}

            {/* Layer 4: Changes */}
            {tab === "changes" && (
              <div className="space-y-4">
                <div className="border border-border bg-surface p-4 rounded-xl space-y-3">
                  <span className="text-[11px] font-mono uppercase text-primary font-semibold">Evolution & Provenance (Git, Deploys, Flags & AI)</span>
                  <div className="space-y-2 text-xs font-mono">
                    <div className="bg-card p-3 rounded-lg border border-border space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-foreground font-semibold">PR #482: Optimize graph rendering pipeline</span>
                        <span className="text-emerald-400">Merged</span>
                      </div>
                      <div className="text-muted-foreground text-[11px]">Commit 4f89b2c · Config changed · DB Migration V402 applied · Approved by {ownerName}</div>
                    </div>
                  </div>
                </div>

                <div className="border border-border bg-surface p-4 rounded-xl space-y-3">
                  <span className="text-[11px] font-mono uppercase text-primary font-semibold">Why does this code exist? & AI Workflow</span>
                  <div className="bg-card p-4 rounded-lg border border-border space-y-3 font-mono text-xs">
                    <div className="text-muted-foreground">
                      <strong className="text-foreground">Purpose:</strong> Eliminates serialization bottlenecks across distributed domain nodes.
                    </div>
                    <div className="border-t border-border pt-2">
                      <span className="text-[10px] text-primary uppercase block mb-1">AI Generation Workflow</span>
                      <div className="flex items-center gap-2 text-[11px]">
                        <span className="bg-primary/25 px-2 py-1 rounded text-primary">Prompt</span>
                        <span>→</span>
                        <span>AI Generation</span>
                        <span>→</span>
                        <span>Review</span>
                        <span>→</span>
                        <span className="text-emerald-400">Deployment</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Layer 5: Runtime Metrics */}
            {tab === "runtime" && (
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-3">
                  <div className="border border-border bg-surface p-4 rounded-xl space-y-1">
                    <span className="text-[10px] font-mono uppercase text-primary">p99 Latency</span>
                    <div className="text-sm font-semibold">42 ms</div>
                  </div>
                  <div className="border border-border bg-surface p-4 rounded-xl space-y-1">
                    <span className="text-[10px] font-mono uppercase text-primary">Throughput</span>
                    <div className="text-sm font-semibold">14.2k req/s</div>
                  </div>
                  <div className="border border-border bg-surface p-4 rounded-xl space-y-1">
                    <span className="text-[10px] font-mono uppercase text-primary">Error Rate</span>
                    <div className="text-sm font-semibold text-emerald-400">0.001%</div>
                  </div>
                </div>

                <div className="border border-border bg-surface p-4 rounded-xl space-y-3">
                  <span className="text-[11px] font-mono uppercase text-primary font-semibold">Reality-Checking Telemetry (Static → Runtime)</span>
                  <div className="text-xs font-mono text-muted-foreground space-y-1.5">
                    <div>• CPU Utilization: <span className="text-foreground">1.2 vCPU average (Normal)</span></div>
                    <div>• Memory Heap: <span className="text-foreground">512 MB active</span></div>
                    <div>• Database Performance: <span className="text-foreground">Connection pool utilization at 32%</span></div>
                    <div>• API Failure Rate: <span className="text-emerald-400">0.00% over last 24 hours</span></div>
                  </div>
                </div>
              </div>
            )}

            {/* Layer 6: Data Incidents */}
            {tab === "incidents" && (
              <div className="space-y-4">
                <div className="border border-border bg-surface p-4 rounded-xl space-y-3">
                  <span className="text-[11px] font-mono uppercase text-primary font-semibold">Incident Resolution Pipeline</span>
                  <div className="bg-card p-4 rounded-lg border border-border font-mono text-xs space-y-2">
                    <div className="text-emerald-400 font-semibold">INC-8921 (Resolved in 14m)</div>
                    <div className="text-muted-foreground text-[11px] leading-relaxed">
                      Symptoms → Hypothesis → Evidence Root Cause → Affected Components → Business Impact → Resolution → Turnaround.
                    </div>
                  </div>
                </div>

                <div className="border border-border bg-surface p-4 rounded-xl space-y-3">
                  <span className="text-[11px] font-mono uppercase text-primary font-semibold">Key Analytical Questions (Learning Doc)</span>
                  <div className="space-y-2 text-xs font-mono text-muted-foreground">
                    <div className="bg-card p-3 rounded-lg border border-border">
                      <strong className="text-foreground block mb-1">1. What did Nykst think initially?</strong>
                      Predicted queue saturation due to incoming webhook burst.
                    </div>
                    <div className="bg-card p-3 rounded-lg border border-border">
                      <strong className="text-foreground block mb-1">2. What was wrong?</strong>
                      The bottleneck was actually upstream DNS resolution on the third-party provider, not queue worker capacity.
                    </div>
                    <div className="bg-card p-3 rounded-lg border border-border">
                      <strong className="text-foreground block mb-1">3. What eventually proved correct?</strong>
                      Adding circuit breaker fallback isolation permanently resolved cascade failures.
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Layer 7: Ask Nykst AI */}
            {tab === "ask" && (
              <div className="flex flex-col h-[400px] border border-border bg-surface rounded-xl overflow-hidden">
                <div className="p-3 border-b border-border bg-card flex items-center gap-2">
                  <Sparkles className="size-4 text-primary" />
                  <span className="text-xs font-semibold">Nykst AI Architectural Assistant</span>
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-3 text-xs font-mono">
                  {chatLog.map((c, i) => (
                    <div
                      key={i}
                      className={cn(
                        "p-3 rounded-xl max-w-[85%] leading-relaxed",
                        c.role === "user"
                          ? "ml-auto bg-primary text-primary-foreground font-sans text-sm"
                          : "mr-auto bg-card border border-border text-foreground"
                      )}
                    >
                      {c.text}
                    </div>
                  ))}
                </div>
                <form onSubmit={handleSend} className="p-3 border-t border-border bg-card flex gap-2">
                  <input
                    type="text"
                    value={chatPrompt}
                    onChange={(e) => setChatPrompt(e.target.value)}
                    placeholder={`Ask anything about ${node.label}...`}
                    className="flex-1 bg-surface border border-border rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-primary"
                  />
                  <button
                    type="submit"
                    className="bg-primary text-primary-foreground px-4 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 hover:bg-primary-glow transition-colors"
                  >
                    <Send className="size-3.5" /> Send
                  </button>
                </form>
              </div>
            )}
          </main>
        </div>
      </DialogContent>
    </Dialog>
  );
}
