-- =============================================================================
-- Jalankan file ini di Supabase Dashboard → SQL Editor (project qlsczwntaxxxmvcxtxzu)
-- Tujuan:
--   1. Pastikan trigger handle_new_user() ada → user berikutnya yang daftar
--      otomatis dapat role. User PERTAMA (kalau tabel user_roles masih kosong)
--      dapat role 'admin'.
--   2. Promote user yang SUDAH login jadi admin (karena mereka sign-in sebelum
--      trigger terpasang, jadi tidak ada yang jadi admin otomatis).
-- =============================================================================

-- 1. Pastikan enum + tabel dasar sudah ada (aman kalau sudah)
DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('admin', 'editor', 'user');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

-- 2. (Re)install fungsi trigger
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _first_user boolean;
BEGIN
  INSERT INTO public.profiles (id, email, display_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1))
  )
  ON CONFLICT (id) DO NOTHING;

  SELECT NOT EXISTS (SELECT 1 FROM public.user_roles) INTO _first_user;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, CASE WHEN _first_user THEN 'admin'::public.app_role ELSE 'user'::public.app_role END)
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN NEW;
END;
$$;

-- 3. (Re)install trigger di auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 4. Backfill: user yang sudah ada tapi belum punya role → kasih 'user'
INSERT INTO public.user_roles (user_id, role)
SELECT u.id, 'user'::public.app_role
FROM auth.users u
LEFT JOIN public.user_roles r ON r.user_id = u.id
WHERE r.user_id IS NULL
ON CONFLICT DO NOTHING;

-- 5. PROMOTE DIRI KAMU JADI ADMIN
--    Ganti email di bawah dengan email Google kamu.
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin'::public.app_role
FROM auth.users
WHERE email = 'GANTI_DENGAN_EMAIL_KAMU@gmail.com'
ON CONFLICT (user_id, role) DO NOTHING;

-- 6. Verifikasi
SELECT u.email, array_agg(r.role) AS roles
FROM auth.users u
LEFT JOIN public.user_roles r ON r.user_id = u.id
GROUP BY u.email
ORDER BY u.email;
