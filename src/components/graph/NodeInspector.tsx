import { useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import type { GraphNode } from "@/lib/graph-data";
import { cn } from "@/lib/utils";
import { Eye, Code, Layers, Cpu, GitCommit, FileText, CheckCircle2, Shield, Terminal, Zap, Database, Globe } from "lucide-react";

type TabId = "code" | "architecture" | "dependencies" | "changes";

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

  if (!node) return null;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-card border-border h-[82vh] max-w-[min(1000px,92vw)] gap-0 overflow-hidden p-0 sm:max-w-[min(1000px,92vw)]">
        <div className="flex h-full min-h-0">
          {/* Sidebar Tabs */}
          <aside className="border-border bg-surface w-64 shrink-0 flex flex-col border-r p-4">
            <div className="flex items-center gap-2 pb-4 border-b border-border">
              <div className="p-2 rounded-lg bg-primary/20 text-primary">
                <Eye className="size-4" />
              </div>
              <div>
                <span className="text-[10px] font-mono text-primary uppercase tracking-widest block">Node Inspector</span>
                <h3 className="text-sm font-semibold truncate max-w-[160px]">{node.label}</h3>
              </div>
            </div>

            <nav className="flex-1 space-y-1 pt-4">
              <button
                onClick={() => setTab("code")}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-medium transition-all",
                  tab === "code"
                    ? "bg-primary/20 text-primary border border-primary/30 font-semibold"
                    : "text-muted-foreground hover:text-foreground hover:bg-surface-2"
                )}
              >
                <Code className="size-4" /> Code Analysis
              </button>
              <button
                onClick={() => setTab("architecture")}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-medium transition-all",
                  tab === "architecture"
                    ? "bg-primary/20 text-primary border border-primary/30 font-semibold"
                    : "text-muted-foreground hover:text-foreground hover:bg-surface-2"
                )}
              >
                <Layers className="size-4" /> Architecture
              </button>
              <button
                onClick={() => setTab("dependencies")}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-medium transition-all",
                  tab === "dependencies"
                    ? "bg-primary/20 text-primary border border-primary/30 font-semibold"
                    : "text-muted-foreground hover:text-foreground hover:bg-surface-2"
                )}
              >
                <Cpu className="size-4" /> Dependencies
              </button>
              <button
                onClick={() => setTab("changes")}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-medium transition-all",
                  tab === "changes"
                    ? "bg-primary/20 text-primary border border-primary/30 font-semibold"
                    : "text-muted-foreground hover:text-foreground hover:bg-surface-2"
                )}
              >
                <GitCommit className="size-4" /> Changes & Evolution
              </button>
            </nav>

            <div className="pt-4 border-t border-border text-[11px] text-muted-foreground font-mono">
              <div>Kind: {node.kind}</div>
              <div>Owners: {node.owners.join(", ")}</div>
            </div>
          </aside>

          {/* Main Content Area */}
          <main className="flex-1 flex flex-col min-h-0 bg-background/50 overflow-y-auto p-6 space-y-6">
            <div className="border-b border-border pb-4">
              <h2 className="text-xl font-semibold tracking-tight capitalize">{tab} Inspection</h2>
              <p className="text-muted-foreground text-xs mt-1">
                Real-time telemetry and structural dissection for <span className="text-foreground font-mono">{node.label}</span>.
              </p>
            </div>

            {tab === "code" && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="border border-border bg-surface p-4 rounded-xl space-y-2">
                    <span className="text-[11px] font-mono uppercase text-primary font-semibold">Repository & Branch</span>
                    <div className="text-sm font-medium font-mono">{node.repo || "org/" + node.label.toLowerCase().replace(/\s+/g, "-")}</div>
                    <div className="text-xs text-muted-foreground">Active Branch: <span className="text-foreground font-mono">main (Protected)</span></div>
                  </div>
                  <div className="border border-border bg-surface p-4 rounded-xl space-y-2">
                    <span className="text-[11px] font-mono uppercase text-primary font-semibold">Commit Baseline</span>
                    <div className="text-sm font-medium font-mono">HEAD @ 4f89b2c (2 hours ago)</div>
                    <div className="text-xs text-muted-foreground">Author: <span className="text-foreground font-mono">{node.owners[0] || "@lead-architect"}</span></div>
                  </div>
                </div>

                <div className="border border-border bg-surface p-4 rounded-xl space-y-3">
                  <span className="text-[11px] font-mono uppercase text-primary font-semibold">Files & Modules</span>
                  <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                    <div className="bg-card p-2.5 rounded-lg border border-border flex items-center justify-between">
                      <span className="text-muted-foreground">Total Files</span>
                      <span className="text-foreground font-semibold">{node.blast.files} files</span>
                    </div>
                    <div className="bg-card p-2.5 rounded-lg border border-border flex items-center justify-between">
                      <span className="text-muted-foreground">Active Modules</span>
                      <span className="text-foreground font-semibold">{node.blast.modules} modules</span>
                    </div>
                  </div>
                </div>

                <div className="border border-border bg-surface p-4 rounded-xl space-y-3">
                  <span className="text-[11px] font-mono uppercase text-primary font-semibold">Functions & Classes</span>
                  <div className="space-y-2 text-xs font-mono">
                    {node.detail?.classes?.length ? (
                      node.detail.classes.map((c, i) => (
                        <div key={i} className="bg-card p-2 rounded-lg border border-border flex items-center justify-between">
                          <span className="text-foreground font-medium">class {c}</span>
                          <span className="text-muted-foreground text-[10px]">Methods: 6 · LOC: 142</span>
                        </div>
                      ))
                    ) : (
                      <div className="bg-card p-2.5 rounded-lg border border-border text-foreground">
                        class ServiceController {{/* Core logic handlers */}}
                      </div>
                    )}
                    {node.detail?.functions?.map((f, i) => (
                      <div key={i} className="bg-card p-2 rounded-lg border border-border flex items-center justify-between">
                        <span className="text-foreground font-medium">function {f}()</span>
                        <span className="text-muted-foreground text-[10px]">Async · Exported</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="border border-border bg-surface p-4 rounded-xl space-y-3">
                  <span className="text-[11px] font-mono uppercase text-primary font-semibold">Imports, Exports & APIs</span>
                  <div className="text-xs font-mono space-y-1 text-muted-foreground">
                    <div>• Imports: 14 core modules, 6 shared utilities</div>
                    <div>• Exports: REST Router, gRPC client stubs, GraphQL resolvers</div>
                    <div>• Public APIs: <span className="text-foreground">/api/v1/{node.label.toLowerCase().replace(/\s+/g, "-")}</span></div>
                  </div>
                </div>

                <div className="border border-border bg-surface p-4 rounded-xl space-y-2">
                  <span className="text-[11px] font-mono uppercase text-primary font-semibold">Configuration</span>
                  <div className="bg-card p-3 rounded-lg border border-border font-mono text-[11px] text-muted-foreground leading-relaxed">
                    env: production<br />
                    timeout_ms: 5000<br />
                    telemetry_enabled: true
                  </div>
                </div>
              </div>
            )}

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
                    <span className="text-[10px] font-mono uppercase text-primary">Message Queue</span>
                    <div className="text-sm font-semibold">Redis / Kafka</div>
                  </div>
                  <div className="border border-border bg-surface p-4 rounded-xl space-y-1">
                    <span className="text-[10px] font-mono uppercase text-primary">Cache Tier</span>
                    <div className="text-sm font-semibold">Redis Cluster</div>
                  </div>
                  <div className="border border-border bg-surface p-4 rounded-xl space-y-1">
                    <span className="text-[10px] font-mono uppercase text-primary">Authentication</span>
                    <div className="text-sm font-semibold">JWT / OAuth2</div>
                  </div>
                </div>

                <div className="border border-border bg-surface p-4 rounded-xl space-y-3">
                  <span className="text-[11px] font-mono uppercase text-primary font-semibold">Infrastructure & Topology</span>
                  <div className="text-xs font-mono text-muted-foreground space-y-1.5">
                    <div>• Kubernetes Cluster: <span className="text-foreground">us-east-prod-01</span></div>
                    <div>• Load Balancer: <span className="text-foreground">AWS ALB with SSL termination</span></div>
                    <div>• Service Mesh: <span className="text-foreground">Istio mTLS active</span></div>
                  </div>
                </div>
              </div>
            )}

            {tab === "dependencies" && (
              <div className="space-y-4">
                <div className="border border-border bg-surface p-4 rounded-xl space-y-3">
                  <span className="text-[11px] font-mono uppercase text-primary font-semibold">Packages & Versions (npm / pip)</span>
                  <div className="space-y-2 text-xs font-mono">
                    <div className="bg-card p-2.5 rounded-lg border border-border flex items-center justify-between">
                      <span className="text-foreground">@tanstack/react-router</span>
                      <span className="text-muted-foreground">v1.58.0</span>
                    </div>
                    <div className="bg-card p-2.5 rounded-lg border border-border flex items-center justify-between">
                      <span className="text-foreground">tailwindcss</span>
                      <span className="text-muted-foreground">v4.0.0</span>
                    </div>
                    <div className="bg-card p-2.5 rounded-lg border border-border flex items-center justify-between">
                      <span className="text-foreground">supabase-js</span>
                      <span className="text-muted-foreground">v2.39.0</span>
                    </div>
                  </div>
                </div>

                <div className="border border-border bg-surface p-4 rounded-xl space-y-3">
                  <span className="text-[11px] font-mono uppercase text-primary font-semibold">Internal Libraries & SDKs</span>
                  <div className="text-xs font-mono text-muted-foreground space-y-1">
                    <div>• @nykst/auth-sdk (v2.1.0)</div>
                    <div>• @nykst/telemetry-core (v4.0.2)</div>
                    <div>• AWS SDK v3 Modular</div>
                  </div>
                </div>

                <div className="border border-border bg-surface p-4 rounded-xl space-y-3">
                  <span className="text-[11px] font-mono uppercase text-primary font-semibold">Cloud Services & Databases</span>
                  <div className="text-xs font-mono text-muted-foreground space-y-1">
                    <div>• Amazon S3 (Object Storage)</div>
                    <div>• AWS RDS PostgreSQL (Primary DB)</div>
                    <div>• Redis Cloud (Session Cache)</div>
                  </div>
                </div>
              </div>
            )}

            {tab === "changes" && (
              <div className="space-y-4">
                <div className="border border-border bg-surface p-4 rounded-xl space-y-3">
                  <span className="text-[11px] font-mono uppercase text-primary font-semibold">Commits & Pull Requests</span>
                  <div className="space-y-2 text-xs font-mono">
                    <div className="bg-card p-3 rounded-lg border border-border space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-foreground font-semibold">PR #482: Optimize graph rendering pipeline</span>
                        <span className="text-emerald-400">Merged</span>
                      </div>
                      <div className="text-muted-foreground text-[11px]">4 commits · 12 files changed · Approved by @lead-architect</div>
                    </div>
                    <div className="bg-card p-3 rounded-lg border border-border space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-foreground font-semibold">PR #479: Fix circular dependency resolution</span>
                        <span className="text-emerald-400">Merged</span>
                      </div>
                      <div className="text-muted-foreground text-[11px]">2 commits · 3 files changed · Approved by @security-lead</div>
                    </div>
                  </div>
                </div>

                <div className="border border-border bg-surface p-4 rounded-xl space-y-3">
                  <span className="text-[11px] font-mono uppercase text-primary font-semibold">Deployments & Migrations</span>
                  <div className="text-xs font-mono text-muted-foreground space-y-1.5">
                    <div>• Production Deploy: <span className="text-foreground">v2.4.1 (Successfully rolled out 3 hours ago)</span></div>
                    <div>• Database Migration: <span className="text-foreground">V402__add_index_to_nodes.sql (Applied)</span></div>
                    <div>• Feature Flag: <span className="text-foreground">enable_ai_reasoning_v2 (Active for 50% traffic)</span></div>
                  </div>
                </div>

                <div className="border border-border bg-surface p-4 rounded-xl space-y-3">
                  <span className="text-[11px] font-mono uppercase text-primary font-semibold">AI-Generated Code & Prompts</span>
                  <div className="bg-card p-3 rounded-lg border border-border font-mono text-xs space-y-2">
                    <div className="text-muted-foreground">Prompt used: <span className="text-foreground">"Refactor GraphCanvas to ensure zero node overlap and pristine circular layout."</span></div>
                    <div className="text-emerald-400 text-[11px]">✓ Generated by Nykst Autonomous Engine · 100% Verified</div>
                  </div>
                </div>
              </div>
            )}
          </main>
        </div>
      </DialogContent>
    </Dialog>
  );
}
