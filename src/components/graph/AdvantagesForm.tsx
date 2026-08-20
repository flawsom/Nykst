import { useState, useMemo } from "react";
import { cn } from "@/lib/utils";
import { ArrowLeft, ArrowRight, Check, Loader2, X, Sparkles } from "lucide-react";

const Q1_OPTIONS = [
  "Zero folder browsing — instant graph navigation",
  "Automated multi-repo dependency mapping",
  "Predictive blast radius calculation before merge",
  "Permanent institutional memory vault",
];

const Q2_OPTIONS = [
  "Eliminating cascading microservice outages",
  "Onboarding engineers in days instead of months",
  "Eliminating architectural drift & stale docs",
  "Writing code aligned with company ADRs",
];

const Q3_OPTIONS = [
  "Immediate ROI across our engineering team",
  "Significant reduction in code review friction",
  "Complete clarity on legacy codebases",
  "Fearless refactoring via simulations",
];

const Q4_OPTIONS = [
  "Yes, our team struggles with codebase visibility daily",
  "Yes, we need better AI code generation aligned to our stack",
  "We are currently evaluating similar developer intelligence tools",
  "Just exploring the future of software engineering",
];

const Q5_OPTIONS = [
  "Within the next month",
  "This quarter",
  "Next 6 months",
  "Just researching for now",
];

interface Answers {
  q1: string;
  q2: string;
  q3: string;
  q4: string;
  q5: string;
}

const EMPTY: Answers = {
  q1: "",
  q2: "",
  q3: "",
  q4: "",
  q5: "",
};

const QUESTIONS = [
  { title: "Which Nykst capability delivers the highest immediate value to your daily workflow?", options: Q1_OPTIONS },
  { title: "What is your primary engineering bottleneck Nykst solves first?", options: Q2_OPTIONS },
  { title: "How would measurable engineering clarity impact your delivery velocity?", options: Q3_OPTIONS },
  { title: "Does your organization actively experience multi-repo visibility challenges?", options: Q4_OPTIONS },
  { title: "When would your team be positioned to integrate software intelligence?", options: Q5_OPTIONS },
];

export function AdvantagesForm({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState(0);
  const [a, setA] = useState<Answers>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  const last = QUESTIONS.length - 1;

  const canAdvance = useMemo(() => {
    switch (step) {
      case 0: return !!a.q1;
      case 1: return !!a.q2;
      case 2: return !!a.q3;
      case 3: return !!a.q4;
      case 4: return !!a.q5;
      default: return true;
    }
  }, [step, a]);

  const setAnswer = (val: string) => {
    const key = `q${step + 1}` as keyof Answers;
    setA((prev) => ({ ...prev, [key]: val }));
  };

  const submit = () => {
    setSaving(true);
    setTimeout(() => {
      try {
        const existing = JSON.parse(localStorage.getItem("nykst.advantages") || "[]");
        existing.push({ ...a, created_at: new Date().toISOString() });
        localStorage.setItem("nykst.advantages", JSON.stringify(existing));
      } catch (e) {}
      setSaving(false);
      setDone(true);
    }, 400);
  };

  const currentQ = QUESTIONS[step]!;
  const currentVal = a[`q${step + 1}` as keyof Answers];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-xl">
      <div className="bg-background/85 absolute inset-0" onClick={onClose} />
      <div
        className="animate-rise border-border bg-card/95 relative w-full max-w-2xl rounded-2xl border p-8 shadow-2xl"
      >
        <button
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground absolute top-6 right-6 transition-colors"
        >
          <X className="size-5" />
        </button>

        {done ? (
          <div className="py-12 text-center space-y-4">
            <div className="bg-primary/25 text-primary mx-auto flex size-14 items-center justify-center rounded-full border border-primary/40">
              <Sparkles className="size-7" />
            </div>
            <h2 className="text-2xl font-semibold tracking-tight text-foreground">Thank you for exploring Nykst Advantages</h2>
            <p className="text-muted-foreground mx-auto max-w-md text-sm leading-relaxed">
              Your responses have been recorded. We've tailored your organization's intelligence profile based on your focus areas.
            </p>
            <button
              onClick={onClose}
              className="bg-primary text-primary-foreground hover:bg-primary-glow mt-4 rounded-xl px-6 py-2.5 text-sm font-semibold transition-colors shadow-md"
            >
              Back to Nykst
            </button>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="flex items-center justify-between border-b border-border pb-4">
              <span className="text-muted-foreground font-mono text-xs uppercase tracking-wider flex items-center gap-1.5">
                <Sparkles className="size-3.5 text-primary" /> Advantages Survey · Step {step + 1} of {QUESTIONS.length}
              </span>
              <div className="flex gap-1">
                {QUESTIONS.map((_, i) => (
                  <div
                    key={i}
                    className={cn(
                      "h-1.5 w-8 rounded-full transition-all",
                      i <= step ? "bg-primary" : "bg-border"
                    )}
                  />
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <h2 className="text-xl font-semibold tracking-tight text-foreground">
                {currentQ.title}
              </h2>
            </div>

            <div className="py-2 min-h-[220px] space-y-2.5">
              {currentQ.options.map((opt) => {
                const selected = currentVal === opt;
                return (
                  <button
                    key={opt}
                    onClick={() => setAnswer(opt)}
                    className={cn(
                      "w-full rounded-xl border p-4 text-left text-xs font-medium transition-all flex items-center justify-between",
                      selected
                        ? "bg-primary/20 border-primary text-foreground font-semibold"
                        : "border-border bg-surface text-muted-foreground hover:text-foreground hover:bg-surface-2"
                    )}
                  >
                    <span>{opt}</span>
                    {selected && <Check className="size-4 text-primary shrink-0" />}
                  </button>
                );
              })}
            </div>

            <div className="flex items-center justify-between border-t border-border pt-4">
              {step > 0 ? (
                <button
                  onClick={() => setStep((s) => s - 1)}
                  className="border-border bg-surface hover:bg-surface-2 text-muted-foreground hover:text-foreground flex items-center gap-1.5 rounded-xl border px-4 py-2.5 text-xs font-medium transition-colors"
                >
                  <ArrowLeft className="size-3.5" /> Back
                </button>
              ) : <div />}

              {step < last ? (
                <button
                  disabled={!canAdvance}
                  onClick={() => setStep((s) => s + 1)}
                  className={cn(
                    "flex items-center gap-1.5 rounded-xl px-5 py-2.5 text-xs font-semibold transition-all",
                    canAdvance
                      ? "bg-primary text-primary-foreground hover:bg-primary-glow shadow-sm"
                      : "bg-surface text-muted-foreground opacity-50 cursor-not-allowed border border-border"
                  )}
                >
                  Continue <ArrowRight className="size-3.5" />
                </button>
              ) : (
                <button
                  disabled={saving || !canAdvance}
                  onClick={submit}
                  className="bg-primary text-primary-foreground hover:bg-primary-glow flex items-center gap-2 rounded-xl px-6 py-2.5 text-xs font-semibold shadow-md transition-colors"
                >
                  {saving && <Loader2 className="size-3.5 animate-spin" />}
                  Complete Advantages Survey
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
