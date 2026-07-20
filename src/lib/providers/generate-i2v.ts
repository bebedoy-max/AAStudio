// Image-to-Video orchestrator. Uses Wavespeed for wavespeed provider,
// Weavy asset upload + kling recipe for weavy provider (best-effort),
// Magnific proxy for magnific provider, and Roboneo (Meitu gateway) for roboneo.

import { getFirstWavespeedKey, wsUploadMedia, wsPost, wsPoll, WAVESPEED_API } from "./wavespeed";
import {
  getAllRoboneoKeys,
  submitRoboneoI2V,
  pollRoboneoTask,
  isRoboneoRotatableError,
} from "./roboneo";
import { notifyGenerationDone } from "@/lib/tokens/refresh";

export type I2VProvider = "weavy" | "wavespeed" | "magnific" | "roboneo";

export type I2VOpts = {
  provider: I2VProvider;
  modelKey: string; // e.g. "kling-2.1" | "seedance" | "wan-i2v" | "veo-3" | "sora" | "rn:kling-v26:std"
  imageFile: File;
  ratio: string;
  duration: number; // seconds, 5 / 10 / 12
  prompt: string;
  resolution?: string;   // roboneo seedance-pro: "480p" | "720p" | "1080p"
  sound?: "on" | "off";  // roboneo kling-v26: sound track on/off
  onProgress?: (msg: string, pct?: number) => void;
};


// Map friendly modelKey → real wavespeed endpoint
const WS_I2V_ENDPOINTS: Record<string, string> = {
  "kling-2.1": "kwaivgi/kling-v2.1-i2v-standard",
  seedance: "bytedance/seedance-v1-pro-i2v-720p",
  "wan-i2v": "wavespeed-ai/wan-2.1/i2v-14b-720p",
};

async function runWavespeedI2V(opts: I2VOpts): Promise<string> {
  const key = getFirstWavespeedKey();
  if (!key) throw new Error("Belum ada Wavespeed API key");
  const modelId = WS_I2V_ENDPOINTS[opts.modelKey] || opts.modelKey.replace(/^ws:/, "");

  opts.onProgress?.("Upload image ke Wavespeed...", 10);
  const imageUrl = await wsUploadMedia(opts.imageFile, `i2v_${Date.now()}.jpg`, key);
  opts.onProgress?.("Submit ke Wavespeed...", 25);
  const data = await wsPost(modelId, {
    image: imageUrl,
    prompt: opts.prompt,
    duration: opts.duration,
    aspect_ratio: opts.ratio,
  }, key);
  const getUrl = data.urls?.get || `${WAVESPEED_API}/predictions/${data.id}/result`;
  return wsPoll(getUrl, key, {
    timeoutMs: 600000,
    onProgress: (pct) => opts.onProgress?.(`Rendering...`, pct),
  });
}

async function runWeavyI2V(opts: I2VOpts): Promise<string> {
  const { generateWeavyI2V } = await import("./weavy-i2v");
  return generateWeavyI2V({
    modelKey: opts.modelKey,
    imageFile: opts.imageFile,
    prompt: opts.prompt,
    duration: opts.duration,
    ratio: opts.ratio,
    onProgress: opts.onProgress,
  });
}

async function runMagnificI2V(opts: I2VOpts): Promise<string> {
  void opts;
  throw new Error("Magnific hanya support Motion Control (butuh video referensi). Gunakan menu Motion Control.");
}

async function runRoboneoI2V(opts: I2VOpts): Promise<string> {
  const tokens = getAllRoboneoKeys();
  if (!tokens.length) throw new Error("Belum ada Roboneo access-token.");

  // Parse modelKey format: "rn:<version>:<quality>" mis. "rn:kling-v26:std"
  const parts = opts.modelKey.split(":");
  const versionTag = parts[1] || "kling-v26";
  const quality = (parts[2] as "std" | "pro") || "std";
  const modelVersion: "v26" | "v21" = versionTag.includes("v21") ? "v21" : "v26";

  opts.onProgress?.("Upload image ke public host...", 8);
  const fd = new FormData();
  fd.append(
    "file",
    new File([opts.imageFile], `rn_i2v_${Date.now()}.jpg`, {
      type: opts.imageFile.type || "image/jpeg",
    }),
  );
  const upRes = await fetch("/api/public/upload-catbox", { method: "POST", body: fd });
  const upJson = (await upRes.json().catch(() => ({}))) as { url?: string; error?: string };
  if (!upRes.ok || !upJson.url) throw new Error(upJson.error || `Upload gagal (${upRes.status})`);
  const imageUrl = upJson.url;

  for (let ti = 0; ti < tokens.length; ti++) {
    const at = tokens[ti]!;
    try {
      opts.onProgress?.(`Submit Roboneo ${opts.modelKey} (token ${ti + 1}/${tokens.length})...`, 15);
      const taskId = await submitRoboneoI2V({
        accessToken: at,
        imageUrl,
        prompt: opts.prompt,
        modelKey: opts.modelKey,
        modelVersion,
        quality,
        ratio: opts.ratio,
        duration: opts.duration,
        resolution: opts.resolution,
        sound: opts.sound,
      });

      opts.onProgress?.("Processing...", 25);
      const outUrl = await pollRoboneoTask({
        accessToken: at,
        taskId,
        onProgress: (pct, st) => opts.onProgress?.(`Roboneo ${st}`, pct),
      });
      if (!outUrl) throw new Error("Roboneo: no output URL");
      return outUrl;
    } catch (e) {
      const msg = (e as Error).message || String(e);
      if (!isRoboneoRotatableError(msg) || ti === tokens.length - 1) throw e;
      opts.onProgress?.(`Token ${ti + 1} gagal, rotate...`, 15);
    }
  }
  throw new Error("Roboneo: semua token gagal");
}

export async function generateI2V(opts: I2VOpts): Promise<string> {
  try {
    if (opts.provider === "wavespeed") return await runWavespeedI2V(opts);
    if (opts.provider === "weavy") return await runWeavyI2V(opts);
    if (opts.provider === "roboneo") return await runRoboneoI2V(opts);
    return await runMagnificI2V(opts);
  } finally {
    notifyGenerationDone(opts.provider);
  }
}
