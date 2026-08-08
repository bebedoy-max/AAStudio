import { createFileRoute } from "@tanstack/react-router";
import { isSafePublicUrl, safeFetch } from "@/lib/security/ssrf";

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
  return isSafePublicUrl(value);
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

        const inm = request.headers.get("if-none-match");
        const ims = request.headers.get("if-modified-since");
        if (inm) headers["If-None-Match"] = inm;
        if (ims) headers["If-Modified-Since"] = ims;

        const upstream = await safeFetch(url, { headers });
        if (upstream.status === 304) {
          return new Response(null, {
            status: 304,
            headers: { "Cache-Control": "public, max-age=31536000, s-maxage=31536000, immutable", "Access-Control-Allow-Origin": "*" },
          });
        }

        if (!upstream.ok || !upstream.body) {
          return new Response("Image fetch failed", { status: upstream.status || 502 });
        }

        const out: Record<string, string> = {
          "Content-Type": upstream.headers.get("Content-Type") || "application/octet-stream",
          "Cache-Control": "public, max-age=31536000, s-maxage=31536000, immutable",
          "Access-Control-Allow-Origin": "*",
        };
        const etag = upstream.headers.get("etag");
        const lastModified = upstream.headers.get("last-modified");
        if (etag) out.ETag = etag;
        if (lastModified) out["Last-Modified"] = lastModified;

        return new Response(upstream.body, {
          headers: out,
        });
      },
    },
  },
});