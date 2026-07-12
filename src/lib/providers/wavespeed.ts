// Wavespeed provider client — mirrors legacy aamotion.html behavior.

export const WAVESPEED_API = "https://api.wavespeed.ai/api/v3";
export const LS_WAVESPEED_KEYS = "aatools.wavespeed.keys";

export async function checkWavespeedBalance(apiKey: string): Promise<{ ok: boolean; balance: number | null }> {
  try {
    const r = await fetch(`${WAVESPEED_API}/balance`, { headers: { Authorization: `Bearer ${apiKey}` } });
    const j = await r.json();
    const ok = r.ok && (j.code === 200 || j.code === undefined);
    const balance = ok ? Number(j?.data?.balance ?? j?.balance ?? 0) : null;
    return { ok, balance };
  } catch {
    return { ok: false, balance: null };
  }
}

export function getAllWavespeedKeys(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(LS_WAVESPEED_KEYS);
    if (!raw) return [];
    const list = JSON.parse(raw) as { key: string }[];
    return list.map((x) => x?.key).filter((k): k is string => !!k);
  } catch {
    return [];
  }
}

export function getFirstWavespeedKey(): string | null {
  return getAllWavespeedKeys()[0] || null;
}

/** Detect if an error message looks like a credit / quota / auth failure that rotating keys can fix. */
export function isWavespeedRotatableError(msg: string): boolean {
  return /insufficient|credits?|quota|balance|402|401|403|not enough|cukup|unauthori[sz]ed|payment/i.test(msg);
}

/** Upload arbitrary media, returns public URL usable as image/video input. */
export async function wsUploadMedia(fileOrBlob: File | Blob, filename: string, apiKey: string): Promise<string> {
  const form = new FormData();
  form.append("file", fileOrBlob, filename);
  const r = await fetch(`${WAVESPEED_API}/media/upload/binary`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });
  const j = (await r.json().catch(() => ({}))) as {
    code?: number;
    message?: string;
    error?: string;
    data?: { download_url?: string; url?: string };
  };
  if (!r.ok || (j.code && j.code !== 200)) throw new Error("Wavespeed upload: " + (j.message || j.error || r.status));
  const url = j.data?.download_url || j.data?.url;
  if (!url) throw new Error("Wavespeed upload: no URL returned");
  return url;
}

export async function wsPost<T = unknown>(
  modelId: string,
  payload: Record<string, unknown>,
  apiKey: string,
): Promise<T & { id?: string; urls?: { get?: string } }> {
  const r = await fetch(`${WAVESPEED_API}/${modelId}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const j = (await r.json().catch(() => ({}))) as {
    code?: number;
    message?: string;
    error?: string;
    data?: T & { id?: string; urls?: { get?: string } };
  };
  if (!r.ok || (j.code && j.code !== 200)) throw new Error("Wavespeed: " + (j.message || j.error || r.status));
  return j.data as T & { id?: string; urls?: { get?: string } };
}

export async function wsPoll(
  getUrl: string,
  apiKey: string,
  opts: { timeoutMs?: number; onProgress?: (pct: number) => void } = {},
): Promise<string> {
  const start = Date.now();
  const tm = opts.timeoutMs ?? 600000;
  while (Date.now() - start < tm) {
    await new Promise((r) => setTimeout(r, 3500));
    opts.onProgress?.(Math.min(94, 30 + Math.round(((Date.now() - start) / tm) * 64)));
    const r = await fetch(getUrl, { headers: { Authorization: `Bearer ${apiKey}` } });
    const j = (await r.json().catch(() => ({}))) as {
      data?: { status?: string; outputs?: string[]; output?: string; video?: string; video_url?: string; url?: string; result?: string; error?: string; message?: string };
    };
    const d = j.data || {};
    const st = String(d.status || "").toLowerCase();
    if (["completed", "succeeded", "success", "done", "finished"].includes(st)) {
      const out = (Array.isArray(d.outputs) && d.outputs[0]) || d.output || d.video || d.video_url || d.url || d.result;
      if (out) return out;
      throw new Error("Wavespeed: completed but no output");
    }
    if (["failed", "error", "canceled", "cancelled"].includes(st)) {
      throw new Error("Wavespeed failed: " + (d.error || d.message || "unknown"));
    }
  }
  throw new Error("Wavespeed timeout");
}

export async function wsMotionControl(opts: {
  modelKey: string;
  imageUrl: string;
  videoUrl: string;
  orientation: "image" | "video";
  keepSound: boolean;
  prompt?: string;
  apiKey: string;
  onProgress?: (pct: number) => void;
}): Promise<string> {
  const modelId = opts.modelKey.replace(/^ws:/, "");
  const payload: Record<string, unknown> = {
    image: opts.imageUrl,
    video: opts.videoUrl,
    character_orientation: opts.orientation || "image",
    keep_original_sound: !!opts.keepSound,
  };
  if (opts.prompt) payload.prompt = opts.prompt;
  const data = await wsPost(modelId, payload, opts.apiKey);
  const getUrl = data.urls?.get || `${WAVESPEED_API}/predictions/${data.id}/result`;
  return wsPoll(getUrl, opts.apiKey, { timeoutMs: 600000, onProgress: opts.onProgress });
}
