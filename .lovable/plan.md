## Tujuan
Sesuaikan node Weavy di aplikasi dengan yang ada di web weavy.com:
1. Pisahkan **ChatGPT Images 2.0** (T2I, prompt only) vs **ChatGPT Images 2.0 Edit** (multi-image + prompt) — sekarang keduanya masih pakai nama sama "Image GPT 2" dan params tidak lengkap.
2. Tambahkan pilihan **Resolution/Size** (1024², 1536×1024, 1024×1536, 2048², 2048×1152, 3840×2160, 2160×3840, auto) sesuai dropdown Weavy — sekarang hanya ada Low/Medium/High tanpa pilihan ukuran.
3. Perbaiki angka konsumsi credit sesuai Weavy (contoh: high @ 2160×3840 = **37 credits**, bukan 60).
4. Tambahkan model **Seedream Edit** dengan varian **V4.0 / V4.5 / V5.0 / V5.0 Pro** dan slot multi-image (sampai 5+ ref) ke menu yang pakai image edit.

## Ruang lingkup per menu
| Menu | Model yang berubah | Alur |
|------|-------------------|------|
| Text-to-Image (`/generate/leonardo`) | ChatGPT Images 2.0 (Weavy) | text-only, tambah dropdown Resolution |
| Bulk Fashion (`/generate/bulk-fashion`) | ChatGPT Images 2.0 Edit (Weavy) + Seedream Edit (Weavy) | 2 image (char + outfit) + prompt |
| Storyboard (`/generate/storyboard`) | ChatGPT Images 2.0 Edit (Weavy) + Seedream Edit (Weavy) | N image ref (max 6) + prompt |

Seedream Edit **tidak** ditambahkan ke T2I karena Seedream V5.0 Edit adalah model edit (butuh image reference); T2I hanya text prompt.

## Perubahan file
1. **`src/lib/providers/weavy-image.ts`** — T2I:
   - Rename display "ChatGPT Image" → "ChatGPT Images 2.0"
   - Terima format `quality@WIDTHxHEIGHT` (mis. `high@2160x3840`); kirim `image_size: { width, height }` ke fal (object form yang dipakai Weavy) untuk ukuran pixel; fallback ke enum (`square`/`portrait_16_9`/dll) untuk `auto`.
   - Hapus dummy image node — GPT-Image-2 T2I di Weavy hanya butuh prompt.

2. **`src/lib/providers/weavy-bulk-fashion.ts`** — Edit:
   - GPT Image 2: ganti model id `openai/gpt-image-2` → `openai/gpt-image-2/edit`, rename ke "ChatGPT Images 2.0 Edit", pakai param `image_urls` + `quality` + `image_size` (object).
   - Tambah builder Seedream V5 Edit: model id `fal-ai/bytedance/seedream/v5/edit`; params `image_urls`, `prompt`, `model_version` (`v40`/`v45`/`v50`/`v50-pro`), `enhance_prompt_mode` (`standard`), `num_images: 1`.

3. **`src/lib/providers/weavy-storyboard.ts`** — Edit multi-ref:
   - Rename display "ChatGPT Image Edit" → "ChatGPT Images 2.0 Edit"; tambah param `image_size` (object) selain `quality`.
   - Tambah builder Seedream V5 Edit dengan N image_urls (max 6).

4. **`src/lib/providers/image-catalog.ts`** — catalog Weavy T2I:
   - Ganti label ke "ChatGPT Images 2.0 (Weavy)".
   - Quality list jadi kombinasi qualitas×ukuran: `low@1024x1024`, `medium@1024x1024`, `high@1024x1024`, `medium@1536x1024`, `high@1536x1024`, `medium@2048x2048`, `high@2048x2048`, `high@3840x2160`, `high@2160x3840`, dsb.
   - Label credit sesuai Weavy: 1024² low ~5 / medium ~11 / high ~20; 1536×1024 medium ~13 / high ~24; 2048² medium ~17 / high ~30; 3840×2160 & 2160×3840 high **~37**. (Angka ini dikalibrasi dari data point yang terlihat di screenshot; low/medium untuk ukuran besar diinterpolasi. Bila user punya matriks resmi Weavy nanti tinggal isi ulang.)

5. **`src/routes/generate.bulk-fashion.tsx`** — `MODEL_CATALOG.weavy`:
   - Rename `gptimage2` → "ChatGPT Images 2.0 Edit (Weavy)" dan ganti list quality ke qualitas×resolution seperti di atas.
   - Tambah 4 entry Seedream Edit (Weavy): V4.0 (~8 cr), V4.5 (~9 cr), V5.0 (~10 cr), V5.0 Pro (**12 cr** — sesuai screenshot).

6. **`src/routes/generate.storyboard.tsx`** — `SB_MODELS.weavy`:
   - Perubahan sama dengan bulk-fashion (rename + resolution matrix + tambah Seedream Edit 4 tier).
   - Cabang provider Weavy di generator: tambah `modelKey.startsWith("seedream")` supaya routing storyboard mengarah ke builder Seedream V5 di `weavy-storyboard.ts`.

## Catatan teknis
- `image_size` di fal-ai/openai/gpt-image-2 mendukung dua bentuk: enum (`square`, `portrait_16_9`, dll.) dan object `{ width, height }`. Kita pakai object form supaya cocok 1:1 dengan pilihan Weavy (mis. 2160×3840).
- Untuk Seedream, model id `fal-ai/bytedance/seedream/v5/edit` adalah nama endpoint fal yang dipakai Weavy untuk node "Seedream V5.0 Edit" (varian V4.0/V4.5/V5.0/V5.0 Pro dipilih via param `model_version`). Kalau ternyata Weavy pakai id lain, tinggal ubah 1 konstanta di builder — struktur node & wiring sama.
- Angka credit yang belum ada di screenshot memakai estimasi konservatif yang deket dengan skala Weavy; label tetap pakai "~". Kalau user punya tabel resmi tinggal update konstanta di catalog & builder tanpa nyentuh UI.

## Verifikasi
Setelah edit:
- `bunx tsgo --noEmit` untuk pastikan tipe aman.
- Coba generate di menu T2I (Weavy GPT `high@2160x3840`) — payload harus punya `image_size: { width: 2160, height: 3840 }` dan tidak ada `image_urls` kosong.
- Bulk fashion & storyboard — payload GPT harus pakai endpoint `openai/gpt-image-2/edit`; entry Seedream muncul di dropdown model.
