-- =============================================================================
-- QRIS statis merchant (mis. GoPay Merchant) untuk generator QRIS DINAMIS
-- internal. Satu baris (singleton). Admin yang mengisi payload; user yang
-- checkout hanya membaca payload untuk merender QR bernominal unik.
-- Jalankan di Supabase Dashboard -> SQL Editor.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.companion_qris (
  id             int PRIMARY KEY DEFAULT 1,
  static_payload text,
  merchant_name  text,
  merchant_city  text,
  active         boolean NOT NULL DEFAULT false,
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT companion_qris_singleton CHECK (id = 1)
);

INSERT INTO public.companion_qris (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

GRANT SELECT ON public.companion_qris TO authenticated;
GRANT INSERT, UPDATE ON public.companion_qris TO authenticated;
GRANT ALL ON public.companion_qris TO service_role;

ALTER TABLE public.companion_qris ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "companion_qris read auth" ON public.companion_qris;
CREATE POLICY "companion_qris read auth"
  ON public.companion_qris FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "companion_qris admin write" ON public.companion_qris;
CREATE POLICY "companion_qris admin write"
  ON public.companion_qris FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

NOTIFY pgrst, 'reload schema';