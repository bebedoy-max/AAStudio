// Server-only Google Drive access.
//  - mode "global"   : Drive milik admin aplikasi (App connector, gateway + GOOGLE_DRIVE_API_KEY)
//  - mode "personal" : Drive milik user (App User Connector, connection key per user)
import { callAsAppUser } from "@/integrations/lovable/appUserConnector";
import { DRIVE_CONNECTOR_ID, type StorageMode } from "./connections.server";

export const GATEWAY_BASE_URL = "https://connector-gateway.lovable.dev";
export const APP_FOLDER_NAME = "AA Creative Studio";

export type DriveCtx = { mode: StorageMode; connectionKey?: string | null };

/** Panggil Google Drive API langsung memakai OAuth refresh token (self-hosted friendly). */
async function directDriveFetch(refreshToken: string, path: string, init?: RequestInit): Promise<Response> {
  const { accessTokenFromRefresh } = await import("./google-oauth.server");
  const accessToken = await accessTokenFromRefresh(refreshToken);
  const headers = new Headers(init?.headers);
  headers.set("Authorization", `Bearer ${accessToken}`);
  const base = path.startsWith("/upload/") ? "https://www.googleapis.com" : "https://www.googleapis.com";
  return fetch(`${base}${path}`, { ...init, headers });
}

async function driveFetch(ctx: DriveCtx, path: string, init?: RequestInit): Promise<Response> {
  if (ctx.mode === "personal") {
    if (!ctx.connectionKey) throw new Error("Google Drive pribadi belum terhubung.");
    // Koneksi lama lewat Lovable connector gateway masih didukung.
    if (ctx.connectionKey.startsWith("lovack_")) {
      return callAsAppUser({
        gatewayBaseUrl: GATEWAY_BASE_URL,
        connectionAPIKey: ctx.connectionKey,
        connectorId: DRIVE_CONNECTOR_ID,
        path,
        init,
      });
    }
    return directDriveFetch(ctx.connectionKey, path, init);
  }

  const { getGlobalCloudRow, getGlobalRefreshToken } = await import("./global-cloud.server");
  const row = await getGlobalCloudRow();
  if (!row?.enabled) throw new Error("Global Cloud belum diaktifkan admin.");
  const refresh = await getGlobalRefreshToken();
  if (refresh) return directDriveFetch(refresh, path, init);

  const lovableKey = process.env.LOVABLE_API_KEY;
  const driveKey = process.env.GOOGLE_DRIVE_API_KEY;
  if (!lovableKey || !driveKey) {
    throw new Error("Global Cloud belum terhubung ke Google Drive admin.");
  }
  const headers = new Headers(init?.headers);
  headers.set("Authorization", `Bearer ${lovableKey}`);
  headers.set("X-Connection-Api-Key", driveKey);
  return fetch(`${GATEWAY_BASE_URL}/${DRIVE_CONNECTOR_ID}${path}`, { ...init, headers });
}

async function readError(res: Response, label: string): Promise<never> {
  const body = await res.text().catch(() => "");
  throw new Error(`${label} gagal [${res.status}]: ${body.slice(0, 400)}`);
}

async function findFolder(ctx: DriveCtx, name: string, parentId?: string): Promise<string | null> {
  const q = [
    "mimeType='application/vnd.google-apps.folder'",
    `name='${name.replace(/'/g, "\\'")}'`,
    "trashed=false",
    parentId ? `'${parentId}' in parents` : null,
  ]
    .filter(Boolean)
    .join(" and ");
  const res = await driveFetch(
    ctx,
    `/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name,createdTime)&orderBy=createdTime&pageSize=10`,
  );
  if (!res.ok) return null;
  const data = (await res.json().catch(() => null)) as { files?: { id: string }[] } | null;
  return data?.files?.[0]?.id ?? null;
}

async function createFolder(ctx: DriveCtx, name: string, parentId?: string): Promise<string> {
  const res = await driveFetch(ctx, "/drive/v3/files?fields=id", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name,
      mimeType: "application/vnd.google-apps.folder",
      ...(parentId ? { parents: [parentId] } : {}),
    }),
  });
  if (!res.ok) await readError(res, "Membuat folder Drive");
  const data = (await res.json()) as { id: string };
  return data.id;
}

/**
 * Ambil folder yang sudah ada, atau buat sekali saja.
 * Setelah membuat, cek ulang: kalau ada duplikat (race), pakai yang paling lama
 * dan buang folder duplikat yang baru dibuat supaya 1 menu = 1 folder.
 */
async function getOrCreateFolder(ctx: DriveCtx, name: string, parentId?: string): Promise<string> {
  const existing = await findFolder(ctx, name, parentId);
  if (existing) return existing;
  const created = await createFolder(ctx, name, parentId);
  const winner = (await findFolder(ctx, name, parentId)) ?? created;
  if (winner !== created) {
    try {
      await driveFetch(ctx, `/drive/v3/files/${created}`, { method: "DELETE" });
    } catch {
      /* abaikan */
    }
  }
  return winner;
}


const folderCache = new Map<string, Promise<string>>();

/** Buang cache folder setelah user mengganti/menghubungkan ulang akun Drive. */
export function invalidateDriveFolderCache(userId: string): void {
  for (const key of folderCache.keys()) {
    if (key.includes(`:${userId}:`)) folderCache.delete(key);
  }
}

/** Label folder user di Global Cloud: "@displayname" (fallback ke email/user id). */
export async function userFolderLabel(userId: string): Promise<string> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await (supabaseAdmin as any)
      .from("profiles")
      .select("display_name,email")
      .eq("id", userId)
      .maybeSingle();
    const raw: string =
      (data?.display_name as string | null)?.trim() ||
      ((data?.email as string | null) ?? "").split("@")[0] ||
      userId;
    const clean = raw.replace(/[\\/:*?"<>|]/g, "").replace(/\s+/g, " ").trim();
    return `@${clean || userId}`;
  } catch {
    return `@${userId}`;
  }
}

/** Nama folder menu di Drive, dipetakan dari `source` yang dikirim halaman generate. */
const MENU_FOLDERS: Record<string, string> = {
  motion: "Motion Control",
  "motion-control": "Motion Control",
  "magnific-motion": "Motion Control",
  "image-to-video": "Image To Video",
  "text-to-video": "Text to Video",
  leonardo: "Text to Image",
  "text-to-image": "Text to Image",
  storyboard: "Produk Storyboard",
  naratif: "Naratif Video Maker",
  "bulk-fashion": "Bulk Fashion Generator",
  upscaler: "Upscaler",
  framia: "Framia",
  clipper: "AI Clipper",
  dubbing: "AI Dubber",
  "reff-edit": "Reff Edit",
  "reff-edit-image": "Image Reference Edit",
  "reff-edit-video": "Video Reference Edit",
  "ai-influencer": "AI Influencer Studio",
};

export function menuFolderName(source?: string | null): string {
  const key = (source ?? "").trim().toLowerCase();
  if (!key) return "Lainnya";
  const mapped = MENU_FOLDERS[key];
  if (mapped) return mapped;
  return key
    .replace(/[\\/:*?"<>|]/g, "")
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ") || "Lainnya";
}

/** Folder kategori berdasarkan asal file. */
export function originFolderName(origin?: string | null): string {
  return (origin ?? "").trim().toLowerCase() === "upload" ? "Upload File" : "Generate";
}

/**
 * Folder tujuan:
 *  - personal : "AA Creative Studio/<Upload File|Generate>/<Menu>"
 *  - global   : "AA Creative Studio/@user/<Upload File|Generate>/<Menu>"
 * Resolusi di-cache per-promise supaya generate paralel tidak membuat folder ganda.
 */
export async function ensureFolder(
  ctx: DriveCtx,
  userId: string,
  source?: string | null,
  origin?: string | null,
): Promise<string> {
  const menu = menuFolderName(source);
  const bucket = originFolderName(origin);
  // Connection key ikut membedakan cache akun pribadi. Tanpa ini, reconnect ke
  // akun Google lain dapat memakai folder id milik akun lama dan upload gagal.
  const accountKey = ctx.mode === "personal" ? `${userId}:${ctx.connectionKey ?? "missing"}` : `g:${userId}`;
  const cacheKey = `${ctx.mode}:${accountKey}:${bucket}:${menu}`;
  const cached = folderCache.get(cacheKey);
  if (cached) return cached;

  const task = (async () => {
    let rootId = await getOrCreateFolder(ctx, APP_FOLDER_NAME);
    if (ctx.mode === "global") {
      const label = await userFolderLabel(userId);
      // Migrasi: folder lama bernama userId dipakai ulang bila ada.
      rootId = (await findFolder(ctx, userId, rootId)) ?? (await getOrCreateFolder(ctx, label, rootId));
    }
    const bucketId = await getOrCreateFolder(ctx, bucket, rootId);
    return getOrCreateFolder(ctx, menu, bucketId);
  })();


  folderCache.set(cacheKey, task);
  try {
    return await task;
  } catch (e) {
    folderCache.delete(cacheKey);
    throw e;
  }
}

/** Cari nama file unik di folder: "foto.png" -> "foto (1).png" bila sudah ada. */
async function uniqueFileName(ctx: DriveCtx, parentId: string, name: string): Promise<string> {
  const dot = name.lastIndexOf(".");
  const base = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : "";
  const q = `'${parentId}' in parents and trashed=false and name contains '${base.replace(/'/g, "\\'")}'`;
  const res = await driveFetch(
    ctx,
    `/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(name)&pageSize=200`,
  );
  if (!res.ok) return name;
  const data = (await res.json().catch(() => null)) as { files?: { name: string }[] } | null;
  const taken = new Set((data?.files ?? []).map((f) => f.name));
  if (!taken.has(name)) return name;
  for (let i = 1; i < 1000; i += 1) {
    const candidate = `${base} (${i})${ext}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${base} (${Date.now()})${ext}`;
}


export type UploadedDriveFile = { id: string; name: string; size: number; mimeType: string };

export async function uploadToDrive(
  ctx: DriveCtx,
  userId: string,
  file: { name: string; type: string; bytes: ArrayBuffer },
  source?: string | null,
  origin?: string | null,
): Promise<UploadedDriveFile> {
  const parent = await ensureFolder(ctx, userId, source, origin);
  const finalName = await uniqueFileName(ctx, parent, file.name);

  const boundary = `aacs${Math.random().toString(36).slice(2)}${Date.now()}`;
  const meta = JSON.stringify({ name: finalName, parents: [parent] });
  const mime = file.type || "application/octet-stream";
  const body = new Blob([
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Type: ${mime}\r\n\r\n`,
    file.bytes,
    `\r\n--${boundary}--\r\n`,
  ]);

  const res = await driveFetch(ctx, "/upload/drive/v3/files?uploadType=multipart&fields=id,name,size,mimeType", {
    method: "POST",
    headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
    body,
  });
  if (!res.ok) await readError(res, "Upload ke Google Drive");
  const data = (await res.json()) as { id: string; name?: string; size?: string; mimeType?: string };
  return {
    id: data.id,
    name: data.name ?? file.name,
    size: Number(data.size ?? file.bytes.byteLength) || file.bytes.byteLength,
    mimeType: data.mimeType ?? mime,
  };
}

export async function downloadFromDrive(
  ctx: DriveCtx,
  driveFileId: string,
  range?: string | null,
): Promise<Response> {
  // Teruskan header Range supaya player video hanya menarik potongan yang dibutuhkan.
  const init: RequestInit | undefined = range ? { headers: { Range: range } } : undefined;
  return driveFetch(ctx, `/drive/v3/files/${encodeURIComponent(driveFileId)}?alt=media`, init);
}

/**
 * Buat sesi resumable upload. URL sesi yang dikembalikan Google bisa dipakai
 * langsung oleh browser (PUT) sehingga byte file TIDAK melewati server aplikasi.
 */
export async function createResumableSession(
  ctx: DriveCtx,
  userId: string,
  file: { name: string; type: string; size: number },
  source?: string | null,
  origin?: string | null,
): Promise<{ uploadUrl: string; name: string; parentId: string }> {
  const parent = await ensureFolder(ctx, userId, source, origin);
  const finalName = await uniqueFileName(ctx, parent, file.name);
  const mime = file.type || "application/octet-stream";

  const res = await driveFetch(ctx, "/upload/drive/v3/files?uploadType=resumable&fields=id,name,size,mimeType", {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=UTF-8",
      "X-Upload-Content-Type": mime,
      ...(file.size > 0 ? { "X-Upload-Content-Length": String(file.size) } : {}),
    },
    body: JSON.stringify({ name: finalName, parents: [parent], mimeType: mime }),
  });
  if (!res.ok) await readError(res, "Membuat sesi upload Drive");
  const uploadUrl = res.headers.get("location") || res.headers.get("Location");
  if (!uploadUrl) throw new Error("Google tidak mengembalikan URL sesi upload.");
  return { uploadUrl, name: finalName, parentId: parent };
}

/** Metadata ringan sebuah file Drive (untuk finalize upload langsung). */
export async function driveFileMeta(
  ctx: DriveCtx,
  driveFileId: string,
): Promise<{ id: string; name: string; size: number; mimeType: string } | null> {
  const res = await driveFetch(
    ctx,
    `/drive/v3/files/${encodeURIComponent(driveFileId)}?fields=id,name,size,mimeType,parents`,
  );
  if (!res.ok) return null;
  const data = (await res.json().catch(() => null)) as
    | { id: string; name?: string; size?: string; mimeType?: string }
    | null;
  if (!data?.id) return null;
  return {
    id: data.id,
    name: data.name ?? "file",
    size: Number(data.size ?? 0) || 0,
    mimeType: data.mimeType ?? "application/octet-stream",
  };
}

/**
 * Pastikan file punya izin "anyone with link (reader)" supaya browser bisa
 * mengambilnya langsung dari Google tanpa lewat server aplikasi.
 * Idempoten; error duplikat diabaikan.
 */
export async function ensureAnyoneWithLink(ctx: DriveCtx, driveFileId: string): Promise<boolean> {
  try {
    const res = await driveFetch(
      ctx,
      `/drive/v3/files/${encodeURIComponent(driveFileId)}/permissions?fields=id`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: "reader", type: "anyone", allowFileDiscovery: false }),
      },
    );
    return res.ok || res.status === 400 || res.status === 409;
  } catch {
    return false;
  }
}

export async function deleteFromDrive(ctx: DriveCtx, driveFileId: string): Promise<void> {
  const res = await driveFetch(ctx, `/drive/v3/files/${encodeURIComponent(driveFileId)}`, { method: "DELETE" });
  if (!res.ok && res.status !== 404) await readError(res, "Hapus file Drive");
}

export async function fetchDriveAccountEmail(connectionKey: string): Promise<string | null> {
  try {
    const res = await driveFetch(
      { mode: "personal", connectionKey },
      "/drive/v3/about?fields=user(emailAddress)",
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { user?: { emailAddress?: string } };
    return data.user?.emailAddress ?? null;
  } catch {
    return null;
  }
}
export type DriveAbout = {
  email: string | null;
  limit: number | null;
  usage: number | null;
  usageInDrive: number | null;
};

/** Info akun + kuota Drive, plus alasan kalau gagal (buat ditampilkan di UI). */
export async function driveAboutResult(
  ctx: DriveCtx,
): Promise<{ about: DriveAbout | null; error: string | null }> {
  try {
    const res = await driveFetch(ctx, "/drive/v3/about?fields=user(emailAddress),storageQuota");
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      const msg = `Google Drive menolak permintaan info akun [${res.status}] ${body.slice(0, 200)}`;
      console.error("[cloud] driveAbout failed", msg);
      return { about: null, error: msg };
    }
    const data = (await res.json()) as {
      user?: { emailAddress?: string };
      storageQuota?: { limit?: string; usage?: string; usageInDrive?: string };
    };
    const num = (v?: string) => (v == null ? null : Number(v));
    return {
      about: {
        email: data.user?.emailAddress ?? null,
        limit: num(data.storageQuota?.limit),
        usage: num(data.storageQuota?.usage),
        usageInDrive: num(data.storageQuota?.usageInDrive),
      },
      error: null,
    };
  } catch (e) {
    const msg = (e as Error).message || "Gagal membaca info Google Drive.";
    console.error("[cloud] driveAbout threw", msg);
    return { about: null, error: msg };
  }
}

/** Info akun + kuota Drive (dipakai untuk label & deteksi penuh). */
export async function driveAbout(ctx: DriveCtx): Promise<DriveAbout | null> {
  return (await driveAboutResult(ctx)).about;
}


/** True kalau Drive pribadi sudah (hampir) penuh sehingga upload pasti gagal. */
export async function driveIsFull(ctx: DriveCtx, incomingBytes = 0): Promise<boolean> {
  const about = await driveAbout(ctx);
  if (!about || about.limit == null || about.usage == null) return false;
  return about.usage + incomingBytes >= about.limit;
}
