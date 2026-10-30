import { createHash, createHmac, timingSafeEqual } from "node:crypto";

/**
 * Razorpay signs the exact raw request body with the webhook secret and sends
 * the hex digest in `X-Razorpay-Signature`. This module deliberately keeps the
 * verification and normalization pure so the route and the tests share one
 * implementation.
 *
 * Nothing here stores a payload. Razorpay payloads can contain customer email,
 * phone, card metadata and notes, so only the identifiers and amounts needed
 * for reconciliation are extracted.
 */

export const RAZORPAY_WEBHOOK_SECRET_ENV = "RAZORPAY_WEBHOOK_SECRET";
export const RAZORPAY_SIGNATURE_HEADER = "x-razorpay-signature";
export const RAZORPAY_EVENT_ID_HEADER = "x-razorpay-event-id";

export type RazorpayWebhookCategory =
  "order" | "payment" | "subscription" | "refund" | "dispute" | "unsupported";

export interface RazorpayWebhookEvent {
  event: string;
  event_id?: string;
  payload?: Record<string, unknown>;
}

export interface RazorpayWebhookRecord {
  event_id: string;
  event_type: string;
  category: RazorpayWebhookCategory;
  status: "received" | "ignored";
  order_id: string | null;
  payment_id: string | null;
  subscription_id: string | null;
  amount: number | null;
  currency: string | null;
  reason: string;
  received_at: string;
}

export interface RazorpaySubscriptionState {
  subscriptionId: string;
  planId: string | null;
  status: string | null;
  currentEnd: string | null;
  paymentId: string | null;
  eventType: string;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function integer(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && Number.isInteger(value)) return value;
  return null;
}

/**
 * Verify a Razorpay webhook signature. An absent or blank secret always fails
 * closed, so a deployment that forgot the environment variable cannot accept
 * unsigned events.
 */
export function verifyRazorpayWebhookSignature(
  rawBody: string,
  signature: string | null | undefined,
  secret: string | null | undefined,
): boolean {
  const key = text(secret);
  const supplied = text(signature);
  if (!key || !supplied || !/^[a-f0-9]{64}$/i.test(supplied)) return false;

  const expected = createHmac("sha256", key).update(rawBody, "utf8").digest();
  const suppliedBuffer = Buffer.from(supplied, "hex");
  if (suppliedBuffer.length !== expected.length) return false;
  return timingSafeEqual(expected, suppliedBuffer);
}

/** Parse a verified webhook body. Throws on malformed JSON or a missing event. */
export function parseRazorpayWebhook(rawBody: string): RazorpayWebhookEvent {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    throw new Error("Webhook payload must be valid JSON.");
  }
  const root = object(parsed);
  const event = text(root["event"]);
  if (!event) throw new Error("Webhook payload is missing an event type.");
  const eventId = text(root["event_id"]);
  return {
    event,
    ...(eventId ? { event_id: eventId } : {}),
    payload: object(root["payload"]),
  };
}

/**
 * Razorpay retries deliveries, and the event id is the stable dedupe key. If a
 * delivery has no header and no body id, the body hash is deterministic and
 * still prevents a duplicate from activating twice.
 */
export function razorpayEventId(
  rawBody: string,
  headerValue: string | null | undefined,
  event?: RazorpayWebhookEvent,
): string {
  const fromHeader = text(headerValue);
  if (fromHeader) return fromHeader;
  const fromBody = text(event?.event_id);
  if (fromBody) return fromBody;
  return `body_${createHash("sha256").update(rawBody, "utf8").digest("hex")}`;
}

export function razorpayEventCategory(eventType: string): RazorpayWebhookCategory {
  if (eventType.startsWith("payment.dispute.")) return "dispute";
  if (eventType.startsWith("payment.")) return "payment";
  if (eventType.startsWith("order.")) return "order";
  if (eventType.startsWith("subscription.")) return "subscription";
  if (eventType.startsWith("refund.")) return "refund";
  return "unsupported";
}

function entityFor(event: RazorpayWebhookEvent, category: RazorpayWebhookCategory) {
  const payload = object(event.payload);
  const bucket =
    category === "payment" || category === "dispute"
      ? "payment"
      : category === "order"
        ? "order"
        : category === "subscription"
          ? "subscription"
          : category === "refund"
            ? "refund"
            : "";
  if (!bucket) return {};
  return object(object(payload[bucket])["entity"]);
}

/**
 * Build the only record Nykst stores for a verified event. No email, phone,
 * card, bank account or free-form notes field is copied. This record is for
 * reconciliation; the route applies access separately to a matching row.
 */
export function normalizeRazorpayWebhook(
  event: RazorpayWebhookEvent,
  eventId: string,
  receivedAt = new Date().toISOString(),
): RazorpayWebhookRecord {
  const category = razorpayEventCategory(event.event);
  const entity = entityFor(event, category);
  const id = text(entity["id"]);

  return {
    event_id: eventId,
    event_type: event.event,
    category,
    status: category === "unsupported" ? "ignored" : "received",
    order_id: text(entity["order_id"]) || (category === "order" ? id || null : null),
    payment_id: text(entity["payment_id"]) || (category === "payment" ? id || null : null),
    subscription_id:
      text(entity["subscription_id"]) || (category === "subscription" ? id || null : null),
    amount: integer(entity["amount"]) ?? integer(entity["amount_paid"]),
    currency: /^[A-Z]{3}$/.test(text(entity["currency"])) ? text(entity["currency"]) : null,
    reason:
      category === "unsupported"
        ? "Verified and recorded. This event type is not handled by Nykst."
        : "Verified and recorded. Access is applied only for a matching Nykst subscription.",
    received_at: receivedAt,
  };
}

/**
 * Extract the subscription state transition from a verified event. Only the
 * identifiers and dates needed to update one Nykst row are returned; the raw
 * payload is never passed to the database layer.
 */
export function razorpaySubscriptionState(
  event: RazorpayWebhookEvent,
): RazorpaySubscriptionState | null {
  if (!event.event.startsWith("subscription.")) return null;
  const payload = object(event.payload);
  const subscription = object(object(payload["subscription"])["entity"]);
  const payment = object(object(payload["payment"])["entity"]);
  const subscriptionId = text(subscription["id"]);
  if (!subscriptionId) return null;

  const seconds =
    integer(subscription["current_end"]) ??
    integer(subscription["end_at"]) ??
    integer(subscription["charge_at"]);
  return {
    subscriptionId,
    planId: text(subscription["plan_id"]) || null,
    status: text(subscription["status"]) || null,
    currentEnd:
      typeof seconds === "number" && seconds > 0 ? new Date(seconds * 1000).toISOString() : null,
    paymentId: text(payment["id"]) || null,
    eventType: event.event,
  };
}
