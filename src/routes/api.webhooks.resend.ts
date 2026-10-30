import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  fetchReceivedEmail,
  parseResendEvent,
  readSvixHeaders,
  referenceFromSubject,
  RESEND_API_KEY_ENV,
  RESEND_WEBHOOK_SECRET_ENV,
  resendWebhookConfigured,
  verifyResendWebhook,
} from "@/lib/resend.server";

/**
 * Resend inbound mail receiver.
 *
 * Order of operations: verify the Svix signature over the raw body, ignore every
 * event that is not `email.received`, fetch the message body from Resend, then
 * store one row. Providers retry a non 2xx answer, and `resend_email_id` is
 * unique, so a retry can never store the same message twice.
 *
 * The endpoint never logs a sender address, a subject or a body. Only the
 * stored reference and the outcome are logged.
 */

const MAX_BODY_BYTES = 512_000;

function fail(message: string, status: number) {
  return Response.json({ error: message }, { status, headers: { "cache-control": "no-store" } });
}

export const Route = createFileRoute("/api/webhooks/resend")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const declaredLength = Number(request.headers.get("content-length") ?? "0");
        if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES)
          return fail("Payload too large.", 413);

        const rawBody = await request.text();
        if (rawBody.length > MAX_BODY_BYTES) return fail("Payload too large.", 413);

        // Receiving needs both the signing secret and an API key to fetch the
        // body. A missing key is a configuration fault, not a bad signature,
        // so it gets its own plain answer.
        if (!resendWebhookConfigured(process.env) || !process.env[RESEND_API_KEY_ENV]?.trim())
          return fail("Inbound mail is not configured.", 503);

        const verified = verifyResendWebhook({
          rawBody,
          headers: readSvixHeaders(request.headers),
          secret: process.env[RESEND_WEBHOOK_SECRET_ENV],
        });
        if (!verified) return fail("Invalid webhook signature.", 401);

        let event;
        try {
          event = parseResendEvent(rawBody);
        } catch {
          return fail("Invalid webhook payload.", 400);
        }

        // Every other Resend event is acknowledged and ignored, so a delivery
        // receipt never looks like a failure and never triggers a provider retry.
        if (event.type !== "email.received") return Response.json({ ok: true, ignored: true });

        const emailId = typeof event.data["email_id"] === "string" ? event.data["email_id"] : "";
        if (!emailId) return Response.json({ ok: true, ignored: true, reason: "no email id" });

        const email = await fetchReceivedEmail({ env: process.env, emailId });
        if (!email) return fail("Could not read the received message.", 502);

        const reference = referenceFromSubject(email.subject);
        try {
          const { error } = await supabaseAdmin.from("contact_replies").upsert(
            {
              resend_email_id: email.id,
              contact_reference: reference,
              from_email: email.from.slice(0, 320),
              to_email: email.to.join(", ").slice(0, 320),
              subject: email.subject.slice(0, 500),
              body_text: email.text.slice(0, 20_000),
              message_id: email.messageId.slice(0, 320) || null,
              received_at: email.receivedAt || null,
            },
            { onConflict: "resend_email_id", ignoreDuplicates: true },
          );

          if (error) {
            console.error("[resend-webhook] store failed", error.code ?? "unknown");
            return fail("Could not store the received message.", 503);
          }
        } catch {
          console.error("[resend-webhook] store failed", "unavailable");
          return fail("Could not store the received message.", 503);
        }

        console.log(
          `Inbound mail ${reference ?? "without a reference"}: stored${reference ? " against that reference" : ""}.`,
        );
        return Response.json({ ok: true, stored: true, matchedReference: Boolean(reference) });
      },
    },
  },
});
