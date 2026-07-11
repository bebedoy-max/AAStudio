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
]);

function isAllowedImageUrl(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return false;
    return ALLOWED_HOSTS.has(url.hostname)
      || url.hostname.endsWith(".cloudinary.com")
      || url.hostname.endsWith(".weavy.ai")
      || url.hostname.endsWith(".fal.media")
      || url.hostname.endsWith(".tokopedia.net")
      || url.hostname.endsWith(".susercontent.com")
      || url.hostname.endsWith(".shopee.co.id")
      || url.hostname.endsWith(".slatic.net")
      || url.hostname.endsWith(".lazada.co.id")
      || url.hostname.endsWith(".static-src.com")
      || url.hostname.endsWith(".akamaized.net");
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
            Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
            "User-Agent": "Mozilla/5.0",
        };
        if (authorization && new URL(url).hostname.endsWith(".weavy.ai")) headers.Authorization = authorization;

        const upstream = await fetch(url, { headers });

        if (!upstream.ok || !upstream.body) {
          return new Response("Image fetch failed", { status: upstream.status || 502 });
        }

        return new Response(upstream.body, {
          headers: {
            "Content-Type": upstream.headers.get("Content-Type") || "image/png",
            "Cache-Control": "public, max-age=86400",
            "Access-Control-Allow-Origin": "*",
          },
        });
      },
    },
  },
});