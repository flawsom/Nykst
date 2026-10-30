import { createHmac, timingSafeEqual } from "node:crypto";
import { planById, resolveCheckout, type PlanId } from "@/lib/pricing";
import { registeredPlanIds } from "@/lib/pricing.server";
import { razorpayKeyMode, type RazorpayKeyMode } from "@/lib/razorpay-mode";
import type { CheckoutState } from "@/lib/pricing";

const RAZORPAY_API = "https://api.razorpay.com/v1";
const REQUEST_TIMEOUT_MS = 15_000;

export type RazorpayBillingPlan = Extract<PlanId, "monthly" | "annual">;

export interface RazorpayBillingConfig {
  keyId: string;
  keySecret: string;
  webhookSecret: string;
  mode: RazorpayKeyMode;
  liveMode: boolean;
  liveApproved: boolean;
  taxConfirmed: boolean;
  planIds: Partial<Record<PlanId, string | null>>;
}

export interface RazorpaySubscription {
  id: string;
  status: string;
  plan_id?: string | null;
  current_start?: number | null;
  current_end?: number | null;
  start_at?: number | null;
  charge_at?: number | null;
  end_at?: number | null;
  total_count?: number;
  paid_count?: number;
  remaining_count?: number;
}

function read(env: Record<string, string | undefined>, name: string) {
  return env[name]?.trim() ?? "";
}

/**
 * The key prefix, not a free-form flag, decides whether real money can move.
 * `RAZORPAY_LIVE_MODE=false` is a kill switch for live keys; it can never turn
 * a test key into a live checkout.
 */
export function billingConfig(
  env: Record<string, string | undefined> = process.env,
): RazorpayBillingConfig {
  const keyId = read(env, "RAZORPAY_KEY_ID");
  const mode = razorpayKeyMode(keyId);
  return {
    keyId,
    keySecret: read(env, "RAZORPAY_KEY_SECRET"),
    webhookSecret: read(env, "RAZORPAY_WEBHOOK_SECRET"),
    mode,
    liveMode: mode === "live" && read(env, "RAZORPAY_LIVE_MODE") !== "false",
    liveApproved: read(env, "NYKST_LIVE_PAYMENTS_APPROVED") === "true",
    taxConfirmed: read(env, "NYKST_GST_CONFIRMED") === "true",
    planIds: registeredPlanIds(env),
  };
}

export function isRazorpayBillingPlan(value: unknown): value is RazorpayBillingPlan {
  return value === "monthly" || value === "annual";
}

export function checkoutStateFor(
  planId: PlanId,
  config: RazorpayBillingConfig = billingConfig(),
): CheckoutState {
  return resolveCheckout({
    planId,
    providerConfigured: Boolean(config.keyId && config.keySecret),
    liveApproved: config.liveApproved,
    liveMode: config.liveMode,
    razorpayPlanId: config.planIds[planId] ?? null,
    taxConfirmed: config.taxConfirmed,
    checkoutImplemented: true,
  });
}

export class RazorpayRequestError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "RazorpayRequestError";
    this.status = status;
  }
}

function descriptionFrom(body: unknown): string | null {
  if (!body || typeof body !== "object" || !("error" in body)) return null;
  const error = (body as { error?: { description?: unknown } }).error;
  return typeof error?.description === "string" ? error.description.slice(0, 300) : null;
}

async function request<T>(
  path: string,
  init: RequestInit,
  config: RazorpayBillingConfig,
): Promise<T> {
  if (!config.keyId || !config.keySecret)
    throw new RazorpayRequestError(503, "Payment provider credentials are not configured.");

  const auth = Buffer.from(`${config.keyId}:${config.keySecret}`).toString("base64");
  let response: Response;
  try {
    response = await fetch(`${RAZORPAY_API}${path}`, {
      ...init,
      headers: {
        authorization: `Basic ${auth}`,
        "content-type": "application/json",
        ...(init.headers ?? {}),
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new RazorpayRequestError(502, "The payment provider did not respond.");
  }

  const raw = await response.text();
  let body: unknown = null;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    body = null;
  }
  if (!response.ok) {
    const description = descriptionFrom(body);
    throw new RazorpayRequestError(
      response.status,
      description ?? "The payment provider rejected the request.",
    );
  }
  return body as T;
}

/**
 * A subscription starts after the seven-day trial. Razorpay authorizes the
 * mandate at Checkout but does not charge until `start_at`. The cycle count is
 * finite because Razorpay requires one; monthly runs one year and annual runs
 * five years before the customer can start a fresh subscription.
 */
export function trialEndsAt(now = Date.now()) {
  return new Date(now + 7 * 24 * 60 * 60 * 1000).toISOString();
}

export async function createRazorpaySubscription(
  plan: RazorpayBillingPlan,
  user: { id: number | string },
  config: RazorpayBillingConfig = billingConfig(),
) {
  const planId = config.planIds[plan];
  if (!planId) throw new RazorpayRequestError(409, "This plan is not configured.");

  const trialEnd = trialEndsAt();
  const subscription = await request<RazorpaySubscription>(
    "/subscriptions",
    {
      method: "POST",
      body: JSON.stringify({
        plan_id: planId,
        total_count: plan === "monthly" ? 12 : 5,
        start_at: Math.floor(new Date(trialEnd).getTime() / 1000),
        customer_notify: 1,
        notes: {
          nykst_user_id: String(user.id),
          nykst_plan: plan,
        },
      }),
    },
    config,
  );
  return { subscription, trialEnd };
}

export async function fetchRazorpaySubscription(
  subscriptionId: string,
  config: RazorpayBillingConfig = billingConfig(),
) {
  if (!/^sub_[A-Za-z0-9]+$/.test(subscriptionId))
    throw new RazorpayRequestError(400, "Invalid subscription id.");
  return request<RazorpaySubscription>(
    `/subscriptions/${encodeURIComponent(subscriptionId)}`,
    { method: "GET" },
    config,
  );
}

export async function cancelRazorpaySubscription(
  subscriptionId: string,
  config: RazorpayBillingConfig = billingConfig(),
) {
  if (!/^sub_[A-Za-z0-9]+$/.test(subscriptionId))
    throw new RazorpayRequestError(400, "Invalid subscription id.");
  return request<RazorpaySubscription>(
    `/subscriptions/${encodeURIComponent(subscriptionId)}/cancel`,
    {
      method: "POST",
      body: JSON.stringify({ cancel_at_cycle_end: 0 }),
    },
    config,
  );
}

/** Razorpay's subscription Checkout formula is payment id, a pipe, then subscription id. */
export function subscriptionPaymentSignature(
  paymentId: string,
  subscriptionId: string,
  keySecret: string,
) {
  return createHmac("sha256", keySecret).update(`${paymentId}|${subscriptionId}`, "utf8").digest();
}

export function verifySubscriptionPaymentSignature(
  paymentId: string,
  subscriptionId: string,
  signature: string | null | undefined,
  keySecret: string | null | undefined,
): boolean {
  const secret = keySecret?.trim() ?? "";
  const supplied = signature?.trim() ?? "";
  if (!paymentId || !subscriptionId || !secret || !/^[a-f0-9]{64}$/i.test(supplied)) return false;
  const expected = subscriptionPaymentSignature(paymentId, subscriptionId, secret);
  const received = Buffer.from(supplied, "hex");
  return received.length === expected.length && timingSafeEqual(received, expected);
}

/** Razorpay reports Unix seconds. Keep the existing date if the event is older. */
export function subscriptionEndDate(
  subscription: Pick<RazorpaySubscription, "current_end" | "end_at" | "charge_at">,
  fallback: string | null,
): string | null {
  const seconds = subscription.current_end ?? subscription.end_at ?? subscription.charge_at;
  if (typeof seconds === "number" && Number.isFinite(seconds) && seconds > 0)
    return new Date(seconds * 1000).toISOString();
  return fallback;
}

export function laterDate(left: string | null, right: string | null): string | null {
  if (!left) return right;
  if (!right) return left;
  const leftTime = Date.parse(left);
  const rightTime = Date.parse(right);
  if (!Number.isFinite(leftTime)) return right;
  if (!Number.isFinite(rightTime)) return left;
  return leftTime >= rightTime ? left : right;
}

export function isActiveSubscriptionStatus(status: string | null | undefined) {
  return status === "authenticated" || status === "active";
}

export function planLabel(plan: PlanId) {
  return planById(plan).label;
}
