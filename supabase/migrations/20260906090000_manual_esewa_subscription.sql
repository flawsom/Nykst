create table if not exists public.nykst_subscriptions (
  id uuid primary key default gen_random_uuid(),
  provider_user_id text not null unique,
  provider_username text not null,
  status text not null default 'inactive' check (status in ('inactive', 'pending', 'active', 'rejected')),
  active_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.nykst_payment_submissions (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references public.nykst_subscriptions(id) on delete cascade,
  provider text not null default 'esewa',
  amount_npr integer not null default 999 check (amount_npr = 999),
  transaction_reference text not null unique,
  payer_note text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reviewed_by text,
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz not null default now()
);

create index if not exists nykst_payment_submissions_status_idx
  on public.nykst_payment_submissions(status, created_at desc);

alter table public.nykst_subscriptions enable row level security;
alter table public.nykst_payment_submissions enable row level security;
revoke all on public.nykst_subscriptions from anon, authenticated;
revoke all on public.nykst_payment_submissions from anon, authenticated;
grant all on public.nykst_subscriptions to service_role;
grant all on public.nykst_payment_submissions to service_role;

drop trigger if exists nykst_subscriptions_updated_at on public.nykst_subscriptions;
create or replace function public.set_nykst_subscriptions_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
create trigger nykst_subscriptions_updated_at
before update on public.nykst_subscriptions
for each row execute function public.set_nykst_subscriptions_updated_at();
