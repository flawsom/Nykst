/**
 * The single plan registry for Nykst Pro, per Appendix M0-04.
 *
 * Prices are INR, in paise for the payment server and in whole rupees for
 * display. GST at 18 percent is included in the advertised amount and remains
 * subject to tax advisor confirmation before a live checkout. No Razorpay plan
 * id is stored here, ever: a real plan id comes from the dashboard or server
 * environment storage, and a plan without one stays gated.
 */

export type PlanId = "weekly" | "monthly" | "annual";

export interface PricingPlan {
  id: PlanId;
  label: string;
  priceInr: number;
  amountPaise: number;
  period: "week" | "month" | "year";
  interval: 1;
  /** Refund window in days after the first charge, or null when not decided. */
  refundDays: number | null;
  summary: string;
}

export const TRIAL_DAYS = 7;

export const TRIAL_COPY =
  "Try Pro free for 7 days. No charge during trial. Cancel anytime during trial. You will be charged on day 8 if you do not cancel.";

export const PRICING = {
  currency: "INR" as const,
  gstPercent: 18,
  gstIncluded: true,
  trialDays: TRIAL_DAYS,
  plans: [
    {
      id: "weekly",
      label: "Weekly",
      priceInr: 299,
      amountPaise: 29_900,
      period: "week",
      interval: 1,
      refundDays: null,
      summary: "A short evaluation week",
    },
    {
      id: "monthly",
      label: "Monthly",
      priceInr: 699,
      amountPaise: 69_900,
      period: "month",
      interval: 1,
      refundDays: 7,
      summary: "Full system depth, month by month",
    },
    {
      id: "annual",
      label: "Annual",
      priceInr: 4_999,
      amountPaise: 499_900,
      period: "year",
      interval: 1,
      refundDays: 14,
      summary: "For teams staying a while",
    },
  ] satisfies PricingPlan[],
} as const;

export function planById(id: PlanId): PricingPlan {
  return PRICING.plans.find((plan) => plan.id === id) ?? PRICING.plans[1]!;
}

export function formatInr(amount: number) {
  return `INR ${amount.toLocaleString("en-IN")}`;
}

export function formatPaise(paise: number) {
  return `INR ${(paise / 100).toLocaleString("en-IN")}`;
}

export interface CheckoutInput {
  planId: PlanId;
  /** A Razorpay key id and secret are both present in server storage. */
  providerConfigured: boolean;
  /** The founder signed off the M2-09 live gate in the build record. */
  liveApproved: boolean;
  /** RAZORPAY_LIVE_MODE is true; test mode is the default. */
  liveMode: boolean;
  /** The real Razorpay plan id recorded from the dashboard. */
  razorpayPlanId: string | null;
  /** A tax advisor confirmed the GST treatment. */
  taxConfirmed: boolean;
  /** A checkout handler is actually implemented and tested in this build. */
  checkoutImplemented: boolean;
}

export interface CheckoutState {
  state: "live" | "gated";
  reason: string | null;
}

/**
 * A plan may be shown as purchasable only when every gate passes. The order
 * matters: the specific, fixable blocker is reported first, never a generic
 * "coming soon".
 */
export function resolveCheckout(input: CheckoutInput): CheckoutState {
  const plan = planById(input.planId);
  if (plan.refundDays === null)
    return {
      state: "gated",
      reason: "The weekly refund window is not decided (OD-15), so the weekly plan is not on sale.",
    };
  if (!input.checkoutImplemented)
    return {
      state: "gated",
      reason:
        "Checkout is not enabled in this build. Plans are shown for evaluation; no payment can be taken yet.",
    };
  if (!input.liveApproved)
    return {
      state: "gated",
      reason:
        "Live payments are off until the M2-09 gate is signed off: credential rotation, real plan ids, tax confirmation, and the test-mode suite.",
    };
  if (!input.providerConfigured)
    return {
      state: "gated",
      reason: "The payment provider credentials are not configured in server storage.",
    };
  if (!input.liveMode)
    return {
      state: "gated",
      reason: "The payment provider is in test mode. Live checkout is disabled.",
    };
  if (!input.razorpayPlanId)
    return {
      state: "gated",
      reason: "Plan not yet activated: no Razorpay plan id is recorded for this plan.",
    };
  if (!input.taxConfirmed)
    return {
      state: "gated",
      reason: "GST treatment is pending tax advisor confirmation, so checkout stays closed.",
    };
  return { state: "live", reason: null };
}

export interface PublicPlan extends PricingPlan {
  checkout: CheckoutState;
  /** Display copy for the refund window, including the undecided state. */
  refundCopy: string;
}

/** The public payload never explains internal gates such as OD-15 or M2-09. */
function publicCheckout(state: CheckoutState): CheckoutState {
  return state.state === "live" ? state : { state: "gated", reason: "Checkout is not open yet." };
}

export function refundCopy(plan: PricingPlan) {
  return plan.refundDays === null
    ? "Refund window not decided"
    : `${plan.refundDays}-day money-back window after the first charge`;
}

/** Never include a Razorpay plan id, key, or secret in this payload. */
export function publicPricing(input: {
  providerConfigured: boolean;
  liveApproved: boolean;
  liveMode: boolean;
  planIds: Partial<Record<PlanId, string | null>>;
  taxConfirmed: boolean;
  checkoutImplemented: boolean;
}) {
  return {
    currency: PRICING.currency,
    gstPercent: PRICING.gstPercent,
    gstIncluded: PRICING.gstIncluded,
    trialDays: PRICING.trialDays,
    trialCopy: TRIAL_COPY,
    plans: PRICING.plans.map((plan) => ({
      ...plan,
      refundCopy: refundCopy(plan),
      checkout: publicCheckout(
        resolveCheckout({
          planId: plan.id,
          providerConfigured: input.providerConfigured,
          liveApproved: input.liveApproved,
          liveMode: input.liveMode,
          razorpayPlanId: input.planIds[plan.id] ?? null,
          taxConfirmed: input.taxConfirmed,
          checkoutImplemented: input.checkoutImplemented,
        }),
      ),
    })),
    anyPlanLive: PRICING.plans.some(
      (plan) =>
        resolveCheckout({
          planId: plan.id,
          providerConfigured: input.providerConfigured,
          liveApproved: input.liveApproved,
          liveMode: input.liveMode,
          razorpayPlanId: input.planIds[plan.id] ?? null,
          taxConfirmed: input.taxConfirmed,
          checkoutImplemented: input.checkoutImplemented,
        }).state === "live",
    ),
    liveGateOpen: input.liveApproved && input.taxConfirmed && input.checkoutImplemented,
  } as const;
}
