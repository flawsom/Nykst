import { useMemo, useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { childKindLabel, childrenOf, kindLabel, type GraphNode } from "@/lib/graph-data";
import { cn } from "@/lib/utils";

/* deterministic scoring derived from the node identity */
function score(id: string) {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967296;
}

const HEALTH = ["Poor", "Fair", "Good", "Excellent"] as const;
const RISK = ["Low", "Medium", "High", "Critical"] as const;

function healthOf(n: GraphNode) {
  return HEALTH[Math.floor(score(`${n.id}#health`) * HEALTH.length)]!;
}
function riskOf(n: GraphNode) {
  return RISK[Math.floor(score(`${n.id}#risk`) * RISK.length)]!;
}

const healthTone: Record<string, string> = {
  Excellent: "var(--node-file)",
  Good: "var(--node-module)",
  Fair: "var(--node-capability)",
  Poor: "var(--primary)",
};
const riskTone: Record<string, string> = {
  Low: "var(--node-file)",
  Medium: "var(--node-module)",
  High: "var(--node-capability)",
  Critical: "var(--primary)",
};

type Tab = "overview" | "children" | "dependencies" | "ask";

export function NodeDossier({
  node,
  open,
  onClose,
  onOpenNode,
}: {
  node: GraphNode | null;
  open: boolean;
  onClose: () => void;
  onOpenNode: (n: GraphNode) => void;
}) {
  const [tab, setTab] = useState<Tab>("overview");
  const kids = useMemo(() => (node && node.expandable ? childrenOf(node) : []), [node]);

  if (!node) return null;

  const tabs: { id: Tab; label: string }[] = [
    { id: "overview", label: "Overview" },
    { id: "children", label: childKindLabel[node.kind] },
    { id: "dependencies", label: "Dependencies" },
    { id: "ask", label: "Ask AI" },
  ];

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          setTab("overview");
          onClose();
        }
      }}
    >
      <DialogContent className="bg-card border-border max-h-[86vh] gap-0 overflow-hidden p-0 sm:max-w-3xl">
        <header className="border-border border-b px-6 py-5">
          <span className="text-primary text-[10px] tracking-[0.28em] uppercase">
            {kindLabel[node.kind]}
          </span>
          <h2 className="mt-1 text-xl font-semibold tracking-tight">{node.label}</h2>
          <p className="text-muted-foreground mt-2 max-w-xl text-sm leading-relaxed">
            {node.summary}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Pill label="Health" value={healthOf(node)} tone={healthTone[healthOf(node)]!} />
            <Pill label="Risk" value={riskOf(node)} tone={riskTone[riskOf(node)]!} />
            <Pill label="Blast" value={node.blast.level} tone="var(--node-capability)" />
          </div>
        </header>

        <nav className="border-border flex gap-1 border-b px-4">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "-mb-px border-b px-3 py-2.5 text-xs tracking-wide transition-colors",
                tab === t.id
                  ? "border-primary text-foreground"
                  : "text-muted-foreground hover:text-foreground border-transparent",
              )}
            >
              {t.label}
            </button>
          ))}
        </nav>

        <div className="max-h-[52vh] overflow-y-auto px-6 py-5">
          {tab === "overview" && <Overview node={node} />}
          {tab === "children" && (
            <ChildTable
              rows={kids}
              parent={node}
              onOpenNode={(n) => {
                onClose();
                onOpenNode(n);
              }}
            />
          )}
          {tab === "dependencies" && <Dependencies node={node} />}
          {tab === "ask" && <AskAI node={node} kids={kids} />}
        </div>
      </DialogContent>
    </Dialog>
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

function Overview({ node }: { node: GraphNode }) {
  const b = node.blast;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Services" value={b.services} />
        <Stat label="Modules" value={b.modules} />
        <Stat label="Files" value={b.files} />
        <Stat label="Teams" value={b.teams} />
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
        <>
          <div className="bg-surface border-border rounded-lg border px-3 py-2 font-mono text-[11px] break-all">
            {node.detail.path}
            <span className="text-muted-foreground ml-2">
              · {node.detail.language} · {node.detail.loc} LOC
            </span>
          </div>
          <Block title="Classes" items={node.detail.classes} mono />
          <Block title="Functions" items={node.detail.functions} mono />
          <Block title="Tests" items={node.detail.tests} />
          <div>
            <Label>History</Label>
            <ul className="mt-2 space-y-2">
              {node.detail.history.map((h, i) => (
                <li key={`${h.when}-${i}`} className="border-border border-l pl-3">
                  <div className="text-sm">{h.what}</div>
                  <div className="text-muted-foreground text-[11px]">
                    {h.who} · {h.when}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}

function ChildTable({
  rows,
  parent,
  onOpenNode,
}: {
  rows: GraphNode[];
  parent: GraphNode;
  onOpenNode: (n: GraphNode) => void;
}) {
  if (!rows.length)
    return <p className="text-muted-foreground text-sm">This node is a terminal leaf.</p>;
  return (
    <div className="border-border overflow-hidden rounded-lg border">
      <table className="w-full text-left text-sm">
        <thead className="bg-surface text-muted-foreground text-[10px] tracking-[0.18em] uppercase">
          <tr>
            <th className="px-3 py-2 font-normal">Name</th>
            <th className="px-3 py-2 font-normal">Parent</th>
            <th className="px-3 py-2 font-normal">Health</th>
            <th className="px-3 py-2 font-normal">Risk</th>
            <th className="px-3 py-2 font-normal">Deps</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-border hover:bg-surface border-t transition-colors">
              <td className="px-3 py-2">
                <button
                  onClick={() => onOpenNode(r)}
                  className="text-primary text-left hover:underline"
                >
                  {r.label}
                </button>
              </td>
              <td className="text-muted-foreground px-3 py-2">{parent.label}</td>
              <td className="px-3 py-2">
                <Badge value={healthOf(r)} tone={healthTone[healthOf(r)]!} />
              </td>
              <td className="px-3 py-2">
                <Badge value={riskOf(r)} tone={riskTone[riskOf(r)]!} />
              </td>
              <td className="text-muted-foreground px-3 py-2">{r.dependencies.length}</td>
            </tr>
          ))}
        </tbody>
      </table>
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
  if (!items.length) return null;
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
