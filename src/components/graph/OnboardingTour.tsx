import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

const STEPS = [
  {
    title: "This graph is the navigator",
    body: "Your organization sits in the middle. Everything around it is a core domain derived from your code — not a folder tree.",
  },
  {
    title: "Click to go one level deeper",
    body: "Domain → capability → service → module → file. Each click re-centers the graph on what you clicked.",
  },
  {
    title: "The i badge opens the dossier",
    body: "Health, risk, blast radius, classes, functions, lines, issues and incidents for that exact node.",
  },
  {
    title: "Issues carry their own fix",
    body: "Open Issues in the dossier. Solved patterns are remembered — the next identical issue arrives pre-solved and only needs your approval.",
  },
  {
    title: "You only see what you may see",
    body: "Your role scopes the graph. Domains outside your access are hidden, and the header shows what is restricted.",
  },
];

const KEY = "nykst.tour.done";

export function OnboardingTour() {
  const [open, setOpen] = useState(false);
  const [i, setI] = useState(0);

  useEffect(() => {
    if (localStorage.getItem(KEY) !== "1") setOpen(true);
  }, []);

  const finish = () => {
    localStorage.setItem(KEY, "1");
    setOpen(false);
    setI(0);
  };

  if (!open) {
    return null;
  }

  const step = STEPS[i]!;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-6 backdrop-blur-sm sm:items-center">
      <div
        className="border-border bg-card w-full max-w-md rounded-2xl border p-6"
        style={{ boxShadow: "var(--shadow-panel)" }}
      >
        <div className="text-primary text-[10px] tracking-[0.28em] uppercase">
          Getting started · {i + 1} / {STEPS.length}
        </div>
        <h2 className="mt-3 text-lg font-semibold tracking-tight">{step.title}</h2>
        <p className="text-muted-foreground mt-2 text-sm leading-relaxed">{step.body}</p>

        <div className="mt-5 flex gap-1.5">
          {STEPS.map((s, n) => (
            <span
              key={s.title}
              className={cn(
                "h-1 flex-1 rounded-full transition-colors",
                n <= i ? "bg-primary" : "bg-surface-2",
              )}
            />
          ))}
        </div>

        <div className="mt-6 flex items-center justify-between gap-3">
          <button
            onClick={finish}
            className="text-muted-foreground hover:text-foreground text-xs transition-colors"
          >
            Skip
          </button>
          <div className="flex gap-2">
            {i > 0 && (
              <button
                onClick={() => setI(i - 1)}
                className="border-border bg-surface hover:bg-surface-2 rounded-lg border px-3 py-1.5 text-xs transition-colors"
              >
                Back
              </button>
            )}
            <button
              onClick={() => (i === STEPS.length - 1 ? finish() : setI(i + 1))}
              className="bg-primary text-primary-foreground hover:bg-primary-glow rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-colors"
            >
              {i === STEPS.length - 1 ? "Start navigating" : "Next"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
