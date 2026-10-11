-- Memory that survives between sessions and between humans and AI agents.
--
-- repo_memory: notes about a file, a folder or a whole repository, written from the Nykst UI or
--   by an AI agent over MCP, and shown again the next time someone touches that code.
-- repo_findings: problems the analysis found, tracked across re-analyses so Nykst can say
--   "fixed in <commit>" or "this came back" instead of showing a fresh list every time.
--
-- Both are keyed by the GitHub user who owns the connection (provider_user_id). They are only
-- reachable through the server (service role); browsers cannot read them directly.

create table if not exists public.repo_memory (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'github',
  provider_user_id text not null,
  repository_full_name text not null,
  -- a file path, a folder path, or '' for the whole repository
  path text not null default '',
  kind text not null default 'note'
    check (kind in ('note', 'decision', 'gotcha', 'bug-fix', 'convention')),
  body text not null check (char_length(body) between 1 and 4000),
  source text not null default 'user' check (source in ('user', 'agent')),
  author text,
  commit_sha text,
  created_at timestamptz not null default now()
);

create index if not exists repo_memory_lookup_idx
  on public.repo_memory (provider, provider_user_id, repository_full_name, path);

create table if not exists public.repo_findings (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'github',
  provider_user_id text not null,
  repository_full_name text not null,
  -- stable id computed from the finding, e.g. "cycle:3fa9c1d2"
  signature text not null,
  kind text not null,
  severity text not null check (severity in ('low', 'medium', 'high')),
  title text not null,
  paths text[] not null default '{}',
  status text not null default 'open' check (status in ('open', 'resolved', 'dismissed')),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  resolved_at timestamptz,
  -- commit analyzed when the finding stopped appearing
  resolved_commit text,
  -- how many times it has been open; 2 or more means it came back
  times_opened integer not null default 1,
  dismissed_note text,
  unique (provider, provider_user_id, repository_full_name, signature)
);

create index if not exists repo_findings_repo_idx
  on public.repo_findings (provider, provider_user_id, repository_full_name, status);

alter table public.repo_memory enable row level security;
alter table public.repo_findings enable row level security;
revoke all on public.repo_memory from anon, authenticated;
revoke all on public.repo_findings from anon, authenticated;
grant all on public.repo_memory to service_role;
grant all on public.repo_findings to service_role;

-- Helps the "latest analysis of this repository" lookups used by the app and the MCP server.
create index if not exists repository_ingestions_latest_idx
  on public.repository_ingestions (provider, provider_user_id, repository_full_name, created_at desc);
