// Server proxy for Adobe Firefly (firefly.adobe.io + firefly-3p.ff.adobe.io).
// Browser calls fail CORS (Origin must be https://firefly.adobe.com), so all
// Firefly traffic is forwarded from the edge here.
import { createFileRoute } from "@tanstack/react-router";

const ALLOWED_HOSTS = ["firefly.adobe.io", "firefly-3p.ff.adobe.io", "firefly-api.adobe.io"];
const FIREFLY_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

function cors(extra: Record<string, string> = {}): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    ...extra,
  };
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: cors() });
}

type Body = {
  url: string; // absolute Firefly URL
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: unknown;
  headers?: Record<string, string>;
};

export const Route = createFileRoute("/api/public/firefly")({
  server: {
    handlers: {
      OPTIONS: async () =>
        new Response(null, {
          status: 204,
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers":
              "Content-Type, X-Firefly-Token, X-Firefly-Api-Key, X-Firefly-Account, X-Firefly-Session",
          },
        }),
      POST: async ({ request }) => {
        const token = request.headers.get("x-firefly-token") || "";
        if (!token) return json({ ok: false, error: "X-Firefly-Token required" }, 400);

        const apiKey = request.headers.get("x-firefly-api-key") || "SunbreakWebUI1";
        const accountId = request.headers.get("x-firefly-account") || "";
        const sessionId = request.headers.get("x-firefly-session") || crypto.randomUUID();

        const body = (await request.json().catch(() => null)) as Body | null;
        if (!body?.url) return json({ ok: false, error: "url required" }, 400);

        let target: URL;
        try {
          target = new URL(body.url);
        } catch {
          return json({ ok: false, error: "invalid url" }, 400);
        }
        if (!ALLOWED_HOSTS.includes(target.hostname)) {
          return json({ ok: false, error: `host not allowed: ${target.hostname}` }, 400);
        }

        const headers: Record<string, string> = {
          Accept: "application/json, text/plain, */*",
          Authorization: token.startsWith("Bearer ") ? token : `Bearer ${token}`,
          "x-api-key": apiKey,
          "x-arp-session-id": sessionId,
          Origin: "https://firefly.adobe.com",
          Referer: "https://firefly.adobe.com/",
          "User-Agent": FIREFLY_UA,
          ...(accountId ? { "x-account-id": accountId } : {}),
          ...(body.headers || {}),
        };
        const method = body.method || (body.body ? "POST" : "GET");
        if (body.body !== undefined) headers["Content-Type"] = "application/json";

        let upstream: Response;
        try {
          upstream = await fetch(target.toString(), {
            method,
            headers,
            body: body.body !== undefined ? JSON.stringify(body.body) : undefined,
          });
        } catch (e) {
          return json({ ok: false, status: 0, error: (e as Error).message }, 200);
        }

        const text = await upstream.text();
        let parsed: unknown = null;
        try {
          parsed = JSON.parse(text);
        } catch {
          /* non-json */
        }
        return json({
          ok: upstream.ok,
          status: upstream.status,
          data: parsed,
          raw: parsed ? undefined : text.slice(0, 800),
        });
      },
    },
  },
});
