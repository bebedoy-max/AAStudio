// Bulk Fashion orchestrator — 1 karakter + N outfits → N generated images.
// Wavespeed path uses image-edit endpoints in parallel.
// Weavy/Magnific paths raise a clear error (recipe belum diport / provider-only).

import { getFirstWavespeedKey, wsUploadMedia, wsPost, wsPoll, WAVESPEED_API } from "./wavespeed";

export type BulkProvider = "weavy" | "wavespeed" | "magnific";

export type BulkFashionOpts = {
  provider: BulkProvider;
  modelKey: string; // e.g. "ws:google/nano-banana-2/edit"
  quality: string;
  ratio: string;
  charFile: File;
  outfitFiles: File[];
  promptTemplate: string; // may contain {product_type}, {outfit_index}
  productType: string;
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
  const payload: Record<string, unknown> = {
    prompt,
    images: [charUrl, outfitUrl],
    aspect_ratio: ratio,
  };
  if (/gpt-image/.test(modelId)) payload.quality = quality;
  if (/nano-banana/.test(modelId)) payload.resolution = quality;
  const data = await wsPost(modelId, payload, key);
  const getUrl = data.urls?.get || `${WAVESPEED_API}/predictions/${data.id}/result`;
  return wsPoll(getUrl, key, { timeoutMs: 300000 });
}

async function runWavespeedBulk(opts: BulkFashionOpts): Promise<string[]> {
  const key = getFirstWavespeedKey();
  if (!key) throw new Error("Belum ada Wavespeed API key");
  const modelId = opts.modelKey.replace(/^ws:/, "");

  opts.onProgress?.(-1, "Upload karakter...");
  const charUrl = await wsUploadMedia(opts.charFile, `char_${Date.now()}.jpg`, key);

  const results: string[] = new Array(opts.outfitFiles.length);
  await Promise.all(
    opts.outfitFiles.map(async (of, i) => {
      try {
        opts.onProgress?.(i, `Generate outfit #${i + 1}...`);
        const prompt = buildPrompt(opts.promptTemplate, opts.productType, i);
        const url = await runWavespeedOne(key, modelId, charUrl, of, prompt, opts.ratio, opts.quality);
        results[i] = url;
        opts.onProgress?.(i, "done", url);
      } catch (e) {
        const err = (e as Error).message || String(e);
        opts.onProgress?.(i, "error", undefined, err);
      }
    }),
  );
  return results.filter(Boolean);
}

async function runWeavyBulk(opts: BulkFashionOpts): Promise<string[]> {
  const { generateWeavyBulkOne } = await import("./weavy-bulk-fashion");
  const results: string[] = new Array(opts.outfitFiles.length);
  // Serial to avoid concurrent recipe conflicts on a single Weavy token.
  for (let i = 0; i < opts.outfitFiles.length; i++) {
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
      results[i] = url;
      opts.onProgress?.(i, "done", url);
    } catch (e) {
      const err = (e as Error).message || String(e);
      opts.onProgress?.(i, "error", undefined, err);
    }
  }
  return results.filter(Boolean);
}

export async function generateBulkFashion(opts: BulkFashionOpts): Promise<string[]> {
  if (opts.provider === "wavespeed") return runWavespeedBulk(opts);
  if (opts.provider === "weavy") return runWeavyBulk(opts);
  throw new Error("Magnific belum menyediakan bulk fashion edit endpoint di proxy.");
}
