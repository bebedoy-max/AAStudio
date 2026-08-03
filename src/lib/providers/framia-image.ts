// Framia Text-to-Image / Image-edit runner.
//
// Mirrors framia-i2v.ts but publishes a single "Image" node
// (node_interface: media.generate.image) on an ad-hoc workflow canvas.
// Optional reference images are uploaded to the project and wired into
// `prompt_inputs` so edit-capable models can consume them.

import {
  createFramiaProject,
  createWorkflowRun,
  fetchFramiaCreatorProfile,
  fetchFramiaProfile,
  findFramiaWorkspaceId,
  getResourceInfo,
  listFramiaProjects,
  runFramiaWithRotation,
  uploadFramiaAsset,
  waitForRunCompletion,
  type FramiaRunNode,
} from "./framia";

/* --------------------------------- models --------------------------------- */

const MODEL_LABELS: Record<string, string> = {
  "nano-banana-lite": "Nano Banana Lite",
  "nano-banana": "Nano Banana",
  "nano-banana-2": "Nano Banana 2",
  "nano-banana-pro": "Nano Banana Pro",
  "gpt-image-2": "GPT Image 2",
  "seedream-4": "Seedream 4.0",
  "seedream-4-0": "Seedream 4.0",
  "seedream-4-5": "Seedream 4.5",
  "seedream-5": "Seedream 5",
  "seedream-5-pro": "Seedream 5 Pro",
  "flux-1.1-pro": "Flux 1.1 Pro",
  "flux-max": "Flux Max",
  "ideogram-v3": "Ideogram v3",
};

export function resolveFramiaImageModelLabel(modelKey: string): string {
  const slug = modelKey
    .replace(/^framia:/, "")
    .replace(/^fr:/, "")
    .replace(/-edit$/, "");
  return MODEL_LABELS[slug] || slug;
}

/* --------------------------------- helpers -------------------------------- */

const rand = (n = 12) =>
  Array.from(crypto.getRandomValues(new Uint8Array(n)))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, n);

function pickImageUrl(nodes: FramiaRunNode[]): string | null {
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
  const projects = (await listFramiaProjects(token).catch(() => [])) as Array<
    Record<string, unknown>
  >;
  for (const p of projects) {
    const id = findFramiaWorkspaceId(p);
    if (id) return id;
  }
  return null;
}

function normalizeAspect(ratio: string): string {
  const known = ["1:1", "9:16", "16:9", "3:4", "4:3", "2:3", "3:2", "21:9"];
  if (known.includes(ratio)) return ratio;
  const [w, h] = ratio.split(":").map(Number);
  if (Number.isFinite(w) && Number.isFinite(h)) return w > h ? "16:9" : w < h ? "9:16" : "1:1";
  return "1:1";
}

function modelSlug(modelKey: string): string {
  return modelKey
    .replace(/^framia:/, "")
    .replace(/^fr:/, "")
    .replace(/-edit$/, "");
}

function compactObject(value: unknown, depth = 0): string {
  if (value == null) return "unknown";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (depth > 3) return "[object]";
  if (Array.isArray(value)) return value.map((item) => compactObject(item, depth + 1)).join("; ");
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const priority = ["message", "error", "detail", "reason", "code", "status"];
    const picked = priority
      .map((key) => {
        const item = obj[key];
        return item == null ? "" : `${key}: ${compactObject(item, depth + 1)}`;
      })
      .filter(Boolean)
      .join("; ");
    return picked || JSON.stringify(obj).slice(0, 600);
  }
  return String(value);
}

function normalizeFramiaResolution(value: string, modelKey: string): string {
  const v = (value || "").trim();
  const slug = modelSlug(modelKey);
  if (
    /^gpt-image/.test(slug) &&
    (!v || /^1K$/i.test(v) || /^default$/i.test(v) || /^standard$/i.test(v))
  ) {
    return "2K";
  }
  if (/^low$/i.test(v)) return "1K";
  if (/^medium$/i.test(v)) return "2K";
  if (/^high$/i.test(v)) return "4K";
  if (!v || /^default$/i.test(v) || /^standard$/i.test(v)) return "1K";
  return v;
}

async function fetchAsBlob(url: string): Promise<Blob> {
  try {
    const r = await fetch(url);
    if (r.ok) return await r.blob();
  } catch {
    /* fall through to proxy */
  }
  const r2 = await fetch(`/api/public/proxy-image?url=${encodeURIComponent(url)}`);
  if (!r2.ok) throw new Error(`Gagal mengambil gambar referensi (${r2.status})`);
  return await r2.blob();
}

/* ---------------------------------- run ----------------------------------- */

export type FramiaImageOpts = {
  token: string;
  prompt: string;
  modelKey: string; // e.g. "framia:seedream-5"
  aspectRatio?: string;
  resolution?: string; // "1K" | "2K" | "4K" | "1080p" ...
  referenceUrls?: string[];
  referenceFiles?: Blob[];
  onProgress?: (msg: string, pct?: number) => void;
};

export async function runFramiaImage(opts: FramiaImageOpts): Promise<string> {
  const { token, prompt } = opts;
  const model = resolveFramiaImageModelLabel(opts.modelKey);
  const aspect = normalizeAspect(opts.aspectRatio || "1:1");
  const resolution = normalizeFramiaResolution(opts.resolution || "1K", opts.modelKey);
  const refUrls = (opts.referenceUrls ?? []).filter(Boolean);
  const refFiles = opts.referenceFiles ?? [];
  const refs: Array<string | Blob> = [...refUrls, ...refFiles];
  opts.onProgress?.("Framia: membuat project canvas...", 8);
  const workspaceId = await resolveWorkspaceId(token);
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

  const imageNodeId = `image-${rand(12)}`;
  const inputNodes: Record<string, unknown> = {};
  const promptInputs: Array<Record<string, unknown>> = [];
  const readSources: Array<Record<string, unknown>> = [];

  if (refs.length) {
    opts.onProgress?.(`Framia: upload ${refs.length} gambar referensi...`, 20);
    for (let i = 0; i < refs.length; i++) {
      const src = refs[i];
      const blob = typeof src === "string" ? await fetchAsBlob(src) : src;
      const file = new File([blob], `ref_${Date.now()}_${i}.jpg`, {
        type: blob.type || "image/jpeg",
      });
      const uploaded = await uploadFramiaAsset(token, {
        projectId,
        threadId: threadId || projectId,
        file,
        filename: file.name,
        scene: "canvas_upload",
      });
      const refNodeId = `image-${rand(12)}`;
      inputNodes[refNodeId] = {
        output: {
          result: {
            kind: "resource_collection",
            media_type: "image",
            resources: [{ resource_id: uploaded.resource_id, media_type: "image" }],
          },
        },
      };
      promptInputs.push({
        label: "Image",
        node_id: refNodeId,
        content: { $ref: ["run", "input", "nodes", refNodeId, "output", "result"] },
      });
      readSources.push({
        source: "run_input",
        key: "nodes",
        path: [refNodeId, "output", "result"],
      });
    }
  }

  const imageParams: Record<string, unknown> = {
    gen_type: "image",
    model,
    prompt,
    aspect_ratio: aspect,
    resolution,
    ...(promptInputs.length ? { prompt_inputs: promptInputs } : {}),
  };

  opts.onProgress?.(`Framia: mengirim workflow ${model}...`, 40);
  const run = await createWorkflowRun(token, {
    workflowId: `wf_node_${rand(7)}_${rand(6)}`,
    workflowVersion: Date.now(),
    projectId,
    canvasId,
    sourceType: "ad_hoc",
    sourceId: imageNodeId,
    inputRefs: { nodes: inputNodes },
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
            id: imageNodeId,
            type: "Image",
            position: { x: 672, y: 302.5 },
            width: 320,
            height: 574,
            data: {
              label: "Image",
              node_type: "task",
              node_interface: "media.generate.image",
              input_refs: imageParams,
              ...(readSources.length ? { reads: { resources: { sources: readSources } } } : {}),
            },
          },
        ],
        edges: [],
      },
    },
  });

  const runId = String(run.run_id || run.id || "");
  if (!runId) throw new Error("Framia: run_id tidak dikembalikan");

  opts.onProgress?.("Framia: rendering gambar...", 55);
  const finalNodes = await waitForRunCompletion(token, runId, {
    timeoutMs: 10 * 60_000,
    intervalMs: 3_000,
    onTick: (nodes) => {
      const n = nodes.find((x) => String(x.node_id || "").startsWith("image-"));
      if (n) {
        const p =
          typeof n.progress === "number"
            ? Math.min(95, 55 + Math.round(n.progress * 0.4))
            : undefined;
        opts.onProgress?.(`Framia: ${n.status ?? "processing"}`, p);
      }
    },
  });

  const failed = finalNodes.find((n) => String(n.status ?? "").toLowerCase() === "failed");
  if (failed) {
    throw new Error(`Framia node failed: ${compactObject(failed.error ?? failed)}`);
  }

  const url = pickImageUrl(finalNodes) || (await resolveResourceUrl(token, finalNodes));
  if (!url) throw new Error("Framia: image URL tidak ditemukan pada output run");
  opts.onProgress?.("Framia: selesai", 100);
  return url;
}

/** Convenience wrapper: run with auto token rotation on credit/auth errors. */
export async function generateFramiaImage(
  opts: Omit<FramiaImageOpts, "token"> & {
    onRotate?: (nextIndex: number, total: number, reason: string) => void;
  },
): Promise<string> {
  const { onRotate, ...rest } = opts;
  return runFramiaWithRotation((token) => runFramiaImage({ ...rest, token }), { onRotate });
}
