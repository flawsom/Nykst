import { useState, useMemo } from "react";
import { cn } from "@/lib/utils";
import { ArrowLeft, ArrowRight, Check, Loader2, X, Sparkles, MessageSquare } from "lucide-react";

interface Reason {
  title: string;
  subtitle: string;
  pitch: string;
}

const HOLY_GRAIL_REASONS: Reason[] = [
  {
    title: "1. The Amnesiac Codebase Trap",
    subtitle: "Stop running software that forgets its own history every time context disappears.",
    pitch: "Your code lives in GitHub, your production behavior lives in monitoring, your incidents live in tickets, and your decisions live in dead Slack threads. When something changes, everyone starts digging. NYKST fuses structure, history, decisions, and outcomes into a permanent cognitive layer so your organization never loses context again."
  },
  {
    title: "2. The Universal Software Soul",
    subtitle: "Datadog watches servers, Stripe watches money, Git watches code. But no one connected them.",
    pitch: "NYKST is the missing link—the software soul that locks code, telemetry, business logic, and damage prevention into a single closed learning loop. It is the definitive technical cheat code that stops your system from bleeding context forever."
  },
  {
    title: "3. Eliminate Corporate Suicide by 'Thinking About It'",
    subtitle: "Indecision is the corporate disease that paralyzes engineering velocity.",
    pitch: "When your system crashes, your engineers sweat in Zoom war rooms for six hours guessing and bleeding money while rediscovering old code. NYKST gives you an unbreakable persistent memory layer so you deploy with absolute mathematical certainty before your competitors even know what hit them."
  },
  {
    title: "4. Building Software That Remembers",
    subtitle: "Move from digital archaeology to self-correcting system intelligence.",
    pitch: "The technical purists will tell you self-correcting closed-loop software consciousness is impossible. They said the same thing about phones with no buttons. Are you content living inside their technical limitations, or will you join the definitive engineering revolution?"
  },
  {
    title: "5. Claim the Definitive Infrastructure Monopoly",
    subtitle: "Stop building bloated, terrifying monsters of hidden dependencies.",
    pitch: "Look at your current codebase. Is it a beautifully sculpted piece of engineering, or a terrifying monster you're scared to touch? NYKST transforms your architecture into a self-improving masterpiece, securing a zero-churn infrastructure monopoly for your enterprise."
  }
];

export function AdvantagesForm({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState(0); // 0 to 4 for reasons, 5 for final contact
  const [feedback, setFeedback] = useState<Record<number, string>>({});
  const [email, setEmail] = useState("");
  const [linkedin, setLinkedin] = useState("");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  const totalSteps = HOLY_GRAIL_REASONS.length + 1; // 5 reasons + 1 contact step

  const handleFeedbackChange = (text: string) => {
    setFeedback((prev) => ({ ...prev, [step]: text }));
  };

  const submit = () => {
    setSaving(true);
    setTimeout(() => {
      try {
        const payload = {
          feedback,
          email: email.trim(),
          linkedin: linkedin.trim(),
          created_at: new Date().toISOString(),
        };
        const existing = JSON.parse(localStorage.getItem("nykst.holy_grail_submissions") || "[]");
        existing.push(payload);
        localStorage.setItem("nykst.holy_grail_submissions", JSON.stringify(existing));
      } catch (e) {}
      setSaving(false);
      setDone(true);
    }, 500);
  };

  const isContactStep = step === HOLY_GRAIL_REASONS.length;
  const currentReason = HOLY_GRAIL_REASONS[step];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-xl">
      <div className="bg-background/85 absolute inset-0" onClick={onClose} />
      <div
        className="animate-rise border-emerald-500/30 bg-card/95 relative w-full max-w-2xl rounded-2xl border p-8 shadow-2xl"
      >
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
            <h2 className="text-2xl font-semibold tracking-tight text-foreground">Welcome to the Software Revolution</h2>
            <p className="text-muted-foreground mx-auto max-w-md text-sm leading-relaxed">
              Your insights have been securely recorded. We have locked in your priority access for NYKST.
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
                <Sparkles className="size-3.5" /> Holy Grail Advantages · Step {step + 1} of {totalSteps}
              </span>
              <div className="flex gap-1">
                {Array.from({ length: totalSteps }).map((_, i) => (
                  <div
                    key={i}
                    className={cn(
                      "h-1.5 w-6 rounded-full transition-all",
                      i <= step ? "bg-emerald-500" : "bg-border"
                    )}
                  />
                ))}
              </div>
            </div>

            {!isContactStep && currentReason ? (
              <div className="space-y-4">
                <div>
                  <span className="text-emerald-400 text-xs font-mono uppercase tracking-widest font-bold">Reason {step + 1}</span>
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
                    <MessageSquare className="size-3.5" /> What do you think about this? (Share your thoughts)
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
                  <span className="text-emerald-400 text-xs font-mono uppercase tracking-widest font-bold">Final Step</span>
                  <h2 className="text-xl font-semibold tracking-tight text-foreground mt-1">
                    Claim Your Infrastructure Monopoly
                  </h2>
                  <p className="text-muted-foreground text-xs mt-1 font-mono">
                    Enter your email and LinkedIn profile to finalize your access.
                  </p>
                </div>

                <div className="space-y-4 pt-2">
                  <div>
                    <label className="text-muted-foreground mb-1.5 block text-xs font-medium">Work Email</label>
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
                    <label className="text-muted-foreground mb-1.5 block text-xs font-medium">LinkedIn Profile URL</label>
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

            <div className="flex items-center justify-between border-t border-border pt-4">
              {step > 0 ? (
                <button
                  onClick={() => setStep((s) => s - 1)}
                  className="border-border bg-surface hover:bg-surface-2 text-muted-foreground hover:text-foreground flex items-center gap-1.5 rounded-xl border px-4 py-2.5 text-xs font-medium transition-colors"
                >
                  <ArrowLeft className="size-3.5" /> Back
                </button>
              ) : <div />}

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
                      : "bg-emerald-600/50 cursor-not-allowed"
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
