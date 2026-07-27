// Server-side proxy for Leonardo init-image upload.
// Browser POST to image-flex-...s3-accelerate.amazonaws.com is blocked by
// CORS (Leonardo's S3 bucket only allows Origin https://app.leonardo.ai).
// We do BOTH steps server-side: 1) init-image (get presigned form fields),
// 2) multipart POST the blob to S3, then return the imageId to the browser.
import { createFileRoute } from "@tanstack/react-router";

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
  });
}

type Body = {
  b64: string; // raw base64 (no data: prefix)
  ext?: "png" | "jpg" | "jpeg" | "webp";
  mime?: string;
};

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export const Route = createFileRoute("/api/public/leonardo-upload")({
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
        if (!token) return json({ ok: false, error: "X-Leonardo-Token required" }, 200);

        const body = (await request.json().catch(() => null)) as Body | null;
        if (!body?.b64) return json({ ok: false, error: "b64 required" }, 200);
        const ext = body.ext === "png" || body.ext === "webp" || body.ext === "jpeg" || body.ext === "jpg" ? body.ext : "png";
        const mime = body.mime || (ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg");

        // Step 1: init-image
        let initRes: Response;
        try {
          initRes = await fetch("https://api.leonardo.ai/api/rest/v1/init-image", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
              Accept: "application/json, text/plain, */*",
              Origin: "https://app.leonardo.ai",
              Referer: "https://app.leonardo.ai/",
              "X-Leo-Schema-Version": "1.244.1",
              "User-Agent":
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36",
            },
            body: JSON.stringify({ extension: ext === "jpg" ? "jpeg" : ext }),
          });
        } catch (e) {
          return json({ ok: false, error: `init-image network: ${(e as Error).message}` });
        }
        if (!initRes.ok) {
          const t = await initRes.text().catch(() => "");
          return json({ ok: false, error: `init-image ${initRes.status}: ${t.slice(0, 300)}` });
        }
        const initData = (await initRes.json().catch(() => null)) as {
          uploadInitImage?: { id: string; url: string; fields: string };
        } | null;
        const info = initData?.uploadInitImage;
        if (!info?.id || !info?.url || !info?.fields) {
          return json({ ok: false, error: `init-image response invalid: ${JSON.stringify(initData).slice(0, 300)}` });
        }
        let fields: Record<string, string>;
        try {
          fields = JSON.parse(info.fields) as Record<string, string>;
        } catch {
          return json({ ok: false, error: "init-image fields not JSON" });
        }

        // Step 2: multipart POST to S3
        const form = new FormData();
        for (const [k, v] of Object.entries(fields)) form.append(k, v);
        const bytes = b64ToBytes(body.b64);
        const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
        form.append("file", new Blob([ab], { type: mime }), `ref.${ext}`);

        let s3Res: Response;
        try {
          s3Res = await fetch(info.url, { method: "POST", body: form });
        } catch (e) {
          return json({ ok: false, error: `s3 network: ${(e as Error).message}` });
        }
        if (!s3Res.ok && s3Res.status !== 204) {
          const t = await s3Res.text().catch(() => "");
          return json({ ok: false, error: `s3 ${s3Res.status}: ${t.slice(0, 300)}` });
        }

        return json({ ok: true, id: info.id });
      },
    },
  },
});
