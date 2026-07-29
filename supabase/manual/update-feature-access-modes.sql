-- =============================================================================
-- Jalankan di Supabase Dashboard → SQL Editor.
-- Migrasi enum `feature_access_mode` dari 3 mode lama
-- (public/subscription/trial) → 5 mode baru:
--   open, premium, trial, lock, hide
--
-- Default baru = 'hide' (menu belum di-set → tersembunyi dari user umum).
-- =============================================================================

-- 1) Ubah kolom ke text sementara supaya enum bisa di-drop & dibuat ulang.
ALTER TABLE public.feature_access
  ALTER COLUMN access_mode DROP DEFAULT,
  ALTER COLUMN access_mode TYPE text USING access_mode::text;

-- 1b) Drop check constraint lama (jika ada) yang masih membatasi nilai ke
--     3 mode lama. Tanpa ini UPDATE di step 2 akan gagal dengan
--     "violates check constraint feature_access_access_mode_check".
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.feature_access'::regclass AND contype = 'c'
  LOOP
    EXECUTE format('ALTER TABLE public.feature_access DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;

-- 2) Map nilai lama → nilai baru.
UPDATE public.feature_access SET access_mode = 'open'    WHERE access_mode = 'public';
UPDATE public.feature_access SET access_mode = 'premium' WHERE access_mode = 'subscription';

-- 3) Drop enum lama & bikin ulang dengan 5 nilai baru.
DROP TYPE IF EXISTS public.feature_access_mode;
CREATE TYPE public.feature_access_mode AS ENUM ('open', 'premium', 'trial', 'lock', 'hide');

-- 4) Convert kolom balik ke enum, set default baru = 'hide'.
ALTER TABLE public.feature_access
  ALTER COLUMN access_mode TYPE public.feature_access_mode
    USING access_mode::public.feature_access_mode,
  ALTER COLUMN access_mode SET DEFAULT 'hide';

-- Cek hasil
SELECT route_key, access_mode, trial_until FROM public.feature_access ORDER BY route_key;