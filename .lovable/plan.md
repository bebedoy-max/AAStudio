# Token Bank & Token Manager View Toggle

## Ringkasan
- Admin punya menu baru **Token Bank** untuk menyetok API key per provider, mengatur harga, mentransfer ke user, dan meng-approve pembelian.
- User bisa membeli token dari Token Bank lewat alur checkout yang sudah ada (upload bukti transfer → admin approve → key otomatis masuk ke Token Manager user).
- Token Manager: setiap panel provider mendapat tombol **View** (default sembunyi) supaya panel ringkas walau banyak key.

## Perubahan UI

### 1. Token Manager (`/manage/tokens`)
- Semua panel (Brain, Weavy, Wavespeed, Magnific, Eleven, Render) default hanya menampilkan ringkasan (jumlah key, status). Tombol "View (n)" untuk expand daftar key.
- Tambah tombol "Beli Token dari Bank" di header → membuka dialog katalog Token Bank.

### 2. Sidebar
- Admin group tambah: **Token Bank** → `/admin/token-bank`.

### 3. Halaman Admin `/admin/token-bank` (baru)
Tab per provider. Setiap tab:
- Form tambah key (bulk, 1 per baris) + label opsional.
- Tabel stok: label, key (masked/reveal), status (available/assigned), tombol Delete / Transfer.
- Panel harga: input harga per key (IDR), toggle aktif.
- Dialog Transfer: pilih user (search email) → 1 klik pindahkan 1 key.
- Tab "Riwayat" transaksi.

### 4. Dialog Beli Token (user)
Reuse pola `checkout-dialog`:
- Katalog: hanya provider dengan `is_active=true`, `stok>0`, `harga>0`.
- User pilih provider + qty, isi metode pembayaran + upload bukti → buat `purchase_request` bertype `token_bank`.
- Setelah admin approve di `/admin/requests`, sistem otomatis pull N key available dari `token_bank_keys`, mark `assigned`, append ke `user_tokens` (encrypted).

## Perubahan DB (migration)

```sql
CREATE TYPE public.bank_provider AS ENUM
  ('brain','weavy','wavespeed','magnific','eleven','shotstack','creatomate');

CREATE TABLE public.token_bank_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider bank_provider NOT NULL,
  key_value text NOT NULL,      -- disimpan plaintext di tabel admin-only (RLS ketat)
  label text,
  status text NOT NULL DEFAULT 'available',  -- available|assigned|disabled
  assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  assigned_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.token_bank_prices (
  provider bank_provider PRIMARY KEY,
  price_idr integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.token_bank_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key_id uuid REFERENCES public.token_bank_keys(id) ON DELETE SET NULL,
  provider bank_provider NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL,           -- 'transfer' | 'purchase'
  price_idr integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);

ALTER TABLE public.purchase_requests
  ADD COLUMN IF NOT EXISTS request_kind text NOT NULL DEFAULT 'subscription',
  ADD COLUMN IF NOT EXISTS token_provider bank_provider,
  ADD COLUMN IF NOT EXISTS token_qty integer;
```
GRANTs: token_bank_keys & transactions → `authenticated` (RLS admin-only). token_bank_prices → `SELECT TO authenticated` (semua user melihat harga), `ALL` admin. Semua tabel `service_role` ALL.

RLS:
- `token_bank_keys`: hanya admin (has_role) untuk semua operasi.
- `token_bank_prices`: SELECT semua authenticated, INSERT/UPDATE/DELETE admin.
- `token_bank_transactions`: admin lihat semua; user lihat baris `user_id = auth.uid()`.

## Server functions (`src/lib/token-bank/bank.functions.ts`)
- `listBankInventory()` — admin: semua key + count per provider.
- `addBankKeys({provider, keys[]})` — admin bulk insert.
- `deleteBankKey({id})` — admin.
- `setBankPrice({provider, price_idr, is_active})` — admin upsert.
- `listBankPrices()` — public authenticated: dipakai user untuk katalog & admin.
- `transferBankKey({keyId, userEmail})` — admin: cari user, mark assigned, append ke `user_tokens` (decrypt→append→encrypt via `crypto.server`), insert transaksi.
- `fulfillTokenPurchase({purchaseRequestId})` — admin: dipanggil saat approve di halaman requests bila `request_kind='token_bank'`. Ambil N key available, transfer ke user.

Semua pakai `requireSupabaseAuth` + cek `has_role('admin')` untuk operasi admin, kecuali `listBankPrices`.

## Perubahan file
- **create** `supabase/migrations/<ts>_token_bank.sql`
- **create** `src/lib/token-bank/bank.functions.ts`
- **create** `src/routes/admin.token-bank.tsx`
- **create** `src/components/token-bank/buy-dialog.tsx`
- **create** `src/components/token-bank/transfer-dialog.tsx`
- **edit** `src/components/app-sidebar.tsx` (link admin baru)
- **edit** `src/routes/manage.tokens.tsx` (View toggle per panel + tombol Beli)
- **edit** `src/routes/admin.requests.tsx` (approve → jalankan `fulfillTokenPurchase` bila kind=token_bank)
- **edit** `src/components/checkout-dialog.tsx` (support `request_kind='token_bank'` untuk bundle token)

## Catatan
- Key disimpan plaintext di `token_bank_keys` karena butuh dibaca admin, lalu di-encrypt saat masuk ke `user_tokens`. RLS admin-only + service_role = tidak bisa dibaca user biasa.
- Untuk provider Weavy/Brain/Eleven yang formatnya array of object di localStorage user, server fn akan parse existing JSON dan append entry baru (mengikuti format masing-masing panel).
- Transfer manual bypass pembayaran; pembelian selalu lewat checkout + approval, jadi ledger stok bank baru turun saat admin klik Approve.
