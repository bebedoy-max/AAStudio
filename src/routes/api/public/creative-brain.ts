import { createFileRoute } from "@tanstack/react-router";
import { routeChat } from "@/routes/api/router/chat";

// Creative Dashboard brain: research → ideas.
// One reasoning call, JSON response. Uses backend router (OpenAI → Gemini fallback).
// Headers: x-user-openai-keys, x-user-gemini-keys.
// In-memory TTL cache keyed by keyword+filters.

type Filters = {
  goal?: string;
  platform?: string;
  length?: string;
  tone?: string;
};
type Body = {
  keyword?: string;
  filters?: Filters;
  extraContext?: string; // reserved for future sources (Google Trends, YT, etc.)
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

// ---- cache ----
type Cached = { at: number; payload: unknown };
const CACHE = new Map<string, Cached>();
const TTL_MS = 30 * 60 * 1000;

function cacheKey(keyword: string, f: Filters): string {
  return JSON.stringify({
    k: keyword.trim().toLowerCase(),
    g: f.goal || "",
    p: f.platform || "",
    l: f.length || "",
    t: f.tone || "",
  });
}

// ---- prompt ----
function buildPrompt(keyword: string, f: Filters, extra?: string) {
  const system =
    "You are a senior AI content strategist for short-form and long-form video. " +
    "You research topics deeply, understand audience psychology, spot content gaps, " +
    "and propose viral-worthy angles. ALWAYS respond with a single valid JSON object, " +
    "no prose, no markdown code fences.";

  const schema = `{
  "keyword": string,
  "audience": string (2-4 sentences: who they are, pain points, desires),
  "summary": string (short paragraph summarising the research),
  "trending_topics": string[] (6-10 short topic phrases currently relevant),
  "content_gap": string[] (5-8 concrete gaps — angles most creators miss),
  "creative_angles": [ { "title": string, "description": string } ] (6-8 items),
  "ideas": [ {
    "title": string,
    "hook": string (1 short line, scroll-stopper),
    "description": string (2-3 sentences),
    "difficulty": "Easy" | "Medium" | "Hard",
    "viral_score": number (0-100),
    "affiliate_score": number (0-100),
    "duration": string (e.g. "15s", "30s", "60s", "3min"),
    "thumbnail_prompt": string (concise, vivid, English, image-gen ready),
    "workflow": "narrative-video" | "motion" | "storyboard" | "bulk-fashion" | "image-to-video"
  } ] (EXACTLY 20 items)
}`;

  const filterLines = [
    f.goal ? `- Content goal: ${f.goal}` : "",
    f.platform ? `- Target platform: ${f.platform}` : "",
    f.length ? `- Content length: ${f.length}` : "",
    f.tone ? `- Tone: ${f.tone}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const user = `KEYWORD: "${keyword}"

FILTERS:
${filterLines || "(none — pick sensible defaults)"}

${extra ? `EXTRA CONTEXT:\n${extra}\n` : ""}

Do the full reasoning pipeline: intent → topic expansion → audience analysis → trend analysis → content gaps → creative angles → 20 concrete video ideas → thumbnail prompt for each.

For each idea, pick the best "workflow" from:
- "narrative-video" — storytelling / educational / news / documentary
- "motion" — motion transfer / character animation
- "storyboard" — product-driven multi-scene ad / commerce
- "bulk-fashion" — fashion/apparel model shots
- "image-to-video" — single image → short animated clip

Return ONLY this JSON shape (no extra keys, no commentary):
${schema}`;

  return { system, user };
}

function extractJson(text: string): unknown | null {
  const cleaned = text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    // try to find first { .. last }
    const s = cleaned.indexOf("{");
    const e = cleaned.lastIndexOf("}");
    if (s >= 0 && e > s) {
      try {
        return JSON.parse(cleaned.slice(s, e + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

export const Route = createFileRoute("/api/public/creative-brain")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: Body = {};
        try {
          body = (await request.json()) as Body;
        } catch {
          return json({ error: "Invalid JSON" }, 400);
        }
        const keyword = (body.keyword || "").trim();
        if (!keyword) return json({ error: "keyword required" }, 400);
        const filters: Filters = body.filters || {};

        const ck = cacheKey(keyword, filters);
        const hit = CACHE.get(ck);
        if (hit && Date.now() - hit.at < TTL_MS) {
          return json({ cached: true, ...(hit.payload as object) });
        }

        const openaiKeys = parseKeys(request.headers.get("x-user-openai-keys"));
        const geminiKeys = parseKeys(request.headers.get("x-user-gemini-keys"));

        const { system, user } = buildPrompt(keyword, filters, body.extraContext);
        const r = await routeChat({
          openaiKeys,
          geminiKeys,
          system,
          user,
          json: true,
          temperature: 0.85,
        });
        if (!r.ok) return json({ error: r.error }, r.status);

        const parsed = extractJson(r.text);
        if (!parsed || typeof parsed !== "object") {
          return json({ error: "Model did not return valid JSON", raw: r.text.slice(0, 400) }, 502);
        }

        const payload = { ...(parsed as object), provider: r.provider };
        CACHE.set(ck, { at: Date.now(), payload });
        return json({ cached: false, ...payload });
      },
    },
  },
});
