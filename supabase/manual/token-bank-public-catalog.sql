-- Token Bank: buka katalog publik untuk pembeli tamu (anon).
-- Harga + jumlah stok tidak sensitif; isi key tetap tertutup (RLS admin-only).
-- Apply via Supabase SQL editor ATAU `supabase db push`.

-- Harga: anon boleh baca (read-only).
GRANT SELECT ON public.token_bank_prices TO anon;

DROP POLICY IF EXISTS "token_bank_prices_read_public" ON public.token_bank_prices;
CREATE POLICY "token_bank_prices_read_public"
  ON public.token_bank_prices FOR SELECT
  TO anon
  USING (true);

-- Jumlah stok per provider lewat security-definer function, sehingga anon
-- TIDAK pernah bisa membaca tabel token_bank_keys secara langsung.
GRANT EXECUTE ON FUNCTION public.token_bank_available_counts() TO anon;
