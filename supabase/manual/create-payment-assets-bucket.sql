-- Storage bucket used by admin.payments page to upload QRIS / bank logo images.
-- Apply via Supabase SQL editor.

INSERT INTO storage.buckets (id, name, public)
VALUES ('payment-assets', 'payment-assets', false)
ON CONFLICT (id) DO NOTHING;

-- Admins can fully manage the bucket contents.
DROP POLICY IF EXISTS "payment_assets_admin_all" ON storage.objects;
CREATE POLICY "payment_assets_admin_all"
  ON storage.objects FOR ALL
  TO authenticated
  USING (bucket_id = 'payment-assets' AND public.has_role(auth.uid(), 'admin'))
  WITH CHECK (bucket_id = 'payment-assets' AND public.has_role(auth.uid(), 'admin'));

-- All authenticated users can read (signed URLs are generated in the app).
DROP POLICY IF EXISTS "payment_assets_read_authenticated" ON storage.objects;
CREATE POLICY "payment_assets_read_authenticated"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'payment-assets');
