import { Link, createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { GraphCanvas } from "@/components/graph/GraphCanvas";
import { MentorPanel } from "@/components/graph/MentorPanel";
import { NodeDossier } from "@/components/graph/NodeDossier";
import { OnboardingTour } from "@/components/graph/OnboardingTour";
import { TreePanel } from "@/components/graph/TreePanel";
import { IntelligenceDashboard } from "@/components/graph/IntelligenceDashboard";
import { ROLES, canView, setRoleId, useRole, type RoleId } from "@/lib/access";
import { childKindLabel, childrenOf, getOrg, kindLabel, type GraphNode } from "@/lib/graph-data";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/graph")({
  head: () => ({
    meta: [
      { title: "Software Graph & Intelligence Core — Nykst" },
      {
        name: "description",
        content:
          "Navigate your organization's software graph and enterprise intelligence memory core.",
      },
    ],
  }),
  component: GraphPage,
});

const PROVIDER_LABEL: Record<string, string> = {
  github: "GitHub",
  gitlab: "GitLab",
  bitbucket: "Bitbucket",
  azure: "Azure DevOps",
};

function GraphPage() {
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
    <main className="min-h-screen bg-background text-foreground flex flex-col overflow-y-auto">
      <header className="border-border flex items-center justify-between gap-4 border-b px-5 py-3 shrink-0 bg-card/90 backdrop-blur sticky top-0 z-40">
        <Link to="/" className="flex shrink-0 items-center gap-2.5">
          <span className="glow-ring bg-primary block size-2 rounded-full" />
          <span className="text-[13px] font-semibold tracking-[0.24em] uppercase">Nykst</span>
        </Link>

        <nav className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto text-sm">
          {path.map((node, i) => (
            <span key={node.id} className="flex shrink-0 items-center gap-1.5">
              {i > 0 && <span className="text-muted-foreground/60 text-xs">/</span>}
              <button
                onClick={() => {
                  setPathIds(pathIds.slice(0, i));
                  setSelected(null);
                }}
                className={cn(
                  "rounded-md px-2 py-1 text-xs font-medium transition-colors",
                  i === path.length - 1
                    ? "bg-secondary text-secondary-foreground font-semibold"
                    : "text-muted-foreground hover:bg-surface hover:text-foreground",
                )}
              >
                {node.label}
              </button>
            </span>
          ))}
        </nav>

        <div className="flex shrink-0 items-center gap-3 text-xs">
          <div className="border-border bg-surface hidden items-center gap-1.5 rounded-lg border px-2.5 py-1 md:flex">
            <span className="text-muted-foreground font-mono text-[11px]">
              {PROVIDER_LABEL[provider] ?? provider} / {orgSlug}
            </span>
          </div>

          <div className="flex items-center gap-1">
            {ROLES.map((r) => (
              <button
                key={r.id}
                onClick={() => setRoleId(r.id)}
                className={cn(
                  "rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors",
                  role.id === r.id
                    ? "bg-primary text-primary-foreground font-semibold shadow-sm"
                    : "text-muted-foreground hover:bg-surface hover:text-foreground",
                )}
                title={r.blurb}
              >
                {r.name}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* SECTION 1: ORIGINAL GRAPH NAVIGATOR */}
      <div className="flex min-h-[640px] flex-1 p-5 gap-5">
        <TreePanel root={root} openIds={openIds} activeId={center.id} onSelect={jumpTo} />

        <section className="border-border bg-card/60 flex min-w-0 flex-1 flex-col rounded-2xl border p-5 backdrop-blur shadow-lg">
          <div className="flex flex-wrap items-baseline justify-between gap-3 border-border border-b pb-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground font-mono text-[11px] uppercase tracking-wider">
                  {kindLabel[center.kind]}
                </span>
                {restricted > 0 && (
                  <span className="rounded-full bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 text-[10px] text-amber-400 font-mono">
                    {restricted} restricted for {role.name.toLowerCase()}
                  </span>
                )}
              </div>
              <h1 className="text-gradient mt-1 text-2xl font-semibold tracking-tight">
                {center.label}
              </h1>
            </div>

            {center.repo && (
              <span className="border-border bg-surface rounded-lg border px-2.5 py-1 font-mono text-xs text-muted-foreground">
                {center.repo}
              </span>
            )}
          </div>

          {center.summary && (
            <p className="text-muted-foreground mt-1.5 max-w-2xl text-[12px] leading-relaxed">
              {center.summary}
            </p>
          )}

          {center.metrics && (
            <div className="mt-2.5 flex flex-wrap gap-x-5 gap-y-1.5">
              {center.metrics.map((m) => (
                <div key={m.label} className="flex items-baseline gap-1.5">
                  <span className="text-sm font-semibold">{m.value}</span>
                  <span className="text-muted-foreground text-[10px] tracking-wide uppercase">
                    {m.label}
                  </span>
                </div>
              ))}
            </div>
          )}

          <div className="relative min-h-[420px] flex-1 mt-4">
            <GraphCanvas
              key={`${center.id}-${role.id}`}
              center={center}
              nodes={centerChildren}
              childKind={childKind}
              onSelect={drill}
              onInspect={setDossier}
              selectedId={selected?.id}
              technical={role.id === "engineer" || role.id === "architect"}
            />
          </div>
        </section>

        <MentorPanel
          node={inspected}
          role={role}
          related={
            inspected.expandable ? childrenOf(inspected).filter((n) => canView(role, n)) : []
          }
          onOpen={drill}
        />
      </div>

      {/* SECTION 2: INTELLIGENCE DASHBOARD (Clean File/Folder Explorer & Ask AI) */}
      <div className="px-5 pb-10">
        <div className="border-t border-border pt-6 mt-4">
          <div className="mb-4">
            <span className="text-primary font-mono text-[11px] uppercase tracking-widest">
              Enterprise Intelligence Memory Core
            </span>
            <h2 className="text-lg font-semibold tracking-tight text-foreground">
              Files, Folders & Ask AI Assistant
            </h2>
          </div>
          <IntelligenceDashboard />
        </div>
      </div>

      <OnboardingTour />

      <NodeDossier
        node={dossier}
        role={role}
        open={dossier !== null}
        onClose={() => setDossier(null)}
        onOpenNode={jumpTo}
      />
    </main>
  );
}
