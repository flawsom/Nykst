-- Personal access tokens that let AI coding tools (Claude Code, Cursor, ...) query a
-- user's repository analysis over MCP. Only a SHA-256 hash of each token is stored.
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
  on public.mcp_access_tokens(provider, provider_user_id, created_at desc);
alter table public.mcp_access_tokens enable row level security;
revoke all on public.mcp_access_tokens from anon, authenticated;
grant all on public.mcp_access_tokens to service_role;
