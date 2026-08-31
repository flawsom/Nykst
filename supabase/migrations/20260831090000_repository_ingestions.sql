create table if not exists public.repository_ingestions (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  provider_user_id text not null,
  provider_username text not null,
  repository_full_name text not null,
  status text not null default 'complete',
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists repository_ingestions_provider_repo_idx on public.repository_ingestions(provider, repository_full_name);
alter table public.repository_ingestions enable row level security;
grant insert, select on public.repository_ingestions to authenticated;
grant all on public.repository_ingestions to service_role;
drop policy if exists "Users can read their own repository ingestions" on public.repository_ingestions;
create policy "Users can read their own repository ingestions" on public.repository_ingestions for select to authenticated using (true);
