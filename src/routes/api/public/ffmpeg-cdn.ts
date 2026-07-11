import { createFileRoute } from "@tanstack/react-router";

// Same-origin proxy for @ffmpeg/ffmpeg + @ffmpeg/core static assets.
// Needed because loading the FFmpeg class worker (814.ffmpeg.js) directly
// from a cross-origin CDN triggers a browser Worker construction error, and
// spawning a Worker from a blob URL gives it an opaque origin that cannot
// read other blob URLs (coreURL / wasmURL). Serving via our own origin makes
// the Worker same-origin, so it can freely load the core + wasm blobs.
//
// Usage from client:
//   /api/public/ffmpeg-cdn?f=umd-worker&v=0.12.10&pkg=ffmpeg
//   /api/public/ffmpeg-cdn?f=umd-core-js&v=0.12.6&pkg=core
//   /api/public/ffmpeg-cdn?f=umd-core-wasm&v=0.12.6&pkg=core
//   /api/public/ffmpeg-cdn?f=umd-ffmpeg-js&v=0.12.10&pkg=ffmpeg

const FILE_MAP: Record<string, string> = {
  "umd-ffmpeg-js": "umd/ffmpeg.js",
  "umd-worker": "umd/814.ffmpeg.js",
  "umd-core-js": "umd/ffmpeg-core.js",
  "umd-core-wasm": "umd/ffmpeg-core.wasm",
  "umd-core-worker-js": "umd/ffmpeg-core.worker.js",
  "esm-core-js": "esm/ffmpeg-core.js",
  "esm-core-wasm": "esm/ffmpeg-core.wasm",
};

const ALLOWED_PKGS = new Set(["ffmpeg", "core"]);
const ALLOWED_VERSIONS = new Set(["0.12.10", "0.12.15", "0.12.6", "0.12.9"]);


function mimeFor(f: string): string {
  if (f.endsWith(".wasm")) return "application/wasm";
  if (f.endsWith(".js")) return "text/javascript; charset=utf-8";
  return "application/octet-stream";
}

async function fetchWithFallback(pkg: string, ver: string, f: string): Promise<Response> {
  const bases = [
    `https://cdn.jsdelivr.net/npm/@ffmpeg/${pkg}@${ver}/dist`,
    `https://unpkg.com/@ffmpeg/${pkg}@${ver}/dist`,
  ];
  let lastErr = "";
  for (const b of bases) {
    try {
      const r = await fetch(`${b}/${f}`);
      if (r.ok) return r;
      lastErr = `${b}/${f} -> ${r.status}`;
    } catch (e) {
      lastErr = `${b}/${f} -> ${(e as Error).message}`;
    }
  }
  throw new Error(lastErr || "all mirrors failed");
}

export const Route = createFileRoute("/api/public/ffmpeg-cdn")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, OPTIONS",
          "Access-Control-Allow-Headers": "*",
        },
      }),
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const f = url.searchParams.get("f") || "";
        const v = url.searchParams.get("v") || "";
        const pkg = url.searchParams.get("pkg") || "";
        const realFile = FILE_MAP[f];
        if (!realFile || !ALLOWED_PKGS.has(pkg) || !ALLOWED_VERSIONS.has(v)) {
          return new Response("bad params", { status: 400 });
        }
        try {
          const upstream = await fetchWithFallback(pkg, v, realFile);
          const buf = await upstream.arrayBuffer();
          return new Response(buf, {
            status: 200,
            headers: {
              "Content-Type": mimeFor(realFile),
              "Cache-Control": "public, max-age=86400",
              "Access-Control-Allow-Origin": "*",
            },
          });
        } catch (e) {
          return new Response("upstream error: " + (e as Error).message, {
            status: 502,
            headers: { "Access-Control-Allow-Origin": "*" },
          });
        }
      },
    },
  },
});
