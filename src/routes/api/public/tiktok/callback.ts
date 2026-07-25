import { createFileRoute } from "@tanstack/react-router";
import { encryptString } from "@/lib/tokens/crypto.server";

const TIKTOK_TOKEN_URL = "https://open.tiktokapis.com/v2/oauth/token/";
const TIKTOK_USERINFO_URL =
  "https://open.tiktokapis.com/v2/user/info/?fields=open_id,union_id,avatar_url,display_name";

function getOrigin(): string {
  const explicit = process.env.APP_URL || process.env.PUBLIC_APP_URL;
  if (explicit) return explicit.replace(/\/$/, "");
  const vercel = process.env.VERCEL_URL;
  if (vercel) return `https://${vercel}`;
  return "http://localhost:8080";
}

function htmlResponse(payload: { ok: boolean; message: string; handle?: string }): Response {
  const safe = JSON.stringify(payload).replace(/</g, "\\u003c");
  const body = `<!doctype html><html><head><meta charset="utf-8"><title>TikTok Connect</title>
<style>body{font-family:system-ui;background:#0b0b12;color:#e6e6ee;display:grid;place-items:center;min-height:100vh;margin:0}
.card{background:#171727;padding:32px 40px;border-radius:16px;max-width:420px;text-align:center;border:1px solid #2a2a42}
.ok{color:#4ade80}.err{color:#f87171}</style></head><body>
<div class="card">
<h2 class="${payload.ok ? "ok" : "err"}">${payload.ok ? "✓ TikTok Tersambung" : "✗ Gagal"}</h2>
<p>${payload.message}</p>
<p style="opacity:.6;font-size:12px">Jendela ini akan tertutup otomatis…</p>
</div>
<script>
try { window.opener && window.opener.postMessage({ source: "tiktok-oauth", ...${safe} }, "*"); } catch (e) {}
setTimeout(function(){ window.close(); }, 1500);
</script></body></html>`;
  return new Response(body, { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } });
}

export const Route = createFileRoute("/api/public/tiktok/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        const errCode = url.searchParams.get("error");
        const errDesc = url.searchParams.get("error_description");

        if (errCode) {
          return htmlResponse({ ok: false, message: `TikTok error: ${errCode} — ${errDesc ?? ""}` });
        }
        if (!code || !state) {
          return htmlResponse({ ok: false, message: "Parameter code/state hilang." });
        }

        const clientKey = process.env.TIKTOK_CLIENT_KEY;
        const clientSecret = process.env.TIKTOK_CLIENT_SECRET;
        if (!clientKey || !clientSecret) {
          return htmlResponse({ ok: false, message: "TIKTOK_CLIENT_KEY / TIKTOK_CLIENT_SECRET belum di-set." });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const admin = supabaseAdmin as any;

        // Look up + consume state
        const { data: stateRow, error: stateErr } = await admin
          .from("tiktok_oauth_state")
          .select("user_id, created_at")
          .eq("state", state)
          .maybeSingle();
        if (stateErr || !stateRow) {
          return htmlResponse({ ok: false, message: "State tidak dikenal / kadaluarsa. Coba lagi." });
        }
        await admin.from("tiktok_oauth_state").delete().eq("state", state);

        const ageMs = Date.now() - new Date(stateRow.created_at).getTime();
        if (ageMs > 10 * 60 * 1000) {
          return htmlResponse({ ok: false, message: "State kadaluarsa (>10 menit). Ulangi." });
        }

        const redirectUri = `${getOrigin()}/api/public/tiktok/callback`;

        // Exchange code -> tokens
        const tokenRes = await fetch(TIKTOK_TOKEN_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "Cache-Control": "no-cache",
          },
          body: new URLSearchParams({
            client_key: clientKey,
            client_secret: clientSecret,
            code,
            grant_type: "authorization_code",
            redirect_uri: redirectUri,
          }).toString(),
        });
        const tokenJson = (await tokenRes.json().catch(() => ({}))) as {
          access_token?: string;
          refresh_token?: string;
          expires_in?: number;
          refresh_expires_in?: number;
          open_id?: string;
          scope?: string;
          error?: string;
          error_description?: string;
        };
        if (!tokenRes.ok || !tokenJson.access_token) {
          return htmlResponse({
            ok: false,
            message: `Token exchange gagal: ${tokenJson.error ?? tokenRes.status} — ${tokenJson.error_description ?? ""}`,
          });
        }

        // Fetch user profile
        let displayName: string | undefined;
        let avatarUrl: string | undefined;
        let unionId: string | undefined;
        try {
          const userRes = await fetch(TIKTOK_USERINFO_URL, {
            headers: { Authorization: `Bearer ${tokenJson.access_token}` },
          });
          const userJson = (await userRes.json()) as {
            data?: { user?: { open_id?: string; union_id?: string; avatar_url?: string; display_name?: string } };
          };
          const u = userJson.data?.user;
          displayName = u?.display_name;
          avatarUrl = u?.avatar_url;
          unionId = u?.union_id;
        } catch {
          /* non-fatal */
        }

        const openId = tokenJson.open_id;
        if (!openId) {
          return htmlResponse({ ok: false, message: "TikTok tidak mengembalikan open_id." });
        }

        const accessCt = await encryptString(tokenJson.access_token);
        const refreshCt = tokenJson.refresh_token ? await encryptString(tokenJson.refresh_token) : null;
        const nowMs = Date.now();
        const accessExp = tokenJson.expires_in
          ? new Date(nowMs + tokenJson.expires_in * 1000).toISOString()
          : null;
        const refreshExp = tokenJson.refresh_expires_in
          ? new Date(nowMs + tokenJson.refresh_expires_in * 1000).toISOString()
          : null;

        const { error: upsertErr } = await admin.from("tiktok_accounts").upsert(
          {
            user_id: stateRow.user_id,
            open_id: openId,
            union_id: unionId ?? null,
            display_name: displayName ?? null,
            avatar_url: avatarUrl ?? null,
            scope: tokenJson.scope ?? null,
            access_token_ct: accessCt,
            refresh_token_ct: refreshCt,
            access_expires_at: accessExp,
            refresh_expires_at: refreshExp,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id,open_id" },
        );
        if (upsertErr) {
          return htmlResponse({ ok: false, message: `DB error: ${upsertErr.message}` });
        }

        return htmlResponse({
          ok: true,
          message: `Akun ${displayName ?? openId} berhasil terhubung.`,
          handle: displayName ?? openId,
        });
      },
    },
  },
});
