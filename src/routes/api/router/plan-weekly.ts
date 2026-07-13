// AI-driven weekly content planner.
// Menerima: character, personality, brain persona/memory, config user
// (contentTypes, categories, platforms, freqPerDay), reference social links.
// Output: array item planner siap dimasukkan ke ai_influencer_queue.

import { createFileRoute } from "@tanstack/react-router";
import { routeChat } from "./chat";

type Body = {
  character?: Record<string, unknown> | null;
  personality?: Record<string, number> | null;
  persona?: Record<string, unknown> | null;
  memory?: Record<string, unknown> | null;
  socialRefs?: { platform: string; url: string }[];
  config?: {
    contentTypes?: string[];
    categories?: string[];
    platforms?: string[];
    perDay?: number;
    days?: number;
  };
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function parseKeys(header: string | null): string[] {
  if (!header) return [];
  return header.split(/[\n,]/g).map((s) => s.trim()).filter(Boolean);
}

function extractJsonArray(raw: string): unknown[] {
  let s = (raw || "").replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
  const start = s.indexOf("[");
  const end = s.lastIndexOf("]");
  if (start === -1 || end === -1) {
    const sample = (raw || "").slice(0, 200).replace(/\s+/g, " ");
    throw new Error(`AI tidak balikin array JSON. Sample: "${sample}"`);
  }
  s = s.substring(start, end + 1);
  try {
    return JSON.parse(s) as unknown[];
  } catch {
    const repaired = s
      .replace(/,\s*}/g, "}")
      .replace(/,\s*]/g, "]")
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");
    return JSON.parse(repaired) as unknown[];
  }
}

export const Route = createFileRoute("/api/router/plan-weekly")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: Body = {};
        try {
          body = (await request.json()) as Body;
        } catch {
          return json({ error: "Invalid JSON" }, 400);
        }

        const openaiKeys = parseKeys(request.headers.get("x-user-openai-keys")).filter((k) =>
          k.startsWith("sk-"),
        );
        const geminiKeys = parseKeys(request.headers.get("x-user-gemini-keys")).filter(
          (k) => k.startsWith("AIza") || k.startsWith("AQ."),
        );
        if (openaiKeys.length === 0 && geminiKeys.length === 0) {
          return json(
            { error: "Brain API key kosong. Tambahkan Gemini/OpenAI key di Manage → Tokens." },
            400,
          );
        }

        const cfg = body.config ?? {};
        const contentTypes = cfg.contentTypes?.length
          ? cfg.contentTypes
          : ["image", "motion"];
        const categories = cfg.categories?.length ? cfg.categories : ["lifestyle"];
        const platforms = cfg.platforms?.length ? cfg.platforms : ["TikTok", "Instagram"];
        const perDay = Math.max(1, Math.min(4, cfg.perDay ?? 2));
        const days = Math.max(1, Math.min(14, cfg.days ?? 7));
        const total = perDay * days;

        const system = [
          "Anda perencana konten AI Influencer.",
          "Gunakan Character + Personality + Brain persona/memory + refs sosial untuk menyusun ide konten mingguan.",
          "Balas HANYA JSON array (tanpa markdown/prosa). Setiap item punya field:",
          '- day (string: "Sen"/"Sel"/…/"Min")',
          '- slot_time (string "HH:MM" 24h)',
          "- platform (salah satu dari list target)",
          "- content_type (salah satu dari list jenis konten)",
          "- category (salah satu dari list kategori)",
          "- title (5-10 kata, catchy)",
          "- caption (2-4 kalimat, bahasa yang sesuai persona)",
          "- hashtags (array 4-8 string, tanpa '#')",
          "- image_prompt (prompt image generator: subject, wardrobe, setting, lighting, camera, mood)",
          '- video_reference_url (untuk motion/reels ambil dari socialRefs; kosong "" jika tidak motion)',
          "- notes (opsional, 1 kalimat instruksi tambahan)",
          `Jumlah item WAJIB = ${total}. Sebar hari (${days} hari, ${perDay}x/hari).`,
          "Distribusikan platform, content_type, dan category secara merata dan variatif.",
          "Untuk motion/reels/ugc yang butuh dance/gerak, WAJIB isi video_reference_url dari socialRefs (pilih yang platform-nya mendukung, mis. TikTok).",
          "Jangan copy nama asli dari refs; refs hanya panduan style.",
        ].join("\n");

        const user = JSON.stringify({
          character: body.character ?? {},
          personality: body.personality ?? {},
          brain_persona: body.persona ?? {},
          brain_memory: body.memory ?? {},
          socialRefs: body.socialRefs ?? [],
          config: { contentTypes, categories, platforms, perDay, days, total },
        });

        const attempts = [
          { sys: system, usr: user },
          {
            sys:
              system +
              "\nPENTING: Output WAJIB array JSON valid, diawali '[' diakhiri ']'.",
            usr: user + "\n\nBalas HANYA array JSON.",
          },
        ];
        let lastErr = "";
        for (const { sys, usr } of attempts) {
          const r = await routeChat({
            openaiKeys,
            geminiKeys,
            system: sys,
            user: usr,
            json: true,
            temperature: 0.7,
          });
          if (!r.ok) {
            lastErr = r.error;
            continue;
          }
          try {
            const items = extractJsonArray(r.text || "");
            return json({ items, provider: r.provider });
          } catch (e) {
            lastErr = (e as Error).message;
          }
        }
        return json({ error: lastErr || "AI tidak menghasilkan plan valid" }, 500);
      },
    },
  },
});