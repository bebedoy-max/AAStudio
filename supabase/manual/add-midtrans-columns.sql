-- Adds Midtrans QRIS fields to purchase_requests.
-- Run via Supabase SQL editor.

ALTER TABLE public.purchase_requests
  ADD COLUMN IF NOT EXISTS midtrans_order_id text,
  ADD COLUMN IF NOT EXISTS midtrans_transaction_id text,
  ADD COLUMN IF NOT EXISTS midtrans_qr_url text,
  ADD COLUMN IF NOT EXISTS midtrans_gross_amount integer,
  ADD COLUMN IF NOT EXISTS midtrans_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS midtrans_raw jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS purchase_requests_midtrans_order_id_key
  ON public.purchase_requests (midtrans_order_id)
  WHERE midtrans_order_id IS NOT NULL;

-- Existing proof_image_url stays nullable (no longer required for QRIS flow).
ALTER TABLE public.purchase_requests
  ALTER COLUMN proof_image_url DROP NOT NULL;
