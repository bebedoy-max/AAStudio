// Abstraction layer storage — memisahkan business logic dari provider (Drive/R2/S3/Supabase).
export type StorageMode = "global" | "personal";

export type StoredObject = {
  id: string;
  name: string;
  size: number;
  mimeType: string;
};

export type DirectUploadTicket = {
  /** URL yang dipakai browser untuk mengirim byte langsung ke storage. */
  uploadUrl: string;
  /** Metode HTTP yang harus dipakai browser. */
  method: "PUT" | "POST";
  name: string;
  headers?: Record<string, string>;
};

export type PreviewLinks = {
  /** URL publik/bertanda-tangan yang bisa dibuka browser langsung. */
  directUrl: string | null;
  /** URL thumbnail (kalau provider menyediakan). */
  thumbnailUrl: string | null;
};

/** Kontrak minimum sebuah provider storage. */
export interface StorageProvider<Ctx = unknown> {
  readonly id: string;
  /** Sesi upload langsung client -> storage (tanpa melewati server aplikasi). */
  createDirectUpload(
    ctx: Ctx,
    userId: string,
    file: { name: string; type: string; size: number },
    opts?: { source?: string | null; origin?: string | null },
  ): Promise<DirectUploadTicket>;
  /** Upload dari server (fallback / arsip hasil AI). */
  putObject(
    ctx: Ctx,
    userId: string,
    file: { name: string; type: string; bytes: ArrayBuffer },
    opts?: { source?: string | null; origin?: string | null },
  ): Promise<StoredObject>;
  /** Ambil metadata objek. */
  headObject(ctx: Ctx, objectId: string): Promise<StoredObject | null>;
  /** Link akses langsung untuk preview/download. */
  getDirectLinks(ctx: Ctx, objectId: string, mimeType: string): Promise<PreviewLinks>;
  /** Fallback: stream byte lewat server (dipakai hanya bila direct link gagal). */
  getObjectStream(ctx: Ctx, objectId: string, range?: string | null): Promise<Response>;
  deleteObject(ctx: Ctx, objectId: string): Promise<void>;
}