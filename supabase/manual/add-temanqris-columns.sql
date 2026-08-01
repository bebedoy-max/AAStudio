-- Adds TemanQRIS (https://temanqris.com) fields to purchase_requests.
-- Jalankan manual di Supabase SQL editor.

ALTER TABLE public.purchase_requests
  ADD COLUMN IF NOT EXISTS temanqris_order_id text,
  ADD COLUMN IF NOT EXISTS temanqris_link_code text,
  ADD COLUMN IF NOT EXISTS temanqris_qr_image text,      -- data:image/png;base64,...
  ADD COLUMN IF NOT EXISTS temanqris_payment_url text,   -- https://temanqris.com/p/<link_code>
  ADD COLUMN IF NOT EXISTS temanqris_total_amount integer,
  ADD COLUMN IF NOT EXISTS temanqris_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS temanqris_raw jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS purchase_requests_temanqris_order_id_key
  ON public.purchase_requests (temanqris_order_id)
  WHERE temanqris_order_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS purchase_requests_temanqris_link_code_idx
  ON public.purchase_requests (temanqris_link_code)
  WHERE temanqris_link_code IS NOT NULL;
