-- Single active browser/device session per user.
-- Apply this via Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS public.user_active_sessions (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_active_sessions TO authenticated;
GRANT ALL ON public.user_active_sessions TO service_role;

ALTER TABLE public.user_active_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_active_sessions_select_own" ON public.user_active_sessions;
CREATE POLICY "user_active_sessions_select_own"
  ON public.user_active_sessions FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_active_sessions_insert_own" ON public.user_active_sessions;
CREATE POLICY "user_active_sessions_insert_own"
  ON public.user_active_sessions FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_active_sessions_update_own" ON public.user_active_sessions;
CREATE POLICY "user_active_sessions_update_own"
  ON public.user_active_sessions FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_active_sessions_delete_own" ON public.user_active_sessions;
CREATE POLICY "user_active_sessions_delete_own"
  ON public.user_active_sessions FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);