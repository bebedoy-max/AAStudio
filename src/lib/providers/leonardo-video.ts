// Leonardo.ai Video generator (I2V + T2V) — GraphQL mutation `Generate`
// pada endpoint /v1/graphql (sesuai capture DevTools app.leonardo.ai).
//
// Katalog parameter di file ini disamakan dengan yang muncul di UI resmi
// app.leonardo.ai per November 2026: aspect ratio, durasi (button/slider),
// tier ukuran (Standard / HD / Full HD / 4K / Quality / High Quality),
// audio, dan biaya credit acuan per detik.
//
// Polling status memakai REST v1: GET /api/rest/v1/generations/{id}

import {
  leonardoFetch,
  runLeonardoWithRotation,
  uploadLeonardoInitImage,
  fetchAsBlob,
  type LeonardoRotateOpts,
} from "./leonardo";

/* --------------------------------- catalog -------------------------------- */

export type LeonardoVideoAspect = "1:1" | "16:9" | "9:16" | "3:4" | "4:3";

/** Tier resolusi — short side + long side (pixel). Aspek dihitung dari sini. */
export type LeonardoVideoSizeTier = {
  id: "standard" | "quality" | "hd" | "highQuality" | "fullHd" | "4k";
  label: string; // "Standard 496×864", "HD 720×1280", dst.
  short: number;
  long: number;
};

const TIER_STANDARD_496: LeonardoVideoSizeTier = { id: "standard", label: "Standard 496×864", short: 496, long: 864 };
const TIER_STANDARD_400: LeonardoVideoSizeTier = { id: "standard", label: "Standard 400×736", short: 400, long: 736 };
const TIER_QUALITY_720:  LeonardoVideoSizeTier = { id: "quality",  label: "Quality 720×1280",  short: 720, long: 1280 };
const TIER_HIGH_1080:    LeonardoVideoSizeTier = { id: "highQuality", label: "High Quality 1080×1920", short: 1080, long: 1920 };
const TIER_HD_720:       LeonardoVideoSizeTier = { id: "hd",       label: "HD 720×1280",       short: 720, long: 1280 };
const TIER_HD_1072:      LeonardoVideoSizeTier = { id: "hd",       label: "HD 1072×1888",      short: 1072, long: 1888 };
const TIER_FULL_1080:    LeonardoVideoSizeTier = { id: "fullHd",   label: "Full HD 1080×1920", short: 1080, long: 1920 };
const TIER_4K_2160:      LeonardoVideoSizeTier = { id: "4k",       label: "4K 2160×3840",      short: 2160, long: 3840 };

export type LeonardoVideoModel = {
  id: string;
  slug: string;
  label: string;
  group: "Featured" | "Other";
  aspectRatios: LeonardoVideoAspect[];
  /** UI durasi. Bila `durationMode === "slider"`, ini min–max (langkah 1). */
  durations: number[];
  durationMode: "buttons" | "slider";
  sizeTiers: LeonardoVideoSizeTier[];
  /** Model memproduksi track audio (bukan opsi user, tapi karakter model). */
  audio: boolean;
  supportsI2V: boolean;
  supportsT2V: boolean;
  /** Biaya acuan (Leonardo credits) per detik pada tier default (sizeTiers[0]). */
  crPerSecond: number;
  /** Biaya sebenarnya: credits per detik per megapixel (biaya skala dengan resolusi). */
  crPerMpSecond: number;
  /** Contoh cost matrix (tier → { detik → cr }) diambil dari screenshot resmi. */
  crExamples: Array<{ tier: LeonardoVideoSizeTier["id"]; seconds: number; cr: number }>;
};

export const LEONARDO_VIDEO_MODELS: LeonardoVideoModel[] = [
  // ---------- Featured ----------
  {
    id: "leo-vid:gemini-omni-flash",
    slug: "gemini-omni-flash",
    label: "Gemini Omni Flash",
    group: "Featured",
    aspectRatios: ["16:9", "9:16"],
    durations: [1, 10],
    durationMode: "slider",
    sizeTiers: [TIER_HD_720],
    audio: false,
    supportsI2V: true,
    supportsT2V: true,
    crPerSecond: 100,
    crPerMpSecond: 108.5,
    crExamples: [{ tier: "hd", seconds: 10, cr: 1000 }],
  },
  {
    id: "leo-vid:seedance-2.0-mini",
    slug: "seedance-2.0-mini",
    label: "Seedance 2.0 Mini",
    group: "Featured",
    aspectRatios: ["16:9", "1:1", "9:16"],
    durations: [1, 15],
    durationMode: "slider",
    sizeTiers: [TIER_STANDARD_496, TIER_HD_720],
    audio: false,
    supportsI2V: true,
    supportsT2V: true,
    crPerSecond: 74.4,
    crPerMpSecond: 173.6,
    crExamples: [{ tier: "hd", seconds: 15, cr: 2400 }],
  },
  {
    id: "leo-vid:grok-imagine-1.5",
    slug: "grok-imagine-1.5",
    label: "Grok Imagine 1.5",
    group: "Featured",
    aspectRatios: ["1:1", "16:9", "9:16"],
    durations: [1, 15],
    durationMode: "slider",
    sizeTiers: [TIER_STANDARD_400, TIER_HD_720, TIER_HD_1072],
    audio: true,
    supportsI2V: true,
    supportsT2V: true,
    crPerSecond: 52.7,
    crPerMpSecond: 179.0,
    crExamples: [{ tier: "hd", seconds: 15, cr: 2475 }],
  },
  {
    id: "leo-vid:wan-2.6",
    slug: "wan-2.6",
    label: "Wan 2.6",
    group: "Featured",
    aspectRatios: ["1:1", "3:4", "4:3", "16:9", "9:16"],
    durations: [5, 10, 15],
    durationMode: "buttons",
    sizeTiers: [TIER_HD_720, TIER_FULL_1080],
    audio: true,
    supportsI2V: true,
    supportsT2V: true,
    crPerSecond: 35,
    crPerMpSecond: 37.98,
    crExamples: [{ tier: "hd", seconds: 15, cr: 525 }],
  },
  {
    id: "leo-vid:veo-3.1-lite",
    slug: "veo-3.1-lite",
    label: "Veo 3.1 Lite",
    group: "Featured",
    aspectRatios: ["16:9", "9:16"],
    durations: [4, 6, 8],
    durationMode: "buttons",
    sizeTiers: [TIER_QUALITY_720, TIER_HIGH_1080],
    audio: true,
    supportsI2V: true,
    supportsT2V: true,
    crPerSecond: 50,
    crPerMpSecond: 54.25,
    crExamples: [{ tier: "quality", seconds: 8, cr: 400 }],
  },
  {
    id: "leo-vid:veo-3.1-fast",
    slug: "veo-3.1-fast",
    label: "Veo 3.1 Fast",
    group: "Featured",
    aspectRatios: ["16:9", "9:16"],
    durations: [4, 6, 8],
    durationMode: "buttons",
    sizeTiers: [TIER_HD_720, TIER_FULL_1080, TIER_4K_2160],
    audio: true,
    supportsI2V: true,
    supportsT2V: true,
    crPerSecond: 150,
    crPerMpSecond: 162.8,
    crExamples: [{ tier: "hd", seconds: 8, cr: 1200 }],
  },
  // ---------- Other ----------
  {
    id: "leo-vid:seedance-2.0",
    slug: "seedance-2.0",
    label: "Seedance 2.0",
    group: "Other",
    aspectRatios: ["16:9", "1:1", "9:16"],
    durations: [1, 15],
    durationMode: "slider",
    sizeTiers: [TIER_STANDARD_496, TIER_HD_720, TIER_FULL_1080, TIER_4K_2160],
    audio: false,
    supportsI2V: true,
    supportsT2V: true,
    crPerSecond: 140.6,
    crPerMpSecond: 328.125,
    crExamples: [{ tier: "standard", seconds: 15, cr: 2109 }],
  },
  {
    id: "leo-vid:seedance-2.0-fast",
    slug: "seedance-2.0-fast",
    label: "Seedance 2.0 Fast",
    group: "Other",
    aspectRatios: ["16:9", "1:1", "9:16"],
    durations: [1, 15],
    durationMode: "slider",
    sizeTiers: [TIER_STANDARD_496, TIER_HD_720],
    audio: false,
    supportsI2V: true,
    supportsT2V: true,
    crPerSecond: 112.5,
    crPerMpSecond: 262.5,
    crExamples: [{ tier: "standard", seconds: 15, cr: 1687 }],
  },
  {
    id: "leo-vid:kling-o3-omni",
    slug: "kling-o3-omni",
    label: "Kling Video O3 Omni",
    group: "Other",
    aspectRatios: ["1:1", "16:9", "9:16"],
    durations: [1, 15],
    durationMode: "slider",
    sizeTiers: [TIER_HD_720, TIER_FULL_1080, TIER_4K_2160],
    audio: true,
    supportsI2V: true,
    supportsT2V: true,
    crPerSecond: 224,
    crPerMpSecond: 243.1,
    crExamples: [{ tier: "hd", seconds: 15, cr: 3360 }],
  },
  {
    id: "leo-vid:kling-2.6",
    slug: "kling-2.6",
    label: "Kling 2.6",
    group: "Other",
    aspectRatios: ["1:1", "16:9", "9:16"],
    durations: [5, 10],
    durationMode: "buttons",
    sizeTiers: [TIER_FULL_1080],
    audio: true,
    supportsI2V: true,
    supportsT2V: true,
    crPerSecond: 140,
    crPerMpSecond: 67.5,
    crExamples: [{ tier: "fullHd", seconds: 10, cr: 1400 }],
  },
];

export function getLeonardoVideoModel(idOrSlug: string): LeonardoVideoModel | null {
  const key = idOrSlug.replace(/^leo-vid:/, "");
  return LEONARDO_VIDEO_MODELS.find((m) => m.slug === key || m.id === idOrSlug) ?? null;
}

/** Estimasi biaya (Leonardo credits) untuk kombinasi tier + durasi. */
export function estimateLeonardoVideoCost(
  model: LeonardoVideoModel,
  tierId: LeonardoVideoSizeTier["id"],
  seconds: number,
): number {
  const tier = model.sizeTiers.find((t) => t.id === tierId) ?? model.sizeTiers[0];
  const megapixels = (tier.short * tier.long) / 1_000_000;
  return Math.round(model.crPerMpSecond * megapixels * seconds);
}

/** Opsi kualitas siap pakai (tier x durasi) beserta biaya persis. */
export type LeonardoVideoQualityOption = {
  value: string; // `${tierId}-${seconds}s`
  label: string; // "Standard 496x864 - 15s"
  tierId: LeonardoVideoSizeTier["id"];
  width: number;
  height: number;
  seconds: number;
  cr: number;
  audio: boolean;
};

export function leonardoVideoQualityOptions(
  idOrSlug: string,
  aspect: LeonardoVideoAspect = "9:16",
): LeonardoVideoQualityOption[] {
  const model = getLeonardoVideoModel(idOrSlug);
  if (!model) return [];
  const seconds =
    model.durationMode === "buttons"
      ? model.durations
      : Array.from(
          new Set(
            [5, 8, 10, 12, 15]
              .filter(
                (s) =>
                  s >= model.durations[0] &&
                  s <= model.durations[model.durations.length - 1],
              )
              .concat(model.durations[model.durations.length - 1]),
          ),
        ).sort((a, b) => a - b);

  const opts: LeonardoVideoQualityOption[] = [];
  for (const tier of model.sizeTiers) {
    for (const s of seconds) {
      const dims = computeDims(model.aspectRatios.includes(aspect) ? aspect : model.aspectRatios[0], tier);
      opts.push({
        value: `${tier.id}-${s}s`,
        label: `${tier.label} - ${s}s${model.audio ? " - Audio" : ""}`,
        tierId: tier.id,
        width: dims.width,
        height: dims.height,
        seconds: s,
        cr: estimateLeonardoVideoCost(model, tier.id, s),
        audio: model.audio,
      });
    }
  }
  return opts;
}

/* --------------------------------- submit --------------------------------- */

function computeDims(
  aspect: LeonardoVideoAspect,
  tier: LeonardoVideoSizeTier,
): { width: number; height: number } {
  const { short, long } = tier;
  switch (aspect) {
    case "9:16": return { width: short, height: long };
    case "16:9": return { width: long, height: short };
    case "1:1":  return { width: short, height: short };
    case "3:4":  return { width: short, height: Math.round((short * 4) / 3) };
    case "4:3":  return { width: Math.round((short * 4) / 3), height: short };
  }
}

function pickTier(
  model: LeonardoVideoModel,
  tierId: LeonardoVideoSizeTier["id"] | undefined,
): LeonardoVideoSizeTier {
  if (tierId) {
    const t = model.sizeTiers.find((s) => s.id === tierId);
    if (t) return t;
  }
  return model.sizeTiers[0];
}

/** Kompatibilitas legacy: "720p"/"1080p" → tier id. */
function legacyResToTier(res?: string): LeonardoVideoSizeTier["id"] | undefined {
  if (!res) return undefined;
  const r = res.toLowerCase();
  if (r === "480p" || r === "standard") return "standard";
  if (r === "720p" || r === "hd") return "hd";
  if (r === "1080p" || r === "fullhd" || r === "full hd") return "fullHd";
  if (r === "4k" || r === "2160p") return "4k";
  return undefined;
}

function extractGenerationId(res: unknown): string | null {
  if (!res || typeof res !== "object") return null;
  const r = res as Record<string, unknown>;
  const data = (r.data as Record<string, unknown> | undefined) ?? r;
  const gen = (data.generate as Record<string, unknown> | undefined) ?? undefined;
  const c: unknown[] = [
    gen?.generationId,
    gen?.generation_id,
    (data.motionSvdGenerationJob as Record<string, unknown> | undefined)?.generationId,
    (data.sdGenerationJob as Record<string, unknown> | undefined)?.generationId,
    data.generationId,
    data.generation_id,
    data.id,
  ];
  for (const v of c) if (typeof v === "string" && v.trim()) return v;
  return null;
}

function preview(res: unknown, limit = 400): string {
  try { return JSON.stringify(res).slice(0, limit); } catch { return String(res).slice(0, limit); }
}

export type LeonardoVideoInput = {
  slug: string;
  prompt: string;
  width: number;
  height: number;
  duration: number;
  quantity?: number;
  imagePromptId?: string;
  imageUrl?: string;
  imageBlob?: { blob: Blob; ext?: "png" | "jpg" | "jpeg" | "webp" };
};

const GENERATE_MUTATION =
  "mutation Generate($request: CreateGenerationRequest!) {\n  generate(request: $request) {\n    apiCreditCost\n    generationId\n    __typename\n  }\n}";

async function submitLeonardoVideo(
  token: string,
  input: LeonardoVideoInput,
): Promise<{ generationId: string }> {
  const promptIds: string[] = [];
  if (input.imagePromptId) promptIds.push(input.imagePromptId);
  else if (input.imageUrl) {
    const { blob, ext } = await fetchAsBlob(input.imageUrl);
    promptIds.push(await uploadLeonardoInitImage(token, blob, ext));
  } else if (input.imageBlob) {
    promptIds.push(await uploadLeonardoInitImage(token, input.imageBlob.blob, input.imageBlob.ext ?? "png"));
  }

  const qty = Math.max(1, Math.min(4, input.quantity ?? 1));
  const parameters: Record<string, unknown> = {
    height: input.height,
    width: input.width,
    duration: input.duration,
    quantity: qty,
    prompt: input.prompt,
  };
  if (promptIds.length > 0) {
    parameters.guidances = {
      image_reference: promptIds.slice(0, 4).map((id) => ({
        image: { id, type: "UPLOADED" as const },
        strength: "MID" as const,
      })),
    };
  }

  const body = {
    operationName: "Generate",
    variables: { request: { model: input.slug, public: true, parameters } },
    query: GENERATE_MUTATION,
  };

  const res = await leonardoFetch<unknown>({
    token, base: "api", path: "/v1/graphql", method: "POST", body,
  });

  if (res && typeof res === "object" && Array.isArray((res as { errors?: unknown[] }).errors)) {
    throw new Error(`Leonardo video (graphql): ${preview(res, 800)}`);
  }
  const id = extractGenerationId(res);
  if (id) return { generationId: id };
  throw new Error(`Leonardo video: tidak ada generationId. ${preview(res, 800)}`);
}

/* --------------------------------- polling -------------------------------- */

type VideoGenerationRow = {
  id: string;
  status: "PENDING" | "COMPLETE" | "FAILED";
  motionMP4URL?: string | null;
  generated_images?: Array<{
    id?: string; url?: string; motionMP4URL?: string | null; videoUrl?: string | null;
  }>;
};

function pickVideoUrl(g: VideoGenerationRow | null): string | null {
  if (!g) return null;
  if (typeof g.motionMP4URL === "string" && g.motionMP4URL.trim()) return g.motionMP4URL;
  for (const im of g.generated_images ?? []) {
    if (typeof im.motionMP4URL === "string" && im.motionMP4URL.trim()) return im.motionMP4URL;
    if (typeof im.videoUrl === "string" && im.videoUrl.trim()) return im.videoUrl;
    if (typeof im.url === "string" && /\.(mp4|webm|mov)(\?|$)/i.test(im.url)) return im.url;
  }
  const firstUrl = g.generated_images?.[0]?.url;
  return typeof firstUrl === "string" && firstUrl.trim() ? firstUrl : null;
}

async function pollVideoGeneration(token: string, id: string): Promise<VideoGenerationRow | null> {
  const res = await leonardoFetch<{ generations_by_pk?: VideoGenerationRow }>({
    token, base: "api", path: `/api/rest/v1/generations/${encodeURIComponent(id)}`, method: "GET",
  });
  return res.generations_by_pk ?? null;
}

/* --------------------------------- runner --------------------------------- */

export type RunLeonardoVideoOpts = {
  modelKey: string;
  prompt: string;
  aspectRatio: LeonardoVideoAspect;
  /** Preferensi tier baru (Standard/HD/Full HD/4K/Quality/High Quality). */
  sizeTier?: LeonardoVideoSizeTier["id"];
  /** Legacy: "720p" | "1080p" — otomatis dipetakan ke tier. */
  resolution?: string;
  duration?: number;
  quantity?: number;
  imageFile?: File | Blob;
  imageUrl?: string;
  onProgress?: (msg: string, pct?: number) => void;
  onRotate?: LeonardoRotateOpts["onRotate"];
  timeoutMs?: number;
  pollIntervalMs?: number;
};

export async function runLeonardoVideo(opts: RunLeonardoVideoOpts): Promise<string> {
  const model = getLeonardoVideoModel(opts.modelKey);
  if (!model) throw new Error(`Leonardo video: model tidak dikenal (${opts.modelKey})`);

  // Durasi: buttons → nilai persis, slider → clamp ke [min, max].
  let duration = opts.duration ?? model.durations[0];
  if (model.durationMode === "buttons") {
    if (!model.durations.includes(duration)) duration = model.durations[0];
  } else {
    const [mn, mx] = [model.durations[0], model.durations[model.durations.length - 1]];
    duration = Math.max(mn, Math.min(mx, Math.round(duration)));
  }

  const aspect: LeonardoVideoAspect = model.aspectRatios.includes(opts.aspectRatio)
    ? opts.aspectRatio
    : model.aspectRatios[0];

  const tier = pickTier(model, opts.sizeTier ?? legacyResToTier(opts.resolution));
  const { width, height } = computeDims(aspect, tier);
  const timeoutMs = opts.timeoutMs ?? 8 * 60 * 1000;
  const pollMs = opts.pollIntervalMs ?? 5000;

  const imageBlob = opts.imageFile
    ? {
        blob: opts.imageFile as Blob,
        ext: (() => {
          const t = (opts.imageFile as File).name?.toLowerCase() || "";
          if (t.endsWith(".webp")) return "webp" as const;
          if (t.endsWith(".png")) return "png" as const;
          return "jpg" as const;
        })(),
      }
    : undefined;

  return runLeonardoWithRotation(
    async (token) => {
      opts.onProgress?.(
        `Leonardo: submit ${model.label} (${tier.label} · ${duration}s · ${aspect})…`,
        15,
      );
      const { generationId } = await submitLeonardoVideo(token, {
        slug: model.slug,
        prompt: opts.prompt,
        width, height, duration,
        quantity: opts.quantity ?? 1,
        imageUrl: opts.imageUrl,
        imageBlob,
      });
      opts.onProgress?.(`Leonardo: generation ${generationId.slice(0, 8)}… rendering`, 30);

      const started = Date.now();
      let lastStatus = "";
      while (Date.now() - started < timeoutMs) {
        await new Promise((r) => setTimeout(r, pollMs));
        const g = await pollVideoGeneration(token, generationId);
        if (!g) continue;
        if (g.status !== lastStatus) {
          lastStatus = g.status;
          opts.onProgress?.(`Leonardo: ${g.status}`, g.status === "COMPLETE" ? 95 : 50);
        }
        if (g.status === "COMPLETE") {
          const url = pickVideoUrl(g);
          if (!url) throw new Error(`Leonardo video: status COMPLETE tapi URL tidak ditemukan. ${preview(g, 400)}`);
          opts.onProgress?.(`Leonardo: selesai`, 100);
          return url;
        }
        if (g.status === "FAILED") throw new Error("Leonardo video: generation FAILED");
        const el = Math.round((Date.now() - started) / 1000);
        opts.onProgress?.(`Leonardo: rendering… (${el}s)`, Math.min(90, 30 + el));
      }
      throw new Error("Leonardo video: timeout");
    },
    { onRotate: opts.onRotate },
  );
}
