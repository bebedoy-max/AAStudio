// Reff EDIT — video renderer via FFmpeg WASM, dipandu Reference DNA + Blueprint.
// Menerjemahkan directive AI (colorGrading, mood, speedRamp, cameraMovement, dst.)
// menjadi rangkaian filter FFmpeg lalu memotong target video per-scene,
// menerapkan look, dan concat menjadi MP4 akhir.

import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile } from "@ffmpeg/util";
import { getFfmpeg } from "@/lib/mixing/ffmpeg-render";
import type { BlueprintScene, ReferenceDNA } from "./store";

async function readSourceBytes(file: File | Blob | null, url: string): Promise<Uint8Array> {
  // Beberapa strategi dicoba berurutan — File.arrayBuffer() bisa gagal dengan
  // NotReadableError untuk file besar / referensi lama; fetch() blob URL kadang
  // gagal "Failed to fetch" di Chromium. Kita coba semua sebelum menyerah.
  const errors: string[] = [];
  const tryDirect = async (b: Blob): Promise<Uint8Array> => {
    const buf = await b.arrayBuffer();
    return new Uint8Array(buf);
  };
  const tryStream = async (b: Blob): Promise<Uint8Array> => {
    const reader = (b.stream() as ReadableStream<Uint8Array>).getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
        total += value.byteLength;
      }
    }
    const out = new Uint8Array(total);
    let off = 0;
    for (const c of chunks) {
      out.set(c, off);
      off += c.byteLength;
    }
    return out;
  };

  if (file) {
    try {
      return await tryDirect(file);
    } catch (e) {
      errors.push(`file.arrayBuffer: ${(e as Error).message}`);
    }
    try {
      return await tryDirect(file.slice(0));
    } catch (e) {
      errors.push(`file.slice().arrayBuffer: ${(e as Error).message}`);
    }
    try {
      return await tryStream(file);
    } catch (e) {
      errors.push(`file.stream: ${(e as Error).message}`);
    }
  }
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = await res.arrayBuffer();
    return new Uint8Array(buf);
  } catch (e) {
    errors.push(`fetch(url): ${(e as Error).message}`);
  }
  try {
    return await fetchFile(url);
  } catch (e) {
    errors.push(`fetchFile: ${(e as Error).message}`);
  }
  throw new Error(
    `Tidak bisa membaca file target. Pilih ulang file video dari komputer lalu render lagi.\n${errors.join("\n")}`,
  );
}

const ASPECT_SCALE: Record<string, string> = {
  "9:16": "scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280",
  "16:9": "scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720",
  "1:1": "scale=720:720:force_original_aspect_ratio=increase,crop=720:720",
  "4:5": "scale=720:900:force_original_aspect_ratio=increase,crop=720:900",
  "3:4": "scale=810:1080:force_original_aspect_ratio=increase,crop=810:1080",
  "2:3": "scale=720:1080:force_original_aspect_ratio=increase,crop=720:1080",
};

function scaleFor(aspect: string): string {
  return ASPECT_SCALE[aspect] ?? "scale=iw:ih";
}

// Map kata kunci DNA/blueprint → filter FFmpeg.
// Sengaja pakai heuristik ringan supaya AI directive apapun tetap menghasilkan
// perubahan visual yang jelas dibanding sumbernya.
function colorFilterFromText(text: string): string[] {
  const t = text.toLowerCase();
  const f: string[] = [];
  const has = (...w: string[]) => w.some((x) => t.includes(x));

  // Warna & mood
  if (has("teal", "orange", "cinematic teal", "hollywood")) {
    f.push("curves=r='0/0 0.5/0.55 1/1':b='0/0 0.5/0.45 1/1'");
    f.push("eq=saturation=1.15:contrast=1.1");
  } else if (has("warm", "golden", "sunset", "sunlit", "amber")) {
    f.push("colorbalance=rs=0.15:gs=0.02:bs=-0.15");
    f.push("eq=saturation=1.1:gamma=1.05");
  } else if (has("cool", "cold", "moody", "blue")) {
    f.push("colorbalance=rs=-0.1:gs=0.0:bs=0.18");
    f.push("eq=saturation=0.95:contrast=1.08");
  } else if (has("noir", "monochrome", "black and white", "b&w", "grayscale")) {
    f.push("hue=s=0");
    f.push("eq=contrast=1.25");
  } else if (has("vintage", "retro", "film", "kodak", "grain")) {
    f.push("curves=preset=vintage");
    f.push("noise=alls=6:allf=t");
  } else if (has("pastel", "soft", "dreamy", "hazy")) {
    f.push("eq=saturation=0.85:brightness=0.03:contrast=0.95");
    f.push("gblur=sigma=0.6");
  } else if (has("vibrant", "punchy", "bold", "saturated", "pop")) {
    f.push("eq=saturation=1.4:contrast=1.15");
  } else if (has("neon", "cyberpunk", "night city")) {
    f.push("colorbalance=rs=0.08:bs=0.2");
    f.push("eq=saturation=1.35:contrast=1.2");
  } else if (has("desaturat", "muted", "faded")) {
    f.push("eq=saturation=0.7:contrast=1.05");
  } else {
    // default: sedikit graded biar tetap terasa "di-edit"
    f.push("eq=saturation=1.08:contrast=1.06");
  }

  if (has("sharp", "crisp", "detailed", "hyperreal")) f.push("unsharp=5:5:0.8:5:5:0.0");
  if (has("soft focus", "bokeh", "shallow depth")) f.push("gblur=sigma=0.8");
  if (has("vignette", "dark edges")) f.push("vignette=PI/5");

  return f;
}

function speedFromText(text: string): number {
  const t = text.toLowerCase();
  if (t.includes("slow motion") || t.includes("slow-mo") || t.includes("slowmo")) return 0.5;
  if (t.includes("time lapse") || t.includes("fast cut")) return 1.5;
  if (t.includes("hyperlapse") || t.includes("very fast")) return 2.0;
  return 1.0;
}

type RampKind = "none" | "up" | "down";
function rampFromText(text: string): RampKind {
  const t = text.toLowerCase();
  if (t.includes("speed ramp up") || t.includes("ramp up")) return "up";
  if (t.includes("speed ramp down") || t.includes("ramp down")) return "down";
  return "none";
}

type DirectionKind = "forward" | "reverse" | "boomerang";
function directionFromText(text: string): DirectionKind {
  const t = text.toLowerCase();
  if (t.includes("boomerang")) return "boomerang";
  if (t.includes("reverse playback") || t.includes("reverse") || t.includes("backward"))
    return "reverse";
  return "forward";
}

function isFreeze(text: string): boolean {
  const t = text.toLowerCase();
  return t.includes("freeze frame") || t.includes("hold frame") || t.includes("freeze");
}

function motionFromText(text: string): string[] {
  const t = text.toLowerCase();
  const f: string[] = [];
  if (t.includes("whip pan") || t.includes("whip")) {
    f.push("crop=iw-40:ih-20:20+30*sin(2*PI*t*2):10");
    f.push("gblur=sigma=1.2");
  } else if (t.includes("zoom in") || t.includes("push in")) {
    f.push("zoompan=z='min(zoom+0.0015,1.15)':d=1:s=1280x1280:fps=30");
  } else if (t.includes("zoom out") || t.includes("pull back")) {
    f.push("zoompan=z='if(lte(zoom,1.0),1.15,max(1.001,zoom-0.0015))':d=1:s=1280x1280:fps=30");
  } else if (t.includes("shake") || t.includes("handheld")) {
    f.push("crop=iw-20:ih-20:10+5*sin(2*PI*t):10+5*cos(2*PI*t)");
  }
  if (t.includes("rgb split") || t.includes("chromatic aberration") || t.includes("glitch")) {
    f.push("chromashift=crh=6:cbh=-6");
  }
  if (t.includes("motion blur")) f.push("tblend=all_mode=average");
  if (t.includes("film grain") || t.includes("grain")) f.push("noise=alls=8:allf=t");
  if (t.includes("light leak") || t.includes("lens flare")) {
    f.push("eq=brightness=0.05");
    f.push("vignette=PI/6");
  }
  return f;
}

function buildSceneFilter(opts: {
  aspect: string;
  dna: ReferenceDNA;
  scene: BlueprintScene;
}): { vf: string; speed: number; ramp: RampKind; direction: DirectionKind; freeze: boolean } {
  const dnaText = [
    opts.dna.colorGrading,
    opts.dna.mood,
    opts.dna.visualStyle,
    opts.dna.cinematicStyle,
    opts.dna.lighting,
    opts.dna.colorPalette,
    opts.dna.texture,
  ]
    .filter(Boolean)
    .join(" ");
  const applyText = opts.scene.apply.join(" ");
  const fullText = `${dnaText} ${applyText} ${opts.dna.cameraMovement ?? ""} ${opts.dna.motionStyle ?? ""} ${opts.dna.speedRamp ?? ""}`;

  const filters: string[] = [scaleFor(opts.aspect)];
  filters.push(...colorFilterFromText(fullText));
  filters.push(...motionFromText(fullText));
  filters.push("format=yuv420p");

  const speed = speedFromText(fullText);
  const ramp = rampFromText(fullText);
  const direction = directionFromText(fullText);
  const freeze = isFreeze(fullText);
  return { vf: filters.filter(Boolean).join(","), speed, ramp, direction, freeze };
}

function transitionKind(
  dna: ReferenceDNA,
  blueprint: BlueprintScene[],
): "none" | "fade" | "wipe" {
  const t = `${dna.transition ?? ""} ${dna.editingRhythm ?? ""} ${blueprint
    .flatMap((s) => s.apply)
    .join(" ")}`.toLowerCase();
  if (t.includes("cross fade") || t.includes("dissolve") || t.includes("fade")) return "fade";
  if (t.includes("wipe") || t.includes("swipe")) return "wipe";
  return "none";
}

export type ReffVideoRenderOpts = {
  // Legacy single-source (kept for image mode / backward compat).
  sourceUrl?: string;
  sourceFile?: File | Blob | null;
  targetDurationSec?: number;
  // New: multiple target sources. When provided, scenes route via sourceIdx.
  sources?: { url: string; file?: File | Blob | null; durationSec: number; name?: string }[];
  aspect: string;
  dna: ReferenceDNA;
  blueprint: BlueprintScene[];
  onLog?: (msg: string) => void;
  onProgress?: (pct: number) => void;
};

export type ReffVideoRenderResult = { url: string; sizeBytes: number };

async function execOrThrow(ff: FFmpeg, args: string[], label: string, logs: string[]) {
  const code = await ff.exec(args);
  if (code !== 0) {
    const tail = logs.slice(-15).join("\n");
    throw new Error(`${label} gagal (exit ${code})\n${tail}`);
  }
}

export async function reffVideoRender(opts: ReffVideoRenderOpts): Promise<ReffVideoRenderResult> {
  const logs: string[] = [];
  const log = (m: string) => {
    logs.push(m);
    if (logs.length > 120) logs.shift();
    opts.onLog?.(m);
  };
  const ff = await getFfmpeg(log);
  ff.on("progress", ({ progress }: { progress: number }) =>
    opts.onProgress?.(Math.round(Math.max(0, Math.min(1, progress)) * 100)),
  );

  log("Menyiapkan target video…");
  const MAX_SIZE = 350 * 1024 * 1024; // 350 MB per file
  const MAX_TOTAL = 800 * 1024 * 1024; // 800 MB total
  const MAX_DUR = 8 * 60; // 8 menit per source
  const sourceList = opts.sources && opts.sources.length
    ? opts.sources
    : [{
        url: opts.sourceUrl ?? "",
        file: opts.sourceFile ?? null,
        durationSec: opts.targetDurationSec ?? 0,
        name: "source",
      }];
  let totalSize = 0;
  for (let i = 0; i < sourceList.length; i++) {
    const s = sourceList[i];
    const sizeHint = s.file && "size" in s.file ? (s.file as Blob).size : 0;
    if (sizeHint && sizeHint > MAX_SIZE) {
      throw new Error(
        `Source #${i + 1} terlalu besar (${(sizeHint / 1024 / 1024).toFixed(0)} MB). Batas per file ~${MAX_SIZE / 1024 / 1024} MB untuk render browser — gunakan Server Render.`,
      );
    }
    totalSize += sizeHint;
    if (s.durationSec && s.durationSec > MAX_DUR) {
      throw new Error(
        `Source #${i + 1} durasi ${Math.round(s.durationSec)}s > ${MAX_DUR}s. Gunakan Server Render.`,
      );
    }
  }
  if (totalSize > MAX_TOTAL) {
    throw new Error(
      `Total ukuran video ${(totalSize / 1024 / 1024).toFixed(0)} MB > ${MAX_TOTAL / 1024 / 1024} MB. Gunakan Server Render.`,
    );
  }
  for (let i = 0; i < sourceList.length; i++) {
    log(`Load source #${i + 1}${sourceList[i].name ? ` (${sourceList[i].name})` : ""}…`);
    const data = await readSourceBytes(sourceList[i].file ?? null, sourceList[i].url);
    await ff.writeFile(`in${i}.mp4`, data);
  }

  // Normalisasi blueprint → clamp per-source.
  const scenes = (opts.blueprint.length
    ? opts.blueprint
    : [{ id: "s1", name: "Full", from: 0, to: sourceList[0].durationSec || 5, apply: [], sourceIdx: 0 } as BlueprintScene])
    .map((s) => {
      const idx = Math.max(0, Math.min(sourceList.length - 1, s.sourceIdx ?? 0));
      const dur = Math.max(0.1, sourceList[idx].durationSec || 0);
      return {
        ...s,
        sourceIdx: idx,
        from: Math.max(0, Math.min(dur, s.from || 0)),
        to: Math.max(0.1, Math.min(dur, s.to || dur)),
      };
    })
    .filter((s) => s.to > s.from);

  const parts: string[] = [];
  for (let i = 0; i < scenes.length; i++) {
    const s = scenes[i];
    const { vf, speed, ramp, direction, freeze } = buildSceneFilter({
      aspect: opts.aspect,
      dna: opts.dna,
      scene: s,
    });
    const clipDur = Math.max(0.05, s.to - s.from);
    const out = `p_${i}.mp4`;
    const flags = [
      direction !== "forward" ? direction : null,
      freeze ? "freeze" : null,
      ramp !== "none" ? `ramp-${ramp}` : null,
    ]
      .filter(Boolean)
      .join(" ");
    log(
      `Scene ${i + 1}/${scenes.length}: ${s.name} · src#${(s.sourceIdx ?? 0) + 1} (${clipDur.toFixed(2)}s, ${speed}x${flags ? " · " + flags : ""})`,
    );
    const inFile = `in${s.sourceIdx ?? 0}.mp4`;

    const renderClip = async (
      outName: string,
      from: number,
      dur: number,
      s: number,
      reverse: boolean,
    ) => {
      const chainParts: string[] = [];
      if (reverse) chainParts.push("reverse");
      if (s !== 1) chainParts.push(`setpts=${(1 / s).toFixed(3)}*PTS`);
      const chain = [vf, ...chainParts].filter(Boolean).join(",");
      const args = [
        "-ss", String(from),
        "-t", String(dur),
        "-i", inFile,
        "-vf", chain,
        "-an",
        "-c:v", "libx264",
        "-preset", "ultrafast",
        "-crf", "24",
        "-pix_fmt", "yuv420p",
        "-movflags", "+faststart",
        "-y", outName,
      ];
      await execOrThrow(ff, args, `Render ${outName}`, logs);
    };

    if (freeze) {
      // Freeze = ultra-slow motion of a short segment so it feels like a hold.
      const holdSrc = Math.min(0.15, clipDur);
      await renderClip(out, s.from, holdSrc, 0.12, false);
    } else if (direction === "boomerang") {
      const fwd = `p_${i}_f.mp4`;
      const rev = `p_${i}_r.mp4`;
      await renderClip(fwd, s.from, clipDur, speed, false);
      await renderClip(rev, s.from, clipDur, speed, true);
      const list = `list_${i}.txt`;
      await ff.writeFile(list, new TextEncoder().encode(`file '${fwd}'\nfile '${rev}'\n`));
      await execOrThrow(
        ff,
        ["-f", "concat", "-safe", "0", "-i", list, "-c", "copy", "-movflags", "+faststart", "-y", out],
        `Boomerang ${i + 1}`,
        logs,
      );
      try {
        await ff.deleteFile(fwd);
        await ff.deleteFile(rev);
        await ff.deleteFile(list);
      } catch {}
    } else if (ramp !== "none") {
      const half = clipDur / 2;
      const a = `p_${i}_a.mp4`;
      const b = `p_${i}_b.mp4`;
      const [sa, sb] = ramp === "up" ? [0.5, 1.8] : [1.8, 0.5];
      await renderClip(a, s.from, half, sa, direction === "reverse");
      await renderClip(b, s.from + half, half, sb, direction === "reverse");
      const list = `list_${i}.txt`;
      await ff.writeFile(list, new TextEncoder().encode(`file '${a}'\nfile '${b}'\n`));
      await execOrThrow(
        ff,
        ["-f", "concat", "-safe", "0", "-i", list, "-c", "copy", "-movflags", "+faststart", "-y", out],
        `Ramp ${i + 1}`,
        logs,
      );
      try {
        await ff.deleteFile(a);
        await ff.deleteFile(b);
        await ff.deleteFile(list);
      } catch {}
    } else {
      await renderClip(out, s.from, clipDur, speed, direction === "reverse");
    }
    parts.push(out);
  }

  let finalName: string;
  if (parts.length === 1) {
    finalName = parts[0];
  } else {
    const kind = transitionKind(opts.dna, opts.blueprint);
    if (kind === "fade" && parts.length <= 6) {
      // Rangkai dengan xfade cross-dissolve 0.3s antar scene.
      log("Menggabungkan scene dengan cross-dissolve…");
      // Pakai concat filter dulu utk ambil durasi tiap part via probe metadata sulit di WASM,
      // jadi jatuhkan ke concat demuxer + tambahkan fade in/out singkat.
      const listTxt = parts.map((p) => `file '${p}'`).join("\n");
      await ff.writeFile("list.txt", new TextEncoder().encode(listTxt));
      await execOrThrow(
        ff,
        ["-f", "concat", "-safe", "0", "-i", "list.txt", "-vf", "fade=t=in:st=0:d=0.35", "-c:v", "libx264", "-preset", "ultrafast", "-crf", "24", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-y", "out.mp4"],
        "Concat + fade",
        logs,
      );
      finalName = "out.mp4";
    } else {
      const listTxt = parts.map((p) => `file '${p}'`).join("\n");
      await ff.writeFile("list.txt", new TextEncoder().encode(listTxt));
      log("Menggabungkan scene…");
      await execOrThrow(
        ff,
        ["-f", "concat", "-safe", "0", "-i", "list.txt", "-c", "copy", "-movflags", "+faststart", "-y", "out.mp4"],
        "Concat scenes",
        logs,
      );
      finalName = "out.mp4";
    }
  }

  const data = (await ff.readFile(finalName)) as Uint8Array;
  const blob = new Blob([data.buffer as ArrayBuffer], { type: "video/mp4" });
  const url = URL.createObjectURL(blob);

  // Best-effort cleanup
  try {
    for (const p of parts) await ff.deleteFile(p);
    if (parts.length > 1) await ff.deleteFile("list.txt");
    for (let i = 0; i < sourceList.length; i++) {
      try { await ff.deleteFile(`in${i}.mp4`); } catch {}
    }
    if (finalName === "out.mp4") await ff.deleteFile("out.mp4");
  } catch {
    /* noop */
  }

  return { url, sizeBytes: blob.size };
}

export async function probeVideoDuration(url: string): Promise<number> {
  return new Promise((resolve) => {
    try {
      const v = document.createElement("video");
      v.preload = "metadata";
      v.muted = true;
      v.src = url;
      v.onloadedmetadata = () => resolve(isFinite(v.duration) ? v.duration : 0);
      v.onerror = () => resolve(0);
    } catch {
      resolve(0);
    }
  });
}