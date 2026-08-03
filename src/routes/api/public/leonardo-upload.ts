// Server proxy: upload init image ke Leonardo.ai.
// Browser tidak bisa memanggil api.leonardo.ai (CORS) maupun S3 presigned POST
// dengan header Origin app.leonardo.ai, jadi seluruh flow dijalankan di server:
//   1) mutation uploadInitImage → { id, key, url, fields }
//   2) multipart POST ke S3 dengan fields presigned + file
// Body: { b64, ext, mime? }   Header: X-Leonardo-Token
import { createFileRoute } from "@tanstack/react-router";

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

const UPLOAD_MUTATION =
  "mutation AddInitImage($arg1: InitImageUploadInput!) {\n  uploadInitImage(arg1: $arg1) {\n    id\n    fields\n    key\n    url\n    __typename\n  }\n}";

function mimeFor(ext: string): string {
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  return "image/jpeg";
}

function b64ToBytes(b64: string): ArrayBuffer {
  const bin = atob(b64);
  const buf = new ArrayBuffer(bin.length);
  const out = new Uint8Array(buf);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return buf;
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
        if (!token) return json({ ok: false, error: "X-Leonardo-Token required" });

        const body = (await request.json().catch(() => null)) as
          | { b64?: string; ext?: string; mime?: string }
          | null;
        if (!body?.b64) return json({ ok: false, error: "b64 required" });

        const rawExt = (body.ext || "png").toLowerCase();
        const ext = ["png", "jpg", "jpeg", "webp"].includes(rawExt) ? rawExt : "png";
        const mime = body.mime || mimeFor(ext);

        const leoHeaders: Record<string, string> = {
          Accept: "application/json, text/plain, */*",
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          Origin: "https://app.leonardo.ai",
          Referer: "https://app.leonardo.ai/",
          "X-Leo-Schema-Version": "1.244.1",
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36",
        };

        let presign: Response;
        try {
          presign = await fetch("https://api.leonardo.ai/v1/graphql", {
            method: "POST",
            headers: leoHeaders,
            body: JSON.stringify({
              operationName: "AddInitImage",
              variables: { arg1: { extension: ext } },
              query: UPLOAD_MUTATION,
            }),
          });
        } catch (e) {
          return json({ ok: false, error: `network: ${(e as Error).message}` });
        }

        const text = await presign.text();
        let parsed: any = null;
        try {
          parsed = JSON.parse(text);
        } catch {
          /* raw */
        }
        if (!presign.ok || !parsed) {
          return json({ ok: false, error: `presign ${presign.status}: ${text.slice(0, 300)}` });
        }
        if (Array.isArray(parsed.errors) && parsed.errors.length) {
          return json({ ok: false, error: `presign graphql: ${JSON.stringify(parsed.errors).slice(0, 300)}` });
        }

        const up = parsed?.data?.uploadInitImage;
        if (!up?.url || !up?.fields || !up?.id) {
          return json({ ok: false, error: `presign kosong: ${text.slice(0, 300)}` });
        }

        let fields: Record<string, string>;
        try {
          fields = typeof up.fields === "string" ? JSON.parse(up.fields) : up.fields;
        } catch {
          return json({ ok: false, error: "presign fields tidak valid" });
        }

        const form = new FormData();
        for (const [k, v] of Object.entries(fields)) form.append(k, String(v));
        form.append("file", new Blob([b64ToBytes(body.b64)], { type: mime }), `upload.${ext}`);

        let s3: Response;
        try {
          s3 = await fetch(up.url, { method: "POST", body: form });
        } catch (e) {
          return json({ ok: false, error: `s3 network: ${(e as Error).message}` });
        }
        if (!s3.ok) {
          const t = await s3.text().catch(() => "");
          return json({ ok: false, error: `s3 ${s3.status}: ${t.slice(0, 300)}` });
        }

        return json({ ok: true, id: String(up.id), key: up.key ?? null });
      },
    },
  },
});