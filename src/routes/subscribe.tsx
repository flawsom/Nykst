import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  CalendarClock,
  CheckCircle2,
  CreditCard,
  Info,
  LockKeyhole,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { NykstBrand } from "@/components/brand/NykstLogo";
import { TRIAL_COPY, formatInr, type PlanId } from "@/lib/pricing";

type Plan = {
  id: PlanId;
  label: string;
  priceInr: number;
  amountPaise: number;
  period: "week" | "month" | "year";
  interval: 1;
  summary: string;
  refundDays: number | null;
  refundCopy: string;
  checkout: { state: "live" | "gated"; reason: string | null };
};

type PricingResponse = {
  currency: "INR";
  gstPercent: number;
  gstIncluded: boolean;
  trialDays: number;
  trialCopy: string;
  plans: Plan[];
  anyPlanLive: boolean;
  liveGateOpen: boolean;
};

const PERIOD_LABEL: Record<Plan["period"], string> = {
  week: "/week",
  month: "/month",
  year: "/year",
};

export const Route = createFileRoute("/subscribe")({
  head: () => ({
    meta: [
      { title: "Nykst Pro pricing · Weekly, Monthly, Annual" },
      {
        name: "description",
        content:
          "Nykst Pro pricing in INR: weekly 299, monthly 699, annual 4,999, GST included, with a 7-day free trial.",
      },
    ],
  }),
  component: SubscribePage,
});

function SubscribePage() {
  const [pricing, setPricing] = useState<PricingResponse | null>(null);
  const [selected, setSelected] = useState<PlanId>("monthly");
  const [error, setError] = useState("");

  useEffect(() => {
    let live = true;
    void fetch("/api/plans", { cache: "no-store" })
      .then(async (response) => {
        const body = (await response.json().catch(() => ({}))) as PricingResponse & {
          error?: string;
        };
        if (!response.ok) throw new Error(body.error || "Pricing is temporarily unavailable.");
        if (live) setPricing(body);
      })
      .catch((cause) => {
        if (live)
          setError(cause instanceof Error ? cause.message : "Pricing is temporarily unavailable.");
      });
    return () => {
      live = false;
    };
  }, []);

  const plan = pricing?.plans.find((item) => item.id === selected) ?? null;

  return (
    <main className="bg-background text-foreground min-h-screen">
      <header className="border-border bg-card/80 sticky top-0 z-20 flex items-center justify-between border-b px-4 py-3 backdrop-blur sm:px-6">
        <Link to="/" className="flex items-center gap-2.5">
          <NykstBrand subtitle="Pro" size={26} />
        </Link>
        <nav className="flex items-center gap-3 text-xs">
          <Link to="/billing" className="text-muted-foreground hover:text-foreground">
            Billing
          </Link>
          <Link to="/privacy" className="text-muted-foreground hover:text-foreground">
            Privacy and data
          </Link>
          <button
            onClick={() => {
              if (window.history.length > 1) window.history.back();
              else window.location.assign("/");
            }}
            className="text-muted-foreground hover:text-foreground flex items-center gap-1.5 rounded-lg px-2 py-1"
          >
            <ArrowLeft className="size-3.5" /> Back
          </button>
        </nav>
      </header>

      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
        <div className="max-w-3xl">
          <p className="text-primary font-mono text-[10px] tracking-[0.28em] uppercase">
            Nykst Pro pricing
          </p>
          <h1 className="text-gradient mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">
            One flat plan. No credit anxiety.
          </h1>
          <p className="text-muted-foreground mt-4 max-w-2xl text-sm leading-relaxed">
            Every Pro plan includes the same full system depth: dossiers, Before You Act evidence,
            the Safe Code Loop and the read-only MCP tools. Prices are in INR and include GST at 18
            percent.
          </p>
        </div>

        <div
          data-testid="trial-banner"
          className="border-primary/30 bg-primary/10 mt-6 flex flex-wrap items-start gap-3 rounded-2xl border px-4 py-3.5"
        >
          <Sparkles className="text-primary mt-0.5 size-4 shrink-0" />
          <div>
            <p className="text-sm font-semibold">7 days free on every plan</p>
            <p className="text-muted-foreground mt-1 text-xs leading-relaxed">{TRIAL_COPY}</p>
          </div>
        </div>

        {error ? (
          <p className="border-red-500/30 bg-red-500/10 mt-8 rounded-xl border px-4 py-3 text-sm text-red-300">
            {error}
          </p>
        ) : null}

        {!pricing && !error ? (
          <p className="text-muted-foreground mt-10 text-sm">Loading the plan registry…</p>
        ) : pricing ? (
          <>
            <div className="mt-8 grid gap-3 lg:grid-cols-3">
              {pricing.plans.map((item) => {
                const isSelected = item.id === selected;
                return (
                  <button
                    key={item.id}
                    type="button"
                    data-testid={`plan-${item.id}`}
                    aria-pressed={isSelected}
                    onClick={() => setSelected(item.id)}
                    className={`rounded-2xl border p-5 text-left transition-colors ${
                      isSelected
                        ? "border-primary/60 bg-primary/10"
                        : "border-border bg-card/80 hover:bg-surface-2"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-muted-foreground text-[10px] font-mono uppercase tracking-[0.2em]">
                          {item.label}
                        </p>
                        <p className="mt-2 text-3xl font-semibold tracking-tight">
                          {formatInr(item.priceInr)}
                          <span className="text-muted-foreground ml-1 text-xs font-normal">
                            {PERIOD_LABEL[item.period]}
                          </span>
                        </p>
                      </div>
                      {isSelected && <CheckCircle2 className="text-primary size-4" />}
                    </div>
                    <p className="text-muted-foreground mt-2 text-xs">{item.summary}</p>
                    <ul className="text-muted-foreground mt-4 space-y-1.5 text-[11px]">
                      <li className="flex items-start gap-1.5">
                        <CalendarClock className="mt-0.5 size-3 shrink-0" />
                        {pricing.trialDays} days free, then {formatInr(item.priceInr)}
                      </li>
                      <li className="flex items-start gap-1.5">
                        <ShieldCheck className="mt-0.5 size-3 shrink-0" />
                        {item.refundCopy}
                      </li>
                      <li className="flex items-start gap-1.5">
                        <CreditCard className="mt-0.5 size-3 shrink-0" />
                        GST {pricing.gstPercent}% included
                      </li>
                    </ul>
                  </button>
                );
              })}
            </div>

            <section className="mt-8 grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
              <div className="border-border bg-card/80 rounded-2xl border p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-base font-semibold">Start with {plan?.label ?? "a plan"}</h2>
                  <span className="border-border bg-surface rounded-full border px-2.5 py-1 font-mono text-[10px]">
                    {pricing.currency} · GST included
                  </span>
                </div>
                <p className="text-muted-foreground mt-3 text-xs leading-relaxed">
                  Price information is visible without signing in. When checkout is live, you will
                  be asked to sign in, choose a plan, and confirm the Razorpay checkout. No charge
                  is taken during the 7-day trial.
                </p>

                <div className="border-border bg-surface/70 mt-4 rounded-xl border px-4 py-3">
                  <div className="flex items-start gap-2">
                    <LockKeyhole className="text-muted-foreground mt-0.5 size-3.5 shrink-0" />
                    <div>
                      <p className="text-xs font-semibold">Checkout is gated in this build</p>
                      <p
                        data-testid="checkout-gate-reason"
                        className="text-muted-foreground mt-1 text-[11px] leading-relaxed"
                      >
                        {plan?.checkout.reason ?? "No plan is on sale until the live gate passes."}
                      </p>
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  data-testid="start-trial"
                  disabled
                  aria-disabled="true"
                  className="bg-primary text-primary-foreground mt-4 w-full cursor-not-allowed rounded-xl px-4 py-3 text-sm font-semibold opacity-40"
                >
                  Start 7-day trial
                </button>
                <p className="text-muted-foreground mt-2 text-[10px] leading-relaxed">
                  The button is disabled with a reason, not a fake success. It becomes live only
                  after the server-side order flow, signature verification, idempotent webhook and
                  the M2-09 gate are verified in test mode.
                </p>
              </div>

              <div className="border-border bg-card/80 rounded-2xl border p-5">
                <h2 className="text-sm font-semibold">What is not on sale yet</h2>
                <ul className="text-muted-foreground mt-3 space-y-2 text-[11px] leading-relaxed">
                  <li className="flex gap-2">
                    <Info className="mt-0.5 size-3 shrink-0" />
                    Weekly has no decided refund window (OD-15), so it is not on sale.
                  </li>
                  <li className="flex gap-2">
                    <Info className="mt-0.5 size-3 shrink-0" />
                    Razorpay plan ids must be recorded from the dashboard, not typed here.
                  </li>
                  <li className="flex gap-2">
                    <Info className="mt-0.5 size-3 shrink-0" />
                    GST treatment is proposed at 18 percent included and still needs a tax advisor.
                  </li>
                  <li className="flex gap-2">
                    <Info className="mt-0.5 size-3 shrink-0" />
                    Credential rotation must be confirmed by the account owner before live mode.
                  </li>
                </ul>
                <div className="border-border mt-4 border-t pt-3">
                  <Link
                    to="/billing"
                    className="text-primary text-xs font-semibold hover:underline"
                  >
                    Open billing and invoices
                  </Link>
                </div>
              </div>
            </section>

            <p className="text-muted-foreground mt-6 max-w-3xl text-[10px] leading-relaxed">
              The old NPR eSewa price is history only and is not a purchasable option. Existing
              manual eSewa subscribers are migrated only after the Razorpay international
              verification passes for Nepal, per Appendix E7 and OD-11.
            </p>
          </>
        ) : null}
      </div>
    </main>
  );
}
