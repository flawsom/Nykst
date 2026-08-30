CREATE TABLE IF NOT EXISTS public.advantages_feedback (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  feedback JSONB NOT NULL DEFAULT '{}'::jsonb,
  email TEXT NOT NULL,
  linkedin TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT INSERT ON public.advantages_feedback TO anon, authenticated;
GRANT ALL ON public.advantages_feedback TO service_role;

ALTER TABLE public.advantages_feedback ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can submit Advantages feedback" ON public.advantages_feedback;
CREATE POLICY "Anyone can submit Advantages feedback"
  ON public.advantages_feedback FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

NOTIFY pgrst, 'reload schema';
