import { createFileRoute } from "@tanstack/react-router";

const MAX_UPLOAD_BYTES = 200 * 1024 * 1024;
const ALLOWED_PREFIXES = ["image/", "video/"];

function json(data: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      ...(init?.headers || {}),
    },
  });
}

function safeFilename(name: string) {
  return (name || "upload.bin")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 120) || "upload.bin";
}

async function uploadToCatbox(file: File) {
  const form = new FormData();
  form.append("reqtype", "fileupload");
  form.append("fileToUpload", file, safeFilename(file.name));

  const response = await fetch("https://catbox.moe/user/api.php", {
    method: "POST",
    body: form,
    headers: { Accept: "text/plain" },
    signal: AbortSignal.timeout(10_000),
  });
  const text = (await response.text()).trim();
  if (response.ok && /^https?:\/\//i.test(text)) return text;
  throw new Error(text || `Catbox HTTP ${response.status}`);
}

async function uploadToLitterbox(file: File) {
  const form = new FormData();
  form.append("reqtype", "fileupload");
  form.append("time", "72h");
  form.append("fileToUpload", file, safeFilename(file.name));

  const response = await fetch("https://litterbox.catbox.moe/resources/internals/api.php", {
    method: "POST",
    body: form,
    headers: { Accept: "text/plain" },
    signal: AbortSignal.timeout(20_000),
  });
  const text = (await response.text()).trim();
  if (response.ok && /^https?:\/\//i.test(text)) return text;
  throw new Error(text || `Litterbox HTTP ${response.status}`);
}

async function uploadToUguu(file: File) {
  const form = new FormData();
  form.append("files[]", file, safeFilename(file.name));

  const response = await fetch("https://uguu.se/upload.php", {
    method: "POST",
    body: form,
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(20_000),
  });
  const data = await response.json().catch(() => null) as { files?: Array<{ url?: string }>; error?: string } | null;
  const url = data?.files?.[0]?.url;
  if (response.ok && url && /^https?:\/\//i.test(url)) return url.replace(/\\\//g, "/");
  throw new Error(data?.error || `Uguu HTTP ${response.status}`);
}

export const Route = createFileRoute("/api/public/upload-catbox")({
  server: {
    handlers: {
      OPTIONS: async () =>
        new Response(null, {
          status: 204,
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
          },
        }),
      POST: async ({ request }) => {
        let form: FormData;
        try {
          form = await request.formData();
        } catch {
          return json({ error: "Form upload tidak valid" }, { status: 400 });
        }

        const value = form.get("file");
        if (!(value instanceof File)) {
          return json({ error: "File tidak ditemukan" }, { status: 400 });
        }

        if (value.size <= 0 || value.size > MAX_UPLOAD_BYTES) {
          return json({ error: "Ukuran file tidak valid atau terlalu besar" }, { status: 413 });
        }

        if (!ALLOWED_PREFIXES.some((prefix) => value.type.startsWith(prefix))) {
          return json({ error: "Hanya file gambar atau video yang didukung" }, { status: 400 });
        }

        const attempts = [uploadToLitterbox, uploadToUguu, uploadToCatbox];
        const errors: string[] = [];
        try {
          for (const upload of attempts) {
            try {
              const url = await upload(value);
              return json({ url });
            } catch (error) {
              errors.push(error instanceof Error ? error.message : String(error));
            }
          }
          return json({ error: errors.join("; ") || "Semua host publik gagal" }, { status: 502 });
        } catch (error) {
          return json(
            { error: error instanceof Error ? error.message : "Upload publik gagal" },
            { status: 502 },
          );
        }
      },
    },
  },
});