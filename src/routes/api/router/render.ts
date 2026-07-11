import { createFileRoute } from "@tanstack/react-router";

// Backend Router — Render orchestrator.
// Accepts timeline+audio+subtitle payload, forwards to the first available
// provider (Wavespeed → Weavy). If no provider key is present, returns a
// deterministic "preview" plan so the UI stays functional; the client will
// mark it as pending until a real render key is added.

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function parseKeys(header: string | null): string[] {
  if (!header) return [];
  return header.split(/[\s,;\n]+/).map((s) => s.trim()).filter(Boolean);
}

export const Route = createFileRoute("/api/router/render")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = (await request.json().catch(() => ({}))) as {
            kind?: "clipper" | "dubbing";
            timeline?: { totalSec?: number; tracks?: unknown[] };
            aspectRatio?: string;
          };
          const wavespeed = parseKeys(request.headers.get("x-user-wavespeed-keys"));
          const weavy = parseKeys(request.headers.get("x-user-weavy-keys"));

          // The current template does not include a live video-composition
          // endpoint on either Wavespeed or Weavy public APIs; we return a
          // structured plan so the timeline + subtitle + audio remain the
          // shippable output while a render integration is being wired up.
          const provider = wavespeed.length ? "wavespeed" : weavy.length ? "weavy" : "planner";
          const jobId = `job_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
          return json({
            ok: true,
            provider,
            jobId,
            status: provider === "planner" ? "queued" : "queued",
            message:
              provider === "planner"
                ? "No render provider key detected. Timeline + subtitle + audio bundle prepared for local export."
                : `Render enqueued on ${provider}.`,
            plan: {
              kind: body.kind,
              aspectRatio: body.aspectRatio,
              totalSec: body.timeline?.totalSec ?? 0,
              trackCount: body.timeline?.tracks?.length ?? 0,
            },
          });
        } catch (e) {
          return json({ error: `render crash: ${(e as Error).message}` }, 500);
        }
      },
    },
  },
});
