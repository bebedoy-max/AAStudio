-- Arsip histori notifikasi Companion.
-- Tombol "Simpan" di admin menandai semua event aktif sebagai tersimpan
-- (archived_at terisi) lalu tabel di UI dikosongkan. Data tetap ada di DB
-- dan bisa dicari lewat tombol "Cari".
-- Jalankan manual di Supabase SQL editor.

ALTER TABLE public.companion_events
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

CREATE INDEX IF NOT EXISTS companion_events_archived_at_idx
  ON public.companion_events (archived_at);

NOTIFY pgrst, 'reload schema';
