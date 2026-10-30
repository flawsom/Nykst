import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  billingConfig,
  fetchRazorpaySubscription,
  isActiveSubscriptionStatus,
  laterDate,
  subscriptionEndDate,
  trialEndsAt,
  verifySubscriptionPaymentSignature,
} from "@/lib/razorpay.server";
import { ensureSubscription, requireConnectedGithubUser } from "@/lib/subscription.server";

function json(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

/**
 * POST /api/billing/verify
 *
 * The browser never decides whether access is granted. The server looks up the
 * Razorpay subscription it stored for this GitHub user, verifies the signature
 * against that stored id, and only then starts the trial. A Razorpay lookup is
 * best effort: a timeout must not strand a customer who has a valid signature.
 */
export const Route = createFileRoute("/api/billing/verify")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = (await request.json().catch(() => null)) as {
            payment_id?: unknown;
            subscription_id?: unknown;
            signature?: unknown;
          } | null;
          if (
            typeof body?.payment_id !== "string" ||
            !/^pay_[A-Za-z0-9]+$/.test(body.payment_id) ||
            typeof body.signature !== "string" ||
            !/^[a-f0-9]{64}$/i.test(body.signature)
          )
            return json({ error: "The payment response is incomplete." }, 400);

          const user = await requireConnectedGithubUser(request);
          const subscription = await ensureSubscription(user);
          const storedSubscriptionId = subscription.razorpay_subscription_id;
          if (!storedSubscriptionId)
            return json({ error: "No checkout is waiting for verification." }, 404);

          if (
            typeof body.subscription_id === "string" &&
            body.subscription_id !== storedSubscriptionId
          )
            return json({ error: "That payment belongs to a different checkout." }, 400);

          const config = billingConfig();
          if (
            !verifySubscriptionPaymentSignature(
              body.payment_id,
              storedSubscriptionId,
              body.signature,
              config.keySecret,
            )
          )
            return json({ error: "The payment signature could not be verified." }, 400);

          const existingUntil = subscription.active_until
            ? Date.parse(subscription.active_until)
            : NaN;
          const alreadyActive =
            subscription.status === "active" &&
            subscription.razorpay_payment_id === body.payment_id &&
            Number.isFinite(existingUntil) &&
            existingUntil > Date.now();
          if (alreadyActive)
            return json({
              ok: true,
              status: "active",
              plan: subscription.plan,
              active_until: subscription.active_until,
            });

          const canVerify =
            subscription.status === "pending" ||
            Boolean(subscription.checkout_started_at) ||
            (subscription.status === "active" &&
              subscription.razorpay_payment_id === body.payment_id);
          if (!canVerify) return json({ error: "No checkout is waiting for verification." }, 409);

          let remote = null;
          try {
            remote = await fetchRazorpaySubscription(storedSubscriptionId, config);
          } catch {
            // The signature is already authoritative for this authorization. The
            // webhook will supply the billing cycle dates when Razorpay is reachable.
          }
          if (remote && ["cancelled", "completed", "halted", "expired"].includes(remote.status))
            return json({ error: "That subscription is no longer active. Contact support." }, 409);

          const trialEnd = subscription.trial_ends_at ?? trialEndsAt();
          const currentEnd = remote
            ? subscriptionEndDate(remote, subscription.active_until ?? trialEnd)
            : (subscription.active_until ?? trialEnd);
          const activeUntil = laterDate(laterDate(subscription.active_until, trialEnd), currentEnd);

          const { error } = await supabaseAdmin
            .from("nykst_subscriptions")
            .update({
              provider: "razorpay",
              status: "active",
              active_until: activeUntil,
              razorpay_payment_id: body.payment_id,
              checkout_started_at: null,
              cancel_at_period_end: false,
            })
            .eq("id", subscription.id);
          if (error) return json({ error: "Could not activate the subscription." }, 500);

          return json({
            ok: true,
            status: remote && isActiveSubscriptionStatus(remote.status) ? remote.status : "active",
            plan: subscription.plan,
            active_until: activeUntil,
          });
        } catch (error) {
          if (error instanceof Response) return error;
          return json({ error: "Could not verify the payment." }, 500);
        }
      },
    },
  },
});
