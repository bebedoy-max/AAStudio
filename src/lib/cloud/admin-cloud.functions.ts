// Server functions khusus admin: konfigurasi Global Cloud (Google Drive aplikasi).
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(context: { supabase: unknown; userId: string }) {
  const db = context.supabase as { rpc: (fn: string, args?: any) => Promise<any> };
  const { data, error } = await db.rpc("has_role", { _user_id: context.userId, _role: "admin" });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden");
}

export const getGlobalCloudSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { getGlobalCloudRow } = await import("./global-cloud.server");
    const { OAUTH_CALLBACK_PATH } = await import("./google-oauth.server");
    const row = await getGlobalCloudRow();
    const request = getRequest();
    const redirectUri = request
      ? new URL(OAUTH_CALLBACK_PATH, request.url).toString()
      : OAUTH_CALLBACK_PATH;
    return {
      enabled: Boolean(row?.enabled),
      clientId: row?.client_id ?? "",
      clientSecretSet: Boolean(row?.client_secret_cipher),
      connected: Boolean(row?.refresh_token_cipher),
      accountEmail: row?.account_email ?? null,
      rootFolderName: row?.root_folder_name ?? "AA Creative Studio",
      redirectUri,
      updatedAt: row?.updated_at ?? null,
    };
  });

export const saveGlobalCloudClient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { clientId: string; clientSecret?: string; rootFolderName?: string }) => {
    if (!data?.clientId?.trim()) throw new Error("Client ID wajib diisi");
    return data;
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { saveGlobalCloudRow, encryptSecret } = await import("./global-cloud.server");
    const patch: Record<string, unknown> = { client_id: data.clientId.trim() };
    if (data.clientSecret?.trim())
      patch.client_secret_cipher = encryptSecret(data.clientSecret.trim());
    if (data.rootFolderName?.trim()) patch.root_folder_name = data.rootFolderName.trim();
    await saveGlobalCloudRow(patch);
    return { ok: true };
  });

export const setGlobalCloudEnabled = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { enabled: boolean }) => ({ enabled: Boolean(data?.enabled) }))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { saveGlobalCloudRow } = await import("./global-cloud.server");
    await saveGlobalCloudRow({ enabled: data.enabled });
    return { ok: true, enabled: data.enabled };
  });

export const startGlobalCloudConnect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const request = getRequest();
    if (!request) throw new Error("OAuth harus dimulai dari request aplikasi.");
    const { getOAuthClient, buildAuthUrl, signState, callbackUrl } =
      await import("./google-oauth.server");
    const client = await getOAuthClient();
    if (!client) throw new Error("Isi Client ID & Client Secret Google dulu, lalu simpan.");
    return {
      authorizationUrl: buildAuthUrl({
        client,
        redirectUri: callbackUrl(request.url),
        state: signState({ userId: context.userId, target: "global", ts: Date.now() }),
      }),
    };
  });

export const disconnectGlobalCloud = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { saveGlobalCloudRow } = await import("./global-cloud.server");
    await saveGlobalCloudRow({ refresh_token_cipher: null, account_email: null, enabled: false });
    return { ok: true };
  });
