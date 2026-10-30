import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { planById } from "@/lib/pricing";
import {
  billingConfig,
  cancelRazorpaySubscription,
  checkoutStateFor,
  createRazorpaySubscription,
  fetchRazorpaySubscription,
  isRazorpayBillingPlan,
  isActiveSubscriptionStatus,
  laterDate,
  RazorpayRequestError,
  subscriptionEndDate,
} from "@/lib/razorpay.server";
import { ensureSubscription, requireConnectedGithubUser } from "@/lib/subscription.server";

const PENDING_REUSE_MS = 15 * 60 * 1000;

function json(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

/**
 * POST /api/billing/subscription
 *
 * Starts a Razorpay subscription only after the server has claimed a pending
 * checkout for this GitHub user. The claim prevents two tabs from creating two
 * live mandates. A recent pending checkout is returned again so the browser can
 * reopen Checkout; an older one is cancelled before a fresh subscription is
 * created.
 */
export const Route = createFileRoute("/api/billing/subscription")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = (await request.json().catch(() => null)) as { plan?: unknown } | null;
          const plan = body?.plan;
          if (!isRazorpayBillingPlan(plan))
            return json({ error: "Choose the monthly or annual plan." }, 400);

          const user = await requireConnectedGithubUser(request);
          const config = billingConfig();
          const checkout = checkoutStateFor(plan, config);
          if (checkout.state !== "live")
            return json({ error: "Checkout is not open yet.", code: "gated" }, 409);

          const { error: schemaError } = await supabaseAdmin
            .from("nykst_subscriptions")
            .select("razorpay_subscription_id")
            .limit(1);
          if (schemaError) return json({ error: "Checkout is not open yet.", code: "gated" }, 503);

          const subscription = await ensureSubscription(user);
          const now = Date.now();
          const activeUntil = subscription.active_until
            ? Date.parse(subscription.active_until)
            : NaN;
          if (subscription.status === "active" && Number.isFinite(activeUntil) && activeUntil > now)
            return json({ error: "Your subscription is already active.", code: "active" }, 409);

          const pendingSince = subscription.checkout_started_at
            ? Date.parse(subscription.checkout_started_at)
            : NaN;
          if (
            subscription.status === "pending" &&
            subscription.razorpay_subscription_id &&
            Number.isFinite(pendingSince) &&
            now - pendingSince < PENDING_REUSE_MS
          )
            return json({
              key_id: config.keyId,
              subscription_id: subscription.razorpay_subscription_id,
              plan,
              trial_ends_at: subscription.trial_ends_at,
              amount_paise: planById(plan).amountPaise,
              currency: "INR",
              reused: true,
            });

          // An older checkout may still be an open Razorpay object. Never create a
          // second one while the first is authorized or still chargeable.
          if (subscription.razorpay_subscription_id) {
            let previous;
            try {
              previous = await fetchRazorpaySubscription(
                subscription.razorpay_subscription_id,
                config,
              );
            } catch {
              return json(
                { error: "Could not check your previous checkout. Try again in a moment." },
                502,
              );
            }
            if (isActiveSubscriptionStatus(previous.status)) {
              await supabaseAdmin
                .from("nykst_subscriptions")
                .update({
                  status: "active",
                  provider: "razorpay",
                  active_until: laterDate(
                    subscription.active_until,
                    subscriptionEndDate(previous, subscription.trial_ends_at),
                  ),
                })
                .eq("id", subscription.id);
              return json(
                { error: "Your subscription is already authorized.", code: "authorized" },
                409,
              );
            }
            if (
              previous.status === "created" ||
              previous.status === "pending" ||
              previous.status === "paused"
            ) {
              try {
                await cancelRazorpaySubscription(subscription.razorpay_subscription_id, config);
              } catch {
                return json(
                  { error: "Could not close the previous checkout. Try again in a moment." },
                  502,
                );
              }
            }
          }

          const cutoff = new Date(now - PENDING_REUSE_MS).toISOString();
          const { data: claimed, error: claimError } = await supabaseAdmin
            .from("nykst_subscriptions")
            .update({
              provider: "razorpay",
              plan,
              status: "pending",
              checkout_started_at: new Date(now).toISOString(),
            })
            .eq("id", subscription.id)
            .or(`checkout_started_at.is.null,checkout_started_at.lt.${cutoff}`)
            .select("id")
            .maybeSingle();
          if (claimError) return json({ error: "Could not start checkout." }, 500);
          if (!claimed)
            return json(
              {
                error: "A checkout is already starting. Wait a minute and try again.",
                code: "busy",
              },
              409,
            );

          let created;
          try {
            created = await createRazorpaySubscription(plan, user, config);
          } catch (error) {
            await supabaseAdmin
              .from("nykst_subscriptions")
              .update({ checkout_started_at: null, status: "inactive" })
              .eq("id", subscription.id);
            if (error instanceof RazorpayRequestError)
              return json(
                {
                  error:
                    error.status === 503
                      ? "Payment provider is not configured."
                      : "Could not start checkout. Try again.",
                },
                error.status,
              );
            return json({ error: "Could not start checkout." }, 502);
          }

          const { error: saveError } = await supabaseAdmin
            .from("nykst_subscriptions")
            .update({
              provider: "razorpay",
              plan,
              status: "pending",
              razorpay_subscription_id: created.subscription.id,
              razorpay_plan_id: config.planIds[plan] ?? null,
              trial_ends_at: created.trialEnd,
              active_until: created.trialEnd,
              checkout_started_at: new Date(now).toISOString(),
              cancel_at_period_end: false,
            })
            .eq("id", subscription.id);
          if (saveError) {
            await cancelRazorpaySubscription(created.subscription.id, config).catch(
              () => undefined,
            );
            await supabaseAdmin
              .from("nykst_subscriptions")
              .update({ checkout_started_at: null, status: "inactive" })
              .eq("id", subscription.id);
            return json({ error: "Could not save the checkout. Try again." }, 500);
          }

          return json({
            key_id: config.keyId,
            subscription_id: created.subscription.id,
            plan,
            trial_ends_at: created.trialEnd,
            amount_paise: planById(plan).amountPaise,
            currency: "INR",
          });
        } catch (error) {
          if (error instanceof Response) return error;
          return json({ error: "Could not start checkout." }, 500);
        }
      },
    },
  },
});
