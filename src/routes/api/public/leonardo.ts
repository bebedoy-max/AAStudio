// Server proxy for Leonardo.ai (app.leonardo.ai reverse-engineered API).
// Browser calls to api.leonardo.ai are blocked by CORS (Origin must be
// https://app.leonardo.ai). We forward here, attaching the caller's Cognito
// Bearer JWT plus the correct Origin/Referer headers.
import { createFileRoute } from "@tanstack/react-router";

const BASES = {
  api: "https://api.leonardo.ai",
  cloud: "https://cloud.leonardo.ai",
} as const;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

type Body = {
  base?: "api" | "cloud";
  path: string; // e.g. "/v1/graphql" or "/api/rest/v1/me"
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: unknown;
};

function safeAllowed(base: "api" | "cloud", path: string): boolean {
  if (!path.startsWith("/")) return false;
  if (base === "api") {
    return (
      path.startsWith("/v1/graphql") ||
      path.startsWith("/api/rest/v1/") ||
      path.startsWith("/api/rest/v2/")
    );
  }
  return path.startsWith("/api/rest/v1/") || path.startsWith("/api/rest/v2/");
}

export const Route = createFileRoute("/api/public/leonardo")({
  server: {
    handlers: {
      OPTIONS: async () =>
        new Response(null, {
          status: 204,
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, X-Leonardo-Token",
          },
        }),
      POST: async ({ request }) => {
        const token =
          request.headers.get("X-Leonardo-Token") ||
          request.headers.get("x-leonardo-token") ||
          "";
        if (!token) {
          return json({ ok: false, status: 400, data: null, raw: "X-Leonardo-Token required" }, 200);
        }

        const body = (await request.json().catch(() => null)) as Body | null;
        const base = body?.base === "cloud" ? "cloud" : "api";
        if (!body?.path || !safeAllowed(base, body.path)) {
          return json({ ok: false, status: 400, data: null, raw: "invalid path" }, 200);
        }

        const method = (body.method ?? "GET").toUpperCase();
        const init: RequestInit = {
          method,
          headers: {
            Accept: "application/json, text/plain, */*",
            Authorization: `Bearer ${token}`,
            Origin: "https://app.leonardo.ai",
            Referer: "https://app.leonardo.ai/",
            "X-Leo-Schema-Version": "1.244.1",
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36",
          },
        };
        if (method !== "GET" && method !== "DELETE") {
          (init.headers as Record<string, string>)["Content-Type"] = "application/json";
          init.body = JSON.stringify(body.body ?? {});
        }

        let upstream: Response;
        try {
          upstream = await fetch(`${BASES[base]}${body.path}`, init);
        } catch (e) {
          return json({ ok: false, status: 0, data: null, raw: `network: ${(e as Error).message}` }, 200);
        }
        const text = await upstream.text();
        let parsed: unknown = null;
        try {
          parsed = JSON.parse(text);
        } catch {
          /* leave raw */
        }
        return json(
          {
            ok: upstream.ok,
            status: upstream.status,
            data: parsed,
            raw: parsed ? undefined : text.slice(0, 500),
          },
          200,
        );
      },
    },
  },
});
