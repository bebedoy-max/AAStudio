// Extension token refresh — swaps a refresh_token for a fresh access_token.
import { createFileRoute } from "@tanstack/react-router";

function cors(res: Response) {
  const h = new Headers(res.headers);
  h.set("Access-Control-Allow-Origin", "*");
  h.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  h.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  return new Response(res.body, { status: res.status, headers: h });
}
const json = (data: unknown, status = 200) =>
  cors(
    new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } }),
  );

export const Route = createFileRoute("/api/public/extension/refresh")({
  server: {
    handlers: {
      OPTIONS: async () => cors(new Response(null, { status: 204 })),
      POST: async ({ request }) => {
        const SUPABASE_URL = process.env.SUPABASE_URL;
        const ANON = process.env.SUPABASE_PUBLISHABLE_KEY;
        if (!SUPABASE_URL || !ANON) return json({ error: "server_misconfigured" }, 500);
        const body = (await request.json().catch(() => null)) as { refresh_token?: string } | null;
        if (!body?.refresh_token) return json({ error: "refresh_token required" }, 400);
        const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: ANON,
            Authorization: `Bearer ${ANON}`,
          },
          body: JSON.stringify({ refresh_token: body.refresh_token }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok)
          return json({ error: data?.error_description || "refresh_failed" }, res.status);
        return json({
          access_token: data.access_token,
          refresh_token: data.refresh_token,
          expires_at: data.expires_at,
          user: { id: data.user?.id, email: data.user?.email },
        });
      },
    },
  },
});
