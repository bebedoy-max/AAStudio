// Server proxy for Adobe Firefly (firefly.adobe.io + firefly-3p.ff.adobe.io).
// Browser calls fail CORS (Origin must be https://firefly.adobe.com), so all
// Firefly traffic is forwarded from the edge here.
import { createFileRoute } from "@tanstack/react-router";

const ALLOWED_HOSTS = ["firefly.adobe.io", "firefly-3p.ff.adobe.io", "firefly-api.adobe.io"];
const FIREFLY_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0";

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
  bodyBase64?: string;
  contentType?: string;
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
              "Content-Type, X-Firefly-Token, X-Firefly-Api-Key, X-Firefly-Account, X-Firefly-Session, X-Firefly-Nonce, X-Firefly-Url, X-Firefly-Content-Type",
          },
        }),
      POST: async ({ request }) => {
        const token = request.headers.get("x-firefly-token") || "";
        if (!token) return json({ ok: false, error: "X-Firefly-Token required" }, 400);

        const apiKey = request.headers.get("x-firefly-api-key") || "SunbreakWebUI1";
        const accountId = request.headers.get("x-firefly-account") || "";
        const sessionId = request.headers.get("x-firefly-session") || crypto.randomUUID();
        const nonce = request.headers.get("x-firefly-nonce") || "";

        // Two transport modes:
        //  1. JSON envelope  { url, method, body|bodyBase64, ... }
        //  2. Raw binary body + X-Firefly-Url header (used for image uploads so
        //     we avoid the +33% base64 blow-up that trips gateway body limits).
        const rawUrl = request.headers.get("x-firefly-url") || "";
        let body: Body | null;
        let rawBinary: ArrayBuffer | null = null;
        if (rawUrl) {
          rawBinary = await request.arrayBuffer();
          body = {
            url: rawUrl,
            method: "POST",
            contentType:
              request.headers.get("x-firefly-content-type") || "application/octet-stream",
          };
        } else {
          body = (await request.json().catch(() => null)) as Body | null;
        }
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
          ...(nonce ? { "x-nonce": nonce } : {}),
          Origin: "https://firefly.adobe.com",
          Referer: "https://firefly.adobe.com/",
          "User-Agent": FIREFLY_UA,
          ...(accountId ? { "x-account-id": accountId } : {}),
          ...(body.headers || {}),
        };
        const method =
          body.method ||
          (body.body !== undefined || body.bodyBase64 !== undefined || rawBinary ? "POST" : "GET");
        if (rawBinary) headers["Content-Type"] = body.contentType || "application/octet-stream";
        else if (body.bodyBase64 !== undefined)
          headers["Content-Type"] = body.contentType || "application/octet-stream";
        else if (body.body !== undefined)
          headers["Content-Type"] = body.contentType || "application/json";

        let requestBody: BodyInit | undefined;
        if (rawBinary) {
          requestBody = rawBinary;
        } else if (body.bodyBase64 !== undefined) {
          const binary = atob(body.bodyBase64);
          requestBody = Uint8Array.from(binary, (char) => char.charCodeAt(0));
        } else if (body.body !== undefined) {
          requestBody = JSON.stringify(body.body);
        }

        let upstream: Response;
        try {
          upstream = await fetch(target.toString(), {
            method,
            headers,
            body: requestBody,
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
