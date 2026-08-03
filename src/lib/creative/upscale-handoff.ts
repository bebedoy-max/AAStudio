// Handoff gambar terpilih dari menu lain (mis. Bulk Fashion) ke menu Upscaler.
// Payload disimpan di sessionStorage, dikonsumsi sekali saat halaman Upscaler mount.

const KEY = "upscaler:handoff";

export type UpscaleHandoffItem = { url: string; name?: string };

export function setUpscaleHandoff(items: UpscaleHandoffItem[]) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(items));
  } catch {
    /* ignore */
  }
}

export function consumeUpscaleHandoff(): UpscaleHandoffItem[] {
  try {
    const raw = sessionStorage.getItem(KEY);
    sessionStorage.removeItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((i) => i && typeof i.url === "string");
  } catch {
    return [];
  }
}

/** Unduh URL menjadi File agar bisa dimasukkan ke antrean Upscaler. */
export async function urlToFile(url: string, name?: string): Promise<File | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    const ext = (blob.type.split("/")[1] || "jpg").replace("jpeg", "jpg");
    const fileName =
      name || `upscale-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`;
    return new File([blob], fileName, { type: blob.type || "image/jpeg" });
  } catch {
    return null;
  }
}
