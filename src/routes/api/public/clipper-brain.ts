import { createFileRoute } from "@tanstack/react-router";
import { routeChat } from "../router/chat";

// Clipper Brain — takes transcript + duration and returns scenes/hooks/deadAir JSON.

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function parseKeys(header: string | null): string[] {
  if (!header) return [];
  return header.split(/[\s,;\n]+/).map((s) => s.trim()).filter(Boolean);
}

function tryParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    const m = text.match(/\{[\s\S]*\}/);
    if (m) {
      try {
        return JSON.parse(m[0]);
      } catch {
        /* */
      }
    }
    return null;
  }
}

export const Route = createFileRoute("/api/public/clipper-brain")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const openai = parseKeys(request.headers.get("x-user-openai-keys")).filter((k) => k.startsWith("sk-"));
          const gemini = parseKeys(request.headers.get("x-user-gemini-keys")).filter((k) => (k.startsWith("AIza") || k.startsWith("AQ.")));
          if (openai.length === 0 && gemini.length === 0) {
            return json({ error: "No brain keys configured. Add OpenAI or Gemini key via Token Manager." }, 400);
          }
          const body = (await request.json().catch(() => ({}))) as {
            transcript?: { segments?: Array<{ start: number; end: number; text: string }>; fullText?: string };
            durationSec?: number;
            language?: string;
          };
          const segs = body.transcript?.segments ?? [];
          if (segs.length === 0) return json({ error: "transcript.segments required" }, 400);

          const compact = segs
            .slice(0, 400)
            .map((s) => `[${s.start.toFixed(1)}-${s.end.toFixed(1)}] ${s.text}`)
            .join("\n");

          const system = `You are a Post-Production AI for short-form video. Given a timestamped transcript, output a SINGLE JSON object describing scenes, speakers, hook moments, dead-air/filler ranges, keywords, topics and an emotion curve.

Return this exact JSON schema, nothing else, no markdown fence:
{
  "scenes": [{"start": <s>, "end": <s>, "label": "<3-6 words>"}],
  "speakers": [{"id":"s1","label":"Speaker 1","segments":[[<s>,<s>]]}],
  "hooks": [{"kind":"best_hook|best_moment|most_emotional|most_viral|most_educational|most_funny|most_affiliate","score":<0..100>,"start":<s>,"end":<s>,"reason":"<one sentence>"}],
  "deadAir": [[<s>,<s>]],
  "fillers": [[<s>,<s>]],
  "keywords": ["..."],
  "topics": ["..."],
  "emotionCurve": [{"t":<s>,"score":<0..100>}]
}

Rules:
- Cover the FULL duration (${body.durationSec ?? "unknown"}s).
- Pick 4–8 hooks total, mixed across the seven "kind" values.
- deadAir = silence/no-speech gaps ≥1.2s inferred from time gaps between transcript segments.
- fillers = "hmm/ehh/uhh/like/you know" phrases; return the timestamp ranges.
- Language: ${body.language ?? "auto"}. Keep labels/reasons in the same language as the transcript.
- All numbers in seconds, floats OK.`;

          const user = `Transcript (timestamped):\n${compact}\n\nProduce the JSON now.`;

          const result = await routeChat({
            openaiKeys: openai,
            geminiKeys: gemini,
            system,
            user,
            json: true,
            temperature: 0.4,
          });
          if (!result.ok) return json({ error: result.error }, result.status);
          const parsed = tryParse(result.text);
          if (!parsed) return json({ error: "Brain returned non-JSON", raw: result.text }, 502);
          return json({ ok: true, provider: result.provider, analysis: parsed });
        } catch (e) {
          return json({ error: `clipper-brain crash: ${(e as Error).message}` }, 500);
        }
      },
    },
  },
});
