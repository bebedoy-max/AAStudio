import { createFileRoute } from "@tanstack/react-router";

const ALLOWED_HOSTS = new Set([
  "api.weavy.ai",
  "media.weavy.ai",
  "res.cloudinary.com",
  "storage.googleapis.com",
  "fal.media",
  "v3.fal.media",
  "v2.fal.media",
  "images.tokopedia.net",
  "ecs7.tokopedia.net",
  "ecs7-p.tokopedia.net",
  "down-id.img.susercontent.com",
  "cf.shopee.co.id",
  "id-live-01.slatic.net",
  "static-src.lazada.co.id",
  "www.static-src.com",
  "blibli.akamaized.net",
  "drive.google.com",
  "drive.usercontent.google.com",
  "lh3.googleusercontent.com",
  "multi-agent-release.meitudata.com",
  "litter.catbox.moe",
  "files.catbox.moe",
]);

function isAllowedImageUrl(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return false;
    const host = url.hostname.toLowerCase();
    // Block localhost / private ranges to prevent SSRF; allow any other public host.
    if (
      host === "localhost" ||
      host === "0.0.0.0" ||
      host.endsWith(".localhost") ||
      /^127\./.test(host) ||
      /^10\./.test(host) ||
      /^192\.168\./.test(host) ||
      /^169\.254\./.test(host) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(host)
    ) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export const Route = createFileRoute("/api/public/proxy-image")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url).searchParams.get("url") || "";
        if (!isAllowedImageUrl(url)) return new Response("Invalid image URL", { status: 400 });

        const authorization = request.headers.get("authorization");
        const headers: Record<string, string> = {
            Accept: "*/*",
            "User-Agent": "Mozilla/5.0",
        };
        if (authorization && new URL(url).hostname.endsWith(".weavy.ai")) headers.Authorization = authorization;

        const upstream = await fetch(url, { headers });

        if (!upstream.ok || !upstream.body) {
          return new Response("Image fetch failed", { status: upstream.status || 502 });
        }

        return new Response(upstream.body, {
          headers: {
            "Content-Type": upstream.headers.get("Content-Type") || "application/octet-stream",
            "Cache-Control": "public, max-age=86400",
            "Access-Control-Allow-Origin": "*",
          },
        });
      },
    },
  },
});