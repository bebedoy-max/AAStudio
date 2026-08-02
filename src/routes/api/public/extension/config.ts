// Remote config untuk browser extension AA Grabber.
// Extension mem-polling endpoint ini, jadi saat admin mengubah URL AA Creative
// Studio / nama / logo di Plug-IN Config, extension yang sudah ter-install ikut
// ter-update otomatis tanpa perlu install ulang.
import { createFileRoute } from "@tanstack/react-router";

function cors(res: Response) {
  const h = new Headers(res.headers);
  h.set("Access-Control-Allow-Origin", "*");
  h.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  h.set("Access-Control-Allow-Methods", "GET, OPTIONS");
  h.set("Cache-Control", "no-store");
  return new Response(res.body, { status: res.status, headers: h });
}

function json(data: unknown, status = 200) {
  return cors(new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } }));
}

const FALLBACK_URL = "https://aacreative.vercel.app/";

export const Route = createFileRoute("/api/public/extension/config")({
  server: {
    handlers: {
      OPTIONS: async () => cors(new Response(null, { status: 204 })),
      GET: async ({ request }) => {
        const SUPABASE_URL = process.env.SUPABASE_URL;
        const ANON = process.env.SUPABASE_PUBLISHABLE_KEY;
        const providerId = new URL(request.url).searchParams.get("provider") || "";

        let appUrl = FALLBACK_URL;
        let pluginConfig: Record<string, Record<string, unknown>> = {};

        if (SUPABASE_URL && ANON) {
          try {
            const res = await fetch(
              `${SUPABASE_URL}/rest/v1/app_settings?id=eq.1&select=plugin_app_url,plugin_config`,
              { headers: { apikey: ANON, Authorization: `Bearer ${ANON}` } },
            );
            const rows = (await res.json().catch(() => [])) as Array<{
              plugin_app_url?: string | null;
              plugin_config?: Record<string, Record<string, unknown>> | null;
            }>;
            const row = Array.isArray(rows) ? rows[0] : null;
            if (row?.plugin_app_url) appUrl = row.plugin_app_url;
            if (row?.plugin_config) pluginConfig = row.plugin_config;
          } catch {
            // fall through to defaults
          }
        }

        const key = providerId ? `grabber-${providerId}` : "";
        const entry = (key && pluginConfig[key]) || {};

        return json({
          appUrl,
          provider: providerId,
          enabled: entry.enabled !== false,
          name: typeof entry.name === "string" ? entry.name.trim() : "",
          logoUrl: typeof entry.logoUrl === "string" ? entry.logoUrl.trim() : "",
          version: typeof entry.version === "string" ? entry.version.trim() : "",
          note: typeof entry.note === "string" ? entry.note.trim() : "",
          at: Date.now(),
        });
      },
    },
  },
});