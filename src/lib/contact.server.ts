import { createHash, randomInt } from "node:crypto";
import { sendResendEmail } from "./resend.server";
import {
  CONTACT_EMAIL,
  CONTACT_TOPICS,
  REPLY_PROMISE,
  isContactTopic,
  replyPromiseText,
  type ContactTopic,
} from "./contact";

/**
 * Server side of the one contact path.
 *
 * The rules live here, not in the route, so the same rules can be tested
 * without a database: what a valid message is, how often one sender may write,
 * what a reference looks like, and what the owner notification says.
 *
 * A stored message is not a delivered message. `deliverNotification` reports
 * exactly which of the two happened, and the route never tells a visitor that
 * mail was sent when it was not.
 */

export const CONTACT_MESSAGE_MAX = 4000;
export const CONTACT_NAME_MAX = 120;
export const CONTACT_EMAIL_MAX = 200;

/** Five messages per sender email and five per network address, per hour. */
export const CONTACT_RATE_LIMIT = { windowMinutes: 60, maxPerSender: 5, maxPerNetwork: 5 } as const;

export const CONTACT_MAIL_ENDPOINT_ENV = "CONTACT_MAIL_ENDPOINT";
export const CONTACT_MAIL_TOKEN_ENV = "CONTACT_MAIL_TOKEN";
export const CONTACT_MAIL_FROM_ENV = "CONTACT_MAIL_FROM";

export interface ContactInput {
  name: string;
  email: string;
  topic: ContactTopic;
  message: string;
}

export type ContactValidation = { ok: true; value: ContactInput } | { ok: false; errors: string[] };

function text(value: unknown, limit: number): string {
  return typeof value === "string" ? value.trim().slice(0, limit) : "";
}

/** A name is a single line. Control characters never reach a mail header. */
function singleLine(value: string): string {
  let out = "";
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0;
    out += code < 32 || code === 127 ? " " : character;
  }
  return out.replace(/\s+/g, " ").trim();
}

/**
 * Validate a raw request body. The honeypot field is accepted and ignored:
 * a filled honeypot is treated as a spam submission, reported as a generic
 * validation failure so a bot gets no signal about which field caught it.
 */
export function validateContactInput(body: Record<string, unknown>): ContactValidation {
  const errors: string[] = [];
  const name = singleLine(text(body["name"], CONTACT_NAME_MAX));
  const email = text(body["email"], CONTACT_EMAIL_MAX).toLowerCase();
  const topic = text(body["topic"], 60);
  const message = text(body["message"], CONTACT_MESSAGE_MAX);
  const honeypot = text(body["website"], 200);

  if (honeypot) return { ok: false, errors: ["Please send the form again."] };
  if (!name) errors.push("Please add your name.");
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
    errors.push("Please add a valid email address.");
  if (!isContactTopic(topic)) errors.push("Please choose what your message is about.");
  if (message.length < 10) errors.push("Please add a little detail so we can help.");

  if (!errors.length && isContactTopic(topic)) {
    return { ok: true, value: { name, email, topic, message } };
  }
  return { ok: false, errors: errors.length ? errors : ["Please send the form again."] };
}

/** What the rate limit check needs, so the decision stays pure and testable. */
export function rateLimitDecision(counts: {
  sender: number;
  network: number;
}): { allowed: true } | { allowed: false; reason: string } {
  if (counts.sender >= CONTACT_RATE_LIMIT.maxPerSender)
    return {
      allowed: false,
      reason: `You have sent ${CONTACT_RATE_LIMIT.maxPerSender} messages in the last hour. Please email ${CONTACT_EMAIL} instead, or try again later.`,
    };
  if (counts.network >= CONTACT_RATE_LIMIT.maxPerNetwork)
    return {
      allowed: false,
      reason: `This network has sent ${CONTACT_RATE_LIMIT.maxPerNetwork} messages in the last hour. Please email ${CONTACT_EMAIL} instead, or try again later.`,
    };
  return { allowed: true };
}

/** A stable, non-reversible network identifier. The raw address is never stored. */
export function hashNetworkAddress(address: string): string {
  return createHash("sha256").update(`nykst-contact:${address}`, "utf8").digest("hex").slice(0, 32);
}

/** Read the caller address from the standard proxy headers. */
export function requestNetworkAddress(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return (
    forwarded ||
    headers.get("cf-connecting-ip")?.trim() ||
    headers.get("x-real-ip")?.trim() ||
    "unknown"
  );
}

/** Human readable reference. No ambiguous characters, fixed shape. */
const REFERENCE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function newContactReference(): string {
  let body = "";
  for (let index = 0; index < 8; index += 1) {
    body += REFERENCE_ALPHABET[randomInt(REFERENCE_ALPHABET.length)];
  }
  return `NYKST-${body}`;
}

export function isContactReference(value: string): boolean {
  return /^NYKST-[A-HJ-NP-Z2-9]{8}$/.test(value);
}

export interface ContactNotification {
  reference: string;
  input: ContactInput;
  receivedAt: string;
}

/** The owner notification. Contains what is needed to reply, nothing else. */
export function composeNotification(notification: ContactNotification) {
  const { reference, input, receivedAt } = notification;
  const promise = REPLY_PROMISE[input.topic];
  return {
    subject: `[${reference}] ${input.topic} from ${input.name}`,
    text: [
      `New ${input.topic} message.`,
      ``,
      `Reference: ${reference}`,
      `Received: ${receivedAt}`,
      `Name: ${input.name}`,
      `Reply to: ${input.email}`,
      ``,
      `Message:`,
      input.message,
      ``,
      `Reply promise: acknowledge within ${promise.acknowledge}, decision or next step within ${promise.decision}.`,
      `Topics in use: ${CONTACT_TOPICS.join(", ")}.`,
    ].join("\n"),
    replyTo: input.email,
  };
}

export type MailStatus = "sent" | "not_configured" | "failed";

export interface MailResult {
  status: MailStatus;
  detail?: string;
}

export interface MailTransportEnv {
  RESEND_API_KEY?: string | undefined;
  CONTACT_MAIL_ENDPOINT?: string | undefined;
  CONTACT_MAIL_TOKEN?: string | undefined;
  CONTACT_MAIL_FROM?: string | undefined;
}

export function mailTransportConfigured(env: MailTransportEnv): boolean {
  const resend = Boolean(env.RESEND_API_KEY?.trim() && env[CONTACT_MAIL_FROM_ENV]?.trim());
  const relay = Boolean(
    env[CONTACT_MAIL_ENDPOINT_ENV]?.trim() && env[CONTACT_MAIL_FROM_ENV]?.trim(),
  );
  return resend || relay;
}

/**
 * Send the owner notification through Resend when it is configured, and through
 * the provider neutral HTTPS relay otherwise.
 *
 * Resend sends `from`, `to`, `subject`, `text` and `reply_to` to its own API. The
 * relay path stays for deployments that front another provider: it receives a
 * small JSON body with `to`, `from`, `replyTo`, `subject`, `text`, `reference`
 * and `topic`. Either way the recipient is always the single product address and
 * is never taken from the request.
 *
 * An unconfigured transport is reported as `not_configured`, never as success,
 * and a failed send is reported as `failed`. In both cases the visitor is told
 * the message was stored but not emailed, and is given a working mail link.
 */
export async function deliverContactNotification({
  env,
  notification,
  fetchImpl = fetch,
  timeoutMs = 8000,
}: {
  env: MailTransportEnv;
  notification: ContactNotification;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}): Promise<MailResult> {
  const endpoint = env[CONTACT_MAIL_ENDPOINT_ENV]?.trim();
  const from = env[CONTACT_MAIL_FROM_ENV]?.trim();
  const token = env[CONTACT_MAIL_TOKEN_ENV]?.trim();
  if (!from) return { status: "not_configured" };

  const composed = composeNotification(notification);

  // Resend is the configured transport for this product. The generic relay is
  // only used when no Resend key is present, so there is never a second send.
  if (env.RESEND_API_KEY?.trim()) {
    const delivery = await sendResendEmail({
      env: { RESEND_API_KEY: env.RESEND_API_KEY, CONTACT_MAIL_FROM: from },
      subject: composed.subject,
      body: composed.text,
      replyTo: composed.replyTo,
      fetchImpl,
      timeoutMs,
    });
    if (delivery.status === "sent") return { status: "sent" };
    if (delivery.status === "not_configured") return { status: "not_configured" };
    return { status: "failed", detail: delivery.detail ?? "The mail service did not accept it." };
  }

  if (!endpoint) return { status: "not_configured" };

  try {
    const response = await fetchImpl(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        to: CONTACT_EMAIL,
        from,
        replyTo: composed.replyTo,
        subject: composed.subject,
        text: composed.text,
        reference: notification.reference,
        topic: notification.input.topic,
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) return { status: "failed", detail: `Relay responded ${response.status}.` };
    return { status: "sent" };
  } catch (cause) {
    return {
      status: "failed",
      detail: cause instanceof Error ? cause.name : "Relay request failed.",
    };
  }
}

/** Copy shown to the visitor after storage, chosen by what actually happened. */
export function confirmationCopy(topic: ContactTopic, mailStatus: MailStatus) {
  if (mailStatus === "sent")
    return `Your message is with us. ${replyPromiseText(topic)} Keep the reference if you follow up.`;
  if (mailStatus === "not_configured")
    return `Your message is saved with this reference, but our team notification is not set up, so nobody has been alerted yet. To be sure it reaches us, email ${CONTACT_EMAIL} with the same text and this reference.`;
  return `Your message is saved with this reference, but our team notification did not go through. Please email ${CONTACT_EMAIL} with the same text and this reference so it is not missed.`;
}
