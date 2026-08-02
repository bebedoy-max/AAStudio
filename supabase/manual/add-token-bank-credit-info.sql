-- Persist the last credit/validity check per Token Bank key so the admin
-- table keeps showing credit info after a reload, until the next check.
ALTER TABLE public.token_bank_keys
  ADD COLUMN IF NOT EXISTS credit_status text,
  ADD COLUMN IF NOT EXISTS credit_detail text,
  ADD COLUMN IF NOT EXISTS credit_checked_at timestamptz;
