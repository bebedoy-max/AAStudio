-- =============================================================================
-- Jalankan di Supabase Dashboard → SQL Editor (project qwfpuseveqfsmzobecpt)
-- Tujuan: bikin tabel `feature_access` yang dipakai halaman Admin → Pengaturan
-- Halaman untuk atur mode: public / subscription / trial.
-- =============================================================================

DO $$ BEGIN
  CREATE TYPE public.feature_access_mode AS ENUM ('public', 'subscription', 'trial');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.feature_access (
  route_key   text PRIMARY KEY,
  access_mode public.feature_access_mode NOT NULL DEFAULT 'subscription',
  trial_until timestamptz,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Data API grants (WAJIB — tanpa ini PostgREST 404/permission denied)
GRANT SELECT ON public.feature_access TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.feature_access TO authenticated;
GRANT ALL ON public.feature_access TO service_role;

ALTER TABLE public.feature_access ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "feature_access read all" ON public.feature_access;
CREATE POLICY "feature_access read all"
  ON public.feature_access FOR SELECT
  USING (true);

-- Hanya admin (via user_roles) yang boleh menulis.
DROP POLICY IF EXISTS "feature_access admin write" ON public.feature_access;
CREATE POLICY "feature_access admin write"
  ON public.feature_access FOR ALL
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'admin'
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'admin'
  ));

-- Cek hasil
SELECT * FROM public.feature_access;
