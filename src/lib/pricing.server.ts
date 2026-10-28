import { publicPricing, type PlanId } from "./pricing";

/**
 * Server-only plan registry. Credentials and plan ids are read from server
 * environment storage and never returned to the browser. A plan id is only
 * accepted when it looks like a dashboard-created Razorpay plan id, so a
 * placeholder such as "plan_TBD" cannot accidentally open a checkout.
 */
function readEnv(env: Record<string, string | undefined>, name: string) {
  return env[name]?.trim() || "";
}

export function registeredPlanIds(env: Record<string, string | undefined>) {
  const read = (name: string) => {
    const value = readEnv(env, name);
    return /^plan_[A-Za-z0-9]{6,}$/.test(value) ? value : null;
  };
  return {
    weekly: read("RAZORPAY_PLAN_ID_WEEKLY"),
    monthly: read("RAZORPAY_PLAN_ID_MONTHLY"),
    annual: read("RAZORPAY_PLAN_ID_ANNUAL"),
  } satisfies Partial<Record<PlanId, string | null>>;
}

/**
 * The public pricing payload. `checkoutImplemented` is deliberately false in
 * this build: the order and webhook flow is specified in M2-02 and has not been
 * verified against test mode, so no plan may be presented as purchasable.
 */
export function planRegistry(env: Record<string, string | undefined> = process.env) {
  const keyId = readEnv(env, "RAZORPAY_KEY_ID");
  const keySecret = readEnv(env, "RAZORPAY_KEY_SECRET");
  return publicPricing({
    providerConfigured: Boolean(keyId && keySecret),
    liveApproved: readEnv(env, "NYKST_LIVE_PAYMENTS_APPROVED") === "true",
    liveMode: readEnv(env, "RAZORPAY_LIVE_MODE") === "true",
    planIds: registeredPlanIds(env),
    taxConfirmed: readEnv(env, "NYKST_GST_CONFIRMED") === "true",
    checkoutImplemented: false,
  });
}

/** The fake gateway flag is never exposed; this exists to document the gate. */
export const CHECKOUT_IMPLEMENTED = false;
