-- =============================================================================
-- Provider on/off (admin) + Global Brain fallback.
-- Jalankan di Supabase Dashboard → SQL Editor.
-- =============================================================================

-- 1) Provider yang bisa dinonaktifkan sementara oleh admin -------------------
CREATE TABLE IF NOT EXISTS public.provider_settings (
  id         text PRIMARY KEY,
  enabled    boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.provider_settings TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.provider_settings TO authenticated;
GRANT ALL ON public.provider_settings TO service_role;

ALTER TABLE public.provider_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "provider_settings read all" ON public.provider_settings;
CREATE POLICY "provider_settings read all"
  ON public.provider_settings FOR SELECT USING (true);

DROP POLICY IF EXISTS "provider_settings admin write" ON public.provider_settings;
CREATE POLICY "provider_settings admin write"
  ON public.provider_settings FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'));

-- 2) Global Brain (key platform, hanya dibaca server) ------------------------
CREATE TABLE IF NOT EXISTS public.global_brain (
  id          int PRIMARY KEY DEFAULT 1,
  enabled     boolean NOT NULL DEFAULT false,
  gemini_keys text[] NOT NULL DEFAULT '{}',
  openai_keys text[] NOT NULL DEFAULT '{}',
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT global_brain_singleton CHECK (id = 1)
);

INSERT INTO public.global_brain (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

GRANT SELECT, INSERT, UPDATE ON public.global_brain TO authenticated;
GRANT ALL ON public.global_brain TO service_role;

ALTER TABLE public.global_brain ENABLE ROW LEVEL SECURITY;

-- Hanya admin yang boleh baca/tulis key global.
DROP POLICY IF EXISTS "global_brain admin only" ON public.global_brain;
CREATE POLICY "global_brain admin only"
  ON public.global_brain FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'));

-- Semua user cukup tahu "aktif / tidak", bukan isi key-nya.
CREATE OR REPLACE FUNCTION public.global_brain_enabled()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((SELECT enabled FROM public.global_brain WHERE id = 1), false)
     AND COALESCE((SELECT COALESCE(array_length(gemini_keys, 1), 0) + COALESCE(array_length(openai_keys, 1), 0) FROM public.global_brain WHERE id = 1), 0) > 0;
$$;

GRANT EXECUTE ON FUNCTION public.global_brain_enabled() TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
