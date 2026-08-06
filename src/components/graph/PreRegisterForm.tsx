import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
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
  "Less than 1 hour a week",
  "1–3 hours a week",
  "4–8 hours a week",
  "1–2 days a week",
  "More than half my week",
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
  email: string;
  role: string;
  company_size: string;
  frustration: string;
  time_understanding_code: string;
  hardest_parts: string[];
  dream_feature: string;
  would_use: string;
  closing_thoughts: string;
}

const EMPTY: Answers = {
  first_name: "",
  email: "",
  role: "",
  company_size: "",
  frustration: "",
  time_understanding_code: "",
  hardest_parts: [],
  dream_feature: "",
  would_use: "",
  closing_thoughts: "",
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
  "Anything else you want us to know?",
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
        return a.first_name.trim().length > 1 && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(a.email.trim());
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
      default:
        return true;
    }
  }, [step, a]);

  const set = <K extends keyof Answers>(k: K, v: Answers[K]) => setA((p) => ({ ...p, [k]: v }));

  const toggleHardest = (v: string) => {
    const has = a.hardest_parts.includes(v);
    if (has) set("hardest_parts", a.hardest_parts.filter((x) => x !== v));
    else if (a.hardest_parts.length < 3) set("hardest_parts", [...a.hardest_parts, v]);
  };

  const submit = async () => {
    setSaving(true);
    setError(null);
    const { error: err } = await supabase.from("pre_registrations").insert({
      first_name: a.first_name.trim(),
      email: a.email.trim().toLowerCase(),
      role: a.role,
      company_size: a.company_size,
      frustration: a.frustration.trim(),
      time_understanding_code: a.time_understanding_code,
      hardest_parts: a.hardest_parts,
      dream_feature: a.dream_feature.trim(),
      would_use: a.would_use,
      closing_thoughts: a.closing_thoughts.trim(),
    });
    setSaving(false);
    if (err) {
      setError(err.message);
      return;
    }
    setDone(true);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-xl">
      <div className="bg-background/85 absolute inset-0" onClick={onClose} />
      <div
        className="animate-rise border-border bg-card/90 relative w-full max-w-2xl rounded-2xl border p-8"
        style={{ boxShadow: "var(--shadow-panel)" }}
      >
        <button
          onClick={onClose}
          aria-label="Close pre-registration"
          className="text-muted-foreground hover:text-foreground absolute top-5 right-5 transition-colors"
        >
          <X className="size-4" />
        </button>

        {done ? (
          <div className="animate-rise py-10 text-center">
            <div className="bg-secondary text-primary mx-auto flex size-12 items-center justify-center rounded-full">
              <Check className="size-5" />
            </div>
            <h2 className="mt-5 text-xl font-semibold">You're on the list, {a.first_name}.</h2>
            <p className="text-muted-foreground mx-auto mt-3 max-w-sm text-sm leading-relaxed">
              We read every single answer. We'll email {a.email} when your workspace is ready for
              early access.
            </p>
            <button
              onClick={onClose}
              className="bg-primary text-primary-foreground hover:bg-primary-glow mt-7 rounded-xl px-5 py-2.5 text-sm font-semibold transition-colors"
            >
              Back to Nykst
            </button>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-3">
              <span className="text-primary font-mono text-[11px] tracking-widest">
                {String(step + 1).padStart(2, "0")} / {String(last + 1).padStart(2, "0")}
              </span>
              <div className="bg-surface-2 h-1 flex-1 overflow-hidden rounded-full">
                <div
                  className="bg-primary h-full rounded-full transition-all duration-500"
                  style={{ width: `${((step + 1) / (last + 1)) * 100}%` }}
                />
              </div>
            </div>

            <h2 key={step} className="animate-ticker mt-7 text-xl leading-snug font-semibold">
              {STEP_TITLES[step]}
            </h2>

            <div key={`b-${step}`} className="animate-ticker mt-6" style={{ animationDelay: "60ms" }}>
              {step === 0 && (
                <div className="grid gap-3">
                  <Field
                    label="First name"
                    value={a.first_name}
                    onChange={(v) => set("first_name", v)}
                    placeholder="Maya"
                  />
                  <Field
                    label="Work email"
                    value={a.email}
                    onChange={(v) => set("email", v)}
                    placeholder="maya@company.com"
                    type="email"
                  />
                </div>
              )}

              {step === 1 && (
                <Options value={a.role} options={ROLE_OPTIONS} onPick={(v) => set("role", v)} />
              )}
              {step === 2 && (
                <Options
                  value={a.company_size}
                  options={SIZE_OPTIONS}
                  onPick={(v) => set("company_size", v)}
                />
              )}
              {step === 3 && (
                <Text
                  value={a.frustration}
                  onChange={(v) => set("frustration", v)}
                  placeholder="Tracing a single change across services takes days…"
                />
              )}
              {step === 4 && (
                <Options
                  value={a.time_understanding_code}
                  options={TIME_OPTIONS}
                  onPick={(v) => set("time_understanding_code", v)}
                />
              )}
              {step === 5 && (
                <>
                  <p className="text-muted-foreground -mt-2 mb-3 text-xs">Choose up to three.</p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {HARDEST_OPTIONS.map((o) => {
                      const on = a.hardest_parts.includes(o);
                      return (
                        <button
                          key={o}
                          onClick={() => toggleHardest(o)}
                          className={cn(
                            "lift hover:lift-hover rounded-xl border px-4 py-3 text-left text-sm",
                            on
                              ? "border-primary bg-secondary"
                              : "border-border bg-surface hover:bg-surface-2",
                          )}
                        >
                          {o}
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
              {step === 6 && (
                <Text
                  value={a.dream_feature}
                  onChange={(v) => set("dream_feature", v)}
                  placeholder="Show me the blast radius of a PR before I open it…"
                />
              )}
              {step === 7 && (
                <Options
                  value={a.would_use}
                  options={USE_OPTIONS}
                  onPick={(v) => set("would_use", v)}
                />
              )}
              {step === 8 && (
                <Text
                  value={a.closing_thoughts}
                  onChange={(v) => set("closing_thoughts", v)}
                  placeholder="Optional — anything at all."
                />
              )}
            </div>

            {error && <p className="text-destructive mt-4 text-xs">{error}</p>}

            <div className="mt-8 flex items-center justify-between">
              <button
                onClick={() => setStep((s) => Math.max(0, s - 1))}
                disabled={step === 0}
                className="text-muted-foreground hover:text-foreground flex items-center gap-1.5 text-sm transition-colors disabled:opacity-30"
              >
                <ArrowLeft className="size-3.5" /> Back
              </button>
              {step < last ? (
                <button
                  onClick={() => setStep((s) => s + 1)}
                  disabled={!canAdvance}
                  className="bg-primary text-primary-foreground hover:bg-primary-glow flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold transition-colors disabled:opacity-40"
                >
                  Continue <ArrowRight className="size-3.5" />
                </button>
              ) : (
                <button
                  onClick={submit}
                  disabled={saving}
                  className="bg-primary text-primary-foreground hover:bg-primary-glow flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold transition-colors disabled:opacity-40"
                >
                  {saving && <Loader2 className="size-3.5 animate-spin" />} Submit pre-registration
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  type?: string;
}) {
  return (
    <label className="block">
      <span className="text-muted-foreground text-[11px] tracking-widest uppercase">{label}</span>
      <input
        type={type}
        value={value}
        maxLength={160}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="border-border bg-surface focus:border-primary placeholder:text-muted-foreground/60 mt-2 w-full rounded-xl border px-4 py-3 text-sm outline-none transition-colors"
      />
    </label>
  );
}

function Text({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <textarea
      value={value}
      rows={5}
      maxLength={1200}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="border-border bg-surface focus:border-primary placeholder:text-muted-foreground/60 w-full resize-none rounded-xl border px-4 py-3 text-sm leading-relaxed outline-none transition-colors"
    />
  );
}

function Options({
  value,
  options,
  onPick,
}: {
  value: string;
  options: string[];
  onPick: (v: string) => void;
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {options.map((o) => (
        <button
          key={o}
          onClick={() => onPick(o)}
          className={cn(
            "lift hover:lift-hover rounded-xl border px-4 py-3 text-left text-sm",
            value === o
              ? "border-primary bg-secondary"
              : "border-border bg-surface hover:bg-surface-2",
          )}
        >
          {o}
        </button>
      ))}
    </div>
  );
}
