import { createFileRoute } from "@tanstack/react-router";

type Body = { text?: string; voiceId?: string };

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

async function probeSubscription(key: string) {
  const response = await fetch("https://api.elevenlabs.io/v1/user/subscription", {
    headers: { "xi-api-key": key },
  });
  if (!response.ok) {
    return { ok: false as const, status: response.status, error: (await response.text().catch(() => "")).slice(0, 300) };
  }

  const data = (await response.json()) as {
    character_count?: number;
    character_limit?: number;
    tier?: string;
  };
  const characterCount = Number(data.character_count ?? 0);
  const characterLimit = Number(data.character_limit ?? 0);
  return {
    ok: true as const,
    characterCount,
    characterLimit,
    remaining: Math.max(0, characterLimit - characterCount),
    tier: data.tier,
  };
}

async function probeTinyTts(key: string, body: Body) {
  const text = (body.text || "ok").trim().slice(0, 8) || "ok";
  const voiceId = (body.voiceId || "JBFqnCBsd6RMkjVDRZzb").trim();
  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_22050_32`,
    {
      method: "POST",
      headers: {
        "xi-api-key": key,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text,
        model_id: "eleven_turbo_v2_5",
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
          use_speaker_boost: false,
          speed: 1,
        },
      }),
    },
  );

  if (!response.ok) {
    return { ok: false as const, status: response.status, error: (await response.text().catch(() => "")).slice(0, 300) };
  }

  const audio = await response.arrayBuffer();
  if (audio.byteLength <= 256) {
    return { ok: false as const, status: 502, error: "Audio probe kosong / tidak terbaca" };
  }
  return { ok: true as const, bytes: audio.byteLength };
}

export const Route = createFileRoute("/api/public/elevenlabs-validate")({
  server: {
    handlers: {
      OPTIONS: async () =>
        new Response(null, {
          status: 204,
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, X-Eleven-Key",
          },
        }),
      POST: async ({ request }) => {
        const key = request.headers.get("X-Eleven-Key") || request.headers.get("x-eleven-key") || "";
        if (!key) return json({ ok: false, error: "X-Eleven-Key required" }, 400);

        const body = (await request.json().catch(() => ({}))) as Body;
        const sub = await probeSubscription(key);
        if (sub.ok) {
          return json({
            ok: true,
            method: "subscription",
            characterCount: sub.characterCount,
            characterLimit: sub.characterLimit,
            remaining: sub.remaining,
            tier: sub.tier,
          });
        }

        const tts = await probeTinyTts(key, body);
        if (!tts.ok) {
          return json({ ok: false, method: "tts-probe", error: tts.error || `ElevenLabs ${tts.status}` }, 401);
        }

        return json({
          ok: true,
          method: "tts-probe",
          characterCount: 0,
          characterLimit: 0,
          remaining: null,
          note: "Valid via tiny voice probe; saldo tidak tersedia dari subscription endpoint.",
        });
      },
    },
  },
});