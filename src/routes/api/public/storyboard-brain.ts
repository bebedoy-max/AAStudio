import { createFileRoute } from "@tanstack/react-router";

// Storyboard brain: Gemini only, multi-key auto-rotate.
// Header: x-user-gemini-keys (comma/newline separated). Legacy: x-user-gemini-key.

type Body = {
  title?: string;
  description?: string;
  productType?: string;
  productTypes?: string[];
  scenes?: number;
  referenceCount?: number;
  aspectRatio?: string;
  extraPrompt?: string;
  ctaTarget?: string;
  ctaLabel?: string;
  ctaCustom?: string;
};

function isRotatable(s: number): boolean {
  return s === 401 || s === 403 || s === 429 || s === 402 || s >= 500;
}

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
  const models = [
    "gemini-2.5-flash",
    "gemini-flash-latest",
    "gemini-2.5-flash-lite",
    "gemini-2.0-flash",
  ];
  let last: { ok: false; status: number; body: string } | undefined;
  for (const model of models) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: user }] }],
      }),
    });
    if (!res.ok) {
      last = {
        ok: false as const,
        status: res.status,
        body: `${model}: ${await safeErrorBody(res)}`,
      };
      if (!isRotatable(res.status) && res.status !== 404) return last;
      continue;
    }
    const data = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const text = (
      data.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") || ""
    ).trim();
    if (!text) {
      last = { ok: false as const, status: 502, body: `${model}: empty` };
      continue;
    }
    return { ok: true as const, text };
  }
  return last || { ok: false as const, status: 502, body: "Gemini empty" };
}

export const Route = createFileRoute("/api/public/storyboard-brain")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const bulk = (request.headers.get("x-user-gemini-keys") || "").trim();
        const single = (request.headers.get("x-user-gemini-key") || "").trim();
        const userKeys = Array.from(
          new Set(
            (bulk ? bulk.split(/[\s,;]+/) : [single])
              .map((s) => s.trim())
              .filter((s) => s.length >= 10),
          ),
        );
        // Fallback Global Brain (key platform) saat user belum punya key sendiri.
        const { loadGlobalBrainKeys } = await import("../router/chat");
        const globalKeys = (await loadGlobalBrainKeys()).gemini.filter(
          (k) => !userKeys.includes(k),
        );
        const geminiKeys = [...userKeys, ...globalKeys];

        let body: Body = {};
        try {
          body = await request.json();
        } catch {
          /* */
        }
        const scenes = Math.min(10, Math.max(1, Number(body.scenes) || 4));
        const ratio = body.aspectRatio || "1:1";
        const refCount = Math.min(6, Math.max(0, Number(body.referenceCount) || 0));
        const types = (body.productTypes || []).filter(Boolean);
        const primaryType = (body.productType || types[0] || "").trim();
        const title = (body.title || "").slice(0, 300);
        const description = (body.description || "").slice(0, 600);
        const extra = (body.extraPrompt || "").slice(0, 400);

        const refList =
          refCount > 1
            ? `${Array.from({ length: refCount - 1 }, (_, i) => i + 1).join(", ")} dan ${refCount}`
            : refCount === 1
              ? "1"
              : "";

        const ctaLabel = (body.ctaCustom || body.ctaLabel || "").trim().slice(0, 120);
        const ctaClause = ctaLabel ? `, scene terakhir tampilkan CTA ${ctaLabel}` : "";

        const system = `Kamu menulis SATU kalimat prompt singkat Bahasa Indonesia untuk image model.
Format WAJIB persis seperti contoh, tanpa tambahan apa pun:
"buat 1 gambar storyboard iklan produk <nama produk singkat> ${scenes} scene${refList ? ` dari gambar referensi ${refList} yang saya lampirkan` : ""}${ctaClause}"
Aturan:
- Balas HANYA satu kalimat itu, tanpa markdown, tanpa tanda kutip, tanpa penjelasan.
- <nama produk singkat> = 1-3 kata dari judul produk (contoh: "pisau", "tas wanita", "blender").
- Jangan menambah deskripsi gaya, kamera, teks panel, atau instruksi lain.
${ctaClause ? "- WAJIB pertahankan bagian CTA di akhir kalimat persis seperti format." : ""}`;

        const user = `Judul produk: ${title || "(tidak ada)"}
Deskripsi: ${description || "(tidak ada)"}
Kategori: ${primaryType || "(tidak ada)"}
Jumlah scene: ${scenes}
Jumlah gambar referensi: ${refCount}
Aspek rasio: ${ratio}
CTA scene terakhir: ${ctaLabel || "(tidak ada)"}
Catatan user: ${extra || "(tidak ada)"}

Tulis kalimat promptnya sekarang.`;

        const errors: string[] = [];
        const providers: Array<{
          name: string;
          fn: () => Promise<
            { ok: true; text: string } | { ok: false; status: number; body: string }
          >;
        }> = [];
        geminiKeys.forEach((k, i) =>
          providers.push({ name: `gemini#${i + 1}`, fn: () => callGemini(k, system, user) }),
        );
        if (providers.length === 0) {
          return json({
            error: "Tidak ada Gemini key ter-konfigurasi",
            hint: "Buka Token/API Manager → tab 🧠 Brain, paste satu atau beberapa Gemini API key (AIza... / AQ...).",
            detected: { gemini: 0 },
            fallback: true,
          });
        }

        for (const p of providers) {
          try {
            const r = await p.fn();
            if (r.ok) {
              let out = r.text.trim().replace(/^["']|["']$/g, "");
              if (ctaLabel && !out.toLowerCase().includes("cta")) {
                out = `${out}${ctaClause}`;
              }
              return json({ prompt: out, scenes, ratio, provider: p.name });
            }
            errors.push(`${p.name}: ${r.status} ${r.body}`);
            if (!isRotatable(r.status)) continue;
          } catch (e) {
            errors.push(`${p.name}: ${(e as Error).message}`);
          }
        }

        return json({
          error: "Semua provider gagal",
          details: errors,
          hint: "Semua Gemini key dicoba tapi gagal. 401/403 = key salah, 429 = quota harian habis (tambah key lagi utk auto-rotate), 5xx = Gemini bermasalah.",
          detected: { gemini: geminiKeys.length },
          fallback: true,
        });
      },
    },
  },
});
