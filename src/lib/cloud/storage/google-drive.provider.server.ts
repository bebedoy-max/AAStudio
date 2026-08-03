// Implementasi StorageProvider untuk Google Drive (global admin / personal user).
import {
  createResumableSession,
  deleteFromDrive,
  downloadFromDrive,
  driveFileMeta,
  ensureAnyoneWithLink,
  uploadToDrive,
  type DriveCtx,
} from "../drive.server";
import type { DirectUploadTicket, PreviewLinks, StorageProvider, StoredObject } from "./types";

/** Cache hasil verifikasi link publik (per proses) supaya tidak HEAD berulang. */
const linkCache = new Map<string, PreviewLinks>();

function candidateLinks(objectId: string, mimeType: string): PreviewLinks {
  const isImage = mimeType.startsWith("image/");
  return {
    directUrl: isImage
      ? `https://lh3.googleusercontent.com/d/${objectId}`
      : `https://drive.usercontent.google.com/download?id=${objectId}&export=download`,
    thumbnailUrl: `https://lh3.googleusercontent.com/d/${objectId}=w512`,
  };
}

async function urlIsReachable(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, {
      method: "HEAD",
      redirect: "follow",
      signal: AbortSignal.timeout(6000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export const googleDriveProvider: StorageProvider<DriveCtx> = {
  id: "google_drive",

  async createDirectUpload(ctx, userId, file, opts) {
    const session = await createResumableSession(ctx, userId, file, opts?.source, opts?.origin);
    const ticket: DirectUploadTicket = {
      uploadUrl: session.uploadUrl,
      method: "PUT",
      name: session.name,
      headers: { "Content-Type": file.type || "application/octet-stream" },
    };
    return ticket;
  },

  async putObject(ctx, userId, file, opts) {
    const up = await uploadToDrive(ctx, userId, file, opts?.source, opts?.origin);
    return up as StoredObject;
  },

  async headObject(ctx, objectId) {
    return driveFileMeta(ctx, objectId);
  },

  async getDirectLinks(ctx, objectId, mimeType) {
    const cached = linkCache.get(objectId);
    if (cached) return cached;

    const empty: PreviewLinks = { directUrl: null, thumbnailUrl: null };
    const granted = await ensureAnyoneWithLink(ctx, objectId);
    if (!granted) {
      linkCache.set(objectId, empty);
      return empty;
    }
    const candidate = candidateLinks(objectId, mimeType);
    const ok = candidate.directUrl ? await urlIsReachable(candidate.directUrl) : false;
    const result = ok ? candidate : empty;
    linkCache.set(objectId, result);
    return result;
  },

  async getObjectStream(ctx, objectId) {
    return downloadFromDrive(ctx, objectId);
  },

  async deleteObject(ctx, objectId) {
    await deleteFromDrive(ctx, objectId);
  },
};
