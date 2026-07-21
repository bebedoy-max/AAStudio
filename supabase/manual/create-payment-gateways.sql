-- =============================================================================
-- Jalankan di Supabase Dashboard -> SQL Editor.
-- Konfigurasi payment gateway yang dikelola admin lewat /admin/payments.
-- Kolom `config_ciphertext` menyimpan JSON parameter (server_key, client_key,
-- merchant_id, dll) yang dienkripsi AES-GCM dengan TOKEN_ENCRYPTION_KEY.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.payment_gateways (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider          text NOT NULL,
  label             text NOT NULL,
  environment       text NOT NULL DEFAULT 'sandbox' CHECK (environment IN ('sandbox','production')),
  is_active         boolean NOT NULL DEFAULT true,
  config_ciphertext text NOT NULL,
  masked_hint       jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_test_at      timestamptz,
  last_test_status  text,
  last_test_message text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  created_by        uuid REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS payment_gateways_provider_idx
  ON public.payment_gateways(provider, is_active);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_gateways TO authenticated;
GRANT ALL ON public.payment_gateways TO service_role;

ALTER TABLE public.payment_gateways ENABLE ROW LEVEL SECURITY;

-- Hanya admin yang boleh baca/tulis konfigurasi payment gateway.
DROP POLICY IF EXISTS "payment_gateways_admin_all" ON public.payment_gateways;
CREATE POLICY "payment_gateways_admin_all"
  ON public.payment_gateways FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));