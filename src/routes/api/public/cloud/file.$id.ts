import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/cloud/file/$id")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const { getCloudFile, streamCloudFile } = await import("@/lib/cloud/registry.server");
        const row = await getCloudFile(params.id);
        if (!row) return new Response("Not found", { status: 404 });

        const upstream = await streamCloudFile(row);
        if (!upstream.ok || !upstream.body) {
          const detail = await upstream.text().catch(() => "");
          console.error("[cloud/file] drive fetch failed", upstream.status, detail.slice(0, 200));
          return new Response("Gagal membaca file dari cloud", { status: 502 });
        }

        const download = new URL(request.url).searchParams.get("download") === "1";
        return new Response(upstream.body, {
          status: 200,
          headers: {
            "Content-Type": row.mime_type || "application/octet-stream",
            "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${row.name.replace(/"/g, "")}"`,
            "Cache-Control": "private, max-age=3600",
            "Access-Control-Allow-Origin": "*",
          },
        });
      },
    },
  },
});