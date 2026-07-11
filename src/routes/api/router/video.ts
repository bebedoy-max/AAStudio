import { createFileRoute } from "@tanstack/react-router";

// Backend Router — Video analysis / enhance passthrough.
// This endpoint currently does light metadata echo so the frontend has a stable
// contract; heavy transforms (upscale, denoise, motion) route through /render.

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export const Route = createFileRoute("/api/router/video")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = (await request.json().catch(() => ({}))) as {
            action?: string;
            url?: string;
            options?: Record<string, unknown>;
          };
          if (!body.url) return json({ error: "url required" }, 400);
          return json({
            ok: true,
            action: body.action ?? "noop",
            url: body.url,
            options: body.options ?? {},
            note: "Actual video enhancement runs through /api/router/render provider chain.",
          });
        } catch (e) {
          return json({ error: `video crash: ${(e as Error).message}` }, 500);
        }
      },
    },
  },
});
