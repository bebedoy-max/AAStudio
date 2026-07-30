// Server-only storage of per-user Google Drive connection keys + storage prefs.
import { encryptConnectionKey, decryptConnectionKey } from "./connection-crypto.server";

export const DRIVE_CONNECTOR_ID = "google_drive";
export type StorageMode = "global" | "personal";

type AnyClient = {
  from: (t: string) => any;
};

async function admin(): Promise<AnyClient> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as AnyClient;
}

export async function saveConnectionKeyForUser(
  userId: string,
  connectorId: string,
  connectionAPIKey: string,
  accountEmail?: string | null,
) {
  const db = await admin();
  const { error } = await db.from("app_user_connections").upsert(
    {
      user_id: userId,
      connector_id: connectorId,
      connection_key_ciphertext: encryptConnectionKey(connectionAPIKey),
      account_email: accountEmail ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,connector_id" },
  );
  if (error) throw new Error(error.message);
}

export async function getConnectionKeyForUser(
  userId: string,
  connectorId: string,
): Promise<string | null> {
  const db = await admin();
  const { data, error } = await db
    .from("app_user_connections")
    .select("connection_key_ciphertext")
    .eq("user_id", userId)
    .eq("connector_id", connectorId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data?.connection_key_ciphertext) return null;
  try {
    return decryptConnectionKey(data.connection_key_ciphertext);
  } catch (e) {
    console.error("[cloud] failed to decrypt connection key", e);
    return null;
  }
}

export async function getConnectionInfoForUser(userId: string, connectorId: string) {
  const db = await admin();
  const { data } = await db
    .from("app_user_connections")
    .select("account_email, updated_at")
    .eq("user_id", userId)
    .eq("connector_id", connectorId)
    .maybeSingle();
  return (data as { account_email: string | null; updated_at: string } | null) ?? null;
}

export async function deleteConnectionForUser(userId: string, connectorId: string) {
  const db = await admin();
  await db.from("app_user_connections").delete().eq("user_id", userId).eq("connector_id", connectorId);
}

export async function getStorageMode(userId: string): Promise<StorageMode> {
  const db = await admin();
  const { data } = await db
    .from("user_cloud_prefs")
    .select("storage_mode")
    .eq("user_id", userId)
    .maybeSingle();
  const mode = (data as { storage_mode?: string } | null)?.storage_mode;
  return mode === "personal" ? "personal" : "global";
}

export async function setStorageMode(userId: string, mode: StorageMode) {
  const db = await admin();
  const { error } = await db.from("user_cloud_prefs").upsert(
    { user_id: userId, storage_mode: mode, updated_at: new Date().toISOString() },
    { onConflict: "user_id" },
  );
  if (error) throw new Error(error.message);
}

/** Mode efektif: 'personal' hanya kalau user benar-benar punya koneksi Drive. */
export async function resolveStorageMode(userId: string): Promise<{ mode: StorageMode; key: string | null }> {
  const preferred = await getStorageMode(userId);
  if (preferred === "personal") {
    const key = await getConnectionKeyForUser(userId, DRIVE_CONNECTOR_ID);
    if (key) return { mode: "personal", key };
  }
  return { mode: "global", key: null };
}