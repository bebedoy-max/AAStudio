// Helper client-side: simpan setiap upload & hasil generate ke cloud (Google Drive).
// Semua kegagalan bersifat non-fatal — alur generate existing tidak boleh terganggu.
import { supabase } from "@/integrations/supabase/client";
import { archiveGeneratedUrl } from "./cloud.functions";

export type CloudMeta = { origin?: "upload" | "generate"; source?: string; name?: string };

export type CloudUploadResult = { id: string; url: string; storage: "global" | "personal" };

export async function uploadFileToCloud(file: File, meta: CloudMeta = {}): Promise<CloudUploadResult> {
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
  const json = (await res.json().catch(() => ({}))) as Partial<CloudUploadResult> & { error?: string };
  if (!res.ok || !json.url || !json.id) throw new Error(json.error || `Cloud upload gagal (${res.status})`);
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
export function archiveUrlsInBackground(urls: (string | null | undefined)[], meta: CloudMeta = {}): void {
  for (const u of urls) if (u) archiveUrlInBackground(u, meta);
}