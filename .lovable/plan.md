# REFF EDIT — AI Reference-Based Editing Workspace

Modul baru dengan konsep "AI Creative Director": user memberi referensi (image/video), AI mengekstrak "Reference DNA", membuat Edit Blueprint, lalu menerapkannya ke target content.

## Sidebar (baru)

Group **Reff EDIT** (icon `Wand2`/`Palette`) ditambah di `src/components/app-sidebar.tsx`:

- Image Reference Edit → `/reff-edit/image`
- Video Reference Edit → `/reff-edit/video`
- Reference Library → `/reff-edit/library`
- Edit History → `/reff-edit/history`

Group ini didaftarkan di `DEFAULT_NAV` dengan `permKey` `reff-edit.image`, `reff-edit.video`, `reff-edit.library`, `reff-edit.history` (bisa dikelola dari Admin → Pengaturan Halaman).

## Route baru

```
src/routes/reff-edit.tsx              (layout, <Outlet />)
src/routes/reff-edit.image.tsx        (Image Reference Edit workspace)
src/routes/reff-edit.video.tsx        (Video Reference Edit workspace)
src/routes/reff-edit.library.tsx      (Reference Library)
src/routes/reff-edit.history.tsx      (Edit History)
```

Layout memakai `DashboardShell` + `PageHero` konsisten dengan modul lain (mis. `generate.motion.tsx`).

## UI layout workspace (Image & Video)

Grid 3 kolom dark futuristic (AA SuperTools style):

```text
+----------------------+----------------------+----------------------+
| LEFT                 | CENTER               | RIGHT                |
| Reference Upload     | AI Analysis +        | Target Upload +      |
|  - drop zone (multi) |  Reference DNA card  |  Output Preview      |
|  - per-file:         |  Edit Blueprint      |  Output Settings     |
|    role select       |  (editable JSON/     |   (aspect, quality)  |
|    weight slider     |   scene list)        |  AI Chat Adjustment  |
|  - "Analyze"         |  "Send to Engine"    |  (revise iteratively)|
+----------------------+----------------------+----------------------+
| BOTTOM: Render Timeline (progress log per scene)                   |
+--------------------------------------------------------------------+
```

Reusable subkomponen di `src/components/reff-edit/`:
- `reference-upload.tsx` — multi-file, role (Style/Camera/Lighting/Color/Motion/Composition), weight 0–100.
- `dna-card.tsx` — render output analisa AI (visual style, palette, lighting, camera, mood, dst).
- `blueprint-editor.tsx` — daftar scene editable (duration + apply steps).
- `target-panel.tsx` — upload target + preview hasil.
- `chat-adjust.tsx` — chat AI untuk revisi ("buat lebih cinematic", dst) → memicu regenerate.
- `render-timeline.tsx` — log/progres tiap scene.

## Backend / server routes

Semua endpoint melewati AI Router yang sudah ada (`/api/router/chat`, `/api/router/image`, `/api/router/video`, `/api/router/render`) untuk provider routing + fallback + logging.

Baru:
- `src/routes/api/router/reff-analyze.ts` — POST { referenceUrls, mode: "image"|"video" }. Panggil Gemini Vision (multimodal) via router, output structured JSON = **Reference DNA**.
- `src/routes/api/router/reff-blueprint.ts` — POST { dna, target, mode }. Router chat → JSON Edit Blueprint (list of scenes).
- `src/routes/api/router/reff-image.ts` — POST { dna, blueprint, targetUrl }. Router image (Gemini Image / OpenAI Image) → apply style transfer.
- `src/routes/api/router/reff-video.ts` — POST { dna, blueprint, targetUrl }. Trigger pipeline video: AI instruction + FFmpeg pipeline (reuse `src/lib/mixing/ffmpeg-render.ts` untuk cutting/transition/color/speed).
- `src/routes/api/router/reff-adjust.ts` — POST { previousOutput, revisionPrompt } → blueprint delta + regenerate.

Upload file publik memakai `/api/public/upload-catbox` (sudah ada).

## Library & History (persistence)

Simpan ke Supabase (butuh Lovable Cloud). Tabel + RLS + grants dibuat via migrasi baru:

- `reff_edit_references` — id, user_id, name, type (image|video), category, thumbnail_url, source_url, dna jsonb, created_at.
- `reff_edit_history` — id, user_id, mode, reference_ids[], blueprint jsonb, target_url, output_url, provider_used, tokens_used, duration_ms, status, error, created_at.

Server functions (client-safe):
- `src/lib/reff-edit/references.functions.ts` — list/create/delete reference, semua via `requireSupabaseAuth`.
- `src/lib/reff-edit/history.functions.ts` — list/create history, semua via `requireSupabaseAuth`.

Grants standar (`GRANT ... TO authenticated`, `GRANT ALL ... TO service_role`), RLS `auth.uid() = user_id`.

## Provider routing

Reuse pola routing yang ada:
- Analysis (multimodal): Gemini Vision primary → OpenAI vision fallback (via router chat dengan image_url content blocks).
- Image edit: Gemini Image → OpenAI Image → provider image aktif user (`/api/router/image`).
- Video edit AI: router chat + FFmpeg (`ffmpeg-render.ts`) untuk processing layer.

Setiap request mencatat: provider_used, token_usage, processing_time, error_log ke `reff_edit_history`.

## Output Settings

- Image: Original / 1:1 / 4:5 / 9:16 / 16:9
- Video: 9:16 / 16:9 / 1:1
- Quality: Draft / Standard / High (mapping ke param provider + ffmpeg CRF)

## Integrasi cross-module

Reuse `src/lib/creative/handoff.ts`: hasil edit bisa dilempar ke Motion Control, AI Clipper, Storyboard, dll. Tombol "Kirim ke ..." di panel output.

## Scope MVP (untuk implementasi awal, 1 iterasi)

1. Sidebar entry + 4 route files dengan layout + PageHero + placeholder panels.
2. `reference-upload`, `dna-card`, `blueprint-editor`, `target-panel`, `chat-adjust`, `render-timeline` sebagai komponen fungsional (state lokal + `useSticky`).
3. Endpoint `reff-analyze` + `reff-blueprint` live (memakai `/api/router/chat` dgn Gemini vision).
4. `reff-image` live pakai `/api/router/image` yang ada.
5. `reff-video` mengembalikan blueprint + memakai pipeline FFmpeg yang sudah ada di `mixing/ffmpeg-render.ts` (basic cut+transition).
6. Reference Library & Edit History memakai localStorage dulu; migrasi Supabase menyusul (butuh Lovable Cloud enable — akan saya minta konfirmasi sebelum bikin tabel).

## Yang akan saya tanyakan sebelum full-build

- Aktifkan Lovable Cloud untuk Library/History persistent? (kalau tidak, tetap localStorage saja).
- Prefer icon sidebar: `Wand2`, `Palette`, atau `Clapperboard`?

Setelah plan disetujui, saya mulai dari sidebar + route shells + komponen UI, lalu wire endpoint router step-by-step.
