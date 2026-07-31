import { archiveUploadInBackground } from "@/lib/cloud/client";
// High-level orchestrator for Motion Control generation.
// Handles provider dispatch (weavy / wavespeed) + auto-rotate on Weavy credit failure.

import {
  compressImage,
  createWeavyRecipe,
  saveWeavyRecipe,
  approveWeavyModel,
  executeWeavyBatch,
  pollWeavyBatchVideo,
  uploadWeavyAssetWithRetry,
  resolveWeavyAssetUrl,
  getActiveWeavyAccessToken,
  rotateWeavyToken,
} from "./weavy";
import { buildKlingMotionControlRecipe } from "./weavy-recipes";
import { getFirstWavespeedKey, wsUploadMedia, wsMotionControl } from "./wavespeed";
import { runMagnificMotion } from "./magnific-motion";
import {
  getAllRoboneoKeys,
  removeRoboneoKeyFromManager,
  submitRoboneoMotion,
  pollRoboneoTask,
  isRoboneoRotatableError,
} from "./roboneo";
import { notifyGenerationDone } from "@/lib/tokens/refresh";

function getFirstMagnificKey(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem("aatools.magnific.keys");
    if (!raw) return null;
    const list = JSON.parse(raw) as { key: string }[];
    return list?.[0]?.key || null;
  } catch {
    return null;
  }
}

async function generateOneMagnific(slot: MotionSlotInput, opts: MotionOpts): Promise<string> {
  const key = getFirstMagnificKey();
  if (!key) throw new Error("Belum ada Magnific API key");
  const log = (m: string) => opts.onLog?.(`#${slot.index + 1} [MAG] ${m}`);
  opts.onStatus?.({ index: slot.index, status: "uploading..." });
  return runMagnificMotion({
    modelKey: opts.modelKey,
    apiKey: key,
    imageFile: slot.image,
    videoFile: slot.video,
    orientation: opts.orientation,
    prompt: opts.prompt,
    onProgress: (m) => {
      log(m);
      opts.onStatus?.({ index: slot.index, status: m });
    },
  });
}

export type MotionProvider = "weavy" | "wavespeed" | "magnific" | "roboneo" | "framia";

export type MotionSlotInput = {
  index: number;
  image: File;
  video: File;
};

export type MotionOpts = {
  provider: MotionProvider;
  modelKey: string;
  orientation: "image" | "video";
  keepSound: boolean;
  prompt?: string;
  onLog?: (msg: string, level?: "info" | "warn" | "error" | "success") => void;
  onStatus?: (info: { index: number; status: string; url?: string; error?: string }) => void;
};

async function maybeCompress(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) return file;
  if (file.size > 8 * 1024 * 1024) return compressImage(file, 1280, 0.7);
  if (file.size > 4 * 1024 * 1024) return compressImage(file, 1280, 0.85);
  return file;
}

async function generateOneWeavy(slot: MotionSlotInput, opts: MotionOpts): Promise<string> {
  const { index } = slot;
  const log = (m: string, l?: "info" | "warn" | "error" | "success") => opts.onLog?.(`#${index + 1} ${m}`, l);

  let tokenInfo = await getActiveWeavyAccessToken();
  if (!tokenInfo) throw new Error("Belum ada Weavy token / semua token gagal refresh.");
  let at = tokenInfo.accessToken;

  opts.onStatus?.({ index, status: "uploading img..." });
  log("Upload image...");
  const imgBlob = await maybeCompress(slot.image);
  const imgUp = await uploadWeavyAssetWithRetry(imgBlob, `ref_img_${index}_${Date.now()}.jpg`, at);
  const imageUrl = resolveWeavyAssetUrl(imgUp, "image");
  log(`Image uploaded: ${imageUrl.substring(0, 60)}...`);

  opts.onStatus?.({ index, status: "uploading vid..." });
  log("Upload video...");
  const vidUp = await uploadWeavyAssetWithRetry(slot.video, `ref_vid_${index}_${Date.now()}.mp4`, at);
  const videoUrl = resolveWeavyAssetUrl(vidUp, "video");
  log(`Video uploaded: ${videoUrl.substring(0, 60)}...`);

  const { nodes, edges, modelId } = buildKlingMotionControlRecipe({
    imageUrl,
    videoUrl,
    orientation: opts.orientation,
    keepSound: opts.keepSound,
    modelKey: opts.modelKey,
    prompt: opts.prompt,
  });

  // Try with current token, rotate on credit failure.
  let attempt = 0;
  while (attempt < 8) {
    attempt++;
    try {
      opts.onStatus?.({ index, status: "processing" });
      log(`Generating recipe (attempt ${attempt})...`);
      const recipe = await createWeavyRecipe(at);
      await saveWeavyRecipe(recipe.id, { nodes, edges, v3: recipe.v3 }, at);
      await approveWeavyModel(modelId!, at);
      const { batchId } = await executeWeavyBatch(recipe.id, nodes, edges, at);
      log(`Recipe: ${recipe.id} Batch: ${batchId}`);
      const url = await pollWeavyBatchVideo(recipe.id, batchId, at, {
        inputVideoUrl: videoUrl,
        onProgress: ({ attempt: pa, status }) => opts.onStatus?.({ index, status: `poll ${pa} · ${status}` }),
      });
      if (!url) throw new Error("Weavy: no output URL after polling");
      return url;
    } catch (e) {
      const msg = (e as Error).message || String(e);
      log(`Attempt ${attempt} failed: ${msg}`, "warn");
      // credit / auth failures → rotate token
      const rotate = /credit|balance|402|403|unauth/i.test(msg);
      if (!rotate) throw e;
      const next = await rotateWeavyToken(tokenInfo.id);
      if (!next) throw new Error("Semua Weavy token exhausted");
      tokenInfo = next;
      at = next.accessToken;
      log("Rotated to next token, retrying...", "info");
    }
  }
  throw new Error("Weavy: max attempts exhausted");
}

async function generateOneWavespeed(slot: MotionSlotInput, opts: MotionOpts): Promise<string> {
  const { index } = slot;
  const log = (m: string, l?: "info" | "warn" | "error" | "success") => opts.onLog?.(`#${index + 1} [WS] ${m}`, l);
  const key = getFirstWavespeedKey();
  if (!key) throw new Error("Belum ada Wavespeed API key.");

  opts.onStatus?.({ index, status: "uploading img..." });
  log("Upload image...");
  const imgBlob = await maybeCompress(slot.image);
  const imageUrl = await wsUploadMedia(imgBlob, `ref_img_${index}_${Date.now()}.jpg`, key);
  log(`Image: ${imageUrl.substring(0, 60)}...`);

  opts.onStatus?.({ index, status: "uploading vid..." });
  log("Upload video...");
  const videoUrl = await wsUploadMedia(slot.video, `ref_vid_${index}_${Date.now()}.mp4`, key);
  log(`Video: ${videoUrl.substring(0, 60)}...`);

  opts.onStatus?.({ index, status: "processing" });
  log(`Submitting motion-control (${opts.modelKey})...`);
  const outUrl = await wsMotionControl({
    modelKey: opts.modelKey,
    imageUrl,
    videoUrl,
    orientation: opts.orientation,
    keepSound: opts.keepSound,
    prompt: opts.prompt,
    apiKey: key,
    onProgress: (pct) => opts.onStatus?.({ index, status: `processing ${pct}%` }),
  });
  if (!outUrl) throw new Error("Wavespeed: no output URL");
  return outUrl;
}

async function generateOneRoboneo(slot: MotionSlotInput, opts: MotionOpts): Promise<string> {
  const { index } = slot;
  const log = (m: string, l?: "info" | "warn" | "error" | "success") =>
    opts.onLog?.(`#${index + 1} [RN] ${m}`, l);

  const tokens = getAllRoboneoKeys();
  if (!tokens.length) throw new Error("Belum ada Roboneo access-token.");

  // Upload media. Untuk file besar, hindari edge worker (limit ~100MB / 413).
  // Coba direct browser → Uguu / Catbox dulu (keduanya set CORS *), lalu
  // fallback ke server proxy. Roboneo engine kadang menolak URL litterbox
  // sebagai input, jadi litterbox hanya sebagai upaya terakhir.
  const DIRECT_UPLOAD_TIMEOUT_MS = 8 * 60 * 1000;
  const DIRECT_UPLOAD_STALL_MS = 45 * 1000;

  const formatBytes = (bytes: number) => {
    if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
    if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)}KB`;
    return `${bytes}B`;
  };

  const postFormWithProgress = async (
    host: string,
    url: string,
    form: FormData,
    kind: "image" | "video",
    parse: (text: string, status: number) => string,
  ): Promise<string> =>
    new Promise((resolve, reject) => {
      if (typeof XMLHttpRequest === "undefined") {
        reject(new Error(`${host}: browser upload tidak tersedia`));
        return;
      }

      const xhr = new XMLHttpRequest();
      let settled = false;
      let stallTimer: ReturnType<typeof setTimeout> | null = null;
      let lastPct = -1;

      const cleanup = () => {
        if (stallTimer) clearTimeout(stallTimer);
        stallTimer = null;
      };

      const fail = (message: string) => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(new Error(message));
      };

      const resetStallTimer = () => {
        cleanup();
        stallTimer = setTimeout(() => {
          xhr.abort();
          fail(`${host}: upload tidak bergerak > ${Math.round(DIRECT_UPLOAD_STALL_MS / 1000)} detik`);
        }, DIRECT_UPLOAD_STALL_MS);
      };

      xhr.open("POST", url);
      xhr.timeout = DIRECT_UPLOAD_TIMEOUT_MS;

      xhr.upload.onloadstart = () => resetStallTimer();
      xhr.upload.onprogress = (event) => {
        resetStallTimer();
        if (event.lengthComputable && event.total > 0) {
          const pct = Math.max(0, Math.min(99, Math.round((event.loaded / event.total) * 100)));
          if (pct !== lastPct) {
            lastPct = pct;
            opts.onStatus?.({ index, status: `uploading ${kind} ${host} ${pct}%` });
          }
          return;
        }
        opts.onStatus?.({ index, status: `uploading ${kind} ${host} ${formatBytes(event.loaded)}` });
      };
      xhr.upload.onload = () => {
        resetStallTimer();
        opts.onStatus?.({ index, status: `uploading ${kind} ${host} selesai, menunggu URL...` });
      };

      xhr.onload = () => {
        if (settled) return;
        settled = true;
        cleanup();
        try {
          const text = typeof xhr.responseText === "string" ? xhr.responseText.trim() : "";
          resolve(parse(text, xhr.status));
        } catch (error) {
          reject(error);
        }
      };
      xhr.onerror = () => fail(`${host}: network/CORS gagal`);
      xhr.ontimeout = () => fail(`${host}: timeout upload`);
      xhr.onabort = () => fail(`${host}: upload dibatalkan`);

      resetStallTimer();
      xhr.send(form);
    });

  const uploadDirectUguu = async (file: File, kind: "image" | "video"): Promise<string> => {
    const fd = new FormData();
    fd.append("files[]", file, file.name || "upload.bin");
    return postFormWithProgress("Uguu", "https://uguu.se/upload.php", fd, kind, (text, status) => {
      const j = JSON.parse(text || "null") as { files?: Array<{ url?: string }>; error?: string } | null;
      const url = j?.files?.[0]?.url;
      if (status >= 200 && status < 300 && url && /^https?:\/\//i.test(url)) return url.replace(/\\\//g, "/");
      throw new Error(j?.error || `Uguu HTTP ${status}`);
    });
  };
  const uploadDirectCatbox = async (file: File, kind: "image" | "video"): Promise<string> => {
    const fd = new FormData();
    fd.append("reqtype", "fileupload");
    fd.append("fileToUpload", file, file.name || "upload.bin");
    return postFormWithProgress("Catbox", "https://catbox.moe/user/api.php", fd, kind, (text, status) => {
      if (status >= 200 && status < 300 && /^https?:\/\//i.test(text)) return text;
      throw new Error(text || `Catbox HTTP ${status}`);
    });
  };
  const uploadDirectTmpfiles = async (file: File, kind: "image" | "video"): Promise<string> => {
    const fd = new FormData();
    fd.append("file", file, file.name || "upload.bin");
    return postFormWithProgress("Tmpfiles", "https://tmpfiles.org/api/v1/upload", fd, kind, (text, status) => {
      const j = JSON.parse(text || "null") as { status?: string; data?: { url?: string } } | null;
      const url = j?.data?.url;
      if (status >= 200 && status < 300 && url && /^https?:\/\//i.test(url)) {
        // Convert viewer URL → direct download URL (insert /dl/ after host)
        return url.replace(/^(https?:\/\/tmpfiles\.org)\/(?!dl\/)/i, "$1/dl/");
      }
      throw new Error(`Tmpfiles HTTP ${status}`);
    });
  };
  const uploadDirect0x0 = async (file: File, kind: "image" | "video"): Promise<string> => {
    const fd = new FormData();
    fd.append("file", file, file.name || "upload.bin");
    return postFormWithProgress("0x0", "https://0x0.st", fd, kind, (text, status) => {
      const t = (text || "").trim();
      if (status >= 200 && status < 300 && /^https?:\/\//i.test(t)) return t;
      throw new Error(t || `0x0 HTTP ${status}`);
    });
  };
  const uploadDirectPixeldrain = async (file: File, kind: "image" | "video"): Promise<string> => {
    const fd = new FormData();
    fd.append("file", file, file.name || "upload.bin");
    return postFormWithProgress("Pixeldrain", "https://pixeldrain.com/api/file", fd, kind, (text, status) => {
      const j = JSON.parse(text || "null") as { id?: string; message?: string } | null;
      if (status >= 200 && status < 300 && j?.id) return `https://pixeldrain.com/api/file/${j.id}`;
      throw new Error(j?.message || `Pixeldrain HTTP ${status}`);
    });
  };
  const uploadViaServer = async (file: File): Promise<string> => {
    const fd = new FormData();
    fd.append("file", file, file.name || "upload.bin");
    fd.append("prefer", "roboneo");
    const r = await fetch("/api/public/upload-catbox", { method: "POST", body: fd });
    const j = (await r.json().catch(() => ({}))) as { url?: string; error?: string };
    if (!r.ok || !j.url) throw new Error(j.error || `Upload gagal (${r.status})`);
    archiveUploadInBackground(file, { source: "motion-control" });
    return j.url;
  };

  const validateRoboneoMediaUrl = async (url: string, kind: "image" | "video", host: string): Promise<string> => {
    const r = await fetch("/api/public/validate-media", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, kind }),
    });
    const j = (await r.json().catch(() => ({}))) as {
      ok?: boolean;
      error?: string;
      status?: number;
      contentType?: string;
      finalUrl?: string;
    };
    if (!r.ok || !j.ok) {
      const detail = [j.error, j.contentType ? `content-type=${j.contentType}` : null, j.finalUrl ? `final=${j.finalUrl}` : null]
        .filter(Boolean)
        .join(" · ");
      throw new Error(`${host}: ${detail || `validasi media gagal (${r.status})`}`);
    }
    return url;
  };

  // Vercel/serverless punya body-limit ~4.5MB → server proxy hanya aman
  // untuk file kecil. Lovable preview toleran sampai ~90MB, tapi kita pakai
  // ambang lebih ketat supaya build di hosting sendiri juga jalan.
  const SERVER_PROXY_HARD_LIMIT = 4 * 1024 * 1024;

  const uploadPublic = async (file: File, kind: "image" | "video"): Promise<string> => {
    const errs: string[] = [];
    type UploadFn = (f: File, k: "image" | "video") => Promise<string>;
    const serverEntry: [string, UploadFn] = ["Server", (f) => uploadViaServer(f)];
    const uguuEntry: [string, UploadFn] = ["Uguu", uploadDirectUguu];
    const catboxEntry: [string, UploadFn] = ["Catbox", uploadDirectCatbox];
    const tmpfilesEntry: [string, UploadFn] = ["Tmpfiles", uploadDirectTmpfiles];
    const pixeldrainEntry: [string, UploadFn] = ["Pixeldrain", uploadDirectPixeldrain];
    const zeroEntry: [string, UploadFn] = ["0x0", uploadDirect0x0];

    // Prioritaskan direct host supaya tidak kena body-limit serverless
    // (Vercel ~4.5MB). Tmpfiles sengaja dijadikan fallback terakhir karena
    // URL /dl-nya sering redirect ke halaman HTML; Roboneo lalu menyamarkan
    // input invalid itu sebagai "The system is busy" saat polling.
    const canUseServer = file.size <= SERVER_PROXY_HARD_LIMIT;
    const directOrder: Array<[string, UploadFn]> = [
      uguuEntry,
      catboxEntry,
      pixeldrainEntry,
      zeroEntry,
      tmpfilesEntry,
    ];
    const order: Array<[string, UploadFn]> = canUseServer
      ? [serverEntry, ...directOrder]
      : directOrder;

    for (const [host, fn] of order) {
      try {
        log(
          `${kind === "video" ? "Video" : "Image"} upload via ${host === "Server" ? "server proxy" : host} (${formatBytes(file.size)})...`,
        );
        opts.onStatus?.({ index, status: `uploading ${kind} ${host}...` });
        const url = await fn(file, kind);
        await validateRoboneoMediaUrl(url, kind, host);
        return url;
      } catch (e) {
        const msg = (e as Error).message;
        errs.push(`${host}: ${msg}`);
        log(`${host} gagal: ${msg}`, "warn");
      }
    }

    if (!canUseServer) {
      errs.push(`skip server proxy (${formatBytes(file.size)} > ${formatBytes(SERVER_PROXY_HARD_LIMIT)})`);
    }
    throw new Error(`Upload gagal: ${errs.join(" | ")}`);
  };


  opts.onStatus?.({ index, status: "uploading img..." });
  log("Upload image ke public host...");
  const imgBlob = await maybeCompress(slot.image);
  const imageUrl = await uploadPublic(
    new File([imgBlob], `rn_img_${index}_${Date.now()}.jpg`, { type: imgBlob.type || "image/jpeg" }),
    "image",
  );
  log(`Image: ${imageUrl.substring(0, 60)}...`);

  opts.onStatus?.({ index, status: "uploading vid..." });
  log("Upload video ke public host...");
  const videoUrl = await uploadPublic(
    new File([slot.video], `rn_vid_${index}_${Date.now()}.mp4`, { type: slot.video.type || "video/mp4" }),
    "video",
  );
  log(`Video: ${videoUrl.substring(0, 60)}...`);

  // Extract quality from modelKey (rn:<apiName>:<quality>)
  const parts = opts.modelKey.split(":");
  const quality = (parts[2] as "std" | "pro") || "std";

  const MAX_BUSY_RETRIES = 3;
  for (let ti = 0; ti < tokens.length; ti++) {
    const at = tokens[ti]!;
    let busyRetry = 0;
    // Retry loop for the same token to absorb transient upstream congestion
    // ("system is busy") before rotating or giving up.
    // eslint-disable-next-line no-constant-condition
    while (true) {
      try {
        opts.onStatus?.({ index, status: `submitting (token ${ti + 1}/${tokens.length})` });
        log(`Submit motion-control quality=${quality} (token ${ti + 1}/${tokens.length})...`);
        const taskId = await submitRoboneoMotion({
          accessToken: at,
          imageUrl,
          videoUrl,
          prompt: opts.prompt,
          quality,
          orientation: opts.orientation,
        });
        log(`Task: ${taskId}`);
        opts.onStatus?.({ index, status: "processing" });
        const outUrl = await pollRoboneoTask({
          accessToken: at,
          taskId,
          onProgress: (pct, st) => opts.onStatus?.({ index, status: `${st} ${pct}%` }),
        });
        if (!outUrl) throw new Error("Roboneo: no output URL");
        return outUrl;
      } catch (e) {
        const msg = (e as Error).message || String(e);
        const isBusy = /system is busy|try again later|busy.*try again|too many requests|429/i.test(msg);
        if (isBusy && busyRetry < MAX_BUSY_RETRIES) {
          busyRetry++;
          const waitMs = 5000 * busyRetry;
          log(`Upstream busy — retry ${busyRetry}/${MAX_BUSY_RETRIES} in ${waitMs / 1000}s...`, "warn");
          opts.onStatus?.({ index, status: `busy, retry ${busyRetry}/${MAX_BUSY_RETRIES}` });
          await new Promise((r) => setTimeout(r, waitMs));
          continue;
        }
        log(`Token ${ti + 1} failed: ${msg}`, "warn");
        if (!isRoboneoRotatableError(msg)) throw e;
        const removed = removeRoboneoKeyFromManager(at, msg);
        log(
          removed.removed && ti < tokens.length - 1
            ? "Token Roboneo habis/invalid — dihapus dari Token Manager, rotate ke token berikutnya..."
            : removed.removed
              ? "Token Roboneo habis/invalid — dihapus dari Token Manager."
            : "Rotating to next Roboneo token...",
          "info",
        );
        break;
      }
    }
  }
  throw new Error("Roboneo: semua token gagal atau habis credit. Tambahkan token baru di Token Manager.");
}

async function generateOneFramia(slot: MotionSlotInput, opts: MotionOpts): Promise<string> {
  void slot;
  void opts;
  throw new Error("Provider aktif Framia. Gunakan Generate → Framia untuk menjalankan node/canvas Framia secara langsung.");
}

/** Run all slots. Stagger starts by 1.5s to avoid API collision, mirror legacy behavior. */
export async function generateMotionAll(slots: MotionSlotInput[], opts: MotionOpts): Promise<void> {
  await Promise.all(
    slots.map(async (slot) => {
      await new Promise((r) => setTimeout(r, slot.index * 1500));
      try {
        let url: string;
        if (opts.provider === "weavy") url = await generateOneWeavy(slot, opts);
        else if (opts.provider === "wavespeed") url = await generateOneWavespeed(slot, opts);
        else if (opts.provider === "magnific") url = await generateOneMagnific(slot, opts);
        else if (opts.provider === "roboneo") url = await generateOneRoboneo(slot, opts);
        else if (opts.provider === "framia") url = await generateOneFramia(slot, opts);
        else throw new Error("Provider tidak dikenal: " + opts.provider);
        opts.onStatus?.({ index: slot.index, status: "done", url });
        opts.onLog?.(`#${slot.index + 1} Done: ${url.substring(0, 60)}...`, "success");
      } catch (e) {
        const err = (e as Error).message || String(e);
        opts.onStatus?.({ index: slot.index, status: "error", error: err });
        opts.onLog?.(`#${slot.index + 1} Error: ${err}`, "error");
      }
    }),
  );
  // Setelah batch selesai, refresh saldo provider yang dipakai supaya Token
  // Manager selalu up-to-date & token yang habis auto ter-prune.
  notifyGenerationDone(opts.provider);
}
