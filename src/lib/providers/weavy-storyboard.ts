// Weavy storyboard recipe — supports N product reference images (max 6).
// Mirror struktur bulk-fashion (yang terbukti akurat) tapi generalisasi ke N port.
// - Nano Banana 2 (fal-ai/nano-banana-2/edit): image_urls list + N image import nodes
//   di-wire ke input image, image_2, image_3, ...
// - GPT-Image-2 Edit (openai/gpt-image-2/edit): multi-reference via image_urls.
//   Jangan pakai openai/gpt-image-2 biasa: T2I node itu butuh image_size dan tidak cocok untuk multi-ref.
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


function gptEditInputKey(i: number): string {
  return i === 0 ? "image" : `image_${i + 1}`;
}


function mkImportNode(id: string, url: string, name: string, y: number) {
  return {
    id,
    type: "import",
    dragHandle: ".node-header",
    owner: null,
    visibility: null,
    isModel: false,
    data: {
      handles: { output: { file: { type: "image", label: "Image", order: 0, format: "uri" } } },
      name: "File",
      color: "Yambo_Blue",
      dark_color: "Yambo_Blue_Dark",
      border_color: "Yambo_Blue_Stroke",
      files: [
        { type: "image", url, publicId: "uploads/" + mkId(), id: mkId(), name, insertionOrder: 0 },
      ],
      result: {
        type: "image",
        url,
        publicId: "uploads/" + mkId(),
        id: mkId(),
        name,
        insertionOrder: 0,
      },
      output: {
        file: {
          type: "image",
          url,
          publicId: "uploads/" + mkId(),
          id: mkId(),
          name,
          insertionOrder: 0,
        },
      },
      version: 3,
    },
    position: { x: 80, y },
    width: 460,
    height: 400,
  };
}

type Built = { model: string; nodes: unknown[]; edges: unknown[] };
type StoryboardProgress = (message: string) => void;

function getStoryboardReferenceLimit(modelKey: string): number {
  // Native Weavy edit nodes (GPT Image 2 Edit & Gemini 3.1 Flash / Nano Banana 2)
  // expose 5 reference handles. Seedream still accepts 6.
  return modelKey.startsWith("seedream-") ? 6 : 5;
}

function getStoryboardInputKey(modelKey: string, index: number): string {
  if (modelKey.startsWith("seedream-")) return `image_${index + 1}`;
  // Node natif Nano Banana 2 pakai image_1..image_5 (bukan "image").
  if (modelKey === "nanobanana2") return `image_${index + 1}`;
  return index === 0 ? "image" : `image_${index + 1}`;
}


function logStoryboard(progress: StoryboardProgress | undefined, message: string) {
  progress?.(message);
  console.log(`[Weavy Storyboard] ${message}`);
}

function referenceCandidates(raw: string): string[] {
  const out: string[] = [];
  const add = (value: string) => {
    const clean = value.trim();
    if (clean && !out.includes(clean)) out.push(clean);
  };
  add(raw);
  try {
    const u = new URL(raw);
    const host = u.hostname.toLowerCase();
    const noThumb = u.toString().replace(/(_tn|_thumbnail|_thumb)(?=\?|$)/i, "");
    add(noThumb);

    if (/images\.tokopedia\.net|static-?tokopedia/i.test(host)) {
      ["700", "900", "1200"].forEach((size) => {
        const next = new URL(u.toString());
        next.pathname = next.pathname.replace(/\/img\/cache\/[^/]+\//i, `/img/cache/${size}/`);
        add(next.toString());
      });
    }

    if (/susercontent|shopee|cf\.shopee/i.test(host)) {
      const next = new URL(noThumb);
      ["x-oss-process", "resize", "width", "height", "w", "h"].forEach((key) => next.searchParams.delete(key));
      add(next.toString());
    }

    if (/slatic|lazada|static-src/i.test(host)) {
      add(u.toString().replace(/(_\d+x\d+q\d+|_\d+x\d+|\.webp_\d+x\d+q\d+)(?=\.|\?|$)/i, ""));
    }
  } catch {
    /* original only */
  }
  return out;
}

async function imageDimensions(blob: Blob): Promise<{ width: number; height: number }> {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(blob);
      const dims = { width: bitmap.width, height: bitmap.height };
      bitmap.close();
      return dims;
    } catch {
      /* fall through */
    }
  }
  return await new Promise((resolve) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(blob);
    img.onload = () => {
      const dims = { width: img.naturalWidth || img.width, height: img.naturalHeight || img.height };
      URL.revokeObjectURL(objectUrl);
      resolve(dims);
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve({ width: 0, height: 0 });
    };
    img.src = objectUrl;
  });
}

function assertStoryboardWiring(built: Built, uploadedUrls: string[], modelKey: string) {
  const modelNode = built.nodes.find((node) => {
    const maybe = node as { isModel?: boolean };
    return maybe.isModel === true;
  }) as { id?: string; data?: { params?: Record<string, unknown> } } | undefined;
  if (!modelNode?.id) throw new Error("Weavy storyboard: node model AI tidak terbentuk");

  const params = modelNode.data?.params || {};
  const imageUrls = params.image_urls;
  const usesList = Array.isArray(imageUrls);
  if (usesList && imageUrls.length !== uploadedUrls.length) {
    throw new Error("Weavy storyboard: image_urls di node model tidak sesuai jumlah referensi upload");
  }

  uploadedUrls.forEach((url, index) => {
    const key = getStoryboardInputKey(modelKey, index);
    if (usesList) {
      if ((imageUrls as unknown[])[index] !== url) {
        throw new Error(`Weavy storyboard: image_urls #${index + 1} tidak sama dengan asset upload`);
      }
    } else {
      const slot = params[key] as { url?: string } | undefined;
      if (!slot || slot.url !== url) {
        throw new Error(`Weavy storyboard: param ${key} tidak berisi asset upload #${index + 1}`);
      }
    }

    const expectedHandle = `${modelNode.id}-input-${key}`;
    const connected = built.edges.some((edge) => {
      const maybe = edge as { target?: string; targetHandle?: string };
      return maybe.target === modelNode.id && maybe.targetHandle === expectedHandle;
    });
    if (!connected) {
      throw new Error(`Weavy storyboard: referensi #${index + 1} belum terhubung ke ${key}`);
    }
  });
}


function describeStoryboardWiring(modelKey: string, count: number): string {
  return Array.from({ length: count }, (_, index) => `ref #${index + 1} → ${getStoryboardInputKey(modelKey, index)}`).join(", ");
}

export type RefMeta = { width?: number; height?: number; name?: string };

function uuid(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  } catch {
    /* fallback */
  }
  return `${mkId()}-${mkId()}-${mkId()}-${mkId()}`;
}

/** Rebuild the exact file descriptor object Weavy's canvas stores for an uploaded asset. */
function weavyFileObject(url: string, meta: RefMeta | undefined, index: number) {
  let publicId = `uploads/${mkId()}`;
  let thumbnailUrl = url;
  try {
    const u = new URL(url);
    const m = /\/upload\/(?:v\d+\/)?(.+?)(\.[a-z0-9]+)?$/i.exec(u.pathname);
    if (m) {
      publicId = m[1];
      thumbnailUrl = `${u.origin}/image/upload/c_scale,w_150/v1/${publicId}.png`;
    }
  } catch {
    /* keep fallbacks */
  }
  return {
    type: "image",
    url,
    width: meta?.width && meta.width > 0 ? meta.width : 1024,
    height: meta?.height && meta.height > 0 ? meta.height : 1024,
    thumbnailUrl,
    publicId,
    id: uuid(),
    name: meta?.name || `ref_${index + 1}.webp`,
    insertionOrder: 0,
  };
}

/** Native Weavy "Image Iterator" node (media_iterator) holding one uploaded image. */
function mkImageIteratorNode(id: string, file: ReturnType<typeof weavyFileObject>, x: number, y: number) {
  return {
    id,
    type: "media_iterator",
    data: {
      version: 3,
      description: "Iterate over a list of images",
      type: "media_iterator",
      name: "Image Iterator",
      handles: {
        input: {},
        output: {
          file: {
            id: "image-iterator-output",
            type: "image",
            label: "Image",
            order: 0,
            format: "uri",
            description: "The selected image",
            required: false,
          },
        },
      },
      color: "#000000",
      files: { type: "value", data: { type: "file_array", value: [file] } },
      selectedIndex: 0,
      acceptedFileType: "image",
      viewMode: "all",
      result: file,
      output: { file },
    },
    isModel: false,
    owner: null,
    visibility: "public",
    locked: false,
    position: { x, y },
    selected: false,
    width: 460,
    height: 544,
  };
}

/** Native Weavy "Prompt" node (promptV3). */
function mkPromptNode(id: string, prompt: string, x: number, y: number) {
  return {
    id,
    dragHandle: ".node-header",
    owner: null,
    type: "promptV3",
    visibility: null,
    isModel: false,
    data: {
      handles: { input: [], output: { prompt: { type: "text", order: 0, format: "text", description: "Text prompt" } } },
      name: "Prompt",
      description: null,
      color: "Yambo_Green",
      label: "prompt",
      menu: null,
      params: null,
      schema: null,
      version: 3,
      prompt,
      result: { prompt },
      dark_color: "Yambo_Green_Dark",
      border_color: "Yambo_Green_Stroke",
      inputNodes: [],
      displayMode: "source-value",
      output: { type: "text", prompt },
    },
    locked: false,
    position: { x, y },
    selected: false,
    width: 460,
    height: 407,
  };
}

const NB2_RESOLUTIONS = ["512", "1K", "2K", "4K"];
const NB2_RATIOS = [
  "Default", "8:1", "4:1", "21:9", "16:9", "5:4", "4:3", "3:2",
  "1:1", "2:3", "3:4", "4:5", "9:16", "1:4", "1:8",
];

/**
 * Gemini 3.1 Flash (Nano Banana 2) — mirror 1:1 dari node natif Weavy
 * `fal-ai/nano-banana-2/edit`: Image Iterator ×N → image_1..image_5,
 * Prompt node → prompt, params berisi objek file (bukan image_urls list).
 */
function buildNb2Recipe(
  prompt: string,
  resolutionIn: string,
  ratio: string,
  urlsIn: string[],
  metas: RefMeta[] = [],
): Built {
  const model = "fal-ai/nano-banana-2/edit";
  const urls = urlsIn.slice(0, 5);
  const rawRes = ((resolutionIn || "2K").split("@").pop() || "2K").trim().toUpperCase();
  const resolution =
    rawRes === "0.5K" || rawRes === "512"
      ? "512"
      : NB2_RESOLUTIONS.includes(rawRes)
        ? rawRes
        : "2K";

  const aspectRatio = NB2_RATIOS.includes(ratio) ? ratio : "Default";

  const modelNodeId = uuid();
  const promptNodeId = uuid();
  const files = urls.map((u, i) => weavyFileObject(u, metas[i], i));
  const iterNodes = files.map((f, i) => mkImageIteratorNode(uuid(), f, -3120, -1340 + i * 620));
  const promptNode = mkPromptNode(promptNodeId, prompt, -3260, -2850);

  const inputHandles: Record<string, unknown> = {
    prompt: {
      id: uuid(),
      type: "text",
      label: "prompt",
      order: 0,
      format: "text",
      required: true,
      description: "Description of the edits you want to make",
    },
  };
  urls.forEach((_, i) => {
    const key = `image_${i + 1}`;
    inputHandles[key] = {
      id: uuid(),
      type: "image",
      label: key,
      order: i + 1,
      format: "uri",
      required: false,
      description: i === 0 ? "The image you want to edit" : "",
    };
  });

  const kindInputs: unknown[] = [
    [
      {
        id: "prompt",
        title: "prompt",
        description: "Description of the edits you want to make",
        validTypes: ["text"],
        required: true,
      },
      { nodeId: promptNodeId, outputId: "prompt", string: prompt },
    ],
  ];
  urls.forEach((_, i) => {
    const key = `image_${i + 1}`;
    kindInputs.push([
      {
        id: key,
        title: i === 0 ? key : `Image ${i + 1}`,
        ...(i === 0 ? { description: "The image you want to edit" } : {}),
        validTypes: ["image"],
        required: false,
      },
      { nodeId: (iterNodes[i] as { id: string }).id, outputId: "file", file: files[i] },
    ]);
  });

  // Resolved inputs, persis seperti canvas Weavy setelah node ter-wire.
  const resolvedInput: Record<string, unknown> = { prompt };
  const iteratorInput: Record<string, unknown> = { runMode: "parallel" };
  files.forEach((f, i) => {
    const key = `image_${i + 1}`;
    resolvedInput[key] = f;
    iteratorInput[key] = { iteratorNodeId: (iterNodes[i] as { id: string }).id, options: [f] };
  });


  const seed = { seed: Math.floor(Math.random() * 1_000_000), isRandom: true };
  const params: Record<string, unknown> = {
    seed,
    resolution,
    aspect_ratio: aspectRatio,
    output_format: "png",
    enable_web_search: false,
    prompt,
  };
  files.forEach((f, i) => {
    params[`image_${i + 1}`] = f;
  });

  const schema = {
    seed: {
      type: "seed",
      title: "Seed",
      required: false,
      description: "Seed value for random number generator. Uncheck for reproducible results.",
    },
    resolution: {
      type: "enum",
      title: "Resolution",
      default: "1K",
      options: NB2_RESOLUTIONS,
      required: false,
      description: "The resolution of the image to generate.",
    },
    aspect_ratio: {
      type: "enum",
      order: 0,
      title: "Aspect Ratio",
      default: "Default",
      options: NB2_RATIOS,
      required: false,
      description:
        "Aspect ratio of the generated image. Default means 1:1 for text to image or match one of the input image's aspect ratio for image editing",
    },
    enable_web_search: {
      type: "boolean",
      title: "Enable Web Search",
      default: false,
      required: false,
      description:
        "Enable web search for the image generation task. This will allow the model to use the latest information from the web to generate the image.",
    },
  };

  const modelDescription = "Google's state-of-the-art image generation and editing model\\n";

  const modelNode = {
    id: modelNodeId,
    dragHandle: ".node-header",
    owner: null,
    type: "custommodelV2",
    visibility: null,
    isModel: true,
    data: {
      handles: {
        input: inputHandles,
        output: {
          result: {
            id: uuid(),
            type: "image",
            label: "result",
            order: 0,
            format: "uri",
            description: "Result image",
          },
        },
      },
      name: "Gemini 3.1 Flash (Nano Banana 2)",
      description: modelDescription,
      color: "Red",
      label: null,
      menu: { icon: "EmojiObjectsIcon", isModel: true, displayName: "Gemini Edit" },
      model: { name: model, service: "fal_imported", version: model },
      params,
      schema,
      version: 3,
      cameraLocked: false,
      selectedIndex: 0,
      selectedOutput: 0,
      input: resolvedInput,
      iteratorInput,

      kind: {
        type: "wildcard",
        model: {
          type: "predefined",
          name: model,
          version: model,
          service: "fal_imported",
          description: modelDescription,
        },
        inputs: kindInputs,
        parameters: [
          [
            {
              id: "seed",
              title: "Seed",
              description: "Seed value for random number generator. Uncheck for reproducible results.",
              constraint: { type: "seed" },
              defaultValue: { type: "seed", value: { seed: 1, isRandom: false } },
            },
            { type: "value", data: { type: "seed", value: seed } },
          ],
          [
            {
              id: "resolution",
              title: "Resolution",
              description: "The resolution of the image to generate.",
              constraint: { type: "enum", options: NB2_RESOLUTIONS },
              defaultValue: { type: "string", value: "1K" },
            },
            { type: "value", data: { type: "string", value: resolution } },
          ],
          [
            {
              id: "aspect_ratio",
              title: "Aspect Ratio",
              description:
                "Aspect ratio of the generated image. Default means 1:1 for text to image or match one of the input image's aspect ratio for image editing",
              constraint: { type: "enum", options: NB2_RATIOS },
              defaultValue: { type: "string", value: "Default" },
            },
            { type: "value", data: { type: "string", value: aspectRatio } },
          ],
          [
            {
              id: "enable_web_search",
              title: "Enable Web Search",
              description:
                "Enable web search for the image generation task. This will allow the model to use the latest information from the web to generate the image.",
              constraint: { type: "boolean" },
              defaultValue: { type: "boolean", value: false },
            },
            { type: "value", data: { type: "boolean", value: false } },
          ],
        ],
        outputs: [{ id: "result", title: "result", description: "Result image", dataType: "image" }],
      },
    },
    locked: false,
    position: { x: -2580, y: -2210 },
    selected: true,
    width: 460,
    height: 1159,
    zIndex: 2,
  };

  const edges: unknown[] = iterNodes.map((node, i) => {
    const nodeId = (node as { id: string }).id;
    return {
      id: uuid(),
      source: nodeId,
      target: modelNodeId,
      sourceHandle: `${nodeId}-output-file`,
      targetHandle: `${modelNodeId}-input-image_${i + 1}`,
      type: "custom",
      data: {
        sourceColor: "#000000",
        targetColor: "Red",
        sourceHandleType: "image",
        targetHandleType: "image",
      },
      selected: true,
    };
  });
  edges.push({
    id: uuid(),
    source: promptNodeId,
    target: modelNodeId,
    sourceHandle: `${promptNodeId}-output-prompt`,
    targetHandle: `${modelNodeId}-input-prompt`,
    type: "custom",
    data: {
      sourceColor: "Yambo_Green",
      targetColor: "Red",
      sourceHandleType: "text",
      targetHandleType: "text",
    },
    selected: true,
  });

  return { model, nodes: [modelNode, ...iterNodes, promptNode], edges };
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

// Accepts "quality@1K|2K|4K" (size derived from ratio) or legacy "quality@WxH"/"auto".
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

/**
 * Native Weavy node "ChatGPT Images 2.0 Edit".
 * Params yang dipakai node natif (lihat panel kanan di canvas Weavy):
 *   Model      → "GPT Image 2"
 *   Quality    → low | medium | high
 *   Resolution → "1024x1536" (string WxH, bukan object image_size)
 * Input handle: prompt, image, image_2 … image_5 (semua di-wire dari node File).
 */
function buildGptImage2Recipe(prompt: string, quality: string, ratio: string, urlsIn: string[]): Built {
  const model = "openai/gpt-image-2/edit";
  // Node natif "ChatGPT Images 2.0 Edit" punya max 5 handle referensi
  // (image, image_2..image_5). Sisanya diabaikan — cap eksplisit.
  const urls = urlsIn.slice(0, 5);
  const parsed = parseGptQuality(quality, ratio);
  const resolution = parsed.size ? `${parsed.size.width}x${parsed.size.height}` : "auto";
  const modelNodeId = "n_" + Date.now() + "_mdl";
  const importNodes = urls.map((u, i) =>
    mkImportNode("n_" + Date.now() + "_" + i, u, `ref_${i + 1}.jpg`, 100 + i * 460),
  );
  const inputHandles: Record<string, unknown> = {
    prompt: { id: "input-prompt", type: "text", label: "prompt", format: "text", required: true },
  };
  const kindInputs: unknown[] = [
    [{ id: "prompt", title: "prompt", validTypes: ["text"], required: true }, null],
  ];
  urls.forEach((_, i) => {
    const key = gptEditInputKey(i);
    inputHandles[key] = {
      id: `input-${key}`, type: "image", label: key, format: "text", required: i === 0,
    };
    kindInputs.push([
      { id: key, title: key, validTypes: ["image"], required: i === 0 },
      { nodeId: (importNodes[i] as { id: string }).id, outputId: "file" },
    ]);
  });
  const params = {
    image_urls: urls,
    prompt,
    model: "GPT Image 2",
    quality: parsed.quality,
    resolution,
    num_images: 1,
    output_format: "png",
  };
  const modelNode = {
    id: modelNodeId, type: "custommodelV2", dragHandle: ".node-header", owner: null, visibility: "private", isModel: true,
    data: {
      handles: {
        input: inputHandles,
        output: { result: { id: "output-result", type: "image", label: "result", order: 0, format: "uri" } },
      },
      name: "ChatGPT Images 2.0 Edit",
      color: "Red",
      menu: { icon: "EmojiObjectsIcon", isModel: true, displayName: "ChatGPT Images 2.0 Edit" },
      model: { name: model, service: "fal_imported", version: model },
      params, version: 3,
      kind: {
        type: "wildcard",
        model: { type: "predefined", name: model, version: model, service: "fal_imported" },
        inputs: kindInputs,
        parameters: [
          [{ id: "image_urls", title: "image_urls", constraint: { type: "list" }, defaultValue: { type: "list", value: urls } }, { type: "value", data: { type: "list", value: urls } }],
          [{ id: "prompt", title: "prompt", constraint: { type: "string" }, defaultValue: { type: "string", value: prompt } }, { type: "value", data: { type: "string", value: prompt } }],
          [{ id: "model", title: "model", constraint: { type: "enum", options: ["GPT Image 2", "GPT Image 1"] }, defaultValue: { type: "string", value: "GPT Image 2" } }, { type: "value", data: { type: "string", value: "GPT Image 2" } }],
          [{ id: "quality", title: "quality", constraint: { type: "enum", options: ["low", "medium", "high"] }, defaultValue: { type: "string", value: parsed.quality } }, { type: "value", data: { type: "string", value: parsed.quality } }],
          [{ id: "resolution", title: "resolution", constraint: { type: "enum" }, defaultValue: { type: "string", value: resolution } }, { type: "value", data: { type: "string", value: resolution } }],
          [{ id: "num_images", title: "num_images", constraint: { type: "number" }, defaultValue: { type: "number", value: 1 } }, { type: "value", data: { type: "number", value: 1 } }],
          [{ id: "output_format", title: "output_format", constraint: { type: "enum", options: ["png", "jpeg", "webp"] }, defaultValue: { type: "string", value: "png" } }, { type: "value", data: { type: "string", value: "png" } }],
        ],
        outputs: [{ id: "result", title: "result", dataType: "image" }],
      },
      generations: [], selectedIndex: 0, cameraLocked: false, result: [], output: {}, selectedOutput: 0,
    },
    position: { x: 600, y: 300 }, width: 460, height: 500,
  };
  const edges = importNodes.map((node, i) => {
    const nodeId = (node as { id: string }).id;
    return {
      id: "e-" + mkId(),
      source: nodeId, target: modelNodeId,
      sourceHandle: `${nodeId}-output-file`,
      targetHandle: `${modelNodeId}-input-${gptEditInputKey(i)}`,
      type: "custom",
      data: { sourceColor: "Yambo_Blue", targetColor: "Red", sourceHandleType: "image", targetHandleType: "image" },
    };
  });
  return { model, nodes: [...importNodes, modelNode], edges };
}



/**
 * Seedream V5.0 Pro Edit — node natif Weavy (bukan imported model).
 * Weavy memakai id model fal natif; kita coba beberapa varian id karena
 * penamaan bisa berbeda antar rilis (lihat SEEDREAM_MODEL_CANDIDATES).
 */
export const SEEDREAM_MODEL_CANDIDATES = [
  "fal-ai/bytedance/seedream/v5-pro/edit",
  "fal-ai/bytedance/seedream/v5/pro/edit",
  "fal-ai/bytedance/seedream/v5/edit",
  "fal-ai/bytedance/seedream/v4/edit",
];

function buildSeedreamEditRecipe(prompt: string, model: string, ratio: string, urls: string[]): Built {
  const modelNodeId = "n_" + Date.now() + "_mdl";
  const importNodes = urls.map((u, i) =>
    mkImportNode("n_" + Date.now() + "_" + i, u, `ref_${i + 1}.jpg`, 100 + i * 460),
  );
  const inputHandles: Record<string, unknown> = {
    prompt: { id: "input-prompt", type: "text", label: "prompt", format: "text", required: true },
  };
  const kindInputs: unknown[] = [
    [{ id: "prompt", title: "prompt", validTypes: ["text"], required: true }, null],
  ];
  urls.forEach((_, i) => {
    const key = `image_${i + 1}`;
    inputHandles[key] = { id: `input-${key}`, type: "image", label: key, format: "text", required: i === 0 };
    kindInputs.push([
      { id: key, title: key, validTypes: ["image"], required: i === 0 },
      { nodeId: (importNodes[i] as { id: string }).id, outputId: "file" },
    ]);
  });
  const validRatios = new Set(["1:1", "3:4", "4:3", "9:16", "16:9", "2:3", "3:2", "21:9"]);
  const aspectRatio = ratio && validRatios.has(ratio) ? ratio : "1:1";
  // Parameter natif Seedream V5 Pro Edit di Weavy.
  const params = {
    prompt,
    image_urls: urls,
    aspect_ratio: aspectRatio,
    num_images: 1,
    max_images: 1,
    enable_safety_checker: false,
    output_format: "png",
  };
  const modelNode = {
    id: modelNodeId, type: "custommodelV2", dragHandle: ".node-header", owner: null, visibility: "private", isModel: true,
    data: {
      handles: {
        input: inputHandles,
        output: { result: { id: "output-result", type: "image", label: "result", order: 0, format: "uri" } },
      },
      name: "Seedream V5.0 Pro Edit", color: "Purple",
      menu: { icon: "AutoAwesomeIcon", isModel: true, displayName: "Seedream V5.0 Pro Edit" },
      model: { name: model, service: "fal", version: model },
      params, version: 3,
      kind: {
        type: "wildcard",
        model: { type: "predefined", name: model, version: model, service: "fal" },
        inputs: kindInputs,
        parameters: [
          [{ id: "prompt", title: "prompt", constraint: { type: "string" }, defaultValue: { type: "string", value: prompt } }, { type: "value", data: { type: "string", value: prompt } }],
          [{ id: "image_urls", title: "image_urls", constraint: { type: "list" }, defaultValue: { type: "list", value: urls } }, { type: "value", data: { type: "list", value: urls } }],
          [{ id: "aspect_ratio", title: "aspect_ratio", constraint: { type: "enum" }, defaultValue: { type: "string", value: aspectRatio } }, { type: "value", data: { type: "string", value: aspectRatio } }],
          [{ id: "num_images", title: "num_images", constraint: { type: "number" }, defaultValue: { type: "number", value: 1 } }, { type: "value", data: { type: "number", value: 1 } }],
          [{ id: "max_images", title: "max_images", constraint: { type: "number" }, defaultValue: { type: "number", value: 1 } }, { type: "value", data: { type: "number", value: 1 } }],
          [{ id: "enable_safety_checker", title: "enable_safety_checker", constraint: { type: "boolean" }, defaultValue: { type: "boolean", value: false } }, { type: "value", data: { type: "boolean", value: false } }],
          [{ id: "output_format", title: "output_format", constraint: { type: "enum", options: ["png", "jpeg", "webp"] }, defaultValue: { type: "string", value: "png" } }, { type: "value", data: { type: "string", value: "png" } }],
        ],
        outputs: [{ id: "result", title: "result", dataType: "image" }],
      },
      generations: [], selectedIndex: 0, cameraLocked: false, result: [], output: {}, selectedOutput: 0,
    },
    position: { x: 600 + urls.length * 40, y: 300 }, width: 460, height: 500,
  };
  const edges = importNodes.map((node, i) => {
    const nodeId = (node as { id: string }).id;
    const key = `image_${i + 1}`;
    return {
      id: "e-" + mkId(),
      source: nodeId, target: modelNodeId,
      sourceHandle: `${nodeId}-output-file`,
      targetHandle: `${modelNodeId}-input-${key}`,
      type: "custom",
      data: { sourceColor: "Yambo_Blue", targetColor: "Purple", sourceHandleType: "any", targetHandleType: "image" },
    };
  });
  return { model, nodes: [...importNodes, modelNode], edges };
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
      const r = await fetch(
        `${WEAVY_API}/v1/batches/recipes/${recipeId}/batches/${batchId}/status`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        },
      );
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
              ro?.image_url,
              nr.output?.file?.url,
              nr.output?.image_url,
              nr.output?.url,
              ...((nr.generations || []) as { url?: string; image_url?: string }[]).map(
                (g) => g.url || g.image_url,
              ),
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
          .filter(Boolean)
          .join(" | ");
        throw new Error(
          (d.error || d.message || "Weavy generation failed") + (ne ? " | " + ne : ""),
        );
      }
    } catch (e) {
      if (a > 8) throw e;
    }
  }
  throw new Error("Weavy timeout: generation took too long");
}

async function urlToFile(url: string, i: number): Promise<File> {
  // Marketplace scrapers often return tiny CDN thumbnails. Try original/high-res
  // variants and keep the largest real image so Weavy gets the same visual signal
  // as a manual upload in the native Weavy canvas.
  const candidates = referenceCandidates(url);
  let best: { blob: Blob; url: string; width: number; height: number } | null = null;
  let lastStatus = 0;
  for (const candidate of candidates) {
    const proxied = /^https?:\/\//i.test(candidate)
      ? `/api/public/proxy-image?url=${encodeURIComponent(candidate)}`
      : candidate;
    try {
      const res = await fetch(proxied);
      lastStatus = res.status;
      if (!res.ok) continue;
      const blob = await res.blob();
      const type = blob.type || "image/jpeg";
      if (!type.startsWith("image/")) continue;
      const dims = await imageDimensions(blob);
      if (!best || blob.size > best.blob.size || dims.width * dims.height > best.width * best.height) {
        best = { blob, url: candidate, width: dims.width, height: dims.height };
      }
      if (blob.size >= 60_000 && dims.width >= 700 && dims.height >= 700) break;
    } catch {
      /* try next candidate */
    }
  }
  if (!best) throw new Error(`Gagal fetch reference #${i + 1} (${lastStatus || "no response"})`);
  const blob = best.blob;
  const type = blob.type || "image/jpeg";
  if (!type.startsWith("image/")) {
    throw new Error(`Reference #${i + 1} bukan file gambar valid (${type || "unknown"})`);
  }
  const ext = type.includes("png") ? "png" : type.includes("webp") ? "webp" : "jpg";
  const file = new File([blob], `ref_${i + 1}.${ext}`, { type });
  Object.defineProperty(file, "__storyboardMeta", {
    value: { width: best.width, height: best.height, sourceUrl: best.url },
    enumerable: false,
  });
  return file;
}

export type WeavyStoryboardOpts = {
  modelKey: string; // "nanobanana2" | "gptimage2"
  prompt: string;
  quality: string;
  ratio: string;
  referenceUrls: string[]; // remote product images (max 6)
  onProgress?: StoryboardProgress;
};

export async function generateWeavyStoryboard(opts: WeavyStoryboardOpts): Promise<string> {
  const maxRefs = getStoryboardReferenceLimit(opts.modelKey);
  const allRefs = (opts.referenceUrls || []).filter(Boolean);
  const refs = allRefs.slice(0, maxRefs);
  if (refs.length === 0) throw new Error("Storyboard butuh minimal 1 gambar referensi produk.");
  if (allRefs.length > refs.length) {
    logStoryboard(
      opts.onProgress,
      `Model ini menerima maksimal ${refs.length} referensi; ${allRefs.length - refs.length} gambar ekstra dilewati`,
    );
  }

  const tried = new Set<string>();
  let lastErr: Error | null = null;

  while (true) {
    const active = await getActiveWeavyAccessToken();
    if (!active) break;
    if (tried.has(active.id)) break;
    tried.add(active.id);
    try {
      // Fetch remote refs → File → upload semua ke Weavy asset store.
      logStoryboard(opts.onProgress, `Menyiapkan ${refs.length} gambar referensi produk untuk upload ke Weavy…`);
      const files = await Promise.all(refs.map(async (u, i) => {
        logStoryboard(opts.onProgress, `Fetch reference #${i + 1} dari URL produk…`);
        const file = await urlToFile(u, i);
        const meta = (file as File & { __storyboardMeta?: { width: number; height: number } }).__storyboardMeta;
        logStoryboard(
          opts.onProgress,
          `Reference #${i + 1} valid: ${file.type}, ${Math.round(file.size / 1024)} KB${meta ? `, ${meta.width}×${meta.height}px` : ""}`,
        );
        return file;
      }));
      const uploadedUrls: string[] = [];
      for (let i = 0; i < files.length; i++) {
        logStoryboard(opts.onProgress, `Upload reference #${i + 1} ke Weavy asset store…`);
        const up = await uploadWeavyAssetWithRetry(
          files[i],
          `ref_${Date.now()}_${i}.jpg`,
          active.accessToken,
        );
        const uploadedUrl = resolveWeavyAssetUrl(up, "image");
        uploadedUrls.push(uploadedUrl);
        logStoryboard(opts.onProgress, `Reference #${i + 1} ter-upload → node File → ${getStoryboardInputKey(opts.modelKey, i)}`);
      }

      const mk = opts.modelKey;
      const refMetas: RefMeta[] = files.map((f) => {
        const meta = (f as File & { __storyboardMeta?: { width: number; height: number } }).__storyboardMeta;
        return { width: meta?.width, height: meta?.height, name: f.name };
      });
      if (mk.startsWith("seedream-")) {
        return await runSeedreamWithFallback(
          opts.prompt, opts.ratio || "1:1", uploadedUrls, active.accessToken, opts.modelKey, opts.onProgress,
        );
      }
      const built = mk === "nanobanana2"
        ? buildNb2Recipe(opts.prompt, opts.quality || "2K", opts.ratio || "9:16", uploadedUrls, refMetas)
        : buildGptImage2Recipe(opts.prompt, opts.quality || "medium@1K", opts.ratio || "1:1", uploadedUrls);

      assertStoryboardWiring(built, uploadedUrls, opts.modelKey);
      logStoryboard(opts.onProgress, `Recipe Weavy tervalidasi: ${describeStoryboardWiring(opts.modelKey, uploadedUrls.length)}`);

      return await runBuiltRecipe(built, active.accessToken, uploadedUrls, opts.onProgress);

    } catch (e) {
      lastErr = e instanceof Error ? e : new Error(String(e));
      const msg = lastErr.message || "";
      const creditLike =
        /insufficient|credits?|quota|balance|402|401|403|cukup|not enough|payment|unauthori[sz]ed|amount/i.test(
          msg,
        );
      if (!creditLike) throw lastErr;
      await rotateWeavyToken(active.id);
    }
  }
  throw lastErr ?? new Error("Belum ada Weavy token aktif di Kelola Token");
}

export type WeavyEditOpts = {
  modelKey: string; // "nanobanana2" | "gptimage2"
  prompt: string;
  quality: string;
  ratio: string;
  files: File[]; // target first, then references (max 6)
  onProgress?: StoryboardProgress;
};

export async function generateWeavyEdit(opts: WeavyEditOpts): Promise<string> {
  const maxRefs = getStoryboardReferenceLimit(opts.modelKey);
  const allFiles = (opts.files || []).filter(Boolean);
  const files = allFiles.slice(0, maxRefs);
  if (files.length === 0) throw new Error("Weavy edit butuh minimal 1 file.");
  if (allFiles.length > files.length) {
    logStoryboard(
      opts.onProgress,
      `Model ini menerima maksimal ${files.length} referensi; ${allFiles.length - files.length} file ekstra dilewati`,
    );
  }

  const tried = new Set<string>();
  let lastErr: Error | null = null;

  while (true) {
    const active = await getActiveWeavyAccessToken();
    if (!active) break;
    if (tried.has(active.id)) break;
    tried.add(active.id);
    try {
      const uploadedUrls: string[] = [];
      for (let i = 0; i < files.length; i++) {
        logStoryboard(opts.onProgress, `Upload reference #${i + 1} ke Weavy asset store…`);
        const up = await uploadWeavyAssetWithRetry(
          files[i],
          `ref_${Date.now()}_${i}.jpg`,
          active.accessToken,
        );
        const uploadedUrl = resolveWeavyAssetUrl(up, "image");
        uploadedUrls.push(uploadedUrl);
        logStoryboard(opts.onProgress, `Reference #${i + 1} ter-upload → node File → ${getStoryboardInputKey(opts.modelKey, i)}`);
      }

      const mk = opts.modelKey;
      const refMetas: RefMeta[] = files.map((f) => ({ name: f.name }));
      if (mk.startsWith("seedream-")) {
        return await runSeedreamWithFallback(
          opts.prompt, opts.ratio || "1:1", uploadedUrls, active.accessToken, opts.modelKey, opts.onProgress,
        );
      }
      const built = mk === "nanobanana2"
        ? buildNb2Recipe(opts.prompt, opts.quality || "2K", opts.ratio || "9:16", uploadedUrls, refMetas)
        : buildGptImage2Recipe(opts.prompt, opts.quality || "medium@1K", opts.ratio || "1:1", uploadedUrls);

      assertStoryboardWiring(built, uploadedUrls, opts.modelKey);
      logStoryboard(opts.onProgress, `Recipe Weavy tervalidasi: ${describeStoryboardWiring(opts.modelKey, uploadedUrls.length)}`);
      return await runBuiltRecipe(built, active.accessToken, uploadedUrls, opts.onProgress);

    } catch (e) {
      lastErr = e instanceof Error ? e : new Error(String(e));
      const msg = lastErr.message || "";
      const creditLike =
        /insufficient|credits?|quota|balance|402|401|403|cukup|not enough|payment|unauthori[sz]ed|amount/i.test(
          msg,
        );
      if (!creditLike) throw lastErr;
      await rotateWeavyToken(active.id);
    }
  }
  throw lastErr ?? new Error("Belum ada Weavy token aktif di Kelola Token");
}

/** Jalankan recipe yang sudah dibangun: create → save → approve → execute → poll. */
async function runBuiltRecipe(
  built: Built,
  accessToken: string,
  uploadedUrls: string[],
  onProgress?: StoryboardProgress,
): Promise<string> {
  const { id: recipeId, v3 } = await createWeavyRecipe(accessToken);
  logStoryboard(onProgress, `Recipe Weavy dibuat (${recipeId}); menyimpan ${built.nodes.length} node dan ${built.edges.length} koneksi…`);
  await saveWeavyRecipe(recipeId, { nodes: built.nodes, edges: built.edges, v3 }, accessToken);
  await approveWeavyModel(built.model, accessToken);
  logStoryboard(onProgress, `Submit batch Weavy dengan ${uploadedUrls.length} referensi visual nyata…`);
  const { batchId } = await executeWeavyBatch(recipeId, built.nodes, built.edges, accessToken, built.model);
  logStoryboard(onProgress, `Batch Weavy berjalan (${batchId}); menunggu hasil gambar…`);
  return await pollWeavyImage(recipeId, batchId, accessToken, uploadedUrls);
}

/**
 * Seedream V5.0 Pro: coba id model natif Weavy satu per satu. Kalau Weavy
 * menolak karena dianggap imported model / model tidak dikenal, lanjut ke
 * kandidat berikutnya sampai ada yang jalan.
 */
async function runSeedreamWithFallback(
  prompt: string,
  ratio: string,
  uploadedUrls: string[],
  accessToken: string,
  modelKey: string,
  onProgress?: StoryboardProgress,
): Promise<string> {
  let lastErr: Error | null = null;
  for (const candidate of SEEDREAM_MODEL_CANDIDATES) {
    const built = buildSeedreamEditRecipe(prompt, candidate, ratio, uploadedUrls);
    assertStoryboardWiring(built, uploadedUrls, modelKey);
    logStoryboard(onProgress, `Seedream V5.0 Pro (node natif Weavy) → ${candidate}`);
    try {
      return await runBuiltRecipe(built, accessToken, uploadedUrls, onProgress);
    } catch (e) {
      lastErr = e instanceof Error ? e : new Error(String(e));
      const retryable = /imported model|paid plan|not found|unknown model|unsupported model|invalid model/i.test(
        lastErr.message || "",
      );
      if (!retryable) throw lastErr;
      logStoryboard(onProgress, `Model id ${candidate} ditolak Weavy (${lastErr.message}); coba varian berikutnya…`);
    }
  }
  throw lastErr ?? new Error("Seedream V5.0 Pro gagal dijalankan di Weavy");
}
