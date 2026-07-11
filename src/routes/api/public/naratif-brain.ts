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
        generationConfig: { responseMimeType: "application/json" },
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
        const gemini = Array.from(new Set(
          (bulk ? bulk.split(/[\s,;]+/) : [single])
            .map((s) => s.trim())
            .filter((s) => s.length >= 10)
        ));

        let body: Body = {};
        try { body = await request.json(); } catch { /* */ }
        const title = (body.title || "").slice(0, 400);
        const description = (body.description || "").slice(0, 800);
        const material = (body.body || "").slice(0, 6000);
        const ratio = body.aspectRatio || "9:16";
        const maxScenes = Math.min(10, Math.max(3, Number(body.maxScenes) || 8));
        const extra = (body.extraPrompt || "").slice(0, 600);

        if (!title && !material) {
          return json({ error: "Materi kosong: minimal judul atau body harus ada" }, 400);
        }

        const system = `Kamu adalah script writer video edukasi Bahasa Indonesia + art director. Input: materi artikel/berita/blog. Output: SATU objek JSON valid untuk membuat video naratif pendek (TikTok/Shorts/Reels format ${ratio}).

Aturan JSON output (WAJIB dipatuhi persis):
{
  "topic": "<judul topik ringkas 4-8 kata, Bahasa Indonesia>",
  "hook": "<kalimat pembuka 8-15 kata, hook attention Bahasa Indonesia>",
  "totalScenes": <integer 3..${maxScenes}>,
  "aspectRatio": "${ratio}",
  "scenes": [
    {
      "n": 1,
      "title": "<judul scene 2-4 kata Indonesia>",
      "narration": "<naskah voice-over Bahasa Indonesia natural, 15-35 kata, gaya bercerita/edukatif, tanpa emoji, tanpa tanda kutip. Ini yang akan dibaca ElevenLabs TTS>",
      "duration_sec": <angka 5..10>,
      "image_prompt": "<prompt English untuk image-generation model (GPT-Image-2). Deskripsi visual sinematik untuk scene ini: subjek, komposisi, mood, lighting, color palette, aspect ratio ${ratio}. Jika ada karakter manusia WAJIB Indonesian/Southeast Asian appearance. Tambahkan small overlay text bertuliskan judul scene Bahasa Indonesia di lower-third. Photo-realistic atau editorial illustration konsisten antar scene>",
      "motion_prompt": "<prompt English pendek untuk image-to-video model: kamera & motion apa (slow zoom in, pan left, dolly forward, parallax, subtle push-in). Tidak boleh mengganti subjek. 1-2 kalimat.>",
      "on_screen_text": "<opsional, headline besar 3-6 kata Bahasa Indonesia yang muncul di frame; boleh string kosong>"
    }
  ],
  "outro": "<kalimat penutup 8-15 kata Bahasa Indonesia, biasanya CTA/kesimpulan>"
}

Panduan:
- Alur naratif: hook → konteks/masalah → penjelasan inti (bisa 2-4 scene) → contoh/dampak → kesimpulan/CTA.
- Total durasi seluruh scene idealnya 30-70 detik.
- Konsisten visual style antar scene (satu palette, satu genre visual).
- Narration harus mengalir jadi satu narasi utuh saat digabung, TIDAK boleh mengulang kalimat scene sebelumnya.
- Semua "narration" dan "title" dan "on_screen_text" Bahasa Indonesia. Semua "image_prompt" dan "motion_prompt" Bahasa Inggris.
- Balas HANYA objek JSON, TANPA markdown code fence, TANPA komentar.`;

        const user = `Materi:
Judul: ${title || "(tidak ada)"}
Deskripsi/ringkasan: ${description || "(tidak ada)"}
Isi materi:
${material || "(tidak ada)"}

Instruksi tambahan user: ${extra || "(tidak ada)"}
Aspek rasio target: ${ratio}
Maksimum scene: ${maxScenes}

Tulis JSON sesuai schema sekarang.`;

        const errors: string[] = [];
        const providers: Array<{ name: string; fn: () => Promise<{ ok: true; text: string } | { ok: false; status: number; body: string }> }> = [];
        gemini.forEach((k, i) => providers.push({ name: `gemini#${i + 1}`, fn: () => callGemini(k, system, user) }));

        if (providers.length === 0) {
          return json({
            error: "Tidak ada Gemini key ter-konfigurasi",
            hint: "Buka Token/API Manager → tab 🧠 Brain, paste satu atau beberapa Gemini API key (AIza... / AQ...). Key disimpan lokal di browser.",
            detected: { gemini: 0 },
            fallback: true,
          });
        }

        for (const p of providers) {
          try {
            const r = await p.fn();
            if (r.ok) {
              const parsed = tryParseJson(r.text);
              if (!parsed) { errors.push(`${p.name}: not-json`); continue; }
              return json({ result: parsed, provider: p.name });
            }
            errors.push(`${p.name}: ${r.status} ${r.body}`);
            if (!isRotatable(r.status)) continue;
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
