// GET /api/public/companion/health — cek konektivitas dari app Android.
import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, preflight } from "@/lib/companion/http";

export const Route = createFileRoute("/api/public/companion/health")({
  server: {
    handlers: {
      OPTIONS: async () => preflight(),
      GET: async () =>
        jsonResponse({ ok: true, service: "creative-studio-companion", time: new Date().toISOString() }),
    },
  },
});
