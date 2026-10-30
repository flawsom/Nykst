-- One contact record per message, independent of pre-registration and feedback.
--
-- Nothing in the browser writes here: the table grants no access to anon or
-- authenticated roles, so every message arrives through the /api/contact
-- server route, which validates it, applies the rate limit, stores it and tries
-- to notify the owner. `mail_status` records whether that notification actually
-- left the building, so a stored row is never mistaken for a delivered message.
create table if not exists public.contact_messages (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  topic text not null
    check (topic in ('Plans and access', 'Partnerships', 'Privacy request', 'Support')),
  sender_name text not null,
  sender_email text not null,
  message text not null,
  network_hash text not null,
  status text not null default 'stored'
    check (status in ('stored', 'notified', 'failed', 'closed')),
  mail_status text not null default 'pending'
    check (mail_status in ('pending', 'sent', 'not_configured', 'failed')),
  mail_detail text,
  created_at timestamptz not null default now(),
  notified_at timestamptz
);

create index if not exists contact_messages_sender_time_idx
  on public.contact_messages (sender_email, created_at desc);
create index if not exists contact_messages_network_time_idx
  on public.contact_messages (network_hash, created_at desc);
create index if not exists contact_messages_open_work_idx
  on public.contact_messages (status, created_at desc);

alter table public.contact_messages enable row level security;
revoke all on public.contact_messages from anon, authenticated;
grant all on public.contact_messages to service_role;

-- Make PostgREST pick up the new table immediately.
notify pgrst, 'reload schema';
