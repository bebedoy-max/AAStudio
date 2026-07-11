import { createFileRoute } from "@tanstack/react-router";

// Backend Router — Speech To Text.
// Multipart/form-data upload: file, language?, prompt?
// Priority: OpenAI (gpt-4o-transcribe → whisper-1) → ElevenLabs STT.
// Header keys: x-user-openai-keys, x-user-elevenlabs-keys.

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

async function callOpenAI(key: string, file: Blob, filename: string, language: string | null) {
  const models = ["gpt-4o-transcribe", "whisper-1"];
  let last: { ok: false; status: number; body: string } | undefined;
  for (const model of models) {
    const fd = new FormData();
    fd.append("file", file, filename);
    fd.append("model", model);
    if (language) fd.append("language", language);
    fd.append("response_format", "verbose_json");
    const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}` },
      body: fd,
    });
    if (!res.ok) {
      last = { ok: false, status: res.status, body: `${model}: ${(await res.text()).slice(0, 400)}` };
      if (!isRotatable(res.status) && res.status !== 404) return last;
      continue;
    }
    const data = (await res.json()) as {
      text?: string;
      language?: string;
      segments?: Array<{ start: number; end: number; text: string }>;
    };
    return {
      ok: true as const,
      transcript: {
        language: data.language || language || "en",
        fullText: data.text || "",
        segments:
          data.segments?.map((s) => ({ start: s.start, end: s.end, text: s.text })) ??
          [{ start: 0, end: 0, text: data.text || "" }],
      },
      provider: "openai",
    };
  }
  return last || { ok: false as const, status: 502, body: "openai: no models" };
}

async function callEleven(key: string, file: Blob, filename: string, language: string | null) {
  const fd = new FormData();
  fd.append("file", file, filename);
  fd.append("model_id", "scribe_v1");
  if (language) fd.append("language_code", language);
  const res = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
    method: "POST",
    headers: { "xi-api-key": key },
    body: fd,
  });
  if (!res.ok) {
    return { ok: false as const, status: res.status, body: `eleven: ${(await res.text()).slice(0, 400)}` };
  }
  const data = (await res.json()) as {
    text?: string;
    language_code?: string;
    words?: Array<{ start: number; end: number; text: string }>;
  };
  const segments = (data.words ?? []).reduce<Array<{ start: number; end: number; text: string }>>(
    (acc, w) => {
      const last = acc[acc.length - 1];
      if (last && w.start - last.end < 0.8 && last.text.length < 120) {
        last.end = w.end;
        last.text = `${last.text} ${w.text}`.trim();
      } else {
        acc.push({ start: w.start, end: w.end, text: w.text });
      }
      return acc;
    },
    [],
  );
  return {
    ok: true as const,
    provider: "eleven",
    transcript: {
      language: data.language_code || language || "en",
      fullText: data.text || segments.map((s) => s.text).join(" "),
      segments: segments.length ? segments : [{ start: 0, end: 0, text: data.text || "" }],
    },
  };
}

export const Route = createFileRoute("/api/router/stt")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const openai = parseKeys(request.headers.get("x-user-openai-keys")).filter((k) => k.startsWith("sk-"));
          const eleven = parseKeys(request.headers.get("x-user-elevenlabs-keys"));

          const form = await request.formData();
          const file = form.get("file");
          if (!(file instanceof Blob)) return json({ error: "file field required" }, 400);
          const filename = (form.get("filename") as string | null) || "audio.wav";
          const language = (form.get("language") as string | null) || null;

          const errors: string[] = [];
          for (const k of openai) {
            const r = await callOpenAI(k, file, filename, language);
            if (r.ok) return json(r);
            errors.push(`openai:${r.status} ${r.body}`);
            if (!isRotatable(r.status)) break;
          }
          for (const k of eleven) {
            const r = await callEleven(k, file, filename, language);
            if (r.ok) return json(r);
            errors.push(`eleven:${r.status} ${r.body}`);
            if (!isRotatable(r.status)) break;
          }
          return json({ error: "STT router failed", details: errors }, 502);
        } catch (e) {
          return json({ error: `stt crash: ${(e as Error).message}` }, 500);
        }
      },
    },

  },
});
