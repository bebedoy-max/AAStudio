// Dola (www.dola.com) provider — video generation lewat sesi web Dola.
//
// Auth = cookie session dola.com (string cookie penuh: sessionid, sid_guard,
// msToken, ttwid, dst). Cookie di-capture otomatis oleh extension AA Creative
// atau di-paste manual di Token Manager → Dola. Semua request diteruskan
// server proxy `/api/public/dola` karena browser tidak boleh mengirim cookie
// lintas-origin ke dola.com.

import { pushTokenAsync } from "@/lib/tokens/sync";

export const LS_DOLA_KEYS = "aatools.dola.keys";

export type DolaKey = {
  id: string;
  key: string;
  balance: number | null;
  status: "active" | "empty" | "pending" | "failed";
  note?: string;
};

/* --------------------------------- storage -------------------------------- */

export function getAllDolaCookies(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(LS_DOLA_KEYS);
    if (!raw) return [];
    const list = JSON.parse(raw) as DolaKey[];
    return list.map((x) => x?.key).filter((k): k is string => !!k);
  } catch {
    return [];
  }
}

export function getFirstDolaCookie(): string | null {
  return getAllDolaCookies()[0] || null;
}

export function removeDolaKeyFromManager(cookie: string, reason?: string): { removed: boolean; remaining: number } {
  if (typeof window === "undefined") return { removed: false, remaining: 0 };
  try {
    const raw = localStorage.getItem(LS_DOLA_KEYS);
    const list = raw ? (JSON.parse(raw) as DolaKey[]) : [];
    const next = list.filter((x) => x?.key !== cookie);
    if (next.length === list.length) return { removed: false, remaining: next.length };
    const value = JSON.stringify(next);
    localStorage.setItem(LS_DOLA_KEYS, value);
    pushTokenAsync(LS_DOLA_KEYS, value);
    window.dispatchEvent(
      new CustomEvent("aatools:tokens-synced", { detail: { provider: "dola", action: "removed", reason } }),
    );
    window.dispatchEvent(new Event("storage"));
    return { removed: true, remaining: next.length };
  } catch {
    return { removed: false, remaining: getAllDolaCookies().length };
  }
}

/* ---------------------------------- api ----------------------------------- */

type ProxyResult = {
  ok: boolean;
  status?: number;
  error?: string;
  conversationId?: string;
  videos?: string[];
  images?: string[];
  uri?: string;
  raw?: string;
};

async function call(cookie: string, body: Record<string, unknown>): Promise<ProxyResult> {
  const res = await fetch("/api/public/dola", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Dola-Cookie": cookie },
    body: JSON.stringify(body),
  });
  return (await res.json()) as ProxyResult;
}

/** Cek cookie masih login (dipakai Token Manager & preflight sebelum generate). */
export async function checkDolaCookie(cookie: string): Promise<boolean> {
  try {
    const r = await call(cookie, { action: "ping" });
    return !!r.ok;
  } catch {
    return false;
  }
}

export async function uploadDolaImage(cookie: string, file: File | Blob): Promise<string> {
  const base64 = await new Promise<string>((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result).split(",")[1] ?? "");
    fr.onerror = () => reject(new Error("gagal membaca file"));
    fr.readAsDataURL(file);
  });
  const type = (file as File).type || "image/png";
  const ext = type.includes("jpeg") || type.includes("jpg") ? ".jpeg" : type.includes("webp") ? ".webp" : ".png";
  const r = await call(cookie, { action: "upload-image", base64, ext });
  if (!r.ok || !r.uri) throw new Error(r.error || "upload gambar ke Dola gagal");
  return r.uri;
}

export type DolaVideoOpts = {
  prompt: string;
  /** Nilai katalog `dola:<model>` atau nama model langsung (mis. seedance_v2.0). */
  modelKey?: string;
  ratio?: string;
  duration?: number;
  resolution?: string;
  sound?: "on" | "off";
  /** ImageX uri hasil `uploadDolaImage` — untuk jalur image-to-video. */
  imageUri?: string;
  onLog?: (msg: string) => void;
};

/** Skill video Dola dipilih lewat chat_ability, jadi teksnya cukup singkat —
 *  persis seperti web Dola: "Generated video: <prompt>, <ratio>". */
function buildPrompt(o: DolaVideoOpts): string {
  return `Generated video: ${o.prompt}, ${o.ratio ?? "9:16"}`;
}

function modelName(modelKey?: string): string {
  const raw = (modelKey || "").replace(/^dola:/, "").trim();
  return raw || "seedance_v2.0";
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Jalankan generate video di Dola dengan satu cookie. Mengembalikan URL mp4. */
export async function runDolaVideo(cookie: string, opts: DolaVideoOpts): Promise<string> {
  const log = opts.onLog ?? (() => {});
  log("Dola: mengirim prompt…");
  const res = await call(cookie, {
    action: "completion",
    prompt: buildPrompt(opts),
    model: modelName(opts.modelKey),
    ratio: opts.ratio || "9:16",
    duration: opts.duration || 5,
    imageUri: opts.imageUri || "",
  });
  if (!res.ok) throw new Error(res.error || "Dola menolak request (cookie mungkin sudah expired)");
  if (res.videos?.length) return res.videos[0]!;

  const conversationId = res.conversationId;
  if (!conversationId || conversationId === "0") {
    throw new Error("Dola tidak mengembalikan video maupun conversation id");
  }

  // Render video Dola berlanjut setelah stream ditutup → polling chain pesan.
  for (let i = 0; i < 60; i++) {
    await sleep(5000);
    log(`Dola: menunggu render… (${(i + 1) * 5}s)`);
    const p = await call(cookie, { action: "poll", conversationId });
    if (p.videos?.length) return p.videos[0]!;
  }
  throw new Error("Timeout menunggu video Dola (5 menit)");
}

/** Auto-rotate: coba semua cookie Dola tersimpan, buang yang sudah invalid. */
export async function runDolaWithRotation(opts: DolaVideoOpts): Promise<string> {
  const cookies = getAllDolaCookies();
  if (cookies.length === 0) {
    throw new Error("Belum ada cookie Dola. Tambahkan di Token Manager → Dola atau ambil via extension.");
  }
  let lastError: Error | null = null;
  for (const cookie of cookies) {
    try {
      return await runDolaVideo(cookie, opts);
    } catch (e) {
      const err = e as Error;
      lastError = err;
      if (/expired|unauthorized|not\s*login|401|cookie/i.test(err.message)) {
        removeDolaKeyFromManager(cookie, err.message);
        opts.onLog?.("Cookie Dola invalid — dihapus, lanjut ke cookie berikutnya.");
        continue;
      }
      throw err;
    }
  }
  throw lastError ?? new Error("Semua cookie Dola gagal");
}
