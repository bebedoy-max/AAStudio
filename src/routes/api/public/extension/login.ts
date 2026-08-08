// Extension login proxy — forwards email/password to Supabase auth so the
// browser extension doesn't need to bundle Supabase URL / anon key.
import { createFileRoute } from "@tanstack/react-router";

// Ekstensi (background script) tidak tunduk CORS, jadi wildcard tidak perlu.
// Batasi origin web yang boleh membaca respons berisi access/refresh token.
const ALLOWED_ORIGIN_RE =
  /^https?:\/\/(localhost(:\d+)?|127\.0\.0\.1(:\d+)?|[\w-]+\.lovable\.app|[\w-]+\.lovable\.dev|aacreative\.vercel\.app)$/;

function cors(res: Response, origin?: string | null) {
  const h = new Headers(res.headers);
  if (origin && ALLOWED_ORIGIN_RE.test(origin)) {
    h.set("Access-Control-Allow-Origin", origin);
    h.set("Vary", "Origin");
  }
  h.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  h.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  return new Response(res.body, { status: res.status, headers: h });
}

function json(data: unknown, status = 200, origin?: string | null) {
  return cors(new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } }), origin);
}

export const Route = createFileRoute("/api/public/extension/login")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) => cors(new Response(null, { status: 204 }), request.headers.get("origin")),
      POST: async ({ request }) => {
        const origin = request.headers.get("origin");
        const { rateLimit, clientIp } = await import("@/lib/security/rate-limit.server");
        const limited = rateLimit(`extlogin:${clientIp(request)}`, { limit: 10, windowMs: 10 * 60 * 1000 });
        if (!limited.allowed) {
          return json({ error: "rate_limited", retry_after: limited.retryAfter }, 429, origin);
        }
        const SUPABASE_URL = process.env.SUPABASE_URL;
        const ANON = process.env.SUPABASE_PUBLISHABLE_KEY;
        if (!SUPABASE_URL || !ANON) return json({ error: "server_misconfigured" }, 500, origin);
        const body = (await request.json().catch(() => null)) as { email?: string; password?: string } | null;
        if (!body?.email || !body?.password) return json({ error: "email/password required" }, 400, origin);
        const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
          method: "POST",
          headers: { "Content-Type": "application/json", apikey: ANON, Authorization: `Bearer ${ANON}` },
          body: JSON.stringify({ email: body.email, password: body.password }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) return json({ error: data?.error_description || data?.msg || "login_failed" }, res.status, origin);
        return json({
          access_token: data.access_token,
          refresh_token: data.refresh_token,
          expires_at: data.expires_at,
          user: { id: data.user?.id, email: data.user?.email },
        }, 200, origin);
      },
    },
  },
});
