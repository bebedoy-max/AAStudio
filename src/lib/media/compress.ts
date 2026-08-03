// Client-side media compression (khusus dipakai Motion Control · Roboneo).
// Gambar  : Canvas re-encode (JPEG/WebP) + downscale bertahap — tanpa dependensi.
// Video   : FFmpeg WASM (@ffmpeg/ffmpeg) — H.264 CRF/scale bertahap sampai muat.

import { fetchFile } from "@ffmpeg/util";
import { getFfmpeg } from "@/lib/mixing/ffmpeg-render";

export const ROBONEO_MAX_BYTES = 4 * 1024 * 1024; // 4 MB

export function fmtMB(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(mb >= 10 ? 0 : 1)} MB`;
}

type Progress = (msg: string, pct?: number) => void;

function renameKeepingBase(name: string, ext: string): string {
  const base = name.replace(/\.[^./\\]+$/, "") || "file";
  return `${base}.${ext}`;
}

async function loadImageBitmap(
  file: File,
): Promise<{ width: number; height: number; draw: CanvasImageSource; cleanup: () => void }> {
  if (typeof createImageBitmap === "function") {
    const bmp = await createImageBitmap(file);
    return { width: bmp.width, height: bmp.height, draw: bmp, cleanup: () => bmp.close?.() };
  }
  const url = URL.createObjectURL(file);
  const img = new Image();
  await new Promise<void>((res, rej) => {
    img.onload = () => res();
    img.onerror = () => rej(new Error("Gagal membaca gambar"));
    img.src = url;
  });
  return {
    width: img.naturalWidth,
    height: img.naturalHeight,
    draw: img,
    cleanup: () => URL.revokeObjectURL(url),
  };
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Gagal encode gambar"))),
      type,
      quality,
    ),
  );
}

export async function compressImageFile(
  file: File,
  maxBytes = ROBONEO_MAX_BYTES,
  onProgress?: Progress,
): Promise<File> {
  if (file.size <= maxBytes) return file;
  const { width, height, draw, cleanup } = await loadImageBitmap(file);
  try {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D tidak tersedia");

    let scale = Math.min(1, 2560 / Math.max(width, height));
    for (let pass = 0; pass < 8; pass++) {
      const w = Math.max(320, Math.round(width * scale));
      const h = Math.max(320, Math.round(height * scale));
      canvas.width = w;
      canvas.height = h;
      ctx.clearRect(0, 0, w, h);
      ctx.drawImage(draw, 0, 0, w, h);
      for (const q of [0.9, 0.8, 0.7, 0.6]) {
        onProgress?.(`Kompres gambar ${w}×${h} q=${q}`);
        const blob = await canvasToBlob(canvas, "image/jpeg", q);
        if (blob.size <= maxBytes) {
          return new File([blob], renameKeepingBase(file.name, "jpg"), { type: "image/jpeg" });
        }
      }
      scale *= 0.75;
    }
    throw new Error("Gambar tetap di atas batas setelah kompresi maksimum");
  } finally {
    cleanup();
  }
}

export async function compressVideoFile(
  file: File,
  maxBytes = ROBONEO_MAX_BYTES,
  onProgress?: Progress,
): Promise<File> {
  if (file.size <= maxBytes) return file;
  onProgress?.("Memuat encoder FFmpeg…");
  const ff = await getFfmpeg();
  const inName = `in_${Date.now()}.${(file.name.split(".").pop() || "mp4").toLowerCase()}`;
  await ff.writeFile(inName, await fetchFile(file));

  const attempts = [
    { crf: 28, height: 720, audio: "96k" },
    { crf: 30, height: 640, audio: "80k" },
    { crf: 32, height: 540, audio: "64k" },
    { crf: 34, height: 480, audio: "64k" },
    { crf: 36, height: 360, audio: "48k" },
  ];

  try {
    for (let i = 0; i < attempts.length; i++) {
      const a = attempts[i];
      const outName = `out_${i}.mp4`;
      onProgress?.(
        `Kompres video (pass ${i + 1}/${attempts.length}, ${a.height}p)…`,
        Math.round((i / attempts.length) * 100),
      );
      await ff.exec([
        "-i",
        inName,
        "-vf",
        `scale=-2:'min(${a.height},ih)'`,
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        String(a.crf),
        "-pix_fmt",
        "yuv420p",
        "-movflags",
        "+faststart",
        "-c:a",
        "aac",
        "-b:a",
        a.audio,
        outName,
      ]);
      const data = (await ff.readFile(outName)) as Uint8Array;
      await ff.deleteFile(outName).catch(() => {});
      const bytes = data.byteLength;
      if (bytes <= maxBytes) {
        onProgress?.(`Selesai — ${fmtMB(bytes)}`, 100);
        const buf = new ArrayBuffer(bytes);
        new Uint8Array(buf).set(data);
        return new File([buf], renameKeepingBase(file.name, "mp4"), { type: "video/mp4" });
      }
    }
    throw new Error(
      "Video tetap di atas 4MB setelah kompresi maksimum. Potong durasinya lalu upload ulang.",
    );
  } finally {
    await ff.deleteFile(inName).catch(() => {});
  }
}

export async function compressMediaFile(
  file: File,
  kind: "image" | "video",
  maxBytes = ROBONEO_MAX_BYTES,
  onProgress?: Progress,
): Promise<File> {
  return kind === "image"
    ? compressImageFile(file, maxBytes, onProgress)
    : compressVideoFile(file, maxBytes, onProgress);
}
