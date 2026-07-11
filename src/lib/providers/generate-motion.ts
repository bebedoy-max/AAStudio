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

export type MotionProvider = "weavy" | "wavespeed" | "magnific";

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
}
