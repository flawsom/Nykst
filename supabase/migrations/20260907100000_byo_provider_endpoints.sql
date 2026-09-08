CREATE TABLE IF NOT EXISTS public.user_ai_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_user_id text NOT NULL,
  auth_provider text NOT NULL DEFAULT 'github',
  ai_provider text NOT NULL,
  key_ciphertext text NOT NULL,
  key_last4 text NOT NULL,
  api_base_url text,
  model_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (auth_provider, provider_user_id)
);

ALTER TABLE public.user_ai_keys
  ADD COLUMN IF NOT EXISTS api_base_url text,
  ADD COLUMN IF NOT EXISTS model_name text;

COMMENT ON COLUMN public.user_ai_keys.api_base_url IS 'Optional server-side provider endpoint for custom OpenAI-compatible APIs.';
COMMENT ON COLUMN public.user_ai_keys.model_name IS 'Optional provider model identifier.';

GRANT ALL ON public.user_ai_keys TO service_role;
ALTER TABLE public.user_ai_keys ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS user_ai_keys_provider_user_idx
  ON public.user_ai_keys (auth_provider, provider_user_id);
