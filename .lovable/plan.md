## Content Planner — Pre-Generate Config + Auto-Fill Daily Planner

Restrukturisasi halaman `ai-influencer/planner` supaya user menentukan parameter dulu sebelum generate weekly strategy, dan hasil generate langsung mengisi Daily Planner dengan konten siap-pakai (judul, caption, hashtag, jadwal, tipe konten, platform target).

### 1. Config Card baru (di atas tombol Generate)

Tiga blok pilihan (semua persist ke `content_strategy.ratios` sebagai JSON `config` — tidak perlu schema baru):

**a. Jenis Konten (multi-select checkbox)**
- Image only
- Motion / Video (image-to-video)
- UGC Storyboard
- Carousel
- Reels / Shorts script
- (minimal 1 harus dipilih)

**b. Kategori Konten (multi-select checkbox)**
- Fashion, Beauty, Lifestyle, Personal Branding, Food, Travel, Fitness, Education, Entertainment, Affiliate/Review

**c. Target Platform (multi-select checkbox + status koneksi)**
- TikTok, Instagram, Facebook, YouTube Shorts, X/Twitter, Threads
- Setiap item cek status koneksi (dari `standard_connectors--list_connections` yang sudah ada; untuk sekarang tandai "belum terhubung" jika tidak ada). Kalau user pilih platform yang belum connect → tampilkan warning kuning di bawah tombol Generate, boleh tetap generate (jadwal disimpan sebagai draft), tapi saat waktu publish sistem akan blok + notif.

Tombol **Generate Weekly Strategy** disable sampai minimal 1 pilihan di setiap blok.

### 2. Generate Weekly Strategy → panggil Brain

Ganti `IDEA_TEMPLATES` statis dengan panggilan ke AI brain (`/api/router/chat` via `getCreativeKeys`) yang mengirim:
- Character card + personality + memory scenes (sudah ada di `src/lib/ai-influencer/brain.ts`)
- Config user (jenis, kategori, platform)
- Reference persona hasil brain-analyze (jika ada di DB)

AI mengembalikan JSON array 7-14 item (posting frequency dari ratios):
```json
[{
  "day": "Sen", "slot_time": "09:00",
  "platform": "TikTok", "content_type": "motion",
  "category": "fashion",
  "title": "...", "caption": "...", "hashtags": ["#..."],
  "image_prompt": "...", "video_reference_url": "..." // dari ref medsos untuk motion/dance
}]
```

Untuk `motion` type, brain memilih outfit dari character + video reference URL dari social refs yang sudah dianalisa sebelumnya.

Gunakan `callJsonAI` (retry + extractJson) yang sudah ada di `brain-analyze.ts` — expose lewat endpoint baru `POST /api/router/plan-weekly` supaya dedup logic parsing.

### 3. Daily Planner box — auto-fill dengan konten jadi

Ubah `QueueRow` + tabel `content_queue` untuk menyimpan konten siap-pakai. Field baru (di kolom JSON `meta` bila sudah ada, atau tambah kolom):
- `title`, `caption`, `hashtags[]`
- `content_type` (image | motion | ugc | carousel | reels)
- `category`
- `image_prompt`, `video_reference_url`

Cek dulu schema tabel di Supabase, tambah kolom `meta jsonb default '{}'` via migration bila belum ada (dengan GRANT block).

Tampilan tiap item di Queue view: card lebih besar dengan title (bold), caption 2 baris (truncate), hashtag chips, tipe konten badge, platform badge, tombol edit inline untuk **Jadwal** (`<input type="datetime-local" min={now}>` — validasi tidak boleh backdate), dan tombol "Generate Now" bila status `waiting`.

### 4. Auto-publish saat waktu tiba

- Tambah cron/interval di client (setiap 60 detik saat halaman planner/publisher terbuka) yang cek queue: item `ready` dengan `scheduled_for <= now`.
- Kalau platform target `connected` → panggil publisher (stub existing) → status `published`.
- Kalau tidak connected → status `failed` dengan `error: "medsos belum terhubung"` + toast + banner persistent di halaman "Sambungkan {platform} untuk mempublikasikan otomatis" dengan link ke `manage.tokens` / `standard_connectors--connect`.

Untuk lifecycle penuh (idea→image→motion→ready) tetap manual via tombol "Generate Now" untuk sekarang — tidak diperluas di iterasi ini untuk menjaga scope.

### File yang disentuh

- `src/routes/ai-influencer.planner.tsx` — config card, form state, tombol generate refactor, queue rendering baru, datetime picker, auto-publish poller, banner platform.
- `src/lib/ai-influencer/studio.functions.ts` — perluas `saveQueueBatch`/`updateQueueItem` untuk field `meta`, tambah `loadConfig`/`saveConfig` (atau simpan di `strategy.ratios.config`).
- `src/routes/api/router/plan-weekly.ts` (baru) — server route yang membangun prompt + panggil `callJsonAI` + return array item planner.
- `src/routes/api/router/brain-analyze.ts` — export `callJsonAI` helper (kalau belum) supaya reusable.
- Migration Supabase: `alter table content_queue add column if not exists meta jsonb default '{}'::jsonb;` + GRANT (tabel sudah ada dari fitur existing).
- `src/lib/ai-influencer/publisher-poller.ts` (baru) — hook `useAutoPublisher(queue)`.

### Out of scope (untuk iterasi berikut)

- Actual image/video generation pipeline di dalam planner (masih pakai tombol Generate Now yang mengarah ke Library).
- Real OAuth koneksi TikTok/IG (pakai status yang sudah ada di connectors).
