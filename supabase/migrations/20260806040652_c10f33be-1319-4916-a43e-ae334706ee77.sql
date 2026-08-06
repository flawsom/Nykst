CREATE TABLE public.pre_registrations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  first_name TEXT NOT NULL,
  email TEXT NOT NULL,
  role TEXT,
  company_size TEXT,
  frustration TEXT,
  time_understanding_code TEXT,
  hardest_parts TEXT[] NOT NULL DEFAULT '{}',
  dream_feature TEXT,
  would_use TEXT,
  closing_thoughts TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT INSERT ON public.pre_registrations TO anon, authenticated;
GRANT ALL ON public.pre_registrations TO service_role;

ALTER TABLE public.pre_registrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can submit a pre-registration"
  ON public.pre_registrations FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);