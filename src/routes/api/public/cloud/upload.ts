import { createFileRoute } from "@tanstack/react-router";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function json(data: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { "Content-Type": "application/json", ...CORS, ...(init?.headers || {}) },
  });
}

export const Route = createFileRoute("/api/public/cloud/upload")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }) => {
        const { userIdFromRequest } = await import("@/lib/cloud/request-auth.server");
        const userId = await userIdFromRequest(request);
        if (!userId) return json({ error: "Unauthorized" }, { status: 401 });

        let form: FormData;
        try {
          form = await request.formData();
        } catch {
          return json({ error: "Form upload tidak valid" }, { status: 400 });
        }
        const file = form.get("file");
        if (!(file instanceof File))
          return json({ error: "File tidak ditemukan" }, { status: 400 });

        const origin = String(form.get("origin") || "upload");
        const source = form.get("source") ? String(form.get("source")) : null;

        try {
          const { storeMediaForUser } = await import("@/lib/cloud/registry.server");
          const row = await storeMediaForUser({
            userId,
            name: file.name || `upload-${Date.now()}`,
            mimeType: file.type || "application/octet-stream",
            bytes: await file.arrayBuffer(),
            origin,
            source,
          });
          const base = new URL(request.url).origin;
          return json({
            id: row.id,
            url: `${base}/api/public/cloud/file/${row.id}`,
            storage: row.storage_mode,
          });
        } catch (error) {
          console.error("[cloud/upload]", error);
          return json(
            { error: error instanceof Error ? error.message : "Upload cloud gagal" },
            { status: 502 },
          );
        }
      },
    },
  },
});
