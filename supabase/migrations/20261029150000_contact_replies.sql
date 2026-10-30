-- Inbound mail received by the Nykst address, stored so no message is lost.
--
-- Resend signs every inbound event; /api/webhooks/resend verifies that signature
-- over the raw body, fetches the message by id and writes one row here. The
-- reference from the subject is kept when present so a reply stays on the same
-- case as the form message it answers.
--
-- Nothing in the browser reads or writes this table: anon and authenticated are
-- revoked, and only the service role behind the server route can touch it.
create table if not exists public.contact_replies (
  id uuid primary key default gen_random_uuid(),
  resend_email_id text not null unique,
  contact_reference text,
  from_email text not null,
  to_email text not null default '',
  subject text not null default '',
  body_text text not null default '',
  message_id text,
  received_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists contact_replies_reference_idx
  on public.contact_replies (contact_reference, created_at desc);
create index if not exists contact_replies_received_idx
  on public.contact_replies (created_at desc);

alter table public.contact_replies enable row level security;
revoke all on public.contact_replies from anon, authenticated;
grant all on public.contact_replies to service_role;

-- Make PostgREST pick up the new table immediately.
notify pgrst, 'reload schema';
