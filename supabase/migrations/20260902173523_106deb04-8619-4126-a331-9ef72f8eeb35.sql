CREATE TABLE public.user_ai_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_user_id text NOT NULL,
  auth_provider text NOT NULL DEFAULT 'github',
  ai_provider text NOT NULL,
  key_ciphertext text NOT NULL,
  key_last4 text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (auth_provider, provider_user_id)
);

GRANT ALL ON public.user_ai_keys TO service_role;
ALTER TABLE public.user_ai_keys ENABLE ROW LEVEL SECURITY;