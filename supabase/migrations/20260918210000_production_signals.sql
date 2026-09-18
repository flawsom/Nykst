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
  on public.production_signals(repository_full_name, occurred_at desc);
create index if not exists production_signals_fingerprint_idx
  on public.production_signals(fingerprint, occurred_at desc);

alter table public.production_signals enable row level security;
revoke all on public.production_signals from anon, authenticated;
grant all on public.production_signals to service_role;
