// Render engine — orchestrates the final render call.
// Two engines:
//   • ffmpeg   (default, in-browser via WASM — free, best for ≤ FFMPEG_MAX_BYTES)
//   • cloud    (Shotstack / Creatomate — forwarded to /api/router/render-cloud)
//
// For projects above FFMPEG_MAX_BYTES, the client MUST switch to a cloud
// provider. Legacy /api/router/render remains for planner/wavespeed/weavy
// bundles but is no longer the primary path.

import type { Timeline, VideoSource, DubbingProject, ClipperProject } from "./types";
import { headersForRender, cloudRenderStatus, type CloudRenderProvider } from "./providers";
import { ffmpegRenderClips, timelineToClipRanges, FFMPEG_MAX_BYTES } from "./ffmpeg-render";
import { toSrt } from "./subtitle-engine";

export type RenderEngine = "ffmpeg" | "shotstack" | "creatomate";

export type RenderPayload = {
  kind: "clipper" | "dubbing";
  sources: Pick<VideoSource, "id" | "name" | "url">[];
  timeline: Timeline;
  subtitle?: { srt?: string; style?: string; enabled: boolean };
  audio?: { music?: string; sfx?: string[]; voiceUrl?: string };
  aspectRatio: string;
  options?: Record<string, unknown>;
};

export type RenderResponse = {
  ok: boolean;
  provider?: string;
  engine?: RenderEngine;
  jobId?: string;
  url?: string;
  status?: "queued" | "rendering" | "done" | "error";
  message?: string;
  sizeBytes?: number;
};

export { FFMPEG_MAX_BYTES } from "./ffmpeg-render";

export type SizeCheck = {
  bytes: number;
  overLimit: boolean;
  limit: number;
  humanBytes: string;
  humanLimit: string;
};

export function fmtBytes(n: number): string {
  if (!n || n <= 0) return "0 B";
  const u = ["B", "KB", "MB", "GB"];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < u.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${u[i]}`;
}

export function checkSourceSize(bytes: number): SizeCheck {
  return {
    bytes,
    overLimit: bytes > FFMPEG_MAX_BYTES,
    limit: FFMPEG_MAX_BYTES,
    humanBytes: fmtBytes(bytes),
    humanLimit: fmtBytes(FFMPEG_MAX_BYTES),
  };
}

async function runFfmpeg(
  payload: RenderPayload,
  onLog?: (msg: string) => void,
  onProgress?: (pct: number) => void,
): Promise<RenderResponse> {
  const src = payload.sources[0];
  if (!src?.url) return { ok: false, engine: "ffmpeg", message: "Source video URL kosong" };
  const clips = payload.kind === "clipper"
    ? timelineToClipRanges(payload.timeline)
    : [{ startSec: 0, endSec: payload.timeline.totalSec || 0 }];
  try {
    const out = await ffmpegRenderClips({
      sourceUrl: src.url,
      clips,
      srt: payload.subtitle?.enabled ? payload.subtitle.srt : undefined,
      aspectRatio: payload.aspectRatio,
      onLog,
      onProgress,
    });
    return {
      ok: true,
      engine: "ffmpeg",
      provider: "ffmpeg-wasm",
      status: "done",
      url: out.url,
      sizeBytes: out.sizeBytes,
      message: `Render selesai · ${fmtBytes(out.sizeBytes)}`,
    };
  } catch (e) {
    return { ok: false, engine: "ffmpeg", message: (e as Error).message || "FFmpeg render failed" };
  }
}

async function runCloud(payload: RenderPayload, provider: CloudRenderProvider): Promise<RenderResponse> {
  const status = cloudRenderStatus();
  if (!status[provider].available) {
    return {
      ok: false,
      engine: provider,
      message: `Key ${provider === "shotstack" ? "Shotstack" : "Creatomate"} belum diisi di Token Manager → Render.`,
    };
  }
  const res = await fetch("/api/router/render-cloud", {
    method: "POST",
    headers: headersForRender(),
    body: JSON.stringify({ ...payload, provider }),
  });
  const data = (await res.json().catch(() => ({}))) as RenderResponse;
  if (!res.ok) return { ok: false, engine: provider, message: data?.message || `render failed (${res.status})` };
  return { ...data, ok: true, engine: provider };
}

export async function submitRender(
  payload: RenderPayload,
  opts: {
    engine?: RenderEngine;
    sourceBytes?: number;
    onLog?: (msg: string) => void;
    onProgress?: (pct: number) => void;
  } = {},
): Promise<RenderResponse> {
  const engine: RenderEngine = opts.engine ?? "ffmpeg";
  if (engine === "ffmpeg") {
    if (opts.sourceBytes && opts.sourceBytes > FFMPEG_MAX_BYTES) {
      return {
        ok: false,
        engine: "ffmpeg",
        message: `Video ${fmtBytes(opts.sourceBytes)} melebihi limit FFmpeg browser (${fmtBytes(FFMPEG_MAX_BYTES)}). Pilih Shotstack atau Creatomate di dropdown Render.`,
      };
    }
    return runFfmpeg(payload, opts.onLog, opts.onProgress);
  }
  return runCloud(payload, engine);
}

export function buildClipperPayload(p: ClipperProject): RenderPayload {
  return {
    kind: "clipper",
    sources: p.sources.map((s) => ({ id: s.id, name: s.name, url: s.url })),
    timeline: p.timeline ?? { totalSec: 0, aspectRatio: p.settings.aspectRatio, tracks: [] },
    subtitle: {
      enabled: p.settings.subtitle,
      srt: p.analysis ? toSrt(p.analysis.transcript) : undefined,
      style: p.settings.subtitleStyle,
    },
    audio: { music: p.settings.music, sfx: p.settings.sfx },
    aspectRatio: p.settings.aspectRatio,
  };
}

export function buildDubbingPayload(p: DubbingProject): RenderPayload {
  return {
    kind: "dubbing",
    sources: p.sources.map((s) => ({ id: s.id, name: s.name, url: s.url })),
    timeline: p.timeline ?? {
      totalSec: p.sources[0]?.durationSec ?? 0,
      aspectRatio: p.settings.aspectRatio,
      tracks: [],
    },
    subtitle: {
      enabled: p.settings.subtitle !== "off",
      srt: p.subtitleSrt,
      style: p.settings.subtitle,
    },
    audio: { voiceUrl: p.voiceUrl },
    aspectRatio: p.settings.aspectRatio,
    options: {
      preserve: p.settings.preserveOriginalVideo,
      reframe: p.settings.reframe,
      motion: p.settings.motionEnhancement,
      color: p.settings.colorEnhancement,
      sharpen: p.settings.sharpen,
      upscale: p.settings.upscale,
      denoise: p.settings.noiseReduction,
      lipSync: p.settings.lipSync,
      targetLanguage: p.settings.targetLanguage,
      voice: p.settings.voice,
    },
  };
}
