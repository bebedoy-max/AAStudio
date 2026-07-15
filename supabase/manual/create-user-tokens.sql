-- Encrypted per-user API token storage.
-- Apply this via Supabase SQL editor OR `supabase db push` if using CLI.
-- Ciphertext is produced server-side via AES-GCM (TOKEN_ENCRYPTION_KEY).

CREATE TABLE IF NOT EXISTS public.user_tokens (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  storage_key text NOT NULL,
  ciphertext text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, storage_key)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_tokens TO authenticated;
GRANT ALL ON public.user_tokens TO service_role;

ALTER TABLE public.user_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_tokens_select_own" ON public.user_tokens;
CREATE POLICY "user_tokens_select_own"
  ON public.user_tokens FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_tokens_insert_own" ON public.user_tokens;
CREATE POLICY "user_tokens_insert_own"
  ON public.user_tokens FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_tokens_update_own" ON public.user_tokens;
CREATE POLICY "user_tokens_update_own"
  ON public.user_tokens FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_tokens_delete_own" ON public.user_tokens;
CREATE POLICY "user_tokens_delete_own"
  ON public.user_tokens FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);
