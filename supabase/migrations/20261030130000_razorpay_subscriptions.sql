-- Razorpay subscription linkage.
--
-- One row per GitHub user already exists for the manual eSewa path. These
-- columns let the same row represent a Razorpay subscription without storing
-- card data, customer email, phone numbers or the raw webhook payload.
alter table public.nykst_subscriptions
  add column if not exists provider text not null default 'esewa',
  add column if not exists razorpay_subscription_id text,
  add column if not exists razorpay_plan_id text,
  add column if not exists razorpay_payment_id text,
  add column if not exists trial_ends_at timestamptz,
  add column if not exists checkout_started_at timestamptz,
  add column if not exists cancel_at_period_end boolean not null default false;

-- Razorpay subscription ids are globally unique. Partial indexes allow every
-- legacy eSewa row to keep a null value.
create unique index if not exists nykst_subscriptions_razorpay_subscription_id_key
  on public.nykst_subscriptions (razorpay_subscription_id)
  where razorpay_subscription_id is not null;

-- Make PostgREST pick up the new columns immediately.
notify pgrst, 'reload schema';
