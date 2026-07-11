// Weavy text-to-image helper — port dari legacy executeChatgptTextRecipe / executeBfNanoBananaRecipe.
// GPT-Image-2: T2I native (dummy image + prompt/quality/image_size).
// Nano Banana 2: pakai /edit dengan dummy image + prompt (Weavy tidak punya T2I native untuk NB2).
import {
  WEAVY_API,
  getActiveWeavyAccessToken,
  rotateWeavyToken,
  createWeavyRecipe,
  saveWeavyRecipe,
  approveWeavyModel,
  executeWeavyBatch,
  fetchWeavyCredits,
} from "./weavy";

const DUMMY_IMG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

const mkId = () => Math.random().toString(36).substring(2, 8);

function ratioToImageSize(ratio: string): string {
  if (ratio.startsWith("9:16")) return "portrait";
  if (ratio.startsWith("16:9")) return "landscape";
  return "square";
}

async function pollWeavyImage(
  recipeId: string,
  batchId: string,
  accessToken: string,
  inputUrl: string,
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
      const done = ["completed", "COMPLETED", "done", "success"].includes(st);
      if (done) {
        if (d.recipeRuns?.[0]?.nodeRuns) {
          for (let i = d.recipeRuns[0].nodeRuns.length - 1; i >= 0; i--) {
            const nr = d.recipeRuns[0].nodeRuns[i];
            let ro = nr.result;
            if (Array.isArray(ro) && ro.length > 0) ro = ro[0];
            const candidates = [
              ro?.url,
              ro?.image_url,
              nr.output?.file?.url,
              nr.output?.image_url,
              nr.output?.url,
              ...((nr.generations || []) as { url?: string; image_url?: string }[]).map((g) => g.url || g.image_url),
            ]
              .filter((u): u is string => !!u && /\.(png|jpe?g|webp)(\?|$)/i.test(u))
              .filter((u) => u !== inputUrl);
            if (candidates.length > 0) return candidates[0];
          }
        }
        const u = d.output?.image_url || d.output?.url || d.url;
        if (u && u !== inputUrl) return u;
        throw new Error("Weavy: image URL tidak ditemukan di response");
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
  throw new Error("Weavy timeout: generation took too long");
}

function mkImportNode(id: string, url: string, name = "dummy.png") {
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
    position: { x: 80, y: 200 }, width: 460, height: 400,
  };
}

function buildGptImage2Recipe(prompt: string, quality: string, imageSize: string) {
  const model = "openai/gpt-image-2";
  const n1 = "n_" + Date.now() + "_img";
  const n2 = "n_" + Date.now() + "_model";
  const imgNode = mkImportNode(n1, DUMMY_IMG);
  const params = { prompt, quality, image_size: imageSize };
  const modelNode = {
    id: n2, type: "custommodelV2", dragHandle: ".node-header", owner: null, visibility: "private", isModel: true,
    data: {
      handles: {
        input: { image: { id: "input-image", type: "image", label: "image", format: "text", required: true } },
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
        inputs: [[{ id: "image", title: "image", validTypes: ["image"], required: true }, { nodeId: n1, outputId: "file" }]],
        parameters: [],
        outputs: [{ id: "result", title: "result", dataType: "image" }],
      },
      generations: [], selectedIndex: 0, cameraLocked: false, result: [], output: {}, selectedOutput: 0,
    },
    position: { x: 600, y: 300 }, width: 460, height: 500,
  };
  const edges = [{
    id: "e-" + mkId(), source: n1, target: n2,
    sourceHandle: `${n1}-output-file`, targetHandle: `${n2}-input-image`,
    type: "custom", data: { sourceColor: "Yambo_Blue", targetColor: "Red" },
  }];
  return { model, nodes: [imgNode, modelNode], edges };
}

function buildNanoBanana2Recipe(prompt: string, resolution: string, ratio: string) {
  const model = "fal-ai/nano-banana-2/edit";
  const n1 = "n_" + Date.now() + "_img";
  const n2 = "n_" + Date.now() + "_model";
  const imgNode = mkImportNode(n1, DUMMY_IMG);
  const imageRefs = [DUMMY_IMG];
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
    id: n2, type: "custommodelV2", dragHandle: ".node-header", owner: null, visibility: "private", isModel: true,
    data: {
      handles: {
        input: {
          prompt: { id: "input-prompt", type: "text", label: "prompt", format: "text", required: true },
          image: { id: "input-image", type: "image", label: "image", format: "text", required: true },
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
  const edges = [{
    id: "e-" + mkId(), source: n1, target: n2,
    sourceHandle: `${n1}-output-file`, targetHandle: `${n2}-input-image`,
    type: "custom", data: { sourceColor: "Yambo_Blue", targetColor: "Yellow", sourceHandleType: "any", targetHandleType: "image" },
  }];
  return { model, nodes: [imgNode, modelNode], edges };
}

export type WeavyImgOpts = {
  modelKey: string;   // "gptimage2" | "nanobanana2"
  prompt: string;
  quality: string;    // gpt: low/medium/high | nb: 0.5K/1K/2K/4K
  ratio: string;      // 9:16 / 16:9 / 1:1
};

export async function generateWeavyImage(opts: WeavyImgOpts): Promise<string> {
  const isNb = opts.modelKey === "nanobanana2";
  const built = isNb
    ? buildNanoBanana2Recipe(opts.prompt, opts.quality || "1K", opts.ratio || "9:16")
    : buildGptImage2Recipe(opts.prompt, opts.quality || "medium", ratioToImageSize(opts.ratio));

  const tried = new Set<string>();
  let lastErr: Error | null = null;

  while (true) {
    const active = await getActiveWeavyAccessToken();
    if (!active) break;
    if (tried.has(active.id)) break;
    tried.add(active.id);
    try {
      const { id: recipeId, v3 } = await createWeavyRecipe(active.accessToken);
      await saveWeavyRecipe(recipeId, { nodes: built.nodes, edges: built.edges, v3 }, active.accessToken);
      await approveWeavyModel(built.model, active.accessToken);
      const { batchId } = await executeWeavyBatch(
        recipeId,
        built.nodes,
        built.edges,
        active.accessToken,
        built.model,
      );
      return await pollWeavyImage(recipeId, batchId, active.accessToken, DUMMY_IMG);
    } catch (e) {
      lastErr = e instanceof Error ? e : new Error(String(e));
      const msg = lastErr.message || "";
      const creditLike = /insufficient|credits?|quota|balance|402|cukup|not enough/i.test(msg);
      if (!creditLike) throw lastErr;
      // Verify real credit balance before marking this token as empty.
      const bal = await fetchWeavyCredits(active.accessToken).catch(() => null);
      if (bal !== null && bal > 5) {
        throw new Error(
          `Weavy menolak: "${msg}" — padahal saldo token masih ${bal} cr. Coba turunkan kualitas/model atau pilih token lain di Kelola Token.`,
        );
      }
      await rotateWeavyToken(active.id);
      // loop to try next token
    }
  }
  throw lastErr ?? new Error("Belum ada Weavy token aktif di Kelola Token");
}
