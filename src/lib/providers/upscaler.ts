// Upscaler / Enhance orchestrator — Topaz (via Weavy) & Magnific (direct API).
// Menerima 1..50 gambar, jalankan dengan concurrency terbatas, kembalikan URL hasil.
import {
  compressImage,
  createWeavyRecipe,
  saveWeavyRecipe,
  approveWeavyModel,
  executeWeavyBatch,
  uploadWeavyAssetWithRetry,
  resolveWeavyAssetUrl,
  getActiveWeavyAccessToken,
  rotateWeavyToken,
  WEAVY_API,
} from "./weavy";

// ------------------------------------------------------------------
// Catalog
// ------------------------------------------------------------------
export type UpscalerProvider = "topaz" | "magnific";
export type UpscalerMode = "upscale" | "enhance";

export type TopazParams = {
  model:
    | "Standard V2"
    | "Low Resolution V2"
    | "CGI"
    | "High Fidelity V2"
    | "Text Refine"
    | "Recovery"
    | "Redefine"
    | "Recovery V2"
    | "Standard MAX"
    | "Wonder"
    | "Wonder 3";
  upscale_factor: 1 | 2 | 3 | 4;
  output_format: "jpeg" | "png";
  crop_to_fill?: boolean;
};

export type MagnificParams = {
  scale_factor: "2x" | "4x" | "8x" | "16x";
  engine: "automatic" | "magnific_illusio" | "magnific_sharpy" | "magnific_sparkle";
  optimized_for:
    | "standard"
    | "soft_portraits"
    | "hard_portraits"
    | "art_n_illustration"
    | "videogame_assets"
    | "nature_n_landscapes"
    | "films_n_photography"
    | "3d_renders"
    | "science_fiction_n_horror";
  creativity: number; // -10..10
  hdr: number;
  resemblance: number;
  fractality: number;
  prompt?: string;
};

export const TOPAZ_MODELS: TopazParams["model"][] = [
  "Standard V2",
  "Low Resolution V2",
  "CGI",
  "High Fidelity V2",
  "Text Refine",
  "Recovery",
  "Redefine",
  "Recovery V2",
  "Standard MAX",
  "Wonder",
  "Wonder 3",
];

export const MAG_ENGINES: MagnificParams["engine"][] = [
  "automatic",
  "magnific_illusio",
  "magnific_sharpy",
  "magnific_sparkle",
];
export const MAG_OPTIMIZED: MagnificParams["optimized_for"][] = [
  "standard",
  "soft_portraits",
  "hard_portraits",
  "art_n_illustration",
  "videogame_assets",
  "nature_n_landscapes",
  "films_n_photography",
  "3d_renders",
  "science_fiction_n_horror",
];

// ------------------------------------------------------------------
// Topaz via Weavy — build recipe fal-ai/topaz/upscale/image
// ------------------------------------------------------------------
const mkId = () => Math.random().toString(36).substring(2, 8);

function buildTopazRecipe(imageUrl: string, p: TopazParams) {
  const model = "fal-ai/topaz/upscale/image";
  const n1 = `n_${Date.now()}_img`;
  const n2 = `n_${Date.now()}_mdl`;
  const imgNode = {
    id: n1,
    type: "import",
    dragHandle: ".node-header",
    owner: null,
    visibility: null,
    isModel: false,
    data: {
      handles: { output: { file: { type: "any", label: "File", order: 0, format: "uri" } } },
      name: "File",
      color: "Yambo_Blue",
      dark_color: "Yambo_Blue_Dark",
      border_color: "Yambo_Blue_Stroke",
      files: [{ type: "image", url: imageUrl, publicId: "uploads/" + mkId(), id: mkId(), name: "image.jpg", insertionOrder: 0 }],
      result: { type: "image", url: imageUrl, publicId: "uploads/" + mkId(), id: mkId(), name: "image.jpg", insertionOrder: 0 },
      output: { file: { type: "image", url: imageUrl, publicId: "uploads/" + mkId(), id: mkId(), name: "image.jpg", insertionOrder: 0 } },
      version: 3,
    },
    position: { x: 80, y: 200 },
    width: 460,
    height: 400,
  };
  const params = {
    model: p.model,
    upscale_factor: p.upscale_factor,
    output_format: p.output_format,
    crop_to_fill: !!p.crop_to_fill,
  };
  const modelNode = {
    id: n2,
    type: "custommodelV2",
    dragHandle: ".node-header",
    owner: null,
    visibility: "private",
    isModel: true,
    data: {
      handles: {
        input: {
          image_url: { id: "input-image_url", type: "image", label: "image", format: "text", required: true },
        },
        output: { result: { id: "output-result", type: "image", label: "result", order: 0, format: "uri" } },
      },
      name: "Topaz Upscale",
      color: "Red",
      menu: { icon: "EmojiObjectsIcon", isModel: true, displayName: "Topaz Upscale" },
      model: { name: model, service: "fal_imported", version: model },
      params,
      version: 3,
      kind: {
        type: "wildcard",
        model: { type: "predefined", name: model, version: model, service: "fal_imported" },
        inputs: [
          [{ id: "image_url", title: "image", validTypes: ["image"], required: true }, { nodeId: n1, outputId: "file" }],
        ],
        parameters: [
          [{ id: "model", title: "model", constraint: { type: "enum" }, defaultValue: { type: "string", value: "Standard V2" } }, { type: "value", data: { type: "string", value: p.model } }],
          [{ id: "upscale_factor", title: "upscale_factor", constraint: { type: "number" }, defaultValue: { type: "number", value: 2 } }, { type: "value", data: { type: "number", value: p.upscale_factor } }],
          [{ id: "output_format", title: "output_format", constraint: { type: "enum" }, defaultValue: { type: "string", value: "jpeg" } }, { type: "value", data: { type: "string", value: p.output_format } }],
          [{ id: "crop_to_fill", title: "crop_to_fill", constraint: { type: "boolean" }, defaultValue: { type: "boolean", value: false } }, { type: "value", data: { type: "boolean", value: !!p.crop_to_fill } }],
        ],
        outputs: [{ id: "result", title: "result", dataType: "image" }],
      },
      generations: [],
      selectedIndex: 0,
      cameraLocked: false,
      result: [],
      output: {},
      selectedOutput: 0,
    },
    position: { x: 600, y: 300 },
    width: 460,
    height: 500,
  };
  const edges = [{
    id: "e-" + mkId(),
    source: n1,
    target: n2,
    sourceHandle: `${n1}-output-file`,
    targetHandle: `${n2}-input-image_url`,
    type: "custom",
    data: { sourceColor: "Yambo_Blue", targetColor: "Red", sourceHandleType: "any", targetHandleType: "image" },
  }];
  return { model, nodes: [imgNode, modelNode], edges };
}

async function pollWeavyImage(recipeId: string, batchId: string, accessToken: string, inputUrl: string, maxAttempts = 120): Promise<string> {
  for (let a = 0; a < maxAttempts; a++) {
    const delay = a < 20 ? 5000 : a < 40 ? 8000 : 12000;
    await new Promise((r) => setTimeout(r, delay));
    try {
      const r = await fetch(`${WEAVY_API}/v1/batches/recipes/${recipeId}/batches/${batchId}/status`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!r.ok) continue;
      const d = await r.json();
      const st = String(d.recipeRuns?.[0]?.status || d.status || "unknown");
      const runs = d.recipeRuns?.[0]?.nodeRuns || [];
      if (["completed", "COMPLETED", "done", "success"].includes(st)) {
        for (let i = runs.length - 1; i >= 0; i--) {
          const nr = runs[i];
          let ro = nr.result;
          if (Array.isArray(ro) && ro.length > 0) ro = ro[0];
          const candidates = [
            ro?.url, ro?.image_url,
            nr.output?.file?.url, nr.output?.image_url, nr.output?.url,
            ...((nr.generations || []) as { url?: string; image_url?: string }[]).map((g) => g.url || g.image_url),
          ].filter((u): u is string => !!u && /\.(png|jpe?g|webp)(\?|$)/i.test(u)).filter((u) => u !== inputUrl);
          if (candidates.length > 0) return candidates[0];
        }
        throw new Error("Weavy: URL hasil tidak ditemukan");
      }
      if (["failed", "FAILED", "error"].includes(st)) {
        const ne = runs?.length
          ? (d.recipeRuns[0].nodeRuns as { error?: string }[]).map((n) => n.error).filter(Boolean).join(" | ")
          : "";
        throw new Error((d.error || d.message || "Weavy generation failed") + (ne ? " | " + ne : ""));
      }
    } catch (e) {
      if (a > 8) throw e;
    }
  }
  throw new Error("Weavy timeout");
}

async function runTopazOne(file: File, params: TopazParams, onLog: (m: string) => void): Promise<string> {
  let lastErr: Error | null = null;
  const tried = new Set<string>();
  while (true) {
    const active = await getActiveWeavyAccessToken();
    if (!active) break;
    if (tried.has(active.id)) break;
    tried.add(active.id);
    try {
      onLog("Compress + upload ke Weavy...");
      const compressed = file.size > 8 * 1024 * 1024 ? await compressImage(file, 2048, 0.9) : file;
      const uploaded = await uploadWeavyAssetWithRetry(compressed, compressed.name || "image.jpg", active.accessToken);
      const imageUrl = resolveWeavyAssetUrl(uploaded, "image");
      const built = buildTopazRecipe(imageUrl, params);
      onLog("Create recipe...");
      const { id: recipeId, v3 } = await createWeavyRecipe(active.accessToken);
      await saveWeavyRecipe(recipeId, { nodes: built.nodes, edges: built.edges, v3 }, active.accessToken);
      await approveWeavyModel(built.model, active.accessToken);
      onLog("Execute batch...");
      const { batchId } = await executeWeavyBatch(recipeId, built.nodes, built.edges, active.accessToken, built.model);
      onLog("Menunggu hasil...");
      return await pollWeavyImage(recipeId, batchId, active.accessToken, imageUrl);
    } catch (e) {
      lastErr = e instanceof Error ? e : new Error(String(e));
      if (!/insufficient|credits?|quota|balance|402|not enough/i.test(lastErr.message)) throw lastErr;
      onLog("Token kehabisan credit, rotate...");
      await rotateWeavyToken(active.id);
    }
  }
  throw lastErr ?? new Error("Belum ada Weavy token aktif");
}

// ------------------------------------------------------------------
// Magnific — via /api/public/magnific proxy (base64 image)
// ------------------------------------------------------------------
function getFirstMagnificKey(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem("aatools.magnific.keys");
    if (!raw) return null;
    const list = JSON.parse(raw) as { key: string }[];
    return list?.[0]?.key || null;
  } catch { return null; }
}

async function fileToBase64(file: File): Promise<string> {
  const target = file.size > 6 * 1024 * 1024 ? await compressImage(file, 2048, 0.9) : file;
  const buf = await target.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

async function magnificCall(action: "submit" | "status", body: Record<string, unknown>) {
  const r = await fetch("/api/public/magnific", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...body }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j?.error || `Magnific ${r.status}`);
  return j as Record<string, unknown>;
}

async function runMagnificOne(file: File, mode: UpscalerMode, params: MagnificParams, onLog: (m: string) => void): Promise<string> {
  const key = getFirstMagnificKey();
  if (!key) throw new Error("Belum ada Magnific API key di Kelola Token");
  const modelKey =
    mode === "enhance" ? "mag:image-upscaler-precision-v2" : "mag:image-upscaler-creative";

  onLog("Encode base64...");
  const image = await fileToBase64(file);

  const payload: Record<string, unknown> = {
    image,
    scale_factor: params.scale_factor,
    optimized_for: params.optimized_for,
    engine: params.engine,
    creativity: params.creativity,
    hdr: params.hdr,
    resemblance: params.resemblance,
    fractality: params.fractality,
  };
  if (params.prompt) payload.prompt = params.prompt;

  onLog(`Submit ke Magnific (${mode})...`);
  const sub = await magnificCall("submit", { apiKey: key, modelKey, payload });
  const d = (sub.data as Record<string, unknown> | undefined) ?? sub;
  const taskId = (d.task_id || d.id || d.taskId) as string | undefined;
  if (!taskId) throw new Error("Magnific: task id tidak ditemukan");

  const started = Date.now();
  const timeout = 15 * 60 * 1000;
  while (Date.now() - started < timeout) {
    await new Promise((r) => setTimeout(r, 5000));
    const st = await magnificCall("status", { apiKey: key, modelKey, taskId });
    const sd = (st.data as Record<string, unknown> | undefined) ?? st;
    const status = String(sd.status || sd.state || "").toUpperCase();
    onLog(`Poll: ${status || "unknown"}`);
    if (["COMPLETED", "SUCCESS", "SUCCEEDED", "DONE", "FINISHED"].includes(status)) {
      const gen = sd.generated;
      if (Array.isArray(gen) && gen.length > 0 && typeof gen[0] === "string") return gen[0] as string;
      const u = (sd.image_url || sd.output_url || (sd.result as { url?: string } | undefined)?.url) as string | undefined;
      if (u) return u;
      throw new Error("Magnific: URL hasil tidak ditemukan");
    }
    if (["FAILED", "ERROR", "CANCELED", "CANCELLED"].includes(status)) {
      throw new Error("Magnific: task gagal — " + (sd.error || sd.message || "unknown"));
    }
  }
  throw new Error("Magnific: timeout menunggu hasil");
}

// ------------------------------------------------------------------
// Public API
// ------------------------------------------------------------------
export type UpscaleJob = {
  index: number;
  file: File;
};

export type UpscaleOpts = {
  provider: UpscalerProvider;
  mode: UpscalerMode;
  topaz: TopazParams;
  magnific: MagnificParams;
  concurrency?: number;
  onStatus?: (r: { index: number; status: string; url?: string; error?: string }) => void;
  onLog?: (msg: string, level?: string) => void;
};

export async function runUpscale(jobs: UpscaleJob[], opts: UpscaleOpts): Promise<Array<{ index: number; url?: string; error?: string }>> {
  const results: Array<{ index: number; url?: string; error?: string }> = [];
  const concurrency = Math.max(1, Math.min(opts.concurrency ?? 2, 4));
  let cursor = 0;
  async function worker() {
    while (cursor < jobs.length) {
      const j = jobs[cursor++];
      const log = (m: string) => {
        opts.onStatus?.({ index: j.index, status: m });
        opts.onLog?.(`#${j.index + 1}: ${m}`);
      };
      try {
        log("mulai...");
        const url =
          opts.provider === "topaz"
            ? await runTopazOne(j.file, opts.topaz, log)
            : await runMagnificOne(j.file, opts.mode, opts.magnific, log);
        results.push({ index: j.index, url });
        opts.onStatus?.({ index: j.index, status: "done", url });
        opts.onLog?.(`#${j.index + 1}: done`, "success");
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        results.push({ index: j.index, error: msg });
        opts.onStatus?.({ index: j.index, status: "error", error: msg });
        opts.onLog?.(`#${j.index + 1}: ${msg}`, "error");
      }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return results.sort((a, b) => a.index - b.index);
}