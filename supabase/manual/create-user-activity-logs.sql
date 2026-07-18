-- =============================================================================
-- Jalankan di Supabase Dashboard → SQL Editor.
-- Membuat tabel log aktivitas user + fungsi bantu untuk admin.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.user_activity_logs (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  category   text NOT NULL,          -- auth | profile | generate | payment | admin | system
  action     text NOT NULL,          -- login, logout, password_change, generate_storyboard, ...
  details    jsonb,                  -- payload bebas
  ip_address text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS user_activity_logs_user_idx
  ON public.user_activity_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS user_activity_logs_category_idx
  ON public.user_activity_logs(category, created_at DESC);
CREATE INDEX IF NOT EXISTS user_activity_logs_created_idx
  ON public.user_activity_logs(created_at DESC);

GRANT SELECT, INSERT ON public.user_activity_logs TO authenticated;
GRANT ALL ON public.user_activity_logs TO service_role;

ALTER TABLE public.user_activity_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "activity_logs_insert_self" ON public.user_activity_logs;
CREATE POLICY "activity_logs_insert_self"
  ON public.user_activity_logs FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "activity_logs_select_own_or_admin" ON public.user_activity_logs;
CREATE POLICY "activity_logs_select_own_or_admin"
  ON public.user_activity_logs FOR SELECT
  TO authenticated
  USING (
    auth.uid() = user_id
    OR public.has_role(auth.uid(), 'admin')
  );

DROP POLICY IF EXISTS "activity_logs_admin_delete" ON public.user_activity_logs;
CREATE POLICY "activity_logs_admin_delete"
  ON public.user_activity_logs FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- =============================================================================
-- Fungsi hitung token/API key aktif per user (untuk halaman Manajemen User)
-- Menggabungkan user_tokens (API key user) + token_bank_keys yang di-assign.
-- SECURITY DEFINER supaya admin bisa lihat count tanpa expose value key.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.admin_user_token_counts()
RETURNS TABLE(user_id uuid, tokens_count integer, bank_keys_count integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH ut AS (
    SELECT user_id, COUNT(*)::int AS c
    FROM public.user_tokens
    GROUP BY user_id
  ),
  tb AS (
    SELECT assigned_to AS user_id, COUNT(*)::int AS c
    FROM public.token_bank_keys
    WHERE status = 'assigned' AND assigned_to IS NOT NULL
    GROUP BY assigned_to
  )
  SELECT
    COALESCE(ut.user_id, tb.user_id)                AS user_id,
    COALESCE(ut.c, 0)                               AS tokens_count,
    COALESCE(tb.c, 0)                               AS bank_keys_count
  FROM ut
  FULL OUTER JOIN tb ON ut.user_id = tb.user_id;
$$;

REVOKE ALL ON FUNCTION public.admin_user_token_counts() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_user_token_counts() TO authenticated;
