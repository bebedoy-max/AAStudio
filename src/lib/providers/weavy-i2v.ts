// Weavy Image-to-Video — wildcard recipe per model.
// Recipes mirror the motion-control style: import(image) → custommodelV2 with
// kind.parameters aligned to each fal-ai model's real OpenAPI enum values.
// Fetched from https://fal.ai/api/openapi/queue/openapi.json (2026-07).
import {
  WEAVY_API,
  getActiveWeavyAccessToken,
  rotateWeavyToken,
  createWeavyRecipe,
  saveWeavyRecipe,
  approveWeavyModel,
  executeWeavyBatch,
  uploadWeavyAssetWithRetry,
  resolveWeavyAssetUrl,
} from "./weavy";

const mkId = () => Math.random().toString(36).substring(2, 8);

type ParamType = "string" | "number" | "integer" | "boolean";
type ParamSpec = {
  id: string;
  type: ParamType;
  enum?: (string | number)[];
  default?: string | number | boolean;
};

type ModelConfig = {
  endpoint: string;              // fal endpoint id
  displayName: string;
  imageHandleId: string;         // "image_url" atau "start_image_url"
  imageValidType: string;        // biasanya "image"
  buildParams: (o: { prompt: string; duration: number; ratio: string }) => Record<string, unknown>;
  paramSpecs: ParamSpec[];       // dipakai bikin kind.parameters yang valid
};

/** helper: closest enum value */
function pickEnum<T extends string | number>(target: T, options: T[]): T {
  if (options.includes(target)) return target;
  // numeric best-effort
  if (typeof target === "number") {
    const nums = options.filter((o) => typeof o === "number") as number[];
    if (nums.length) return nums.reduce((a, b) => (Math.abs(b - target) < Math.abs(a - target) ? b : a)) as T;
  }
  if (typeof target === "string") {
    const asNum = Number(target);
    if (!Number.isNaN(asNum)) {
      const nums = options.map(Number).filter((n) => !Number.isNaN(n));
      if (nums.length) {
        const closest = nums.reduce((a, b) => (Math.abs(b - asNum) < Math.abs(a - asNum) ? b : a));
        const match = options.find((o) => Number(o) === closest);
        if (match !== undefined) return match;
      }
    }
  }
  return options[0];
}

const KLING_ASPECTS = ["16:9", "9:16", "1:1"];
const SORA_ASPECTS = ["auto", "9:16", "16:9"];
const VEO_ASPECTS = ["auto", "16:9", "9:16"];
const SEEDANCE_ASPECTS = ["auto", "21:9", "16:9", "4:3", "1:1", "3:4", "9:16"];
const WAN_ASPECTS = ["auto", "16:9", "9:16", "1:1"];

const WEAVY_I2V_MODELS: Record<string, ModelConfig> = {
  // Kling 2.1 Standard
  "kling-2.1": {
    endpoint: "fal-ai/kling-video/v2.1/standard/image-to-video",
    displayName: "Kling V2.1 I2V",
    imageHandleId: "image_url",
    imageValidType: "image",
    buildParams: ({ prompt, duration, ratio }) => ({
      prompt,
      duration: pickEnum(String(duration), ["5", "10"]),
      aspect_ratio: pickEnum(ratio, KLING_ASPECTS),
      cfg_scale: 0.5,
      negative_prompt: "blur, distort, and low quality",
    }),
    paramSpecs: [
      { id: "prompt", type: "string" },
      { id: "duration", type: "string", enum: ["5", "10"], default: "5" },
      { id: "aspect_ratio", type: "string", enum: KLING_ASPECTS, default: "16:9" },
      { id: "cfg_scale", type: "number", default: 0.5 },
      { id: "negative_prompt", type: "string", default: "blur, distort, and low quality" },
    ],
  },
  "kling-1.6-standard": {
    endpoint: "fal-ai/kling-video/v1.6/standard/image-to-video",
    displayName: "Kling V1.6 Standard I2V",
    imageHandleId: "image_url",
    imageValidType: "image",
    buildParams: ({ prompt, duration, ratio }) => ({
      prompt,
      duration: pickEnum(String(duration), ["5", "10"]),
      aspect_ratio: pickEnum(ratio, KLING_ASPECTS),
    }),
    paramSpecs: [
      { id: "prompt", type: "string" },
      { id: "duration", type: "string", enum: ["5", "10"], default: "5" },
      { id: "aspect_ratio", type: "string", enum: KLING_ASPECTS, default: "16:9" },
    ],
  },
  "kling-1.6-pro": {
    endpoint: "fal-ai/kling-video/v1.6/pro/image-to-video",
    displayName: "Kling V1.6 Pro I2V",
    imageHandleId: "image_url",
    imageValidType: "image",
    buildParams: ({ prompt, duration, ratio }) => ({
      prompt,
      duration: pickEnum(String(duration), ["5", "10"]),
      aspect_ratio: pickEnum(ratio, KLING_ASPECTS),
    }),
    paramSpecs: [
      { id: "prompt", type: "string" },
      { id: "duration", type: "string", enum: ["5", "10"], default: "5" },
      { id: "aspect_ratio", type: "string", enum: KLING_ASPECTS, default: "16:9" },
    ],
  },
  // Kling V3 Pro — uses start_image_url + optional generate_audio
  "kling-3-pro": {
    endpoint: "fal-ai/kling-video/v3/pro/image-to-video",
    displayName: "Kling V3 Pro I2V",
    imageHandleId: "start_image_url",
    imageValidType: "image",
    buildParams: ({ prompt, duration, ratio }) => ({
      prompt,
      duration: pickEnum(String(duration), ["3","4","5","6","7","8","9","10","11","12","13","14","15"]),
      aspect_ratio: pickEnum(ratio, KLING_ASPECTS),
      generate_audio: true,
      cfg_scale: 0.5,
      shot_type: "customize",
      negative_prompt: "blur, distort, and low quality",
    }),
    paramSpecs: [
      { id: "prompt", type: "string" },
      { id: "duration", type: "string", enum: ["3","4","5","6","7","8","9","10","11","12","13","14","15"], default: "5" },
      { id: "aspect_ratio", type: "string", enum: KLING_ASPECTS, default: "16:9" },
      { id: "generate_audio", type: "boolean", default: true },
      { id: "cfg_scale", type: "number", default: 0.5 },
      { id: "shot_type", type: "string", enum: ["customize", "intelligent"], default: "customize" },
      { id: "negative_prompt", type: "string", default: "blur, distort, and low quality" },
    ],
  },
  // Seedance v1 Pro
  seedance: {
    endpoint: "fal-ai/bytedance/seedance/v1/pro/image-to-video",
    displayName: "Seedance V1 Pro I2V",
    imageHandleId: "image_url",
    imageValidType: "image",
    buildParams: ({ prompt, duration, ratio }) => ({
      prompt,
      duration: pickEnum(String(duration), ["2","3","4","5","6","7","8","9","10","11","12"]),
      aspect_ratio: pickEnum(ratio, SEEDANCE_ASPECTS),
      resolution: "1080p",
      camera_fixed: false,
    }),
    paramSpecs: [
      { id: "prompt", type: "string" },
      { id: "duration", type: "string", enum: ["2","3","4","5","6","7","8","9","10","11","12"], default: "5" },
      { id: "aspect_ratio", type: "string", enum: SEEDANCE_ASPECTS, default: "auto" },
      { id: "resolution", type: "string", enum: ["480p","720p","1080p"], default: "1080p" },
      { id: "camera_fixed", type: "boolean", default: false },
    ],
  },
  // Seedance 2.0
  "seedance-2": {
    endpoint: "bytedance/seedance-2.0/image-to-video",
    displayName: "Seedance 2.0 I2V",
    imageHandleId: "image_url",
    imageValidType: "image",
    buildParams: ({ prompt, duration, ratio }) => ({
      prompt,
      duration: pickEnum(String(duration), ["auto","4","5","6","7","8","9","10","11","12","13","14","15"]),
      aspect_ratio: pickEnum(ratio, SEEDANCE_ASPECTS),
      resolution: "720p",
      generate_audio: true,
    }),
    paramSpecs: [
      { id: "prompt", type: "string" },
      { id: "duration", type: "string", enum: ["auto","4","5","6","7","8","9","10","11","12","13","14","15"], default: "auto" },
      { id: "aspect_ratio", type: "string", enum: SEEDANCE_ASPECTS, default: "auto" },
      { id: "resolution", type: "string", enum: ["480p","720p","1080p","4k"], default: "720p" },
      { id: "generate_audio", type: "boolean", default: true },
    ],
  },
  // Wan 2.2 Turbo
  "wan-i2v": {
    endpoint: "fal-ai/wan/v2.2-a14b/image-to-video/turbo",
    displayName: "Wan 2.2 Turbo I2V",
    imageHandleId: "image_url",
    imageValidType: "image",
    buildParams: ({ prompt, ratio }) => ({
      prompt,
      aspect_ratio: pickEnum(ratio, WAN_ASPECTS),
      resolution: "720p",
    }),
    paramSpecs: [
      { id: "prompt", type: "string" },
      { id: "aspect_ratio", type: "string", enum: WAN_ASPECTS, default: "auto" },
      { id: "resolution", type: "string", enum: ["480p","580p","720p"], default: "720p" },
    ],
  },
  // Veo 3 (fast)
  "veo-3": {
    endpoint: "fal-ai/veo3/fast/image-to-video",
    displayName: "Veo 3 Fast I2V",
    imageHandleId: "image_url",
    imageValidType: "image",
    buildParams: ({ prompt, duration, ratio }) => ({
      prompt,
      duration: `${pickEnum(String(duration), ["4","6","8"])}s`,
      aspect_ratio: pickEnum(ratio, VEO_ASPECTS),
      resolution: "720p",
      generate_audio: true,
    }),
    paramSpecs: [
      { id: "prompt", type: "string" },
      { id: "duration", type: "string", enum: ["4s","6s","8s"], default: "8s" },
      { id: "aspect_ratio", type: "string", enum: VEO_ASPECTS, default: "auto" },
      { id: "resolution", type: "string", enum: ["720p","1080p"], default: "720p" },
      { id: "generate_audio", type: "boolean", default: true },
    ],
  },
  // Veo 3.1
  "veo-3.1": {
    endpoint: "fal-ai/veo3.1/image-to-video",
    displayName: "Veo 3.1 I2V",
    imageHandleId: "image_url",
    imageValidType: "image",
    buildParams: ({ prompt, duration, ratio }) => ({
      prompt,
      duration: `${pickEnum(String(duration), ["4","6","8"])}s`,
      aspect_ratio: pickEnum(ratio, ["auto","16:9","9:16"]),
      resolution: "1080p",
      generate_audio: true,
    }),
    paramSpecs: [
      { id: "prompt", type: "string" },
      { id: "duration", type: "string", enum: ["4s","6s","8s"], default: "8s" },
      { id: "aspect_ratio", type: "string", enum: ["auto","16:9","9:16"], default: "auto" },
      { id: "resolution", type: "string", enum: ["720p","1080p","4k"], default: "1080p" },
      { id: "generate_audio", type: "boolean", default: true },
    ],
  },
  // Sora 2 — integer duration, resolution limited to auto|720p
  sora: {
    endpoint: "fal-ai/sora-2/image-to-video",
    displayName: "Sora 2 I2V",
    imageHandleId: "image_url",
    imageValidType: "image",
    buildParams: ({ prompt, duration, ratio }) => ({
      prompt,
      duration: pickEnum(duration, [4, 8, 12, 16, 20]),
      aspect_ratio: pickEnum(ratio, SORA_ASPECTS),
      resolution: "auto",
    }),
    paramSpecs: [
      { id: "prompt", type: "string" },
      { id: "duration", type: "integer", enum: [4, 8, 12, 16, 20], default: 4 },
      { id: "aspect_ratio", type: "string", enum: SORA_ASPECTS, default: "auto" },
      { id: "resolution", type: "string", enum: ["auto","720p"], default: "auto" },
    ],
  },
  "sora-2": {
    endpoint: "fal-ai/sora-2/image-to-video",
    displayName: "Sora 2 I2V",
    imageHandleId: "image_url",
    imageValidType: "image",
    buildParams: ({ prompt, duration, ratio }) => ({
      prompt,
      duration: pickEnum(duration, [4, 8, 12, 16, 20]),
      aspect_ratio: pickEnum(ratio, SORA_ASPECTS),
      resolution: "auto",
    }),
    paramSpecs: [
      { id: "prompt", type: "string" },
      { id: "duration", type: "integer", enum: [4, 8, 12, 16, 20], default: 4 },
      { id: "aspect_ratio", type: "string", enum: SORA_ASPECTS, default: "auto" },
      { id: "resolution", type: "string", enum: ["auto","720p"], default: "auto" },
    ],
  },
  // Minimax Hailuo 02 Pro — prompt + image only
  "hailuo-02-pro": {
    endpoint: "fal-ai/minimax/hailuo-02/pro/image-to-video",
    displayName: "Hailuo 02 Pro I2V",
    imageHandleId: "image_url",
    imageValidType: "image",
    buildParams: ({ prompt }) => ({ prompt, prompt_optimizer: true }),
    paramSpecs: [
      { id: "prompt", type: "string" },
      { id: "prompt_optimizer", type: "boolean", default: true },
    ],
  },
};

export function getWeavyI2VModelKeys(): string[] {
  return Object.keys(WEAVY_I2V_MODELS);
}

function mkImageImportNode(id: string, url: string) {
  return {
    id, type: "import", dragHandle: ".node-header",
    owner: null, visibility: null, isModel: false,
    data: {
      handles: { output: { file: { type: "any", label: "File", order: 0, format: "uri" } } },
      name: "File", color: "Yambo_Blue", dark_color: "Yambo_Blue_Dark", border_color: "Yambo_Blue_Stroke",
      files: [{ type: "image", url, publicId: "uploads/" + mkId(), id: mkId(), name: "image.jpg", insertionOrder: 0 }],
      result: { type: "image", url, publicId: "uploads/" + mkId(), id: mkId(), name: "image.jpg", insertionOrder: 0 },
      output: { file: { type: "image", url, publicId: "uploads/" + mkId(), id: mkId(), name: "image.jpg", insertionOrder: 0 } },
      version: 3,
    },
    position: { x: 80, y: 200 }, width: 460, height: 400,
  };
}

function toConstraint(spec: ParamSpec) {
  if (spec.enum) return { type: "enum", options: spec.enum };
  if (spec.type === "boolean") return { type: "boolean" };
  if (spec.type === "number" || spec.type === "integer") return { type: "number" };
  return { type: "string" };
}
function toDataType(spec: ParamSpec): string {
  if (spec.type === "integer") return "number";
  return spec.type;
}

function buildI2VRecipe(modelKey: string, imageUrl: string, prompt: string, duration: number, ratio: string) {
  const cfg = WEAVY_I2V_MODELS[modelKey] || WEAVY_I2V_MODELS["kling-2.1"];
  const model = cfg.endpoint;
  const now = Date.now();
  const n1 = `n_${now}_img`;
  const n2 = `n_${now}_model`;
  const imgNode = mkImageImportNode(n1, imageUrl);
  const params = { ...cfg.buildParams({ prompt, duration, ratio }), [cfg.imageHandleId]: imageUrl };

  const kindParameters = cfg.paramSpecs.map((spec) => {
    const value = (params as Record<string, unknown>)[spec.id];
    const dataType = toDataType(spec);
    return [
      {
        id: spec.id,
        title: spec.id,
        constraint: toConstraint(spec),
        defaultValue: { type: dataType, value: spec.default ?? value ?? "" },
      },
      { type: "value", data: { type: dataType, value: value ?? spec.default ?? "" } },
    ];
  });

  const inputHandle = {
    [cfg.imageHandleId]: {
      id: `input-${cfg.imageHandleId}`,
      type: cfg.imageValidType,
      label: "image",
      format: "text",
      required: true,
    },
  };

  const modelNode = {
    id: n2,
    type: "custommodelV2",
    dragHandle: ".node-header",
    owner: null, visibility: "private", isModel: true,
    data: {
      handles: {
        input: {
          prompt: { id: "input-prompt", type: "text", label: "prompt", format: "text", required: false },
          ...inputHandle,
        },
        output: { result: { id: "output-result", type: "video", label: "result", order: 0, format: "uri" } },
      },
      name: cfg.displayName,
      color: "Red",
      menu: { icon: "EmojiObjectsIcon", isModel: true, displayName: cfg.displayName },
      model: { name: model, service: "fal_imported", version: model },
      params,
      version: 3,
      kind: {
        type: "wildcard",
        model: { type: "predefined", name: model, version: model, service: "fal_imported" },
        inputs: [
          [{ id: "prompt", title: "prompt", validTypes: ["text"], required: false }, null],
          [
            { id: cfg.imageHandleId, title: "image", validTypes: [cfg.imageValidType], required: true },
            { nodeId: n1, outputId: "file" },
          ],
        ],
        parameters: kindParameters,
        outputs: [{ id: "result", title: "result", dataType: "video" }],
      },
      generations: [], selectedIndex: 0, cameraLocked: false, result: [], output: {}, selectedOutput: 0,
    },
    position: { x: 600, y: 300 }, width: 460, height: 560,
  };

  const edges = [{
    id: "e-" + mkId(),
    source: n1, target: n2,
    sourceHandle: `${n1}-output-file`,
    targetHandle: `${n2}-input-${cfg.imageHandleId}`,
    type: "custom",
    data: { sourceColor: "Yambo_Blue", targetColor: "Red", sourceHandleType: "any", targetHandleType: cfg.imageValidType },
  }];

  return { model, nodes: [imgNode, modelNode], edges };
}

async function pollWeavyVideo(
  recipeId: string,
  batchId: string,
  accessToken: string,
  inputImageUrl: string,
  onProgress?: (msg: string, pct?: number) => void,
  maxAttempts = 180,
): Promise<string> {
  for (let a = 0; a < maxAttempts; a++) {
    const delay = a < 30 ? 8000 : a < 60 ? 10000 : 15000;
    await new Promise((r) => setTimeout(r, delay));
    onProgress?.(`Rendering... (${a + 1})`, Math.min(94, 30 + Math.round((a / maxAttempts) * 64)));
    try {
      const r = await fetch(`${WEAVY_API}/v1/batches/recipes/${recipeId}/batches/${batchId}/status`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!r.ok) continue;
      const d = await r.json();
      const st = String(d.recipeRuns?.[0]?.status || d.status || d.state || "unknown");
      if (["completed", "COMPLETED", "done", "success"].includes(st)) {
        if (d.recipeRuns?.[0]?.nodeRuns) {
          for (let i = d.recipeRuns[0].nodeRuns.length - 1; i >= 0; i--) {
            const nr = d.recipeRuns[0].nodeRuns[i];
            let ro = nr.result;
            if (Array.isArray(ro) && ro.length > 0) ro = ro[0];
            const candidates = [
              ro?.url, ro?.video_url,
              nr.output?.file?.url, nr.output?.video_url, nr.output?.url,
              ...((nr.generations || []) as { url?: string; video_url?: string }[]).map((g) => g.url || g.video_url),
            ].filter((u): u is string => !!u && /\.mp4(\?|$)/i.test(u) && u !== inputImageUrl);
            if (candidates.length > 0) return candidates[0];
          }
        }
        const u = d.output?.video_url || d.output?.url;
        if (u) return u;
        throw new Error("Weavy: video URL tidak ditemukan di response");
      }
      if (["failed", "FAILED", "error"].includes(st)) {
        const ne = (d.recipeRuns?.[0]?.nodeRuns || [])
          .map((nr: { error?: string; errorMessage?: string }) => nr.error || nr.errorMessage)
          .filter(Boolean).join(" | ");
        throw new Error((d.error || d.message || "Weavy generation failed") + (ne ? " | " + ne : ""));
      }
    } catch (e) {
      if (e instanceof Error && /Weavy generation failed|failed \|/i.test(e.message)) throw e;
      if (a > 8) throw e;
    }
  }
  throw new Error("Weavy timeout: I2V terlalu lama");
}

export type WeavyI2VOpts = {
  modelKey: string;
  imageFile: File;
  prompt: string;
  duration: number;
  ratio: string;
  onProgress?: (msg: string, pct?: number) => void;
};

export async function generateWeavyI2V(opts: WeavyI2VOpts): Promise<string> {
  const active = await getActiveWeavyAccessToken();
  if (!active) throw new Error("Belum ada Weavy token aktif di Kelola Token");

  opts.onProgress?.("Upload image ke Weavy...", 10);

  const attempt = async (accessToken: string): Promise<string> => {
    const up = await uploadWeavyAssetWithRetry(opts.imageFile, `i2v_${Date.now()}.jpg`, accessToken);
    const imageUrl = resolveWeavyAssetUrl(up, "image");
    const built = buildI2VRecipe(opts.modelKey, imageUrl, opts.prompt, opts.duration, opts.ratio);
    opts.onProgress?.("Menyusun recipe...", 20);
    const { id: recipeId, v3 } = await createWeavyRecipe(accessToken);
    await saveWeavyRecipe(recipeId, { nodes: built.nodes, edges: built.edges, v3 }, accessToken);
    await approveWeavyModel(built.model, accessToken);
    opts.onProgress?.("Submit ke Weavy...", 30);
    const { batchId } = await executeWeavyBatch(recipeId, built.nodes, built.edges, accessToken, built.model);
    return await pollWeavyVideo(recipeId, batchId, accessToken, imageUrl, opts.onProgress);
  };

  try {
    return await attempt(active.accessToken);
  } catch (e) {
    const msg = (e as Error).message || String(e);
    if (/insufficient|401|403|credits|quota/i.test(msg)) {
      const next = await rotateWeavyToken(active.id);
      if (next) return await attempt(next.accessToken);
    }
    throw e;
  }
}
