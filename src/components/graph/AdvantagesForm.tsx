import { useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { TablesInsert } from "@/integrations/supabase/types";
import { cn } from "@/lib/utils";
import { ArrowLeft, ArrowRight, Check, Loader2, X, Sparkles, MessageSquare } from "lucide-react";

interface Reason {
  title: string;
  subtitle: string;
  pitch: string;
}

const ADVANTAGE_REASONS: Reason[] = [
  {
    title: "1. Stop paying for the same understanding twice",
    subtitle:
      "Every undocumented fix becomes a future investigation—and every lost engineer takes context with them.",
    pitch:
      "Your team solves hard problems every week, but the reasoning often disappears across commits, dashboards, tickets, and private conversations. Nykst connects those fragments into a living record of what changed, why it changed, and what the system taught you afterward. The advantage is direct: less rediscovery, faster onboarding, and better decisions every time the codebase changes.",
  },
  {
    title: "2. Build the system that learns while you operate it",
    subtitle:
      "The value of a software organization should compound instead of resetting after every incident or handoff.",
    pitch:
      "Nykst turns engineering history into usable context. A verified fix strengthens future diagnosis; an accepted design decision guides future changes; a rejected approach becomes a boundary the team can avoid. Over time, your system becomes more understandable because it carries forward the evidence your organization has earned—not because people are forced to remember everything themselves.",
  },
  {
    title: "3. Know what a code change can disturb before it reaches users",
    subtitle:
      "The dangerous part of a deployment is rarely the line you edited—it is the dependency you did not see.",
    pitch:
      "A small change to an authentication flow can affect an API gateway, a queue consumer, a database migration, and a customer journey. Nykst traces those relationships across your actual repositories, services, configuration, and runtime signals. Instead of approving changes on intuition alone, your team can review the likely blast radius and verify the paths that matter most.",
  },
  {
    title: "4. Make expert knowledge belong to the organization",
    subtitle:
      "Critical system understanding should not live inside one person’s memory or one team’s private channel.",
    pitch:
      "When a staff engineer leaves, the organization should not lose the reasoning behind its architecture. Nykst preserves the connection between ownership, decisions, code, incidents, and operational outcomes. New engineers can work from the organization’s accumulated evidence, while experienced engineers spend less time repeating explanations that should already be available to the team.",
  },
  {
    title: "5. Replace reactive firefighting with prepared engineering",
    subtitle:
      "The best time to understand a failure is before it becomes a customer-facing incident.",
    pitch:
      "Nykst links code changes to runtime behavior: errors, logs, traces, requests, latency, throughput, retries, concurrency, queues, CPU, memory, and database performance. When behavior changes, the team can investigate the causal path rather than search through disconnected tools. That means fewer blind war rooms and a clearer route from signal to root cause to verified resolution.",
  },
  {
    title: "6. Give every engineering decision a defensible reason",
    subtitle:
      "Good teams do not need more opinions; they need better evidence at the moment decisions are made.",
    pitch:
      "Nykst lets your engineers and AI work from the company’s real architecture, history, constraints, and outcomes. It can answer why a component exists, what a proposed change may affect, what was tried before, and which solution actually held up in production. That makes development better in every use: more context before action, fewer avoidable surprises, and decisions that become easier to trust.",
  },
];

export function AdvantagesForm({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState(0); // One step per reason, followed by the final contact step
  const [feedback, setFeedback] = useState<Record<number, string>>({});
  const [email, setEmail] = useState("");
  const [linkedin, setLinkedin] = useState("");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const totalSteps = ADVANTAGE_REASONS.length + 1; // 5 reasons + 1 contact step

  const handleFeedbackChange = (text: string) => {
    setFeedback((prev) => ({ ...prev, [step]: text }));
  };

  const submit = async () => {
    setSaving(true);
    setError(null);

    const payload: TablesInsert<"advantages_feedback"> = {
      feedback,
      email: email.trim(),
      linkedin: linkedin.trim() || null,
    };

    try {
      try {
        const existing = JSON.parse(localStorage.getItem("nykst.advantages_submissions") || "[]");
        existing.push(payload);
        localStorage.setItem("nykst.advantages_submissions", JSON.stringify(existing));
      } catch (storageError) {
        console.error("Local storage backup error:", storageError);
      }

      const { error: supabaseError } = await supabase.from("advantages_feedback").insert(payload);

      if (supabaseError) {
        throw new Error(supabaseError.message);
      }

      setDone(true);
    } catch (submissionError: unknown) {
      console.error("Advantages feedback submission failed:", submissionError);
      setError(
        submissionError instanceof Error
          ? `We couldn't save your feedback: ${submissionError.message}`
          : "We couldn't save your feedback. Please try again.",
      );
    } finally {
      setSaving(false);
    }
  };

  const isContactStep = step === ADVANTAGE_REASONS.length;
  const currentReason = ADVANTAGE_REASONS[step];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-xl">
      <div className="bg-background/85 absolute inset-0" onClick={onClose} />
      <div className="animate-rise border-emerald-500/30 bg-card/95 relative w-full max-w-2xl rounded-2xl border p-8 shadow-2xl">
        <button
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground absolute top-6 right-6 transition-colors"
        >
          <X className="size-5" />
        </button>

        {done ? (
          <div className="py-12 text-center space-y-4">
            <div className="bg-emerald-500/20 text-emerald-400 mx-auto flex size-14 items-center justify-center rounded-full border border-emerald-500/40">
              <Sparkles className="size-7" />
            </div>
            <h2 className="text-2xl font-semibold tracking-tight text-foreground">
              Welcome to the Software Revolution
            </h2>
            <p className="text-muted-foreground mx-auto max-w-md text-sm leading-relaxed">
              Your insights have been securely recorded. We have locked in your priority access for
              NYKST.
            </p>
            <button
              onClick={onClose}
              className="bg-emerald-600 hover:bg-emerald-500 text-white mt-4 rounded-xl px-6 py-2.5 text-sm font-semibold transition-colors shadow-md"
            >
              Back to Nykst
            </button>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="flex items-center justify-between border-b border-border pb-4">
              <span className="text-emerald-400 font-mono text-xs uppercase tracking-wider flex items-center gap-1.5 font-semibold">
                <Sparkles className="size-3.5" /> Why teams choose Nykst · Step {step + 1} of{" "}
                {totalSteps}
              </span>
              <div className="flex gap-1">
                {Array.from({ length: totalSteps }).map((_, i) => (
                  <div
                    key={i}
                    className={cn(
                      "h-1.5 w-6 rounded-full transition-all",
                      i <= step ? "bg-emerald-500" : "bg-border",
                    )}
                  />
                ))}
              </div>
            </div>

            {!isContactStep && currentReason ? (
              <div className="space-y-4">
                <div>
                  <span className="text-emerald-400 text-xs font-mono uppercase tracking-widest font-bold">
                    Advantage {step + 1}
                  </span>
                  <h2 className="text-xl font-semibold tracking-tight text-foreground mt-1">
                    {currentReason.title}
                  </h2>
                  <p className="text-muted-foreground text-xs mt-1 font-mono">
                    {currentReason.subtitle}
                  </p>
                </div>

                <div className="bg-surface/80 border border-border rounded-xl p-4 text-sm text-foreground/90 leading-relaxed font-sans">
                  {currentReason.pitch}
                </div>

                {/* Interactive Typing Area */}
                <div className="space-y-2 pt-2">
                  <label className="text-xs font-mono uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                    <MessageSquare className="size-3.5" /> What do you think about this? (Share your
                    thoughts)
                  </label>
                  <textarea
                    rows={3}
                    placeholder="Type your perspective, thoughts, or engineering reality here..."
                    value={feedback[step] || ""}
                    onChange={(e) => handleFeedbackChange(e.target.value)}
                    className="border-border bg-surface text-foreground w-full rounded-xl border p-3.5 text-sm outline-none focus:border-emerald-500 font-mono leading-relaxed"
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <span className="text-emerald-400 text-xs font-mono uppercase tracking-widest font-bold">
                    Final Step
                  </span>
                  <h2 className="text-xl font-semibold tracking-tight text-foreground mt-1">
                    See Nykst in your own system
                  </h2>
                  <p className="text-muted-foreground text-xs mt-1 font-mono">
                    Leave your details to hear when early access opens.
                  </p>
                </div>

                <div className="space-y-4 pt-2">
                  <div>
                    <label className="text-muted-foreground mb-1.5 block text-xs font-medium">
                      Work Email
                    </label>
                    <input
                      type="email"
                      placeholder="alex@company.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="border-border bg-surface text-foreground w-full rounded-xl border px-4 py-3 text-sm outline-none focus:border-emerald-500 font-mono"
                      autoFocus
                    />
                  </div>
                  <div>
                    <label className="text-muted-foreground mb-1.5 block text-xs font-medium">
                      LinkedIn Profile URL
                    </label>
                    <input
                      type="text"
                      placeholder="linkedin.com/in/yourprofile"
                      value={linkedin}
                      onChange={(e) => setLinkedin(e.target.value)}
                      className="border-border bg-surface text-foreground w-full rounded-xl border px-4 py-3 text-sm outline-none focus:border-emerald-500 font-mono"
                    />
                  </div>
                </div>
              </div>
            )}

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

              {!isContactStep ? (
                <button
                  onClick={() => setStep((s) => s + 1)}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white flex items-center gap-1.5 rounded-xl px-5 py-2.5 text-xs font-semibold transition-all shadow-md"
                >
                  Next Reason <ArrowRight className="size-3.5" />
                </button>
              ) : (
                <button
                  disabled={saving || !email.trim() || !email.includes("@")}
                  onClick={submit}
                  className={cn(
                    "flex items-center gap-2 rounded-xl px-6 py-2.5 text-xs font-semibold shadow-md transition-colors text-white",
                    email.trim() && email.includes("@")
                      ? "bg-emerald-600 hover:bg-emerald-500 cursor-pointer"
                      : "bg-emerald-600/50 cursor-not-allowed",
                  )}
                >
                  {saving && <Loader2 className="size-3.5 animate-spin" />}
                  Complete & Secure Access
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
