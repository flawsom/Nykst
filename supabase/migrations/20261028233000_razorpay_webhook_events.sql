-- Verified Razorpay webhook events, stored for idempotency and reconciliation.
--
-- The raw payload is deliberately not stored: Razorpay payloads can contain
-- customer email, phone, card metadata and notes. Only identifiers, amounts and
-- the processing outcome are kept. No row in this table grants access.
create table if not exists public.razorpay_webhook_events (
  event_id text primary key,
  event_type text not null,
  category text not null
    check (category in ('order', 'payment', 'subscription', 'refund', 'dispute', 'unsupported')),
  status text not null default 'received'
    check (status in ('received', 'processed', 'ignored', 'failed')),
  order_id text,
  payment_id text,
  subscription_id text,
  amount integer,
  currency text,
  reason text not null default '',
  received_at timestamptz not null default now(),
  processed_at timestamptz
);

create index if not exists razorpay_webhook_events_type_time_idx
  on public.razorpay_webhook_events (event_type, received_at desc);
create index if not exists razorpay_webhook_events_subscription_idx
  on public.razorpay_webhook_events (subscription_id, received_at desc);
create index if not exists razorpay_webhook_events_order_idx
  on public.razorpay_webhook_events (order_id, received_at desc);

alter table public.razorpay_webhook_events enable row level security;
revoke all on public.razorpay_webhook_events from anon, authenticated;
grant all on public.razorpay_webhook_events to service_role;

-- Make PostgREST pick up the new table immediately.
notify pgrst, 'reload schema';
