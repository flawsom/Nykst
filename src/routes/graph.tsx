import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { GraphCanvas } from "@/components/graph/GraphCanvas";
import { MentorPanel } from "@/components/graph/MentorPanel";
import { NodeInspector } from "@/components/graph/NodeInspector";
import { OnboardingTour } from "@/components/graph/OnboardingTour";
import { TreePanel } from "@/components/graph/TreePanel";
import { canView, useRole } from "@/lib/access";
import { childKindLabel, childrenOf, getOrg, kindLabel, type GraphNode } from "@/lib/graph-data";
import {
  buildRepositoryGraph,
  traceRepositoryProblems,
  type RepositorySnapshot,
} from "@/lib/repository-graph";
import { Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type IngestionSnapshot = {
  repository_full_name: string;
  created_at: string;
  payload: RepositorySnapshot;
};

export const Route = createFileRoute("/graph")({
  head: () => ({
    meta: [
      { title: "Software Graph & Navigator — Nykst" },
      {
        name: "description",
        content:
          "Navigate your organization's software graph: drill from core domains into capabilities, services, modules and individual files, with dependencies and blast radius.",
      },
      { property: "og:title", content: "Software Graph & Navigator — Nykst" },
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
  const [orgSlug, setOrgSlug] = useState("acme");
  const [provider, setProvider] = useState("github");
  const [pathIds, setPathIds] = useState<string[]>([]);
  const [selected, setSelected] = useState<GraphNode | null>(null);
  const [dossier, setDossier] = useState<GraphNode | null>(null);
  const [snapshot, setSnapshot] = useState<IngestionSnapshot | null>(null);
  const [demoMode, setDemoMode] = useState(false);
  const [authRequired, setAuthRequired] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const isDemo = new URLSearchParams(window.location.search).get("demo") === "1";
    setDemoMode(isDemo);
    if (isDemo) {
      setOrgSlug("acme");
      setProvider("demo");
      setSnapshot(null);
      return;
    }

    let active = true;
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!active) return;
        if (!data.session) {
          setAuthRequired(true);
          return;
        }
        const stored = localStorage.getItem("nykst.org");
        const p = localStorage.getItem("nykst.provider");
        if (stored) setOrgSlug(stored);
        if (p) setProvider(p);
        return fetch("/api/integrations/github/latest")
          .then(async (response) => {
            if (!response.ok) return null;
            const payload = (await response.json()) as { ingestion?: IngestionSnapshot | null };
            return payload.ingestion ?? null;
          })
          .then((ingestion) => active && setSnapshot(ingestion))
          .catch(() => active && setSnapshot(null));
      })
      .catch(() => active && setAuthRequired(true));

    return () => {
      active = false;
    };
  }, []);

  const root = useMemo(
    () => (snapshot ? buildRepositoryGraph(snapshot.payload) : getOrg(orgSlug)),
    [orgSlug, snapshot],
  );
  const problems = useMemo(
    () => (snapshot ? traceRepositoryProblems(snapshot.payload) : []),
    [snapshot],
  );

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

  if (authRequired) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-5">
        <div className="border-border bg-card w-full max-w-md rounded-3xl border p-8 text-center shadow-2xl">
          <span className="glow-ring bg-primary mx-auto block size-3 rounded-full" />
          <p className="text-primary mt-6 text-[10px] font-mono tracking-[0.28em] uppercase">
            Account required
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">
            Create your Nykst account first
          </h1>
          <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
            Sign up before entering your private software map. Your connected repository stays
            attached to your account.
          </p>
          <Link
            to="/"
            className="bg-primary text-primary-foreground mt-6 inline-flex rounded-xl px-5 py-3 text-sm font-semibold"
          >
            Continue to sign up
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="flex h-screen flex-col overflow-hidden">
      <header className="border-border flex shrink-0 flex-wrap items-center gap-x-4 gap-y-3 border-b px-4 py-3 sm:px-5">
        <Link to="/" className="flex items-center gap-2.5">
          <span className="glow-ring bg-primary block size-2 rounded-full" />
          <span className="text-[13px] font-semibold tracking-[0.24em] uppercase">Nykst</span>
        </Link>

        <nav className="order-3 flex w-full min-w-0 items-center gap-2.5 overflow-x-auto text-sm sm:order-none sm:w-auto sm:flex-1">
          {path.map((node, i) => (
            <span key={node.id} className="flex shrink-0 items-center gap-1.5">
              {i > 0 && <span className="text-muted-foreground/60 px-1 text-xs">/</span>}
              <button
                onClick={() => setPathIds(pathIds.slice(0, i))}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                  i === path.length - 1
                    ? "bg-secondary text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {node.label}
              </button>
            </span>
          ))}
        </nav>

        <div className="flex items-center gap-3 shrink-0">
          <a
            href={demoMode ? "/intelligence?demo=1" : "/intelligence"}
            className="text-primary hover:underline text-xs font-medium flex items-center gap-1 bg-primary/10 border border-primary/20 px-3 py-1.5 rounded-lg"
          >
            <Sparkles className="size-3.5" /> Intelligence Core →
          </a>
          <span className="text-muted-foreground hidden max-w-[240px] truncate font-mono text-xs lg:inline">
            {orgSlug} · {provider}
          </span>
        </div>
      </header>

      <div className="flex flex-1 min-h-0 overflow-hidden">
        <TreePanel
          root={root}
          openIds={openIds}
          activeId={inspected.id}
          onSelect={jumpTo}
          visible={(n) => canView(role, n)}
        />

        <section className="flex min-w-0 flex-1 flex-col overflow-y-auto p-3 sm:p-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <span className="text-primary text-[10px] tracking-[0.28em] uppercase font-mono">
                {demoMode ? "Demo thesis system map" : kindLabel[center.kind]}
              </span>
              <h1 className="text-2xl font-bold tracking-tight mt-0.5">{center.label}</h1>
            </div>
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

          {snapshot && (
            <div className="border-primary/25 bg-primary/5 mt-4 rounded-xl border px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-primary text-[10px] font-mono tracking-[0.2em] uppercase">
                    Live repository intelligence
                  </p>
                  <p className="mt-1 text-sm font-semibold">{snapshot.repository_full_name}</p>
                </div>
              </div>
              <div className="text-muted-foreground mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px]">
                <span>{snapshot.payload.files?.length ?? 0} files</span>
                <span>{snapshot.payload.commits?.length ?? 0} commits</span>
                <span>{snapshot.payload.branches?.length ?? 0} branches</span>
                <span>{snapshot.payload.pull_requests?.length ?? 0} pull requests</span>
                <span>{snapshot.payload.issues?.length ?? 0} issues</span>
                <span>{snapshot.payload.contributors?.length ?? 0} contributors</span>
              </div>
              {problems.length > 0 && (
                <div className="border-border/70 mt-3 border-t pt-3">
                  <p className="text-primary text-[10px] font-mono tracking-[0.2em] uppercase">
                    Traceable code problems
                  </p>
                  <div className="mt-2 space-y-1.5">
                    {problems.slice(0, 5).map((problem) => (
                      <div
                        key={problem.id}
                        className="flex items-start justify-between gap-3 text-[11px]"
                      >
                        <span className="min-w-0 truncate">{problem.title}</span>
                        <span className="text-muted-foreground shrink-0 font-mono">
                          {problem.likelyFiles.length} related files
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="relative mt-5 min-h-[480px] flex-1 sm:min-h-[520px]">
            <GraphCanvas
              key={`${center.id}-${role.id}`}
              center={center}
              nodes={centerChildren}
              childKind={childKind}
              onSelect={drill}
              onInspect={setDossier}
              selectedId={selected?.id}
              technical={true}
            />
          </div>

          <div className="mt-4 flex flex-col items-start gap-2 border-t border-border pt-4 text-xs text-muted-foreground font-mono sm:flex-row sm:items-center sm:justify-between">
            <span>
              {demoMode ? "Nykst Demo · " : "Software Navigator · "}
              {childKindLabel[center.kind]} ({centerChildren.length})
            </span>
            <span>Choose a node or tree item to drill deeper</span>
          </div>
        </section>

        <MentorPanel
          node={inspected}
          role={role}
          related={
            inspected.expandable ? childrenOf(inspected).filter((n) => canView(role, n)) : []
          }
          onOpen={drill}
          repositoryProblems={snapshot ? problems : undefined}
        />
      </div>

      <OnboardingTour />

      <NodeInspector node={dossier} open={dossier !== null} onClose={() => setDossier(null)} />
    </main>
  );
}
