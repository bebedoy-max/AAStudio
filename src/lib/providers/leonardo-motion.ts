// Leonardo.ai Motion Control runner — konsep sama dengan Framia:
// user memberi 1 gambar karakter + 1 video referensi gerakan, lalu provider
// merender video baru. Leonardo tidak menerima upload video sebagai driving
// input, jadi video referensi dipakai untuk:
//   - menentukan durasi render (dibulatkan ke opsi durasi model)
//   - menentukan aspect ratio output
// sedangkan gambar karakter dikirim sebagai image reference ke model video
// Leonardo yang sudah berjalan (runLeonardoVideo).

import {
  getLeonardoVideoModel,
  leonardoVideoQualityOptions,
  runLeonardoVideo,
  type LeonardoVideoAspect,
  type LeonardoVideoSizeTier,
} from "./leonardo-video";
import type { LeonardoRotateOpts } from "./leonardo";

/** Model Leonardo yang tersedia di menu Motion Control (urutan = UI Leonardo). */
export const LEONARDO_MOTION_MODELS = [
  "leo-vid:seedance-2.0",
  "leo-vid:seedance-2.0-fast",
  "leo-vid:seedance-2.0-mini",
  "leo-vid:wan-2.7",
  "leo-vid:kling-o3-omni",
  "leo-vid:kling-o1",
] as const;

/** Prompt motion control default (sejalan dengan konsep Framia). */
export const LEONARDO_MOTION_PROMPT =
  "Animate the character in the reference image following the movements, camera motion and facial expressions of the reference video, keeping the original background and identity unchanged.";

export function leonardoMotionModelOptions(): Array<{ key: string; label: string; cr: number }> {
  return LEONARDO_MOTION_MODELS.flatMap((id) => {
    const m = getLeonardoVideoModel(id);
    if (!m) return [];
    const opts = leonardoVideoQualityOptions(id, "9:16");
    const cheapest = opts.length ? Math.min(...opts.map((o) => o.cr)) : 0;
    return [{ key: id, label: `${m.label} (Leonardo)`, cr: cheapest }];
  });
}

/** Opsi kualitas (tier resolusi × durasi) untuk model + aspect terpilih. */
export function leonardoMotionQualityOptions(modelKey: string, aspect: LeonardoVideoAspect) {
  return leonardoVideoQualityOptions(modelKey, aspect);
}

/** Aspect ratio yang didukung model. */
export function leonardoMotionAspects(modelKey: string): LeonardoVideoAspect[] {
  return getLeonardoVideoModel(modelKey)?.aspectRatios ?? ["9:16"];
}

/* ------------------------------ video probing ------------------------------ */

const ASPECTS: Array<{ label: LeonardoVideoAspect; value: number }> = [
  { label: "9:16", value: 9 / 16 },
  { label: "3:4", value: 3 / 4 },
  { label: "1:1", value: 1 },
  { label: "4:3", value: 4 / 3 },
  { label: "16:9", value: 16 / 9 },
];

function nearestAspect(w: number, h: number): LeonardoVideoAspect {
  if (!w || !h) return "9:16";
  const r = w / h;
  let best = ASPECTS[0]!;
  for (const a of ASPECTS) if (Math.abs(a.value - r) < Math.abs(best.value - r)) best = a;
  return best.label;
}

export async function probeMotionVideoMeta(
  file: Blob,
): Promise<{ duration: number; aspect: LeonardoVideoAspect }> {
  const fallback = { duration: 5, aspect: "9:16" as LeonardoVideoAspect };
  if (typeof document === "undefined" || typeof URL === "undefined") return fallback;
  const url = URL.createObjectURL(file);
  try {
    return await new Promise((resolve) => {
      const el = document.createElement("video");
      el.preload = "metadata";
      el.muted = true;
      const done = (meta: { duration: number; aspect: LeonardoVideoAspect }) => {
        el.removeAttribute("src");
        resolve(meta);
      };
      const timer = setTimeout(() => done(fallback), 10_000);
      el.onloadedmetadata = () => {
        clearTimeout(timer);
        const d = Number.isFinite(el.duration) && el.duration > 0 ? el.duration : fallback.duration;
        done({ duration: d, aspect: nearestAspect(el.videoWidth, el.videoHeight) });
      };
      el.onerror = () => {
        clearTimeout(timer);
        done(fallback);
      };
      el.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

/* ---------------------------------- run ----------------------------------- */

export type LeonardoMotionOpts = {
  modelKey: string;
  imageFile: File | Blob;
  videoFile: File | Blob;
  /** Aspect pilihan user; "auto" = ikut video referensi. */
  aspect?: LeonardoVideoAspect | "auto";
  sizeTier?: LeonardoVideoSizeTier["id"];
  /** Durasi pilihan user; kosong = ikut durasi video referensi. */
  duration?: number;
  prompt?: string;
  onProgress?: (msg: string, pct?: number) => void;
  onRotate?: LeonardoRotateOpts["onRotate"];
};

export async function runLeonardoMotion(opts: LeonardoMotionOpts): Promise<string> {
  const model = getLeonardoVideoModel(opts.modelKey);
  if (!model) throw new Error(`Leonardo Motion: model tidak dikenal (${opts.modelKey})`);

  opts.onProgress?.("Leonardo: membaca video referensi…", 5);
  const meta = await probeMotionVideoMeta(opts.videoFile);

  const aspect: LeonardoVideoAspect =
    !opts.aspect || opts.aspect === "auto" ? meta.aspect : opts.aspect;

  // Durasi: kalau user tidak memilih, ikut durasi video referensi (dibulatkan
  // ke opsi terdekat yang didukung model).
  let duration = opts.duration ?? Math.round(meta.duration);
  if (model.durationMode === "buttons") {
    duration = model.durations.reduce(
      (best, d) => (Math.abs(d - duration) < Math.abs(best - duration) ? d : best),
      model.durations[0],
    );
  } else {
    const mn = model.durations[0];
    const mx = model.durations[model.durations.length - 1];
    duration = Math.max(mn, Math.min(mx, Math.round(duration)));
  }

  const prompt = [LEONARDO_MOTION_PROMPT, opts.prompt?.trim()].filter(Boolean).join(" ");

  opts.onProgress?.(
    `Leonardo: ${model.label} · ${duration}s · ${aspect} (referensi ${meta.duration.toFixed(1)}s)`,
    10,
  );

  return runLeonardoVideo({
    modelKey: opts.modelKey,
    prompt,
    aspectRatio: aspect,
    sizeTier: opts.sizeTier,
    duration,
    imageFile: opts.imageFile,
    onProgress: opts.onProgress,
    onRotate: opts.onRotate,
  });
}
