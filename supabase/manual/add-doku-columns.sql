-- Adds DOKU (Jokul) fields to purchase_requests + generic payment routing.
-- Run manually in Supabase SQL editor.

ALTER TABLE public.purchase_requests
  ADD COLUMN IF NOT EXISTS payment_provider text,            -- 'midtrans' | 'doku' | ...
  ADD COLUMN IF NOT EXISTS payment_gateway_id uuid,          -- fk ke payment_gateways.id
  ADD COLUMN IF NOT EXISTS payment_method_code text,         -- e.g. QRIS, VIRTUAL_ACCOUNT_BCA
  ADD COLUMN IF NOT EXISTS doku_invoice_number text,
  ADD COLUMN IF NOT EXISTS doku_payment_url text,
  ADD COLUMN IF NOT EXISTS doku_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS doku_raw jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS purchase_requests_doku_invoice_number_key
  ON public.purchase_requests (doku_invoice_number)
  WHERE doku_invoice_number IS NOT NULL;
