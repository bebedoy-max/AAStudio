// Image-to-Video orchestrator. Uses Wavespeed for wavespeed provider,
// Weavy asset upload + kling recipe for weavy provider (best-effort),
// and Magnific proxy for magnific provider.

import { getFirstWavespeedKey, wsUploadMedia, wsPost, wsPoll, WAVESPEED_API } from "./wavespeed";
import { notifyGenerationDone } from "@/lib/tokens/refresh";

export type I2VProvider = "weavy" | "wavespeed" | "magnific";

export type I2VOpts = {
  provider: I2VProvider;
  modelKey: string; // e.g. "kling-2.1" | "seedance" | "wan-i2v" | "veo-3" | "sora"
  imageFile: File;
  ratio: string;
  duration: number; // seconds, 5 or 10
  prompt: string;
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
  // Magnific menyediakan kling motion, bukan pure i2v — arahkan user pakai Motion Control page.
  void opts;
  throw new Error("Magnific hanya support Motion Control (butuh video referensi). Gunakan menu Motion Control.");
}

export async function generateI2V(opts: I2VOpts): Promise<string> {
  try {
    if (opts.provider === "wavespeed") return await runWavespeedI2V(opts);
    if (opts.provider === "weavy") return await runWeavyI2V(opts);
    return await runMagnificI2V(opts);
  } finally {
    if (opts.provider === "wavespeed" || opts.provider === "weavy" || opts.provider === "magnific") {
      notifyGenerationDone(opts.provider);
    }
  }
}
