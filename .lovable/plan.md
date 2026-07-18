# Integrasi DOKU (Jokul) + Payment Picker di Checkout

## Ringkasan

DOKU Jokul adalah **aggregator** — satu akun DOKU sudah menyediakan banyak
metode pembayaran (VA BCA/BRI/Mandiri/BNI/Permata/CIMB, QRIS, e-wallet
OVO/DANA/LinkAja/ShopeePay, kartu kredit, Alfamart/Indomaret). Jadi tidak
perlu daftar akun VA bank satu-satu — cukup satu row `payment_gateways`
provider `doku`, dan seluruh metode di atas otomatis bisa dipakai.

Rencana dibagi 3 bagian: (1) live charge DOKU, (2) daftar metode aktif +
picker di checkout dialog, (3) webhook DOKU untuk fulfillment.

## Bagian 1 — Live charge DOKU

### Approach

Pakai **DOKU Checkout API** (`POST /checkout/v1/payment`) — endpoint tunggal
yang menerima `payment.payment_method_types` (array). Response berisi
`response.payment.url` yang kita redirect user ke sana. User pilih metode di
sisi DOKU (atau kita batasi ke satu metode kalau user sudah pilih di app).
Lebih sederhana + lebih aman dari Direct API (tidak perlu handle 3DS, VA
number generation, dsb per method).

Auth DOKU: header `Client-Id`, `Request-Id` (UUID), `Request-Timestamp`
(ISO-8601 tanpa ms), `Signature` = `HMACSHA256(secret_key, stringToSign)`
di mana `stringToSign` = concat header standar + digest body (SHA-256
base64). Ini akan dibungkus helper `signDokuRequest()`.

### File baru

- `src/lib/payments/doku.server.ts` — helper signature + `createDokuCheckout()`.
- `src/lib/payments/charge.functions.ts` — server fn `createPayment({ gatewayId, amount, method?, orderId })` yang: load gateway config → decrypt → dispatch ke handler provider (`doku` sekarang, `midtrans` menyusul). Return `{ redirectUrl, orderId, providerRef }`.
- `src/routes/api/public/doku/notification.ts` — webhook DOKU (`Notification-Signature` verify) → panggil `fulfillPurchase()` yang sama dengan Midtrans.

### File diedit

- `src/lib/payments/providers-catalog.ts` — set DOKU `liveTestSupported: true`,
  tambah field opsional `notification_token` (untuk verify webhook) dan
  `supportedMethods` list (`VIRTUAL_ACCOUNT_BCA`, `VIRTUAL_ACCOUNT_BRI`, dst).
- `src/lib/payments/gateways.functions.ts` — tambah `testDoku()` (hit
  endpoint sandbox/prod ringan `GET /orders/v1/status/{ref}` yang balas
  404 saat kredensial valid tapi order tidak ada, mirip pola Midtrans).

## Bagian 2 — Payment picker di checkout

### File baru

- `src/lib/payments/methods.functions.ts` — server fn publik
  `listActivePaymentMethods()` (tanpa auth-middleware, tidak sensitif).
  Baca `payment_gateways` where `is_active=true`, expand tiap gateway ke
  daftar metode berdasarkan catalog (`doku` → semua VA + QRIS + e-wallet;
  `midtrans` → QRIS + snap). Return
  `Array<{ gatewayId, provider, methodCode, label, iconKey }>`. Tidak
  return kredensial apapun.

### File diedit

- `src/components/checkout-dialog.tsx` + `src/components/token-bank/buy-dialog.tsx`
  — ganti tembakan langsung ke Midtrans. Tampilkan grid pilihan metode
  (icon + label), user klik salah satu → panggil `createPayment` dengan
  `{ gatewayId, method }` → redirect ke `redirectUrl`.

## Bagian 3 — Webhook & fulfillment

- `src/routes/api/public/doku/notification.ts` verify signature DOKU (HMAC
  header `Signature` atas raw body + timestamp), lalu panggil util
  `fulfillPurchase(orderId, providerRef, amount)` yang sudah dipakai
  Midtrans (di `src/lib/midtrans/fulfill.server.ts` — akan di-extract ke
  `src/lib/payments/fulfill.server.ts` supaya provider-agnostic).

## Kebutuhan dari user (dikonfigurasi via form Admin → Metode Pembayaran)

Setelah plan disetujui, saya minta Anda:

1. **Fix decrypt Midtrans dulu** — edit row Midtrans, save ulang (kalau memang mau tetap dipakai).
2. Tambah row DOKU dengan **Client ID**, **Secret Key** (dari DOKU Back Office → Integration → Configuration), dan environment sandbox/production. Optional: **Notification Token** untuk verify webhook.
3. Set **Notification URL** di DOKU Back Office ke:
   `https://project--<project-id>.lovable.app/api/public/doku/notification`

## Catatan teknis

- Semua HMAC & panggilan API DOKU jalan di server function / server route (Cloudflare Worker) — kredensial tidak pernah menyentuh browser.
- `TOKEN_ENCRYPTION_KEY` tetap sumber kebenaran untuk enkripsi config; tidak diubah oleh plan ini.
- Pilihan Direct API vs Checkout API bisa di-switch belakangan (`method_mode` per gateway) tanpa breaking change di UI.

Setujui plan ini? Kalau ada metode DOKU yang mau di-exclude (mis. kartu
kredit), sebutkan sekarang biar tidak muncul di picker.
