-- Slack and Jira connections made by a signed-in Nykst (GitHub) user.
-- Tokens are stored encrypted (AES-256-GCM, same key handling as user_ai_keys) in `secrets`.
-- Only the server (service role) can read this table.

create table if not exists public.integration_connections (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'github',
  provider_user_id text not null,
  kind text not null check (kind in ('slack', 'jira')),
  -- Slack team id or Jira cloud id; used to find the owner of an incoming Slack command
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
