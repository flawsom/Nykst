-- Repository snapshots contain private source metadata and must never be broadly readable.
-- Nykst server routes use service_role after validating the GitHub token, so no client grant or
-- authenticated read policy is required here.
revoke insert, select on public.repository_ingestions from authenticated;
drop policy if exists "Users can read their own repository ingestions" on public.repository_ingestions;

-- API keys are encrypted and server-managed; keep the table inaccessible to client roles.
revoke all on public.user_ai_keys from anon, authenticated;

-- This helper is not part of the application API and must not be callable through PostgREST.
revoke execute on function public.rls_auto_enable() from anon, authenticated;
