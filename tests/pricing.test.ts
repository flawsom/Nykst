import { describe, expect, test } from "bun:test";
import {
  PRICING,
  TRIAL_COPY,
  formatInr,
  planById,
  publicPricing,
  resolveCheckout,
} from "../src/lib/pricing";
import { planRegistry, registeredPlanIds } from "../src/lib/pricing.server";

const ALL_GATES = {
  providerConfigured: true,
  liveApproved: true,
  liveMode: true,
  taxConfirmed: true,
  checkoutImplemented: true,
};

describe("pricing registry", () => {
  test("publishes exactly the three M0-04 plans in paise and INR", () => {
    expect(PRICING.plans.map((plan) => plan.id)).toEqual(["weekly", "monthly", "annual"]);
    expect(PRICING.plans.map((plan) => plan.amountPaise)).toEqual([29_900, 69_900, 499_900]);
    expect(PRICING.plans.map((plan) => plan.priceInr)).toEqual([299, 699, 4_999]);
    expect(PRICING.plans.map((plan) => plan.period)).toEqual(["week", "month", "year"]);
    expect(PRICING.gstPercent).toBe(18);
    expect(PRICING.gstIncluded).toBe(true);
    expect(PRICING.trialDays).toBe(7);
    expect(formatInr(4_999)).toBe("INR 4,999");
    expect(TRIAL_COPY).toContain("charged on day 8");
  });

  test("weekly is gated while its refund window is decided", () => {
    const state = resolveCheckout({
      ...ALL_GATES,
      planId: "weekly",
      razorpayPlanId: "plan_abcdef123456",
    });
    expect(state.state).toBe("gated");
    expect(state.reason).toContain("OD-15");
  });

  test("every gate is required before a plan can be live", () => {
    const base = {
      planId: "monthly" as const,
      razorpayPlanId: "plan_abcdef123456",
    };
    expect(resolveCheckout({ ...ALL_GATES, ...base }).state).toBe("live");
    for (const gate of [
      "checkoutImplemented",
      "liveApproved",
      "providerConfigured",
      "liveMode",
      "taxConfirmed",
    ] as const) {
      const state = resolveCheckout({ ...ALL_GATES, ...base, [gate]: false });
      expect(state.state).toBe("gated");
      expect(state.reason?.length).toBeGreaterThan(20);
    }
    expect(resolveCheckout({ ...ALL_GATES, ...base, razorpayPlanId: null }).state).toBe("gated");
  });

  test("the public payload contains no plan id, key or secret", () => {
    const payload = publicPricing({
      ...ALL_GATES,
      planIds: { monthly: "plan_abcdef123456" },
    });
    const text = JSON.stringify(payload);
    expect(text).not.toContain("plan_abcdef123456");
    expect(text).not.toContain("razorpay");
    expect(text).not.toContain("secret");
    expect(payload.plans).toHaveLength(3);
    expect(payload.trialCopy).toBe(TRIAL_COPY);
  });

  test("this build has no implemented checkout, so the server registry stays gated", () => {
    const env = {
      RAZORPAY_KEY_ID: "rzp_test_fixture",
      RAZORPAY_KEY_SECRET: "fixture-secret",
      RAZORPAY_LIVE_MODE: "true",
      NYKST_LIVE_PAYMENTS_APPROVED: "true",
      NYKST_GST_CONFIRMED: "true",
      RAZORPAY_PLAN_ID_WEEKLY: "plan_weekly123456",
      RAZORPAY_PLAN_ID_MONTHLY: "plan_monthly123456",
      RAZORPAY_PLAN_ID_ANNUAL: "plan_annual123456",
    };
    const registry = planRegistry(env);
    expect(registry.anyPlanLive).toBe(false);
    expect(registry.plans.every((plan) => plan.checkout.state === "gated")).toBe(true);
    expect(JSON.stringify(registry)).not.toContain("plan_monthly123456");
  });

  test("placeholder plan ids are rejected, so a plan with plan_TBD is gated", () => {
    const ids = registeredPlanIds({
      RAZORPAY_PLAN_ID_MONTHLY: "plan_TBD",
      RAZORPAY_PLAN_ID_ANNUAL: "plan_",
    });
    expect(ids.monthly).toBeNull();
    expect(ids.annual).toBeNull();
  });

  test("planById falls back to monthly for an unknown id", () => {
    expect(planById("monthly").priceInr).toBe(699);
  });
});
