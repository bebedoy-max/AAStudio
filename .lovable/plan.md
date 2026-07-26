## Ringkasan

Menambah **Leonardo** sebagai provider video di aplikasi, mengikuti pola yang sudah jalan untuk Leonardo Image (proxy `/api/public/leonardo` + JWT rotation + upload init‑image). Model video yang dimasukkan sesuai screenshot yang dilampirkan (Featured 4 + Other Models).

## Model yang dimasukkan

Featured (tab Video di app.leonardo.ai):
- Gemini Omni Flash (`gemini-omni-flash`)
- Seedance 2.0 Mini (`seedance-2.0-mini`)
- Grok Imagine 1.5 (`grok-imagine-1.5`)
- Wan 2.6 (`wan-2.6`)
- Veo 3.1 Lite (`veo-3.1-lite`)
- Veo 3.1 Fast (`veo-3.1-fast`)

Other Models:
- Seedance 2.0 (`seedance-2.0`)
- Seedance 2.0 Fast (`seedance-2.0-fast`)
- Kling Video O3 Omni (`kling-o3-omni`)
- Kling 2.6 (`kling-2.6`)

Parameter per model:
- Duration: 4s / 5s / 6s / 8s / 10s (di‑gate per model — mis. Gemini Omni Flash cuma 5/10, Veo cuma 4/6/8)
- Resolusi: 720p / 1080p (kalau model support HD)
- Audio: on/off (Veo, Wan, Kling)
- Aspect ratio: 16:9 / 9:16 / 1:1

## File yang dibuat / diubah

**Baru:**
```text
src/lib/providers/leonardo-video.ts        submit + poll v2 generations untuk video,
                                           katalog model + parameter valid per model,
                                           runner runLeonardoI2V / runLeonardoT2V
                                           (pakai runLeonardoWithRotation yang sudah ada)
```

**Diubah:**
```text
src/lib/providers/generate-i2v.ts          + provider "leonardo": upload image via
                                           uploadLeonardoInitImage → submit video
                                           dengan image reference id, polling sampai
                                           COMPLETE, ambil URL video
src/lib/providers/generate-motion.ts       (kalau Leonardo dukung motion/reference video,
                                           kalau tidak: throw "Leonardo tidak support
                                           motion control, pakai i2v" — mirror pola Magnific)
src/routes/generate.image-to-video.tsx     + entry "leonardo" di I2V_CATALOG,
                                           + LEONARDO_QUALITY map (duration/reso/audio)
src/routes/generate.motion.tsx             + provider leonardo di dropdown (kalau applicable,
                                           kalau tidak skip — motion=orientasi video ref)
src/routes/manage.routing.tsx              + Leonardo di daftar provider "video"
                                           (biar user bisa set default routing)
src/routes/generate.leonardo.tsx           + tab / section baru "Video" — bisa T2V (prompt
                                           only) atau I2V (upload image). Tetap satu route
                                           supaya sejalan dengan halaman Leonardo image
                                           yang sudah ada.
```

## Detail teknis

**Endpoint**: `POST /api/rest/v2/generations` (sama dengan image) — Leonardo pakai discriminator `model=<slug>` dengan parameter `type=video`, `duration_ms`, `resolution`, `aspect_ratio`, `audio`, dan `guidances.image_reference` untuk I2V. Slug diambil dari URL `app.leonardo.ai/generate?model=...` (screenshot). Fallback attempts (mirror pola gpt-image-2) kalau schema per‑model beda.

**Polling**: `GET /api/rest/v1/generations/{id}` — tunggu `status=COMPLETE`, ambil `generated_images[0].url` atau `motionMP4URL` (Leonardo memakai key ini untuk output video di v1 Motion; kita coba dua‑duanya).

**Auth & rotation**: reuse `runLeonardoWithRotation` + `uploadLeonardoInitImage` yang sudah ada. Token expired auto‑skip, credit habis (402/insufficient) auto‑rotate ke JWT berikutnya.

**Routing di menu Motion Control**: model motion‑control butuh image + video referensi + orientasi kamera. Leonardo tidak expose recipe seperti Weavy/Framia untuk itu, jadi provider "leonardo" di menu Motion Control akan throw pesan jelas "Leonardo tidak mendukung Motion Control (image+video ref) — pakai menu Image → Video". Ini konsisten dengan behaviour Magnific.

**T2V**: baru di halaman `generate.leonardo.tsx` — form prompt + model + duration + reso, submit tanpa image reference, hasil masuk gallery.

## Yang eksplisit **tidak** dikerjakan

- Motion Control (image+video ref) di provider Leonardo — di luar cakupan
- Refresh token Cognito otomatis (tetap paste JWT manual seperti sekarang)
- Menu bulk untuk video Leonardo (kalau dibutuhkan menyusul)

## Konfirmasi

Lanjut dengan rencana ini? Atau ada model tambahan yang mau dimasukkan / model yang mau di‑drop dari list?
