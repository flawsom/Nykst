import { useMemo, useState } from "react";
import type { GraphNode } from "@/lib/graph-data";
import { runVirtualCheck, type CodeFinding } from "@/lib/virtual-code";
import { cn } from "@/lib/utils";

const SAMPLE = `export async function handle(req: any) {
  const key = process.env.TOKEN;
  while (true) {
    const res = await send(req);
    console.log(res);
  }
}`;

/**
 * Write code against the organization before writing it into the organization.
 * Nykst checks it against the graph structure and only then "injects" it.
 */
export function VirtualCodeLab({ node }: { node: GraphNode }) {
  const [code, setCode] = useState(SAMPLE);
  const [run, setRun] = useState<ReturnType<typeof runVirtualCheck> | null>(null);
  const [injected, setInjected] = useState(false);
  const context = useMemo(() => runVirtualCheck("", node).context, [node]);

  const check = (source = code) => {
    setRun(runVirtualCheck(source, node));
    setInjected(false);
  };

  const applyFix = (f: CodeFinding) => {
    const next = f.apply(code);
    setCode(next);
    check(next);
  };

  const applyAll = () => {
    let next = code;
    for (const f of run?.findings ?? []) next = f.apply(next);
    setCode(next);
    check(next);
  };

  return (
    <div className="space-y-3">
      <p className="text-muted-foreground text-[11px] leading-relaxed">
        Write the change here first. Nykst runs it against the structure of{" "}
        <span className="text-foreground">{context.scope}</span> — if it fits, it injects; if not,
        you get the exact structural error and a virtual fix.
      </p>

      <div className="border-border bg-surface space-y-1 rounded-lg border px-3 py-2 text-[10px]">
        <div className="text-muted-foreground tracking-[0.24em] uppercase">Structure in scope</div>
        <div>Allowed edges: {context.allowedModules.join(", ") || "none declared"}</div>
        <div className="text-muted-foreground truncate">
          Files: {context.knownFiles.slice(0, 3).join(", ") || "—"}
        </div>
        <div className="text-muted-foreground">
          Owners: {context.owners.join(", ")} · Blast {context.blast}
        </div>
      </div>

      <textarea
        value={code}
        onChange={(e) => setCode(e.target.value)}
        spellCheck={false}
        rows={12}
        className="border-border bg-surface-2 w-full resize-y rounded-lg border p-3 font-mono text-[11px] leading-relaxed outline-none"
      />

      <div className="flex gap-2">
        <button
          onClick={() => check()}
          className="bg-primary text-primary-foreground rounded-lg px-3 py-1.5 text-[12px] font-medium"
        >
          Run virtual check
        </button>
        {run && run.findings.length > 0 && (
          <button
            onClick={applyAll}
            className="border-border bg-surface hover:bg-surface-2 rounded-lg border px-3 py-1.5 text-[12px] transition-colors"
          >
            Apply all virtual fixes
          </button>
        )}
      </div>

      {run && (
        <div className="space-y-2">
          <div
            className={cn(
              "rounded-lg border px-3 py-2 text-[12px]",
              run.fits ? "border-border bg-surface" : "border-primary/40 bg-primary/5",
            )}
          >
            {run.fits
              ? `Fits the structure of ${context.scope}. Safe to inject.`
              : `${run.findings.filter((f) => f.severity === "error").length} structural error(s) — injection blocked.`}
          </div>

          <ul className="space-y-2">
            {run.findings.map((f) => (
              <li key={f.id} className="border-border bg-surface rounded-lg border px-3 py-2.5">
                <div className="flex items-start gap-2">
                  <span
                    className="mt-1.5 size-1.5 shrink-0 rounded-full"
                    style={{
                      background: f.severity === "error" ? "var(--primary)" : "var(--node-module)",
                    }}
                  />
                  <div className="min-w-0">
                    <div className="text-[12px] font-medium">
                      Line {f.line} · {f.title}
                    </div>
                    <p className="text-muted-foreground mt-1 text-[11px] leading-relaxed">{f.why}</p>
                    <p className="mt-1 text-[11px]">Virtual fix: {f.fix}</p>
                    <button
                      onClick={() => applyFix(f)}
                      className="border-border bg-surface-2 hover:bg-secondary mt-2 rounded-md border px-2.5 py-1 text-[11px] transition-colors"
                    >
                      Apply virtual fix
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>

          {run.fits && (
            <button
              onClick={() => setInjected(true)}
              disabled={injected}
              className="bg-primary text-primary-foreground w-full rounded-lg px-3 py-2 text-[12px] font-medium disabled:opacity-60"
            >
              {injected
                ? `Injected into ${context.scope} · graph updated`
                : `Inject into ${context.scope}`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
