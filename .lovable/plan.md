
# Module Mixing — AI Post Production Studio

Modul baru pada sidebar dengan dua sub-menu: **AI Clipper** & **AI Dubbing**. Semua mengikuti pola architecture AATools (Backend Router, Queue, Memory, Project Workspace, Multi Provider) yang sudah dipakai Storyboard/Naratif/AI Influencer.

## Scope

### Sidebar
- Group baru: **Mixing** (icon Film/Scissors) berisi:
  - `AI Clipper` → `/mixing/clipper`
  - `AI Dubbing` → `/mixing/dubbing`
- Route keys baru: `mixing.clipper`, `mixing.dubbing` (ditambahkan ke `ALL_ROUTE_KEYS` supaya bisa dikunci per user, sama seperti fitur premium lain).

### AI Clipper (`/mixing/clipper`)
Layar single-page workspace:
1. **Upload panel** — drag & drop multi-video (MP4/MOV/MKV/AVI/WEBM), preview thumbnail, progress upload.
2. **Analysis panel** (dijalankan sekali user klik "Analyze"):
   - STT via `/api/router/stt`
   - Brain analysis via `/api/router/chat` (system-prompt "Video Post Production Brain") menghasilkan JSON: scenes, speakers, hooks, highlights, dead-air ranges, keyword/topic map, emotion score.
   - Score untuk Best Hook / Best Moment / Most Emotional / Most Viral / Most Educational / Most Funny / Most Affiliate Potential.
3. **Auto Clip Builder**:
   - Pilihan durasi 15/30/45/60/90/Custom
   - Auto Cutting toggle (dead air, hmm, ehh, pause, repeated, noise) — dieksekusi timeline engine.
   - Auto Reframe 9:16 / 16:9 / 1:1 / 4:5 / 21:9 dengan Face + Object Tracking (metadata timeline).
   - Auto Zoom checkbox (punch/face/dynamic/reaction).
4. **Style panel**:
   - Subtitle ON/OFF, style preset (Minimal, Modern, TikTok, CapCut, Cinematic, Anime), font/color/animation editable.
   - Transition (None/Fade/Cross Fade/Smooth/Slide/Zoom/Flash/Blur/Dip to Black/Random) + durasi (0.2–1.0).
   - Background Music preset + volume + duck voice.
   - SFX preset (Whoosh/Click/Pop/Impact/Typing/Notification).
   - Checkbox "Generate Dub" → handoff ke AI Dubbing.
5. **Timeline preview** — visual timeline hasil AI (clip in/out, subtitle track, zoom track, music track, sfx track).
6. **Render & Export** via `/api/router/render` (multi-provider); export: Clip, Subtitle (SRT/VTT), Timeline JSON, Project bundle.

### AI Dubbing (`/mixing/dubbing`)
Workspace serupa:
1. Upload video.
2. Speech Recognition → Transcript via `/api/router/stt`.
3. Translation via `/api/router/chat` (mode Literal/Natural/Localization/Affiliate/Formal/Casual) ke bahasa target (ID/EN/JP/KR/ZH/AR/ES/FR/DE/PT/…).
4. Voice generation via `/api/router/voice` (Original Voice Clone / AI Male / AI Female / Natural / Narrator / Professional / Friendly).
5. Optional Lip Sync (kalau provider mendukung — flag `capabilities.lipSync`).
6. Subtitle Original / Translated / Dual.
7. Aspect ratio 9:16/16:9/1:1/4:5 dengan auto crop.
8. Video options: Preserve / Reframe / Motion Enhancement / Color / Sharpen / Upscale / Noise Reduction.
9. Render via `/api/router/render`, export Video/Subtitle/Transcript/JSON/Project.

### Shared services (semua modular, reusable)
- **Backend Router** — server routes baru:
  - `src/routes/api/router/stt.ts` — provider chain (OpenAI Whisper → Gemini STT → fallback), retry + health check, header `x-user-openai-keys`/`x-user-gemini-keys`/`x-user-elevenlabs-keys` sesuai pola `chat.ts`.
  - `src/routes/api/router/voice.ts` — ElevenLabs → OpenAI TTS → fallback.
  - `src/routes/api/router/subtitle.ts` — burn/generate SRT/VTT (server-side text-only, video render dilempar ke `/render`).
  - `src/routes/api/router/video.ts` — analyze/enhance passthrough.
  - `src/routes/api/router/render.ts` — enqueue render job; provider chain (Wavespeed / Weavy / Magnific mengikuti provider yang sudah ada).
  - `src/routes/api/public/clipper-brain.ts` & `dubbing-brain.ts` — POST wrapper untuk brain analysis (pola sama seperti `naratif-brain.ts` yang sudah ada).
- **Queue** — `src/lib/mixing/queue.ts`: FIFO tiap job (upload, analyze, clip, render, dub, translate, voice), retry policy, concurrency limit.
- **Memory** — `src/lib/mixing/memory.ts`: simpan preferensi user (subtitle style, transition, aspect ratio, voice, language) via table `ai_influencer_memory` yang sudah ada (namespace `mixing`) — tidak perlu tabel baru.
- **Project Workspace** — `src/lib/mixing/projects.ts`: CRUD project (Original Video, Transcript, Subtitle, Timeline, Voice, Clip, Dub, History) via table `ai_content_plan` (namespace `mixing.clipper` / `mixing.dubbing`) — reuse skema yang sudah ada, tidak menambah tabel.
- **Multi Provider** — `src/lib/mixing/providers.ts`: registry provider (STT/Voice/Video/Render) + healthCheck + fallback logic, dipakai bareng `provider-health.ts` yang sudah ada.
- **Engine layer** (pure TS, testable, reusable):
  - `src/lib/mixing/timeline-engine.ts` — build/compose/split timeline dari analysis result.
  - `src/lib/mixing/subtitle-engine.ts` — SRT/VTT parse, style, animasi.
  - `src/lib/mixing/audio-engine.ts` — music duck, sfx mix hints untuk render provider.
  - `src/lib/mixing/render-engine.ts` — orchestrator antar timeline + subtitle + audio → payload ke `/api/router/render`.
- **Realtime progress** — reuse `createRunStore` pattern (`src/lib/mixing/run-store.ts`) supaya progress bertahan lintas route.

### Files created / edited

Created:
- `src/routes/mixing.tsx` (layout `<Outlet/>`)
- `src/routes/mixing.clipper.tsx`
- `src/routes/mixing.dubbing.tsx`
- `src/routes/api/router/stt.ts`
- `src/routes/api/router/voice.ts`
- `src/routes/api/router/subtitle.ts`
- `src/routes/api/router/video.ts`
- `src/routes/api/router/render.ts`
- `src/routes/api/public/clipper-brain.ts`
- `src/routes/api/public/dubbing-brain.ts`
- `src/lib/mixing/queue.ts`
- `src/lib/mixing/memory.ts`
- `src/lib/mixing/projects.ts`
- `src/lib/mixing/providers.ts`
- `src/lib/mixing/timeline-engine.ts`
- `src/lib/mixing/subtitle-engine.ts`
- `src/lib/mixing/audio-engine.ts`
- `src/lib/mixing/render-engine.ts`
- `src/lib/mixing/run-store.ts`
- `src/components/mixing/*` (Upload, TimelinePreview, StylePanel, LanguagePicker, VoicePicker, ClipList, ProjectDrawer, ProgressStrip) — komponen kecil reusable.

Edited:
- `src/components/app-sidebar.tsx` — tambah group Mixing.
- `src/lib/auth-context.tsx` — tambah `mixing.clipper` & `mixing.dubbing` ke `ALL_ROUTE_KEYS`.

### Tidak dikerjakan / batasan
- **Tidak ada database migration baru** — reuse table yang sudah ada (`ai_content_plan`, `ai_influencer_memory`).
- **Video encoding sebenarnya** dijalankan provider render (Wavespeed/Weavy). Worker Cloudflare tidak bisa ffmpeg. Timeline JSON + instruksi dikirim ke provider.
- **Lip Sync** hanya expose flag; aktivasi tergantung ketersediaan provider (mis. Sync.so / Wavespeed lipsync). Kalau provider belum ada key, UI menampilkan "Not available".
- **Face/Object tracking** dihasilkan brain (metadata koordinat) — render provider yang meng-crop; kalau provider tidak mendukung, fallback center-crop.

### Design & UX
- Ikut design language AATools: dark theme, neumorph card, gradient neon accent, font `font-display`/`font-mono` yang sudah ada, glow-pink active state.
- Layout workspace: kiri = upload/project drawer, tengah = timeline + preview, kanan = style/setting panel. Sticky progress strip di bawah.
- Realtime progress per stage (Upload → STT → Brain → Timeline → Render → Export) dengan spinner + percentage dari queue.

### Verifikasi
- Setelah implementasi, jalankan build/typecheck yang otomatis. Coba akses `/mixing/clipper` dan `/mixing/dubbing` via preview; pastikan sidebar item muncul untuk admin, dan permission-gated untuk user biasa.
