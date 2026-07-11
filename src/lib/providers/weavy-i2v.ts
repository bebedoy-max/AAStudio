// Weavy Image-to-Video — wildcard recipe (image + prompt → video).
// Model IDs pointing at fal_imported endpoints; approve model + execute batch.
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

// Friendly modelKey → fal-ai endpoint on Weavy
const WEAVY_I2V_MODELS: Record<string, { model: string; displayName: string }> = {
  "kling-2.1": { model: "fal-ai/kling-video/v2.1/standard/image-to-video", displayName: "Kling V2.1 I2V" },
  "kling-1.6-standard": { model: "fal-ai/kling-video/v1.6/standard/image-to-video", displayName: "Kling V1.6 Standard I2V" },
  "kling-1.6-pro": { model: "fal-ai/kling-video/v1.6/pro/image-to-video", displayName: "Kling V1.6 Pro I2V" },
  seedance: { model: "fal-ai/bytedance/seedance/v1/pro/image-to-video", displayName: "Seedance I2V" },
  "wan-i2v": { model: "fal-ai/wan/v2.2-a14b/image-to-video/turbo", displayName: "Wan 2.2 I2V" },
  "veo-3": { model: "fal-ai/veo3/fast/image-to-video", displayName: "Veo 3 I2V" },
  "veo-3.1": { model: "fal-ai/veo3/fast/image-to-video", displayName: "Veo 3 I2V" },
  sora: { model: "fal-ai/sora-2/image-to-video", displayName: "Sora 2 I2V" },
  "sora-2": { model: "fal-ai/sora-2/image-to-video", displayName: "Sora 2 I2V" },
};

function mkImageImportNode(id: string, url: string) {
  return {
    id,
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
      files: [{ type: "image", url, publicId: "uploads/" + mkId(), id: mkId(), name: "image.jpg", insertionOrder: 0 }],
      result: { type: "image", url, publicId: "uploads/" + mkId(), id: mkId(), name: "image.jpg", insertionOrder: 0 },
      output: { file: { type: "image", url, publicId: "uploads/" + mkId(), id: mkId(), name: "image.jpg", insertionOrder: 0 } },
      version: 3,
    },
    position: { x: 80, y: 200 },
    width: 460,
    height: 400,
  };
}

function buildI2VRecipe(modelKey: string, imageUrl: string, prompt: string, duration: number, ratio: string) {
  const info = WEAVY_I2V_MODELS[modelKey] || WEAVY_I2V_MODELS["kling-2.1"];
  const model = info.model;
  const n1 = "n_" + Date.now() + "_img";
  const n2 = "n_" + Date.now() + "_model";
  const imgNode = mkImageImportNode(n1, imageUrl);

  const params: Record<string, unknown> = {
    prompt,
    image_url: imageUrl,
    duration: String(duration),
    aspect_ratio: ratio,
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
          prompt: { id: "input-prompt", type: "text", label: "prompt", format: "text", required: false },
          image_url: { id: "input-image_url", type: "image", label: "image", format: "text", required: true },
        },
        output: { result: { id: "output-result", type: "video", label: "result", order: 0, format: "uri" } },
      },
      name: info.displayName,
      color: "Red",
      menu: { icon: "EmojiObjectsIcon", isModel: true, displayName: info.displayName },
      model: { name: model, service: "fal_imported", version: model },
      params,
      version: 3,
      kind: {
        type: "wildcard",
        model: { type: "predefined", name: model, version: model, service: "fal_imported" },
        inputs: [
          [{ id: "prompt", title: "prompt", validTypes: ["text"], required: false }, null],
          [
            { id: "image_url", title: "image", validTypes: ["image"], required: true },
            { nodeId: n1, outputId: "file" },
          ],
        ],
        parameters: [
          [
            { id: "prompt", title: "prompt", constraint: { type: "string" }, defaultValue: { type: "string", value: prompt } },
            { type: "value", data: { type: "string", value: prompt } },
          ],
          [
            { id: "duration", title: "duration", constraint: { type: "enum" }, defaultValue: { type: "string", value: String(duration) } },
            { type: "value", data: { type: "string", value: String(duration) } },
          ],
          [
            { id: "aspect_ratio", title: "aspect_ratio", constraint: { type: "enum" }, defaultValue: { type: "string", value: ratio } },
            { type: "value", data: { type: "string", value: ratio } },
          ],
        ],
        outputs: [{ id: "result", title: "result", dataType: "video" }],
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
    height: 560,
  };

  const edges = [
    {
      id: "e-" + mkId(),
      source: n1,
      target: n2,
      sourceHandle: `${n1}-output-file`,
      targetHandle: `${n2}-input-image_url`,
      type: "custom",
      data: { sourceColor: "Yambo_Blue", targetColor: "Red", sourceHandleType: "any", targetHandleType: "image" },
    },
  ];

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
              ro?.url,
              ro?.video_url,
              nr.output?.file?.url,
              nr.output?.video_url,
              nr.output?.url,
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
          .map((nr: { error?: string }) => nr.error).filter(Boolean).join(" | ");
        throw new Error((d.error || d.message || "Weavy generation failed") + (ne ? " | " + ne : ""));
      }
    } catch (e) {
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
