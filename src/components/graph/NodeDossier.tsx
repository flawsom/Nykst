import { useMemo, useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import {
  childKindLabel,
  childrenOf,
  kindLabel,
  type GraphNode,
  type NodeKind,
} from "@/lib/graph-data";
import { cn } from "@/lib/utils";
import type { RoleDef } from "@/lib/access";
import { knownRemedy, linkedTo, stepsFor, useRemediation, type IssueLike } from "@/lib/remediation";
import { ChevronRight, CornerUpLeft, Search, Sparkles } from "lucide-react";

/* deterministic scoring derived from the node identity */
function score(id: string) {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967296;
}

const RISK = ["Low", "Medium", "High", "Critical"] as const;
type Risk = (typeof RISK)[number];

function healthOf(n: GraphNode) {
  return Math.round(38 + score(`${n.id}#health`) * 61);
}
function riskOf(n: GraphNode): Risk {
  return RISK[Math.floor(score(`${n.id}#risk`) * RISK.length)]!;
}

const riskTone: Record<Risk, string> = {
  Low: "var(--node-file)",
  Medium: "var(--node-module)",
  High: "var(--node-capability)",
  Critical: "var(--primary)",
};

function healthTone(v: number) {
  if (v >= 80) return "var(--node-file)";
  if (v >= 65) return "var(--node-module)";
  if (v >= 50) return "var(--node-capability)";
  return "var(--primary)";
}

/* ---------------- descendant collection ---------------- */

const ORDER: NodeKind[] = ["org", "domain", "capability", "service", "module", "file"];

function descendantsOfKind(root: GraphNode, kind: NodeKind, cap = 160) {
  const target = ORDER.indexOf(kind);
  const start = ORDER.indexOf(root.kind);
  if (target <= start) return [] as { node: GraphNode; parent: GraphNode }[];
  let level: { node: GraphNode; parent: GraphNode }[] = childrenOf(root).map((c) => ({
    node: c,
    parent: root,
  }));
  for (let d = start + 1; d < target; d++) {
    const next: { node: GraphNode; parent: GraphNode }[] = [];
    for (const item of level) {
      if (!item.node.expandable) continue;
      for (const c of childrenOf(item.node)) {
        next.push({ node: c, parent: item.node });
        if (next.length >= cap) break;
      }
      if (next.length >= cap) break;
    }
    level = next;
  }
  return level.slice(0, cap);
}

type SectionId =
  | "overview"
  | "domain"
  | "capability"
  | "service"
  | "module"
  | "file"
  | "classes"
  | "functions"
  | "lines"
  | "issues"
  | "incidents"
  | "dependencies"
  | "tests"
  | "history"
  | "owners"
  | "ask";

const KIND_SECTIONS: { id: SectionId; kind: NodeKind }[] = [
  { id: "domain", kind: "domain" },
  { id: "capability", kind: "capability" },
  { id: "service", kind: "service" },
  { id: "module", kind: "module" },
  { id: "file", kind: "file" },
];

const SECTION_LABEL: Record<NodeKind, string> = {
  org: "Organizations",
  domain: "Domains",
  capability: "Capabilities",
  service: "Services",
  module: "Modules",
  file: "Files",
};

/* ---------------- aggregated code intelligence ---------------- */

function fileRows(n: GraphNode) {
  if (n.kind === "file") return [{ node: n, parent: n }];
  return descendantsOfKind(n, "file", 80);
}

type ClassRow = { name: string; file: string; loc: number; methods: number };

function classesOf(n: GraphNode): ClassRow[] {
  const out: ClassRow[] = [];
  for (const { node } of fileRows(n)) {
    const d = node.detail;
    if (!d) continue;
    for (const c of d.classes) {
      const s = score(`${node.id}#${c}`);
      out.push({
        name: c,
        file: node.label,
        loc: 40 + Math.round(s * 320),
        methods: d.functions.length,
      });
    }
  }
  return out;
}

function functionsOf(n: GraphNode) {
  const out: { name: string; file: string }[] = [];
  for (const { node } of fileRows(n)) {
    for (const f of node.detail?.functions ?? []) out.push({ name: f, file: node.label });
  }
  return out;
}

function linesOf(n: GraphNode) {
  const files = fileRows(n);
  const known = files.reduce((a, f) => a + (f.node.detail?.loc ?? 0), 0);
  const total = n.kind === "file" ? known : Math.max(known, n.blast.files * 120);
  const s = score(`${n.id}#lines`);
  const code = Math.round(total * (0.7 + s * 0.12));
  const comments = Math.round(total * 0.12);
  const blank = Math.max(0, total - code - comments);
  return {
    total,
    code,
    comments,
    blank,
    files: n.kind === "file" ? 1 : n.blast.files,
    languages: ["TypeScript", "Go", "Kotlin", "Python"].slice(0, 2 + Math.floor(s * 3)),
  };
}

const ISSUE_KINDS = [
  ["Cyclic dependency detected", "Architecture", "High"],
  ["Missing test coverage on error paths", "Quality", "Medium"],
  ["Deprecated API still referenced", "Maintenance", "Medium"],
  ["Unbounded retry loop", "Reliability", "Critical"],
  ["Secrets read at module scope", "Security", "High"],
  ["Hot path allocates per request", "Performance", "Medium"],
  ["Ownership unclear — no CODEOWNERS entry", "Governance", "Low"],
] as const;

function issuesOf(n: GraphNode) {
  const s = score(`${n.id}#issues`);
  const count = 2 + Math.floor(s * 4);
  return Array.from({ length: count }, (_, i) => {
    const k = ISSUE_KINDS[Math.floor(score(`${n.id}#issue${i}`) * ISSUE_KINDS.length)]!;
    return {
      id: `${n.id}-issue-${i}`,
      title: k[0],
      area: k[1],
      severity: k[2] as string,
      age: `${1 + Math.floor(score(`${n.id}#age${i}`) * 90)}d open`,
      owner: n.owners[i % n.owners.length] ?? n.owners[0]!,
    };
  });
}

const INCIDENT_TITLES = [
  "Elevated p99 latency after config rollout",
  "Partial outage — dependency timeout cascade",
  "Auth token rotation caused 401 spike",
  "Cache stampede on cold region",
  "Queue backlog after schema migration",
  "Region failover did not drain cleanly",
];

function incidentsOf(n: GraphNode) {
  const s = score(`${n.id}#inc`);
  const count = 2 + Math.floor(s * 3);
  const sev = ["SEV3", "SEV2", "SEV1"];
  return Array.from({ length: count }, (_, i) => {
    const r = score(`${n.id}#inc${i}`);
    return {
      id: `INC-${1000 + Math.floor(r * 8999)}`,
      title: INCIDENT_TITLES[Math.floor(r * INCIDENT_TITLES.length)]!,
      severity: sev[Math.floor(score(`${n.id}#sev${i}`) * sev.length)]!,
      when: `${1 + Math.floor(score(`${n.id}#when${i}`) * 11)}mo ago`,
      duration: `${8 + Math.floor(r * 180)}m`,
      impact: `${Math.max(1, Math.round(n.blast.services * (0.1 + r * 0.4)))} services`,
      trigger: ["Deploy", "Config change", "Traffic spike", "Dependency failure"][
        Math.floor(score(`${n.id}#trig${i}`) * 4)
      ]!,
      resolvedBy: n.owners[i % n.owners.length] ?? n.owners[0]!,
    };
  });
}

function forecastOf(n: GraphNode) {
  const incidents = incidentsOf(n);
  const s = score(`${n.id}#forecast`);
  const dominant = incidents[0]!.trigger;
  const likelihood = Math.round(28 + s * 61);
  return {
    dominant,
    likelihood,
    window: `${2 + Math.floor(s * 8)} weeks`,
    predicted: {
      services: Math.max(1, Math.round(n.blast.services * (0.3 + s * 0.5))),
      modules: Math.max(1, Math.round(n.blast.modules * (0.25 + s * 0.4))),
      files: Math.max(1, Math.round(n.blast.files * (0.2 + s * 0.35))),
      teams: n.blast.teams,
    },
    signals: [
      `${incidents.filter((i) => i.trigger === dominant).length} past incidents share trigger "${dominant}"`,
      `${n.dependents.length} downstream consumers amplify failures`,
      `Risk level currently ${riskOf(n)} with health ${healthOf(n)}`,
    ],
  };
}


export function NodeDossier({
  node,
  open,
  onClose,
  onOpenNode,
  role,
}: {
  node: GraphNode | null;
  open: boolean;
  onClose: () => void;
  onOpenNode: (n: GraphNode) => void;
  role: RoleDef;
}) {
  const [stack, setStack] = useState<GraphNode[]>([]);
  const [section, setSection] = useState<SectionId>("overview");
  const [query, setQuery] = useState("");

  const active = stack.length ? stack[stack.length - 1]! : node;

  const reset = () => {
    setStack([]);
    setSection("overview");
    setQuery("");
  };

  const drill = (n: GraphNode) => {
    setStack((s) => [...s, n]);
    setSection("overview");
    setQuery("");
  };

  const sections = useMemo(() => {
    if (!active) return [] as { id: SectionId; label: string; count: number }[];
    const out: { id: SectionId; label: string; count: number }[] = [
      { id: "overview", label: "Overview", count: 0 },
    ];
    for (const s of KIND_SECTIONS) {
      const rows = descendantsOfKind(active, s.kind);
      if (rows.length) out.push({ id: s.id, label: SECTION_LABEL[s.kind], count: rows.length });
    }
    const cls = classesOf(active);
    const fns = functionsOf(active);
    if (cls.length) out.push({ id: "classes", label: "Classes", count: cls.length });
    if (fns.length) out.push({ id: "functions", label: "Functions", count: fns.length });
    out.push({ id: "lines", label: "Lines", count: linesOf(active).total });
    out.push({ id: "issues", label: "Issues", count: issuesOf(active).length });
    if (role.can.viewIncidents)
      out.push({ id: "incidents", label: "Incidents", count: incidentsOf(active).length });
    if (active.detail) {
      out.push({ id: "tests", label: "Tests", count: active.detail.tests.length });
      out.push({ id: "history", label: "History", count: active.detail.history.length });
    }
    out.push({
      id: "dependencies",
      label: "Dependencies",
      count: active.dependencies.length + active.dependents.length,
    });
    out.push({ id: "owners", label: "Owners", count: active.owners.length });
    out.push({ id: "ask", label: "Ask AI", count: 0 });

    return out;
  }, [active, role]);

  if (!node || !active) return null;

  const kindSection = KIND_SECTIONS.find((s) => s.id === section);
  const rows = kindSection ? descendantsOfKind(active, kindSection.kind) : [];
  const filtered = query
    ? rows.filter((r) => r.node.label.toLowerCase().includes(query.toLowerCase()))
    : rows;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          reset();
          onClose();
        }
      }}
    >
      <DialogContent className="bg-card border-border h-[88vh] max-w-[min(1180px,95vw)] gap-0 overflow-hidden p-0 sm:max-w-[min(1180px,95vw)]">
        <div className="flex h-full min-h-0">
          {/* sidebar */}
          <aside className="border-border bg-surface hidden w-56 shrink-0 flex-col border-r md:flex">
            <div className="border-border border-b px-4 py-4">
              <div className="text-primary text-[10px] tracking-[0.28em] uppercase">Nykst</div>
              <div className="mt-1 truncate text-sm font-semibold">{active.label}</div>
              <div className="text-muted-foreground text-[11px]">{kindLabel[active.kind]}</div>
            </div>
            <nav className="flex-1 space-y-0.5 overflow-y-auto p-2">
              {sections.map((s) => (
                <button
                  key={s.id}
                  onClick={() => {
                    setSection(s.id);
                    setQuery("");
                  }}
                  className={cn(
                    "flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-[13px] transition-colors",
                    section === s.id
                      ? "bg-surface-2 text-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <span className="flex items-center gap-2">
                    {s.id === "ask" && <Sparkles className="size-3.5" />}
                    {s.label}
                  </span>
                  {s.count > 0 && (
                    <span className="text-muted-foreground text-[10px]">{s.count}</span>
                  )}
                </button>
              ))}
            </nav>
          </aside>

          {/* main */}
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <header className="border-border border-b px-6 py-4">
              <div className="text-muted-foreground flex flex-wrap items-center gap-1 text-[11px]">
                <button
                  onClick={reset}
                  className={cn("hover:text-foreground", !stack.length && "text-foreground")}
                >
                  {node.label}
                </button>
                {stack.map((s, i) => (
                  <span key={s.id} className="flex items-center gap-1">
                    <ChevronRight className="size-3" />
                    <button
                      onClick={() => setStack((prev) => prev.slice(0, i + 1))}
                      className={cn("hover:text-foreground", i === stack.length - 1 && "text-foreground")}
                    >
                      {s.label}
                    </button>
                  </span>
                ))}
              </div>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-xl font-semibold tracking-tight">{active.label}</h2>
                  <p className="text-muted-foreground mt-1 max-w-2xl text-sm leading-relaxed">
                    {active.summary}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      if (stack.length) {
                        setStack((s) => s.slice(0, -1));
                        setSection("overview");
                        setQuery("");
                      } else {
                        reset();
                        onClose();
                      }
                    }}
                    className="border-border hover:bg-surface flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs"
                  >
                    <CornerUpLeft className="size-3.5" />
                    {stack.length ? "Back" : "Back to graph"}
                  </button>
                  <button
                    onClick={() => {
                      reset();
                      onClose();
                      onOpenNode(active);
                    }}
                    className="bg-primary text-primary-foreground rounded-md px-3 py-1.5 text-xs font-medium"
                  >
                    Open in graph
                  </button>
                </div>

              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Pill label="Health" value={`${healthOf(active)}`} tone={healthTone(healthOf(active))} />
                <Pill label="Risk" value={riskOf(active)} tone={riskTone[riskOf(active)]} />
                <Pill label="Blast" value={active.blast.level} tone="var(--node-capability)" />
                <Pill label="Deps" value={`${active.dependencies.length}`} tone="var(--node-service)" />
              </div>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
              {section === "overview" && (
                <Overview node={active} onSection={setSection} sections={sections} />
              )}

              {kindSection && (
                <>
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <h3 className="text-sm font-medium">
                      {SECTION_LABEL[kindSection.kind]}{" "}
                      <span className="text-muted-foreground">({filtered.length})</span>
                    </h3>
                    <div className="border-border bg-surface flex items-center gap-2 rounded-md border px-2 py-1.5">
                      <Search className="text-muted-foreground size-3.5" />
                      <input
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Search…"
                        className="w-40 bg-transparent text-xs outline-none"
                      />
                    </div>
                  </div>
                  <EntityTable
                    rows={filtered}
                    parentLabel={kindLabel[active.kind]}
                    onDrill={drill}
                    onOpen={(n) => {
                      reset();
                      onClose();
                      onOpenNode(n);
                    }}
                  />
                </>
              )}

              {section === "classes" && <ClassesView node={active} />}
              {section === "functions" && <FunctionsView node={active} />}
              {section === "lines" && <LinesView node={active} />}
              {section === "issues" && <IssuesView node={active} role={role} />}
              {section === "incidents" &&
                (role.can.viewIncidents ? (
                  <IncidentsView node={active} />
                ) : (
                  <Restricted what="Incidents" role={role} />
                ))}

              {section === "tests" && <Block title="Tests" items={active.detail?.tests ?? []} />}
              {section === "history" && (
                <ul className="space-y-3">
                  {(active.detail?.history ?? []).map((h, i) => (
                    <li key={`${h.when}-${i}`} className="border-border border-l pl-3">
                      <div className="text-sm">{h.what}</div>
                      <div className="text-muted-foreground text-[11px]">
                        {h.who} · {h.when}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              {section === "dependencies" && <Dependencies node={active} />}
              {section === "owners" && <Block title="Owners" items={active.owners} />}
              {section === "ask" && <AskAI node={active} kids={childrenOf(active)} />}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function EntityTable({
  rows,
  parentLabel,
  onDrill,
  onOpen,
}: {
  rows: { node: GraphNode; parent: GraphNode }[];
  parentLabel: string;
  onDrill: (n: GraphNode) => void;
  onOpen: (n: GraphNode) => void;
}) {
  if (!rows.length) return <p className="text-muted-foreground text-sm">Nothing here yet.</p>;
  return (
    <div className="border-border overflow-hidden rounded-lg border">
      <table className="w-full text-left text-sm">
        <thead className="bg-surface text-muted-foreground text-[10px] tracking-[0.18em] uppercase">
          <tr>
            <th className="px-3 py-2.5 font-normal">Name</th>
            <th className="px-3 py-2.5 font-normal">{parentLabel} / Parent</th>
            <th className="px-3 py-2.5 font-normal">Health score</th>
            <th className="px-3 py-2.5 font-normal">Risk level</th>
            <th className="px-3 py-2.5 font-normal">Dependencies</th>
            <th className="px-3 py-2.5 font-normal"></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const h = healthOf(r.node);
            return (
              <tr
                key={r.node.id}
                onClick={() => onDrill(r.node)}
                className="border-border hover:bg-surface cursor-pointer border-t transition-colors"
              >
                <td className="text-primary px-3 py-2.5 font-medium">{r.node.label}</td>
                <td className="text-muted-foreground px-3 py-2.5">{r.parent.label}</td>
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <div className="bg-surface-2 h-1.5 w-20 overflow-hidden rounded-full">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${h}%`, background: healthTone(h) }}
                      />
                    </div>
                    <span className="text-xs">{h}</span>
                  </div>
                </td>
                <td className="px-3 py-2.5">
                  <Badge value={riskOf(r.node)} tone={riskTone[riskOf(r.node)]} />
                </td>
                <td className="text-muted-foreground px-3 py-2.5">{r.node.dependencies.length}</td>
                <td className="px-3 py-2.5 text-right">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpen(r.node);
                    }}
                    className="text-muted-foreground hover:text-foreground text-[11px]"
                  >
                    Graph →
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Pill({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <span className="border-border bg-surface flex items-center gap-2 rounded-full border px-3 py-1 text-[11px]">
      <span className="size-1.5 rounded-full" style={{ background: tone }} />
      <span className="text-muted-foreground tracking-wide uppercase">{label}</span>
      <span className="font-medium">{value}</span>
    </span>
  );
}

function Overview({
  node,
  onSection,
  sections,
}: {
  node: GraphNode;
  onSection: (s: SectionId) => void;
  sections: { id: SectionId; label: string; count: number }[];
}) {
  const b = node.blast;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Services" value={b.services} />
        <Stat label="Modules" value={b.modules} />
        <Stat label="Files" value={b.files} />
        <Stat label="Teams" value={b.teams} />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {sections
          .filter((s) => s.count > 0 && s.id !== "overview")
          .map((s) => (
            <button
              key={s.id}
              onClick={() => onSection(s.id)}
              className="border-border bg-surface hover:bg-surface-2 rounded-lg border px-3 py-3 text-left transition-colors"
            >
              <div className="text-sm font-medium">{s.count}</div>
              <div className="text-muted-foreground text-[10px] tracking-wide uppercase">
                {s.label}
              </div>
            </button>
          ))}
      </div>

      {node.metrics && (
        <div className="flex flex-wrap gap-6">
          {node.metrics.map((m) => (
            <div key={m.label}>
              <div className="text-sm font-medium">{m.value}</div>
              <div className="text-muted-foreground text-[10px] tracking-wide uppercase">
                {m.label}
              </div>
            </div>
          ))}
        </div>
      )}

      <Block title="Owners" items={node.owners} />

      {node.detail && (
        <div className="bg-surface border-border rounded-lg border px-3 py-2 font-mono text-[11px] break-all">
          {node.detail.path}
          <span className="text-muted-foreground ml-2">
            · {node.detail.language} · {node.detail.loc} LOC
          </span>
        </div>
      )}
    </div>
  );
}

function Badge({ value, tone }: { value: string; tone: string }) {
  return (
    <span
      className="border-border rounded-full border px-2 py-0.5 text-[11px]"
      style={{ color: tone }}
    >
      {value}
    </span>
  );
}

function Dependencies({ node }: { node: GraphNode }) {
  return (
    <div className="space-y-6">
      <Block title="Depends on" items={node.dependencies} mono />
      <Block title="Depended on by" items={node.dependents} mono />
      <p className="text-muted-foreground text-[11px] leading-relaxed">
        Changing {node.label} can propagate to {node.blast.services.toLocaleString()} services and{" "}
        {node.blast.files.toLocaleString()} files owned by {node.blast.teams} team
        {node.blast.teams > 1 ? "s" : ""}.
      </p>
    </div>
  );
}

const SUGGESTIONS = [
  "What does this own?",
  "What breaks if I change it?",
  "Who should review my PR?",
  "Where is the riskiest code?",
];

function answerFor(q: string, node: GraphNode, kids: GraphNode[]) {
  const names = kids.slice(0, 4).map((k) => k.label);
  if (q.includes("own"))
    return `${node.label} owns ${kids.length} ${childKindLabel[node.kind].toLowerCase()}${
      names.length ? `, including ${names.join(", ")}` : ""
    }. ${node.summary}`;
  if (q.includes("break") || q.includes("change"))
    return `Blast radius is ${node.blast.level.toLowerCase()}: ${node.blast.services} services, ${node.blast.modules} modules and ${node.blast.files} files across ${node.blast.teams} teams. Downstream consumers include ${
      node.dependents.slice(0, 3).join(", ") || "no tracked consumers"
    }.`;
  if (q.includes("review") || q.includes("who"))
    return `Route reviews to ${node.owners.join(" and ")}. They are the accountable owners for ${node.label}.`;
  if (q.includes("risk"))
    return `Highest-risk children: ${
      kids
        .filter((k) => riskOf(k) === "Critical" || riskOf(k) === "High")
        .slice(0, 3)
        .map((k) => `${k.label} (${riskOf(k)})`)
        .join(", ") || "none flagged above medium risk"
    }.`;
  return `${node.label} is a ${kindLabel[node.kind].toLowerCase()} with ${
    node.dependencies.length
  } upstream dependencies and ${node.dependents.length} downstream consumers. ${node.summary}`;
}

function AskAI({ node, kids }: { node: GraphNode; kids: GraphNode[] }) {
  const [q, setQ] = useState("");
  const [thread, setThread] = useState<{ q: string; a: string }[]>([]);

  const ask = (text: string) => {
    const query = text.trim();
    if (!query) return;
    setThread((t) => [...t, { q: query, a: answerFor(query.toLowerCase(), node, kids) }]);
    setQ("");
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            onClick={() => ask(s)}
            className="border-border bg-surface hover:bg-surface-2 rounded-full border px-3 py-1 text-[11px] transition-colors"
          >
            {s}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {thread.map((m, i) => (
          <div key={i} className="space-y-1">
            <div className="text-sm font-medium">{m.q}</div>
            <p className="text-muted-foreground border-border border-l pl-3 text-sm leading-relaxed">
              {m.a}
            </p>
          </div>
        ))}
        {!thread.length && (
          <p className="text-muted-foreground text-sm">
            Ask anything about {node.label} — ownership, dependencies, blast radius or risk.
          </p>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          ask(q);
        }}
        className="flex gap-2"
      >
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={`Ask about ${node.label}…`}
          className="border-border bg-surface focus:border-primary flex-1 rounded-lg border px-3 py-2 text-sm outline-none"
        />
        <button
          type="submit"
          className="bg-primary text-primary-foreground rounded-lg px-4 py-2 text-sm font-medium"
        >
          Ask
        </button>
      </form>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="border-border bg-surface rounded-lg border px-3 py-2">
      <div className="text-sm font-medium">{value.toLocaleString()}</div>
      <div className="text-muted-foreground text-[10px] tracking-wide uppercase">{label}</div>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-muted-foreground text-[10px] tracking-[0.24em] uppercase">{children}</h3>
  );
}

function Block({ title, items, mono }: { title: string; items: string[]; mono?: boolean }) {
  if (!items.length) return <p className="text-muted-foreground text-sm">Nothing here yet.</p>;
  return (
    <div>
      <Label>{title}</Label>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {items.map((i) => (
          <span
            key={i}
            className={cn(
              "bg-surface border-border rounded-md border px-2 py-1 text-[11px]",
              mono && "font-mono",
            )}
          >
            {i}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ---------------- new sections ---------------- */

function SimpleTable({ head, rows }: { head: string[]; rows: React.ReactNode[][] }) {
  if (!rows.length) return <p className="text-muted-foreground text-sm">Nothing here yet.</p>;
  return (
    <div className="border-border overflow-hidden rounded-lg border">
      <table className="w-full text-left text-sm">
        <thead className="bg-surface text-muted-foreground text-[10px] tracking-[0.18em] uppercase">
          <tr>
            {head.map((h) => (
              <th key={h} className="px-3 py-2.5 font-normal">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-border border-t">
              {r.map((c, j) => (
                <td key={j} className="px-3 py-2.5">
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ClassesView({ node }: { node: GraphNode }) {
  const rows = classesOf(node);
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium">
        Classes <span className="text-muted-foreground">({rows.length})</span>
      </h3>
      <SimpleTable
        head={["Class", "File", "Lines", "Methods"]}
        rows={rows.map((c) => [
          <span className="text-primary font-mono text-[12px]">{c.name}</span>,
          <span className="text-muted-foreground font-mono text-[11px]">{c.file}</span>,
          c.loc,
          c.methods,
        ])}
      />
    </div>
  );
}

function FunctionsView({ node }: { node: GraphNode }) {
  const rows = functionsOf(node);
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium">
        Functions <span className="text-muted-foreground">({rows.length})</span>
      </h3>
      <SimpleTable
        head={["Function", "File"]}
        rows={rows.map((f) => [
          <span className="font-mono text-[12px]">{f.name}</span>,
          <span className="text-muted-foreground font-mono text-[11px]">{f.file}</span>,
        ])}
      />
    </div>
  );
}

function LinesView({ node }: { node: GraphNode }) {
  const l = linesOf(node);
  const bar = [
    { label: "Code", value: l.code, tone: "var(--node-file)" },
    { label: "Comments", value: l.comments, tone: "var(--node-module)" },
    { label: "Blank", value: l.blank, tone: "var(--node-service)" },
  ];
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Total lines" value={l.total} />
        <Stat label="Code" value={l.code} />
        <Stat label="Comments" value={l.comments} />
        <Stat label="Files" value={l.files} />
      </div>
      <div>
        <Label>Composition</Label>
        <div className="bg-surface-2 mt-2 flex h-2 overflow-hidden rounded-full">
          {bar.map((b) => (
            <div
              key={b.label}
              style={{ width: `${(b.value / Math.max(1, l.total)) * 100}%`, background: b.tone }}
            />
          ))}
        </div>
        <div className="text-muted-foreground mt-2 flex flex-wrap gap-4 text-[11px]">
          {bar.map((b) => (
            <span key={b.label} className="flex items-center gap-1.5">
              <span className="size-1.5 rounded-full" style={{ background: b.tone }} />
              {b.label} · {b.value.toLocaleString()}
            </span>
          ))}
        </div>
      </div>
      <Block title="Languages" items={l.languages} />
    </div>
  );
}

const SEV_TONE: Record<string, string> = {
  Low: "var(--node-file)",
  Medium: "var(--node-module)",
  High: "var(--node-capability)",
  Critical: "var(--primary)",
  SEV3: "var(--node-module)",
  SEV2: "var(--node-capability)",
  SEV1: "var(--primary)",
};

function IssuesView({ node }: { node: GraphNode }) {
  const rows = issuesOf(node);
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium">
        Open issues <span className="text-muted-foreground">({rows.length})</span>
      </h3>
      <SimpleTable
        head={["Issue", "Area", "Severity", "Age", "Owner"]}
        rows={rows.map((i) => [
          i.title,
          <span className="text-muted-foreground">{i.area}</span>,
          <Badge value={i.severity} tone={SEV_TONE[i.severity] ?? "var(--node-module)"} />,
          <span className="text-muted-foreground text-[11px]">{i.age}</span>,
          <span className="text-muted-foreground font-mono text-[11px]">{i.owner}</span>,
        ])}
      />
    </div>
  );
}

function IncidentsView({ node }: { node: GraphNode }) {
  const rows = incidentsOf(node);
  const f = forecastOf(node);
  return (
    <div className="space-y-7">
      <div className="space-y-3">
        <h3 className="text-sm font-medium">
          Past incidents <span className="text-muted-foreground">({rows.length})</span>
        </h3>
        <SimpleTable
          head={["ID", "Incident", "Severity", "When", "Duration", "Impact", "Trigger", "Resolved by"]}
          rows={rows.map((i) => [
            <span className="font-mono text-[11px]">{i.id}</span>,
            i.title,
            <Badge value={i.severity} tone={SEV_TONE[i.severity] ?? "var(--node-module)"} />,
            <span className="text-muted-foreground text-[11px]">{i.when}</span>,
            <span className="text-muted-foreground text-[11px]">{i.duration}</span>,
            <span className="text-muted-foreground text-[11px]">{i.impact}</span>,
            <span className="text-muted-foreground text-[11px]">{i.trigger}</span>,
            <span className="text-muted-foreground font-mono text-[11px]">{i.resolvedBy}</span>,
          ])}
        />
      </div>

      <div className="border-border bg-surface rounded-lg border p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <Label>Predicted blast radius — pattern match</Label>
            <p className="text-muted-foreground mt-1 text-sm">
              Recurring trigger “{f.dominant}” on {node.label}. {f.likelihood}% likelihood of a
              similar incident within the next {f.window}.
            </p>
          </div>
          <Badge
            value={`${f.likelihood}% risk`}
            tone={f.likelihood > 70 ? "var(--primary)" : "var(--node-capability)"}
          />
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Services at risk" value={f.predicted.services} />
          <Stat label="Modules" value={f.predicted.modules} />
          <Stat label="Files" value={f.predicted.files} />
          <Stat label="Teams paged" value={f.predicted.teams} />
        </div>
        <ul className="mt-4 space-y-1.5">
          {f.signals.map((s) => (
            <li key={s} className="text-muted-foreground border-border border-l pl-3 text-[12px]">
              {s}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
