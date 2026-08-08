import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { isSafePublicUrl, safeFetch } from "@/lib/security/ssrf";

const MAX_SNIFF_BYTES = 4096;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

const BodySchema = z.object({
  url: z.string().url().max(2_000),
  kind: z.enum(["image", "video"]),
});

function json(data: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...CORS_HEADERS,
      ...(init?.headers || {}),
    },
  });
}

function bytesStartWith(bytes: Uint8Array, signature: number[]) {
  if (bytes.length < signature.length) return false;
  return signature.every((value, index) => bytes[index] === value);
}

function looksLikeImage(bytes: Uint8Array, contentType: string) {
  return (
    contentType.startsWith("image/") ||
    bytesStartWith(bytes, [0xff, 0xd8, 0xff]) ||
    bytesStartWith(bytes, [0x89, 0x50, 0x4e, 0x47]) ||
    bytesStartWith(bytes, [0x47, 0x49, 0x46, 0x38]) ||
    bytesStartWith(bytes, [0x52, 0x49, 0x46, 0x46])
  );
}

function looksLikeVideo(bytes: Uint8Array, contentType: string) {
  const ascii = new TextDecoder("latin1").decode(bytes.slice(0, Math.min(bytes.length, 64)));
  return (
    contentType.startsWith("video/") ||
    ascii.includes("ftyp") ||
    bytesStartWith(bytes, [0x1a, 0x45, 0xdf, 0xa3]) ||
    bytesStartWith(bytes, [0x00, 0x00, 0x01, 0xba]) ||
    bytesStartWith(bytes, [0x00, 0x00, 0x01, 0xb3])
  );
}

export const Route = createFileRoute("/api/public/validate-media")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS_HEADERS }),
      POST: async ({ request }) => {
        const body = await request.json().catch(() => null);
        const parsed = BodySchema.safeParse(body);
        if (!parsed.success || !isSafePublicUrl(parsed.data.url)) {
          return json({ ok: false, error: "Request validasi media tidak valid" }, { status: 400 });
        }

        try {
          const response = await safeFetch(parsed.data.url, {
            method: "GET",
            headers: {
              Accept: parsed.data.kind === "image" ? "image/*,*/*;q=0.8" : "video/*,*/*;q=0.8",
              Range: `bytes=0-${MAX_SNIFF_BYTES - 1}`,
              "User-Agent": "Mozilla/5.0",
            },
            signal: AbortSignal.timeout(20_000),
          });

          const contentType = (response.headers.get("content-type") || "").toLowerCase();
          const finalUrl = response.url || parsed.data.url;
          const bytes = new Uint8Array(await response.arrayBuffer());
          const okKind = parsed.data.kind === "image" ? looksLikeImage(bytes, contentType) : looksLikeVideo(bytes, contentType);
          const looksHtml = contentType.includes("text/html") || /^\s*</.test(new TextDecoder().decode(bytes.slice(0, 128)));

          if (!response.ok || !okKind || looksHtml) {
            return json(
              {
                ok: false,
                error: `URL tidak terbaca sebagai ${parsed.data.kind}`,
                status: response.status,
                contentType: contentType || "unknown",
                finalUrl,
              },
              { status: 422 },
            );
          }

          return json({ ok: true, status: response.status, contentType, finalUrl });
        } catch (error) {
          return json(
            { ok: false, error: error instanceof Error ? error.message : "Gagal membaca URL media" },
            { status: 502 },
          );
        }
      },
    },
  },
});