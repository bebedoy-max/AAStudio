# Deploy ke Vercel dengan Supabase Pribadi

Panduan ringkas supaya app jalan di `https://aacreative.vercel.app` dengan
Supabase project kamu sendiri (`qlsczwntaxxxmvcxtxzu`) — 100% mandiri.

---

## 1. Push ke GitHub

Dari root project:

```bash
git init                       # kalau belum ada
git add .
git commit -m "Migrate ke Supabase pribadi"
git branch -M main
git remote add origin https://github.com/<username>/<repo>.git
git push -u origin main
```

> Pastikan `.env` / `.env.local` **tidak** ke-commit (sudah di-ignore lewat
> `.gitignore` default). Yang perlu masuk repo cuma `.env.example`.

---

## 2. Import ke Vercel

1. https://vercel.com/new → pilih repo GitHub kamu.
2. Framework Preset: **TanStack Start** (dipaksa juga lewat `vercel.json`).
3. Build Command & Output Directory: biarkan default.
4. **Jangan** klik Deploy dulu — set env dulu (step 3).

---

## 3. Set Environment Variables di Vercel

Project Settings → **Environment Variables** → tambahkan semuanya untuk
scope **Production, Preview, Development**:

| Name                          | Value                                                   |
| ----------------------------- | ------------------------------------------------------- |
| `VITE_SUPABASE_URL`           | `https://qlsczwntaxxxmvcxtxzu.supabase.co`              |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | anon key dari Supabase → Settings → API               |
| `VITE_SUPABASE_PROJECT_ID`    | `qlsczwntaxxxmvcxtxzu`                                  |
| `SUPABASE_URL`                | `https://qlsczwntaxxxmvcxtxzu.supabase.co`              |
| `SUPABASE_PUBLISHABLE_KEY`    | anon key (sama)                                         |
| `SUPABASE_SERVICE_ROLE_KEY`   | service_role key (RAHASIA)                              |
| `SUPABASE_PROJECT_ID`         | `qlsczwntaxxxmvcxtxzu`                                  |

Kalau ada API key lain (ElevenLabs, Magnific, dst.) tambahkan juga di sini.

---

## 4. Aktifkan Google OAuth di Supabase

1. https://supabase.com/dashboard/project/qlsczwntaxxxmvcxtxzu/auth/providers
2. Klik **Google** → toggle **Enable Sign in with Google**.
3. Isi:
   - **Client ID** — dari Google Cloud Console
   - **Client Secret** — dari Google Cloud Console
4. **Save** (wajib — kalau tidak, toggle bisa balik OFF diam-diam).

### Google Cloud Console
- APIs & Services → Credentials → OAuth Client ID (Web application)
- **Authorized redirect URIs**:
  ```
  https://qlsczwntaxxxmvcxtxzu.supabase.co/auth/v1/callback
  ```

### URL Configuration di Supabase
Authentication → **URL Configuration**:
- **Site URL**: `https://aacreative.vercel.app`
- **Redirect URLs** (tambah semua):
  ```
  https://aacreative.vercel.app/**
  http://localhost:8080/**
  ```

---

## 5. Deploy

Klik **Deploy** di Vercel. Setelah selesai, buka
`https://aacreative.vercel.app` → klik **Lanjutkan dengan Google**.

Flow yang benar:
```
klik → https://qlsczwntaxxxmvcxtxzu.supabase.co/auth/v1/authorize?provider=google
     → consent Google
     → callback ke Supabase
     → redirect balik ke https://aacreative.vercel.app/
     → session aktif, user pertama otomatis jadi admin
```

---

## 6. Verifikasi cepat

Tes endpoint langsung di browser:
```
https://qlsczwntaxxxmvcxtxzu.supabase.co/auth/v1/authorize?provider=google
```
- Muncul consent Google → ✅ konfigurasi benar.
- Muncul JSON `"Unsupported provider: missing OAuth secret"` → Client ID /
  Secret belum ke-save di Supabase (ulangi step 4).

---

## Catatan penting

- Semua kode auth sudah pakai Supabase native (`supabase.auth.signInWithOAuth`).
- Vercel harus membaca project sebagai **TanStack Start**, bukan Vite statis;
  `vite.config.ts` sudah memakai Nitro preset Vercel dan `vercel.json` sudah
  memaksa framework yang benar.
- User pertama yang login otomatis dapat role `admin` (via trigger
  `handle_new_user` yang sudah ada di migration kamu).
