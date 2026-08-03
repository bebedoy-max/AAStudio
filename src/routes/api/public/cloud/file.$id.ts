import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/cloud/file/$id")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const { getCloudFile, streamCloudFile, ctxForRow } =
          await import("@/lib/cloud/registry.server");
        const row = await getCloudFile(params.id);
        if (!row) return new Response("Not found", { status: 404 });

        const url = new URL(request.url);
        const download = url.searchParams.get("download") === "1";
        const forceStream = url.searchParams.get("stream") === "1";

        // Utama: alihkan browser langsung ke storage supaya byte tidak melewati server.
        if (!forceStream) {
          try {
            const { DownloadService } = await import("@/lib/cloud/storage/service.server");
            const { logTransfer } = await import("@/lib/cloud/storage/log.server");
            const ctx = await ctxForRow(row);
            const links = await DownloadService.directLinks(
              ctx,
              row.drive_file_id,
              row.mime_type || "",
            );
            if (links.directUrl) {
              logTransfer(download ? "download.redirect" : "preview.redirect", {
                id: row.id,
                kind: row.kind,
              });
              return new Response(null, {
                status: 302,
                headers: {
                  Location: links.directUrl,
                  "Cache-Control": "public, max-age=3600",
                  ETag: `"${row.id}"`,
                  "Access-Control-Allow-Origin": "*",
                },
              });
            }
          } catch (e) {
            console.warn("[cloud/file] direct link gagal, fallback stream", e);
          }
        }

        if (request.headers.get("if-none-match") === `"${row.id}"`) {
          return new Response(null, { status: 304, headers: { ETag: `"${row.id}"` } });
        }

        const upstream = await streamCloudFile(row);
        if (!upstream.ok || !upstream.body) {
          const detail = await upstream.text().catch(() => "");
          console.error("[cloud/file] drive fetch failed", upstream.status, detail.slice(0, 200));
          return new Response("Gagal membaca file dari cloud", { status: 502 });
        }

        return new Response(upstream.body, {
          status: 200,
          headers: {
            "Content-Type": row.mime_type || "application/octet-stream",
            "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${row.name.replace(/"/g, "")}"`,
            "Cache-Control": "private, max-age=3600",
            ETag: `"${row.id}"`,
            "Access-Control-Allow-Origin": "*",
          },
        });
      },
    },
  },
});
