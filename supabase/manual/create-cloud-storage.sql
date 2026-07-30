-- Cloud media storage (Google Drive).
-- Apply via Supabase SQL editor.

-- 1) Per-user encrypted App User Connector connection keys (Google Drive pribadi).
CREATE TABLE IF NOT EXISTS public.app_user_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  connector_id text NOT NULL,
  connection_key_ciphertext text NOT NULL,
  account_email text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, connector_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_user_connections TO service_role;
ALTER TABLE public.app_user_connections ENABLE ROW LEVEL SECURITY;

-- 2) Preferensi storage per user: 'global' (Drive aplikasi) atau 'personal' (Drive user).
CREATE TABLE IF NOT EXISTS public.user_cloud_prefs (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  storage_mode text NOT NULL DEFAULT 'global' CHECK (storage_mode IN ('global','personal')),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_cloud_prefs TO authenticated;
GRANT ALL ON public.user_cloud_prefs TO service_role;
ALTER TABLE public.user_cloud_prefs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_cloud_prefs_own" ON public.user_cloud_prefs;
CREATE POLICY "user_cloud_prefs_own"
  ON public.user_cloud_prefs FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 3) Registry semua media (upload user + hasil generate) yang tersimpan di cloud.
CREATE TABLE IF NOT EXISTS public.cloud_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  storage_mode text NOT NULL CHECK (storage_mode IN ('global','personal')),
  drive_file_id text NOT NULL,
  name text NOT NULL,
  mime_type text NOT NULL DEFAULT 'application/octet-stream',
  size_bytes bigint NOT NULL DEFAULT 0,
  kind text NOT NULL DEFAULT 'file',
  origin text NOT NULL DEFAULT 'upload',
  source text,
  source_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cloud_files_user_created_idx
  ON public.cloud_files (user_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS cloud_files_user_source_url_idx
  ON public.cloud_files (user_id, source_url) WHERE source_url IS NOT NULL;

GRANT SELECT, DELETE ON public.cloud_files TO authenticated;
GRANT ALL ON public.cloud_files TO service_role;
ALTER TABLE public.cloud_files ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cloud_files_select_own" ON public.cloud_files;
CREATE POLICY "cloud_files_select_own"
  ON public.cloud_files FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "cloud_files_delete_own" ON public.cloud_files;
CREATE POLICY "cloud_files_delete_own"
  ON public.cloud_files FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);