import { createFileRoute } from "@tanstack/react-router";

// Storyboard brain: Gemini only, multi-key auto-rotate.
// Header: x-user-gemini-keys (comma/newline separated). Legacy: x-user-gemini-key.

type Body = {
  title?: string;
  description?: string;
  productType?: string;
  productTypes?: string[];
  scenes?: number;
  aspectRatio?: string;
  extraPrompt?: string;
  ctaTarget?: string;
  ctaLabel?: string;
  ctaCustom?: string;
};

function gridLayout(n: number): string {
  const map: Record<number, string> = {
    1: "1 panel penuh",
    2: "2 panel (1 baris × 2 kolom)",
    3: "3 panel (1 baris × 3 kolom)",
    4: "4 panel (2 baris × 2 kolom)",
    5: "5 panel (2 baris atas × 2 kolom, 1 baris bawah × 1 kolom lebar)",
    6: "6 panel (2 baris × 3 kolom)",
    7: "7 panel (2 baris × 3 kolom + 1 panel lebar bawah)",
    8: "8 panel (2 baris × 4 kolom)",
    9: "9 panel (3 baris × 3 kolom)",
    10: "10 panel (2 baris × 5 kolom)",
  };
  return map[n] || `${n} panel grid`;
}

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

export const Route = createFileRoute("/api/public/storyboard-brain")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const bulk = (request.headers.get("x-user-gemini-keys") || "").trim();
        const single = (request.headers.get("x-user-gemini-key") || "").trim();
        const geminiKeys = Array.from(new Set(
          (bulk ? bulk.split(/[\s,;]+/) : [single])
            .map((s) => s.trim())
            .filter((s) => s.length >= 10)
        ));

        let body: Body = {};
        try {
          body = await request.json();
        } catch {
          /* */
        }
        const scenes = Math.min(10, Math.max(1, Number(body.scenes) || 4));
        const ratio = body.aspectRatio || "1:1";
        const types = (body.productTypes || []).filter(Boolean);
        const primaryType = (body.productType || types[0] || "").trim();
        const title = (body.title || "").slice(0, 300);
        const description = (body.description || "").slice(0, 1200);
        const extra = (body.extraPrompt || "").slice(0, 800);
        const ctaTarget = (body.ctaTarget || "").trim();
        const ctaCustom = (body.ctaCustom || "").trim();
        const ctaLabel = (body.ctaLabel || "").trim();

        const CTA_GUIDES: Record<string, string> = {
          tiktok:
            "Platform: TikTok Shop. CTA final harus mengarahkan ke KERANJANG KUNING TikTok. Contoh frasa yang boleh dipakai: \"Cek keranjang kuning sekarang!\", \"Klik keranjang kuning di pojok\", \"Checkout via keranjang kuning\". Boleh tampilkan ikon panah menunjuk pojok kanan bawah. Jangan sebut Shopee/Tokopedia.",
          "facebook-shopee":
            "Platform: Facebook Ads yang mengarahkan ke Shopee. CTA final: \"Klik link Shopee di bawah\", \"Beli sekarang di Shopee — link di caption\", \"Swipe up ke Shopee\". Tampilkan logo/warna oranye Shopee di panel CTA. Jangan sebut TikTok/Tokopedia.",
          "facebook-tokopedia":
            "Platform: Facebook Ads yang mengarahkan ke Tokopedia. CTA final: \"Klik link Tokopedia di bawah\", \"Beli sekarang di Tokopedia — link di caption\". Tampilkan aksen hijau Tokopedia di panel CTA. Jangan sebut TikTok/Shopee.",
          tokopedia:
            "Platform: Tokopedia. CTA final: \"Beli di Tokopedia sekarang\", \"Klik link Tokopedia\", \"Cek toko kami di Tokopedia\". Warna aksen hijau. Jangan sebut Shopee/TikTok.",
          shopee:
            "Platform: Shopee. CTA final: \"Beli di Shopee sekarang\", \"Klik keranjang Shopee\", \"Free ongkir di Shopee\". Warna aksen oranye. Jangan sebut TikTok/Tokopedia.",
          instagram:
            "Platform: Instagram. CTA final: \"Link in bio\", \"Klik link di bio\", \"DM untuk order\". Style feed Instagram modern.",
          whatsapp:
            "Platform: WhatsApp. CTA final: \"Chat admin sekarang\", \"Order via WA\", tampilkan ikon WhatsApp hijau.",
        };
        const ctaGuidance =
          ctaTarget === "custom" && ctaCustom
            ? `CTA custom dari user (WAJIB dipakai sebagai arah CTA final panel): "${ctaCustom}". Tulis ulang jadi headline marketing Indonesia yang persuasif tapi tetap sesuai maksudnya.`
            : (CTA_GUIDES[ctaTarget] ||
                "Platform generik: CTA final harus ajakan beli yang jelas dan persuasif dalam Bahasa Indonesia.");

        const system = `Kamu adalah art director Indonesia yang membuat prompt untuk model image-generation (GPT-Image-2) agar menghasilkan SATU gambar berisi grid storyboard produk ala storyboard iklan / comic-strip marketing untuk pasar Indonesia.

Aturan output:
- Balas HANYA prompt final (tanpa penjelasan, tanpa markdown, tanpa quote).
- Prompt utama boleh dalam Bahasa Inggris agar image model lebih akurat, TAPI semua teks yang terlihat di dalam gambar wajib Bahasa Indonesia.
- Prompt WAJIB menyebutkan: "Create ONE single image composed of ${gridLayout(scenes)}, each panel clearly numbered 1 to ${scenes} in the top-left corner, thin white borders between panels, aspect ratio ${ratio}, designed for Indonesian marketplace product advertising".
- Setiap panel menampilkan produk yang sama (identitas produk konsisten: warna, bentuk, logo, detail).
- Jika ada karakter/manusia/model di scene: WAJIB gunakan wajah dan penampilan orang Asia Tenggara, khususnya Indonesia; natural Indonesian facial features, skin tone, hair style, wardrobe, dan lifestyle setting yang terasa lokal Indonesia. Hindari wajah Caucasian, East Asian yang terlalu Jepang/Korea/China, Afrika, atau Latino kecuali produk memang membutuhkan itu.
- Setting visual harus cocok untuk market Indonesia: rumah/apartemen modern Indonesia, café lokal, jalan urban Jakarta/Bandung/Surabaya, kampus/kantor Indonesia, marketplace product shoot, atau outdoor tropis Indonesia sesuai produk.
- WAJIB: setiap panel HARUS memuat TEKS yang tercetak langsung di dalam panel (rendered typography, bukan caption di luar gambar), terdiri dari:
    (a) SCENE LABEL kecil di pojok atas dalam Bahasa Indonesia: "SCENE {n}: <2-4 kata judul adegan>" atau "ADEGAN {n}: <2-4 kata>".
    (b) BIG OVERLAY TEXT / HEADLINE besar tebal (bold sans-serif, high contrast, drop shadow atau stroke agar terbaca) berupa hook marketing Bahasa Indonesia 3-6 kata yang menonjolkan benefit / kelebihan produk pada scene tsb.
    (c) SUB-CAPTION 1 baris kecil di bawah headline: kalimat pendek Bahasa Indonesia 6-12 kata menjelaskan fitur / kegunaan produk di scene itu.
  Semua teks visible HARUS dalam Bahasa Indonesia natural untuk iklan e-commerce Indonesia, ejaan benar, tidak boleh gibberish, tidak boleh campur Inggris kecuali nama brand/fitur produk, tidak boleh tumpang tindih dengan wajah subjek utama.
- Tulis di prompt daftar eksplisit teks per panel dalam format: Panel 1 → label: "...", headline: "...", caption: "..."; Panel 2 → ...; dst sampai Panel ${scenes}.
- Alur naratif ${scenes} panel: hook / problem → product reveal → key features → in-use lifestyle → benefit / emotion → call-to-action final panel.
- PANEL TERAKHIR (Panel ${scenes}) WAJIB berupa CALL-TO-ACTION eksplisit sesuai platform target berikut:
  ${ctaGuidance}
  Panel CTA final: headline besar berisi ajakan platform tsb + sub-caption pendukung + visual cue (ikon panah / tombol / logo marketplace) yang konsisten dengan platform. Jangan gunakan CTA generik "beli sekarang" saja — HARUS mention platform target di atas.
- Adegan/setting/pose model, environment, dan cara pemakaian HARUS disesuaikan dengan kategori produk utama: "${primaryType || "generic"}".
- Gunakan referensi gambar produk yang di-attach sebagai sumber identitas visual produk (bentuk, warna, tekstur).
- Gaya visual: pencahayaan sinematik, warna clean modern, resolusi tinggi, foto commercial berkualitas, tipografi modern editorial yang terbaca jelas.`;

        const user = `Data produk:
Judul: ${title || "(tidak ada)"}
Deskripsi: ${description || "(tidak ada)"}
Kategori produk utama (WAJIB dijadikan acuan adegan): ${primaryType || "(tidak dispesifikkan)"}
Semua jenis produk terdaftar user: ${types.length ? types.join(", ") : "(tidak ada)"}
Jumlah scene: ${scenes}
Aspek rasio: ${ratio}
Target CTA platform: ${ctaLabel || ctaTarget || "(tidak dispesifikkan)"}${ctaTarget === "custom" && ctaCustom ? `\nCTA custom user: ${ctaCustom}` : ""}
Instruksi tambahan dari user: ${extra || "(tidak ada)"}

Tulis prompt image-generation final sekarang.`;

        const errors: string[] = [];
        const providers: Array<{
          name: string;
          fn: () => Promise<{ ok: true; text: string } | { ok: false; status: number; body: string }>;
        }> = [];
        geminiKeys.forEach((k, i) => providers.push({ name: `gemini#${i + 1}`, fn: () => callGemini(k, system, user) }));
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
              return json({ prompt: r.text, scenes, ratio, provider: p.name });
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
