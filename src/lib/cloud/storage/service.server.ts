// Service layer: business logic memakai StorageProvider, bukan API Drive langsung.
import type { DriveCtx } from "../drive.server";
import { resolveUploadCtx } from "../registry.server";
import { googleDriveProvider } from "./google-drive.provider.server";
import { logTransfer } from "./log.server";
import type { DirectUploadTicket, PreviewLinks } from "./types";

export const provider = googleDriveProvider;

export async function ctxForUser(userId: string, incomingBytes = 0): Promise<{ ctx: DriveCtx; mode: "global" | "personal" }> {
  const { ctx, mode } = await resolveUploadCtx(userId, incomingBytes);
  return { ctx, mode };
}


/** UploadService — hanya membuat tiket; byte dikirim browser langsung ke storage. */
export const UploadService = {
  async createTicket(params: {
    userId: string;
    name: string;
    mimeType: string;
    size: number;
    source?: string | null;
    origin?: string | null;
  }): Promise<DirectUploadTicket & { mode: "global" | "personal" }> {
    const { ctx, mode } = await ctxForUser(params.userId, params.size);
    const ticket = await provider.createDirectUpload(
      ctx,
      params.userId,
      { name: params.name, type: params.mimeType, size: params.size },
      { source: params.source ?? null, origin: params.origin ?? "upload" },
    );
    logTransfer("upload.direct", { userId: params.userId, size: params.size, mode });
    return { ...ticket, mode };
  },

  async head(userId: string, objectId: string) {
    const { ctx } = await ctxForUser(userId);
    return provider.headObject(ctx, objectId);
  },
};

/** DownloadService/PreviewService — utamakan link langsung ke storage. */
export const DownloadService = {
  async directLinks(ctx: DriveCtx, objectId: string, mimeType: string): Promise<PreviewLinks> {
    return provider.getDirectLinks(ctx, objectId, mimeType);
  },
  async stream(ctx: DriveCtx, objectId: string) {
    logTransfer("download.streamed", { objectId });
    return provider.getObjectStream(ctx, objectId);
  },
};

export const PreviewService = DownloadService;