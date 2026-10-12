import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

const STAGES = [
  {
    label: "Repository metadata",
    detail: "Identity, visibility, default branch",
  },
  {
    label: "File tree & source files",
    detail: "Understanding structure and code",
  },
  {
    label: "Directories & languages",
    detail: "Identifying modules and technology",
  },
  {
    label: "Imports & dependencies",
    detail: "Building relationships between components",
  },
  {
    label: "Commits & change history",
    detail: "Reading evolution and changed files",
  },
  {
    label: "Branches, pull requests & issues",
    detail: "Recovering collaboration context",
  },
];

export function ConnectionProgress({
  provider,
  org,
  complete = false,
  onDone,
}: {
  provider: string;
  org: string;
  complete?: boolean;
  onDone: () => void;
}) {
  const [stage, setStage] = useState(0);

  useEffect(() => {
    if (complete) {
      setStage(STAGES.length);
      const timer = window.setTimeout(onDone, 700);
      return () => window.clearTimeout(timer);
    }

    if (stage >= STAGES.length) return;
    const timer = window.setTimeout(() => setStage((current) => current + 1), 850);
    return () => window.clearTimeout(timer);
  }, [complete, onDone, stage]);

  const visibleStage = Math.min(stage, STAGES.length);
  const pct = Math.round((visibleStage / STAGES.length) * 100);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-6 backdrop-blur-md">
      <div
        className="border-border bg-card w-full max-w-lg rounded-2xl border p-6 sm:p-7"
        style={{ boxShadow: "var(--shadow-panel)" }}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-primary text-[10px] font-semibold tracking-[0.3em] uppercase">
              {complete ? "System map ready" : "Repository connected"}
            </p>
            <h2 className="mt-2 text-xl font-semibold tracking-tight">NYKST IS MAPPING YOUR SYSTEM</h2>
            <p className="text-muted-foreground mt-2 max-w-sm text-xs leading-relaxed">
              {complete
                ? "The evidence is indexed. Your software map is ready to explore."
                : `Reading ${org} through a read-only ${provider} connection. No configuration required.`}
            </p>
          </div>
          <span className="glow-ring bg-primary mt-1 block size-2.5 shrink-0 rounded-full" />
        </div>

        <div className="mt-6 flex items-center justify-between text-[10px] font-mono tracking-[0.18em] uppercase">
          <span className="text-muted-foreground">Ingest first · analyze later</span>
          <span className="text-primary">{pct}%</span>
        </div>
        <div className="bg-surface-2 mt-2 h-1.5 overflow-hidden rounded-full">
          <div
            className="bg-primary h-full rounded-full transition-all duration-700"
            style={{ width: `${pct}%` }}
          />
        </div>

        <ol className="mt-6 space-y-3">
          {STAGES.map((item, index) => {
            const finished = index < visibleStage;
            const active = index === visibleStage && !complete;
            return (
              <li key={item.label} className="flex items-start gap-3">
                <span
                  className={cn(
                    "mt-1 flex size-4 shrink-0 items-center justify-center rounded-full border text-[9px] font-bold",
                    finished && "border-primary bg-primary text-primary-foreground",
                    active && "border-primary text-primary animate-pulse",
                    !finished && !active && "border-border text-muted-foreground",
                  )}
                >
                  {finished ? "✓" : index + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span
                    className={cn(
                      "block text-sm transition-colors",
                      finished || active ? "text-foreground" : "text-muted-foreground",
                    )}
                  >
                    {item.label}
                  </span>
                  <span className="text-muted-foreground mt-0.5 block text-[11px]">{item.detail}</span>
                </span>
                {finished && <span className="text-primary pt-0.5 text-[10px] font-mono">indexed</span>}
                {active && <span className="text-primary pt-0.5 text-[10px] font-mono">reading…</span>}
              </li>
            );
          })}
        </ol>

        <div className="border-border mt-6 border-t pt-4">
          <p className="text-muted-foreground text-[11px] leading-relaxed">
            Nykst is ingesting repository evidence before applying intelligence. AI analysis comes after the system relationships are normalized.
          </p>
        </div>
      </div>
    </div>
  );
}
