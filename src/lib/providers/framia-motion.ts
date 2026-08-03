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
    opts.videoFile instanceof File
      ? opts.videoFile
      : new File([opts.videoFile], `motion_src_${Date.now()}.mp4`, {
          type: (opts.videoFile as Blob).type || "video/mp4",
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

  opts.onProgress?.(`Framia: mengirim workflow ${model}...`, 45);
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
                aspect_ratio: "9:16",
                resolution,
                duration_float: 15,
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
          typeof v.progress === "number" ? Math.min(95, 55 + Math.round(v.progress * 0.4)) : undefined;
        opts.onProgress?.(`Framia: ${v.status ?? "processing"}`, p);
      }
    },
  });

  const failed = finalNodes.find((n) => String(n.status ?? "").toLowerCase() === "failed");
  if (failed) {
    const detail = formatFramiaFailure(failed);
    throw new Error(`Framia node failed: ${detail}`);
  }

  const url = pickVideoUrl(finalNodes) || (await resolveResourceUrl(token, finalNodes));
  if (!url) throw new Error("Framia: video URL tidak ditemukan pada output run");
  opts.onProgress?.("Framia: selesai", 100);
  return url;
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
