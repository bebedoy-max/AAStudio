-- Token Bank: admin-managed inventory of provider API keys.
-- Apply via Supabase SQL editor OR `supabase db push`.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'bank_provider') THEN
    CREATE TYPE public.bank_provider AS ENUM
      ('brain','weavy','wavespeed','magnific','eleven','shotstack','creatomate','roboneo');
  END IF;
END$$;

-- Ensure 'roboneo' exists on already-created enum (idempotent).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'bank_provider' AND e.enumlabel = 'roboneo'
  ) THEN
    ALTER TYPE public.bank_provider ADD VALUE 'roboneo';
  END IF;
END$$;

CREATE TABLE IF NOT EXISTS public.token_bank_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider public.bank_provider NOT NULL,
  key_value text NOT NULL,
  label text,
  status text NOT NULL DEFAULT 'available',
  assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  assigned_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);
CREATE INDEX IF NOT EXISTS token_bank_keys_provider_status_idx
  ON public.token_bank_keys(provider, status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.token_bank_keys TO authenticated;
GRANT ALL ON public.token_bank_keys TO service_role;
ALTER TABLE public.token_bank_keys ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "token_bank_keys_admin_all" ON public.token_bank_keys;
CREATE POLICY "token_bank_keys_admin_all"
  ON public.token_bank_keys FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE IF NOT EXISTS public.token_bank_prices (
  provider public.bank_provider PRIMARY KEY,
  price_idr integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.token_bank_prices TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.token_bank_prices TO authenticated;
GRANT ALL ON public.token_bank_prices TO service_role;
ALTER TABLE public.token_bank_prices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "token_bank_prices_read_all" ON public.token_bank_prices;
CREATE POLICY "token_bank_prices_read_all"
  ON public.token_bank_prices FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "token_bank_prices_admin_write" ON public.token_bank_prices;
CREATE POLICY "token_bank_prices_admin_write"
  ON public.token_bank_prices FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE IF NOT EXISTS public.token_bank_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key_id uuid REFERENCES public.token_bank_keys(id) ON DELETE SET NULL,
  provider public.bank_provider NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL,
  price_idr integer NOT NULL DEFAULT 0,
  purchase_request_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);
CREATE INDEX IF NOT EXISTS token_bank_tx_user_idx
  ON public.token_bank_transactions(user_id, created_at DESC);

GRANT SELECT, INSERT ON public.token_bank_transactions TO authenticated;
GRANT ALL ON public.token_bank_transactions TO service_role;
ALTER TABLE public.token_bank_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "token_bank_tx_admin_all" ON public.token_bank_transactions;
CREATE POLICY "token_bank_tx_admin_all"
  ON public.token_bank_transactions FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "token_bank_tx_user_read_own" ON public.token_bank_transactions;
CREATE POLICY "token_bank_tx_user_read_own"
  ON public.token_bank_transactions FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

ALTER TABLE public.purchase_requests
  ADD COLUMN IF NOT EXISTS request_kind text NOT NULL DEFAULT 'subscription',
  ADD COLUMN IF NOT EXISTS token_provider public.bank_provider,
  ADD COLUMN IF NOT EXISTS token_qty integer;

-- Public (authenticated) stock counts per provider.
-- Security-definer so non-admin users can see how many keys are available
-- without exposing the actual key values (RLS keeps them read-only for admins).
CREATE OR REPLACE FUNCTION public.token_bank_available_counts()
RETURNS TABLE(provider public.bank_provider, available integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT provider, COUNT(*)::int AS available
  FROM public.token_bank_keys
  WHERE status = 'available'
  GROUP BY provider;
$$;

REVOKE ALL ON FUNCTION public.token_bank_available_counts() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.token_bank_available_counts() TO authenticated;
