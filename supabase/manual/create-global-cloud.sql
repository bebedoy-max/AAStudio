-- Global Cloud (Google Drive milik aplikasi) — hanya admin yang boleh mengatur.
-- Jalankan di Supabase Dashboard → SQL Editor.

CREATE TABLE IF NOT EXISTS public.global_cloud (
  id                     int PRIMARY KEY DEFAULT 1,
  enabled                boolean NOT NULL DEFAULT false,
  client_id              text,
  client_secret_cipher   text,
  refresh_token_cipher   text,
  account_email          text,
  root_folder_name       text NOT NULL DEFAULT 'AA Creative Studio',
  updated_at             timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT global_cloud_singleton CHECK (id = 1)
);

INSERT INTO public.global_cloud (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- Kredensial hanya boleh dibaca server (service role). Tidak ada akses anon/authenticated.
REVOKE ALL ON public.global_cloud FROM anon, authenticated;
GRANT ALL ON public.global_cloud TO service_role;
ALTER TABLE public.global_cloud ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
