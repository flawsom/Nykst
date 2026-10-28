import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  normalizeRazorpayWebhook,
  parseRazorpayWebhook,
  RAZORPAY_EVENT_ID_HEADER,
  RAZORPAY_SIGNATURE_HEADER,
  RAZORPAY_WEBHOOK_SECRET_ENV,
  razorpayEventId,
  verifyRazorpayWebhookSignature,
} from "@/lib/razorpay-webhook.server";

/**
 * Razorpay webhook receiver.
 *
 * This endpoint verifies the signature over the raw body, deduplicates by
 * event id, and records the minimum reconciliation fields. It never logs the
 * payload and never grants access. Checkout activation stays a separate server
 * action that is not enabled until the M2-09 and N5 gates are signed off.
 */
export const Route = createFileRoute("/api/webhooks/razorpay")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const rawBody = await request.text();
        const secret = process.env[RAZORPAY_WEBHOOK_SECRET_ENV]?.trim();
        if (!secret)
          return Response.json(
            { error: "Razorpay webhook secret is not configured." },
            { status: 503 },
          );

        const signature = request.headers.get(RAZORPAY_SIGNATURE_HEADER);
        if (!verifyRazorpayWebhookSignature(rawBody, signature, secret))
          return Response.json({ error: "Invalid webhook signature." }, { status: 401 });

        let event;
        try {
          event = parseRazorpayWebhook(rawBody);
        } catch (cause) {
          return Response.json(
            { error: cause instanceof Error ? cause.message : "Invalid webhook payload." },
            { status: 400 },
          );
        }

        const eventId = razorpayEventId(
          rawBody,
          request.headers.get(RAZORPAY_EVENT_ID_HEADER),
          event,
        );
        const record = normalizeRazorpayWebhook(event, eventId);

        const { data, error } = await supabaseAdmin
          .from("razorpay_webhook_events")
          .upsert(record, { onConflict: "event_id", ignoreDuplicates: true })
          .select("event_id")
          .maybeSingle();

        if (error) {
          console.error("[razorpay-webhook] record failed", error.message);
          return Response.json(
            { error: "Could not record the verified webhook event." },
            { status: 500 },
          );
        }

        return Response.json({
          accepted: true,
          recorded: Boolean(data),
          duplicate: !data,
          eventId,
          eventType: record.event_type,
          category: record.category,
          activated: false,
          reason: record.reason,
        });
      },
    },
  },
});
