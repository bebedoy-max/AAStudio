-- Metadata galeri (prompt, provider, dsb) untuk hasil generate yang tersimpan di cloud.
ALTER TABLE public.cloud_files
  ADD COLUMN IF NOT EXISTS meta jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS cloud_files_user_source_idx
  ON public.cloud_files (user_id, origin, source, created_at DESC);
