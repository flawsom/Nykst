import { createHmac, timingSafeEqual } from "node:crypto";
import { CONTACT_EMAIL } from "./contact";

/**
 * The one mail transport: Resend.
 *
 * Sending: POST https://api.resend.com/emails with the server key. The key is
 * read from the environment and never leaves this module, never reaches a
 * customer page, and never appears in a log line.
 *
 * Receiving: Resend signs inbound webhooks with Svix headers. The signature is
 * verified over the raw body before anything is stored, and the message body is
 * then fetched from the Resend API by email id.
 *
 * A missing key is `not_configured`, never a silent success, so a stored contact
 * message is never reported to a visitor as a delivered one.
 */

export const RESEND_API_KEY_ENV = "RESEND_API_KEY";
export const RESEND_WEBHOOK_SECRET_ENV = "RESEND_WEBHOOK_SECRET";
export const CONTACT_MAIL_FROM_ENV = "CONTACT_MAIL_FROM";

export const RESEND_API_BASE = "https://api.resend.com";

export type MailDeliveryStatus = "sent" | "not_configured" | "failed";

export interface MailDelivery {
  status: MailDeliveryStatus;
  /** Provider side id when the send was accepted. Never shown to a customer. */
  id?: string;
  /** Short, non sensitive reason for the owner report. */
  detail?: string;
}

export interface ResendEnv {
  RESEND_API_KEY?: string | undefined;
  RESEND_WEBHOOK_SECRET?: string | undefined;
  CONTACT_MAIL_FROM?: string | undefined;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function resendConfigured(env: ResendEnv): boolean {
  return Boolean(text(env[RESEND_API_KEY_ENV]) && text(env[CONTACT_MAIL_FROM_ENV]));
}

export function resendWebhookConfigured(env: ResendEnv): boolean {
  return Boolean(text(env[RESEND_WEBHOOK_SECRET_ENV]));
}

/**
 * Send one plain text email through Resend.
 *
 * The recipient is always the single product address and is never taken from a
 * request. `replyTo` is the visitor's address so the owner can answer directly.
 * A non 2xx answer is a failure; the provider body is not stored or logged,
 * because provider errors can echo the payload.
 */
export async function sendResendEmail({
  env,
  subject,
  body,
  replyTo,
  fetchImpl = fetch,
  timeoutMs = 8000,
}: {
  env: ResendEnv;
  subject: string;
  body: string;
  replyTo?: string | undefined;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}): Promise<MailDelivery> {
  const key = text(env[RESEND_API_KEY_ENV]);
  const from = text(env[CONTACT_MAIL_FROM_ENV]);
  if (!key || !from) return { status: "not_configured" };

  try {
    const response = await fetchImpl(`${RESEND_API_BASE}/emails`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${key}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [CONTACT_EMAIL],
        subject,
        text: body,
        ...(replyTo ? { reply_to: [replyTo] } : {}),
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!response.ok) return { status: "failed", detail: `Resend responded ${response.status}.` };

    const payload = (await response.json().catch(() => ({}))) as { id?: unknown };
    const id = text(payload.id);
    return id ? { status: "sent", id } : { status: "sent" };
  } catch (cause) {
    return {
      status: "failed",
      detail: cause instanceof Error ? cause.name : "Resend request failed.",
    };
  }
}

export interface SvixHeaders {
  id: string;
  timestamp: string;
  signature: string;
}

/** Svix, and therefore Resend, sends these three headers on every webhook. */
export function readSvixHeaders(headers: Headers): SvixHeaders {
  return {
    id: text(headers.get("svix-id")),
    timestamp: text(headers.get("svix-timestamp")),
    signature: text(headers.get("svix-signature")),
  };
}

/** `whsec_...` secrets are base64 after the prefix; a bare base64 secret works too. */
function signingKey(secret: string): Buffer | null {
  const raw = secret.startsWith("whsec_") ? secret.slice("whsec_".length) : secret;
  try {
    const decoded = Buffer.from(raw, "base64");
    return decoded.length ? decoded : null;
  } catch {
    return null;
  }
}

/**
 * Verify a Resend (Svix) webhook signature over the exact raw body.
 *
 * An absent secret always fails closed. The signature header may carry several
 * space separated `v1,<base64>` candidates; any match passes. A timestamp older
 * than `toleranceSeconds` is rejected so a captured request cannot be replayed.
 */
export function verifyResendWebhook({
  rawBody,
  headers,
  secret,
  toleranceSeconds = 300,
  now = Date.now(),
}: {
  rawBody: string;
  headers: SvixHeaders;
  secret: string | null | undefined;
  toleranceSeconds?: number | null;
  now?: number;
}): boolean {
  const configured = text(secret);
  if (!configured || !headers.id || !headers.timestamp || !headers.signature) return false;

  if (toleranceSeconds !== null) {
    const sentAt = Number(headers.timestamp);
    if (!Number.isFinite(sentAt)) return false;
    if (Math.abs(now / 1000 - sentAt) > toleranceSeconds) return false;
  }

  const key = signingKey(configured);
  if (!key) return false;

  const expected = createHmac("sha256", key)
    .update(`${headers.id}.${headers.timestamp}.${rawBody}`, "utf8")
    .digest();

  for (const candidate of headers.signature.split(" ")) {
    const [version, value] = candidate.split(",");
    if (version !== "v1" || !value) continue;
    let supplied: Buffer;
    try {
      supplied = Buffer.from(value, "base64");
    } catch {
      continue;
    }
    if (supplied.length === expected.length && timingSafeEqual(expected, supplied)) return true;
  }
  return false;
}

export interface ResendEvent {
  type: string;
  createdAt: string;
  data: Record<string, unknown>;
}

/** Parse a verified Resend webhook body. Throws on malformed JSON. */
export function parseResendEvent(rawBody: string): ResendEvent {
  const parsed = JSON.parse(rawBody) as Record<string, unknown>;
  const data =
    parsed["data"] && typeof parsed["data"] === "object" && !Array.isArray(parsed["data"])
      ? (parsed["data"] as Record<string, unknown>)
      : {};
  return {
    type: text(parsed["type"]),
    createdAt: text(parsed["created_at"]),
    data,
  };
}

/** The reference the form puts in the subject, so a reply stays on the same case. */
export const CONTACT_REFERENCE_PATTERN = /NYKST-[A-HJ-NP-Z2-9]{8}/;

export function referenceFromSubject(subject: string): string | null {
  return CONTACT_REFERENCE_PATTERN.exec(subject)?.[0] ?? null;
}

export interface ReceivedEmail {
  id: string;
  from: string;
  to: string[];
  subject: string;
  text: string;
  messageId: string;
  receivedAt: string;
}

function stringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

/** Reduce an HTML only mail to readable text without style or script content. */
export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Resend webhooks carry metadata only, so the body is fetched by email id.
 * Returns null when the provider refuses, and never throws provider detail to
 * a caller that might render it.
 */
export async function fetchReceivedEmail({
  env,
  emailId,
  fetchImpl = fetch,
  timeoutMs = 8000,
}: {
  env: ResendEnv;
  emailId: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}): Promise<ReceivedEmail | null> {
  const key = text(env[RESEND_API_KEY_ENV]);
  if (!key || !emailId) return null;

  try {
    const response = await fetchImpl(
      `${RESEND_API_BASE}/emails/receiving/${encodeURIComponent(emailId)}`,
      {
        headers: { authorization: `Bearer ${key}` },
        signal: AbortSignal.timeout(timeoutMs),
      },
    );
    if (!response.ok) return null;

    const payload = (await response.json()) as Record<string, unknown>;
    const html = text(payload["html"]);
    const plain = text(payload["text"]);
    return {
      id: text(payload["id"]) || emailId,
      from: text(payload["from"]),
      to: stringList(payload["to"]),
      subject: text(payload["subject"]),
      // An HTML only email is reduced to readable text, never rendered.
      text: plain || htmlToText(html),
      messageId: text(payload["message_id"]),
      receivedAt: text(payload["created_at"]),
    };
  } catch {
    return null;
  }
}
