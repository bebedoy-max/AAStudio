import { createFileRoute } from "@tanstack/react-router";

// Backend Router — Voice / TTS.
// Body: { text, voice?, language?, preset? }
// Priority: ElevenLabs (Multilingual v2) → OpenAI TTS (gpt-4o-mini-tts).

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function parseKeys(header: string | null): string[] {
  if (!header) return [];
  return header.split(/[\s,;\n]+/).map((s) => s.trim()).filter(Boolean);
}

function isRotatable(s: number): boolean {
  return s === 401 || s === 402 || s === 403 || s === 429 || s >= 500;
}

const ELEVEN_DEFAULT_VOICE: Record<string, string> = {
  female: "EXAVITQu4vr4xnSDxMaL", // Sarah
  male: "IKne3meq5aSn9XLyUdCD", // Charlie
  narrator: "N2lVS1w4EtoT3dr4eOWO", // Callum
  professional: "TX3LPaxmHKxFdv7VOQHJ", // Liam
  friendly: "onwK4e9ZLuTAKqWW03F9", // Daniel
  natural: "cgSgspJ2msm6clMCkdW9", // Jessica
  clone: "EXAVITQu4vr4xnSDxMaL",
};

async function callEleven(key: string, text: string, voiceId: string) {
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: "POST",
    headers: {
      "xi-api-key": key,
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
    },
    body: JSON.stringify({
      text,
      model_id: "eleven_multilingual_v2",
      voice_settings: { stability: 0.5, similarity_boost: 0.7 },
    }),
  });
  if (!res.ok) {
    return { ok: false as const, status: res.status, body: `eleven: ${(await res.text()).slice(0, 400)}` };
  }
  const buf = new Uint8Array(await res.arrayBuffer());
  let bin = "";
  for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
  return { ok: true as const, provider: "eleven", audioBase64: btoa(bin), mime: "audio/mpeg" };
}

async function callOpenAI(key: string, text: string, voice: string) {
  const res = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini-tts",
      voice: voice || "alloy",
      input: text,
      format: "mp3",
    }),
  });
  if (!res.ok) {
    return { ok: false as const, status: res.status, body: `openai: ${(await res.text()).slice(0, 400)}` };
  }
  const buf = new Uint8Array(await res.arrayBuffer());
  let bin = "";
  for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
  return { ok: true as const, provider: "openai", audioBase64: btoa(bin), mime: "audio/mpeg" };
}

function elevenVoiceIdFromPreset(preset?: string, override?: string): string {
  if (override) return override;
  const p = (preset || "").toLowerCase();
  if (p.includes("male")) return ELEVEN_DEFAULT_VOICE.male;
  if (p.includes("female")) return ELEVEN_DEFAULT_VOICE.female;
  if (p.includes("narrator")) return ELEVEN_DEFAULT_VOICE.narrator;
  if (p.includes("professional")) return ELEVEN_DEFAULT_VOICE.professional;
  if (p.includes("friendly")) return ELEVEN_DEFAULT_VOICE.friendly;
  if (p.includes("natural")) return ELEVEN_DEFAULT_VOICE.natural;
  if (p.includes("clone")) return ELEVEN_DEFAULT_VOICE.clone;
  return ELEVEN_DEFAULT_VOICE.natural;
}

function openaiVoiceFromPreset(preset?: string): string {
  const p = (preset || "").toLowerCase();
  if (p.includes("male")) return "onyx";
  if (p.includes("female")) return "nova";
  if (p.includes("narrator")) return "fable";
  if (p.includes("professional")) return "alloy";
  if (p.includes("friendly")) return "shimmer";
  return "alloy";
}

export const Route = createFileRoute("/api/router/voice")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = (await request.json().catch(() => ({}))) as {
            text?: string;
            voice?: string;
            preset?: string;
          };
          const text = (body.text || "").trim();
          if (!text) return json({ error: "text required" }, 400);
          if (text.length > 4500) return json({ error: "text too long (>4500 chars)" }, 400);

          const eleven = parseKeys(request.headers.get("x-user-elevenlabs-keys"));
          const openai = parseKeys(request.headers.get("x-user-openai-keys")).filter((k) => k.startsWith("sk-"));
          if (eleven.length === 0 && openai.length === 0) {
            return json({ error: "No voice keys configured. Add ElevenLabs or OpenAI key." }, 400);
          }

          const errors: string[] = [];
          const voiceId = elevenVoiceIdFromPreset(body.preset, body.voice);
          for (const k of eleven) {
            const r = await callEleven(k, text, voiceId);
            if (r.ok) return json(r);
            errors.push(`eleven:${r.status} ${r.body}`);
            if (!isRotatable(r.status)) break;
          }
          const openaiVoice = openaiVoiceFromPreset(body.preset);
          for (const k of openai) {
            const r = await callOpenAI(k, text, openaiVoice);
            if (r.ok) return json(r);
            errors.push(`openai:${r.status} ${r.body}`);
            if (!isRotatable(r.status)) break;
          }
          return json({ error: "voice router failed", details: errors }, 502);
        } catch (e) {
          return json({ error: `voice crash: ${(e as Error).message}` }, 500);
        }
      },
    },
  },
});
