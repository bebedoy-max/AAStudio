-- =============================================================================
-- Jalankan di Supabase Dashboard -> SQL Editor.
-- Label many-to-many untuk user (VIP / VVIP), tampil sebagai badge di
-- halaman Profile + kolom di panel Manajemen User.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.user_tags (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tag         text NOT NULL CHECK (tag IN ('vip','vvip')),
  assigned_by uuid REFERENCES auth.users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, tag)
);

CREATE INDEX IF NOT EXISTS user_tags_user_idx ON public.user_tags(user_id);

GRANT SELECT ON public.user_tags TO authenticated;
GRANT ALL    ON public.user_tags TO service_role;

ALTER TABLE public.user_tags ENABLE ROW LEVEL SECURITY;

-- User bisa lihat tag miliknya sendiri; admin bisa lihat semua tag.
DROP POLICY IF EXISTS "user_tags_select" ON public.user_tags;
CREATE POLICY "user_tags_select"
  ON public.user_tags FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

-- Hanya admin yang bisa menambah/menghapus tag.
DROP POLICY IF EXISTS "user_tags_admin_write" ON public.user_tags;
CREATE POLICY "user_tags_admin_write"
  ON public.user_tags FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));