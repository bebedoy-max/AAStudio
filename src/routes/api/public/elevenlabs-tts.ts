import { createFileRoute } from "@tanstack/react-router";

// ElevenLabs TTS proxy. API key dikirim client via header X-Eleven-Key
// (disimpan di localStorage user, bukan di server). Response: audio/mpeg.

type Body = {
  text?: string;
  voiceId?: string;
  modelId?: string;
  stability?: number;
  similarityBoost?: number;
  style?: number;
  speed?: number;
};

export const Route = createFileRoute("/api/public/elevenlabs-tts")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, X-Eleven-Key",
        },
      }),
      POST: async ({ request }) => {
        const key = request.headers.get("X-Eleven-Key") || request.headers.get("x-eleven-key") || "";
        if (!key) {
          return new Response(JSON.stringify({ error: "Header X-Eleven-Key wajib diisi (paste ElevenLabs API key di Kelola Token)." }),
            { status: 400, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });
        }
        let body: Body = {};
        try { body = await request.json(); } catch { /* */ }
        const text = (body.text || "").trim();
        const voiceId = (body.voiceId || "JBFqnCBsd6RMkjVDRZzb").trim(); // George = default
        const modelId = body.modelId || "eleven_multilingual_v2";
        if (!text) {
          return new Response(JSON.stringify({ error: "text kosong" }),
            { status: 400, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });
        }
        if (text.length > 4800) {
          return new Response(JSON.stringify({ error: "text terlalu panjang (>4800 char)" }),
            { status: 400, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });
        }

        const url = `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`;
        const upstream = await fetch(url, {
          method: "POST",
          headers: { "xi-api-key": key, "Content-Type": "application/json", "Accept": "audio/mpeg" },
          body: JSON.stringify({
            text,
            model_id: modelId,
            voice_settings: {
              stability: body.stability ?? 0.5,
              similarity_boost: body.similarityBoost ?? 0.75,
              style: body.style ?? 0.35,
              use_speaker_boost: true,
              speed: body.speed ?? 1.0,
            },
          }),
        });

        if (!upstream.ok) {
          const errText = await upstream.text().catch(() => "");
          return new Response(JSON.stringify({ error: `ElevenLabs ${upstream.status}: ${errText.slice(0, 400)}` }),
            { status: upstream.status, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });
        }
        const buf = await upstream.arrayBuffer();
        return new Response(buf, {
          headers: {
            "Content-Type": "audio/mpeg",
            "Cache-Control": "no-store",
            "Access-Control-Allow-Origin": "*",
          },
        });
      },
    },
  },
});
