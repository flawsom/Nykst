import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { GraphCanvas } from "@/components/graph/GraphCanvas";
import { MentorPanel } from "@/components/graph/MentorPanel";
import { NodeDossier } from "@/components/graph/NodeDossier";
import { TreePanel } from "@/components/graph/TreePanel";
import { IntelligenceDashboard } from "@/components/graph/IntelligenceDashboard";
import { canView, useRole } from "@/lib/access";
import { childKindLabel, childrenOf, getOrg, kindLabel, type GraphNode } from "@/lib/graph-data";
import { cn } from "@/lib/utils";
import { ArrowLeft, Network, ShieldAlert, Sparkles, Layers } from "lucide-react";

export const Route = createFileRoute("/graph")({
  head: () => ({
    meta: [
      { title: "Software Graph & Intelligence Core — Nykst" },
      {
        name: "description",
        content: "Navigate your organization's software graph and enterprise intelligence memory core.",
      },
    ],
  }),
  component: GraphAndIntelligencePage,
});

function GraphAndIntelligencePage() {
  const [orgSlug, setOrgSlug] = useState("acme");
  const [provider, setProvider] = useState("github");
  const [pathIds, setPathIds] = useState<string[]>([]);
  const [selected, setSelected] = useState<GraphNode | null>(null);
  const [dossier, setDossier] = useState<GraphNode | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = localStorage.getItem("nykst.org");
    const p = localStorage.getItem("nykst.provider");
    if (stored) setOrgSlug(stored);
    if (p) setProvider(p);
  }, []);

  const root = useMemo(() => getOrg(orgSlug), [orgSlug]);

  const path = useMemo(() => {
    const out: GraphNode[] = [root];
    for (const id of pathIds) {
      const parent = out[out.length - 1]!;
      const next = childrenOf(parent).find((c) => c.id === id);
      if (!next) break;
      out.push(next);
    }
    return out;
  }, [root, pathIds]);

  const role = useRole();
  const center = path[path.length - 1]!;
  const allChildren = useMemo(() => childrenOf(center), [center]);
  const centerChildren = useMemo(
    () => allChildren.filter((n) => canView(role, n)),
    [allChildren, role],
  );
  const restricted = allChildren.length - centerChildren.length;
  const openIds = useMemo(() => new Set(path.map((n) => n.id)), [path]);

  const drill = (node: GraphNode) => {
    if (node.expandable) {
      setPathIds((p) => [...p, node.id]);
      setSelected(null);
    } else {
      setSelected(node);
    }
  };

  const jumpTo = (node: GraphNode) => {
    const chain: string[] = [];
    let cursor: GraphNode = root;
    while (cursor.id !== node.id) {
      const next = childrenOf(cursor).find((c) => node.id.startsWith(c.id));
      if (!next) break;
      chain.push(next.id);
      cursor = next;
    }
    if (node.expandable) {
      setPathIds(chain);
      setSelected(null);
    } else {
      setPathIds(chain.slice(0, -1));
      setSelected(node);
    }
  };

  const childKind = (centerChildren[0]?.kind ?? "file") as GraphNode["kind"];
  const inspected = selected ?? center;

  return (
    <main className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Header */}
      <header className="border-border flex items-center justify-between gap-4 border-b px-6 py-3 bg-card/80 backdrop-blur sticky top-0 z-50">
        <div className="flex items-center gap-4">
          <Link
            to="/"
            className="border-border bg-surface hover:bg-surface-2 flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors"
          >
            <ArrowLeft className="size-3.5" /> Back to Home
          </Link>
          <div className="flex items-center gap-2.5">
            <span className="glow-ring bg-primary block size-2 rounded-full" />
            <span className="text-sm font-semibold text-foreground">Nykst Software Intelligence</span>
            <span className="border-border bg-surface rounded-full border px-2.5 py-0.5 font-mono text-[11px] text-muted-foreground hidden sm:inline">
              {provider} / {orgSlug}
            </span>
          </div>
        </div>

        <nav className="flex items-center gap-3 text-xs">
          <span className="text-muted-foreground font-mono">14 Domains Mapped • 128 Repositories Indexed</span>
        </nav>
      </header>

      {/* Main Content Layout */}
      <div className="flex-1 p-6 space-y-10 max-w-[1600px] mx-auto w-full">
        {/* SECTION 1: OVERVIEW (Graph Section) */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-primary font-mono text-[11px] uppercase tracking-widest">
                Section 1: Living Software Graph Overview
              </span>
              <h2 className="text-lg font-semibold tracking-tight text-foreground">
                Interactive Graph Navigation ({kindLabel(center.kind)}: {center.label})
              </h2>
            </div>
            <div className="text-muted-foreground font-mono text-xs">
              {centerChildren.length} {childKindLabel(childKind)} mapped
            </div>
          </div>

          <div className="border-border bg-card/60 rounded-2xl border overflow-hidden backdrop-blur shadow-2xl">
            <div className="grid h-[600px] lg:grid-cols-12">
              {/* Left Tree Panel */}
              <div className="border-border hidden flex-col border-r lg:col-span-3 lg:flex">
                <div className="border-border border-b px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  System Tree Navigator
                </div>
                <div className="flex-1 overflow-y-auto p-3">
                  <TreePanel root={root} openIds={openIds} activeId={center.id} onSelect={jumpTo} />
                </div>
              </div>

              {/* Center Graph Canvas */}
              <div className="relative flex flex-col lg:col-span-6 bg-background/50">
                <div className="border-border border-b px-4 py-3 flex items-center justify-between bg-surface/40">
                  <span className="text-xs font-medium font-mono text-muted-foreground">
                    Path: {path.map((n) => n.label).join(" → ")}
                  </span>
                  {path.length > 1 && (
                    <button
                      onClick={() => {
                        setPathIds((p) => p.slice(0, -1));
                        setSelected(null);
                      }}
                      className="text-primary text-xs hover:underline"
                    >
                      ← Up one level
                    </button>
                  )}
                </div>

                <div className="relative flex-1">
                  <GraphCanvas
                    center={center}
                    childrenNodes={centerChildren}
                    restricted={restricted}
                    onDrill={drill}
                    onSelect={(n) => setSelected(n === selected ? null : n)}
                    selectedId={inspected.id}
                  />
                </div>
              </div>

              {/* Right Dossier & Mentor Panel */}
              <div className="border-border flex flex-col border-l lg:col-span-3">
                <div className="border-border border-b px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Node Dossier & AI Mentor
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                  <NodeDossier node={inspected} onOpenDossier={setDossier} />
                  <MentorPanel node={inspected} />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* SECTION 2: INTELLIGENCE DASHBOARD (Below Overview) */}
        <section className="space-y-4 pt-4 border-t border-border">
          <div>
            <span className="text-primary font-mono text-[11px] uppercase tracking-widest">
              Section 2: Enterprise Intelligence Memory Core
            </span>
            <h2 className="text-lg font-semibold tracking-tight text-foreground">
              Memory Files, Folders & AI Architect Assistant
            </h2>
          </div>

          <IntelligenceDashboard projectName="Nykst Enterprise Core" repo={`${provider}/${orgSlug}/enterprise-core`} />
        </section>
      </div>
    </main>
  );
}
