import { createFileRoute } from "@tanstack/react-router";

// Backend AI Router — image.
// Priority: Gemini Image → OpenAI Image. Auto-fallback.
// Keys via headers: x-user-gemini-keys, x-user-openai-keys.

type Body = {
  prompt?: string;
  aspectRatio?: string;
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function isRotatable(s: number): boolean {
  return s === 401 || s === 403 || s === 429 || s === 402 || s >= 500;
}

function parseKeys(header: string | null): string[] {
  if (!header) return [];
  return header.split(/[\n,]/g).map((s) => s.trim()).filter(Boolean);
}

// Gemini API keys start with "AIza". Anything else (e.g. OAuth access tokens
// like "AQ.Ab8RN6...") will 400 upstream and burn Worker subrequests, so drop them.
function validGeminiKeys(keys: string[]): string[] {
  return keys.filter((k) => (k.startsWith("AIza") || k.startsWith("AQ.")));
}
function validOpenAIKeys(keys: string[]): string[] {
  return keys.filter((k) => k.startsWith("sk-"));
}

async function safeErr(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, 600);
  } catch {
    return res.statusText;
  }
}

async function callGeminiImage(
  key: string,
  prompt: string,
): Promise<{ ok: true; b64: string; mime: string } | { ok: false; status: number; body: string }> {
  const models = ["gemini-2.5-flash-image", "gemini-2.0-flash-exp"];
  let last: { ok: false; status: number; body: string } | undefined;
  for (const model of models) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { responseModalities: ["IMAGE"] },
      }),
    });
    if (!res.ok) {
      last = { ok: false as const, status: res.status, body: `${model}: ${await safeErr(res)}` };
      if (!isRotatable(res.status) && res.status !== 404) return last;
      continue;
    }
    const data = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ inlineData?: { data?: string; mimeType?: string } }> } }>;
    };
    const part = data.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);
    const b64 = part?.inlineData?.data;
    if (!b64) {
      last = { ok: false as const, status: 502, body: `${model}: no image` };
      continue;
    }
    return { ok: true as const, b64, mime: part!.inlineData!.mimeType || "image/png" };
  }
  return last || { ok: false, status: 502, body: "gemini-image: no models" };
}

async function callOpenAIImage(
  key: string,
  prompt: string,
): Promise<{ ok: true; b64: string; mime: string } | { ok: false; status: number; body: string }> {
  const res = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: "gpt-image-1",
      prompt,
      size: "1024x1024",
      n: 1,
    }),
  });
  if (!res.ok) {
    return { ok: false, status: res.status, body: `openai-image: ${await safeErr(res)}` };
  }
  const data = (await res.json()) as { data?: Array<{ b64_json?: string }> };
  const b64 = data.data?.[0]?.b64_json;
  if (!b64) return { ok: false, status: 502, body: "openai-image: no data" };
  return { ok: true, b64, mime: "image/png" };
}

export async function routeImage(opts: {
  geminiKeys: string[];
  openaiKeys: string[];
  prompt: string;
}): Promise<
  | { ok: true; provider: "gemini" | "openai"; b64: string; mime: string }
  | { ok: false; status: number; error: string }
> {
  const errors: string[] = [];
  for (const k of opts.geminiKeys) {
    const r = await callGeminiImage(k, opts.prompt);
    if (r.ok) return { ok: true, provider: "gemini", b64: r.b64, mime: r.mime };
    errors.push(`gemini:${r.status}:${r.body}`);
    if (!isRotatable(r.status)) break;
  }
  for (const k of opts.openaiKeys) {
    const r = await callOpenAIImage(k, opts.prompt);
    if (r.ok) return { ok: true, provider: "openai", b64: r.b64, mime: r.mime };
    errors.push(`openai:${r.status}:${r.body}`);
    if (!isRotatable(r.status)) break;
  }
  if (opts.geminiKeys.length === 0 && opts.openaiKeys.length === 0) {
    return { ok: false, status: 400, error: "No image AI keys configured." };
  }
  return { ok: false, status: 502, error: errors.join(" | ") || "all image providers failed" };
}

export const Route = createFileRoute("/api/router/image")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          let body: Body = {};
          try {
            body = (await request.json()) as Body;
          } catch {
            return json({ error: "Invalid JSON body" }, 400);
          }
          const prompt = (body.prompt || "").trim();
          if (!prompt) return json({ error: "prompt required" }, 400);

          const geminiKeys = validGeminiKeys(parseKeys(request.headers.get("x-user-gemini-keys")));
          const openaiKeys = validOpenAIKeys(parseKeys(request.headers.get("x-user-openai-keys")));

          if (geminiKeys.length === 0 && openaiKeys.length === 0) {
            return json({
              error: "No valid image AI keys. Gemini keys must start with 'AIza', OpenAI with 'sk-'. Add real API keys in Token Manager.",
            }, 400);
          }

          const r = await routeImage({ geminiKeys, openaiKeys, prompt });
          if (!r.ok) return json({ error: r.error }, r.status);
          return json({ provider: r.provider, b64: r.b64, mime: r.mime });
        } catch (e) {
          // Always return JSON so the client never sees Cloudflare's 502 HTML page.
          return json({ error: `router-image crash: ${(e as Error).message || "unknown"}` }, 500);
        }
      },
    },
  },
});
