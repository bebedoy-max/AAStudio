// Client-side FFmpeg WASM render — default engine for Clipper & Dubbing.
// Cuts timeline clips from the source video, optionally burns subtitles,
// concatenates them, and returns a downloadable MP4 Blob URL.
//
// Runs in browser via wasm; recommended for videos ≤ FFMPEG_MAX_BYTES.
//
// Load ffmpeg core through the same-origin CDN proxy. The ESM core is required
// for modern browser workers; the UMD core fails to import inside the worker in
// Chromium with @ffmpeg/ffmpeg 0.12.x.

import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile } from "@ffmpeg/util";
import type { Timeline } from "./types";

// Absolute browser memory cap for the WASM build. Above this size, users are
// nudged to Shotstack/Creatomate. Chosen conservatively (~400 MB) — the
// 32-bit WASM linear memory tops out at ~2 GB with lots of overhead.
export const FFMPEG_MAX_BYTES = 400 * 1024 * 1024; // 400 MB

let _ffmpeg: FFmpeg | null = null;
let _loading: Promise<FFmpeg> | null = null;

const CORE_VER = "0.12.6";
const CDN = "/api/public/ffmpeg-cdn";
const MAX_LOG_LINES = 80;

async function toBlobUrl(url: string, type: string): Promise<string> {
  const r = await fetch(url);
  const b = await r.blob();
  return URL.createObjectURL(new Blob([await b.arrayBuffer()], { type }));
}

export async function getFfmpeg(onLog?: (msg: string) => void): Promise<FFmpeg> {
  if (_ffmpeg) {
    if (onLog) _ffmpeg.on("log", ({ message }) => onLog(message));
    return _ffmpeg;
  }
  if (_loading) return _loading;
  _loading = (async () => {
    const ff = new FFmpeg();
    if (onLog) ff.on("log", ({ message }) => onLog(message));
    const [coreURL, wasmURL] = await Promise.all([
      toBlobUrl(`${CDN}?f=esm-core-js&v=${CORE_VER}&pkg=core`, "text/javascript"),
      toBlobUrl(`${CDN}?f=esm-core-wasm&v=${CORE_VER}&pkg=core`, "application/wasm"),
    ]);
    await ff.load({ coreURL, wasmURL });
    _ffmpeg = ff;
    return ff;
  })();
  return _loading;
}

function esc(s: string) {
  return s.replace(/'/g, "\\'").replace(/:/g, "\\:").replace(/,/g, "\\,");
}

export type FfmpegRenderOptions = {
  sourceUrl: string; // blob: or http url of the source video
  clips: { startSec: number; endSec: number }[]; // clip cuts
  srt?: string;
  aspectRatio?: string; // "9:16" | "16:9" | "1:1"
  onLog?: (msg: string) => void;
  onProgress?: (pct: number) => void;
};

export type FfmpegRenderResult = {
  url: string; // object URL
  filename: string;
  sizeBytes: number;
};

const ASPECT_SCALE: Record<string, string> = {
  "9:16": "scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280",
  "16:9": "scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720",
  "1:1": "scale=720:720:force_original_aspect_ratio=increase,crop=720:720",
  "4:5": "scale=720:900:force_original_aspect_ratio=increase,crop=720:900",
};

async function execOrThrow(ff: FFmpeg, args: string[], label: string, logs: string[]): Promise<void> {
  const ret = await ff.exec(args);
  if (ret !== 0) {
    const tail = logs
      .slice(-20)
      .filter(Boolean)
      .join("\n");
    throw new Error(`${label} gagal (FFmpeg exit ${ret})${tail ? `\n${tail}` : ""}`);
  }
}

/** Cut clips → optional subtitle burn-in → concat → mp4 blob URL. */
export async function ffmpegRenderClips(opts: FfmpegRenderOptions): Promise<FfmpegRenderResult> {
  const logLines: string[] = [];
  const log = (msg: string) => {
    logLines.push(msg);
    if (logLines.length > MAX_LOG_LINES) logLines.shift();
    opts.onLog?.(msg);
  };
  const progress = opts.onProgress ?? (() => {});
  const ff = await getFfmpeg(log);

  ff.on("progress", ({ progress: p }) => progress(Math.max(0, Math.min(100, Math.round(p * 100)))));

  log("Fetching source video…");
  await ff.writeFile("src.mp4", await fetchFile(opts.sourceUrl));

  if (opts.srt && opts.srt.trim()) {
    await ff.writeFile("subs.srt", new TextEncoder().encode(opts.srt));
  }

  const scaleVf = ASPECT_SCALE[opts.aspectRatio ?? "9:16"] ?? ASPECT_SCALE["9:16"];
  const parts: string[] = [];
  const clips = opts.clips.length ? opts.clips : [{ startSec: 0, endSec: 0 }];

  for (let i = 0; i < clips.length; i++) {
    const c = clips[i];
    const out = `clip_${i}.mp4`;
    const dur = Math.max(0, (c.endSec || 0) - (c.startSec || 0));
    const args = ["-ss", String(c.startSec || 0)];
    if (dur > 0) args.push("-t", String(dur));
    args.push("-i", "src.mp4");
    // subtitle burn is filter — combined with scale
    const vf = opts.srt
      ? `${scaleVf},subtitles=subs.srt:force_style='FontSize=20,PrimaryColour=&H00FFFFFF&,OutlineColour=&H80000000&,BorderStyle=3,Outline=1,Shadow=0,MarginV=40'`
      : scaleVf;
    args.push("-vf", vf, "-c:v", "libx264", "-preset", "ultrafast", "-crf", "28", "-c:a", "aac", "-b:a", "96k", "-movflags", "+faststart", "-y", out);
    log(`Rendering clip ${i + 1}/${clips.length}…`);
    await execOrThrow(ff, args, `Render clip ${i + 1}`, logLines);
    parts.push(out);
  }

  let finalName = "render.mp4";
  if (parts.length === 1) {
    finalName = parts[0];
  } else {
    const listTxt = parts.map((p) => `file '${esc(p)}'`).join("\n");
    await ff.writeFile("list.txt", new TextEncoder().encode(listTxt));
    log("Concatenating clips…");
    await execOrThrow(ff, ["-f", "concat", "-safe", "0", "-i", "list.txt", "-c", "copy", "-movflags", "+faststart", "-y", "render.mp4"], "Concat clips", logLines);
    finalName = "render.mp4";
  }

  const data = (await ff.readFile(finalName)) as Uint8Array;
  const blob = new Blob([data.buffer as ArrayBuffer], { type: "video/mp4" });
  const url = URL.createObjectURL(blob);

  // Cleanup FS
  try {
    for (const p of parts) await ff.deleteFile(p);
    if (parts.length > 1) await ff.deleteFile("list.txt");
    if (opts.srt) await ff.deleteFile("subs.srt");
    await ff.deleteFile("src.mp4");
    if (parts.length > 1) await ff.deleteFile("render.mp4");
  } catch {
    // best-effort cleanup
  }

  return { url, filename: `render-${Date.now()}.mp4`, sizeBytes: blob.size };
}

/** Convert a Timeline structure into simple clip ranges. */
export function timelineToClipRanges(timeline: Timeline | null | undefined): { startSec: number; endSec: number }[] {
  if (!timeline) return [];
  const clips: { startSec: number; endSec: number }[] = [];
  for (const t of timeline.tracks ?? []) {
    if (t.kind === "clip") {
      clips.push({ startSec: t.sourceIn, endSec: t.sourceOut });
    } else if ((t as { kind?: string }).kind === "video") {
      const items = (t as { items?: Array<{ startSec: number; endSec: number }> }).items ?? [];
      for (const it of items) clips.push({ startSec: it.startSec, endSec: it.endSec });
    }
  }
  if (clips.length === 0 && timeline.totalSec > 0) {
    clips.push({ startSec: 0, endSec: timeline.totalSec });
  }
  return clips;
}
