import { createFileRoute } from "@tanstack/react-router";
import { routeChat } from "../router/chat";

// Dubbing Brain — translate transcript segments preserving timing.

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
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

const MODES: Record<string, string> = {
  Literal: "translate as literally as possible, preserve wording",
  Natural: "translate naturally, idiomatic, keep meaning",
  Localization: "adapt cultural references so it reads native",
  "Affiliate Style": "punchy affiliate-marketing tone, CTAs, benefit-driven",
  Formal: "formal, professional, no slang",
  Casual: "casual, friendly, conversational",
};

export const Route = createFileRoute("/api/public/dubbing-brain")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const openai = parseKeys(request.headers.get("x-user-openai-keys")).filter((k) => k.startsWith("sk-"));
          const gemini = parseKeys(request.headers.get("x-user-gemini-keys")).filter((k) => (k.startsWith("AIza") || k.startsWith("AQ.")));
          if (openai.length === 0 && gemini.length === 0) {
            return json({ error: "No brain keys configured." }, 400);
          }
          const body = (await request.json().catch(() => ({}))) as {
            segments?: Array<{ start: number; end: number; text: string }>;
            sourceLanguage?: string;
            targetLanguage?: string;
            mode?: string;
          };
          const segs = body.segments ?? [];
          if (segs.length === 0) return json({ error: "segments required" }, 400);
          const target = body.targetLanguage || "en";
          const source = body.sourceLanguage || "auto";
          const mode = MODES[body.mode ?? "Natural"] ?? MODES.Natural;

          const compact = segs
            .map((s, i) => `${i + 1}\t${s.start.toFixed(2)}\t${s.end.toFixed(2)}\t${s.text.replace(/\t/g, " ")}`)
            .join("\n");

          const system = `You are a professional video dubbing translator. Translate a timestamped transcript from ${source} to ${target}. Style: ${mode}. Keep translation length close to the original so voice fits the same timing.

Return this exact JSON schema, no markdown:
{
  "language": "${target}",
  "segments": [{"start":<s>,"end":<s>,"text":"<translated>"}],
  "fullText": "<concatenated translation>"
}
Never drop segments. Keep timings identical to input.`;

          const user = `Segments (idx\\tstart\\tend\\ttext):\n${compact}\n\nReturn JSON now.`;

          const result = await routeChat({
            openaiKeys: openai,
            geminiKeys: gemini,
            system,
            user,
            json: true,
            temperature: 0.3,
          });
          if (!result.ok) return json({ error: result.error }, result.status);
          const parsed = tryParse(result.text);
          if (!parsed) return json({ error: "Brain returned non-JSON", raw: result.text }, 502);
          return json({ ok: true, provider: result.provider, translated: parsed });
        } catch (e) {
          return json({ error: `dubbing-brain crash: ${(e as Error).message}` }, 500);
        }
      },
    },
  },
});
