-- Nykst: complete Supabase schema.
--
-- This is every file in supabase/migrations/ applied in order, merged into one
-- idempotent script. Safe to run more than once: it never drops user data and
-- every object is created only when missing.
--
-- Run it once against a fresh project (SQL Editor → paste → Run) or apply the
-- individual migrations with `supabase db push` if you use the CLI.
--
-- Row-level security is enabled on every table. Nykst server routes reach the
-- database with the service role after validating the caller, so the client
-- roles get no access to private workspace data.

begin;

-- ---------------------------------------------------------------------------
-- Early-access survey (legacy table kept for compatibility)
-- ---------------------------------------------------------------------------
create table if not exists public.pre_registrations (
  id uuid primary key default gen_random_uuid(),
  first_name text not null,
  email text,
  role text,
  company_size text,
  frustration text,
  time_understanding_code text,
  hardest_parts text[] not null default '{}',
  dream_feature text,
  would_use text,
  closing_thoughts text,
  created_at timestamptz not null default now()
);

alter table public.pre_registrations
  add column if not exists linkedin text,
  add column if not exists x_account text,
  add column if not exists knowledge_location text,
  add column if not exists hard_won_insight text;

grant insert on public.pre_registrations to anon, authenticated;
grant all on public.pre_registrations to service_role;
alter table public.pre_registrations enable row level security;

drop policy if exists "Anyone can submit a pre-registration" on public.pre_registrations;
create policy "Anyone can submit a pre-registration"
  on public.pre_registrations for insert to anon, authenticated with check (true);

-- ---------------------------------------------------------------------------
-- Early-access survey (current table)
-- ---------------------------------------------------------------------------
create table if not exists public.pre_registration (
  id uuid primary key default gen_random_uuid(),
  first_name text not null,
  email text,
  role text,
  company_size text,
  frustration text,
  time_understanding_code text,
  hardest_parts text[] not null default '{}',
  dream_feature text,
  would_use text,
  closing_thoughts text,
  knowledge_location text,
  hard_won_insight text,
  linkedin text,
  x_account text,
  created_at timestamptz not null default now()
);

alter table public.pre_registration
  add column if not exists first_name text,
  add column if not exists email text,
  add column if not exists role text,
  add column if not exists company_size text,
  add column if not exists frustration text,
  add column if not exists time_understanding_code text,
  add column if not exists hardest_parts text[] default '{}',
  add column if not exists dream_feature text,
  add column if not exists would_use text,
  add column if not exists closing_thoughts text,
  add column if not exists knowledge_location text,
  add column if not exists hard_won_insight text,
  add column if not exists linkedin text,
  add column if not exists x_account text,
  add column if not exists created_at timestamptz default now();

alter table public.pre_registration alter column email drop not null;

grant insert on public.pre_registration to anon, authenticated;
grant all on public.pre_registration to service_role;
alter table public.pre_registration enable row level security;

drop policy if exists "Anyone can submit a pre-registration" on public.pre_registration;
create policy "Anyone can submit a pre-registration"
  on public.pre_registration for insert to anon, authenticated with check (true);

-- ---------------------------------------------------------------------------
-- Advantages feedback
-- ---------------------------------------------------------------------------
create table if not exists public.advantages_feedback (
  id uuid primary key default gen_random_uuid(),
  feedback jsonb not null default '{}'::jsonb,
  email text not null,
  linkedin text,
  created_at timestamptz not null default now()
);

grant insert on public.advantages_feedback to anon, authenticated;
grant all on public.advantages_feedback to service_role;
alter table public.advantages_feedback enable row level security;

drop policy if exists "Anyone can submit Advantages feedback" on public.advantages_feedback;
create policy "Anyone can submit Advantages feedback"
  on public.advantages_feedback for insert to anon, authenticated with check (true);

-- ---------------------------------------------------------------------------
-- Repository ingestions (private source metadata, service role only)
-- ---------------------------------------------------------------------------
create table if not exists public.repository_ingestions (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  provider_user_id text not null,
  provider_username text,
  repository_full_name text not null,
  status text not null default 'complete',
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists repository_ingestions_provider_repo_idx
  on public.repository_ingestions (provider, repository_full_name);
create index if not exists repository_ingestions_user_idx
  on public.repository_ingestions (provider, provider_user_id, created_at desc);

alter table public.repository_ingestions enable row level security;
revoke all on public.repository_ingestions from anon, authenticated;
grant all on public.repository_ingestions to service_role;

-- ---------------------------------------------------------------------------
-- Bring-your-own AI keys (encrypted, service role only)
-- ---------------------------------------------------------------------------
create table if not exists public.user_ai_keys (
  id uuid primary key default gen_random_uuid(),
  provider_user_id text not null,
  auth_provider text not null default 'github',
  ai_provider text not null,
  key_ciphertext text not null,
  key_last4 text not null,
  api_base_url text,
  model_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (auth_provider, provider_user_id)
);

alter table public.user_ai_keys
  add column if not exists api_base_url text,
  add column if not exists model_name text;

create index if not exists user_ai_keys_provider_user_idx
  on public.user_ai_keys (auth_provider, provider_user_id);

alter table public.user_ai_keys enable row level security;
revoke all on public.user_ai_keys from anon, authenticated;
grant all on public.user_ai_keys to service_role;

-- ---------------------------------------------------------------------------
-- Subscriptions and eSewa payment submissions
-- ---------------------------------------------------------------------------
create table if not exists public.nykst_subscriptions (
  id uuid primary key default gen_random_uuid(),
  provider_user_id text not null unique,
  provider_username text not null,
  status text not null default 'inactive'
    check (status in ('inactive', 'pending', 'active', 'rejected')),
  plan text not null default 'monthly',
  active_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.nykst_subscriptions
  add column if not exists plan text not null default 'monthly',
  add column if not exists active_until timestamptz;

create table if not exists public.nykst_payment_submissions (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references public.nykst_subscriptions(id) on delete cascade,
  provider text not null default 'esewa',
  amount_npr integer not null default 999,
  plan text not null default 'monthly',
  transaction_reference text not null unique,
  payer_note text,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  reviewed_by text,
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz not null default now()
);

alter table public.nykst_payment_submissions
  add column if not exists plan text not null default 'monthly',
  add column if not exists payer_note text,
  add column if not exists reviewed_by text,
  add column if not exists reviewed_at timestamptz,
  add column if not exists review_note text;

create index if not exists nykst_payment_submissions_status_idx
  on public.nykst_payment_submissions (status, created_at desc);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'nykst_subscriptions_plan_check') then
    alter table public.nykst_subscriptions
      add constraint nykst_subscriptions_plan_check check (plan in ('monthly', 'annual'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'nykst_payment_submissions_plan_check') then
    alter table public.nykst_payment_submissions
      add constraint nykst_payment_submissions_plan_check check (plan in ('monthly', 'annual'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'nykst_payment_submissions_amount_npr_check') then
    alter table public.nykst_payment_submissions
      add constraint nykst_payment_submissions_amount_npr_check check (amount_npr in (999, 9999));
  end if;
end $$;

create or replace function public.set_nykst_subscriptions_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists nykst_subscriptions_updated_at on public.nykst_subscriptions;
create trigger nykst_subscriptions_updated_at
  before update on public.nykst_subscriptions
  for each row execute function public.set_nykst_subscriptions_updated_at();

alter table public.nykst_subscriptions enable row level security;
alter table public.nykst_payment_submissions enable row level security;
revoke all on public.nykst_subscriptions from anon, authenticated;
revoke all on public.nykst_payment_submissions from anon, authenticated;
grant all on public.nykst_subscriptions to service_role;
grant all on public.nykst_payment_submissions to service_role;

-- ---------------------------------------------------------------------------
-- Production signals and root-cause diagnoses (service role only)
-- ---------------------------------------------------------------------------
create table if not exists public.production_signals (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  event_type text not null,
  delivery_id text not null,
  repository_full_name text,
  occurred_at timestamptz not null default now(),
  severity text not null default 'error',
  title text not null,
  summary text not null,
  fingerprint text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (source, delivery_id)
);

create index if not exists production_signals_repo_time_idx
  on public.production_signals (repository_full_name, occurred_at desc);
create index if not exists production_signals_fingerprint_idx
  on public.production_signals (fingerprint, occurred_at desc);

alter table public.production_signals enable row level security;
revoke all on public.production_signals from anon, authenticated;
grant all on public.production_signals to service_role;

create table if not exists public.root_cause_diagnoses (
  id uuid primary key default gen_random_uuid(),
  signal_id uuid not null references public.production_signals(id) on delete cascade,
  repository_full_name text,
  status text not null default 'candidate',
  confidence text not null default 'low',
  title text not null,
  explanation text not null,
  evidence jsonb not null default '[]'::jsonb,
  dependencies jsonb not null default '[]'::jsonb,
  recommended_next_steps jsonb not null default '[]'::jsonb,
  model_provider text,
  model_name text,
  created_at timestamptz not null default now()
);

create index if not exists root_cause_diagnoses_signal_idx
  on public.root_cause_diagnoses (signal_id, created_at desc);

alter table public.root_cause_diagnoses enable row level security;
revoke all on public.root_cause_diagnoses from anon, authenticated;
grant all on public.root_cause_diagnoses to service_role;

-- ---------------------------------------------------------------------------
-- MCP access tokens (only a SHA-256 hash is stored)
-- ---------------------------------------------------------------------------
create table if not exists public.mcp_access_tokens (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'github',
  provider_user_id text not null,
  provider_username text not null,
  label text not null default 'AI coding tool',
  token_hash text not null unique,
  token_prefix text not null,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);

create index if not exists mcp_access_tokens_user_idx
  on public.mcp_access_tokens (provider, provider_user_id, created_at desc);

alter table public.mcp_access_tokens enable row level security;
revoke all on public.mcp_access_tokens from anon, authenticated;
grant all on public.mcp_access_tokens to service_role;

-- ---------------------------------------------------------------------------
-- Slack and Jira connections (encrypted secrets, service role only)
-- ---------------------------------------------------------------------------
create table if not exists public.integration_connections (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'github',
  provider_user_id text not null,
  kind text not null check (kind in ('slack', 'jira')),
  external_id text not null,
  label text not null default '',
  meta jsonb not null default '{}'::jsonb,
  secrets text not null,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, provider_user_id, kind)
);

create index if not exists integration_connections_external_idx
  on public.integration_connections (kind, external_id);

alter table public.integration_connections enable row level security;
revoke all on public.integration_connections from anon, authenticated;
grant all on public.integration_connections to service_role;

-- ---------------------------------------------------------------------------
-- Hardening: nothing private is reachable through the anon/authenticated roles.
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    execute 'revoke execute on function public.rls_auto_enable() from anon, authenticated';
  end if;
end $$;

commit;

-- Make PostgREST pick up the new tables immediately.
notify pgrst, 'reload schema';
