-- TikTok OAuth: per-user connected accounts + short-lived OAuth state
-- Apply via Supabase SQL editor or `supabase db push`.

-- 1) Short-lived state used to bind /authorize -> /callback to a user_id.
CREATE TABLE IF NOT EXISTS public.tiktok_oauth_state (
  state text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tiktok_oauth_state TO authenticated;
GRANT ALL ON public.tiktok_oauth_state TO service_role;
ALTER TABLE public.tiktok_oauth_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tiktok_oauth_state_own" ON public.tiktok_oauth_state;
CREATE POLICY "tiktok_oauth_state_own"
  ON public.tiktok_oauth_state
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 2) Connected TikTok accounts. Tokens stored as AES-GCM ciphertext (TOKEN_ENCRYPTION_KEY).
CREATE TABLE IF NOT EXISTS public.tiktok_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  open_id text NOT NULL,
  union_id text,
  display_name text,
  avatar_url text,
  scope text,
  access_token_ct text NOT NULL,
  refresh_token_ct text,
  access_expires_at timestamptz,
  refresh_expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, open_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tiktok_accounts TO authenticated;
GRANT ALL ON public.tiktok_accounts TO service_role;
ALTER TABLE public.tiktok_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tiktok_accounts_select_own" ON public.tiktok_accounts;
CREATE POLICY "tiktok_accounts_select_own"
  ON public.tiktok_accounts FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "tiktok_accounts_delete_own" ON public.tiktok_accounts;
CREATE POLICY "tiktok_accounts_delete_own"
  ON public.tiktok_accounts FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Inserts/updates happen from the OAuth callback (service_role); no authenticated write policy needed.
