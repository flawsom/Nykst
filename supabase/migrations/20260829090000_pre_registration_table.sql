-- Keep the public pre-registration contract aligned with the form.
CREATE TABLE IF NOT EXISTS public.pre_registration (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  first_name TEXT NOT NULL,
  email TEXT,
  role TEXT,
  company_size TEXT,
  frustration TEXT,
  time_understanding_code TEXT,
  hardest_parts TEXT[] NOT NULL DEFAULT '{}',
  dream_feature TEXT,
  would_use TEXT,
  closing_thoughts TEXT,
  knowledge_location TEXT,
  hard_won_insight TEXT,
  linkedin TEXT,
  x_account TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.pre_registration
  ADD COLUMN IF NOT EXISTS first_name TEXT,
  ADD COLUMN IF NOT EXISTS email TEXT,
  ADD COLUMN IF NOT EXISTS role TEXT,
  ADD COLUMN IF NOT EXISTS company_size TEXT,
  ADD COLUMN IF NOT EXISTS frustration TEXT,
  ADD COLUMN IF NOT EXISTS time_understanding_code TEXT,
  ADD COLUMN IF NOT EXISTS hardest_parts TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS dream_feature TEXT,
  ADD COLUMN IF NOT EXISTS would_use TEXT,
  ADD COLUMN IF NOT EXISTS closing_thoughts TEXT,
  ADD COLUMN IF NOT EXISTS knowledge_location TEXT,
  ADD COLUMN IF NOT EXISTS hard_won_insight TEXT,
  ADD COLUMN IF NOT EXISTS linkedin TEXT,
  ADD COLUMN IF NOT EXISTS x_account TEXT,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT now();

ALTER TABLE public.pre_registration
  ALTER COLUMN email DROP NOT NULL;

GRANT INSERT ON public.pre_registration TO anon, authenticated;
GRANT ALL ON public.pre_registration TO service_role;

ALTER TABLE public.pre_registration ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can submit a pre-registration" ON public.pre_registration;
CREATE POLICY "Anyone can submit a pre-registration"
  ON public.pre_registration FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

NOTIFY pgrst, 'reload schema';
