import { CONTACT_EMAIL } from "../contact";
import { sendResendEmail, type MailDelivery, type ResendEnv } from "../resend.server";
import {
  composeContactConfirmation,
  composeGithubSignIn,
  type ContactConfirmation,
  type GithubSignIn,
} from "./messages";

/**
 * Transactional delivery. Both functions are deliberately best-effort: a mail
 * failure must never lose a stored contact row or block a GitHub sign-in.
 */
export async function deliverContactConfirmation({
  env,
  notification,
  fetchImpl = fetch,
  timeoutMs = 8000,
}: {
  env: ResendEnv;
  notification: ContactConfirmation;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}): Promise<MailDelivery> {
  const message = composeContactConfirmation(notification);
  return sendResendEmail({
    env,
    to: notification.input.email,
    subject: message.subject,
    body: message.text,
    html: message.html,
    replyTo: CONTACT_EMAIL,
    idempotencyKey: `contact-receipt-${notification.reference}`,
    fetchImpl,
    timeoutMs,
  });
}

export async function deliverGithubSignIn({
  env,
  signIn,
  fetchImpl = fetch,
  timeoutMs = 3500,
}: {
  env: ResendEnv;
  signIn: GithubSignIn;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}): Promise<MailDelivery> {
  if (!signIn.email.trim())
    return { status: "not_configured", detail: "No verified GitHub email." };
  const message = composeGithubSignIn(signIn);
  const sentAt = Date.parse(signIn.signedInAt);
  return sendResendEmail({
    env,
    to: signIn.email,
    subject: message.subject,
    body: message.text,
    html: message.html,
    replyTo: CONTACT_EMAIL,
    idempotencyKey: `github-signin-${signIn.user.id}-${Number.isFinite(sentAt) ? sentAt : Date.now()}`,
    fetchImpl,
    timeoutMs,
  });
}
