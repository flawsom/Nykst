import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

const STAGES = [
  "Authorizing installation",
  "Enumerating repositories",
  "Parsing source & build graphs",
  "Inferring core domains",
  "Mapping dependencies & blast radius",
  "Applying your access scope",
];

export function ConnectionProgress({
  provider,
  org,
  onDone,
}: {
  provider: string;
  org: string;
  onDone: () => void;
}) {
  const [stage, setStage] = useState(0);

  useEffect(() => {
    if (stage >= STAGES.length) {
      const t = setTimeout(onDone, 500);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setStage((s) => s + 1), 520 + stage * 120);
    return () => clearTimeout(t);
  }, [stage, onDone]);

  const pct = Math.round((Math.min(stage, STAGES.length) / STAGES.length) * 100);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6 backdrop-blur-sm">
      <div
        className="border-border bg-card w-full max-w-md rounded-2xl border p-6"
        style={{ boxShadow: "var(--shadow-panel)" }}
      >
        <div className="text-primary text-[10px] tracking-[0.28em] uppercase">
          Connecting {provider}
        </div>
        <h2 className="mt-2 text-lg font-semibold tracking-tight">Analyzing {org}</h2>
        <p className="text-muted-foreground mt-1 text-xs">
          Read-only. Nykst derives the graph from the codebase itself.
        </p>

        <div className="bg-surface-2 mt-5 h-1.5 overflow-hidden rounded-full">
          <div
            className="bg-primary h-full transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="text-muted-foreground mt-1.5 text-right text-[11px]">{pct}%</div>

        <ul className="mt-4 space-y-2">
          {STAGES.map((s, i) => (
            <li key={s} className="flex items-center gap-2.5 text-sm">
              <span
                className={cn(
                  "size-1.5 shrink-0 rounded-full transition-colors",
                  i < stage ? "bg-primary" : i === stage ? "bg-primary animate-pulse" : "bg-border",
                )}
              />
              <span className={i <= stage ? "text-foreground" : "text-muted-foreground"}>{s}</span>
              {i < stage && <span className="text-muted-foreground ml-auto text-[11px]">done</span>}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
