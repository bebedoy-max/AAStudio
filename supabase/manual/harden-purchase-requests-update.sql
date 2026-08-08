-- =====================================================================
-- Hardening UPDATE pada purchase_requests (temuan security audit).
--
-- Konteks:
--  * enforce-purchase-price.sql sudah memaksa `price_idr` dihitung server
--    saat INSERT, dan diakhiri dengan `DROP POLICY pr_self_update` TANPA
--    membuat policy pengganti.
--  * Padahal server function pembuat pembayaran (charge.functions.ts,
--    midtrans.functions.ts, temanqris.functions.ts) melakukan UPDATE
--    memakai klien RLS milik user (context.supabase), jadi user MEMANG
--    butuh izin UPDATE atas barisnya sendiri.
--  * RLS tidak bisa membatasi kolom, jadi kolom sensitif (harga, status,
--    hasil review) dijaga oleh trigger BEFORE UPDATE: nilainya selalu
--    dipaksa kembali ke nilai lama kecuali pemanggilnya admin/service_role.
--
-- Jalankan di SQL Editor Supabase SETELAH enforce-purchase-price.sql.
-- Idempotent: aman dijalankan berulang.
-- =====================================================================

-- 1) User boleh UPDATE barisnya sendiri (dibutuhkan alur payment link),
--    tapi hanya selama pesanan masih pending.
DROP POLICY IF EXISTS pr_self_update ON public.purchase_requests;
CREATE POLICY pr_self_update ON public.purchase_requests
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 2) Admin boleh review / ubah status.
DROP POLICY IF EXISTS pr_admin_update ON public.purchase_requests;
CREATE POLICY pr_admin_update ON public.purchase_requests
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 3) Kolom sensitif dikunci untuk non-admin (service_role & webhook tetap bebas).
CREATE OR REPLACE FUNCTION public.protect_purchase_request_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_privileged boolean;
BEGIN
  is_privileged :=
    current_setting('role', true) = 'service_role'
    OR auth.role() = 'service_role'
    OR auth.uid() IS NULL                       -- eksekusi server / trigger internal
    OR public.has_role(auth.uid(), 'admin');

  IF is_privileged THEN
    RETURN NEW;
  END IF;

  -- Klien TIDAK BOLEH mengubah harga, status, maupun jejak review.
  NEW.price_idr   := OLD.price_idr;
  NEW.status      := OLD.status;
  NEW.admin_note  := OLD.admin_note;
  NEW.reviewed_by := OLD.reviewed_by;
  NEW.reviewed_at := OLD.reviewed_at;
  NEW.user_id     := OLD.user_id;
  NEW.route_key   := OLD.route_key;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.protect_purchase_request_columns() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_protect_purchase_request_columns ON public.purchase_requests;
CREATE TRIGGER trg_protect_purchase_request_columns
  BEFORE UPDATE ON public.purchase_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_purchase_request_columns();

-- 4) Health-check: pastikan trigger harga dari enforce-purchase-price.sql aktif.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_enforce_purchase_price'
      AND tgrelid = 'public.purchase_requests'::regclass
  ) THEN
    RAISE EXCEPTION
      'trg_enforce_purchase_price TIDAK ADA — jalankan supabase/manual/enforce-purchase-price.sql dulu (harga masih bisa dimanipulasi klien).';
  END IF;
END $$;
