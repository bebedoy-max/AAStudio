// Adapter: expose Leonardo.ai as a routable image provider.
// Wraps generateLeonardoImages() so callers (bulk-fashion, storyboard,
// naratif, dll) bisa memakai signature yang sama seperti provider lain.
//
// v2 generations endpoint = text-to-image saja (no multi-reference edit),
// jadi bulk-fashion tetap panggil ini dengan prompt saja (referensi
// karakter/outfit tidak dipakai — provider lain kalau butuh outfit-swap).

import { generateLeonardoImages, type CreateGenerationInput } from "./leonardo";

// Featured 4 models — dimensi resmi dari app.leonardo.ai (medium tier).
const DIMS: Record<string, Record<string, [number, number]>> = {
  "gpt-image-2": {
    "1:1": [1024, 1024],
    "2:3": [1136, 2048],
    "3:2": [2048, 1136],
    "9:16": [1136, 2048],
    "16:9": [2048, 1136],
    "4:5": [1136, 1408],
    "3:4": [1136, 1520],
  },
  "nano-banana-2": {
    "1:1": [1536, 1536],
    "9:16": [1536, 2752],
    "16:9": [2752, 1536],
    "2:3": [1536, 2304],
    "3:2": [2304, 1536],
    "4:5": [1536, 1920],
    "3:4": [1536, 2048],
  },
  "seedream-5.0-pro": {
    "1:1": [1536, 1536],
    "9:16": [1152, 2048],
    "16:9": [2048, 1152],
    "2:3": [1280, 1920],
    "3:2": [1920, 1280],
    "4:5": [1280, 1600],
    "3:4": [1280, 1728],
  },
  "flux-pro-2.0": {
    "1:1": [1024, 1024],
    "9:16": [816, 1440],
    "16:9": [1440, 816],
    "2:3": [960, 1440],
    "3:2": [1440, 960],
    "4:5": [1024, 1280],
    "3:4": [1088, 1440],
  },
};

const DEFAULT_MODEL = "nano-banana-2";

function pickDims(slug: string, ratio: string): [number, number] {
  const map = DIMS[slug] || DIMS[DEFAULT_MODEL];
  return map[ratio] || map["1:1"] || [1024, 1024];
}

function normalizeSlug(modelKey: string): string {
  const stripped = modelKey.replace(/^leo:/, "");
  return DIMS[stripped] ? stripped : DEFAULT_MODEL;
}

function normalizeQuality(q?: string): "low" | "medium" | "high" {
  const v = (q || "").toLowerCase();
  if (v === "low" || v === "high") return v;
  return "medium";
}

export type LeonardoRouteOpts = {
  modelKey: string;
  prompt: string;
  ratio: string;
  quality?: string;
  /** URLs to fetch and upload as visual references (image prompts). */
  referenceUrls?: string[];
  /** Files to upload as visual references. */
  referenceFiles?: File[];
  onProgress?: (msg: string) => void;
  onRotate?: (nextIndex: number, total: number, reason: string) => void;
};

export async function generateLeonardoOne(opts: LeonardoRouteOpts): Promise<string> {
  const slug = normalizeSlug(opts.modelKey);
  const [w, h] = pickDims(slug, opts.ratio);
  const referenceBlobs = (opts.referenceFiles ?? []).map((f) => {
    const name = (f.name || "").toLowerCase();
    const ext: "png" | "jpg" | "jpeg" | "webp" = name.endsWith(".webp")
      ? "webp"
      : name.endsWith(".png")
        ? "png"
        : "jpg";
    return { blob: f as Blob, ext };
  });
  const input: CreateGenerationInput = {
    prompt: opts.prompt,
    modelId: slug,
    width: w,
    height: h,
    num_images: 1,
    quality: normalizeQuality(opts.quality),
    promptEnhance: "OFF",
    referenceUrls: opts.referenceUrls ?? [],
    referenceBlobs,
  };
  const { images } = await generateLeonardoImages(input, {
    onProgress: opts.onProgress,
    onRotate: opts.onRotate,
  });
  const url = images[0];
  if (!url) throw new Error("Leonardo: tidak ada gambar dikembalikan");
  return url;
}

// Katalog model + tarif referensi untuk MODEL_CATALOG UI.
export const LEONARDO_MODEL_CATALOG = [
  {
    key: "leo:gpt-image-2",
    label: "GPT Image 2 (Leonardo)",
    qualities: [
      { v: "low", label: "Low (~6 cr)", cr: 6 },
      { v: "medium", label: "Medium (~12 cr)", cr: 12, default: true },
      { v: "high", label: "High (~24 cr)", cr: 24 },
    ],
  },
  {
    key: "leo:nano-banana-2",
    label: "Nano Banana 2 (Leonardo)",
    qualities: [{ v: "default", label: "Standard (~8 cr)", cr: 8, default: true }],
  },
  {
    key: "leo:seedream-5.0-pro",
    label: "Seedream 5.0 Pro (Leonardo)",
    qualities: [{ v: "default", label: "Standard (~8 cr)", cr: 8, default: true }],
  },
  {
    key: "leo:flux-pro-2.0",
    label: "Flux.2 Pro (Leonardo)",
    qualities: [{ v: "default", label: "Standard (~8 cr)", cr: 8, default: true }],
  },
] as const;
