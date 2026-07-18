## Ringkasan
Tambah 3 fitur besar di area admin & profile:
1. Info **login terakhir** + hitung **total API key aktif** di menu Manajemen User.
2. Dialog Kelola User: assign **tag VIP/VVIP** (many-to-many), tampil sebagai badge di halaman Profile user.
3. Menu **Metode Pembayaran** jadi Payment Gateway Manager: admin bisa menambah/mengubah konfigurasi gateway (Midtrans full integrasi, provider lain simpan config + test koneksi saja).

---

## 1. Login terakhir + total API key aktif

**Server function baru** `src/lib/admin/users.functions.ts`:
- `listUsersWithStats()` → admin-only, gabungkan:
  - `auth.users.last_sign_in_at` (via `supabaseAdmin.auth.admin.listUsers`)
  - `admin_user_token_counts()` (sudah ada) → `tokens_count + bank_keys_count = total_active_keys`
- Otorisasi: verifikasi caller `has_role('admin')` dulu pakai `context.supabase` sebelum load `supabaseAdmin`.

**UI** `src/routes/admin.index.tsx`:
- Kolom baru: "Login terakhir" (relative time), "API Key Aktif" (angka total dengan tooltip breakdown per provider bila hover — data breakdown dari fungsi yang sama).

---

## 2. Badge VIP / VVIP (user_tags many-to-many)

**Migration** `supabase/migrations/…_user_tags.sql`:
```sql
CREATE TABLE public.user_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tag text NOT NULL CHECK (tag IN ('vip','vvip')),
  assigned_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, tag)
);
GRANT SELECT ON public.user_tags TO authenticated;
GRANT ALL ON public.user_tags TO service_role;
ALTER TABLE public.user_tags ENABLE ROW LEVEL SECURITY;
-- SELECT: user lihat tag miliknya, admin lihat semua
-- ALL:  admin only
```
Extensible untuk tag lain nanti (mis. `beta`, `staff`) — CHECK constraint bisa diperluas.

**Server fn**: `assignUserTag`, `removeUserTag`, `listMyTags`.

**UI**:
- Dialog Kelola User (di `admin.index.tsx`): section "Label", checkbox VIP / VVIP.
- `src/components/user-tag-badge.tsx` — badge gradient (VIP emas, VVIP ungu-emas).
- `src/routes/profile.tsx`: tampilkan badge di header profile bila user punya tag.

---

## 3. Payment Gateway Manager

Rombak `src/routes/admin.payments.tsx` yang sekarang hanya untuk metode statis (QRIS/bank/e-wallet upload logo) → jadi **Payment Gateway Settings**.

**Migration** `…_payment_gateways.sql`:
```sql
CREATE TABLE public.payment_gateways (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,          -- 'midtrans' | 'xendit' | 'doku' | ...
  label text NOT NULL,             -- nama tampilan
  environment text NOT NULL DEFAULT 'sandbox',  -- sandbox | production
  is_active boolean NOT NULL DEFAULT true,
  config_ciphertext text NOT NULL, -- JSON parameter, dienkripsi AES-GCM
  last_test_at timestamptz,
  last_test_status text,           -- ok | failed
  last_test_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_gateways TO authenticated;
GRANT ALL ON public.payment_gateways TO service_role;
ALTER TABLE public.payment_gateways ENABLE ROW LEVEL SECURITY;
-- Admin ALL; authenticated SELECT hanya (provider, label, is_active, environment) via view atau kolom terpilih di RLS.
```
Ciphertext pakai helper `src/lib/tokens/crypto.server.ts` yang sudah ada (AES-GCM + `TOKEN_ENCRYPTION_KEY`).

**Katalog provider** `src/lib/payments/providers-catalog.ts` — daftar provider + schema parameter (field, type, required, secret?). Riset yang saya kompilasi:

| Provider | Parameter kunci |
|---|---|
| **Midtrans** | merchant_id, client_key, server_key, environment (sandbox/production) |
| **Xendit** | secret_key (server), public_key (opsional), webhook_verification_token, environment |
| **DOKU** | client_id, secret_key, environment (Jokul API) |
| **Faspay** | merchant_id, merchant_code, user_id, password, environment |
| **Finpay / Finnet** | merchant_id, merchant_key, environment |
| **Espay** | merchant_id, signature_key, password, environment |
| **Winpay** | merchant_id, secret_key, environment |
| **Prismalink** | merchant_id, terminal_id, secret_key, environment |
| **iPay88 / Kaspay** | merchant_code, merchant_key, environment |
| **FirstPay** | merchant_id, api_key, environment |
| **TrueMoney** | merchant_id, api_key, secret_key, environment |
| **VA BCA** | corporate_id, va_prefix (BCA_ID), api_key, secret_key, environment |
| **VA BRI (BRIVA)** | client_id, client_secret, institution_code, brizzi_merchant_id, environment |
| **VA Mandiri** | merchant_id, client_id, client_secret, environment |
| **VA BNI** | client_id, client_secret, prefix, environment |

Field `environment` selalu ada. Parameter secret di-flag `secret: true` supaya UI mask + tidak dikirim balik ke client saat edit.

**Server functions** `src/lib/payments/gateways.functions.ts`:
- `listGateways()` — admin list (config didekripsi TIDAK dikirim balik, hanya masked preview `••••1234`).
- `upsertGateway({ id?, provider, label, environment, config })` — enkripsi lalu simpan.
- `deleteGateway({ id })`.
- `testGateway({ id })` — untuk Midtrans: panggil endpoint status dummy order (`/v2/ping` tidak resmi, gunakan `GET /v2/{fake-order}/status` → 404 = kredensial valid, 401 = kredensial salah). Untuk provider lain: cek presence semua field wajib + return "config saved, live test not implemented".

**UI** `src/routes/admin.payments.tsx`:
- List gateway aktif (provider, label, environment, status test terakhir).
- Tombol **Tambah** → dialog pilih provider dari katalog → form dinamis berdasarkan schema.
- Tombol **Edit** (field secret kosong = tidak berubah), **Test koneksi**, **Aktif/Nonaktif**, **Hapus**.
- Toast notifikasi hasil test.

**Integrasi runtime**:
- `src/lib/midtrans/midtrans.server.ts` diubah baca kredensial dari `payment_gateways` (provider='midtrans', is_active, env sesuai) sebagai fallback bila `process.env.MIDTRANS_SERVER_KEY` tidak diset. Env var tetap didahulukan agar tidak breaking.

---

## Catatan teknis
- Semua server fn admin: `.middleware([requireSupabaseAuth])` + role check via `context.supabase.rpc('has_role', ...)` sebelum akses `supabaseAdmin`.
- Enkripsi reuse `encryptString`/`decryptString` di `src/lib/tokens/crypto.server.ts` (butuh `TOKEN_ENCRYPTION_KEY` — cek `secrets--fetch_secrets` dulu, minta bila belum ada).
- Semua migration mengikuti pola GRANT + RLS + policy admin/authenticated sesuai konvensi project.
- Provider lain selain Midtrans: "test koneksi" hanya validasi format & simpan → beri label jelas di UI "Live charge belum diimplementasikan".

## Yang TIDAK termasuk iterasi ini
- Implementasi charge nyata untuk Xendit/DOKU/dll (schema + config saja).
- Webhook handler baru per provider (Midtrans webhook existing tetap).
- Migrasi data dari halaman `admin.payments` lama (upload logo QRIS/bank) — dipindah ke tab terpisah "Aset metode pembayaran" bila masih dipakai, atau dihapus. **Perlu konfirmasi**: pertahankan tab lama atau buang?
