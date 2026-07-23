import { createFileRoute } from "@tanstack/react-router";

// Backend AI Router — image.
// Priority: Gemini Image → OpenAI Image. Auto-fallback.
// Keys via headers: x-user-gemini-keys, x-user-openai-keys.

type ImgPart = { mime: string; b64: string };
type Body = {
  prompt?: string;
  aspectRatio?: string;
  images?: ImgPart[]; // optional reference/target images (Gemini vision + edit)
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

// Gemini API keys can start with legacy "AIza" or new auth-key "AQ" prefixes.
// Both are sent as x-goog-api-key; AQ keys are not OAuth bearer tokens.
function validGeminiKeys(keys: string[]): string[] {
  return keys.filter((k) => /^AIza[A-Za-z0-9_-]{20,}$/.test(k) || /^AQ[.A-Za-z0-9_-]{20,}$/.test(k));
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

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs = 35000): Promise<Response> {
  const ac = new AbortController();
  const timeout = setTimeout(() => ac.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: ac.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function maskKey(k: string): string {
  if (!k) return "?";
  return `${k.slice(0, 6)}…${k.slice(-4)}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function geminiAuthHeaders(key: string): Record<string, string> {
  return { "x-goog-api-key": key };
}

function extractGeminiImage(data: unknown): { b64: string; mime: string } | null {
  const seen = new Set<unknown>();
  const walk = (value: unknown): { b64: string; mime: string } | null => {
    if (!value || typeof value !== "object" || seen.has(value)) return null;
    seen.add(value);
    const obj = value as Record<string, unknown>;

    const inlineData = obj.inlineData as Record<string, unknown> | undefined;
    if (inlineData && typeof inlineData.data === "string") {
      return { b64: inlineData.data, mime: typeof inlineData.mimeType === "string" ? inlineData.mimeType : "image/png" };
    }

    const outputImage = obj.output_image as Record<string, unknown> | undefined;
    if (outputImage && typeof outputImage.data === "string") {
      return { b64: outputImage.data, mime: typeof outputImage.mime_type === "string" ? outputImage.mime_type : "image/png" };
    }

    if (obj.type === "image" && typeof obj.data === "string") {
      return { b64: obj.data, mime: typeof obj.mime_type === "string" ? obj.mime_type : "image/png" };
    }

    for (const child of Object.values(obj)) {
      if (Array.isArray(child)) {
        for (const item of child) {
          const found = walk(item);
          if (found) return found;
        }
      } else {
        const found = walk(child);
        if (found) return found;
      }
    }
    return null;
  };
  return walk(data);
}

function extractGeminiReason(data: unknown): string {
  if (!data || typeof data !== "object") return "no image";
  const obj = data as Record<string, unknown>;
  const promptFeedback = obj.promptFeedback as Record<string, unknown> | undefined;
  if (typeof promptFeedback?.blockReason === "string") return promptFeedback.blockReason;
  const candidates = obj.candidates as Array<Record<string, unknown>> | undefined;
  const finishReason = candidates?.find((c) => typeof c.finishReason === "string")?.finishReason;
  if (typeof finishReason === "string") return finishReason;
  return "no image";
}

async function callGeminiInteraction(
  key: string,
  model: string,
  prompt: string,
  images: ImgPart[],
): Promise<{ ok: true; b64: string; mime: string } | { ok: false; status: number; body: string }> {
  const input: Array<Record<string, string>> = [{ type: "text", text: prompt }];
  for (const img of images) {
    if (img?.b64 && img?.mime) {
      input.push({ type: "image", mime_type: img.mime, data: img.b64 });
    }
  }
  const res = await fetchWithTimeout("https://generativelanguage.googleapis.com/v1beta/interactions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...geminiAuthHeaders(key),
    },
    body: JSON.stringify({ model, input, store: false }),
  });
  if (!res.ok) return { ok: false, status: res.status, body: `${model}/interactions: ${await safeErr(res)}` };
  const data = (await res.json().catch(() => ({}))) as unknown;
  const image = extractGeminiImage(data);
  if (image) return { ok: true, b64: image.b64, mime: image.mime };
  return { ok: false, status: 502, body: `${model}/interactions: ${extractGeminiReason(data)}` };
}

async function callGeminiGenerateContent(
  key: string,
  model: string,
  prompt: string,
  images: ImgPart[],
): Promise<{ ok: true; b64: string; mime: string } | { ok: false; status: number; body: string }> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const parts: Array<Record<string, unknown>> = [{ text: prompt }];
  for (const img of images) {
    if (img?.b64 && img?.mime) {
      parts.push({ inlineData: { mimeType: img.mime, data: img.b64 } });
    }
  }
  const res = await fetchWithTimeout(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...geminiAuthHeaders(key) },
    body: JSON.stringify({
      contents: [{ role: "user", parts }],
      generationConfig: { responseModalities: ["IMAGE", "TEXT"] },
    }),
  });
  if (!res.ok) return { ok: false, status: res.status, body: `${model}/generateContent: ${await safeErr(res)}` };
  const data = (await res.json().catch(() => ({}))) as unknown;
  const image = extractGeminiImage(data);
  if (image) return { ok: true, b64: image.b64, mime: image.mime };
  return { ok: false, status: 502, body: `${model}/generateContent: ${extractGeminiReason(data)}` };
}

async function callGeminiImage(
  key: string,
  prompt: string,
  images: ImgPart[] = [],
): Promise<{ ok: true; b64: string; mime: string } | { ok: false; status: number; body: string }> {
  // One image-generation attempt per credential keeps 6-token rotation under
  // the gateway timeout. Extra model fallbacks per key caused 24 sequential
  // upstream calls and surfaced to users as Cloudflare 502 HTML.
  const model = "gemini-3.1-flash-image";
  try {
    return await callGeminiInteraction(key, model, prompt, images);
  } catch (e) {
    return { ok: false, status: 599, body: `${model}/interactions: fetch fail ${(e as Error).message}` };
  }
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
  images?: ImgPart[];
}): Promise<
  | { ok: true; provider: "gemini" | "openai"; b64: string; mime: string }
  | { ok: false; status: number; error: string }
> {
  const errors: string[] = [];
  const hasImages = (opts.images?.length ?? 0) > 0;
  // Always try every configured Gemini key before falling back — user
  // explicitly wants exhaustive rotation, not early break on 4xx.
  for (let i = 0; i < opts.geminiKeys.length; i++) {
    const k = opts.geminiKeys[i];
    const r = await callGeminiImage(k, opts.prompt, opts.images || []);
    if (r.ok) return { ok: true, provider: "gemini", b64: r.b64, mime: r.mime };
    errors.push(`gemini[${i + 1}/${opts.geminiKeys.length} ${maskKey(k)}]:${r.status}:${r.body}`);
    // Jeda antar-request untuk menghindari burst rate-limit pada Gemini.
    // 429 (quota / rate) diberi backoff lebih panjang.
    if (i < opts.geminiKeys.length - 1) {
      await sleep(r.status === 429 ? 2000 : 500);
    }
  }
  // OpenAI images.generations doesn't accept reference images in this route — skip if images provided.
  if (!hasImages) {
    for (let i = 0; i < opts.openaiKeys.length; i++) {
      const k = opts.openaiKeys[i];
      const r = await callOpenAIImage(k, opts.prompt);
      if (r.ok) return { ok: true, provider: "openai", b64: r.b64, mime: r.mime };
      errors.push(`openai[${i + 1}/${opts.openaiKeys.length} ${maskKey(k)}]:${r.status}:${r.body}`);
      if (i < opts.openaiKeys.length - 1) {
        await sleep(r.status === 429 ? 2000 : 500);
      }
    }
  }
  if (opts.geminiKeys.length === 0 && opts.openaiKeys.length === 0) {
    return { ok: false, status: 400, error: "No image AI keys configured." };
  }
  const lastStatus = errors.some((e) => e.includes(":429:")) ? 429 : 502;
  return { ok: false, status: lastStatus, error: errors.join(" || ") || "all image providers failed" };
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

          const rawGeminiKeys = parseKeys(request.headers.get("x-user-gemini-keys"));
          const geminiKeys = validGeminiKeys(rawGeminiKeys);
          const openaiKeys = validOpenAIKeys(parseKeys(request.headers.get("x-user-openai-keys")));

          if (geminiKeys.length === 0 && openaiKeys.length === 0) {
            return json({
              error: "No valid image AI keys. Gemini credentials must start with 'AIza' or 'AQ.', OpenAI with 'sk-'. Add real credentials in Token Manager.",
            }, 400);
          }

          const images = Array.isArray(body.images)
            ? body.images.filter((i): i is ImgPart => !!i && typeof i.b64 === "string" && typeof i.mime === "string").slice(0, 8)
            : [];
          const r = await routeImage({ geminiKeys, openaiKeys, prompt, images });
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
