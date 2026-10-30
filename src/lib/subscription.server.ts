import { githubToken, githubUser } from "@/lib/integrations/github";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type SubscriptionPlan = "monthly" | "annual";

export const SUBSCRIPTION_PLANS: Record<
  SubscriptionPlan,
  { label: string; amountNpr: number; days: number }
> = {
  monthly: { label: "Monthly", amountNpr: 999, days: 31 },
  annual: { label: "Annual", amountNpr: 9999, days: 366 },
};

export function isSubscriptionPlan(value: unknown): value is SubscriptionPlan {
  return value === "monthly" || value === "annual";
}

function env(name: string) {
  return process.env[name] || ((globalThis as Record<string, unknown>)[name] as string | undefined);
}

export function esewaDisplayName() {
  return env("NYKST_ESEWA_DISPLAY_NAME") || "eSewa account holder";
}

export function esewaPaymentInstructions() {
  return (
    env("NYKST_ESEWA_PAYMENT_INSTRUCTIONS") ||
    "Scan the QR code, send the selected NPR amount to the approved recipient, and keep the transaction reference visible in your receipt."
  );
}

export function esewaQrUrl() {
  return "/esewa-qr.jpg";
}

export async function connectedGithubUser(request: Request) {
  const token = githubToken(request);
  if (!token) return null;
  try {
    return await githubUser(token);
  } catch {
    return null;
  }
}

export async function requireConnectedGithubUser(request: Request) {
  const user = await connectedGithubUser(request);
  if (!user)
    throw new Response(JSON.stringify({ error: "Connect GitHub before subscribing." }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  return user;
}

export function isSubscriptionAdmin(userId: string) {
  const configured = env("NYKST_ADMIN_GITHUB_ID");
  return Boolean(configured && configured === userId);
}

export async function ensureSubscription(user: { id: number; login: string }) {
  const { data, error } = await supabaseAdmin
    .from("nykst_subscriptions")
    .upsert(
      { provider_user_id: String(user.id), provider_username: user.login },
      { onConflict: "provider_user_id" },
    )
    .select(
      "id, provider, provider_user_id, provider_username, plan, status, active_until, razorpay_subscription_id, razorpay_plan_id, razorpay_payment_id, trial_ends_at, checkout_started_at, cancel_at_period_end, created_at, updated_at",
    )
    .single();
  if (error) throw new Error("Could not prepare your subscription record.");
  return data;
}

export async function getSubscriptionStatus(request: Request) {
  const user = await requireConnectedGithubUser(request);
  const subscription = await ensureSubscription(user);
  const { data: submission } = await supabaseAdmin
    .from("nykst_payment_submissions")
    .select(
      "id, provider, plan, amount_npr, transaction_reference, payer_note, status, reviewed_at, review_note, created_at",
    )
    .eq("subscription_id", subscription.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return {
    subscription,
    submission,
    plans: SUBSCRIPTION_PLANS,
    amount_npr: SUBSCRIPTION_PLANS.monthly.amountNpr,
    display_name: esewaDisplayName(),
    instructions: esewaPaymentInstructions(),
    qr_url: esewaQrUrl(),
  };
}

export async function submitPayment(
  request: Request,
  plan: SubscriptionPlan,
  transactionReference: string,
  payerNote?: string,
) {
  const user = await requireConnectedGithubUser(request);
  const reference = transactionReference.trim();
  if (reference.length < 4 || reference.length > 120)
    throw new Error("Enter the eSewa transaction reference shown in your receipt.");
  const subscription = await ensureSubscription(user);
  const { data: existing } = await supabaseAdmin
    .from("nykst_payment_submissions")
    .select("id, status")
    .eq("subscription_id", subscription.id)
    .in("status", ["pending", "approved"])
    .maybeSingle();
  if (existing?.status === "approved") throw new Error("Your subscription is already active.");
  if (existing?.status === "pending")
    throw new Error("A payment submission is already awaiting review.");
  const { data, error } = await supabaseAdmin
    .from("nykst_payment_submissions")
    .insert({
      subscription_id: subscription.id,
      provider: "esewa",
      plan,
      amount_npr: SUBSCRIPTION_PLANS[plan].amountNpr,
      transaction_reference: reference,
      payer_note: payerNote?.trim().slice(0, 500) || null,
    })
    .select("id, provider, plan, amount_npr, transaction_reference, payer_note, status, created_at")
    .single();
  if (error) {
    if (error.code === "23505")
      throw new Error("That transaction reference has already been submitted.");
    throw new Error("Could not submit the payment for review.");
  }
  await supabaseAdmin
    .from("nykst_subscriptions")
    .update({ status: "pending", plan })
    .eq("id", subscription.id);
  return data;
}

export async function listPendingPayments(request: Request) {
  const user = await requireConnectedGithubUser(request);
  if (!isSubscriptionAdmin(String(user.id)))
    throw new Response(JSON.stringify({ error: "Admin access is required." }), {
      status: 403,
      headers: { "content-type": "application/json" },
    });
  const { data, error } = await supabaseAdmin
    .from("nykst_payment_submissions")
    .select(
      "id, subscription_id, provider, plan, amount_npr, transaction_reference, payer_note, status, reviewed_by, reviewed_at, review_note, created_at, nykst_subscriptions(provider_user_id, provider_username)",
    )
    .eq("status", "pending")
    .order("created_at", { ascending: true });
  if (error) throw new Error("Could not load pending payments.");
  return data || [];
}

export async function reviewPayment(
  request: Request,
  submissionId: string,
  decision: "approve" | "reject",
  note?: string,
) {
  const user = await requireConnectedGithubUser(request);
  if (!isSubscriptionAdmin(String(user.id)))
    throw new Response(JSON.stringify({ error: "Admin access is required." }), {
      status: 403,
      headers: { "content-type": "application/json" },
    });
  const { data: submission, error: lookupError } = await supabaseAdmin
    .from("nykst_payment_submissions")
    .select("id, subscription_id, status, plan")
    .eq("id", submissionId)
    .maybeSingle();
  if (lookupError || !submission) throw new Error("Payment submission was not found.");
  if (submission.status !== "pending") throw new Error("This payment has already been reviewed.");
  const nextStatus = decision === "approve" ? "approved" : "rejected";
  const { error } = await supabaseAdmin
    .from("nykst_payment_submissions")
    .update({
      status: nextStatus,
      reviewed_by: String(user.id),
      reviewed_at: new Date().toISOString(),
      review_note: note?.trim().slice(0, 500) || null,
    })
    .eq("id", submissionId);
  if (error) throw new Error("Could not update the payment review.");
  await supabaseAdmin
    .from("nykst_subscriptions")
    .update({
      status: nextStatus === "approved" ? "active" : "rejected",
      active_until:
        nextStatus === "approved"
          ? new Date(
              Date.now() +
                SUBSCRIPTION_PLANS[submission.plan as SubscriptionPlan].days * 86_400_000,
            ).toISOString()
          : null,
      plan: submission.plan,
    })
    .eq("id", submission.subscription_id);
  return { ok: true, status: nextStatus };
}
