import { createHmac } from "node:crypto";
import { describe, expect, test } from "bun:test";
import { safeGithubReturnTo } from "../src/lib/integrations/github";
import { razorpayKeyMode } from "../src/lib/razorpay-mode";
import {
  billingConfig,
  checkoutStateFor,
  createRazorpaySubscription,
  isRazorpayBillingPlan,
  laterDate,
  subscriptionEndDate,
  trialEndsAt,
  verifySubscriptionPaymentSignature,
} from "../src/lib/razorpay.server";

const LIVE_ENV = {
  RAZORPAY_KEY_ID: "rzp_live_fixture",
  RAZORPAY_KEY_SECRET: "fixture-secret",
  RAZORPAY_WEBHOOK_SECRET: "fixture-webhook",
  RAZORPAY_LIVE_MODE: "true",
  NYKST_LIVE_PAYMENTS_APPROVED: "true",
  NYKST_GST_CONFIRMED: "true",
  RAZORPAY_PLAN_ID_MONTHLY: "plan_monthly123456",
  RAZORPAY_PLAN_ID_ANNUAL: "plan_annual123456",
};

describe("Razorpay modes and billing gates", () => {
  test("derives mode from the key prefix", () => {
    expect(razorpayKeyMode("rzp_live_abc")).toBe("live");
    expect(razorpayKeyMode("rzp_test_abc")).toBe("test");
    expect(razorpayKeyMode("unknown")).toBe("unknown");
    expect(razorpayKeyMode("")).toBe("unknown");
  });

  test("only monthly and annual are sellable plans", () => {
    expect(isRazorpayBillingPlan("monthly")).toBe(true);
    expect(isRazorpayBillingPlan("annual")).toBe(true);
    expect(isRazorpayBillingPlan("weekly")).toBe(false);
    expect(isRazorpayBillingPlan("team")).toBe(false);
  });

  test("live keys open checkout only with founder approval and GST confirmation", () => {
    const live = billingConfig(LIVE_ENV);
    expect(live.mode).toBe("live");
    expect(live.liveMode).toBe(true);
    expect(checkoutStateFor("monthly", live).state).toBe("live");
    expect(checkoutStateFor("annual", live).state).toBe("live");
    expect(checkoutStateFor("weekly", live).state).toBe("gated");
    expect(
      checkoutStateFor("monthly", billingConfig({ ...LIVE_ENV, NYKST_GST_CONFIRMED: "" })).state,
    ).toBe("gated");
    expect(
      checkoutStateFor("monthly", billingConfig({ ...LIVE_ENV, NYKST_LIVE_PAYMENTS_APPROVED: "" }))
        .state,
    ).toBe("gated");
  });

  test("test keys and the live kill switch cannot open live checkout", () => {
    const testKey = billingConfig({ ...LIVE_ENV, RAZORPAY_KEY_ID: "rzp_test_fixture" });
    expect(testKey.mode).toBe("test");
    expect(testKey.liveMode).toBe(false);
    expect(checkoutStateFor("monthly", testKey).state).toBe("gated");
    const killed = billingConfig({ ...LIVE_ENV, RAZORPAY_LIVE_MODE: "false" });
    expect(killed.liveMode).toBe(false);
    expect(checkoutStateFor("monthly", killed).state).toBe("gated");
  });
});

describe("Razorpay subscription creation", () => {
  test("sends a seven-day start and no customer or card data", async () => {
    const original = globalThis.fetch;
    let captured: { url: string; init?: RequestInit } | null = null;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      captured = { url: String(input), init };
      return new Response(JSON.stringify({ id: "sub_fixture", status: "created" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;

    try {
      const result = await createRazorpaySubscription(
        "monthly",
        { id: 123 },
        billingConfig(LIVE_ENV),
      );
      expect(result.subscription.id).toBe("sub_fixture");
      expect(captured?.url).toBe("https://api.razorpay.com/v1/subscriptions");
      const body = JSON.parse(String(captured?.init?.body)) as {
        plan_id: string;
        total_count: number;
        start_at: number;
        notes: Record<string, string>;
      };
      expect(body.plan_id).toBe("plan_monthly123456");
      expect(body.total_count).toBe(12);
      expect(body.start_at).toBeGreaterThan(Math.floor((Date.now() + 6 * 86_400_000) / 1000));
      expect(body.notes).toEqual({ nykst_user_id: "123", nykst_plan: "monthly" });
      expect(JSON.stringify(body)).not.toContain("fixture-secret");
    } finally {
      globalThis.fetch = original;
    }
  });
});

describe("Razorpay subscription payment verification", () => {
  const paymentId = "pay_fixture123";
  const subscriptionId = "sub_fixture123";
  const secret = "fixture-secret";

  test("accepts the subscription formula and rejects tampering", () => {
    const signature = createHmac("sha256", secret)
      .update(`${paymentId}|${subscriptionId}`, "utf8")
      .digest("hex");
    expect(verifySubscriptionPaymentSignature(paymentId, subscriptionId, signature, secret)).toBe(
      true,
    );
    expect(
      verifySubscriptionPaymentSignature(paymentId, subscriptionId, "0".repeat(64), secret),
    ).toBe(false);
    expect(
      verifySubscriptionPaymentSignature(paymentId, subscriptionId, signature, "other-secret"),
    ).toBe(false);
    expect(verifySubscriptionPaymentSignature(paymentId, subscriptionId, null, secret)).toBe(false);
    expect(verifySubscriptionPaymentSignature(paymentId, subscriptionId, signature, "")).toBe(
      false,
    );
  });
});

describe("Razorpay billing dates", () => {
  test("a trial ends seven days from now", () => {
    const now = Date.parse("2026-10-30T00:00:00.000Z");
    expect(trialEndsAt(now)).toBe("2026-11-06T00:00:00.000Z");
  });

  test("keeps the later date and converts Razorpay seconds", () => {
    expect(laterDate("2026-10-01T00:00:00.000Z", "2026-11-01T00:00:00.000Z")).toBe(
      "2026-11-01T00:00:00.000Z",
    );
    expect(laterDate(null, "2026-11-01T00:00:00.000Z")).toBe("2026-11-01T00:00:00.000Z");
    expect(subscriptionEndDate({ current_end: 1_893_456_000 }, null)).toBe(
      new Date(1_893_456_000_000).toISOString(),
    );
    expect(
      subscriptionEndDate({ current_end: null, end_at: null }, "2026-11-01T00:00:00.000Z"),
    ).toBe("2026-11-01T00:00:00.000Z");
  });
});

describe("GitHub return paths", () => {
  test("accepts only a same-origin absolute path", () => {
    expect(safeGithubReturnTo("/subscribe")).toBe("/subscribe");
    expect(safeGithubReturnTo("/subscribe?plan=monthly#start")).toBe(
      "/subscribe?plan=monthly#start",
    );
    expect(safeGithubReturnTo("https://evil.example")).toBeNull();
    expect(safeGithubReturnTo("//evil.example")).toBeNull();
    expect(safeGithubReturnTo("/\\evil.example")).toBeNull();
    expect(safeGithubReturnTo("/%5Cevil.example")).toBeNull();
    expect(safeGithubReturnTo("javascript:alert(1)")).toBeNull();
    expect(safeGithubReturnTo("subscribe")).toBeNull();
    expect(safeGithubReturnTo("")).toBeNull();
  });
});
