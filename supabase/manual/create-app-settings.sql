-- =============================================================================
-- App-wide settings (single-row config), used by public pages such as
-- Help Center → Kontak Support. Editable only by admin.
-- Jalankan di Supabase Dashboard → SQL Editor.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.app_settings (
  id            int PRIMARY KEY DEFAULT 1,
  support_email text,
  support_phone text,
  support_whatsapp text,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT app_settings_singleton CHECK (id = 1)
);

INSERT INTO public.app_settings (id) VALUES (1)
  ON CONFLICT (id) DO NOTHING;

GRANT SELECT ON public.app_settings TO anon, authenticated;
GRANT INSERT, UPDATE ON public.app_settings TO authenticated;
GRANT ALL ON public.app_settings TO service_role;

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "app_settings read all" ON public.app_settings;
CREATE POLICY "app_settings read all"
  ON public.app_settings FOR SELECT USING (true);

DROP POLICY IF EXISTS "app_settings admin write" ON public.app_settings;
CREATE POLICY "app_settings admin write"
  ON public.app_settings FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'admin'
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'admin'
  ));

NOTIFY pgrst, 'reload schema';
