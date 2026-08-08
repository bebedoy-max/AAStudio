// Extension push-token — accepts a JWT captured by the browser extension and
// merges it into the signed-in user's encrypted user_tokens row for the
// matching provider (aatools.<provider>.keys). Idempotent: duplicate tokens
// are skipped instead of appended again.
import { createFileRoute } from "@tanstack/react-router";

// Providers the extension is allowed to push. Extend both this map and the
// providers.js registry in the extension to add more.
const PROVIDER_KEYS: Record<string, string> = {
  framia: "aatools.framia.keys",
  leonardo: "aatools.leonardo.keys",
  firefly: "aatools.firefly.keys",
  dola: "aatools.dola.keys",
  weavy: "aatools.weavy.tokens",
};

const ALLOWED_ORIGIN_RE =
  /^https?:\/\/(localhost(:\d+)?|127\.0\.0\.1(:\d+)?|[\w-]+\.lovable\.app|[\w-]+\.lovable\.dev|aacreative\.vercel\.app)$/;

function cors(res: Response, origin?: string | null) {
  const h = new Headers(res.headers);
  // Ekstensi (background script) tidak tunduk CORS, jadi wildcard tidak perlu.
  if (origin && ALLOWED_ORIGIN_RE.test(origin)) {
    h.set("Access-Control-Allow-Origin", origin);
    h.set("Vary", "Origin");
  }
  h.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  h.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  return new Response(res.body, { status: res.status, headers: h });
}
const json = (data: unknown, status = 200, origin?: string | null) =>
  cors(
    new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } }),
    origin,
  );

const JWT_RE = /^eyJ[\w-]+\.[\w-]+\.[\w-]+$/;

type KeyEntry = { id: string; key: string; balance: number | null; status: string; note?: string };

export const Route = createFileRoute("/api/public/extension/push-token")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) => cors(new Response(null, { status: 204 }), request.headers.get("origin")),
      POST: async ({ request }) => {
        const SUPABASE_URL = process.env.SUPABASE_URL;
        const ANON = process.env.SUPABASE_PUBLISHABLE_KEY;
        if (!SUPABASE_URL || !ANON) return json({ error: "server_misconfigured" }, 500);

        const auth = request.headers.get("Authorization") || "";
        const bearer = /^Bearer\s+(.+)$/i.exec(auth)?.[1];
        if (!bearer) return json({ error: "missing_bearer" }, 401);

        // Verify caller by asking Supabase auth for the user tied to this JWT.
        const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
          headers: { apikey: ANON, Authorization: `Bearer ${bearer}` },
        });
        if (!userRes.ok) return json({ error: "unauthorized" }, 401);
        const user = (await userRes.json()) as { id?: string };
        if (!user?.id) return json({ error: "unauthorized" }, 401);

        const body = (await request.json().catch(() => null)) as { provider?: string; token?: string } | null;
        const provider = body?.provider ?? "";
        const token = body?.token ?? "";
        const storageKey = PROVIDER_KEYS[provider];
        if (!storageKey) return json({ error: "unknown_provider" }, 400);
        // Dola memakai cookie session (bukan JWT) — validasi longgar untuk provider itu.
        if (provider === "dola") {
          const hasSession = /(?:^|;\s*)(sessionid|sessionid_ss|sid_tt|sid_guard|session_id|uid_tt|uid_tt_ss|passport_csrf_token)=/.test(
            token,
          );
          if (!hasSession) return json({ error: "invalid_cookie" }, 400);
        } else if (provider === "weavy") {
          // Firebase refresh token — panjang, opaque, tidak bershape JWT.
          if (typeof token !== "string" || token.length < 40 || token.length > 4096) {
            return json({ error: "invalid_refresh_token" }, 400);
          }
        } else if (!JWT_RE.test(token)) {
          return json({ error: "invalid_jwt" }, 400);
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { encryptString, decryptString } = await import("@/lib/tokens/crypto.server");

        // Load current encrypted list (if any) and decrypt it.
        const db = supabaseAdmin as unknown as {
          from: (t: string) => {
            select: (c: string) => {
              eq: (col: string, v: string) => {
                eq: (col: string, v: string) => {
                  maybeSingle: () => Promise<{ data: { ciphertext: string } | null; error: unknown }>;
                };
              };
            };
            upsert: (v: Record<string, unknown>, o: { onConflict: string }) => Promise<{ error: unknown }>;
          };
        };
        const existing = await db
          .from("user_tokens")
          .select("ciphertext")
          .eq("user_id", user.id)
          .eq("storage_key", storageKey)
          .maybeSingle();

        // Weavy entries use `token` field; other providers use `key`.
        const tokenField = provider === "weavy" ? "token" : "key";
        type AnyEntry = Record<string, unknown>;
        let list: AnyEntry[] = [];
        if (existing.data?.ciphertext) {
          try {
            const plain = await decryptString(existing.data.ciphertext);
            const parsed = JSON.parse(plain);
            if (Array.isArray(parsed)) list = parsed as AnyEntry[];
          } catch {
            list = [];
          }
        }

        const already = list.some((x) => x?.[tokenField] === token);
        if (already) return json({ ok: true, added: false });

        if (provider === "weavy") {
          list.push({
            id: crypto.randomUUID(),
            token,
            credits: null,
            status: "pending",
            note: "auto-grabbed via extension",
          });
        } else {
          list.push({
            id: crypto.randomUUID(),
            key: token,
            balance: null,
            status: "pending",
            note: "auto-grabbed via extension",
          } as KeyEntry);
        }

        const ciphertext = await encryptString(JSON.stringify(list));
        const up = await db.from("user_tokens").upsert(
          {
            user_id: user.id,
            storage_key: storageKey,
            ciphertext,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id,storage_key" },
        );
        if (up.error) {
          const msg = (up.error as { message?: string })?.message ?? "db_error";
          return json({ error: msg }, 500);
        }
        return json({ ok: true, added: true, count: list.length });
      },
    },
  },
});
