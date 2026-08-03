import { Link, createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { GraphCanvas } from "@/components/graph/GraphCanvas";
import { Inspector } from "@/components/graph/Inspector";
import { NodeDossier } from "@/components/graph/NodeDossier";
import { OnboardingTour } from "@/components/graph/OnboardingTour";
import { TreePanel } from "@/components/graph/TreePanel";
import { ROLES, canView, setRoleId, useRole, type RoleId } from "@/lib/access";
import { childKindLabel, childrenOf, getOrg, kindLabel, type GraphNode } from "@/lib/graph-data";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/graph")({
  head: () => ({
    meta: [
      { title: "Software Graph — Nykst" },
      {
        name: "description",
        content:
          "Navigate your organization's software graph: drill from core domains into capabilities, services, modules and individual files, with dependencies and blast radius.",
      },
      { property: "og:title", content: "Software Graph — Nykst" },
      {
        property: "og:description",
        content: "Drill from core domains down to a single file, one click at a time.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
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

  // rebuild the concrete node path from stored ids
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
    // walk down from root to find the node's ancestry using its id prefix
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
    <main className="flex h-screen flex-col overflow-hidden">
      <header className="border-border flex items-center justify-between gap-4 border-b px-5 py-3">
        <Link to="/" className="flex shrink-0 items-center gap-2.5">
          <span className="glow-ring bg-primary block size-2 rounded-full" />
          <span className="text-[13px] font-semibold tracking-[0.24em] uppercase">Nykst</span>
        </Link>

        <nav className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto text-sm">
          {path.map((node, i) => (
            <span key={node.id} className="flex shrink-0 items-center gap-1.5">
              {i > 0 && <span className="text-muted-foreground/50">/</span>}
              <button
                onClick={() => {
                  setPathIds(pathIds.slice(0, i));
                  setSelected(null);
                }}
                className={cn(
                  "rounded-md px-2 py-1 transition-colors",
                  i === path.length - 1
                    ? "text-foreground bg-secondary"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {node.label}
              </button>
            </span>
          ))}
        </nav>

        <label className="border-border bg-surface flex shrink-0 items-center gap-2 rounded-full border px-3 py-1 text-xs">
          <span className="text-muted-foreground">Role</span>
          <select
            value={role.id}
            onChange={(e) => setRoleId(e.target.value as RoleId)}
            className="bg-transparent text-xs outline-none"
          >
            {ROLES.map((r) => (
              <option key={r.id} value={r.id} className="bg-card">
                {r.name}
              </option>
            ))}
          </select>
        </label>

        <div className="border-border text-muted-foreground flex shrink-0 items-center gap-2 rounded-full border px-3 py-1 text-xs">
          <span className="bg-primary size-1.5 rounded-full" />
          {root.label}
          <span className="text-muted-foreground/60">· {PROVIDER_LABEL[provider] ?? provider}</span>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <TreePanel
          root={root}
          activeId={inspected.id}
          openIds={openIds}
          onSelect={jumpTo}
          visible={(n) => canView(role, n)}
        />

        <section className="relative min-w-0 flex-1">
          <div className="pointer-events-none absolute top-5 left-6 z-10 max-w-sm">
            <span className="text-primary text-[11px] tracking-[0.28em] uppercase">
              {kindLabel[center.kind]}
            </span>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight">{center.label}</h1>
            <p className="text-muted-foreground mt-2 text-sm leading-relaxed">{center.summary}</p>
            {center.metrics && (
              <div className="mt-4 flex gap-5">
                {center.metrics.map((m) => (
                  <div key={m.label}>
                    <div className="text-sm font-medium">{m.value}</div>
                    <div className="text-muted-foreground text-[11px] tracking-wide uppercase">
                      {m.label}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="text-muted-foreground pointer-events-none absolute bottom-5 left-6 z-10 text-[11px] tracking-[0.22em] uppercase">
            {childKindLabel[center.kind]} · {centerChildren.length}
            {restricted > 0 && (
              <span className="text-primary"> · {restricted} restricted by role</span>
            )}
          </div>

          {path.length > 1 && (
            <button
              onClick={() => {
                setPathIds(pathIds.slice(0, -1));
                setSelected(null);
              }}
              className="border-border bg-surface hover:bg-surface-2 absolute top-5 right-6 z-10 rounded-lg border px-3 py-1.5 text-xs transition-colors"
            >
              ← Zoom out
            </button>
          )}

          <GraphCanvas
            key={center.id}
            center={center}
            nodes={centerChildren}
            childKind={childKind}
            onSelect={drill}
            onInspect={setDossier}
            selectedId={selected?.id}
          />

        </section>

        <Inspector
          node={inspected}
          related={
            inspected.expandable ? childrenOf(inspected).filter((n) => canView(role, n)) : []
          }
          onClose={() => setSelected(null)}
          onOpen={drill}
        />
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
