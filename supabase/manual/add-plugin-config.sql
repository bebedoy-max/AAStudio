-- =============================================================================
-- AA Plug-IN config — URL AA Creative Studio yang dipakai semua plugin /
-- browser extension, plus konfigurasi per-plugin (aktif, versi, catatan).
-- Hanya admin yang bisa mengubah. Jalankan di Supabase → SQL Editor.
-- =============================================================================

ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS plugin_app_url text,
  ADD COLUMN IF NOT EXISTS plugin_config  jsonb NOT NULL DEFAULT '{}'::jsonb;

NOTIFY pgrst, 'reload schema';
