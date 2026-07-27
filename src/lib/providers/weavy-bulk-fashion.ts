// Weavy bulk-fashion recipe: 1 karakter + 1 outfit → generate.
// Node yang dipakai (mirror web weavy.com):
//   - Nano Banana 2 Edit         → fal-ai/nano-banana-2/edit
//   - ChatGPT Images 2.0 Edit    → openai/gpt-image-2/edit  (quality "quality@WxH")
//   - Seedream Edit (V4/V5/Pro)  → fal-ai/bytedance/seedream/v5/edit  (quality = model_version)
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
import { resolveSeedreamImageSize } from "./weavy-storyboard";

const mkId = () => Math.random().toString(36).substring(2, 8);

function ratioToImageSizeEnum(ratio: string): string {
  if (ratio.startsWith("9:16")) return "portrait_16_9";
  if (ratio.startsWith("16:9")) return "landscape_16_9";
  return "square";
}

function classifyRatio(r: string): "portrait" | "landscape" | "square" {
  if (/^(9:16|2:3|3:4|4:5)/.test(r)) return "portrait";
  if (/^(16:9|3:2|4:3|5:4|21:9)/.test(r)) return "landscape";
  return "square";
}

function gptImageSize(tier: string, ratio: string): { width: number; height: number } {
  const t = classifyRatio(ratio);
  const table: Record<string, Record<string, [number, number]>> = {
    "1K": { square: [1024, 1024], portrait: [1024, 1536], landscape: [1536, 1024] },
    "2K": { square: [2048, 2048], portrait: [1152, 2048], landscape: [2048, 1152] },
    "4K": { square: [2048, 2048], portrait: [2160, 3840], landscape: [3840, 2160] },
  };
  const T = table[tier.toUpperCase()] || table["1K"];
  const [w, h] = T[t];
  return { width: w, height: h };
}

function parseGptQuality(input: string, ratio: string): { quality: string; size?: { width: number; height: number } } {
  const s = (input || "medium@1K").trim();
  const at = s.indexOf("@");
  const quality = at < 0 ? s || "medium" : s.slice(0, at) || "medium";
  const suffix = at < 0 ? "1K" : s.slice(at + 1).trim();
  if (/^[124]K$/i.test(suffix)) return { quality, size: gptImageSize(suffix, ratio) };
  if (suffix.toLowerCase() === "auto") return { quality };
  const m = /^(\d{3,5})x(\d{3,5})$/i.exec(suffix);
  if (m) return { quality, size: { width: Number(m[1]), height: Number(m[2]) } };
  return { quality, size: gptImageSize("1K", ratio) };
}


function mkImportNode(id: string, url: string, name: string, y: number) {
  return {
    id, type: "import", dragHandle: ".node-header", owner: null, visibility: null, isModel: false,
    data: {
      handles: { output: { file: { type: "any", label: "File", order: 0, format: "uri" } } },
      name: "File", color: "Yambo_Blue", dark_color: "Yambo_Blue_Dark", border_color: "Yambo_Blue_Stroke",
      files: [{ type: "image", url, publicId: "uploads/" + mkId(), id: mkId(), name, insertionOrder: 0 }],
      result: { type: "image", url, publicId: "uploads/" + mkId(), id: mkId(), name, insertionOrder: 0 },
      output: { file: { type: "image", url, publicId: "uploads/" + mkId(), id: mkId(), name, insertionOrder: 0 } },
      version: 3,
    },
    position: { x: 80, y }, width: 460, height: 400,
  };
}

function buildNb2BulkRecipe(prompt: string, resolution: string, ratio: string, charUrl: string, outfitUrl: string) {
  const model = "fal-ai/nano-banana-2/edit";
  const n1 = "n_" + Date.now() + "_char";
  const n2 = "n_" + Date.now() + "_out";
  const n3 = "n_" + Date.now() + "_mdl";
  const imgNode = mkImportNode(n1, charUrl, "character.jpg", 100);
  const outNode = mkImportNode(n2, outfitUrl, "outfit.jpg", 550);
  const imageRefs = [charUrl, outfitUrl];
  const params = {
    image_urls: imageRefs, prompt, aspect_ratio: ratio, resolution,
    num_images: 1, output_format: "png", safety_tolerance: "4",
    limit_generations: false, enable_web_search: false,
  };
  const modelNode = {
    id: n3, type: "custommodelV2", dragHandle: ".node-header", owner: null, visibility: "private", isModel: true,
    data: {
      handles: {
        input: {
          prompt: { id: "input-prompt", type: "text", label: "prompt", format: "text", required: true },
          image: { id: "input-image", type: "image", label: "image", format: "text", required: true },
          image_2: { id: "input-image_2", type: "image", label: "image_2", format: "text", required: false },
        },
        output: { result: { id: "output-result", type: "image", label: "result", order: 0, format: "uri" } },
      },
      name: "Gemini 3.1 Flash (Nano Banana 2)", color: "Yellow",
      menu: { icon: "AutoAwesomeIcon", isModel: true, displayName: "Gemini 3.1 Flash (Nano Banana 2)" },
      model: { name: model, service: "fal_imported", version: model },
      params, version: 3,
      kind: {
        type: "wildcard",
        model: { type: "predefined", name: model, version: model, service: "fal_imported" },
        inputs: [
          [{ id: "prompt", title: "prompt", validTypes: ["text"], required: true }, null],
          [{ id: "image", title: "image", validTypes: ["image"], required: true }, { nodeId: n1, outputId: "file" }],
          [{ id: "image_2", title: "image_2", validTypes: ["image"], required: false }, { nodeId: n2, outputId: "file" }],
        ],
        parameters: [
          [{ id: "image_urls", title: "image_urls", constraint: { type: "list" }, defaultValue: { type: "list", value: imageRefs } }, { type: "value", data: { type: "list", value: imageRefs } }],
          [{ id: "prompt", title: "prompt", constraint: { type: "string" }, defaultValue: { type: "string", value: prompt } }, { type: "value", data: { type: "string", value: prompt } }],
          [{ id: "resolution", title: "resolution", constraint: { type: "enum" }, defaultValue: { type: "string", value: resolution } }, { type: "value", data: { type: "string", value: resolution } }],
          [{ id: "aspect_ratio", title: "aspect_ratio", constraint: { type: "enum" }, defaultValue: { type: "string", value: ratio } }, { type: "value", data: { type: "string", value: ratio } }],
          [{ id: "num_images", title: "num_images", constraint: { type: "number" }, defaultValue: { type: "number", value: 1 } }, { type: "value", data: { type: "number", value: 1 } }],
          [{ id: "output_format", title: "output_format", constraint: { type: "enum" }, defaultValue: { type: "string", value: "png" } }, { type: "value", data: { type: "string", value: "png" } }],
          [{ id: "safety_tolerance", title: "safety_tolerance", constraint: { type: "enum" }, defaultValue: { type: "string", value: "4" } }, { type: "value", data: { type: "string", value: "4" } }],
          [{ id: "limit_generations", title: "limit_generations", constraint: { type: "boolean" }, defaultValue: { type: "boolean", value: false } }, { type: "value", data: { type: "boolean", value: false } }],
          [{ id: "enable_web_search", title: "enable_web_search", constraint: { type: "boolean" }, defaultValue: { type: "boolean", value: false } }, { type: "value", data: { type: "boolean", value: false } }],
        ],
        outputs: [{ id: "result", title: "result", dataType: "image" }],
      },
      generations: [], selectedIndex: 0, cameraLocked: false, result: [], output: {}, selectedOutput: 0,
    },
    position: { x: 600, y: 300 }, width: 460, height: 500,
  };
  const edges = [
    { id: "e-" + mkId(), source: n1, target: n3, sourceHandle: `${n1}-output-file`, targetHandle: `${n3}-input-image`, type: "custom", data: { sourceColor: "Yambo_Blue", targetColor: "Yellow", sourceHandleType: "any", targetHandleType: "image" } },
    { id: "e-" + mkId(), source: n2, target: n3, sourceHandle: `${n2}-output-file`, targetHandle: `${n3}-input-image_2`, type: "custom", data: { sourceColor: "Yambo_Blue", targetColor: "Yellow", sourceHandleType: "any", targetHandleType: "image" } },
  ];
  return { model, nodes: [imgNode, outNode, modelNode], edges };
}

/** ChatGPT Images 2.0 Edit — multi-image + prompt. quality format "quality@WxH". */
function buildGptImage2EditBulkRecipe(prompt: string, quality: string, ratio: string, charUrl: string, outfitUrl: string) {
  const model = "openai/gpt-image-2/edit";
  const parsed = parseGptQuality(quality, ratio);

  const imageSize: unknown = parsed.size
    ? { width: parsed.size.width, height: parsed.size.height }
    : "auto";
  const n1 = "n_" + Date.now() + "_char";
  const n2 = "n_" + Date.now() + "_out";
  const n3 = "n_" + Date.now() + "_mdl";
  const imgNode = mkImportNode(n1, charUrl, "character.jpg", 100);
  const outNode = mkImportNode(n2, outfitUrl, "outfit.jpg", 550);
  const imageRefs = [charUrl, outfitUrl];
  const params = {
    image_urls: imageRefs, prompt, quality: parsed.quality,
    image_size: imageSize, num_images: 1, output_format: "png",
  };
  const modelNode = {
    id: n3, type: "custommodelV2", dragHandle: ".node-header", owner: null, visibility: "private", isModel: true,
    data: {
      handles: {
        input: {
          prompt: { id: "input-prompt", type: "text", label: "prompt", format: "text", required: true },
          image: { id: "input-image", type: "image", label: "image", format: "text", required: true },
          image_2: { id: "input-image_2", type: "image", label: "image_2", format: "text", required: false },
        },
        output: { result: { id: "output-result", type: "image", label: "result", order: 0, format: "uri" } },
      },
      name: "ChatGPT Images 2.0 Edit", color: "Red",
      menu: { icon: "EmojiObjectsIcon", isModel: true, displayName: "ChatGPT Images 2.0 Edit" },
      model: { name: model, service: "fal_imported", version: model },
      params, version: 3,
      kind: {
        type: "wildcard",
        model: { type: "predefined", name: model, version: model, service: "fal_imported" },
        inputs: [
          [{ id: "prompt", title: "prompt", validTypes: ["text"], required: true }, null],
          [{ id: "image", title: "image", validTypes: ["image"], required: true }, { nodeId: n1, outputId: "file" }],
          [{ id: "image_2", title: "image_2", validTypes: ["image"], required: false }, { nodeId: n2, outputId: "file" }],
        ],
        parameters: [
          [{ id: "image_urls", title: "image_urls", constraint: { type: "list" }, defaultValue: { type: "list", value: imageRefs } }, { type: "value", data: { type: "list", value: imageRefs } }],
          [{ id: "prompt", title: "prompt", constraint: { type: "string" }, defaultValue: { type: "string", value: prompt } }, { type: "value", data: { type: "string", value: prompt } }],
          [{ id: "quality", title: "quality", constraint: { type: "enum", options: ["low", "medium", "high"] }, defaultValue: { type: "string", value: parsed.quality } }, { type: "value", data: { type: "string", value: parsed.quality } }],
          [{ id: "image_size", title: "image_size", constraint: { type: "any" }, defaultValue: { type: parsed.size ? "object" : "string", value: imageSize } }, { type: "value", data: { type: parsed.size ? "object" : "string", value: imageSize } }],
          [{ id: "num_images", title: "num_images", constraint: { type: "number" }, defaultValue: { type: "number", value: 1 } }, { type: "value", data: { type: "number", value: 1 } }],
          [{ id: "output_format", title: "output_format", constraint: { type: "enum", options: ["png", "jpeg", "webp"] }, defaultValue: { type: "string", value: "png" } }, { type: "value", data: { type: "string", value: "png" } }],
        ],
        outputs: [{ id: "result", title: "result", dataType: "image" }],
      },
      generations: [], selectedIndex: 0, cameraLocked: false, result: [], output: {}, selectedOutput: 0,
    },
    position: { x: 600, y: 300 }, width: 460, height: 500,
  };
  const edges = [
    { id: "e-" + mkId(), source: n1, target: n3, sourceHandle: `${n1}-output-file`, targetHandle: `${n3}-input-image`, type: "custom", data: { sourceColor: "Yambo_Blue", targetColor: "Red", sourceHandleType: "any", targetHandleType: "image" } },
    { id: "e-" + mkId(), source: n2, target: n3, sourceHandle: `${n2}-output-file`, targetHandle: `${n3}-input-image_2`, type: "custom", data: { sourceColor: "Yambo_Blue", targetColor: "Red", sourceHandleType: "any", targetHandleType: "image" } },
  ];
  return { model, nodes: [imgNode, outNode, modelNode], edges };
}

/** Seedream Edit — endpoint Weavy tunggal (fal_imported), varian via params.model. */
const SEEDREAM_MODEL_ID = "fal-ai/bytedance/seedream/v5/lite/edit";

function seedreamVariant(modelKey: string): string {
  const k = (modelKey || "").toLowerCase();
  if (k.includes("v40") || k.includes("-4-0")) return "V4.0";
  if (k.includes("v45") || k.includes("-4-5")) return "V4.5";
  if (k.includes("pro")) return "V5.0 Pro";
  if (k.includes("v50")) return "V5.0";
  return "V5.0 Pro";
}

function seedreamSlot(url: string, index: number) {
  return {
    type: "image",
    url,
    thumbnailUrl: url,
    publicId: "uploads/" + mkId(),
    id: mkId(),
    name: index === 0 ? "character.jpg" : "outfit.jpg",
    insertionOrder: 0,
  };
}

<<<<<<< HEAD
function buildSeedreamEditBulkRecipe(prompt: string, modelKey: string, ratio: string, charUrl: string, outfitUrl: string, imageSize?: string) {
  const model = SEEDREAM_MODEL_ID;
  const variant = seedreamVariant(modelKey);
  const validPresets = new Set([
    "match_input", "square_hd", "square",
    "portrait_4_3", "portrait_16_9",
    "landscape_4_3", "landscape_16_9",
    "auto_2K", "auto_3K",
  ]);
  const sizePreset = resolveSeedreamImageSize(imageSize, ratio, validPresets);
  const sizeValue = { type: "built_in", value: sizePreset };
=======
function buildSeedreamEditBulkRecipe(prompt: string, modelKey: string, ratio: string, charUrl: string, outfitUrl: string) {
  void ratio;
  const model = SEEDREAM_MODEL_ID;
  const variant = seedreamVariant(modelKey);
>>>>>>> 50b55a82d0092548ee46ab2d11985444126759b6
  const n1 = "n_" + Date.now() + "_char";
  const n2 = "n_" + Date.now() + "_out";
  const n3 = "n_" + Date.now() + "_mdl";
  const imgNode = mkImportNode(n1, charUrl, "character.jpg", 100);
  const outNode = mkImportNode(n2, outfitUrl, "outfit.jpg", 550);
  const slot1 = seedreamSlot(charUrl, 0);
  const slot2 = seedreamSlot(outfitUrl, 1);
  const params: Record<string, unknown> = {
    seed: { seed: Math.floor(Math.random() * 1_000_000), isRandom: true },
<<<<<<< HEAD
    image_size: sizeValue,
=======
    image_size: null,
>>>>>>> 50b55a82d0092548ee46ab2d11985444126759b6
    max_images: 1,
    num_images: 1,
    enhance_prompt_mode: "standard",
    enable_safety_checker: true,
    prompt,
    model: variant,
    image_1: slot1,
    image_2: slot2,
  };
  const modelNode = {
    id: n3, type: "custommodelV2", dragHandle: ".node-header", owner: null, visibility: "private", isModel: true,
    data: {
      handles: {
        input: {
          prompt: { id: "input-prompt", type: "text", label: "prompt", format: "text", required: true },
          image_1: { id: "input-image_1", type: "image", label: "image_1", format: "uri", required: false },
          image_2: { id: "input-image_2", type: "image", label: "image_2", format: "uri", required: false },
        },
        output: { result: { id: "output-result", type: "image", label: "result", order: 0, format: "uri" } },
      },
      name: `Seedream ${variant} Edit`, color: "Red",
      menu: { icon: "EmojiObjectsIcon", isModel: true, displayName: `Seedream ${variant}` },
      model: { name: model, service: "fal_imported", version: model },
      params, version: 3,
      kind: {
        type: "wildcard",
        model: { type: "user_defined", name: model, version: model, service: "fal_imported", description: "Fal.ai Model" },
        inputs: [
          [{ id: "prompt", title: "prompt", validTypes: ["text"], required: true }, null],
          [{ id: "image_1", title: "image_1", validTypes: ["image"], required: false }, { nodeId: n1, outputId: "file", file: slot1 }],
          [{ id: "image_2", title: "Image 2", validTypes: ["image"], required: false }, { nodeId: n2, outputId: "file", file: slot2 }],
        ],
        parameters: [
          [{ id: "model", title: "Model", constraint: { type: "enum", options: ["V4.0", "V4.5", "V5.0", "V5.0 Pro"] }, defaultValue: { type: "string", value: "V5.0 Pro" } }, { type: "value", data: { type: "string", value: variant } }],
          [{ id: "seed", title: "Seed", constraint: { type: "seed" }, defaultValue: { type: "seed", value: { seed: 1, isRandom: false } } }, { type: "value", data: { type: "seed", value: (params.seed as { seed: number; isRandom: boolean }) } }],
<<<<<<< HEAD
          [{ id: "image_size", title: "Image Size", constraint: { type: "image_size", options: ["match_input", "custom", "square_hd", "square", "portrait_4_3", "portrait_16_9", "landscape_4_3", "landscape_16_9", "auto_2K", "auto_3K"] }, defaultValue: { type: "image_size", value: { type: "built_in", value: "match_input" } } }, { type: "value", data: { type: "image_size", value: sizeValue } }],
=======
          [{ id: "image_size", title: "Image Size", constraint: { type: "image_size", options: ["Default", "square_hd", "square", "portrait_4_3", "portrait_16_9", "landscape_4_3", "landscape_16_9", "auto_2K", "auto_3K"] }, defaultValue: { type: "image_size", value: { type: "built_in", value: "match_input" } } }, { type: "value", data: { type: "image_size", value: { type: "built_in", value: "match_input" } } }],
>>>>>>> 50b55a82d0092548ee46ab2d11985444126759b6
          [{ id: "enhance_prompt_mode", title: "Enhance Prompt Mode", constraint: { type: "enum", options: ["standard", "fast"] }, defaultValue: { type: "string", value: "standard" } }, { type: "value", data: { type: "string", value: "standard" } }],
        ],
        outputs: [{ id: "result", title: "result", dataType: "image" }],
      },
      generations: [], selectedIndex: 0, cameraLocked: false, result: [], output: {}, selectedOutput: 0,
    },
    position: { x: 600, y: 300 }, width: 460, height: 500,
  };
  const edges = [
    { id: "e-" + mkId(), source: n1, target: n3, sourceHandle: `${n1}-output-file`, targetHandle: `${n3}-input-image_1`, type: "custom", data: { sourceColor: "Yambo_Blue", targetColor: "Red", sourceHandleType: "image", targetHandleType: "image" } },
    { id: "e-" + mkId(), source: n2, target: n3, sourceHandle: `${n2}-output-file`, targetHandle: `${n3}-input-image_2`, type: "custom", data: { sourceColor: "Yambo_Blue", targetColor: "Red", sourceHandleType: "image", targetHandleType: "image" } },
  ];
  return { model, nodes: [imgNode, outNode, modelNode], edges };
}


async function pollWeavyImage(
  recipeId: string, batchId: string, accessToken: string,
  inputUrls: string[], maxAttempts = 90,
): Promise<string> {
  for (let a = 0; a < maxAttempts; a++) {
    const delay = a < 20 ? 5000 : a < 40 ? 8000 : 12000;
    await new Promise((r) => setTimeout(r, delay));
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
              ro?.url, ro?.image_url,
              nr.output?.file?.url, nr.output?.image_url, nr.output?.url,
              ...((nr.generations || []) as { url?: string; image_url?: string }[]).map((g) => g.url || g.image_url),
            ]
              .filter((u): u is string => !!u && /\.(png|jpe?g|webp)(\?|$)/i.test(u))
              .filter((u) => !inputUrls.includes(u));
            if (candidates.length > 0) return candidates[0];
          }
        }
        throw new Error("Weavy: image URL tidak ditemukan di response");
      }
      if (["failed", "FAILED", "error", "ERROR"].includes(st)) {
        const ne = (d.recipeRuns?.[0]?.nodeRuns || [])
          .map((nr: { error?: string; errorMessage?: string }) => nr.error || nr.errorMessage)
          .filter(Boolean).join(" | ");
        throw new Error((d.error || d.message || "Weavy generation failed") + (ne ? " | " + ne : ""));
      }
    } catch (e) {
      if (a > 8) throw e;
    }
  }
  throw new Error("Weavy timeout: generation took too long");
}

export type WeavyBulkOpts = {
  modelKey: string;   // "nanobanana2" | "gptimage2" | "seedream-v40" | "seedream-v45" | "seedream-v50" | "seedream-v50-pro"
  prompt: string;
  quality: string;
  ratio: string;
  charFile: File;
  outfitFile: File;
};

export async function generateWeavyBulkOne(opts: WeavyBulkOpts): Promise<string> {
  const tried = new Set<string>();
  let lastErr: Error | null = null;

  while (true) {
    const active = await getActiveWeavyAccessToken();
    if (!active) break;
    if (tried.has(active.id)) break;
    tried.add(active.id);
    try {
      const charUp = await uploadWeavyAssetWithRetry(opts.charFile, `char_${Date.now()}.jpg`, active.accessToken);
      const charUrl = resolveWeavyAssetUrl(charUp, "image");
      const outUp = await uploadWeavyAssetWithRetry(opts.outfitFile, `outfit_${Date.now()}.jpg`, active.accessToken);
      const outUrl = resolveWeavyAssetUrl(outUp, "image");

      if (opts.modelKey.startsWith("seedream-")) {
<<<<<<< HEAD
        const sb = buildSeedreamEditBulkRecipe(opts.prompt, opts.modelKey, opts.ratio || "1:1", charUrl, outUrl, opts.quality);
=======
        const sb = buildSeedreamEditBulkRecipe(opts.prompt, opts.modelKey, opts.ratio || "1:1", charUrl, outUrl);
>>>>>>> 50b55a82d0092548ee46ab2d11985444126759b6
        const { id: rid, v3: sv3 } = await createWeavyRecipe(active.accessToken);
        await saveWeavyRecipe(rid, { nodes: sb.nodes, edges: sb.edges, v3: sv3 }, active.accessToken);
        await approveWeavyModel(sb.model, active.accessToken);
        const { batchId: bid } = await executeWeavyBatch(rid, sb.nodes, sb.edges, active.accessToken, sb.model);
        return await pollWeavyImage(rid, bid, active.accessToken, [charUrl, outUrl]);
      }

      const built = opts.modelKey === "nanobanana2"
        ? buildNb2BulkRecipe(opts.prompt, opts.quality || "1K", opts.ratio || "9:16", charUrl, outUrl)
        : buildGptImage2EditBulkRecipe(opts.prompt, opts.quality || "medium@1K", opts.ratio || "1:1", charUrl, outUrl);

      const { id: recipeId, v3 } = await createWeavyRecipe(active.accessToken);
      await saveWeavyRecipe(recipeId, { nodes: built.nodes, edges: built.edges, v3 }, active.accessToken);
      await approveWeavyModel(built.model, active.accessToken);
      const { batchId } = await executeWeavyBatch(recipeId, built.nodes, built.edges, active.accessToken, built.model);
      return await pollWeavyImage(recipeId, batchId, active.accessToken, [charUrl, outUrl]);

    } catch (e) {
      lastErr = e instanceof Error ? e : new Error(String(e));
      const msg = lastErr.message || "";
      const creditLike = /insufficient|credits?|quota|balance|402|401|403|cukup|not enough|payment|unauthori[sz]ed|amount/i.test(msg);
      if (!creditLike) throw lastErr;
      await rotateWeavyToken(active.id);
    }
  }
  throw lastErr ?? new Error("Belum ada Weavy token aktif di Kelola Token");
}
