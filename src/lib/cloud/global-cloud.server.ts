// Server-only: konfigurasi Global Cloud (Google Drive milik aplikasi), diatur admin.
import { encryptConnectionKey, decryptConnectionKey } from "./connection-crypto.server";

export type GlobalCloudRow = {
  enabled: boolean;
  client_id: string | null;
  client_secret_cipher: string | null;
  refresh_token_cipher: string | null;
  account_email: string | null;
  root_folder_name: string | null;
  updated_at: string | null;
};

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as { from: (t: string) => any };
}

export async function getGlobalCloudRow(): Promise<GlobalCloudRow | null> {
  const db = await admin();
  const { data, error } = await db.from("global_cloud").select("*").eq("id", 1).maybeSingle();
  if (error) {
    console.error("[cloud] global_cloud read failed", error.message);
    return null;
  }
  return (data as GlobalCloudRow | null) ?? null;
}

export async function saveGlobalCloudRow(patch: Record<string, unknown>) {
  const db = await admin();
  const { error } = await db
    .from("global_cloud")
    .upsert({ id: 1, ...patch, updated_at: new Date().toISOString() }, { onConflict: "id" });
  if (error) throw new Error(error.message);
}

export async function getGlobalRefreshToken(): Promise<string | null> {
  const row = await getGlobalCloudRow();
  if (!row?.refresh_token_cipher) return null;
  try {
    return decryptConnectionKey(row.refresh_token_cipher);
  } catch (e) {
    console.error("[cloud] failed to decrypt global refresh token", e);
    return null;
  }
}

export function encryptSecret(value: string) {
  return encryptConnectionKey(value);
}
