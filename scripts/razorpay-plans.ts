/**
 * Create or reuse the Razorpay plans Nykst sells.
 *
 * Run with `bun run razorpay:plans`. The script uses the server-only Razorpay
 * keys from the environment, prints only plan ids and non-secret plan fields,
 * and never prints the key or secret. It is safe to run again: an existing plan
 * with the same amount, currency, period, and interval is reused.
 *
 * The weekly plan is deliberately absent. Its refund window is undecided, so it
 * must not be sellable yet.
 */

type RazorpayPlan = {
  id?: string;
  period?: string;
  interval?: number;
  item?: { amount?: number; currency?: string; name?: string };
};

const API = "https://api.razorpay.com/v1";
const PLANS = [
  {
    key: "monthly",
    label: "Nykst Pro Monthly",
    description: "Nykst Pro, 7-day trial, then monthly billing. GST included.",
    amount: 69_900,
    period: "monthly",
    interval: 1,
  },
  {
    key: "annual",
    label: "Nykst Pro Annual",
    description: "Nykst Pro, 7-day trial, then annual billing. GST included.",
    amount: 499_900,
    period: "yearly",
    interval: 1,
  },
] as const;

function config() {
  const keyId = process.env["RAZORPAY_KEY_ID"]?.trim();
  const keySecret = process.env["RAZORPAY_KEY_SECRET"]?.trim();
  if (!keyId || !keySecret)
    throw new Error("RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET must be set for this command.");
  return { keyId, keySecret, auth: Buffer.from(`${keyId}:${keySecret}`).toString("base64") };
}

async function request<T>(path: string, init: RequestInit & { auth: string }): Promise<T> {
  const { auth, ...rest } = init;
  const response = await fetch(`${API}${path}`, {
    ...rest,
    headers: {
      authorization: `Basic ${auth}`,
      "content-type": "application/json",
      ...(rest.headers ?? {}),
    },
    signal: AbortSignal.timeout(15_000),
  });
  const text = await response.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  if (!response.ok) {
    const description =
      body && typeof body === "object" && "error" in body
        ? (body as { error?: { description?: string } }).error?.description
        : null;
    throw new Error(
      `Razorpay ${response.status}: ${description ?? "the request was rejected without a description"}`,
    );
  }
  return body as T;
}

function matches(plan: RazorpayPlan, expected: (typeof PLANS)[number]) {
  return (
    plan.period === expected.period &&
    plan.interval === expected.interval &&
    plan.item?.amount === expected.amount &&
    plan.item?.currency === "INR"
  );
}

const { keyId, auth } = config();
const mode = keyId.startsWith("rzp_live_")
  ? "live"
  : keyId.startsWith("rzp_test_")
    ? "test"
    : "unknown";
if (mode === "unknown")
  throw new Error("RAZORPAY_KEY_ID does not look like a Razorpay test or live key.");

const listed = await request<{ items?: RazorpayPlan[] }>("/plans?count=100", {
  method: "GET",
  auth,
});
const existing = listed.items ?? [];
const result: Record<string, { id: string; created: boolean; amount: number; period: string }> = {};

for (const expected of PLANS) {
  const found = existing.find((plan) => matches(plan, expected));
  if (found?.id) {
    result[expected.key] = {
      id: found.id,
      created: false,
      amount: expected.amount,
      period: expected.period,
    };
    continue;
  }
  const created = await request<RazorpayPlan>("/plans", {
    method: "POST",
    auth,
    body: JSON.stringify({
      period: expected.period,
      interval: expected.interval,
      item: {
        name: expected.label,
        amount: expected.amount,
        currency: "INR",
        description: expected.description,
      },
    }),
  });
  if (!created.id) throw new Error(`Razorpay did not return an id for the ${expected.key} plan.`);
  result[expected.key] = {
    id: created.id,
    created: true,
    amount: expected.amount,
    period: expected.period,
  };
}

console.log(JSON.stringify({ mode, plans: result }, null, 2));
