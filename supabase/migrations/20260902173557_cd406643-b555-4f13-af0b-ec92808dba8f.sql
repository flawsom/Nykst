CREATE TABLE public.pre_registration (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name text NOT NULL,
  role text,
  company_size text,
  frustration text,
  time_understanding_code text,
  hardest_parts text[] NOT NULL DEFAULT '{}',
  dream_feature text,
  would_use text,
  closing_thoughts text,
  knowledge_location text,
  hard_won_insight text,
  email text,
  linkedin text,
  x_account text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT INSERT ON public.pre_registration TO anon, authenticated;
GRANT ALL ON public.pre_registration TO service_role;
ALTER TABLE public.pre_registration ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can submit pre-registration" ON public.pre_registration FOR INSERT TO anon, authenticated WITH CHECK (true);

CREATE TABLE public.advantages_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  feedback jsonb NOT NULL DEFAULT '{}'::jsonb,
  email text NOT NULL,
  linkedin text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT INSERT ON public.advantages_feedback TO anon, authenticated;
GRANT ALL ON public.advantages_feedback TO service_role;
ALTER TABLE public.advantages_feedback ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can submit advantages feedback" ON public.advantages_feedback FOR INSERT TO anon, authenticated WITH CHECK (true);

CREATE TABLE public.repository_ingestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  provider_user_id text NOT NULL,
  provider_username text,
  repository_full_name text NOT NULL,
  status text NOT NULL DEFAULT 'complete',
  payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.repository_ingestions TO service_role;
ALTER TABLE public.repository_ingestions ENABLE ROW LEVEL SECURITY;
CREATE INDEX repository_ingestions_user_idx ON public.repository_ingestions (provider, provider_user_id, created_at DESC);