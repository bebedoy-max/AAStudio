-- =====================================================================
-- Bucket `payment-proofs` (bukti transfer user) — didokumentasikan di repo
-- karena sebelumnya hanya dibuat manual lewat dashboard (audit blind spot).
--
-- PRIVATE bucket: dibaca lewat createSignedUrl saja.
-- Jalankan di SQL Editor Supabase. Idempotent.
-- =====================================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('payment-proofs', 'payment-proofs', false)
ON CONFLICT (id) DO UPDATE SET public = false;

-- User upload bukti ke folder miliknya sendiri: <user_id>/<file>
DROP POLICY IF EXISTS payment_proofs_owner_insert ON storage.objects;
CREATE POLICY payment_proofs_owner_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'payment-proofs'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- User baca miliknya sendiri; admin boleh baca semua (untuk verifikasi).
DROP POLICY IF EXISTS payment_proofs_read ON storage.objects;
CREATE POLICY payment_proofs_read ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'payment-proofs'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR public.has_role(auth.uid(), 'admin')
    )
  );

-- Hanya admin yang boleh menghapus bukti pembayaran (audit trail).
DROP POLICY IF EXISTS payment_proofs_admin_delete ON storage.objects;
CREATE POLICY payment_proofs_admin_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'payment-proofs' AND public.has_role(auth.uid(), 'admin'));
