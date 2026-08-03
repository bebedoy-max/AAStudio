# Refactor Arsitektur Storage & Transfer (AAStudio)

## Endpoint penyebab bandwidth besar (sebelum)
| Endpoint | Masalah |
|---|---|
| `POST /api/public/cloud/upload` | Seluruh file (s/d 250MB) di-buffer `arrayBuffer()` di function lalu di-upload ke Drive. Byte masuk **dan** keluar server. |
| `GET /api/public/cloud/file/:id` | Setiap preview/download galeri di-stream ulang lewat server (Fast Origin Transfer per view). |
| `archiveGeneratedUrl` → `archiveRemoteUrlForUser` | Hasil AI diunduh penuh ke memori server lalu di-upload ke Drive (2× byte per hasil). |
| `/api/(public/)proxy-image` | Semua preview provider lewat server, cache lemah, tanpa ETag. |
| `/api/public/upload-catbox`, `/ffmpeg-cdn`, `/router/voice` (base64) | Relay byte / payload base64 melalui function. |

## Sesudah
```
UPLOAD   Browser ──(ticket JSON)── Vercel ──> Drive resumable session
         Browser ──────── bytes (PUT) ────────> Google Drive
         Browser ──(metadata JSON)── Vercel ── Database

DOWNLOAD Browser ── GET /api/public/cloud/file/:id ── Vercel
                 <── 302 Location: link langsung Google ──
         Browser ──────── bytes ────────> Google (tanpa Vercel)

AI       Provider ──stream──> Vercel (tanpa buffer penuh) ──> Drive
```

## Perubahan kode
- Storage abstraction: `src/lib/cloud/storage/{types,google-drive.provider.server,service.server,log.server}.ts`
  (`StorageProvider`, `UploadService`, `DownloadService`/`PreviewService`) — siap dipindah ke R2/S3/Supabase.
- Direct upload: `createCloudUploadTicket` + `finalizeCloudUpload` (server fn) dan `directUploadToCloud()` di `src/lib/cloud/client.ts`.
  Fallback otomatis ke jalur lama bila sesi gagal → fitur tidak pernah putus.
- Direct download/preview: `/api/public/cloud/file/:id` kini 302 ke link Drive langsung (izin *anyone with link*, diverifikasi HEAD + cache), dengan ETag/304 dan fallback stream (`?stream=1`).
- Arsip hasil AI di-*stream* langsung ke sesi resumable Drive (tanpa `arrayBuffer()` 250MB), fallback buffer.
- Proxy image: `Cache-Control: immutable`, ETag/Last-Modified pass-through, dukungan 304.
- Logging `[transfer] …` untuk upload/download/preview/archive.

## Estimasi penghematan
Upload user ~100% hilang dari origin; preview/download galeri ~90–95% (hanya redirect JSON ± 300 byte);
arsip hasil AI: memori function turun drastis (stream), egress ke Drive tetap 1× (bukan 2×).
Total Fast Origin Transfer diperkirakan turun **±85–95%** untuk beban media.

## Catatan keamanan
Endpoint file tetap memakai id acak; token OAuth/refresh tidak pernah dikirim ke browser
(browser hanya menerima session URL sekali pakai milik satu file). Permission cek tetap di server.

## Regression checklist
Upload file picker, galeri, generate image/video, storyboard, reff-edit, clipper, dubbing,
export/import, Drive sync (global & personal), auth — semua memakai API/URL yang sama, hanya jalur byte-nya berubah.