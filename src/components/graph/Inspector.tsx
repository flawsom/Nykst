import { kindLabel, type GraphNode } from "@/lib/graph-data";

export function Inspector({ node, onClose }: { node: GraphNode; onClose: () => void }) {
  const d = node.detail;

  return (
    <aside className="border-border bg-card/60 hidden w-[340px] shrink-0 overflow-y-auto border-l backdrop-blur lg:block">
      <div className="border-border flex items-start justify-between gap-3 border-b px-5 py-4">
        <div className="min-w-0">
          <span className="text-primary text-[10px] tracking-[0.28em] uppercase">
            {kindLabel[node.kind]}
          </span>
          <h2 className="mt-1 truncate text-base font-semibold">{node.label}</h2>
        </div>
        {d && (
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground text-xs transition-colors"
          >
            Close
          </button>
        )}
      </div>

      <div className="space-y-6 px-5 py-5">
        <p className="text-muted-foreground text-sm leading-relaxed">{node.summary}</p>

        {d && (
          <>
            <div className="bg-surface border-border rounded-lg border px-3 py-2 font-mono text-[11px]">
              {d.path}
              <span className="text-muted-foreground ml-2">
                · {d.language} · {d.loc} LOC
              </span>
            </div>
            <Section title="Classes" items={d.classes} mono />
            <Section title="Functions" items={d.functions} mono />
            <Section title="Dependencies" items={d.dependencies} mono />
            <Section title="Tests" items={d.tests} />
            <div>
              <Heading>History</Heading>
              <ul className="mt-2 space-y-2">
                {d.history.map((h) => (
                  <li key={h.when + h.what} className="border-border border-l pl-3">
                    <div className="text-sm">{h.what}</div>
                    <div className="text-muted-foreground text-[11px]">
                      {h.who} · {h.when}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
            <Section title="Owners" items={d.owners} />
          </>
        )}

        {!d && node.children?.length ? (
          <div>
            <Heading>Connected · {node.children.length}</Heading>
            <ul className="mt-2 space-y-1.5">
              {node.children.map((c) => (
                <li key={c.id} className="text-muted-foreground text-sm">
                  {c.label}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </aside>
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
