import { createFileRoute } from "@tanstack/react-router";

// Backend AI Router — chat.
// Priority: OpenAI → Gemini. Auto-fallback on 401/402/403/429/5xx.
// Keys come from user headers (multi-key, comma or newline separated):
//   x-user-openai-keys, x-user-gemini-keys
// Body: { system: string, user: string, json?: boolean, temperature?: number }

type Body = {
  system?: string;
  user?: string;
  json?: boolean;
  temperature?: number;
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
  return header
    .split(/[\n,]/g)
    .map((s) => s.trim())
    .filter(Boolean);
}

function redact(text: string): string {
  return text
    .replace(/sk-[A-Za-z0-9_-]{20,}/g, "sk-***")
    .replace(/AIza[A-Za-z0-9_-]{12,}/g, "AIza***")
    .replace(/AQ\.[A-Za-z0-9_-]{12,}/g, "AQ.***");
}

function geminiAuthHeaders(key: string): Record<string, string> {
  // Gemini auth keys (AQ...) are API keys too, not OAuth bearer tokens.
  return { "x-goog-api-key": key };
}

async function safeErr(res: Response): Promise<string> {
  try {
    return redact((await res.text()).slice(0, 800));
  } catch {
    return res.statusText || "request failed";
  }
}

async function callOpenAI(
  key: string,
  system: string,
  user: string,
  wantJson: boolean,
  temperature: number,
): Promise<{ ok: true; text: string } | { ok: false; status: number; body: string }> {
  const models = ["gpt-4o-mini", "gpt-4.1-mini"];
  let last: { ok: false; status: number; body: string } | undefined;
  for (const model of models) {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model,
        temperature,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        ...(wantJson ? { response_format: { type: "json_object" } } : {}),
      }),
    });
    if (!res.ok) {
      last = { ok: false as const, status: res.status, body: `${model}: ${await safeErr(res)}` };
      if (!isRotatable(res.status) && res.status !== 404) return last;
      continue;
    }
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const text = (data.choices?.[0]?.message?.content || "").trim();
    if (!text) {
      last = { ok: false as const, status: 502, body: `${model}: empty` };
      continue;
    }
    return { ok: true as const, text };
  }
  return last || { ok: false, status: 502, body: "openai: no models" };
}

async function callGemini(
  key: string,
  system: string,
  user: string,
  wantJson: boolean,
  temperature: number,
): Promise<{ ok: true; text: string } | { ok: false; status: number; body: string }> {
  const models = ["gemini-2.5-flash", "gemini-flash-latest", "gemini-2.5-flash-lite", "gemini-2.0-flash"];
  let last: { ok: false; status: number; body: string } | undefined;
  for (const model of models) {
    const useLegacyQueryParam = key.startsWith("AIza");
    const url = useLegacyQueryParam
      ? `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`
      : `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
    const res = await fetch(url, {
      method: "POST",
      headers: useLegacyQueryParam
        ? { "Content-Type": "application/json" }
        : { "Content-Type": "application/json", ...geminiAuthHeaders(key) },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: user }] }],
        generationConfig: {
          temperature,
          ...(wantJson ? { responseMimeType: "application/json" } : {}),
        },
      }),
    });
    if (!res.ok) {
      last = { ok: false as const, status: res.status, body: `${model}: ${await safeErr(res)}` };
      if (!isRotatable(res.status) && res.status !== 404) return last;
      continue;
    }
    const data = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const text = (data.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") || "").trim();
    if (!text) {
      last = { ok: false as const, status: 502, body: `${model}: empty` };
      continue;
    }
    return { ok: true as const, text };
  }
  return last || { ok: false, status: 502, body: "gemini: no models" };
}

export async function routeChat(opts: {
  openaiKeys: string[];
  geminiKeys: string[];
  system: string;
  user: string;
  json?: boolean;
  temperature?: number;
}): Promise<
  | { ok: true; provider: "openai" | "gemini"; text: string }
  | { ok: false; status: number; error: string }
> {
  const { openaiKeys, geminiKeys, system, user } = opts;
  const wantJson = !!opts.json;
  const temperature = opts.temperature ?? 0.7;
  const statusCount = new Map<string, number>();
  let lastSample = "";
  let lastStatus = 502;
  let openaiTried = 0;
  let geminiTried = 0;

  const bump = (provider: string, status: number, body: string) => {
    const k = `${provider}:${status}`;
    statusCount.set(k, (statusCount.get(k) || 0) + 1);
    lastSample = `${provider} ${status} — ${body.slice(0, 240)}`;
    lastStatus = status;
  };

  // Priority 1: OpenAI, rotate keys
  for (const k of openaiKeys) {
    openaiTried++;
    const r = await callOpenAI(k, system, user, wantJson, temperature);
    if (r.ok) return { ok: true, provider: "openai", text: r.text };
    bump("openai", r.status, r.body);
    if (!isRotatable(r.status)) break;
  }

  // Priority 2: Gemini, rotate keys
  for (const k of geminiKeys) {
    geminiTried++;
    const r = await callGemini(k, system, user, wantJson, temperature);
    if (r.ok) return { ok: true, provider: "gemini", text: r.text };
    bump("gemini", r.status, r.body);
    if (!isRotatable(r.status)) break;
  }

  if (openaiKeys.length === 0 && geminiKeys.length === 0) {
    return { ok: false, status: 400, error: "No AI keys configured. Add keys via Token/API Manager." };
  }

  const summary = Array.from(statusCount.entries())
    .map(([k, n]) => `${k}×${n}`)
    .join(", ");
  const tried = `tried openai:${openaiTried} keys, gemini:${geminiTried} keys`;
  const hint =
    lastStatus === 429
      ? " — semua key kena rate-limit / quota habis (cek billing project atau tunggu reset kuota)"
      : "";
  return {
    ok: false,
    status: lastStatus,
    error: `AI router: ${tried}. Status: ${summary}${hint}. Last: ${lastSample}`,
  };
}

export const Route = createFileRoute("/api/router/chat")({
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
          const system = (body.system || "").trim();
          const user = (body.user || "").trim();
          if (!user) return json({ error: "user prompt required" }, 400);

          const openaiKeys = parseKeys(request.headers.get("x-user-openai-keys")).filter((k) => k.startsWith("sk-"));
          const geminiKeys = parseKeys(request.headers.get("x-user-gemini-keys")).filter((k) => /^AIza[A-Za-z0-9_-]{20,}$/.test(k) || /^AQ[.A-Za-z0-9_-]{20,}$/.test(k));

          if (openaiKeys.length === 0 && geminiKeys.length === 0) {
            return json({
              error: "No valid AI keys. Gemini credentials must start with 'AIza' or 'AQ.', OpenAI with 'sk-'.",
            }, 400);
          }

          const r = await routeChat({
            openaiKeys,
            geminiKeys,
            system,
            user,
            json: body.json,
            temperature: body.temperature,
          });
          if (!r.ok) return json({ error: r.error }, r.status);
          return json({ provider: r.provider, text: r.text });
        } catch (e) {
          return json({ error: `router-chat crash: ${(e as Error).message || "unknown"}` }, 500);
        }
      },
    },
  },
});
