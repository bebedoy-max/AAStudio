import { createFileRoute } from "@tanstack/react-router";

function closingPage(ok: boolean, message: string) {
  const payload = JSON.stringify({
    type: ok ? "appUserConnectorOAuthComplete" : "appUserConnectorOAuthFailed",
    connectorId: "google_drive",
  });
  return new Response(
    `<!doctype html><meta charset="utf-8"><title>Google Drive</title>
<body style="font-family:system-ui;background:#0b0b12;color:#eee;display:grid;place-items:center;height:100vh;margin:0">
<p style="max-width:32rem;text-align:center">${message}</p>
<script>
  try { window.opener && window.opener.postMessage(${payload}, window.location.origin); } catch (e) {}
  setTimeout(function(){ window.close(); }, ${ok ? 300 : 4000});
</script></body>`,
    { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}

export const Route = createFileRoute("/api/public/google-drive/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const error = url.searchParams.get("error");
        if (error) return closingPage(false, `Google menolak izin: ${error}`);
        const code = url.searchParams.get("code");
        const rawState = url.searchParams.get("state") || "";

        const {
          verifyState,
          getOAuthClient,
          exchangeCodeForRefreshToken,
          accessTokenFromRefresh,
          googleAccountEmail,
          callbackUrl,
        } = await import("@/lib/cloud/google-oauth.server");

        const state = verifyState(rawState);
        if (!code || !state) return closingPage(false, "Sesi OAuth tidak valid atau kedaluwarsa. Coba hubungkan lagi.");

        try {
          const client = await getOAuthClient();
          if (!client) throw new Error("Google OAuth client belum dikonfigurasi admin.");
          const { refreshToken } = await exchangeCodeForRefreshToken({
            client,
            code,
            redirectUri: callbackUrl(request.url),
          });
          const email = await googleAccountEmail(await accessTokenFromRefresh(refreshToken));

          if (state.target === "global") {
            const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
            const { data: isAdmin } = await (supabaseAdmin as any).rpc("has_role", {
              _user_id: state.userId,
              _role: "admin",
            });
            if (!isAdmin) return closingPage(false, "Hanya admin yang boleh menghubungkan Global Cloud.");
            const { saveGlobalCloudRow, encryptSecret } = await import("@/lib/cloud/global-cloud.server");
            await saveGlobalCloudRow({
              refresh_token_cipher: encryptSecret(refreshToken),
              account_email: email,
              enabled: true,
            });
          } else {
            const { saveConnectionKeyForUser, setStorageMode, DRIVE_CONNECTOR_ID } = await import(
              "@/lib/cloud/connections.server"
            );
            await saveConnectionKeyForUser(state.userId, DRIVE_CONNECTOR_ID, refreshToken, email);
            const { invalidateDriveFolderCache } = await import("@/lib/cloud/drive.server");
            invalidateDriveFolderCache(state.userId);
            await setStorageMode(state.userId, "personal");
          }
          return closingPage(true, "Google Drive terhubung. Jendela ini akan tertutup…");
        } catch (e) {
          console.error("[cloud] oauth callback failed", e);
          return closingPage(false, (e as Error).message || "Gagal menyelesaikan koneksi Google Drive.");
        }
      },
    },
  },
});
