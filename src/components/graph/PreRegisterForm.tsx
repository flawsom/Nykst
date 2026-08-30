import { useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { TablesInsert } from "@/integrations/supabase/types";
import { cn } from "@/lib/utils";
import { ArrowLeft, ArrowRight, Check, Loader2, X } from "lucide-react";

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

      const { error: supabaseError } = await supabase.from("pre_registration").insert(payload);

      if (supabaseError) {
        throw new Error(supabaseError.message);
      }

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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-xl">
      <div className="bg-background/85 absolute inset-0" onClick={onClose} />
      <div className="animate-rise border-border bg-card/95 relative w-full max-w-2xl rounded-2xl border p-8 shadow-2xl">
        <button
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground absolute top-6 right-6 transition-colors"
        >
          <X className="size-5" />
        </button>

        {done ? (
          <div className="py-12 text-center space-y-4">
            <div className="bg-primary/25 text-primary mx-auto flex size-14 items-center justify-center rounded-full border border-primary/40">
              <Check className="size-7" />
            </div>
            <h2 className="text-2xl font-semibold tracking-tight text-foreground">
              You're on the early access list
            </h2>
            <p className="text-muted-foreground mx-auto max-w-md text-sm leading-relaxed">
              Thank you, <span className="text-foreground font-medium">{a.first_name}</span>. Your
              preferences have been successfully recorded.
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
              <span className="text-muted-foreground font-mono text-xs uppercase tracking-wider">
                Step {step + 1} of {STEP_TITLES.length}
              </span>
              <div className="flex gap-1">
                {STEP_TITLES.map((_, i) => (
                  <div
                    key={i}
                    className={cn(
                      "h-1.5 w-6 rounded-full transition-all",
                      i <= step ? "bg-primary" : "bg-border",
                    )}
                  />
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <h2 className="text-xl font-semibold tracking-tight text-foreground">
                {STEP_TITLES[step]}
              </h2>
            </div>

            <div className="py-2 min-h-[220px]">
              {step === 0 && (
                <div className="space-y-4">
                  <div>
                    <label className="text-muted-foreground mb-1.5 block text-xs font-medium">
                      First Name
                    </label>
                    <input
                      type="text"
                      placeholder="Alex"
                      value={a.first_name}
                      onChange={(e) => set("first_name", e.target.value)}
                      className="border-border bg-surface text-foreground w-full rounded-xl border px-4 py-3 text-sm outline-none focus:border-primary font-mono"
                      autoFocus
                    />
                  </div>
                </div>
              )}

              {step === 1 && (
                <div className="grid grid-cols-2 gap-2.5 max-h-72 overflow-y-auto pr-1">
                  {ROLE_OPTIONS.map((r) => (
                    <button
                      key={r}
                      onClick={() => set("role", r)}
                      className={cn(
                        "rounded-xl border p-3 text-left text-xs font-medium transition-all flex items-center justify-between",
                        a.role === r
                          ? "bg-primary/20 border-primary text-foreground font-semibold"
                          : "border-border bg-surface text-muted-foreground hover:text-foreground hover:bg-surface-2",
                      )}
                    >
                      <span>{r}</span>
                      {a.role === r && <Check className="size-4 text-primary shrink-0" />}
                    </button>
                  ))}
                </div>
              )}

              {step === 2 && (
                <div className="grid grid-cols-2 gap-2.5">
                  {SIZE_OPTIONS.map((s) => (
                    <button
                      key={s}
                      onClick={() => set("company_size", s)}
                      className={cn(
                        "rounded-xl border p-3.5 text-left text-xs font-medium transition-all flex items-center justify-between",
                        a.company_size === s
                          ? "bg-primary/20 border-primary text-foreground font-semibold"
                          : "border-border bg-surface text-muted-foreground hover:text-foreground hover:bg-surface-2",
                      )}
                    >
                      <span>{s}</span>
                      {a.company_size === s && <Check className="size-4 text-primary shrink-0" />}
                    </button>
                  ))}
                </div>
              )}

              {step === 3 && (
                <div>
                  <textarea
                    rows={4}
                    placeholder="e.g., Finding where business logic lives across 40 microservices without breaking APIs..."
                    value={a.frustration}
                    onChange={(e) => set("frustration", e.target.value)}
                    className="border-border bg-surface text-foreground w-full rounded-xl border p-4 text-sm outline-none focus:border-primary font-mono leading-relaxed"
                    autoFocus
                  />
                </div>
              )}

              {step === 4 && (
                <div className="space-y-2">
                  {TIME_OPTIONS.map((t) => (
                    <button
                      key={t}
                      onClick={() => set("time_understanding_code", t)}
                      className={cn(
                        "w-full rounded-xl border p-3.5 text-left text-xs font-medium transition-all flex items-center justify-between",
                        a.time_understanding_code === t
                          ? "bg-primary/20 border-primary text-foreground font-semibold"
                          : "border-border bg-surface text-muted-foreground hover:text-foreground hover:bg-surface-2",
                      )}
                    >
                      <span>{t}</span>
                      {a.time_understanding_code === t && (
                        <Check className="size-4 text-primary shrink-0" />
                      )}
                    </button>
                  ))}
                </div>
              )}

              {step === 5 && (
                <div className="space-y-2">
                  <p className="text-muted-foreground text-xs mb-2">Select up to 3:</p>
                  <div className="grid grid-cols-2 gap-2">
                    {HARDEST_OPTIONS.map((h) => {
                      const selected = a.hardest_parts.includes(h);
                      return (
                        <button
                          key={h}
                          onClick={() => toggleHardest(h)}
                          className={cn(
                            "rounded-xl border p-3 text-left text-xs font-medium transition-all flex items-center justify-between",
                            selected
                              ? "bg-primary/20 border-primary text-foreground font-semibold"
                              : "border-border bg-surface text-muted-foreground hover:text-foreground hover:bg-surface-2",
                          )}
                        >
                          <span>{h}</span>
                          {selected && <Check className="size-4 text-primary shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {step === 6 && (
                <div>
                  <textarea
                    rows={4}
                    placeholder="e.g., Instant natural language codebase search with 100% accurate file references..."
                    value={a.dream_feature}
                    onChange={(e) => set("dream_feature", e.target.value)}
                    className="border-border bg-surface text-foreground w-full rounded-xl border p-4 text-sm outline-none focus:border-primary font-mono leading-relaxed"
                    autoFocus
                  />
                </div>
              )}

              {step === 7 && (
                <div className="space-y-2.5">
                  {USE_OPTIONS.map((u) => (
                    <button
                      key={u}
                      onClick={() => set("would_use", u)}
                      className={cn(
                        "w-full rounded-xl border p-3.5 text-left text-xs font-medium transition-all flex items-center justify-between",
                        a.would_use === u
                          ? "bg-primary/20 border-primary text-foreground font-semibold"
                          : "border-border bg-surface text-muted-foreground hover:text-foreground hover:bg-surface-2",
                      )}
                    >
                      <span>{u}</span>
                      {a.would_use === u && <Check className="size-4 text-primary shrink-0" />}
                    </button>
                  ))}
                </div>
              )}

              {step === 8 && (
                <div>
                  <textarea
                    rows={4}
                    placeholder="Describe how you currently review the possible impact of an AI-generated code change..."
                    value={a.closing_thoughts}
                    onChange={(e) => set("closing_thoughts", e.target.value)}
                    className="border-border bg-surface text-foreground w-full rounded-xl border p-4 text-sm outline-none focus:border-primary font-mono leading-relaxed"
                    autoFocus
                  />
                </div>
              )}

              {step === 9 && (
                <div>
                  <textarea
                    rows={4}
                    placeholder="Where do solutions, incident learnings, and architectural decisions live today?"
                    value={a.knowledge_location}
                    onChange={(e) => set("knowledge_location", e.target.value)}
                    className="border-border bg-surface text-foreground w-full rounded-xl border p-4 text-sm outline-none focus:border-primary font-mono leading-relaxed"
                    autoFocus
                  />
                </div>
              )}

              {step === 10 && (
                <div>
                  <textarea
                    rows={5}
                    placeholder="Share the insight you learned through experience that others still miss..."
                    value={a.hard_won_insight}
                    onChange={(e) => set("hard_won_insight", e.target.value)}
                    className="border-border bg-surface text-foreground w-full rounded-xl border p-4 text-sm outline-none focus:border-primary font-mono leading-relaxed"
                    autoFocus
                  />
                </div>
              )}

              {step === 11 && (
                <div className="space-y-3">
                  <p className="text-muted-foreground text-xs leading-relaxed">
                    Optional. Share one or more ways to stay connected. You can leave every field
                    blank.
                  </p>
                  <input
                    type="email"
                    placeholder="Email address (optional)"
                    value={a.email}
                    onChange={(e) => set("email", e.target.value)}
                    className="border-border bg-surface text-foreground w-full rounded-xl border px-4 py-3 text-sm outline-none focus:border-primary font-mono"
                  />
                  <input
                    type="text"
                    placeholder="LinkedIn profile link or account (optional)"
                    value={a.linkedin}
                    onChange={(e) => set("linkedin", e.target.value)}
                    className="border-border bg-surface text-foreground w-full rounded-xl border px-4 py-3 text-sm outline-none focus:border-primary font-mono"
                  />
                  <input
                    type="text"
                    placeholder="X account or profile link (optional)"
                    value={a.x_account}
                    onChange={(e) => set("x_account", e.target.value)}
                    className="border-border bg-surface text-foreground w-full rounded-xl border px-4 py-3 text-sm outline-none focus:border-primary font-mono"
                  />
                </div>
              )}
            </div>

            {error && (
              <div className="bg-red-500/10 border border-red-500/30 text-red-400 p-3 rounded-xl text-xs font-mono">
                {error}
              </div>
            )}

            <div className="flex items-center justify-between border-t border-border pt-4">
              {step > 0 ? (
                <button
                  onClick={() => setStep((s) => s - 1)}
                  className="border-border bg-surface hover:bg-surface-2 text-muted-foreground hover:text-foreground flex items-center gap-1.5 rounded-xl border px-4 py-2.5 text-xs font-medium transition-colors"
                >
                  <ArrowLeft className="size-3.5" /> Back
                </button>
              ) : (
                <div />
              )}

              {step < last ? (
                <button
                  disabled={!canAdvance}
                  onClick={() => setStep((s) => s + 1)}
                  className={cn(
                    "flex items-center gap-1.5 rounded-xl px-5 py-2.5 text-xs font-semibold transition-all",
                    canAdvance
                      ? "bg-primary text-primary-foreground hover:bg-primary-glow shadow-sm"
                      : "bg-surface text-muted-foreground opacity-50 cursor-not-allowed border border-border",
                  )}
                >
                  Continue <ArrowRight className="size-3.5" />
                </button>
              ) : (
                <button
                  disabled={saving}
                  onClick={submit}
                  className="bg-primary text-primary-foreground hover:bg-primary-glow flex items-center gap-2 rounded-xl px-6 py-2.5 text-xs font-semibold shadow-md transition-colors"
                >
                  {saving && <Loader2 className="size-3.5 animate-spin" />}
                  Complete & Request Access
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
