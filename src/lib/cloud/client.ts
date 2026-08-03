// Helper client-side: simpan setiap upload & hasil generate ke cloud (Google Drive).
// Semua kegagalan bersifat non-fatal — alur generate existing tidak boleh terganggu.
import { supabase } from "@/integrations/supabase/client";
import {
  archiveGeneratedUrl,
  createCloudUploadTicket,
  finalizeCloudUpload,
} from "./cloud.functions";

export type CloudMeta = { origin?: "upload" | "generate"; source?: string; name?: string };

export type CloudUploadResult = { id: string; url: string; storage: "global" | "personal" };

export async function uploadFileToCloud(
  file: File,
  meta: CloudMeta = {},
): Promise<CloudUploadResult> {
  // Jalur utama: browser -> Google Drive langsung (server hanya beri tiket + simpan metadata).
  try {
    return await directUploadToCloud(file, meta);
  } catch (e) {
    console.warn("[cloud] direct upload gagal, fallback lewat server", e);
  }
  return legacyUploadThroughServer(file, meta);
}

/** Upload langsung ke storage memakai resumable session URL. */
async function directUploadToCloud(file: File, meta: CloudMeta): Promise<CloudUploadResult> {
  const name = meta.name || file.name || "upload.bin";
  const mimeType = file.type || "application/octet-stream";
  const ticket = await createCloudUploadTicket({
    data: {
      name,
      mimeType,
      size: file.size,
      source: meta.source ?? null,
      origin: meta.origin ?? "upload",
    },
  });

  const put = await fetch(ticket.uploadUrl, {
    method: ticket.method,
    headers: ticket.headers,
    body: file,
  });
  if (!put.ok) throw new Error(`Upload langsung ke storage gagal (${put.status})`);
  const uploaded = (await put.json().catch(() => ({}))) as {
    id?: string;
    name?: string;
    size?: string;
    mimeType?: string;
  };
  if (!uploaded.id) throw new Error("Storage tidak mengembalikan id file");

  const row = await finalizeCloudUpload({
    data: {
      driveFileId: uploaded.id,
      name: uploaded.name || ticket.name,
      mimeType: uploaded.mimeType || mimeType,
      size: Number(uploaded.size ?? file.size) || file.size,
      source: meta.source ?? null,
      origin: meta.origin ?? "upload",
    },
  });
  return { id: row.id, url: row.url, storage: row.storage as "global" | "personal" };
}

/** Fallback lama: lewat server (dipakai hanya bila direct upload tidak tersedia). */
async function legacyUploadThroughServer(
  file: File,
  meta: CloudMeta = {},
): Promise<CloudUploadResult> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Sesi login tidak ditemukan.");

  const fd = new FormData();
  fd.append("file", file, meta.name || file.name || "upload.bin");
  fd.append("origin", meta.origin ?? "upload");
  if (meta.source) fd.append("source", meta.source);

  const res = await fetch("/api/public/cloud/upload", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: fd,
  });
  const json = (await res.json().catch(() => ({}))) as Partial<CloudUploadResult> & {
    error?: string;
  };
  if (!res.ok || !json.url || !json.id)
    throw new Error(json.error || `Cloud upload gagal (${res.status})`);
  return { id: json.id, url: json.url, storage: json.storage ?? "global" };
}

const archived = new Set<string>();

/** Fire-and-forget: arsipkan file yang di-upload user ke cloud. */
export function archiveUploadInBackground(file: File, meta: CloudMeta = {}): void {
  void uploadFileToCloud(file, { ...meta, origin: "upload" }).catch((e) =>
    console.warn("[cloud] archive upload failed", e),
  );
}

/** Fire-and-forget: arsipkan hasil generate (URL provider) ke cloud. */
export function archiveUrlInBackground(url: string, meta: CloudMeta = {}): void {
  if (!url || !/^https?:\/\//i.test(url) || archived.has(url)) return;
  archived.add(url);
  void archiveGeneratedUrl({
    data: { url, name: meta.name, source: meta.source, origin: meta.origin ?? "generate" },
  }).catch((e) => {
    archived.delete(url);
    console.warn("[cloud] archive result failed", e);
  });
}

/** Versi list. */
export function archiveUrlsInBackground(
  urls: (string | null | undefined)[],
  meta: CloudMeta = {},
): void {
  for (const u of urls) if (u) archiveUrlInBackground(u, meta);
}
