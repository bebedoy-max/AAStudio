// Weavy text-to-image helper.
// Two Weavy nodes:
//   - "ChatGPT Images 2.0" (T2I, prompt-only) → openai/gpt-image-2
//   - "Gemini Nano Banana 2"                   → fal-ai/nano-banana-2/edit (butuh dummy image)
//
// Quality format untuk GPT: "quality@WIDTHxHEIGHT" (mis. "high@2160x3840"), atau
// "quality" polos (fallback ke image_size enum berdasarkan aspect ratio).
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

function ratioToImageSizeEnum(ratio: string): string {
  if (ratio.startsWith("9:16")) return "portrait_16_9";
  if (ratio.startsWith("16:9")) return "landscape_16_9";
  return "square";
}

/** Parse "quality@WIDTHxHEIGHT" → { quality, size?:{width,height} } */
function parseGptQuality(input: string): { quality: string; size?: { width: number; height: number } } {
  const s = (input || "medium").trim();
  const at = s.indexOf("@");
  if (at < 0) return { quality: s };
  const quality = s.slice(0, at) || "medium";
  const dims = s.slice(at + 1).trim();
  if (dims.toLowerCase() === "auto") return { quality };
  const m = /^(\d{3,5})x(\d{3,5})$/i.exec(dims);
  if (!m) return { quality };
  return { quality, size: { width: Number(m[1]), height: Number(m[2]) } };
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

/**
 * ChatGPT Images 2.0 (T2I) — prompt only, tidak butuh image ref.
 * image_size: object { width, height } saat pixel eksplisit; enum fallback saat "auto".
 */
function buildGptImage2Recipe(prompt: string, quality: string, ratio: string) {
  const model = "openai/gpt-image-2";
  const parsed = parseGptQuality(quality);
  const imageSize: unknown = parsed.size
    ? { width: parsed.size.width, height: parsed.size.height }
    : ratioToImageSizeEnum(ratio);
  const n2 = "n_" + Date.now() + "_model";
  const params = {
    prompt,
    image_size: imageSize,
    quality: parsed.quality,
    num_images: 1,
    output_format: "png",
  };
  const modelNode = {
    id: n2, type: "custommodelV2", dragHandle: ".node-header", owner: null, visibility: "private", isModel: true,
    data: {
      handles: {
        input: {
          prompt: { id: "input-prompt", type: "text", label: "prompt", format: "text", required: true },
        },
        output: { result: { id: "output-result", type: "image", label: "result", order: 0, format: "uri" } },
      },
      name: "ChatGPT Images 2.0", color: "Red",
      menu: { icon: "EmojiObjectsIcon", isModel: true, displayName: "ChatGPT Images 2.0" },
      model: { name: model, service: "fal_imported", version: model },
      params,
      version: 3,
      kind: {
        type: "wildcard",
        model: { type: "predefined", name: model, version: model, service: "fal_imported" },
        inputs: [
          [{ id: "prompt", title: "prompt", validTypes: ["text"], required: true }, null],
        ],
        parameters: [
          [{ id: "prompt", title: "prompt", constraint: { type: "string" }, defaultValue: { type: "string", value: prompt } }, { type: "value", data: { type: "string", value: prompt } }],
          [{ id: "image_size", title: "image_size", constraint: { type: "any" }, defaultValue: { type: parsed.size ? "object" : "string", value: imageSize } }, { type: "value", data: { type: parsed.size ? "object" : "string", value: imageSize } }],
          [{ id: "quality", title: "quality", constraint: { type: "enum", options: ["low", "medium", "high"] }, defaultValue: { type: "string", value: parsed.quality } }, { type: "value", data: { type: "string", value: parsed.quality } }],
          [{ id: "num_images", title: "num_images", constraint: { type: "number" }, defaultValue: { type: "number", value: 1 } }, { type: "value", data: { type: "number", value: 1 } }],
          [{ id: "output_format", title: "output_format", constraint: { type: "enum", options: ["png", "jpeg", "webp"] }, defaultValue: { type: "string", value: "png" } }, { type: "value", data: { type: "string", value: "png" } }],
        ],
        outputs: [{ id: "result", title: "result", dataType: "image" }],
      },
      generations: [], selectedIndex: 0, cameraLocked: false, result: [], output: {}, selectedOutput: 0,
    },
    position: { x: 600, y: 300 }, width: 460, height: 500,
  };
  return { model, nodes: [modelNode], edges: [] };
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
  quality: string;    // gpt: "quality@WxH" atau low/medium/high | nb: 0.5K/1K/2K/4K
  ratio: string;      // 9:16 / 16:9 / 1:1
  onProgress?: (msg: string, pct?: number) => void;
};

export async function generateWeavyImage(opts: WeavyImgOpts): Promise<string> {
  const isNb = opts.modelKey === "nanobanana2";
  const isSeedream = opts.modelKey.startsWith("seedream-");
  let built: { model: string; nodes: unknown[]; edges: unknown[] };
  if (isSeedream) {
    const { buildSeedreamEditRecipe } = await import("./weavy-storyboard");
    built = buildSeedreamEditRecipe(opts.prompt, opts.modelKey, opts.ratio || "1:1", [DUMMY_IMG]);
    // T2I: override image_size (match_input akan mengikuti dummy 1×1). Pilih preset
    // Weavy berdasar aspect ratio yang dipilih user.
    const r = opts.ratio || "1:1";
    const preset =
      r === "9:16" || r === "2:3" || r === "4:5"
        ? "portrait_16_9"
        : r === "16:9" || r === "3:2"
          ? "landscape_16_9"
          : "square_hd";
    for (const n of built.nodes as Array<{ isModel?: boolean; data?: { params?: Record<string, unknown>; kind?: { parameters?: unknown[] } } }>) {
      if (!n.isModel || !n.data) continue;
      const params = n.data.params || {};
      params.image_size = { type: "built_in", value: preset };
      const kp = n.data.kind?.parameters as Array<Array<Record<string, unknown>>> | undefined;
      if (kp) {
        for (const entry of kp) {
          const meta = entry[0] as { id?: string };
          if (meta?.id === "image_size") {
            entry[1] = { type: "value", data: { type: "image_size", value: { type: "built_in", value: preset } } };
          }
        }
      }
    }
  } else if (isNb) {
    built = buildNanoBanana2Recipe(opts.prompt, opts.quality || "1K", opts.ratio || "9:16");
  } else {
    built = buildGptImage2Recipe(opts.prompt, opts.quality || "high@1024x1024", opts.ratio || "1:1");
  }

  const log = (m: string, p?: number) => opts.onProgress?.(m, p);

  const tried = new Set<string>();
  let lastErr: Error | null = null;

  while (true) {
    const active = await getActiveWeavyAccessToken();
    if (!active) break;
    if (tried.has(active.id)) break;
    tried.add(active.id);
    try {
      log("Weavy: create recipe…", 10);
      const { id: recipeId, v3 } = await createWeavyRecipe(active.accessToken);
      log("Weavy: save recipe…", 25);
      await saveWeavyRecipe(recipeId, { nodes: built.nodes, edges: built.edges, v3 }, active.accessToken);
      log("Weavy: approve model…", 40);
      await approveWeavyModel(built.model, active.accessToken);
      log("Weavy: execute batch…", 55);
      const { batchId } = await executeWeavyBatch(
        recipeId,
        built.nodes,
        built.edges,
        active.accessToken,
        built.model,
      );
      log("Weavy: rendering image…", 70);
      const url = await pollWeavyImage(recipeId, batchId, active.accessToken, DUMMY_IMG);
      log("Weavy: image ready", 95);
      return url;
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
      log(`↻ token habis, rotate…`);
      await rotateWeavyToken(active.id);
    }
  }
  throw lastErr ?? new Error("Belum ada Weavy token aktif di Kelola Token");
}
