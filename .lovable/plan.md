## Ringkasan

Menambahkan Leonardo.ai sebagai provider baru, mengikuti pola persis provider **Framia** (yang juga pakai reverse-engineered Bearer JWT + proxy CORS server-side). Karena token JWT dari `app.leonardo.ai` **expired setiap ~1 jam**, integrasi ini fokus pada storage multi-token, auto-rotate, dan status expired jelas di UI supaya user tahu kapan harus paste ulang.

## Scope (bertahap)

Fase 1 (dibangun sekarang) — **fondasi + Text-to-Image**:
- Token storage + Token/API Manager entry (Leonardo card)
- Server proxy `/api/public/leonardo` (forward Bearer + Origin `https://app.leonardo.ai`)
- Provider client `src/lib/providers/leonardo.ts` (auth check, saldo/subscription, rotation)
- Halaman `Generate → Leonardo (Text-to-Image)` dengan pilihan model (Phoenix, Lucid, Kino, dll) + galeri hasil

Fase 2 (setelah Fase 1 stabil, dibuat menyusul):
- Motion / Image-to-Video (SVD)
- Universal Upscaler
- Elements / Style Reference

Alasan bertahap: 4 fitur di sekali jalan = permukaan reverse-engineered yang besar, risiko regresi tinggi. Fase 1 memvalidasi jalur auth+proxy dulu; setelah itu Fase 2–4 tinggal tambah endpoint pakai fondasi yang sama.

## File yang dibuat/diubah

**Baru:**
```text
src/routes/api/public/leonardo.ts        proxy: forward path ke app-api atau cloud API Leonardo, inject Bearer + Origin
src/lib/providers/leonardo.ts            client: storage multi-key, JWT parse (exp, email), balance/subscription, rotation helper
src/routes/generate.leonardo.tsx         UI text-to-image (prompt, model, size, num, gallery)
```

**Diubah:**
```text
src/lib/tokens/sync.functions.ts         + "aatools.leonardo.keys" ke ALLOWED_TOKEN_KEYS
src/routes/manage.tokens.tsx             + card provider "Leonardo" (paste JWT, cek, hapus, multi-key)
src/components/app-sidebar.tsx           + link "Leonardo" di grup Generate
```

## Detail teknis

**Auth**: Bearer JWT (Cognito ID token). Token yang user paste akan di-decode client-side untuk ambil `exp` + `email`, ditampilkan di UI supaya user tahu sisa waktu. Tidak ada refresh otomatis — token dari session web tidak bisa diperpanjang tanpa OAuth flow Cognito, jadi UI hanya menandai "expired" dan minta paste ulang.

**Proxy** (`/api/public/leonardo`): body `{ path, method, body }`, whitelist path prefix `/api/rest/v1/` dan `/graphql`, header forward: `Authorization: Bearer <token>`, `Origin: https://app.leonardo.ai`, `Referer: https://app.leonardo.ai/`. CORS response `*`.

**Rotate**: sama seperti Framia — 401/403/expired → coba token berikutnya. Token dengan `exp < now` di-skip.

**Endpoint Text-to-Image**: `POST /api/rest/v1/generations` (standard REST Leonardo pakai JWT juga karena app internal memakainya). Polling `GET /api/rest/v1/generations/{id}` sampai `status=COMPLETE`.

**Model catalog** (Fase 1, subset): Phoenix 1.0, Lucid Origin, Kino XL, Anime XL, FLUX Dev — id model diambil dari response `/platformModels` saat pertama load, di-cache di localStorage.

## Yang eksplisit **tidak** dikerjakan sekarang

- Motion/I2V, Upscaler, Elements (Fase 2+)
- Refresh token otomatis via Cognito (butuh flow login penuh, di luar scope)
- Menyimpan JWT lama yang user sudah share di chat — user diminta login ulang dan paste token baru; token yang sudah bocor di chat tidak dipakai

## Konfirmasi

Lanjut bangun Fase 1 dengan rencana di atas? Atau mau saya sertakan Upscaler juga di Fase 1 (paling ringan setelah T2I)?
