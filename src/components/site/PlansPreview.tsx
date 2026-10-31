import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, CheckCircle2, CreditCard, MessageSquare } from "lucide-react";
import { PRICING, formatInr, refundCopy, type PlanId } from "@/lib/pricing";
import { fetchWithTimeout } from "@/lib/fetch-with-timeout";

type PublicPlan = {
  id: PlanId;
  label: string;
  priceInr: number;
  period: "week" | "month" | "year";
  summary: string;
  refundCopy: string;
  checkout: { state: "live" | "gated" };
};

type PublicPricing = {
  plans: PublicPlan[];
  anyPlanLive: boolean;
  trialDays: number;
  gstPercent: number;
};

const fallbackPlans: PublicPlan[] = PRICING.plans
  .filter((plan) => plan.id === "monthly" || plan.id === "annual")
  .map((plan) => ({
    ...plan,
    refundCopy: refundCopy(plan),
    checkout: { state: "live" },
  }));

export function PlansPreview({ onContact }: { onContact?: () => void }) {
  const [pricing, setPricing] = useState<PublicPricing | null>(null);

  useEffect(() => {
    let active = true;
    void fetchWithTimeout("/api/plans", { cache: "no-store" }, 10_000)
      .then((response) => (response.ok ? response.json() : null))
      .then((body: PublicPricing | null) => {
        if (active && body) setPricing(body);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  const plans = useMemo(() => {
    const live = pricing?.plans.filter((plan) => plan.id === "monthly" || plan.id === "annual");
    return live?.length ? live : fallbackPlans;
  }, [pricing]);

  const monthly = plans.find((plan) => plan.id === "monthly");
  const annual = plans.find((plan) => plan.id === "annual");
  const annualSaving =
    monthly && annual ? Math.round((1 - annual.priceInr / (monthly.priceInr * 12)) * 100) : null;
  const trialDays = pricing?.trialDays ?? PRICING.trialDays;
  const gstPercent = pricing?.gstPercent ?? PRICING.gstPercent;
  const anyPlanLive = pricing?.anyPlanLive ?? true;

  return (
    <div className="relative grid gap-8 lg:grid-cols-[0.8fr_1.2fr] lg:items-start">
      <div className="lg:sticky lg:top-24">
        <p className="text-primary font-mono text-[10px] tracking-[0.28em] uppercase">Plans</p>
        <h2 className="font-display mt-3 max-w-md text-3xl leading-[1.08] tracking-tight sm:text-4xl">
          Start with the map. Keep the memory.
        </h2>
        <p className="text-muted-foreground mt-4 max-w-md text-sm leading-relaxed">
          One plan for the whole system. Connect a repository, see what your next change touches,
          and keep the reasoning attached. Start with a {trialDays}-day trial.
        </p>
        <div className="mt-6 grid gap-2.5">
          {[
            "Every file, connection and data resource in one map",
            "Exact importers, routes and tests for a change",
            "SQL columns and API contracts checked against the code",
            "Eleven read-only tools in your coding assistant",
          ].map((item) => (
            <p key={item} className="text-muted-foreground flex items-start gap-2 text-xs">
              <CheckCircle2 className="text-primary mt-0.5 size-3.5 shrink-0" />
              {item}
            </p>
          ))}
        </div>
        <div className="border-border bg-surface/60 mt-7 rounded-xl border p-4">
          <p className="text-sm font-semibold">Need a team plan or an invoice?</p>
          <p className="text-muted-foreground mt-1 text-[11px] leading-relaxed">
            Tell us the number of people, repositories and security requirements. We will answer
            with a real plan, not a sales sequence.
          </p>
          {onContact && (
            <button
              type="button"
              onClick={onContact}
              className="border-border bg-card hover:bg-surface-2 mt-3 inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-[11px] font-semibold transition-colors"
            >
              <MessageSquare className="size-3.5" /> Talk to us
            </button>
          )}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {[monthly, annual].filter(Boolean).map((plan) => {
          const isAnnual = plan!.id === "annual";
          return (
            <article
              key={plan!.id}
              data-testid={`landing-plan-${plan!.id}`}
              className={`relative flex flex-col rounded-2xl border p-5 sm:p-6 ${
                isAnnual ? "border-primary/45 bg-primary/[0.055]" : "border-border bg-card/70"
              }`}
            >
              {isAnnual && (
                <span className="bg-primary text-primary-foreground absolute -top-3 left-5 inline-flex items-center rounded-full px-2.5 py-1 font-mono text-[9px] font-bold tracking-[0.12em] uppercase">
                  Best value
                </span>
              )}
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-primary font-mono text-[10px] tracking-[0.22em] uppercase">
                    {plan!.label}
                  </p>
                  <div className="mt-2 flex items-baseline gap-1.5">
                    <span className="font-display text-3xl tracking-tight">
                      {formatInr(plan!.priceInr)}
                    </span>
                    <span className="text-muted-foreground text-[11px]">/{plan!.period}</span>
                  </div>
                </div>
                {isAnnual && annualSaving !== null && (
                  <span className="border-primary/30 bg-primary/10 text-primary rounded-full border px-2 py-1 font-mono text-[9px]">
                    SAVE {annualSaving}%
                  </span>
                )}
              </div>
              <p className="text-muted-foreground mt-3 min-h-10 text-xs leading-relaxed">
                {isAnnual
                  ? "The whole year, with the most room to keep history."
                  : "The full product, month by month, with no long commitment."}
              </p>
              <ul className="mt-4 space-y-2 border-t border-border/70 pt-4 text-[11px]">
                <li className="flex gap-2">
                  <CheckCircle2 className="text-primary mt-0.5 size-3.5 shrink-0" />
                  <span>
                    {trialDays}-day trial. Card authorized now, charged on day {trialDays + 1}{" "}
                    unless you cancel.
                  </span>
                </li>
                <li className="flex gap-2">
                  <CheckCircle2 className="text-primary mt-0.5 size-3.5 shrink-0" />
                  <span>{plan!.refundCopy}.</span>
                </li>
                <li className="flex gap-2">
                  <CheckCircle2 className="text-primary mt-0.5 size-3.5 shrink-0" />
                  <span>Prices include {gstPercent}% GST.</span>
                </li>
              </ul>
              <div className="mt-auto pt-5">
                <Link
                  to="/subscribe"
                  className={`inline-flex w-full items-center justify-center gap-1.5 rounded-xl px-4 py-3.5 text-xs font-semibold transition-colors ${
                    isAnnual
                      ? "bg-primary text-primary-foreground hover:bg-primary-glow"
                      : "border-border bg-surface hover:bg-surface-2 border"
                  }`}
                >
                  {isAnnual ? "Start annual trial" : "Start monthly trial"}
                  <ArrowRight className="size-3.5" />
                </Link>
              </div>
            </article>
          );
        })}
        <p className="text-muted-foreground sm:col-span-2 flex items-start gap-2 text-[10px] leading-relaxed">
          <CreditCard className="text-primary mt-0.5 size-3.5 shrink-0" />
          {anyPlanLive
            ? `Razorpay handles the payment method. Nykst never sees your card details. Cancel any time before day ${trialDays + 1}.`
            : "Checkout is not open yet. Talk to us and we will tell you when access opens."}
        </p>
      </div>
    </div>
  );
}
