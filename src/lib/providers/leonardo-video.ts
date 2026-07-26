// Leonardo.ai Video generator (I2V + T2V) — reverse-engineered from
// app.leonardo.ai tab Video. Reuses the same JWT + proxy plumbing as
// leonardo.ts (image generation).
//
// Endpoint: POST /api/rest/v2/generations (sama seperti image, model
// discriminator = slug). Parameters mengikuti pola yang muncul di URL
// ?model=<slug>&aspectRatio=9:16&size=RESOLUTION_720&duration=10&quantity=1
// Kalau schema per-model beda, kita coba beberapa varian body.
//
// Polling: GET /api/rest/v1/generations/{id} — ambil URL video dari
// generated_images[].url (Leonardo memakai key yang sama untuk motion)
// atau field motionMP4URL sebagai fallback.

import {
  leonardoFetch,
  runLeonardoWithRotation,
  uploadLeonardoInitImage,
  fetchAsBlob,
  type LeonardoRotateOpts,
} from "./leonardo";

/* --------------------------------- catalog -------------------------------- */

export type LeonardoVideoModel = {
  id: string;
  slug: string;
  label: string;
  group: "Featured" | "Other";
  durations: number[]; // detik
  resolutions: Array<"720p" | "1080p">;
  audio: boolean; // support audio track
  supportsI2V: boolean;
  supportsT2V: boolean;
  crPer5s: number; // biaya referensi
};

export const LEONARDO_VIDEO_MODELS: LeonardoVideoModel[] = [
  // Featured (Video tab)
  {
    id: "leo-vid:gemini-omni-flash",
    slug: "gemini-omni-flash",
    label: "Gemini Omni Flash",
    group: "Featured",
    durations: [5, 10],
    resolutions: ["720p"],
    audio: false,
    supportsI2V: true,
    supportsT2V: true,
    crPer5s: 25,
  },
  {
    id: "leo-vid:seedance-2.0-mini",
    slug: "seedance-2.0-mini",
    label: "Seedance 2.0 Mini",
    group: "Featured",
    durations: [5, 10],
    resolutions: ["720p"],
    audio: false,
    supportsI2V: true,
    supportsT2V: true,
    crPer5s: 20,
  },
  {
    id: "leo-vid:grok-imagine-1.5",
    slug: "grok-imagine-1.5",
    label: "Grok Imagine 1.5",
    group: "Featured",
    durations: [5, 8],
    resolutions: ["720p"],
    audio: true,
    supportsI2V: true,
    supportsT2V: false,
    crPer5s: 40,
  },
  {
    id: "leo-vid:wan-2.6",
    slug: "wan-2.6",
    label: "Wan 2.6",
    group: "Featured",
    durations: [5, 10],
    resolutions: ["720p", "1080p"],
    audio: true,
    supportsI2V: true,
    supportsT2V: true,
    crPer5s: 30,
  },
  {
    id: "leo-vid:veo-3.1-lite",
    slug: "veo-3.1-lite",
    label: "Veo 3.1 Lite",
    group: "Featured",
    durations: [4, 6, 8],
    resolutions: ["720p", "1080p"],
    audio: true,
    supportsI2V: true,
    supportsT2V: true,
    crPer5s: 45,
  },
  {
    id: "leo-vid:veo-3.1-fast",
    slug: "veo-3.1-fast",
    label: "Veo 3.1 Fast",
    group: "Featured",
    durations: [4, 6, 8],
    resolutions: ["720p", "1080p"],
    audio: true,
    supportsI2V: true,
    supportsT2V: true,
    crPer5s: 65,
  },
  // Other
  {
    id: "leo-vid:seedance-2.0",
    slug: "seedance-2.0",
    label: "Seedance 2.0",
    group: "Other",
    durations: [5, 10],
    resolutions: ["720p", "1080p"],
    audio: false,
    supportsI2V: true,
    supportsT2V: true,
    crPer5s: 45,
  },
  {
    id: "leo-vid:seedance-2.0-fast",
    slug: "seedance-2.0-fast",
    label: "Seedance 2.0 Fast",
    group: "Other",
    durations: [5, 10],
    resolutions: ["720p"],
    audio: false,
    supportsI2V: true,
    supportsT2V: true,
    crPer5s: 30,
  },
  {
    id: "leo-vid:kling-o3-omni",
    slug: "kling-o3-omni",
    label: "Kling Video O3 Omni",
    group: "Other",
    durations: [5, 10],
    resolutions: ["720p", "1080p"],
    audio: true,
    supportsI2V: true,
    supportsT2V: true,
    crPer5s: 55,
  },
  {
    id: "leo-vid:kling-2.6",
    slug: "kling-2.6",
    label: "Kling 2.6",
    group: "Other",
    durations: [5, 10],
    resolutions: ["720p"],
    audio: true,
    supportsI2V: true,
    supportsT2V: true,
    crPer5s: 40,
  },
];

export function getLeonardoVideoModel(idOrSlug: string): LeonardoVideoModel | null {
  const key = idOrSlug.replace(/^leo-vid:/, "");
  return LEONARDO_VIDEO_MODELS.find((m) => m.slug === key || m.id === idOrSlug) ?? null;
}

/* --------------------------------- submit --------------------------------- */

function dimsFor(aspect: "16:9" | "9:16" | "1:1", res: "720p" | "1080p"): { width: number; height: number } {
  const short = res === "1080p" ? 1080 : 720;
  const long = res === "1080p" ? 1920 : 1280;
  if (aspect === "9:16") return { width: short, height: long };
  if (aspect === "16:9") return { width: long, height: short };
  return { width: short, height: short };
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
  try {
    return JSON.stringify(res).slice(0, limit);
  } catch {
    return String(res).slice(0, limit);
  }
}

export type LeonardoVideoInput = {
  slug: string;
  prompt: string;
  aspectRatio: "16:9" | "9:16" | "1:1";
  resolution: "720p" | "1080p";
  duration: number;
  audio?: boolean;
  quantity?: number;
  /** Init-image id (dari uploadLeonardoInitImage) untuk I2V. */
  imagePromptId?: string;
  /** Optional URL/blob referensi — di-upload otomatis kalau imagePromptId belum ada. */
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
    promptIds.push(
      await uploadLeonardoInitImage(token, input.imageBlob.blob, input.imageBlob.ext ?? "png"),
    );
  }

  const { width, height } = dimsFor(input.aspectRatio, input.resolution);
  const qty = Math.max(1, Math.min(4, input.quantity ?? 1));

  const parameters: Record<string, unknown> = {
    height,
    width,
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
  if (input.audio !== undefined) parameters.audio = input.audio;

  const body = {
    operationName: "Generate",
    variables: {
      request: {
        model: input.slug,
        public: true,
        parameters,
      },
    },
    query: GENERATE_MUTATION,
  };

  const res = await leonardoFetch<unknown>({
    token,
    base: "api",
    path: "/v1/graphql",
    method: "POST",
    body,
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
    id?: string;
    url?: string;
    motionMP4URL?: string | null;
    videoUrl?: string | null;
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
  // Fallback: kalau url image ada tapi bukan mp4, tetap kembalikan (bisa jadi presigned proxy).
  const firstUrl = g.generated_images?.[0]?.url;
  return typeof firstUrl === "string" && firstUrl.trim() ? firstUrl : null;
}

async function pollVideoGeneration(token: string, id: string): Promise<VideoGenerationRow | null> {
  const res = await leonardoFetch<{ generations_by_pk?: VideoGenerationRow }>({
    token,
    base: "api",
    path: `/api/rest/v1/generations/${encodeURIComponent(id)}`,
    method: "GET",
  });
  return res.generations_by_pk ?? null;
}

/* --------------------------------- runner --------------------------------- */

export type RunLeonardoVideoOpts = {
  modelKey: string; // "leo-vid:<slug>" atau slug telanjang
  prompt: string;
  aspectRatio: "16:9" | "9:16" | "1:1";
  resolution?: "720p" | "1080p";
  duration?: number;
  audio?: boolean;
  quantity?: number;
  /** I2V: file gambar sumber (opsional untuk T2V). */
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

  const duration =
    opts.duration && model.durations.includes(opts.duration)
      ? opts.duration
      : model.durations[0];
  const resolution =
    opts.resolution && model.resolutions.includes(opts.resolution)
      ? opts.resolution
      : model.resolutions[0];
  const audio = model.audio ? (opts.audio ?? true) : false;
  const timeoutMs = opts.timeoutMs ?? 8 * 60 * 1000;
  const pollMs = opts.pollIntervalMs ?? 5000;

  const imageBlob =
    opts.imageFile
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
      opts.onProgress?.(`Leonardo: submit ${model.label} (${resolution} · ${duration}s)…`, 15);
      const { generationId } = await submitLeonardoVideo(token, {
        slug: model.slug,
        prompt: opts.prompt,
        aspectRatio: opts.aspectRatio,
        resolution,
        duration,
        audio,
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
          if (!url)
            throw new Error(
              `Leonardo video: status COMPLETE tapi URL tidak ditemukan. ${preview(g, 400)}`,
            );
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
