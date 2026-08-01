-- Creative Studio Companion (Android GoPay Merchant listener).
-- Jalankan manual di Supabase SQL editor.

-- 1. Perangkat Android yang terdaftar sebagai listener notifikasi.
CREATE TABLE IF NOT EXISTS public.companion_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id text NOT NULL UNIQUE,
  device_name text,
  android_version text,
  token_hash text NOT NULL,          -- sha256 hex dari API token (token asli tidak disimpan)
  active boolean NOT NULL DEFAULT true,
  last_seen_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.companion_devices TO service_role;
ALTER TABLE public.companion_devices ENABLE ROW LEVEL SECURITY;
-- Tidak ada policy: tabel ini hanya diakses server (service role).

-- 2. Log setiap notifikasi pembayaran yang dikirim perangkat.
CREATE TABLE IF NOT EXISTS public.companion_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id text NOT NULL,
  event_hash text NOT NULL UNIQUE,   -- sha256(device_id|amount|received_at) → anti duplikat
  amount integer NOT NULL,
  notification_title text,
  notification_text text,
  received_at timestamptz,
  matched_purchase_id uuid REFERENCES public.purchase_requests(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'unmatched', -- unmatched | matched | ambiguous | paid | error
  detail text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS companion_events_created_at_idx
  ON public.companion_events (created_at DESC);

GRANT ALL ON public.companion_events TO service_role;
ALTER TABLE public.companion_events ENABLE ROW LEVEL SECURITY;

-- 3. Nominal unik yang diharapkan untuk pencocokan mutasi GoPay Merchant.
ALTER TABLE public.purchase_requests
  ADD COLUMN IF NOT EXISTS gopay_expected_amount integer,
  ADD COLUMN IF NOT EXISTS gopay_paid_at timestamptz;

CREATE INDEX IF NOT EXISTS purchase_requests_gopay_expected_amount_idx
  ON public.purchase_requests (gopay_expected_amount)
  WHERE gopay_expected_amount IS NOT NULL;
