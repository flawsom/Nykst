/**
 * One contact surface for the whole product.
 *
 * Every page, form and email link reads the address and the reply promise from
 * here, so a second address or a second promise cannot appear by accident.
 * This module is imported by client components, so it must never read
 * environment variables or hold a secret.
 */

export const CONTACT_EMAIL = "sibaprasadpanda56@gmail.com";

export const CONTACT_TOPICS = [
  "Plans and access",
  "Partnerships",
  "Privacy request",
  "Support",
] as const;

export type ContactTopic = (typeof CONTACT_TOPICS)[number];

export function isContactTopic(value: unknown): value is ContactTopic {
  return typeof value === "string" && (CONTACT_TOPICS as readonly string[]).includes(value);
}

export interface ReplyPromise {
  /** When the visitor hears back that the message arrived. */
  acknowledge: string;
  /** When the visitor hears a decision or a concrete next step. */
  decision: string;
}

/**
 * The promise shown on the form itself, per topic. Partnerships keep their own
 * longer window; everything else answers within two business days.
 */
export const REPLY_PROMISE: Record<ContactTopic, ReplyPromise> = {
  "Plans and access": { acknowledge: "2 business days", decision: "30 days" },
  Partnerships: { acknowledge: "3 business days", decision: "10 business days" },
  "Privacy request": { acknowledge: "2 business days", decision: "30 days" },
  Support: { acknowledge: "2 business days", decision: "30 days" },
};

/** Plain sentence for the form and the confirmation screen. */
export function replyPromiseText(topic: ContactTopic): string {
  const promise = REPLY_PROMISE[topic];
  return `We confirm we received it within ${promise.acknowledge}, and you get a decision or a next step within ${promise.decision}.`;
}

/** A working email action, so no visitor is left with a promise and no way to reach us. */
export function mailtoHref(topic?: ContactTopic, reference?: string): string {
  const subject = topic ? `Nykst ${topic.toLowerCase()}` : "Nykst enquiry";
  const body = reference ? `Reference: ${reference}\n\n` : "";
  return `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}${
    body ? `&body=${encodeURIComponent(body)}` : ""
  }`;
}
