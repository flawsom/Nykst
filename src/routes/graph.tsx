import { Link, createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { GraphCanvas } from "@/components/graph/GraphCanvas";
import { Inspector } from "@/components/graph/Inspector";
import { ORGS, childKindLabel, getOrg, kindLabel, type GraphNode } from "@/lib/graph-data";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/graph")({
  head: () => ({
    meta: [
      { title: "Software Graph — Nykst" },
      {
        name: "description",
        content:
          "Navigate your organization's software graph: drill from core domains into capabilities, services, modules and individual files.",
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

function GraphPage() {
  const [orgKey, setOrgKey] = useState<string>("netflix");
  const [path, setPath] = useState<GraphNode[]>([getOrg("netflix")]);
  const [selected, setSelected] = useState<GraphNode | null>(null);

  useEffect(() => {
    const stored = typeof window !== "undefined" ? localStorage.getItem("nykst.org") : null;
    if (stored && stored in ORGS) {
      setOrgKey(stored);
      setPath([getOrg(stored)]);
      setSelected(null);
    }
  }, []);

  const center = path[path.length - 1] ?? getOrg(orgKey);

  const onSelect = (node: GraphNode) => {
    if (node.children?.length) {
      setPath((p) => [...p, node]);
      setSelected(null);
    } else {
      setSelected(node);
    }
  };

  const switchOrg = (key: string) => {
    setOrgKey(key);
    setPath([getOrg(key)]);
    setSelected(null);
    if (typeof window !== "undefined") localStorage.setItem("nykst.org", key);
  };

  const childKind = (center.children?.[0]?.kind ?? "file") as GraphNode["kind"];

  return (
    <main className="flex h-screen flex-col overflow-hidden">
      <header className="border-border flex items-center justify-between gap-4 border-b px-5 py-3">
        <Link to="/" className="flex items-center gap-2.5">
          <span className="glow-ring bg-primary block size-2 rounded-full" />
          <span className="text-[13px] font-semibold tracking-[0.24em] uppercase">Nykst</span>
        </Link>

        <nav className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto text-sm">
          {path.map((node, i) => (
            <span key={node.id} className="flex shrink-0 items-center gap-1.5">
              {i > 0 && <span className="text-muted-foreground/50">/</span>}
              <button
                onClick={() => {
                  setPath(path.slice(0, i + 1));
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

        <div className="flex shrink-0 items-center gap-1">
          {Object.entries(ORGS).map(([key, node]) => (
            <button
              key={key}
              onClick={() => switchOrg(key)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs transition-colors",
                orgKey === key
                  ? "border-primary text-primary"
                  : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              {node.label}
            </button>
          ))}
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
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
            {childKindLabel[center.kind]} · {center.children?.length ?? 0}
          </div>

          {path.length > 1 && (
            <button
              onClick={() => {
                setPath(path.slice(0, -1));
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
            childKind={childKind}
            onSelect={onSelect}
            selectedId={selected?.id}
          />
        </section>

        <Inspector node={selected ?? center} onClose={() => setSelected(null)} />
      </div>
    </main>
  );
}
