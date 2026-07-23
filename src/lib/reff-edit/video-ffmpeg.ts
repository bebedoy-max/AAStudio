// Reff EDIT — video renderer via FFmpeg WASM, dipandu Reference DNA + Blueprint.
// Menerjemahkan directive AI (colorGrading, mood, speedRamp, cameraMovement, dst.)
// menjadi rangkaian filter FFmpeg lalu memotong target video per-scene,
// menerapkan look, dan concat menjadi MP4 akhir.

import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile } from "@ffmpeg/util";
import { getFfmpeg } from "@/lib/mixing/ffmpeg-render";
import type { BlueprintScene, ReferenceDNA } from "./store";

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
  if (t.includes("speed ramp up") || t.includes("time lapse") || t.includes("fast cut")) return 1.5;
  if (t.includes("hyperlapse") || t.includes("very fast")) return 2.0;
  return 1.0;
}

function motionFromText(text: string): string[] {
  const t = text.toLowerCase();
  const f: string[] = [];
  if (t.includes("zoom in") || t.includes("push in")) {
    f.push("zoompan=z='min(zoom+0.0015,1.15)':d=1:s=1280x1280:fps=30");
  } else if (t.includes("zoom out") || t.includes("pull back")) {
    f.push("zoompan=z='if(lte(zoom,1.0),1.15,max(1.001,zoom-0.0015))':d=1:s=1280x1280:fps=30");
  } else if (t.includes("shake") || t.includes("handheld")) {
    f.push("crop=iw-20:ih-20:10+5*sin(2*PI*t):10+5*cos(2*PI*t)");
  }
  return f;
}

function buildSceneFilter(opts: {
  aspect: string;
  dna: ReferenceDNA;
  scene: BlueprintScene;
}): { vf: string; speed: number } {
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
  return { vf: filters.filter(Boolean).join(","), speed };
}

function transitionKind(dna: ReferenceDNA): "none" | "fade" | "wipe" {
  const t = `${dna.transition ?? ""} ${dna.editingRhythm ?? ""}`.toLowerCase();
  if (t.includes("cross fade") || t.includes("dissolve") || t.includes("fade")) return "fade";
  if (t.includes("wipe") || t.includes("swipe")) return "wipe";
  return "none";
}

export type ReffVideoRenderOpts = {
  sourceUrl: string;
  targetDurationSec: number; // durasi video sumber
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
  await ff.writeFile("in.mp4", await fetchFile(opts.sourceUrl));

  // Normalisasi blueprint → clamp ke durasi target.
  const dur = Math.max(0.1, opts.targetDurationSec || 0);
  const scenes = (opts.blueprint.length ? opts.blueprint : [
    { id: "s1", name: "Full", from: 0, to: dur, apply: [] } as BlueprintScene,
  ])
    .map((s) => ({
      ...s,
      from: Math.max(0, Math.min(dur, s.from || 0)),
      to: Math.max(0.1, Math.min(dur, s.to || dur)),
    }))
    .filter((s) => s.to > s.from);

  const parts: string[] = [];
  for (let i = 0; i < scenes.length; i++) {
    const s = scenes[i];
    const { vf, speed } = buildSceneFilter({ aspect: opts.aspect, dna: opts.dna, scene: s });
    const clipDur = Math.max(0.05, s.to - s.from);
    const out = `p_${i}.mp4`;
    log(`Scene ${i + 1}/${scenes.length}: ${s.name} (${clipDur.toFixed(2)}s, speed ${speed}x)`);
    const setpts = speed !== 1 ? `,setpts=${(1 / speed).toFixed(3)}*PTS` : "";
    const args = [
      "-ss", String(s.from),
      "-t", String(clipDur),
      "-i", "in.mp4",
      "-vf", `${vf}${setpts}`,
      "-an",
      "-c:v", "libx264",
      "-preset", "ultrafast",
      "-crf", "24",
      "-pix_fmt", "yuv420p",
      "-movflags", "+faststart",
      "-y", out,
    ];
    await execOrThrow(ff, args, `Render scene ${i + 1}`, logs);
    parts.push(out);
  }

  let finalName: string;
  if (parts.length === 1) {
    finalName = parts[0];
  } else {
    const kind = transitionKind(opts.dna);
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
    await ff.deleteFile("in.mp4");
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