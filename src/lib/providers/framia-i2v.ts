// Framia Image-to-Video runner.
//
// Recreates the exact sequence captured from the Framia canvas "Run" button
// (share recipe https://framia.converge.ai/share/8b83c48b70):
//   1. Fetch profile → workspace_id
//   2. Create a workflow-canvas project (returns project_id + canvas_id)
//   3. Upload the source image → resource_id
//   4. Publish an ad-hoc workflow version whose canvas snapshot has a single
//      Video node consuming an `image-XXXX` run-input reference
//   5. Start a workflow run passing that image as input_refs.nodes.<id>.output.result
//   6. Poll until the video node reaches success and return the video URL
//
// Model dropdown values from generate.image-to-video.tsx are `framia:<slug>`;
// we map them to the exact display strings Framia expects (e.g. "Seedance 2.0
// Fast", "Gemini Omni Flash").

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

const MODEL_LABELS: Record<string, string> = {
  "seedance-2.0": "Seedance 2.0",
  "seedance-2.0-fast": "Seedance 2.0 Fast",
  "kling-3.0-omni": "Kling 3.0 Omni",
  "kling-3.0": "Kling 3.0",
  "veo-3.1": "Veo 3.1",
  "veo-3.1-fast": "Veo 3.1 Fast",
  "wan-2.7": "Wan 2.7",
  "gemini-omni-flash": "Gemini Omni Flash",
  "happyhorse-1.1": "HappyHorse 1.1",
  "kling-avatar": "Kling Avatar",
};

export function resolveFramiaModelLabel(modelKey: string): string {
  const slug = modelKey.replace(/^framia:/, "").replace(/^fr:/, "");
  return MODEL_LABELS[slug] || slug;
}

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
    // Common shapes: { resources: [{ url, download_url, resource_id }] } |
    //                { url } | { download_url }
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

function pickProjectWorkspaceId(projects: Array<Record<string, unknown>>): string | null {
  for (const project of projects) {
    const workspaceId = findFramiaWorkspaceId(project);
    if (workspaceId) return workspaceId;
  }
  return null;
}

function normalizeFramiaVideoAspectRatio(aspectRatio: string): "9:16" | "16:9" {
  if (aspectRatio === "16:9") return "16:9";
  if (aspectRatio === "9:16") return "9:16";
  const [w, h] = aspectRatio.split(":").map((part) => Number(part));
  if (Number.isFinite(w) && Number.isFinite(h) && w > h) return "16:9";
  return "9:16";
}

async function resolveWorkspaceId(token: string): Promise<string | null> {
  const profile = await fetchFramiaProfile(token).catch(() => null);
  const creator = await fetchFramiaCreatorProfile(token).catch(() => null);
  const direct = findFramiaWorkspaceId(profile, creator);
  if (direct) return direct;

  const projects = await listFramiaProjects(token).catch(() => []);
  return pickProjectWorkspaceId(projects as Array<Record<string, unknown>>);
}

async function resolveResourceUrl(token: string, nodes: FramiaRunNode[]): Promise<string | null> {
  // Fallback: look up resource_id → info endpoint if the run node only exposes an id.
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

/* ---------------------------------- run ----------------------------------- */

export type FramiaI2VOpts = {
  token: string;
  imageFile: File | Blob;
  filename?: string;
  prompt: string;
  modelKey: string; // e.g. "framia:seedance-2.0-fast"
  aspectRatio: string; // "9:16" | "16:9" | "1:1" | ...
  resolution?: string; // "720p" | "1080p"
  durationSec: number; // 5 | 10 | 12
  onProgress?: (msg: string, pct?: number) => void;
};

export async function runFramiaI2V(opts: FramiaI2VOpts): Promise<string> {
  const { token, prompt, imageFile } = opts;
  const model = resolveFramiaModelLabel(opts.modelKey);
  const aspect = normalizeFramiaVideoAspectRatio(opts.aspectRatio || "9:16");
  const resolution = opts.resolution || "720p";
  const duration = opts.durationSec || 5;

  opts.onProgress?.("Framia: mengambil profil...", 5);
  const workspaceId = await resolveWorkspaceId(token);

  opts.onProgress?.("Framia: membuat project canvas...", 10);
  const project = await createFramiaProject(token, {
    workspaceId,
    executionMode: "manual",
    category: "workflow_canvas",
  }).catch(async (error) => {
    if (!workspaceId) throw error;
    opts.onProgress?.("Framia: retry project tanpa workspace_id...", 12);
    return createFramiaProject(token, {
      executionMode: "manual",
      category: "workflow_canvas",
    });
  });
  const projectId = String(project.project_id || project.id || "");
  const canvasId = String(project.canvas_id || "");
  const threadId = String(project.thread_id || "");
  if (!projectId || !canvasId) throw new Error("Framia: project_id/canvas_id kosong");

  opts.onProgress?.("Framia: upload gambar ke workspace...", 25);
  const file =
    imageFile instanceof File
      ? imageFile
      : new File([imageFile], opts.filename || `i2v_${Date.now()}.jpg`, {
          type: (imageFile as Blob).type || "image/jpeg",
        });
  const uploaded = await uploadFramiaAsset(token, {
    projectId,
    threadId: threadId || projectId,
    file,
    filename: file.name,
    scene: "canvas_upload",
  });

  // Deterministic node ids match those in canvas_snapshot + input_refs.
  const imageNodeId = `image-${rand(12)}`;
  const videoNodeId = `video-${rand(12)}`;

  const imageOutput = {
    kind: "resource_collection",
    media_type: "image",
    resources: [{ resource_id: uploaded.resource_id, media_type: "image" }],
  };

  opts.onProgress?.(`Framia: mengirim workflow ${model}...`, 40);
  const run = await createWorkflowRun(token, {
    workflowId: `wf_node_${rand(7)}_${rand(6)}`,
    workflowVersion: Date.now(),
    projectId,
    canvasId,
    sourceType: "ad_hoc",
    sourceId: videoNodeId,
    inputRefs: {
      nodes: {
        [imageNodeId]: { output: { result: imageOutput } },
      },
    },
    contextRefs: {
      run_kind: "execution_graph",
      canvas_snapshot: {
        meta: {
          exportedAt: new Date().toISOString(),
          projectId,
          canvasId,
          version: "1.0.0",
        },
        nodes: [
          {
            id: videoNodeId,
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
                aspect_ratio: aspect,
                resolution,
                duration_float: duration,
                video_mode: "multi_reference",
                prompt_inputs: [
                  {
                    label: "Image",
                    node_id: imageNodeId,
                    content: {
                      $ref: ["run", "input", "nodes", imageNodeId, "output", "result"],
                    },
                  },
                ],
              },
              reads: {
                resources: {
                  sources: [
                    {
                      source: "run_input",
                      key: "nodes",
                      path: [imageNodeId, "output", "result"],
                    },
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

  opts.onProgress?.("Framia: rendering...", 55);
  const finalNodes = await waitForRunCompletion(token, runId, {
    timeoutMs: 20 * 60_000,
    intervalMs: 4_000,
    onTick: (nodes) => {
      const v = nodes.find((n) => String(n.node_id || "").startsWith("video-"));
      if (v) {
        const p = typeof v.progress === "number" ? Math.min(95, 55 + Math.round(v.progress * 0.4)) : undefined;
        opts.onProgress?.(`Framia: ${v.status ?? "processing"}`, p);
      }
    },
  });

  const failed = finalNodes.find((n) => String(n.status ?? "").toLowerCase() === "failed");
  if (failed) throw new Error(`Framia node failed: ${failed.error ?? "unknown"}`);

  const url = pickVideoUrl(finalNodes) || (await resolveResourceUrl(token, finalNodes));
  if (!url) throw new Error("Framia: video URL tidak ditemukan pada output run");
  opts.onProgress?.("Framia: selesai", 100);
  return url;
}