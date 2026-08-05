import { createFileRoute } from "@tanstack/react-router";

// Naratif video brain: menganalisa materi artikel → JSON scene list untuk video edukasi.
// Provider: Gemini only. Multi-key auto-rotate.
// Header: x-user-gemini-keys (comma/newline separated). Legacy: x-user-gemini-key.

type Body = {
  title?: string;
  description?: string;
  body?: string;
  aspectRatio?: string;   // "9:16" | "16:9" | "1:1"
  language?: string;      // default "id"
  maxScenes?: number;     // cap, default 8
  extraPrompt?: string;
};

// Kunci API TIDAK boleh di-hardcode di source. Semua key berasal dari request header
// x-user-openai-key dan x-user-gemini-key yang di-set user melalui Token/API Manager.
// Tidak lagi membaca env vars di server.

function isRotatable(s: number): boolean { return s === 401 || s === 403 || s === 429 || s === 402 || s >= 500; }

function redact(text: string): string {
  return text
    .replace(/AIza[A-Za-z0-9_-]{12,}/g, "AIza***")
    .replace(/AQ\.[A-Za-z0-9_-]{12,}/g, "AQ.***")
    .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, "jwt-***");
}

async function safeErrorBody(res: Response): Promise<string> {
  try {
    return redact((await res.text()).slice(0, 900));
  } catch {
    return res.statusText || "request failed";
  }
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function callGemini(key: string, system: string, user: string) {
  const models = ["gemini-2.5-flash", "gemini-flash-latest", "gemini-2.5-flash-lite", "gemini-2.0-flash"];
  let last: { ok: false; status: number; body: string } | undefined;
  for (const model of models) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: user }] }],
        generationConfig: {
          responseMimeType: "application/json",
          temperature: 1,
          topP: 0.95,
          maxOutputTokens: 32768,
        },
      }),
    });

    if (!res.ok) {
      last = { ok: false as const, status: res.status, body: `${model}: ${await safeErrorBody(res)}` };
      if (!isRotatable(res.status) && res.status !== 404) return last;
      continue;
    }
    const data = (await res.json()) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
    const text = (data.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") || "").trim();
    if (!text) {
      last = { ok: false as const, status: 502, body: `${model}: empty` };
      continue;
    }
    return { ok: true as const, text };
  }
  return last || { ok: false as const, status: 502, body: "Gemini empty" };
}

function tryParseJson(text: string): unknown {
  try { return JSON.parse(text); } catch { /* */ }
  const m = text.match(/\{[\s\S]*\}/);
  if (m) { try { return JSON.parse(m[0]); } catch { /* */ } }
  return null;
}

export const Route = createFileRoute("/api/public/naratif-brain")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const bulk = (request.headers.get("x-user-gemini-keys") || "").trim();
        const single = (request.headers.get("x-user-gemini-key") || "").trim();
        const userKeys = Array.from(new Set(
          (bulk ? bulk.split(/[\s,;]+/) : [single])
            .map((s) => s.trim())
            .filter((s) => s.length >= 10)
        ));
        // Fallback Global Brain (key platform) saat user belum punya key sendiri.
        const { loadGlobalBrainKeys } = await import("../router/chat");
        const gemini = [
          ...userKeys,
          ...(await loadGlobalBrainKeys()).gemini.filter((k) => !userKeys.includes(k)),
        ];

        let body: Body = {};
        try { body = await request.json(); } catch { /* */ }
        const title = (body.title || "").slice(0, 400);
        const description = (body.description || "").slice(0, 800);
        const material = (body.body || "").slice(0, 40000);
        const ratio = body.aspectRatio || "9:16";
        // Brain menentukan jumlah scene sendiri berdasarkan panjang & kompleksitas materi.
        const extra = (body.extraPrompt || "").slice(0, 600);

        if (!title && !material) {
          return json({ error: "Materi kosong: minimal judul atau body harus ada" }, 400);
        }

        // --- Density analysis: jumlah scene HARUS proporsional dengan isi materi. ---
        const fullText = `${title}\n${description}\n${material}`;
        const words = fullText.trim().split(/\s+/).filter(Boolean).length;
        const sentences = material.split(/(?<=[.!?])\s+/).filter((s) => s.trim().length > 25).length;
        const paragraphs = material.split(/\n{1,}/).filter((p) => p.trim().length > 60).length;
        const bullets = (material.match(/^\s*(?:[-•*–]|\d+[.)])\s+/gm) || []).length;
        const numbers = (material.match(/\b\d[\d.,]*\s?(?:%|persen|juta|miliar|ribu|triliun|orang|tahun|kali)\b/gi) || []).length;
        const quotes = (material.match(/["“”']{1}[^"“”']{25,}["“”']{1}/g) || []).length;
        // Estimasi jumlah "point" yang layak jadi scene.
        const infoPoints = Math.max(paragraphs, bullets, Math.ceil(sentences / 2));
        const estMin = Math.max(3, Math.min(24, Math.round(words / 110)));
        const estMax = Math.max(estMin + 2, Math.min(30, Math.round(words / 55) + 2));
        const targetLow = Math.max(3, Math.min(estMin, infoPoints || estMin));
        const targetHigh = Math.max(targetLow + 1, Math.min(30, Math.max(estMax, infoPoints + 3)));
        const densityBrief = `- Panjang materi: ~${words} kata, ~${sentences} kalimat inti, ~${paragraphs} paragraf, ${bullets} bullet/list, ${numbers} data angka, ${quotes} kutipan.
- Estimasi jumlah point/informasi berbeda yang layak divisualkan: ~${infoPoints}.
- RENTANG JUMLAH SCENE WAJIB: minimal ${targetLow}, maksimal ${targetHigh}. Materi pendek → dekati ${targetLow}. Materi panjang & banyak point → dekati ${targetHigh}. DILARANG memaksakan 4-5 scene sebagai kebiasaan.`;



        const system = `Kamu adalah head scriptwriter viral short-form Bahasa Indonesia sekaligus art director. Spesialisasimu: RETENTION ENGINEERING — membuat penonton tidak bisa scroll sebelum video habis. Input: materi artikel/berita/blog/cerita. Output: SATU objek JSON valid untuk video naratif (${ratio}).

PRINSIP UTAMA (paling penting):
1. HOOK 3 DETIK. Scene 1 wajib memicu rasa penasaran instan: pertanyaan tajam, fakta mengejutkan, kontradiksi, angka ekstrem, ancaman/kerugian, atau kalimat yang memutus asumsi umum. DILARANG membuka dengan basa-basi ("Halo teman-teman", "Di video kali ini", "Tahukah kamu bahwa..." generik).
2. OPEN LOOP BERANTAI. Setiap scene menutup dengan benang menggantung (informasi belum lengkap, tensi naik, "tapi...", "yang lebih gila...", "ternyata ada satu hal lagi...") yang baru dijawab di scene berikutnya. Jangan pernah menuntaskan semua rasa penasaran di tengah video.
3. PAYOFF DI AKHIR. Jawaban/twist/insight paling kuat disimpan untuk scene terakhir, lalu ditutup CTA singkat.
4. PATTERN INTERRUPT. Ganti ritme tiap 2-3 scene: kalimat pendek tajam ↔ kalimat mengalir, ganti sudut visual, ganti intensitas emosi.
5. SPESIFIK, BUKAN GENERIK. Pakai angka, nama, tempat, tanggal, kutipan, detail konkret DARI MATERI. Dilarang mengarang fakta yang tidak ada di materi; dilarang kalimat kosong tanpa informasi.
6. JUMLAH SCENE DINAMIS. Jumlah scene mengikuti kepadatan materi (lihat rentang wajib di input). Materi panjang & banyak point → banyak scene, satu point utama per scene. Materi tipis → sedikit scene tapi padat. Kebiasaan "selalu 4-5 scene" DILARANG KERAS.

Aturan JSON output (WAJIB dipatuhi persis):
{
  "topic": "<judul topik ringkas 4-8 kata, Bahasa Indonesia>",
  "angle": "<sudut pandang unik yang dipilih, 1 kalimat>",
  "target_audience": "<siapa penontonnya, 1 kalimat>",
  "hook": "<kalimat pembuka 8-15 kata, scroll-stopper Bahasa Indonesia>",
  "content_points": ["<daftar point/informasi berbeda yang diambil dari materi, satu baris per point — jumlahnya menentukan jumlah scene>"],
  "totalScenes": <integer, HARUS sama dengan panjang array scenes dan berada di dalam rentang wajib>,
  "aspectRatio": "${ratio}",
  "scenes": [
    {
      "n": 1,
      "title": "<judul scene 2-4 kata Indonesia>",
      "beat": "hook|konflik|konteks|bukti|eskalasi|twist|insight|payoff|cta",
      "retention_device": "<teknik retensi yang dipakai di scene ini: open loop / curiosity gap / cliffhanger / kontras / countdown / pertanyaan langsung / stake raising>",
      "narration": "<naskah voice-over Bahasa Indonesia natural spoken-style, 18-40 kata, satu point utama saja, diakhiri dorongan untuk lanjut ke scene berikutnya (kecuali scene terakhir). Tanpa emoji, tanpa tanda kutip, tanpa nomor scene. Ini dibaca ElevenLabs TTS>",
      "duration_sec": <angka 5..10>,
      "image_prompt": "<prompt English untuk image-generation model (GPT-Image-2). Visual sinematik spesifik untuk scene ini: subjek, aksi, komposisi/shot type (extreme close-up, wide, over-the-shoulder, top-down), mood, lighting, color palette, lens, aspect ratio ${ratio}. Setiap scene WAJIB beda shot type & komposisi dari scene sebelumnya, tapi tetap satu visual style/palette. Jika ada karakter manusia WAJIB Indonesian/Southeast Asian appearance dan konsisten ciri fisiknya di semua scene. WAJIB tanpa text/tulisan/typography/caption/subtitle/watermark/logo. Akhiri dengan: 'no text, no words, no captions, no typography, no logos, no watermarks, no subtitles anywhere in the image'.>",
      "motion_prompt": "<prompt English pendek untuk image-to-video: kamera & motion (slow zoom in, pan left, dolly forward, parallax, handheld drift, subtle push-in) yang cocok dengan emosi scene. Tidak boleh mengganti subjek. 1-2 kalimat. WAJIB tambahkan 'no text, no captions, no typography appearing during motion'.>",
      "on_screen_text": ""
    }
  ],
  "outro": "<kalimat penutup 8-15 kata Bahasa Indonesia: payoff + CTA>"
}

Panduan tambahan:
- Struktur: hook → stake/konflik → konteks singkat → rangkaian point inti (satu point per scene, urut makin menarik) → twist/insight terkuat → payoff + CTA.
- Durasi total mengikuti jumlah scene (boleh 30 detik sampai 3 menit). Jangan memangkas point penting hanya demi durasi pendek.
- Narration harus menyambung jadi satu narasi utuh saat digabung, tidak mengulang kalimat scene sebelumnya, tidak menyebut kata "scene".
- Semua "narration"/"title" Bahasa Indonesia. Semua "image_prompt"/"motion_prompt" Bahasa Inggris. "on_screen_text" WAJIB "".
- LARANGAN KERAS: tidak ada text/typography/caption/watermark/logo di image_prompt maupun motion_prompt.
- Balas HANYA objek JSON, TANPA markdown code fence, TANPA komentar.`;

        const user = `Materi:
Judul: ${title || "(tidak ada)"}
Deskripsi/ringkasan: ${description || "(tidak ada)"}
Isi materi:
${material || "(tidak ada)"}

## Analisa kepadatan materi (WAJIB dipatuhi)
${densityBrief}

Instruksi tambahan user: ${extra || "(tidak ada)"}
Aspek rasio target: ${ratio}

Langkah kerja internal sebelum menulis JSON:
1. Baca materi, daftar SEMUA point/informasi berbeda yang layak jadi scene (isi ke "content_points").
2. Pilih angle paling bikin penasaran, tentukan urutan point dari menarik → makin menarik → paling kuat di akhir.
3. Tentukan jumlah scene = jumlah point yang dipakai, harus di dalam rentang wajib di atas.
4. Tulis narasi tiap scene dengan open loop, lalu visual yang berbeda shot type tiap scene.

Tulis JSON sesuai schema sekarang.`;


        const errors: string[] = [];
        const providers: Array<{ name: string; key: string }> = gemini.map((k, i) => ({ name: `gemini#${i + 1}`, key: k }));

        if (providers.length === 0) {
          return json({
            error: "Tidak ada Gemini key ter-konfigurasi",
            hint: "Buka Token/API Manager → tab 🧠 Brain, paste satu atau beberapa Gemini API key (AIza... / AQ...). Key disimpan lokal di browser.",
            detected: { gemini: 0 },
            fallback: true,
          });
        }

        const sceneCount = (parsed: unknown): number => {
          const s = (parsed as { scenes?: unknown[] })?.scenes;
          return Array.isArray(s) ? s.length : 0;
        };

        let bestParsed: unknown = null;
        let bestProvider = "";

        for (const p of providers) {
          try {
            // Attempt 1: normal. Attempt 2: koreksi kalau jumlah scene kurang dari rentang wajib.
            for (let attempt = 0; attempt < 2; attempt++) {
              const usr =
                attempt === 0
                  ? user
                  : `${user}\n\nKOREKSI WAJIB: percobaan sebelumnya hanya menghasilkan ${sceneCount(bestParsed)} scene, padahal materi ini mengandung ~${infoPoints} point berbeda. Ulangi dan hasilkan MINIMAL ${targetLow} scene (idealnya mendekati ${targetHigh}), satu point utama per scene, tanpa mengulang informasi. Jangan meringkas point yang ada di materi.`;
              const r = await callGemini(p.key, system, usr);
              if (!r.ok) {
                errors.push(`${p.name}: ${r.status} ${r.body}`);
                if (!isRotatable(r.status)) break;
                break;
              }
              const parsed = tryParseJson(r.text);
              if (!parsed) { errors.push(`${p.name}: not-json`); continue; }
              const n = sceneCount(parsed);
              if (n > sceneCount(bestParsed)) { bestParsed = parsed; bestProvider = p.name; }
              if (n >= targetLow) return json({ result: parsed, provider: p.name, density: { words, infoPoints, targetLow, targetHigh } });
            }
            if (bestParsed) {
              return json({ result: bestParsed, provider: bestProvider, density: { words, infoPoints, targetLow, targetHigh } });
            }
          } catch (e) { errors.push(`${p.name}: ${(e as Error).message}`); }
        }


        return json({
          error: "Semua provider gagal",
          details: errors,
          hint: "Semua Gemini key dicoba tapi gagal. 401/403 = key salah, 429 = quota harian habis (tambah key lagi untuk auto-rotate), 5xx = Gemini bermasalah.",
          detected: { gemini: gemini.length },
          fallback: true,
        });
      },
    },
  },
});
