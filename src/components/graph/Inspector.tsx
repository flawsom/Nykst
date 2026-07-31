import { kindLabel, type GraphNode } from "@/lib/graph-data";

const levelTone: Record<string, string> = {
  Low: "var(--node-file)",
  Moderate: "var(--node-module)",
  High: "var(--node-capability)",
  Critical: "var(--primary)",
};

export function Inspector({
  node,
  children,
  onClose,
  onOpen,
}: {
  node: GraphNode;
  children: GraphNode[];
  onClose: () => void;
  onOpen: (n: GraphNode) => void;
}) {
  const d = node.detail;
  const b = node.blast;

  return (
    <aside className="border-border bg-card/60 hidden w-[340px] shrink-0 overflow-y-auto border-l backdrop-blur lg:block">
      <div className="border-border flex items-start justify-between gap-3 border-b px-5 py-4">
        <div className="min-w-0">
          <span className="text-primary text-[10px] tracking-[0.28em] uppercase">
            {kindLabel[node.kind]}
          </span>
          <h2 className="mt-1 truncate text-base font-semibold">{node.label}</h2>
        </div>
        <button
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground text-xs transition-colors"
        >
          Close
        </button>
      </div>

      <div className="space-y-6 px-5 py-5">
        <p className="text-muted-foreground text-sm leading-relaxed">{node.summary}</p>

        <div>
          <Heading>Blast radius</Heading>
          <div className="border-border bg-surface mt-2 rounded-lg border p-3">
            <div className="flex items-center gap-2">
              <span
                className="size-2 rounded-full"
                style={{ background: levelTone[b.level] ?? "var(--primary)" }}
              />
              <span className="text-sm font-medium">{b.level} impact</span>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
              <Stat label="Services" value={b.services} />
              <Stat label="Modules" value={b.modules} />
              <Stat label="Files" value={b.files} />
              <Stat label="Teams" value={b.teams} />
            </div>
            <p className="text-muted-foreground mt-3 text-[11px] leading-relaxed">
              Changing {node.label} can propagate to {b.services.toLocaleString()} services owned by{" "}
              {b.teams} team{b.teams > 1 ? "s" : ""}.
            </p>
          </div>
        </div>

        <Section title="Depends on" items={node.dependencies} mono />
        <Section title="Depended on by" items={node.dependents} mono />
        <Section title="Owners" items={node.owners} />

        {d && (
          <>
            <div className="bg-surface border-border rounded-lg border px-3 py-2 font-mono text-[11px] break-all">
              {d.path}
              <span className="text-muted-foreground ml-2">
                · {d.language} · {d.loc} LOC
              </span>
            </div>
            <Section title="Classes" items={d.classes} mono />
            <Section title="Functions" items={d.functions} mono />
            <Section title="Tests" items={d.tests} />
            <div>
              <Heading>History</Heading>
              <ul className="mt-2 space-y-2">
                {d.history.map((h, i) => (
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

        {children.length > 0 && (
          <div>
            <Heading>Connected · {children.length}</Heading>
            <ul className="mt-2 space-y-1">
              {children.map((c) => (
                <li key={c.id}>
                  <button
                    onClick={() => onOpen(c)}
                    className="text-muted-foreground hover:text-foreground hover:bg-surface w-full truncate rounded-md px-2 py-1 text-left text-sm transition-colors"
                  >
                    {c.label}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </aside>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="border-border rounded-md border px-2 py-1.5">
      <div className="text-sm font-medium">{value.toLocaleString()}</div>
      <div className="text-muted-foreground text-[10px] tracking-wide uppercase">{label}</div>
    </div>
  );
}

function Heading({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-muted-foreground text-[10px] tracking-[0.24em] uppercase">{children}</h3>
  );
}

function Section({ title, items, mono }: { title: string; items: string[]; mono?: boolean }) {
  if (!items.length) return null;
  return (
    <div>
      <Heading>{title}</Heading>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {items.map((i) => (
          <span
            key={i}
            className={`bg-surface border-border rounded-md border px-2 py-1 text-[11px] ${
              mono ? "font-mono" : ""
            }`}
          >
            {i}
          </span>
        ))}
      </div>
    </div>
  );
}
