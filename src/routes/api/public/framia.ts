// Server proxy for the Framia (Converge AI) REST API.
// Browser calls to https://api.framia.pro are blocked by CORS (Origin must
// be https://framia.converge.ai). We forward here, attaching the caller's
// Auth0 bearer JWT plus the required Origin/Referer.
import { createFileRoute } from "@tanstack/react-router";

const BASE = "https://api.framia.pro";

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
  path: string; // e.g. "/video/api/v1/user/credits?foo=bar"
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: unknown;
};

const OSS_UPLOAD_HOSTS = new Set(["framia-prod.oss-ap-southeast-1.aliyuncs.com"]);

function safeOssUploadUrl(raw: string): string | null {
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:") return null;
    if (!OSS_UPLOAD_HOSTS.has(url.hostname)) return null;
    if (!url.pathname.startsWith("/framia/")) return null;
    if (!url.searchParams.has("x-oss-signature")) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function safeAllowed(path: string): boolean {
  // Only forward whitelisted API prefixes to avoid becoming an open proxy.
  if (!path.startsWith("/")) return false;
  return (
    path.startsWith("/video/api/") ||
    path.startsWith("/api/payment/") ||
    path.startsWith("/api/inbox/")
  );
}

export const Route = createFileRoute("/api/public/framia")({
  server: {
    handlers: {
      OPTIONS: async () =>
        new Response(null, {
          status: 204,
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, X-Framia-Token",
          },
        }),
      POST: async ({ request }) => {
        const contentType =
          request.headers.get("Content-Type") || request.headers.get("content-type") || "";
        if (contentType.toLowerCase().includes("multipart/form-data")) {
          const form = await request.formData().catch(() => null);
          const uploadUrlEntry = form?.get("uploadUrl");
          const uploadUrl = typeof uploadUrlEntry === "string" ? uploadUrlEntry : "";
          const safeUploadUrl = uploadUrl ? safeOssUploadUrl(uploadUrl) : null;
          const file = form?.get("file");
          if (!safeUploadUrl || !(file instanceof File)) {
            return json({ ok: false, status: 400, data: null, raw: "invalid upload request" }, 200);
          }

          let upstream: Response;
          try {
            upstream = await fetch(safeUploadUrl, {
              method: "PUT",
              headers: { "Content-Type": "application/octet-stream" },
              body: file,
            });
          } catch (e) {
            return json(
              { ok: false, status: 0, data: null, raw: `upload network: ${(e as Error).message}` },
              200,
            );
          }
          const text = await upstream.text().catch(() => "");
          return json(
            {
              ok: upstream.ok,
              status: upstream.status,
              data: null,
              raw: text.slice(0, 500),
            },
            200,
          );
        }

        const token =
          request.headers.get("X-Framia-Token") || request.headers.get("x-framia-token") || "";
        if (!token)
          return json({ ok: false, status: 400, data: null, raw: "X-Framia-Token required" }, 200);

        const body = (await request.json().catch(() => null)) as Body | null;
        if (!body?.path || !safeAllowed(body.path)) {
          return json({ ok: false, status: 400, data: null, raw: "invalid path" }, 200);
        }

        const method = (body.method ?? "GET").toUpperCase();
        const init: RequestInit = {
          method,
          headers: {
            Accept: "application/json, text/plain, */*",
            Authorization: `Bearer ${token}`,
            Origin: "https://framia.converge.ai",
            Referer: "https://framia.converge.ai/",
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
          upstream = await fetch(`${BASE}${body.path}`, init);
        } catch (e) {
          return json(
            { ok: false, status: 0, data: null, raw: `network: ${(e as Error).message}` },
            200,
          );
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
