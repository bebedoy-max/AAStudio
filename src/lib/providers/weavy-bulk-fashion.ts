// Weavy bulk-fashion recipe: 1 karakter + 1 outfit → generate.
// Uses NB2 /edit or GPT-Image-2 with 2 image inputs (character + outfit).
import {
  WEAVY_API,
  getActiveWeavyAccessToken,
  rotateWeavyToken,
  createWeavyRecipe,
  saveWeavyRecipe,
  approveWeavyModel,
  executeWeavyBatch,
  fetchWeavyCredits,
  uploadWeavyAssetWithRetry,
  resolveWeavyAssetUrl,
} from "./weavy";

const mkId = () => Math.random().toString(36).substring(2, 8);

function ratioToImageSize(ratio: string): string {
  if (ratio.startsWith("9:16")) return "portrait";
  if (ratio.startsWith("16:9")) return "landscape";
  return "square";
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
    image_urls: imageRefs,
    prompt,
    aspect_ratio: ratio,
    resolution,
    num_images: 1,
    output_format: "png",
    safety_tolerance: "4",
    limit_generations: false,
    enable_web_search: false,
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
      params,
      version: 3,
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
    {
      id: "e-" + mkId(), source: n1, target: n3,
      sourceHandle: `${n1}-output-file`, targetHandle: `${n3}-input-image`,
      type: "custom", data: { sourceColor: "Yambo_Blue", targetColor: "Yellow", sourceHandleType: "any", targetHandleType: "image" },
    },
    {
      id: "e-" + mkId(), source: n2, target: n3,
      sourceHandle: `${n2}-output-file`, targetHandle: `${n3}-input-image_2`,
      type: "custom", data: { sourceColor: "Yambo_Blue", targetColor: "Yellow", sourceHandleType: "any", targetHandleType: "image" },
    },
  ];
  return { model, nodes: [imgNode, outNode, modelNode], edges };
}

function buildGptImage2BulkRecipe(prompt: string, quality: string, imageSize: string, charUrl: string, outfitUrl: string) {
  const model = "openai/gpt-image-2";
  const n1 = "n_" + Date.now() + "_char";
  const n2 = "n_" + Date.now() + "_out";
  const n3 = "n_" + Date.now() + "_mdl";
  const imgNode = mkImportNode(n1, charUrl, "character.jpg", 100);
  const outNode = mkImportNode(n2, outfitUrl, "outfit.jpg", 550);
  const params = { prompt, quality, image_size: imageSize, image_urls: [charUrl, outfitUrl] };
  const modelNode = {
    id: n3, type: "custommodelV2", dragHandle: ".node-header", owner: null, visibility: "private", isModel: true,
    data: {
      handles: {
        input: {
          image: { id: "input-image", type: "image", label: "image", format: "text", required: true },
          image_2: { id: "input-image_2", type: "image", label: "image_2", format: "text", required: false },
        },
        output: { result: { id: "output-result", type: "image", label: "result", order: 0, format: "uri" } },
      },
      name: "ChatGPT Image", color: "Red",
      menu: { icon: "EmojiObjectsIcon", isModel: true, displayName: "ChatGPT Image" },
      model: { name: model, service: "fal_imported", version: model },
      params,
      version: 3,
      kind: {
        type: "wildcard",
        model: { type: "predefined", name: model, version: model, service: "fal_imported" },
        inputs: [
          [{ id: "image", title: "image", validTypes: ["image"], required: true }, { nodeId: n1, outputId: "file" }],
          [{ id: "image_2", title: "image_2", validTypes: ["image"], required: false }, { nodeId: n2, outputId: "file" }],
        ],
        parameters: [
          [{ id: "image_urls", title: "image_urls", constraint: { type: "list" }, defaultValue: { type: "list", value: [charUrl, outfitUrl] } }, { type: "value", data: { type: "list", value: [charUrl, outfitUrl] } }],
          [{ id: "prompt", title: "prompt", constraint: { type: "string" }, defaultValue: { type: "string", value: prompt } }, { type: "value", data: { type: "string", value: prompt } }],
          [{ id: "quality", title: "quality", constraint: { type: "enum" }, defaultValue: { type: "string", value: quality } }, { type: "value", data: { type: "string", value: quality } }],
          [{ id: "image_size", title: "image_size", constraint: { type: "enum" }, defaultValue: { type: "string", value: imageSize } }, { type: "value", data: { type: "string", value: imageSize } }],
        ],
        outputs: [{ id: "result", title: "result", dataType: "image" }],
      },
      generations: [], selectedIndex: 0, cameraLocked: false, result: [], output: {}, selectedOutput: 0,
    },
    position: { x: 600, y: 300 }, width: 460, height: 500,
  };
  const edges = [
    {
      id: "e-" + mkId(), source: n1, target: n3,
      sourceHandle: `${n1}-output-file`, targetHandle: `${n3}-input-image`,
      type: "custom", data: { sourceColor: "Yambo_Blue", targetColor: "Red" },
    },
    {
      id: "e-" + mkId(), source: n2, target: n3,
      sourceHandle: `${n2}-output-file`, targetHandle: `${n3}-input-image_2`,
      type: "custom", data: { sourceColor: "Yambo_Blue", targetColor: "Red" },
    },
  ];
  return { model, nodes: [imgNode, outNode, modelNode], edges };
}

async function pollWeavyImage(
  recipeId: string,
  batchId: string,
  accessToken: string,
  inputUrls: string[],
  maxAttempts = 90,
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
  modelKey: string;   // "nanobanana2" | "gptimage2"
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
      // Upload both files to Weavy asset store.
      const charUp = await uploadWeavyAssetWithRetry(opts.charFile, `char_${Date.now()}.jpg`, active.accessToken);
      const charUrl = resolveWeavyAssetUrl(charUp, "image");
      const outUp = await uploadWeavyAssetWithRetry(opts.outfitFile, `outfit_${Date.now()}.jpg`, active.accessToken);
      const outUrl = resolveWeavyAssetUrl(outUp, "image");

      const isNb = opts.modelKey === "nanobanana2";
      const built = isNb
        ? buildNb2BulkRecipe(opts.prompt, opts.quality || "1K", opts.ratio || "9:16", charUrl, outUrl)
        : buildGptImage2BulkRecipe(opts.prompt, opts.quality || "medium", ratioToImageSize(opts.ratio), charUrl, outUrl);

      const { id: recipeId, v3 } = await createWeavyRecipe(active.accessToken);
      await saveWeavyRecipe(recipeId, { nodes: built.nodes, edges: built.edges, v3 }, active.accessToken);
      await approveWeavyModel(built.model, active.accessToken);
      const { batchId } = await executeWeavyBatch(recipeId, built.nodes, built.edges, active.accessToken, built.model);
      return await pollWeavyImage(recipeId, batchId, active.accessToken, [charUrl, outUrl]);
    } catch (e) {
      lastErr = e instanceof Error ? e : new Error(String(e));
      const msg = lastErr.message || "";
      const creditLike = /insufficient|credits?|quota|balance|402|cukup|not enough/i.test(msg);
      if (!creditLike) throw lastErr;
      const bal = await fetchWeavyCredits(active.accessToken).catch(() => null);
      if (bal !== null && bal > 5) {
        throw new Error(
          `Weavy menolak: "${msg}" — padahal saldo token masih ${bal} cr. Coba turunkan kualitas/model atau pilih token lain di Kelola Token.`,
        );
      }
      await rotateWeavyToken(active.id);
    }
  }
  throw lastErr ?? new Error("Belum ada Weavy token aktif di Kelola Token");
}
