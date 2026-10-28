import { createHmac } from "node:crypto";
import { describe, expect, test } from "bun:test";
import {
  normalizeRazorpayWebhook,
  parseRazorpayWebhook,
  razorpayEventCategory,
  razorpayEventId,
  verifyRazorpayWebhookSignature,
} from "../src/lib/razorpay-webhook.server";

const SECRET = "fixture-webhook-secret-not-live";

function sign(body: string, secret = SECRET) {
  return createHmac("sha256", secret).update(body, "utf8").digest("hex");
}

const paymentBody = JSON.stringify({
  event: "payment.captured",
  payload: {
    payment: {
      entity: {
        id: "pay_fixture123",
        order_id: "order_fixture123",
        amount: 69900,
        currency: "INR",
        email: "customer@example.com",
        contact: "9876543210",
        notes: { internal: "do not store" },
        card: { last4: "1234", network: "visa" },
      },
    },
  },
});

describe("Razorpay webhook verification", () => {
  test("accepts the exact signed body and rejects tampering", () => {
    const signature = sign(paymentBody);
    expect(verifyRazorpayWebhookSignature(paymentBody, signature, SECRET)).toBe(true);
    expect(verifyRazorpayWebhookSignature(`${paymentBody} `, signature, SECRET)).toBe(false);
    expect(verifyRazorpayWebhookSignature(paymentBody, "0".repeat(64), SECRET)).toBe(false);
  });

  test("fails closed when the secret or signature is absent", () => {
    expect(verifyRazorpayWebhookSignature(paymentBody, sign(paymentBody), "")).toBe(false);
    expect(verifyRazorpayWebhookSignature(paymentBody, null, SECRET)).toBe(false);
    expect(verifyRazorpayWebhookSignature(paymentBody, "not-hex", SECRET)).toBe(false);
  });

  test("rejects malformed JSON and a missing event type", () => {
    expect(() => parseRazorpayWebhook("{")).toThrow("valid JSON");
    expect(() => parseRazorpayWebhook(JSON.stringify({ payload: {} }))).toThrow(
      "missing an event type",
    );
  });
});

describe("Razorpay webhook normalization", () => {
  test("keeps reconciliation fields and drops customer and card data", () => {
    const event = parseRazorpayWebhook(paymentBody);
    const record = normalizeRazorpayWebhook(event, "evt_fixture", "2026-10-28T00:00:00.000Z");
    expect(record).toMatchObject({
      event_id: "evt_fixture",
      event_type: "payment.captured",
      category: "payment",
      status: "received",
      order_id: "order_fixture123",
      payment_id: "pay_fixture123",
      amount: 69900,
      currency: "INR",
    });
    const text = JSON.stringify(record);
    expect(text).not.toContain("customer@example.com");
    expect(text).not.toContain("9876543210");
    expect(text).not.toContain("last4");
    expect(text).not.toContain("do not store");
    expect(record.reason).toContain("No checkout activation");
  });

  test("maps order and subscription events to the right identifiers", () => {
    const order = parseRazorpayWebhook(
      JSON.stringify({
        event: "order.paid",
        payload: {
          order: { entity: { id: "order_abc", amount: 29900, currency: "INR" } },
        },
      }),
    );
    expect(normalizeRazorpayWebhook(order, "evt_order")).toMatchObject({
      category: "order",
      order_id: "order_abc",
      subscription_id: null,
      amount: 29900,
    });

    const subscription = parseRazorpayWebhook(
      JSON.stringify({
        event: "subscription.charged",
        payload: {
          subscription: {
            entity: {
              id: "sub_abc",
              order_id: "order_sub",
              amount: 499900,
              currency: "INR",
            },
          },
        },
      }),
    );
    expect(normalizeRazorpayWebhook(subscription, "evt_sub")).toMatchObject({
      category: "subscription",
      subscription_id: "sub_abc",
      order_id: "order_sub",
      amount: 499900,
    });
  });

  test("records unsupported events as ignored, never as handled", () => {
    const event = parseRazorpayWebhook(
      JSON.stringify({ event: "settlement.processed", payload: { settlement: { entity: {} } } }),
    );
    const record = normalizeRazorpayWebhook(event, "evt_unknown");
    expect(record.category).toBe("unsupported");
    expect(record.status).toBe("ignored");
    expect(record.reason).toContain("not handled");
  });

  test("classifies dispute events before generic payment events", () => {
    expect(razorpayEventCategory("payment.dispute.created")).toBe("dispute");
    expect(razorpayEventCategory("payment.captured")).toBe("payment");
    expect(razorpayEventCategory("refund.processed")).toBe("refund");
    expect(razorpayEventCategory("engage.balance.low_balance")).toBe("unsupported");
  });

  test("event id prefers the header, then the body, then a body hash", () => {
    const event = parseRazorpayWebhook(paymentBody);
    expect(razorpayEventId(paymentBody, "evt_header", event)).toBe("evt_header");
    expect(razorpayEventId(paymentBody, null, { ...event, event_id: "evt_body" })).toBe("evt_body");
    const hashed = razorpayEventId(paymentBody, null, event);
    expect(hashed).toMatch(/^body_[a-f0-9]{64}$/);
    expect(hashed).toBe(razorpayEventId(paymentBody, null, event));
  });
});
