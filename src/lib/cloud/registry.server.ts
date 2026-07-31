// Server-only registry for cloud media (upload + hasil generate).
import { resolveStorageMode, type StorageMode } from "./connections.server";
import { uploadToDrive, downloadFromDrive } from "./drive.server";

export type CloudFileRow = {
  id: string;
  user_id: string;
  storage_mode: StorageMode;
  drive_file_id: string;
  name: string;
  mime_type: string;
  size_bytes: number;
  kind: string;
  origin: string;
  source: string | null;
  source_url: string | null;
<<<<<<< HEAD
  meta: Record<string, unknown> | null;
=======
>>>>>>> 6ddde2bb8b40f5c9ad6348fe0d4c7f95b0bc8f41
  created_at: string;
};

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as { from: (t: string) => any };
}

export const MAX_CLOUD_BYTES = 250 * 1024 * 1024;

function guessKind(mime: string, name: string): string {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  if (/\.(png|jpe?g|webp|gif)$/i.test(name)) return "image";
  if (/\.(mp4|mov|webm)$/i.test(name)) return "video";
  if (/\.(mp3|wav|m4a)$/i.test(name)) return "audio";
  return "file";
}

export async function storeMediaForUser(params: {
  userId: string;
  name: string;
  mimeType: string;
  bytes: ArrayBuffer;
  origin?: string;
  source?: string | null;
  sourceUrl?: string | null;
<<<<<<< HEAD
  meta?: Record<string, unknown> | null;
=======
>>>>>>> 6ddde2bb8b40f5c9ad6348fe0d4c7f95b0bc8f41
}): Promise<CloudFileRow> {
  if (params.bytes.byteLength <= 0 || params.bytes.byteLength > MAX_CLOUD_BYTES) {
    throw new Error("Ukuran file tidak valid atau terlalu besar untuk cloud.");
  }
  const { mode, key } = await resolveStorageMode(params.userId);
  const ctx = { mode, connectionKey: key };
  const origin = params.origin ?? "upload";
  const uploaded = await uploadToDrive(ctx, params.userId, {
    name: params.name,
    type: params.mimeType,
    bytes: params.bytes,
  }, params.source ?? null, origin);

  const db = await admin();
<<<<<<< HEAD
  const baseRow = {
=======
  const { data, error } = await db
    .from("cloud_files")
    .upsert(
      {
>>>>>>> 6ddde2bb8b40f5c9ad6348fe0d4c7f95b0bc8f41
        user_id: params.userId,
        storage_mode: mode,
        drive_file_id: uploaded.id,
        name: uploaded.name,
        mime_type: uploaded.mimeType,
        size_bytes: uploaded.size,
        kind: guessKind(uploaded.mimeType, uploaded.name),
        origin,

        source: params.source ?? null,
        source_url: params.sourceUrl ?? null,
<<<<<<< HEAD
  } as Record<string, unknown>;

  const upsert = (row: Record<string, unknown>) =>
    db
      .from("cloud_files")
      .upsert(row, { onConflict: "user_id,source_url", ignoreDuplicates: false })
      .select("*")
      .single();

  let { data, error } = await upsert({ ...baseRow, meta: params.meta ?? {} });
  // Kolom meta bersifat opsional (migrasi belum dijalankan) — fallback tanpa meta.
  if (error && /meta/i.test(error.message ?? "")) ({ data, error } = await upsert(baseRow));
=======
      },
      { onConflict: "user_id,source_url", ignoreDuplicates: false },
    )
    .select("*")
    .single();
>>>>>>> 6ddde2bb8b40f5c9ad6348fe0d4c7f95b0bc8f41
  if (error) throw new Error(error.message);
  return data as CloudFileRow;
}

export async function findBySourceUrl(userId: string, sourceUrl: string): Promise<CloudFileRow | null> {
  const db = await admin();
  const { data } = await db
    .from("cloud_files")
    .select("*")
    .eq("user_id", userId)
    .eq("source_url", sourceUrl)
    .maybeSingle();
  return (data as CloudFileRow | null) ?? null;
}

export async function getCloudFile(id: string): Promise<CloudFileRow | null> {
  const db = await admin();
  const { data } = await db.from("cloud_files").select("*").eq("id", id).maybeSingle();
  return (data as CloudFileRow | null) ?? null;
}

<<<<<<< HEAD
export async function listCloudFilesForUser(
  userId: string,
  kind?: string | null,
  filters?: { source?: string | null; origin?: string | null },
): Promise<CloudFileRow[]> {
  const db = await admin();
  let query = db.from("cloud_files").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(500);
  if (kind && kind !== "all") query = query.eq("kind", kind);
  if (filters?.source) query = query.eq("source", filters.source);
  if (filters?.origin) query = query.eq("origin", filters.origin);
=======
export async function listCloudFilesForUser(userId: string, kind?: string | null): Promise<CloudFileRow[]> {
  const db = await admin();
  let query = db.from("cloud_files").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(500);
  if (kind && kind !== "all") query = query.eq("kind", kind);
>>>>>>> 6ddde2bb8b40f5c9ad6348fe0d4c7f95b0bc8f41
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data as CloudFileRow[]) ?? [];
}

/**
 * Hapus entri galeri saja. File di Google Drive sengaja TIDAK dihapus —
 * Drive tetap menjadi arsip permanen milik user/admin.
 */
export async function deleteCloudFileForUser(userId: string, id: string): Promise<void> {
  const row = await getCloudFile(id);
  if (!row || row.user_id !== userId) throw new Error("File tidak ditemukan.");
  const db = await admin();
  const { error } = await db.from("cloud_files").delete().eq("id", id).eq("user_id", userId);
  if (error) throw new Error(error.message);
}

export async function ctxForRow(row: CloudFileRow) {
  if (row.storage_mode === "personal") {
    const { getConnectionKeyForUser, DRIVE_CONNECTOR_ID } = await import("./connections.server");
    const key = await getConnectionKeyForUser(row.user_id, DRIVE_CONNECTOR_ID);
    return { mode: "personal" as const, connectionKey: key };
  }
  return { mode: "global" as const, connectionKey: null };
}

export async function streamCloudFile(row: CloudFileRow): Promise<Response> {
  const ctx = await ctxForRow(row);
  return downloadFromDrive(ctx, row.drive_file_id);
}

/** Ambil media dari URL provider lalu simpan ke cloud (dedupe by source_url). */
export async function archiveRemoteUrlForUser(params: {
  userId: string;
  url: string;
  name?: string;
  origin?: string;
  source?: string | null;
<<<<<<< HEAD
  meta?: Record<string, unknown> | null;
=======
>>>>>>> 6ddde2bb8b40f5c9ad6348fe0d4c7f95b0bc8f41
}): Promise<CloudFileRow> {
  const existing = await findBySourceUrl(params.userId, params.url);
  if (existing) return existing;

  const res = await fetch(params.url, { signal: AbortSignal.timeout(120_000) });
  if (!res.ok) throw new Error(`Gagal mengunduh hasil (${res.status})`);
  const mimeType = res.headers.get("content-type")?.split(";")[0] || "application/octet-stream";
  const bytes = await res.arrayBuffer();
  const fallbackName =
    params.name ||
    decodeURIComponent(new URL(params.url).pathname.split("/").pop() || "") ||
    `generated-${Date.now()}`;
  const ext = mimeType.startsWith("video/") ? "mp4" : mimeType.startsWith("image/") ? "jpg" : "bin";
  const name = /\.[a-z0-9]{2,5}$/i.test(fallbackName) ? fallbackName : `${fallbackName}.${ext}`;

  return storeMediaForUser({
    userId: params.userId,
    name,
    mimeType,
    bytes,
    origin: params.origin ?? "generate",
    source: params.source ?? null,
    sourceUrl: params.url,
<<<<<<< HEAD
    meta: params.meta ?? null,
=======
>>>>>>> 6ddde2bb8b40f5c9ad6348fe0d4c7f95b0bc8f41
  });
}