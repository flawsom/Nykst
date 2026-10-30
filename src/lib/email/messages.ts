import { CONTACT_EMAIL, REPLY_PROMISE, mailtoHref } from "../contact";
import type { ContactInput } from "../contact.server";
import { CANONICAL_ORIGIN, formatEmailDate, renderEmail, type EmailDetail } from "./template";

export interface ContactConfirmation {
  reference: string;
  input: ContactInput;
  receivedAt: string;
}

export interface GithubSignIn {
  email: string;
  user: { id: number; login: string; name?: string | null };
  signedInAt: string;
  userAgent?: string | null;
}

/**
 * A compact, honest description of the browser. The raw user agent is never
 * sent or stored; it can carry device identifiers and is not useful to a person.
 */
export function describeUserAgent(value: string | null | undefined): string {
  const ua = (value ?? "").trim();
  if (!ua) return "Unknown browser";

  const browser = /Edg\//i.test(ua)
    ? "Microsoft Edge"
    : /OPR\//i.test(ua)
      ? "Opera"
      : /Chrome\//i.test(ua)
        ? "Chrome"
        : /Firefox\//i.test(ua)
          ? "Firefox"
          : /Safari\//i.test(ua)
            ? "Safari"
            : /curl\//i.test(ua) || /Wget\//i.test(ua)
              ? "A command-line client"
              : "A browser";

  const platform = /Windows NT/i.test(ua)
    ? "Windows"
    : /Android/i.test(ua)
      ? "Android"
      : /iPhone|iPad|iPod/i.test(ua)
        ? "iOS"
        : /Mac OS X/i.test(ua)
          ? "macOS"
          : /Linux/i.test(ua)
            ? "Linux"
            : "";

  return platform ? `${browser} on ${platform}` : browser;
}

function greeting(name: string | null | undefined, login: string): string {
  const clean = name?.trim();
  return clean || `@${login}`;
}

/** The sender's copy of a contact message. This is a receipt, not marketing. */
export function composeContactConfirmation(notification: ContactConfirmation) {
  const { reference, input, receivedAt } = notification;
  const promise = REPLY_PROMISE[input.topic];
  const received = formatEmailDate(receivedAt);
  const subject = `Nykst received your message [${reference}]`;
  const text = [
    `Hi ${input.name},`,
    ``,
    `Your message reached Nykst. This is your receipt.`,
    ``,
    `Reference: ${reference}`,
    `Topic: ${input.topic}`,
    `Received: ${received}`,
    ``,
    `We confirm receipt within ${promise.acknowledge}, and you get a decision or a next step within ${promise.decision}.`,
    ``,
    `Your message:`,
    input.message,
    ``,
    `Reply to this email to add anything to the request. Keep the reference above if you follow up another way.`,
    ``,
    `Nykst · software intelligence for real repositories`,
    CANONICAL_ORIGIN,
    `Privacy: ${CANONICAL_ORIGIN}/privacy`,
  ].join("\n");

  const details: EmailDetail[] = [
    { label: "Reference", value: reference, mono: true },
    { label: "Topic", value: input.topic },
    { label: "Received", value: received },
  ];

  const html = renderEmail({
    preheader: `Your message is saved. Reference ${reference}.`,
    kicker: "Message received",
    title: "Your message is with us.",
    intro: [
      `Hi ${input.name},`,
      `Your message reached Nykst. This is your receipt, with the exact reference to keep if you follow up.`,
    ],
    details,
    quote: { label: "Your message", text: input.message },
    cta: { label: "Open Nykst", href: CANONICAL_ORIGIN },
    secondary: { label: "Add to this request by email", href: mailtoHref(input.topic, reference) },
    note: `We confirm receipt within ${promise.acknowledge}, and you get a decision or a next step within ${promise.decision}. Reply to this email to add anything to the request.`,
    footerReason:
      "You are receiving this one-time receipt because you submitted the contact form at nykst.unifies.codes.",
  });

  return { subject, text, html };
}

/** A security notice for a GitHub sign-in, with only the details a person needs. */
export function composeGithubSignIn(signIn: GithubSignIn) {
  const who = greeting(signIn.user.name, signIn.user.login);
  const when = formatEmailDate(signIn.signedInAt);
  const browser = describeUserAgent(signIn.userAgent);
  const subject = "New sign-in to Nykst";
  const text = [
    `Hi ${who},`,
    ``,
    `Your Nykst account was signed in with GitHub just now.`,
    ``,
    `GitHub account: @${signIn.user.login}`,
    `When: ${when}`,
    `Browser: ${browser}`,
    `Method: GitHub OAuth`,
    ``,
    `If this was you, no action is needed.`,
    `If this wasn't you, secure your GitHub account now: https://github.com/settings/security`,
    `Then contact us at ${CONTACT_EMAIL}.`,
    ``,
    `Nykst never asks for your GitHub password.`,
    ``,
    `Nykst · software intelligence for real repositories`,
    CANONICAL_ORIGIN,
    `Privacy: ${CANONICAL_ORIGIN}/privacy`,
  ].join("\n");

  const details: EmailDetail[] = [
    { label: "GitHub account", value: `@${signIn.user.login}`, mono: true },
    { label: "When", value: when },
    { label: "Browser", value: browser },
    { label: "Method", value: "GitHub OAuth" },
  ];

  const html = renderEmail({
    preheader: `New sign-in from ${browser}. If this wasn't you, secure your GitHub account.`,
    kicker: "Account security",
    title: "New sign-in to Nykst",
    intro: [
      `Hi ${who},`,
      `Your Nykst account was signed in with GitHub just now. These are the details we can verify.`,
    ],
    details,
    alert: {
      title: "If this wasn't you",
      body: "Secure your GitHub account first, then contact us. Nykst never asks for your GitHub password.",
    },
    cta: { label: "Open Nykst", href: CANONICAL_ORIGIN },
    secondary: {
      label: "Review GitHub security settings",
      href: "https://github.com/settings/security",
    },
    note: `Questions? Reply to this email or write to ${CONTACT_EMAIL}. This security notice is sent for every successful GitHub sign-in.`,
    footerReason:
      "You are receiving this security notice because your GitHub account was used to sign in to Nykst.",
  });

  return { subject, text, html };
}
