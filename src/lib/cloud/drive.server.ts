// Server-only Google Drive access.
//  - mode "global"   : Drive milik admin aplikasi (App connector, gateway + GOOGLE_DRIVE_API_KEY)
//  - mode "personal" : Drive milik user (App User Connector, connection key per user)
import { callAsAppUser } from "@/integrations/lovable/appUserConnector";
import { DRIVE_CONNECTOR_ID, type StorageMode } from "./connections.server";

export const GATEWAY_BASE_URL = "https://connector-gateway.lovable.dev";
export const APP_FOLDER_NAME = "AA Creative Studio";

export type DriveCtx = { mode: StorageMode; connectionKey?: string | null };

async function driveFetch(ctx: DriveCtx, path: string, init?: RequestInit): Promise<Response> {
  if (ctx.mode === "personal") {
    if (!ctx.connectionKey) throw new Error("Google Drive pribadi belum terhubung.");
    return callAsAppUser({
      gatewayBaseUrl: GATEWAY_BASE_URL,
      connectionAPIKey: ctx.connectionKey,
      connectorId: DRIVE_CONNECTOR_ID,
      path,
      init,
    });
  }
  const lovableKey = process.env.LOVABLE_API_KEY;
  const driveKey = process.env.GOOGLE_DRIVE_API_KEY;
  if (!lovableKey || !driveKey) {
    throw new Error("Global cloud belum dikonfigurasi (LOVABLE_API_KEY / GOOGLE_DRIVE_API_KEY).");
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
  const res = await driveFetch(ctx, `/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name)&pageSize=1`);
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

const folderCache = new Map<string, string>();

/** Folder tujuan: "AA Creative Studio" (personal) atau "AA Creative Studio/<userId>" (global). */
export async function ensureFolder(ctx: DriveCtx, userId: string): Promise<string> {
  const cacheKey = `${ctx.mode}:${ctx.mode === "personal" ? userId : `g:${userId}`}`;
  const cached = folderCache.get(cacheKey);
  if (cached) return cached;

  let rootId = (await findFolder(ctx, APP_FOLDER_NAME)) ?? (await createFolder(ctx, APP_FOLDER_NAME));
  if (ctx.mode === "global") {
    rootId = (await findFolder(ctx, userId, rootId)) ?? (await createFolder(ctx, userId, rootId));
  }
  folderCache.set(cacheKey, rootId);
  return rootId;
}

export type UploadedDriveFile = { id: string; name: string; size: number; mimeType: string };

export async function uploadToDrive(
  ctx: DriveCtx,
  userId: string,
  file: { name: string; type: string; bytes: ArrayBuffer },
): Promise<UploadedDriveFile> {
  const parent = await ensureFolder(ctx, userId);
  const boundary = `aacs${Math.random().toString(36).slice(2)}${Date.now()}`;
  const meta = JSON.stringify({ name: file.name, parents: [parent] });
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

export async function downloadFromDrive(ctx: DriveCtx, driveFileId: string): Promise<Response> {
  return driveFetch(ctx, `/drive/v3/files/${encodeURIComponent(driveFileId)}?alt=media`);
}

export async function deleteFromDrive(ctx: DriveCtx, driveFileId: string): Promise<void> {
  const res = await driveFetch(ctx, `/drive/v3/files/${encodeURIComponent(driveFileId)}`, { method: "DELETE" });
  if (!res.ok && res.status !== 404) await readError(res, "Hapus file Drive");
}

export async function fetchDriveAccountEmail(connectionKey: string): Promise<string | null> {
  try {
    const res = await callAsAppUser({
      gatewayBaseUrl: GATEWAY_BASE_URL,
      connectionAPIKey: connectionKey,
      connectorId: DRIVE_CONNECTOR_ID,
      path: "/drive/v3/about?fields=user(emailAddress)",
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { user?: { emailAddress?: string } };
    return data.user?.emailAddress ?? null;
  } catch {
    return null;
  }
}