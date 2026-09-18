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
  on public.root_cause_diagnoses(signal_id, created_at desc);
alter table public.root_cause_diagnoses enable row level security;
revoke all on public.root_cause_diagnoses from anon, authenticated;
grant all on public.root_cause_diagnoses to service_role;
