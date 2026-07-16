// Bulk Fashion orchestrator — 1 karakter + N outfits → N generated images.
// Wavespeed path uses image-edit endpoints in parallel with auto key-rotation on credit errors.
// Weavy path uses recipe pipeline (with its own token rotation).

import { getAllWavespeedKeys, wsUploadMedia, wsPost, wsPoll, WAVESPEED_API, isWavespeedRotatableError } from "./wavespeed";
import { notifyGenerationDone } from "@/lib/tokens/refresh";

export type BulkProvider = "weavy" | "wavespeed" | "magnific";

export type BulkFashionOpts = {
  provider: BulkProvider;
  modelKey: string;
  quality: string;
  ratio: string;
  charFile: File;
  outfitFiles: File[];
  promptTemplate: string;
  productType: string;
  signal?: AbortSignal;
  onProgress?: (i: number, msg: string, url?: string, err?: string) => void;
};

const OUTFIT_DIRECTIVE =
  "PENTING (multi-referensi): Gambar #1 adalah KARAKTER — pertahankan identitas persis (wajah, kulit, rambut/hijab, bentuk tubuh, ekspresi). Gambar #2 adalah OUTFIT/PAKAIAN yang harus dikenakan oleh karakter dari gambar #1, mengganti pakaian aslinya. Salin bentuk, warna, motif, tekstur, kerah, dan detail outfit dari gambar #2 seakurat mungkin. Jangan mencampur outfit gambar #1 dengan gambar #2 — outfit lama dari karakter DIHAPUS. Hasil akhir: satu foto karakter dari gambar #1 memakai outfit dari gambar #2.\n\nInstruksi visual tambahan: ";

function buildPrompt(tpl: string, productType: string, idx: number) {
  const body = tpl.replaceAll("{product_type}", productType).replaceAll("{outfit_index}", String(idx + 1));
  return OUTFIT_DIRECTIVE + body;
}

async function runWavespeedOne(
  key: string,
  modelId: string,
  charUrl: string,
  outfit: File,
  prompt: string,
  ratio: string,
  quality: string,
): Promise<string> {
  const outfitUrl = await wsUploadMedia(outfit, `outfit_${Date.now()}.jpg`, key);
  const payload: Record<string, unknown> = { prompt, images: [charUrl, outfitUrl], aspect_ratio: ratio };
  if (/gpt-image/.test(modelId)) payload.quality = quality;
  if (/nano-banana/.test(modelId)) payload.resolution = quality;
  const data = await wsPost(modelId, payload, key);
  const getUrl = data.urls?.get || `${WAVESPEED_API}/predictions/${data.id}/result`;
  return wsPoll(getUrl, key, { timeoutMs: 300000 });
}

/** Try all wavespeed keys until one succeeds; rotate on credit / auth errors. */
async function runWavespeedOneWithRotation(
  keys: string[],
  modelId: string,
  charUrls: Map<string, string>,
  outfit: File,
  prompt: string,
  ratio: string,
  quality: string,
  charFile: File,
): Promise<string> {
  let lastErr: Error | null = null;
  for (const key of keys) {
    try {
      let charUrl = charUrls.get(key);
      if (!charUrl) {
        charUrl = await wsUploadMedia(charFile, `char_${Date.now()}.jpg`, key);
        charUrls.set(key, charUrl);
      }
      return await runWavespeedOne(key, modelId, charUrl, outfit, prompt, ratio, quality);
    } catch (e) {
      lastErr = e instanceof Error ? e : new Error(String(e));
      if (!isWavespeedRotatableError(lastErr.message)) throw lastErr;
      // try next key
    }
  }
  throw lastErr ?? new Error("Semua Wavespeed key gagal / habis credit");
}

async function runWavespeedBulk(opts: BulkFashionOpts): Promise<string[]> {
  const keys = getAllWavespeedKeys();
  if (keys.length === 0) throw new Error("Belum ada Wavespeed API key");
  const modelId = opts.modelKey.replace(/^ws:/, "");
  const charUrls = new Map<string, string>();

  const results: string[] = new Array(opts.outfitFiles.length);
  await Promise.all(
    opts.outfitFiles.map(async (of, i) => {
      if (opts.signal?.aborted) return;
      try {
        opts.onProgress?.(i, `Generate outfit #${i + 1}...`);
        const prompt = buildPrompt(opts.promptTemplate, opts.productType, i);
        const url = await runWavespeedOneWithRotation(keys, modelId, charUrls, of, prompt, opts.ratio, opts.quality, opts.charFile);
        if (opts.signal?.aborted) return;
        results[i] = url;
        opts.onProgress?.(i, "done", url);
      } catch (e) {
        if (opts.signal?.aborted) return;
        opts.onProgress?.(i, "error", undefined, (e as Error).message || String(e));
      }
    }),
  );
  return results.filter(Boolean);
}

async function runWeavyBulk(opts: BulkFashionOpts): Promise<string[]> {
  const { generateWeavyBulkOne } = await import("./weavy-bulk-fashion");
  const results: string[] = new Array(opts.outfitFiles.length);
  for (let i = 0; i < opts.outfitFiles.length; i++) {
    if (opts.signal?.aborted) break;
    try {
      opts.onProgress?.(i, `Generate outfit #${i + 1}...`);
      const prompt = buildPrompt(opts.promptTemplate, opts.productType, i);
      const url = await generateWeavyBulkOne({
        modelKey: opts.modelKey,
        prompt,
        quality: opts.quality,
        ratio: opts.ratio,
        charFile: opts.charFile,
        outfitFile: opts.outfitFiles[i],
      });
      if (opts.signal?.aborted) break;
      results[i] = url;
      opts.onProgress?.(i, "done", url);
    } catch (e) {
      if (opts.signal?.aborted) break;
      opts.onProgress?.(i, "error", undefined, (e as Error).message || String(e));
    }
  }
  return results.filter(Boolean);
}

export async function generateBulkFashion(opts: BulkFashionOpts): Promise<string[]> {
  try {
    if (opts.provider === "wavespeed") return await runWavespeedBulk(opts);
    if (opts.provider === "weavy") return await runWeavyBulk(opts);
    throw new Error("Magnific belum menyediakan bulk fashion edit endpoint di proxy.");
  } finally {
    if (opts.provider === "wavespeed" || opts.provider === "weavy") {
      notifyGenerationDone(opts.provider);
    }
  }
}

