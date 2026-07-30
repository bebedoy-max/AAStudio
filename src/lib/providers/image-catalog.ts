// Shared text-to-image catalog + dispatcher untuk halaman /generate/leonardo
// ("Text to Image"). Provider aktif diambil dari Routing Provider (cap "image").

export type ImageProviderId = "weavy" | "gemini" | "openai" | "framia" | "leonardo" | "firefly";

export type ImgQuality = { v: string; label: string };
export type ImgModelDef = {
  key: string;
  label: string;
  qualities: ImgQuality[];
  ratios?: string[];
};

const RATIOS_STD = ["1:1", "9:16", "16:9", "2:3", "3:2", "4:5"];

export const IMAGE_PROVIDER_LABEL: Record<ImageProviderId, string> = {
  weavy: "Weavy",
  gemini: "Gemini Direct",
  openai: "OpenAI Direct",
  framia: "Framia (Converge AI)",
  leonardo: "Leonardo.ai",
  firefly: "Adobe Firefly",
};

export const IMAGE_PROVIDER_CATALOG: Record<Exclude<ImageProviderId, "leonardo">, ImgModelDef[]> = {
  firefly: [
    { key: "ff:image4-standard", label: "Firefly Image 4 Standard", qualities: [{ v: "standard", label: "Standard (~1 cr)" }], ratios: RATIOS_STD },
    { key: "ff:image4-ultra", label: "Firefly Image 4 Ultra", qualities: [{ v: "ultra", label: "Ultra (~4 cr)" }], ratios: RATIOS_STD },
    { key: "ff:image3", label: "Firefly Image 3", qualities: [{ v: "standard", label: "Standard (~1 cr)" }], ratios: RATIOS_STD },
  ],
  weavy: [
    {
      key: "nanobanana2",
      label: "Gemini Nano Banana 2 (Weavy)",
      qualities: [
        { v: "0.5K", label: "0.5K (~4.5 cr)" },
        { v: "1K", label: "1K (~6 cr)" },
        { v: "2K", label: "2K (~9 cr)" },
        { v: "4K", label: "4K (~12 cr)" },
      ],
      ratios: RATIOS_STD,
    },
    {
      // Nama & param mengikuti node "ChatGPT Images 2.0" di web weavy.com.
      // Value quality diencode "quality@WIDTHxHEIGHT" — provider akan split-kan.
      key: "gptimage2",
      label: "ChatGPT Images 2.0 (Weavy)",
      qualities: [
        { v: "low@1024x1024",   label: "1024² · Low (~5 cr)" },
        { v: "medium@1024x1024",label: "1024² · Medium (~11 cr)" },
        { v: "high@1024x1024",  label: "1024² · High (~20 cr)" },
        { v: "medium@1536x1024",label: "1536×1024 · Medium (~13 cr)" },
        { v: "high@1536x1024",  label: "1536×1024 · High (~24 cr)" },
        { v: "medium@1024x1536",label: "1024×1536 · Medium (~13 cr)" },
        { v: "high@1024x1536",  label: "1024×1536 · High (~24 cr)" },
        { v: "medium@2048x2048",label: "2048² · Medium (~17 cr)" },
        { v: "high@2048x2048",  label: "2048² · High (~30 cr)" },
        { v: "high@2048x1152",  label: "2048×1152 · High (~24 cr)" },
        { v: "high@3840x2160",  label: "3840×2160 · High (~37 cr)" },
        { v: "high@2160x3840",  label: "2160×3840 · High (~37 cr)" },
        { v: "high@auto",       label: "Auto · High (~20 cr)" },
      ],
      ratios: ["1:1", "9:16", "16:9"],
    },
    {
      key: "seedream-v50-pro",
      label: "Seedream V5.0 Pro (Weavy)",
      qualities: [
        { v: "square_hd",       label: "Square HD (12 cr)" },
        { v: "square",          label: "Square (12 cr)" },
        { v: "portrait",        label: "Portrait (12 cr)" },
        { v: "landscape",       label: "Landscape (12 cr)" },
        { v: "auto_2K",         label: "Auto 2K (12 cr)" },
        { v: "auto_3K",         label: "Auto 3K (12 cr)" },
      ],
      ratios: RATIOS_STD,
    },
  ],
  framia: [
    { key: "framia:nano-banana-lite", label: "Nano Banana Lite (Framia)", qualities: [{ v: "1K", label: "1K (~1 cr)" }, { v: "2K", label: "2K (~2 cr)" }] },
    { key: "framia:nano-banana", label: "Nano Banana (Framia)", qualities: [{ v: "1K", label: "1K (~2 cr)" }, { v: "2K", label: "2K (~3 cr)" }] },
    { key: "framia:nano-banana-2", label: "Nano Banana 2 (Framia)", qualities: [{ v: "1K", label: "1K (~3 cr)" }, { v: "2K", label: "2K (~4 cr)" }] },
    { key: "framia:nano-banana-pro", label: "Nano Banana Pro (Framia)", qualities: [{ v: "default", label: "Standard (~5 cr)" }] },
    { key: "framia:gpt-image-2", label: "GPT Image 2 (Framia)", qualities: [{ v: "2K", label: "2K (~5 cr)" }, { v: "4K", label: "4K (~8 cr)" }] },
    { key: "framia:seedream-4", label: "Seedream 4.0 (Framia)", qualities: [{ v: "1K", label: "1K (~3 cr)" }, { v: "2K", label: "2K (~4 cr)" }] },
    { key: "framia:seedream-4-5", label: "Seedream 4.5 (Framia)", qualities: [{ v: "1K", label: "1K (~3 cr)" }, { v: "2K", label: "2K (~4 cr)" }] },
    { key: "framia:seedream-5", label: "Seedream 5 (Framia)", qualities: [{ v: "1K", label: "1K (~4 cr)" }, { v: "2K", label: "2K (~5 cr)" }] },
    { key: "framia:seedream-5-pro", label: "Seedream 5 Pro (Framia)", qualities: [{ v: "1K", label: "1K (~4 cr)" }, { v: "2K", label: "2K (~5 cr)" }] },
    { key: "framia:flux-1.1-pro", label: "Flux 1.1 Pro (Framia)", qualities: [{ v: "default", label: "Standard (~3 cr)" }] },
    { key: "framia:flux-max", label: "Flux Max (Framia)", qualities: [{ v: "default", label: "Standard (~6 cr)" }] },
  ],
  gemini: [
    {
      key: "gemini-3.1-flash-image",
      label: "Gemini 3.1 Flash Image (Direct)",
      qualities: [{ v: "default", label: "Standard (~$0.039 / image)" }],
      ratios: RATIOS_STD,
    },
  ],
  openai: [
    {
      key: "gpt-image-1",
      label: "GPT Image 1 (Direct)",
      qualities: [{ v: "default", label: "1024² (~$0.040 / image)" }],
      ratios: ["1:1"],
    },
  ],
};

export function imageModelsFor(provider: ImageProviderId): ImgModelDef[] {
  if (provider === "leonardo") return [];
  return IMAGE_PROVIDER_CATALOG[provider] ?? [];
}

export function ratiosFor(model: ImgModelDef | undefined): string[] {
  return model?.ratios ?? RATIOS_STD;
}

const LS_ROUTING = "aatools.routing.v2";

export function readRoutedImageProvider(): ImageProviderId {
  if (typeof window === "undefined") return "weavy";
  try {
    const raw = localStorage.getItem(LS_ROUTING);
    if (!raw) return "weavy";
    const obj = JSON.parse(raw) as { image?: string };
    const p = obj?.image as ImageProviderId | undefined;
    const valid: ImageProviderId[] = ["weavy", "gemini", "openai", "framia", "leonardo", "firefly"];
    return p && valid.includes(p) ? p : "weavy";
  } catch {
    return "weavy";
  }
}

export type GenerateImageOpts = {
  provider: Exclude<ImageProviderId, "leonardo">;
  modelKey: string;
  prompt: string;
  quality: string;
  ratio: string;
  onProgress?: (msg: string, pct?: number) => void;
  onRotate?: (nextIndex: number, total: number, reason: string) => void;
};

/** Generate satu gambar dengan provider non-Leonardo. Mengembalikan URL/dataURL. */
export async function generateImageWithProvider(opts: GenerateImageOpts): Promise<string> {
  if (opts.provider === "weavy") {
    const { generateWeavyImage } = await import("./weavy-image");
    opts.onProgress?.("Weavy: submit recipe…", 5);
    return generateWeavyImage({
      modelKey: opts.modelKey,
      prompt: opts.prompt,
      quality: opts.quality,
      ratio: opts.ratio,
      onProgress: (m, p) => opts.onProgress?.(m, p),
    });
  }
  if (opts.provider === "firefly") {
    const { generateFireflyImage, runFireflyWithRotation } = await import("./firefly");
    return runFireflyWithRotation(
      (token) =>
        generateFireflyImage({
          token,
          modelKey: opts.modelKey,
          prompt: opts.prompt,
          ratio: opts.ratio,
          onProgress: (m, p) => opts.onProgress?.(m, p),
        }),
      opts.onRotate,
    );
  }
  if (opts.provider === "framia") {
    const { generateFramiaImage } = await import("./framia-image");
    return generateFramiaImage({
      modelKey: opts.modelKey,
      prompt: opts.prompt,
      aspectRatio: opts.ratio,
      resolution: opts.quality,
      onProgress: (m) => opts.onProgress?.(m),
      onRotate: opts.onRotate,
    });
  }
  // gemini / openai → backend router
  const { getCreativeKeys, headersFor } = await import("@/lib/creative/keys");
  const keys = getCreativeKeys();
  const headers = headersFor(keys);
  if (opts.provider === "gemini" && !keys.gemini) {
    throw new Error("Belum ada Gemini API key di Kelola Token → Brain.");
  }
  if (opts.provider === "openai" && !keys.openai) {
    throw new Error("Belum ada OpenAI API key di Kelola Token → Brain.");
  }
  // Kirim hanya key provider yang dipilih supaya routing benar-benar dihormati.
  if (opts.provider === "gemini") delete headers["x-user-openai-keys"];
  if (opts.provider === "openai") delete headers["x-user-gemini-keys"];

  opts.onProgress?.(`${opts.provider}: request image…`);
  const r = await fetch("/api/router/image", {
    method: "POST",
    headers,
    body: JSON.stringify({ prompt: opts.prompt, aspectRatio: opts.ratio }),
  });
  const j = (await r.json().catch(() => ({}))) as { b64?: string; mime?: string; error?: string };
  if (!r.ok || !j.b64) throw new Error(j.error || `Image router gagal (${r.status})`);
  return `data:${j.mime || "image/png"};base64,${j.b64}`;
}
