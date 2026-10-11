import { useEffect, useId, useState, useMemo } from "react";
import type { TablesInsert } from "@/integrations/supabase/types";
import { cn } from "@/lib/utils";
import { ArrowLeft, ArrowRight, Check, Loader2, X } from "lucide-react";
import { buttonClass } from "@/components/workspace/ui";

const ROLE_OPTIONS = [
  "Software engineer",
  "Senior engineer",
  "Staff engineer",
  "Engineering manager",
  "Head of engineering / VP",
  "CTO",
  "Founder",
  "CEO",
  "Product manager",
  "Other",
];

const SIZE_OPTIONS = [
  "1–10 people",
  "11–50 people",
  "51–200 people",
  "201–1,000 people",
  "1,000–5,000 people",
  "5,000+ people",
];

const TIME_OPTIONS = [
  "2 to 5 hours a week",
  "8 to 10 hours a week",
  "15 to 20 hours a week",
  "21 to 30 hours a week",
  "31+ hours a week",
];

const HARDEST_OPTIONS = [
  "Finding the right files",
  "Understanding dependencies",
  "Knowing who owns the code",
  "Fear of breaking something",
  "Legacy code",
  "Understanding architecture",
  "Reviewing AI-generated code",
  "Other",
];

const USE_OPTIONS = [
  "Yes, immediately",
  "Yes, if it fits our stack",
  "Maybe — I'd trial it first",
  "Probably not",
];

interface Answers {
  first_name: string;
  role: string;
  company_size: string;
  frustration: string;
  time_understanding_code: string;
  hardest_parts: string[];
  dream_feature: string;
  would_use: string;
  closing_thoughts: string;
  knowledge_location: string;
  hard_won_insight: string;
  email: string;
  linkedin: string;
  x_account: string;
}

const EMPTY: Answers = {
  first_name: "",
  role: "",
  company_size: "",
  frustration: "",
  time_understanding_code: "",
  hardest_parts: [],
  dream_feature: "",
  would_use: "",
  closing_thoughts: "",
  knowledge_location: "",
  hard_won_insight: "",
  email: "",
  linkedin: "",
  x_account: "",
};

const STEP_TITLES = [
  "Let's start with you",
  "What is your role in your organization?",
  "How large is your company?",
  "What is the most frustrating part of working in your codebase?",
  "How much time do you spend understanding existing code before writing new code?",
  "What is the hardest part when making a change?",
  "If you were building Nykst, what one feature would make you use it every single day?",
  "If Nykst saved you several hours a week, would you use it?",
  "When an AI changes your code, how do you know what else could break—and how do you currently verify the impact?",
  "When you solve a difficult problem, where does that knowledge live so the next engineer—or the AI—can use it?",
  "What hard-won lesson from your experience do smart people still misunderstand about your work, and what do they continue to get wrong?",
  "Where can we stay in touch? (Optional)",
];

export function PreRegisterForm({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState(0);
  const [a, setA] = useState<Answers>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const last = STEP_TITLES.length - 1;

  const canAdvance = useMemo(() => {
    switch (step) {
      case 0:
        return a.first_name.trim().length > 1;
      case 1:
        return !!a.role;
      case 2:
        return !!a.company_size;
      case 3:
        return a.frustration.trim().length > 3;
      case 4:
        return !!a.time_understanding_code;
      case 5:
        return a.hardest_parts.length > 0;
      case 6:
        return a.dream_feature.trim().length > 3;
      case 7:
        return !!a.would_use;
      case 8:
        return a.closing_thoughts.trim().length > 3;
      case 9:
        return a.knowledge_location.trim().length > 3;
      case 10:
        return a.hard_won_insight.trim().length > 3;
      case 11:
        return true;
      default:
        return true;
    }
  }, [step, a]);

  const set = <K extends keyof Answers>(k: K, v: Answers[K]) => setA((p) => ({ ...p, [k]: v }));

  const toggleHardest = (v: string) => {
    const has = a.hardest_parts.includes(v);
    if (has)
      set(
        "hardest_parts",
        a.hardest_parts.filter((x) => x !== v),
      );
    else if (a.hardest_parts.length < 3) set("hardest_parts", [...a.hardest_parts, v]);
  };

  const submit = async () => {
    setSaving(true);
    setError(null);
    try {
      const payload: TablesInsert<"pre_registration"> = {
        first_name: a.first_name.trim(),
        role: a.role,
        company_size: a.company_size,
        frustration: a.frustration.trim(),
        time_understanding_code: a.time_understanding_code,
        hardest_parts: a.hardest_parts,
        dream_feature: a.dream_feature.trim(),
        would_use: a.would_use,
        closing_thoughts: a.closing_thoughts.trim(),
        knowledge_location: a.knowledge_location.trim(),
        hard_won_insight: a.hard_won_insight.trim(),
        email: a.email.trim() || null,
        linkedin: a.linkedin.trim() || null,
        x_account: a.x_account.trim() || null,
      };

      try {
        const existing = JSON.parse(localStorage.getItem("nykst.preregistrations") || "[]");
        existing.push(payload);
        localStorage.setItem("nykst.preregistrations", JSON.stringify(existing));
      } catch (e) {
        console.error("Local storage backup error:", e);
      }

      const response = await fetch("/api/pre-registration", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not save your request.");

      setDone(true);
    } catch (e: unknown) {
      console.error("Pre-registration submission failed:", e);
      setError(
        e instanceof Error
          ? `We couldn't save your request: ${e.message}`
          : "We couldn't save your request. Please try again.",
      );
    } finally {
      setSaving(false);
    }
  };

  const titleId = useId();
  const [stepError, setStepError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const next = () => {
    if (!canAdvance) {
      setStepError(
        step === 0
          ? "Enter your first name (at least 2 characters) to continue."
          : step === 5
            ? "Choose at least one option to continue."
            : [1, 2, 4, 7].includes(step)
              ? "Choose an option to continue."
              : "Write a short answer (at least 4 characters) to continue.",
      );
      return;
    }
    setStepError(null);
    setStep((s) => s + 1);
  };

  const fieldClass =
    "border-input bg-surface text-foreground focus-visible:border-primary min-h-10 w-full rounded-lg border px-3 text-sm";
  const optionClass = (selected: boolean) =>
    cn(
      "flex min-h-10 w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors",
      selected
        ? "border-primary bg-surface-2 text-foreground font-semibold"
        : "border-border bg-surface text-muted-foreground hover:text-foreground hover:bg-surface-2",
    );

  const textStep = (
    key:
      | "frustration"
      | "dream_feature"
      | "closing_thoughts"
      | "knowledge_location"
      | "hard_won_insight",
    placeholder: string,
    rows = 4,
  ) => (
    <textarea
      rows={rows}
      aria-labelledby={titleId}
      aria-describedby={stepError ? `${titleId}-err` : undefined}
      aria-invalid={stepError ? true : undefined}
      placeholder={placeholder}
      value={a[key]}
      onChange={(e) => {
        set(key, e.target.value);
        setStepError(null);
      }}
      className={cn(fieldClass, "py-2.5 leading-relaxed")}
      autoFocus
    />
  );

  const choose = <K extends "role" | "company_size" | "time_understanding_code" | "would_use">(
    key: K,
    options: string[],
    columns: boolean,
  ) => (
    <div
      role="radiogroup"
      aria-labelledby={titleId}
      className={cn("gap-2", columns ? "grid grid-cols-1 sm:grid-cols-2" : "space-y-2")}
    >
      {options.map((o) => (
        <button
          key={o}
          type="button"
          role="radio"
          aria-checked={a[key] === o}
          onClick={() => {
            set(key, o);
            setStepError(null);
          }}
          className={optionClass(a[key] === o)}
        >
          <span>{o}</span>
          {a[key] === o && <Check className="text-primary size-4 shrink-0" aria-hidden />}
        </button>
      ))}
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="absolute inset-0" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={done ? `${titleId}-done` : titleId}
        className="border-border bg-card relative max-h-full w-full max-w-2xl overflow-y-auto rounded-xl border p-5 sm:p-8"
      >
        <button
          onClick={onClose}
          className={cn(buttonClass.ghost, "absolute top-3 right-3 w-10 px-0")}
          aria-label="Close"
        >
          <X className="size-5" aria-hidden />
        </button>

        {done ? (
          <div className="space-y-4 py-10 text-center">
            <div className="bg-ok-soft text-ok border-ok/30 mx-auto flex size-14 items-center justify-center rounded-full border">
              <Check className="size-7" aria-hidden />
            </div>
            <h2
              id={`${titleId}-done`}
              className="text-foreground text-2xl font-semibold tracking-tight"
            >
              You're on the early access list
            </h2>
            <p className="text-muted-foreground mx-auto max-w-md text-sm leading-relaxed">
              Thank you, <span className="text-foreground font-medium">{a.first_name}</span>. Your
              answers have been recorded.
            </p>
            <button onClick={onClose} className={cn(buttonClass.primary, "mt-2")}>
              Back to Nykst
            </button>
          </div>
        ) : (
          <div className="space-y-5">
            <div className="border-border flex items-center justify-between gap-3 border-b pr-10 pb-4">
              <span className="text-muted-foreground text-sm">
                Step {step + 1} of {STEP_TITLES.length}
              </span>
              <div
                className="flex gap-1"
                role="progressbar"
                aria-valuemin={1}
                aria-valuemax={STEP_TITLES.length}
                aria-valuenow={step + 1}
                aria-label="Form progress"
              >
                {STEP_TITLES.map((_, i) => (
                  <div
                    key={i}
                    className={cn(
                      "h-1.5 w-3 rounded-full sm:w-5",
                      i <= step ? "bg-primary" : "bg-border",
                    )}
                  />
                ))}
              </div>
            </div>

            <h2 id={titleId} className="text-foreground text-lg font-semibold tracking-tight">
              {STEP_TITLES[step]}
            </h2>

            <div className="min-h-[200px]">
              {step === 0 && (
                <div>
                  <label htmlFor={`${titleId}-name`} className="mb-1.5 block text-sm font-medium">
                    First name
                  </label>
                  <input
                    id={`${titleId}-name`}
                    type="text"
                    placeholder="Alex"
                    value={a.first_name}
                    onChange={(e) => {
                      set("first_name", e.target.value);
                      setStepError(null);
                    }}
                    aria-describedby={stepError ? `${titleId}-err` : undefined}
                    aria-invalid={stepError ? true : undefined}
                    className={fieldClass}
                    autoComplete="given-name"
                    autoFocus
                  />
                </div>
              )}

              {step === 1 && choose("role", ROLE_OPTIONS, true)}
              {step === 2 && choose("company_size", SIZE_OPTIONS, true)}
              {step === 3 &&
                textStep(
                  "frustration",
                  "e.g., Finding where business logic lives across 40 microservices without breaking APIs",
                )}
              {step === 4 && choose("time_understanding_code", TIME_OPTIONS, false)}

              {step === 5 && (
                <div>
                  <p className="text-muted-foreground mb-2 text-sm">Select up to 3.</p>
                  <div
                    role="group"
                    aria-labelledby={titleId}
                    className="grid grid-cols-1 gap-2 sm:grid-cols-2"
                  >
                    {HARDEST_OPTIONS.map((h) => {
                      const selected = a.hardest_parts.includes(h);
                      return (
                        <button
                          key={h}
                          type="button"
                          aria-pressed={selected}
                          onClick={() => {
                            toggleHardest(h);
                            setStepError(null);
                          }}
                          className={optionClass(selected)}
                        >
                          <span>{h}</span>
                          {selected && (
                            <Check className="text-primary size-4 shrink-0" aria-hidden />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {step === 6 &&
                textStep(
                  "dream_feature",
                  "e.g., Instant natural language codebase search with accurate file references",
                )}
              {step === 7 && choose("would_use", USE_OPTIONS, false)}
              {step === 8 &&
                textStep(
                  "closing_thoughts",
                  "Describe how you currently review the possible impact of an AI-generated code change",
                )}
              {step === 9 &&
                textStep(
                  "knowledge_location",
                  "Where do solutions, incident learnings, and architectural decisions live today?",
                )}
              {step === 10 &&
                textStep(
                  "hard_won_insight",
                  "Share the insight you learned through experience that others still miss",
                  5,
                )}

              {step === 11 && (
                <div className="space-y-4">
                  <p className="text-muted-foreground text-sm leading-relaxed">
                    Every field here is optional. You can leave them all blank.
                  </p>
                  <div>
                    <label
                      htmlFor={`${titleId}-email`}
                      className="mb-1.5 block text-sm font-medium"
                    >
                      Email address
                    </label>
                    <input
                      id={`${titleId}-email`}
                      type="email"
                      autoComplete="email"
                      placeholder="you@company.com"
                      value={a.email}
                      onChange={(e) => set("email", e.target.value)}
                      className={fieldClass}
                    />
                  </div>
                  <div>
                    <label
                      htmlFor={`${titleId}-linkedin`}
                      className="mb-1.5 block text-sm font-medium"
                    >
                      LinkedIn profile link or account
                    </label>
                    <input
                      id={`${titleId}-linkedin`}
                      type="text"
                      value={a.linkedin}
                      onChange={(e) => set("linkedin", e.target.value)}
                      className={fieldClass}
                    />
                  </div>
                  <div>
                    <label htmlFor={`${titleId}-x`} className="mb-1.5 block text-sm font-medium">
                      X account or profile link
                    </label>
                    <input
                      id={`${titleId}-x`}
                      type="text"
                      value={a.x_account}
                      onChange={(e) => set("x_account", e.target.value)}
                      className={fieldClass}
                    />
                  </div>
                </div>
              )}

              {stepError && (
                <p
                  id={`${titleId}-err`}
                  role="alert"
                  className="border-danger/30 bg-danger-soft text-danger mt-3 rounded-lg border px-3 py-2 text-sm"
                >
                  {stepError}
                </p>
              )}
            </div>

            {error && (
              <p
                role="alert"
                className="border-danger/30 bg-danger-soft text-danger rounded-lg border px-3 py-2 text-sm"
              >
                {error}
              </p>
            )}

            <div className="border-border flex items-center justify-between gap-3 border-t pt-4">
              {step > 0 ? (
                <button
                  onClick={() => {
                    setStepError(null);
                    setStep((s) => s - 1);
                  }}
                  className={buttonClass.secondary}
                >
                  <ArrowLeft className="size-4" aria-hidden /> Back
                </button>
              ) : (
                <div />
              )}

              {step < last ? (
                <button onClick={next} className={buttonClass.primary}>
                  Continue <ArrowRight className="size-4" aria-hidden />
                </button>
              ) : (
                <button disabled={saving} onClick={submit} className={buttonClass.primary}>
                  {saving && <Loader2 className="size-4 animate-spin" aria-hidden />}
                  {saving ? "Sending…" : "Complete and request access"}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
