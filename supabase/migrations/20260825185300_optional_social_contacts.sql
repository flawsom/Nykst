-- Keep early-access contact collection optional while preserving structured data.
ALTER TABLE public.pre_registrations
  ALTER COLUMN email DROP NOT NULL;

ALTER TABLE public.pre_registrations
  ADD COLUMN IF NOT EXISTS linkedin TEXT,
  ADD COLUMN IF NOT EXISTS x_account TEXT;

COMMENT ON COLUMN public.pre_registrations.email IS 'Optional contact email supplied by the respondent.';
COMMENT ON COLUMN public.pre_registrations.linkedin IS 'Optional LinkedIn profile URL or account.';
COMMENT ON COLUMN public.pre_registrations.x_account IS 'Optional X/Twitter profile URL or account.';

NOTIFY pgrst, 'reload schema';

-- The existing insert policy remains in force for anonymous early-access submissions.

-- For an already-provisioned Supabase project, apply this migration through the
-- Supabase SQL editor or migration pipeline before expecting the new columns in
-- the hosted table. The client still keeps a local backup if the schema is stale.

-- End of migration.

-- NOTE: This file is intentionally additive and safe to run once against the
-- existing pre_registrations table created by the initial migration.

-- The final statement is a no-op marker for migration tooling.
SELECT 1;

-- Keep this migration transaction-compatible.
