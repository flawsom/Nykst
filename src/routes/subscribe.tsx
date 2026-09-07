import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, CheckCircle2, Clock3, Copy, Crown, Globe2, ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/subscribe")({
  head: () => ({ meta: [{ title: "Nykst Premium — eSewa subscription" }] }),
  component: SubscribePage,
});

type Plan = "monthly" | "annual";
type Region = "nepal" | "international";
type SubscriptionState = {
  subscription?: { status: string; plan?: Plan; active_until?: string | null };
  submission?: {
    status: string;
    plan?: Plan;
    amount_npr: number;
    transaction_reference: string;
    created_at: string;
    review_note?: string | null;
  } | null;
  plans: Record<Plan, { label: string; amountNpr: number; days: number }>;
  display_name: string;
  instructions: string;
  qr_url: string;
};

function SubscribePage() {
  const [data, setData] = useState<SubscriptionState | null>(null);
  const [plan, setPlan] = useState<Plan>("monthly");
  const [region, setRegion] = useState<Region>(() =>
    typeof Intl !== "undefined" &&
    Intl.DateTimeFormat().resolvedOptions().timeZone === "Asia/Kathmandu"
      ? "nepal"
      : "international",
  );
  const [showPlans, setShowPlans] = useState(false);
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/subscription", { credentials: "include" });
      const body = (await response.json()) as SubscriptionState & { error?: string };
      if (!response.ok) setError(body.error || "Connect GitHub before subscribing.");
      else {
        setData(body);
        if (body.subscription?.plan) setPlan(body.subscription.plan);
        else if (body.submission?.plan) setPlan(body.submission.plan);
        setError("");
      }
    } catch {
      setError("Subscription details are temporarily unavailable.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (region === "international") {
      setLoading(false);
      setData(null);
      setError("");
      return;
    }
    void load();
  }, [region]);

  const copyName = async () => {
    if (!data?.display_name || !navigator.clipboard) return;
    await navigator.clipboard.writeText(data.display_name);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  const submit = async () => {
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/subscription", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ plan, transaction_reference: reference, payer_note: note }),
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(body.error || "Could not submit payment.");
      await load();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Could not submit payment.");
    } finally {
      setSubmitting(false);
    }
  };

  const selectedPlan = data?.plans?.[plan] ?? {
    label: plan === "monthly" ? "Monthly" : "Annual",
    amountNpr: plan === "monthly" ? 999 : 9999,
  };
  const active = data?.subscription?.status === "active" || data?.submission?.status === "approved";
  const pending = data?.submission?.status === "pending";

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="border-border bg-card/80 sticky top-0 z-20 flex items-center justify-between border-b px-4 py-3 backdrop-blur sm:px-6 sm:py-4">
        <Link to="/" className="flex items-center gap-2.5">
          <span className="glow-ring bg-primary size-2 rounded-full" />
          <span className="text-[13px] font-semibold uppercase tracking-[0.24em]">Nykst</span>
        </Link>
        <Link
          to="/graph"
          className="text-muted-foreground hover:text-foreground flex items-center gap-1.5 text-xs"
        >
          <ArrowLeft className="size-3.5" /> Back to graph
        </Link>
      </header>

      <div className="mx-auto grid max-w-5xl gap-8 px-4 py-8 sm:px-6 sm:py-12 lg:grid-cols-[1.05fr_0.95fr] lg:items-start">
        <section>
          <p className="text-primary font-mono text-[10px] uppercase tracking-[0.28em]">
            Nykst Premium
          </p>
          <h1 className="text-gradient mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">
            Keep the whole system in memory.
          </h1>
          <p className="text-muted-foreground mt-4 max-w-xl text-sm leading-relaxed">
            Basic AI access and the first system-understanding moment stay free. Premium adds the
            depth that compounds over time.
          </p>
          <div className="mt-8 grid gap-3 sm:grid-cols-3">
            <div className="border-border bg-card/70 rounded-xl border p-4">
              <ShieldCheck className="text-primary size-4" />
              <p className="mt-3 text-xs font-semibold">Persistent memory</p>
              <p className="text-muted-foreground mt-1 text-[11px]">
                Your architecture memory keeps updating.
              </p>
            </div>
            <div className="border-border bg-card/70 rounded-xl border p-4">
              <Clock3 className="text-primary size-4" />
              <p className="mt-3 text-xs font-semibold">Historical reasoning</p>
              <p className="text-muted-foreground mt-1 text-[11px]">
                Decisions, incidents, and what changed.
              </p>
            </div>
            <div className="border-border bg-card/70 rounded-xl border p-4">
              <Crown className="text-primary size-4" />
              <p className="mt-3 text-xs font-semibold">System-wide context</p>
              <p className="text-muted-foreground mt-1 text-[11px]">
                Higher context and integrations.
              </p>
            </div>
          </div>
        </section>

        <section className="border-border bg-card/90 rounded-2xl border p-4 shadow-2xl sm:p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-muted-foreground text-[10px] font-mono uppercase tracking-[0.2em]">
                Choose your plan
              </p>
              <h2 className="mt-2 text-2xl font-semibold">Premium access</h2>
            </div>
            <span className="bg-primary/10 text-primary rounded-full px-2.5 py-1 text-[10px] font-mono">
              eSewa
            </span>
          </div>

          <div className="border-border bg-surface mt-6 rounded-xl border p-4">
            <div className="flex items-center gap-2">
              <Globe2 className="text-primary size-4" />
              <p className="text-sm font-semibold">Where are you based?</p>
            </div>
            <p className="text-muted-foreground mt-1 text-xs">
              Nepal payments use eSewa. International users use BYOK at no subscription charge.
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                onClick={() => setRegion("nepal")}
                className={`rounded-lg border px-3 py-2 text-xs ${region === "nepal" ? "border-primary bg-primary/10" : "border-border"}`}
              >
                Nepal
              </button>
              <button
                onClick={() => setRegion("international")}
                className={`rounded-lg border px-3 py-2 text-xs ${region === "international" ? "border-primary bg-primary/10" : "border-border"}`}
              >
                Outside Nepal
              </button>
            </div>
          </div>

          {loading ? (
            <p className="text-muted-foreground mt-8 text-sm">
              Preparing your payment instructions…
            </p>
          ) : region === "international" ? (
            <div className="border-emerald-500/30 bg-emerald-500/10 mt-4 rounded-xl border p-4">
              <p className="text-sm font-semibold text-emerald-200">
                Free international access with your own API key
              </p>
              <p className="text-muted-foreground mt-2 text-xs leading-relaxed">
                We do not charge users outside Nepal through eSewa. Add your own OpenAI, Anthropic,
                or DeepSeek key and use Nykst’s AI routing without a subscription payment.
              </p>
              <Link
                to="/intelligence"
                className="bg-primary text-primary-foreground mt-4 inline-flex w-full items-center justify-center rounded-xl px-4 py-3 text-sm font-semibold"
              >
                Open API Settings
              </Link>
            </div>
          ) : error && !data ? (
            <div className="mt-6 space-y-4">
              <p className="border-red-500/30 bg-red-500/10 rounded-xl border px-4 py-3 text-sm text-red-300">
                {error}
              </p>
              <a
                href="/api/integrations/github/start"
                className="bg-primary text-primary-foreground inline-flex w-full items-center justify-center rounded-xl px-4 py-3 text-sm font-semibold"
              >
                Connect GitHub to continue
              </a>
            </div>
          ) : data ? (
            <>
              {!showPlans ? (
                <button
                  onClick={() => setShowPlans(true)}
                  className="bg-primary text-primary-foreground mt-6 inline-flex w-full items-center justify-center rounded-xl px-4 py-3 text-sm font-semibold"
                >
                  See Nepal plans
                </button>
              ) : (
                <>
                  <div className="mt-6 grid grid-cols-2 gap-2">
                    {(["monthly", "annual"] as const).map((item) => (
                      <button
                        key={item}
                        onClick={() => setPlan(item)}
                        className={`rounded-xl border p-3 text-left transition-colors ${plan === item ? "border-primary bg-primary/10" : "border-border bg-surface hover:bg-surface-2"}`}
                      >
                        <span className="block text-xs font-semibold">
                          {item === "monthly" ? "Monthly" : "Annual"}
                        </span>
                        <span className="text-primary mt-1 block text-lg font-semibold">
                          NPR {item === "monthly" ? "999" : "9,999"}
                        </span>
                      </button>
                    ))}
                  </div>

                  <div className="border-border bg-surface mt-5 rounded-xl border p-4">
                    <p className="text-muted-foreground text-[10px] font-mono uppercase tracking-[0.18em]">
                      Scan to pay NPR {selectedPlan.amountNpr.toLocaleString()}
                    </p>
                    <div className="mt-4 grid gap-4 sm:grid-cols-[160px_1fr] sm:items-center">
                      <div className="border-border bg-white rounded-xl border p-2">
                        <img
                          src={data.qr_url}
                          alt="eSewa payment QR code"
                          className="aspect-square w-full rounded-lg object-contain"
                        />
                      </div>
                      <div>
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-semibold">{data.display_name}</p>
                          <button
                            onClick={() => void copyName()}
                            className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-[11px]"
                          >
                            {copied ? (
                              <CheckCircle2 className="size-3.5 text-emerald-300" />
                            ) : (
                              <Copy className="size-3.5" />
                            )}
                            {copied ? "Copied" : "Copy"}
                          </button>
                        </div>
                        <p className="text-muted-foreground mt-3 text-xs leading-relaxed">
                          {data.instructions}
                        </p>
                      </div>
                    </div>
                  </div>

                  {active ? (
                    <div className="border-emerald-500/30 bg-emerald-500/10 mt-4 rounded-xl border p-4">
                      <p className="text-sm font-semibold text-emerald-300">
                        Payment approved. Your subscription is active.
                      </p>
                      <p className="text-muted-foreground mt-1 text-xs">
                        Plan: {data.subscription?.plan ?? data.submission?.plan ?? plan}.{" "}
                        {data.subscription?.active_until
                          ? `Active until ${new Date(data.subscription.active_until).toLocaleDateString()}.`
                          : ""}
                      </p>
                    </div>
                  ) : pending ? (
                    <div className="border-amber-500/30 bg-amber-500/10 mt-4 rounded-xl border p-4">
                      <p className="text-sm font-semibold text-amber-200">
                        Payment submitted for review.
                      </p>
                      <p className="text-muted-foreground mt-1 text-xs">
                        Reference: {data.submission?.transaction_reference}
                      </p>
                    </div>
                  ) : (
                    <div className="mt-5 space-y-3">
                      <label className="text-muted-foreground block text-[10px] font-mono uppercase tracking-[0.18em]">
                        eSewa transaction reference
                      </label>
                      <input
                        value={reference}
                        onChange={(event) => setReference(event.target.value)}
                        placeholder="Enter the reference from your receipt"
                        className="border-border bg-surface w-full rounded-xl border px-3.5 py-3 text-sm outline-none focus:border-primary"
                        autoComplete="off"
                      />
                      <label className="text-muted-foreground block text-[10px] font-mono uppercase tracking-[0.18em]">
                        Optional note
                      </label>
                      <textarea
                        value={note}
                        onChange={(event) => setNote(event.target.value)}
                        placeholder="Anything helpful for validation"
                        className="border-border bg-surface min-h-20 w-full resize-none rounded-xl border px-3.5 py-3 text-sm outline-none focus:border-primary"
                      />
                      <button
                        onClick={() => void submit()}
                        disabled={submitting || !reference.trim()}
                        className="bg-primary text-primary-foreground disabled:opacity-40 w-full rounded-xl px-4 py-3 text-sm font-semibold"
                      >
                        {submitting ? "Submitting…" : "I’ve paid — submit for validation"}
                      </button>
                    </div>
                  )}
                  {error && data && <p className="mt-3 text-xs text-red-300">{error}</p>}
                  <p className="text-muted-foreground mt-5 text-[10px] leading-relaxed">
                    Payments are manually reviewed. Do not send passwords, OTPs, or account
                    credentials. Keep your eSewa receipt until validation is complete.
                  </p>
                </>
              )}
            </>
          ) : null}
        </section>
      </div>
    </main>
  );
}
