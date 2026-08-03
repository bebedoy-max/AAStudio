// Framia Motion Control runner.
//
// Mirrors the network sequence captured from the Framia canvas
// (share recipe https://framia.converge.ai/share/d4468d20f4):
//   1. resolve workspace → create workflow-canvas project (project_id + canvas_id)
//   2. upload reference image  → resource_id  (node id `image-XXXX`)
//   3. upload driving video    → resource_id  (node id `video-XXXX`)
//   4. POST /video/api/workflows/runs with both resources in input_refs and a
//      canvas snapshot whose Seedance Video node runs in multi-reference mode
//   5. poll /workflows/runs/<id>/nodes until success, resolve the output URL
//      (falls back to /v1/resources/<id>/info when only a resource id is given)

import {
  createFramiaProject,
  createWorkflowRun,
  fetchFramiaCreatorProfile,
  fetchFramiaProfile,
  findFramiaWorkspaceId,
  getResourceInfo,
  getRunDetail,
  listFramiaProjects,
  uploadFramiaAsset,
  waitForRunCompletion,
  type FramiaRunNode,
} from "./framia";

/* --------------------------------- models --------------------------------- */

// Framia's video node only accepts its exact display name.
const MOTION_MODEL_LABELS: Record<string, string> = {
  "seedance-2.0-mini": "Seedance 2.0 mini",
  // legacy keys kept working
  "kling-3.0-omni": "Seedance 2.0 mini",
  "kling-3.0": "Seedance 2.0 mini",
  "kling-v2.1-motion": "Seedance 2.0 mini",
  "kling-v2.6-motion": "Seedance 2.0 mini",
  "kling-v3-motion": "Seedance 2.0 mini",
};

export function resolveFramiaMotionModelLabel(modelKey: string): string {
  const slug = modelKey.replace(/^framia:/, "").replace(/^fr:/, "");
  return MOTION_MODEL_LABELS[slug] || "Seedance 2.0 mini";
}

/** Prompt motion control persis seperti recipe Framia (hardcode). */
export const FRAMIA_MOTION_PROMPT =
  "Refer to the movements and facial expressions in Video to animate Image without changing the original background.";

/* --------------------------------- helpers -------------------------------- */

const rand = (n = 12) =>
  Array.from(crypto.getRandomValues(new Uint8Array(n)))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, n);

function pickVideoUrl(nodes: FramiaRunNode[]): string | null {
  for (const n of nodes) {
    const out = (n.output ?? {}) as Record<string, unknown>;
    const result = (out.result ?? out) as Record<string, unknown>;
    const resources = (result?.resources as Array<Record<string, unknown>>) ?? [];
    for (const r of resources) {
      const url = (r.url || r.download_url) as string | undefined;
      if (typeof url === "string" && /^https?:\/\//.test(url)) return url;
    }
    const direct = (result?.url || result?.download_url) as string | undefined;
    if (typeof direct === "string" && /^https?:\/\//.test(direct)) return direct;
  }
  return null;
}

async function resolveResourceUrl(token: string, nodes: FramiaRunNode[]): Promise<string | null> {
  for (const n of nodes) {
    const out = (n.output ?? {}) as Record<string, unknown>;
    const result = (out.result ?? out) as Record<string, unknown>;
    const resources = (result?.resources as Array<Record<string, unknown>>) ?? [];
    for (const r of resources) {
      const id = (r.resource_id || r.id) as string | undefined;
      if (!id) continue;
      try {
        const info = await getResourceInfo(token, id);
        const url = (info.url || info.download_url) as string | undefined;
        if (url) return url;
      } catch {
        /* ignore */
      }
    }
  }
  return null;
}

async function resolveWorkspaceId(token: string): Promise<string | null> {
  const profile = await fetchFramiaProfile(token).catch(() => null);
  const creator = await fetchFramiaCreatorProfile(token).catch(() => null);
  const direct = findFramiaWorkspaceId(profile, creator);
  if (direct) return direct;
  const projects = (await listFramiaProjects(token).catch(() => [])) as Array<Record<string, unknown>>;
  for (const p of projects) {
    const ws = findFramiaWorkspaceId(p);
    if (ws) return ws;
  }
  return null;
}

/* ------------------------------ video probing ------------------------------ */

type VideoMeta = { duration: number; aspect: string };

/** Aspect ratio yang diterima node video Framia. */
const FRAMIA_ASPECTS: Array<{ label: string; value: number }> = [
  { label: "9:16", value: 9 / 16 },
  { label: "3:4", value: 3 / 4 },
  { label: "1:1", value: 1 },
  { label: "4:3", value: 4 / 3 },
  { label: "16:9", value: 16 / 9 },
];

function nearestAspect(w: number, h: number): string {
  if (!w || !h) return "9:16";
  const r = w / h;
  let best = FRAMIA_ASPECTS[0]!;
  for (const a of FRAMIA_ASPECTS) {
    if (Math.abs(a.value - r) < Math.abs(best.value - r)) best = a;
  }
  return best.label;
}

/**
 * Ambil durasi + rasio video sumber. Framia menolak (biz_code 5000) kalau
 * durasi/rasio yang dikirim tidak cocok dengan video referensi.
 */
async function probeVideoMeta(file: Blob): Promise<VideoMeta> {
  const fallback: VideoMeta = { duration: 5, aspect: "9:16" };
  if (typeof document === "undefined" || typeof URL === "undefined") return fallback;
  const url = URL.createObjectURL(file);
  try {
    return await new Promise<VideoMeta>((resolve) => {
      const el = document.createElement("video");
      el.preload = "metadata";
      el.muted = true;
      const done = (meta: VideoMeta) => {
        el.removeAttribute("src");
        resolve(meta);
      };
      const timer = setTimeout(() => done(fallback), 10_000);
      el.onloadedmetadata = () => {
        clearTimeout(timer);
        const d = Number.isFinite(el.duration) && el.duration > 0 ? el.duration : fallback.duration;
        done({
          duration: Math.round(Math.max(1, d) * 1000) / 1000,
          aspect: nearestAspect(el.videoWidth, el.videoHeight),
        });
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

/** Batas keras Framia dan target aman untuk menghindari overshoot timestamp encoder. */
const FRAMIA_MAX_VIDEO_SEC = 15;
const FRAMIA_SAFE_TRIM_SEC = 14.5;

/**
 * Potong sedikit di bawah 15 detik karena muxing MP4 dapat menambahkan satu
 * frame/audio packet sehingga hasil `-t 15` terbaca sebagai 15.021 detik.
 */
async function trimVideoTo15(
  file: File | Blob,
  onProgress?: (msg: string, pct?: number) => void,
): Promise<File> {
  const src =
    file instanceof File
      ? file
      : new File([file], `motion_src_${Date.now()}.mp4`, { type: (file as Blob).type || "video/mp4" });
  try {
    onProgress?.(`Framia: memotong video ke batas aman ${FRAMIA_SAFE_TRIM_SEC} detik...`, 12);
    const { getFfmpeg } = await import("@/lib/mixing/ffmpeg-render");
    const { fetchFile } = await import("@ffmpeg/util");
    const ff = await getFfmpeg();
    const inName = "framia_in.mp4";
    const outName = "framia_out.mp4";
    await ff.writeFile(inName, await fetchFile(src));
    await ff.exec([
      "-i",
      inName,
      "-t",
      String(FRAMIA_SAFE_TRIM_SEC),
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "23",
      "-c:a",
      "aac",
      "-movflags",
      "+faststart",
      outName,
    ]);
    const data = (await ff.readFile(outName)) as Uint8Array;
    await ff.deleteFile(inName).catch(() => {});
    await ff.deleteFile(outName).catch(() => {});
    const buf = new ArrayBuffer(data.byteLength);
    new Uint8Array(buf).set(data);
    return new File([buf], src.name.replace(/\.[^.]+$/, "") + `_14-5s.mp4`, { type: "video/mp4" });
  } catch {
    throw new Error(
      `Video referensi lebih dari ${FRAMIA_MAX_VIDEO_SEC} detik dan gagal dipotong otomatis. Potong video ke maksimal ${FRAMIA_MAX_VIDEO_SEC} detik lalu coba lagi.`,
    );
  }
}


/* ---------------------------------- run ----------------------------------- */

export type FramiaMotionOpts = {
  token: string;
  imageFile: File | Blob;
  videoFile: File | Blob;
  modelKey: string;
  resolution: "480p" | "720p";
  onProgress?: (msg: string, pct?: number) => void;
};

export async function runFramiaMotion(opts: FramiaMotionOpts): Promise<string> {
  const { token } = opts;
  const model = resolveFramiaMotionModelLabel(opts.modelKey);
  const prompt = FRAMIA_MOTION_PROMPT;
  const resolution = opts.resolution === "720p" ? "720p" : "480p";
  const rawMeta = await probeVideoMeta(opts.videoFile);
  const needsTrim = rawMeta.duration > FRAMIA_SAFE_TRIM_SEC;
  const sourceVideo = needsTrim ? await trimVideoTo15(opts.videoFile, opts.onProgress) : opts.videoFile;
  const processedMeta = needsTrim ? await probeVideoMeta(sourceVideo) : rawMeta;
  const videoMeta: VideoMeta = {
    aspect: processedMeta.aspect,
    duration: Math.floor(Math.min(FRAMIA_SAFE_TRIM_SEC, Math.max(1, processedMeta.duration)) * 10) / 10,
  };



  opts.onProgress?.("Framia: mengambil profil...", 5);
  const workspaceId = await resolveWorkspaceId(token);

  opts.onProgress?.("Framia: membuat project canvas...", 10);
  const project = await createFramiaProject(token, {
    workspaceId,
    executionMode: "manual",
    category: "workflow_canvas",
  }).catch(async (error) => {
    if (!workspaceId) throw error;
    return createFramiaProject(token, { executionMode: "manual", category: "workflow_canvas" });
  });
  const projectId = String(project.project_id || project.id || "");
  const canvasId = String(project.canvas_id || "");
  const threadId = String(project.thread_id || "");
  if (!projectId || !canvasId) throw new Error("Framia: project_id/canvas_id kosong");

  const imgFile =
    opts.imageFile instanceof File
      ? opts.imageFile
      : new File([opts.imageFile], `motion_ref_${Date.now()}.jpg`, {
          type: (opts.imageFile as Blob).type || "image/jpeg",
        });
  const vidFile =
    sourceVideo instanceof File
      ? sourceVideo
      : new File([sourceVideo], `motion_src_${Date.now()}.mp4`, {
          type: (sourceVideo as Blob).type || "video/mp4",
        });


  opts.onProgress?.("Framia: upload gambar referensi...", 20);
  const uploadedImage = await uploadFramiaAsset(token, {
    projectId,
    threadId: threadId || projectId,
    file: imgFile,
    filename: imgFile.name,
    scene: "canvas_upload",
  });

  opts.onProgress?.("Framia: upload video motion...", 35);
  const uploadedVideo = await uploadFramiaAsset(token, {
    projectId,
    threadId: threadId || projectId,
    file: vidFile,
    filename: vidFile.name,
    scene: "canvas_upload",
  });

  const imageNodeId = `image-${rand(12)}`;
  const videoRefNodeId = `video-${rand(12)}`;
  const outputNodeId = `video-${rand(12)}`;

  const imageOutput = {
    kind: "resource_collection",
    media_type: "image",
    resources: [{ resource_id: uploadedImage.resource_id, media_type: "image" }],
  };
  const videoOutput = {
    kind: "resource_collection",
    media_type: "video",
    resources: [{ resource_id: uploadedVideo.resource_id, media_type: "video" }],
  };

  // Framia kadang gagal transient (biz_code 5000/5002 = downstream service
  // error). Retry beberapa kali dengan backoff; asset sudah ter-upload jadi
  // submit ulang murah.
  const MAX_ATTEMPTS = 4;
  let lastFailure = "";
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    opts.onProgress?.(
      `Framia: mengirim workflow ${model}${attempt > 1 ? ` (percobaan ${attempt})` : ""}...`,
      45,
    );
    const run = await createWorkflowRun(token, {
      workflowId: `wf_node_${rand(7)}_${rand(6)}`,
      workflowVersion: Date.now(),
      projectId,
      canvasId,
      sourceType: "ad_hoc",
      sourceId: outputNodeId,
      inputRefs: {
        nodes: {
          [imageNodeId]: { output: { result: imageOutput } },
          [videoRefNodeId]: { output: { result: videoOutput } },
        },
      },
      contextRefs: {
        run_kind: "execution_graph",
        execution_node_ids: [outputNodeId],
        canvas_snapshot: {
          meta: {
            exportedAt: new Date().toISOString(),
            projectId,
            canvasId,
            version: "1.0.0",
          },
          nodes: [
            {
              id: outputNodeId,
              type: "Video",
              position: { x: 672, y: 302.5 },
              width: 320,
              height: 574,
              data: {
                label: "Video",
                node_type: "task",
                node_interface: "media.generate.video",
                input_refs: {
                  gen_type: "video",
                  model,
                  prompt,
                  aspect_ratio: videoMeta.aspect,
                  resolution,
                  duration_float: videoMeta.duration,
                  video_mode: "multi_reference",
                  prompt_inputs: [
                    {
                      label: "Image",
                      node_id: imageNodeId,
                      content: {
                        $ref: ["run", "input", "nodes", imageNodeId, "output", "result"],
                      },
                    },
                    {
                      label: "Video",
                      node_id: videoRefNodeId,
                      content: {
                        $ref: ["run", "input", "nodes", videoRefNodeId, "output", "result"],
                      },
                    },
                  ],
                },
                reads: {
                  resources: {
                    sources: [
                      { source: "run_input", key: "nodes", path: [imageNodeId, "output", "result"] },
                      { source: "run_input", key: "nodes", path: [videoRefNodeId, "output", "result"] },
                    ],
                  },
                },
              },
            },
          ],
          edges: [],
        },
      },
    });

    const runId = String(run.run_id || run.id || "");
    if (!runId) throw new Error("Framia: run_id tidak dikembalikan");

    opts.onProgress?.("Framia: rendering motion...", 55);
    const finalNodes = await waitForRunCompletion(token, runId, {
      timeoutMs: 25 * 60_000,
      intervalMs: 4_000,
      onTick: (nodes) => {
        const v = nodes.find((n) => String(n.node_id || "").startsWith("video-"));
        if (v) {
          const p =
            typeof v.progress === "number"
              ? Math.min(95, 55 + Math.round(v.progress * 0.4))
              : undefined;
          opts.onProgress?.(`Framia: ${v.status ?? "processing"}`, p);
        }
      },
    });

    const failed = finalNodes.find((n) => String(n.status ?? "").toLowerCase() === "failed");
    if (failed) {
      lastFailure = formatFramiaFailure(failed);
      const runDetail = await getRunDetail(token, runId).catch(() => null);
      const runReason = runDetail ? formatRunFailure(runDetail) : "";
      if (runReason && !lastFailure.includes(runReason)) lastFailure = `${lastFailure} | run: ${runReason}`;
      // Tampilkan alasan asli di log generate supaya bisa didiagnosa tanpa devtools.
      opts.onProgress?.(`Framia: node gagal — ${lastFailure.slice(0, 600)}`);
      if (attempt < MAX_ATTEMPTS) {
        const waitMs = 8_000 * attempt;
        opts.onProgress?.(
          `Framia: gagal (server Framia), mencoba ulang ${attempt + 1}/${MAX_ATTEMPTS} dalam ${Math.round(waitMs / 1000)} detik...`,
          50,
        );
        await new Promise((r) => setTimeout(r, waitMs));
        continue;
      }
      const transient = /biz_code:\s*50(00|02)|Downstream service error/i.test(lastFailure);
      throw new Error(
        `Framia node failed: ${lastFailure}` +
          (transient
            ? " — ini error di sisi server Framia (bukan input kamu). Sudah dicoba ulang otomatis. Tunggu beberapa menit lalu jalankan lagi, atau turunkan resolusi ke 480p."
            : " — generate ditolak Framia. Coba video motion yang lebih pendek/kecil, ganti gambar referensi, atau ulangi beberapa saat lagi."),
      );
    }

    const url = pickVideoUrl(finalNodes) || (await resolveResourceUrl(token, finalNodes));
    if (!url) throw new Error("Framia: video URL tidak ditemukan pada output run");
    opts.onProgress?.("Framia: selesai", 100);
    return url;
  }
  throw new Error(`Framia node failed: ${lastFailure || "unknown"}`);
}


function formatFramiaFailure(node: FramiaRunNode): string {
  const candidates = [node.error, node.message, node.detail, node.output];
  for (const value of candidates) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (value && typeof value === "object") {
      try {
        const encoded = JSON.stringify(value);
        if (encoded && encoded !== "{}") return encoded.slice(0, 1200);
      } catch {
        // Continue to the complete node fallback below.
      }
    }
  }
  try {
    return JSON.stringify(node).slice(0, 1200);
  } catch {
    return "unknown Framia node error";
  }
}

function formatRunFailure(run: Record<string, unknown>): string {
  for (const key of ["error", "error_message", "failure_reason", "reason", "message", "detail", "status_message"]) {
    const v = run[key];
    if (typeof v === "string" && v.trim()) return v.trim().slice(0, 600);
    if (v && typeof v === "object") {
      try {
        const enc = JSON.stringify(v);
        if (enc && enc !== "{}") return enc.slice(0, 600);
      } catch {
        /* ignore */
      }
    }
  }
  return "";
}
