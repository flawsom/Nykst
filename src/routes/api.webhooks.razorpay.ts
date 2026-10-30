import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { laterDate } from "@/lib/razorpay.server";
import {
  normalizeRazorpayWebhook,
  parseRazorpayWebhook,
  RAZORPAY_EVENT_ID_HEADER,
  RAZORPAY_SIGNATURE_HEADER,
  RAZORPAY_WEBHOOK_SECRET_ENV,
  razorpayEventId,
  razorpaySubscriptionState,
  verifyRazorpayWebhookSignature,
} from "@/lib/razorpay-webhook.server";

const ACTIVE_EVENTS = new Set([
  "subscription.authenticated",
  "subscription.activated",
  "subscription.charged",
]);

const INACTIVE_EVENTS = new Set([
  "subscription.completed",
  "subscription.halted",
  "subscription.expired",
]);

/**
 * Razorpay webhook receiver.
 *
 * The raw body is verified before parsing. The event is recorded for
 * reconciliation, then one matching Nykst subscription row is updated. A
 * duplicate delivery is a no-op only when `processed_at` is set; a retry of an
 * event that previously failed is processed again. No card, email, phone or
 * free-form note is stored.
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

        const { data: inserted, error: insertError } = await supabaseAdmin
          .from("razorpay_webhook_events")
          .upsert(record, { onConflict: "event_id", ignoreDuplicates: true })
          .select("event_id")
          .maybeSingle();
        if (insertError) {
          console.error("[razorpay-webhook] record failed", insertError.message);
          return Response.json(
            { error: "Could not record the verified webhook event." },
            { status: 500 },
          );
        }

        let processedAt: string | null = null;
        if (!inserted) {
          const { data: existing, error: lookupError } = await supabaseAdmin
            .from("razorpay_webhook_events")
            .select("processed_at")
            .eq("event_id", eventId)
            .maybeSingle();
          if (lookupError) {
            console.error("[razorpay-webhook] duplicate lookup failed", lookupError.message);
            return Response.json({ error: "Could not load the webhook event." }, { status: 500 });
          }
          processedAt = existing?.processed_at ?? null;
        }

        if (!inserted && processedAt)
          return Response.json({
            accepted: true,
            recorded: false,
            duplicate: true,
            eventId,
            eventType: record.event_type,
            category: record.category,
            activated: false,
            reason: record.reason,
          });

        const state = razorpaySubscriptionState(event);
        let activated = false;
        let ignored: string | undefined;

        if (state) {
          const { data: subscription, error: subscriptionError } = await supabaseAdmin
            .from("nykst_subscriptions")
            .select(
              "id, status, active_until, trial_ends_at, razorpay_payment_id, cancel_at_period_end",
            )
            .eq("razorpay_subscription_id", state.subscriptionId)
            .maybeSingle();
          if (subscriptionError) {
            console.error(
              "[razorpay-webhook] subscription lookup failed",
              subscriptionError.message,
            );
            return Response.json(
              { error: "Could not load the matching subscription." },
              { status: 500 },
            );
          }

          if (!subscription) {
            ignored = "No matching Nykst subscription.";
          } else {
            const next: {
              status?: string;
              active_until?: string | null;
              razorpay_payment_id?: string | null;
              cancel_at_period_end?: boolean;
              checkout_started_at?: string | null;
            } = {};

            if (ACTIVE_EVENTS.has(state.eventType)) {
              next.status = "active";
              next.active_until = laterDate(
                laterDate(subscription.active_until, subscription.trial_ends_at),
                state.currentEnd,
              );
              if (state.paymentId) next.razorpay_payment_id = state.paymentId;
              next.checkout_started_at = null;
              next.cancel_at_period_end = false;
              activated = true;
            } else if (state.eventType === "subscription.cancelled") {
              const end = laterDate(subscription.active_until, state.currentEnd);
              const endTime = end ? Date.parse(end) : NaN;
              if (Number.isFinite(endTime) && endTime > Date.now()) {
                next.status = "active";
                next.active_until = end;
                next.cancel_at_period_end = true;
              } else {
                next.status = "inactive";
                next.active_until = null;
                next.cancel_at_period_end = false;
              }
            } else if (INACTIVE_EVENTS.has(state.eventType)) {
              next.status = "inactive";
              next.active_until = state.currentEnd;
              next.cancel_at_period_end = false;
            } else if (
              state.eventType === "subscription.paused" ||
              state.eventType === "subscription.pending"
            ) {
              next.status = "pending";
              next.active_until = laterDate(subscription.active_until, state.currentEnd);
            }

            if (Object.keys(next).length) {
              const { error: updateError } = await supabaseAdmin
                .from("nykst_subscriptions")
                .update(next)
                .eq("id", subscription.id);
              if (updateError) {
                console.error("[razorpay-webhook] subscription update failed", updateError.message);
                return Response.json(
                  { error: "Could not update the matching subscription." },
                  { status: 500 },
                );
              }
            }
          }
        }

        const { error: markError } = await supabaseAdmin
          .from("razorpay_webhook_events")
          .update({ processed_at: new Date().toISOString() })
          .eq("event_id", eventId);
        if (markError) {
          console.error("[razorpay-webhook] mark processed failed", markError.message);
          return Response.json({ error: "Could not finish the webhook event." }, { status: 500 });
        }

        return Response.json({
          accepted: true,
          recorded: Boolean(inserted),
          duplicate: !inserted,
          eventId,
          eventType: record.event_type,
          category: record.category,
          activated,
          ...(ignored ? { ignored } : {}),
          reason: record.reason,
        });
      },
    },
  },
});
