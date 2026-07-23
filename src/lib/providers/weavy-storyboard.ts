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

function inputKey(i: number): string {
  return i === 0 ? "image" : `image_${i + 1}`;
}

function gptEditInputKey(i: number): string {
  return i === 0 ? "first_frame" : `image_${i + 1}`;
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
      handles: { output: { file: { type: "any", label: "File", order: 0, format: "uri" } } },
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

function buildNb2Recipe(prompt: string, resolution: string, ratio: string, urls: string[]): Built {
  const model = "fal-ai/nano-banana-2/edit";
  const modelNodeId = "n_" + Date.now() + "_mdl";
  const importNodes = urls.map((u, i) =>
    mkImportNode("n_" + Date.now() + "_" + i, u, `ref_${i + 1}.jpg`, 100 + i * 460),
  );
  const inputHandles: Record<string, unknown> = {
    prompt: { id: "input-prompt", type: "text", label: "prompt", format: "text", required: true },
  };
  urls.forEach((_, i) => {
    inputHandles[inputKey(i)] = {
      id: `input-${inputKey(i)}`,
      type: "image",
      label: inputKey(i),
      format: "text",
      required: i === 0,
    };
  });
  const kindInputs: unknown[] = [
    [{ id: "prompt", title: "prompt", validTypes: ["text"], required: true }, null],
  ];
  urls.forEach((_, i) => {
    kindInputs.push([
      { id: inputKey(i), title: inputKey(i), validTypes: ["image"], required: i === 0 },
      { nodeId: (importNodes[i] as { id: string }).id, outputId: "file" },
    ]);
  });
  // Aspect ratio: honor user selection. "original"/empty → "auto" (menjaga identitas referensi).
  const validRatios = new Set(["1:1", "3:4", "4:3", "9:16", "16:9", "2:3", "3:2", "21:9"]);
  const aspectRatio = ratio && validRatios.has(ratio) ? ratio : "auto";
  const params = {
    image_urls: urls,
    prompt,
    aspect_ratio: aspectRatio,
    resolution,
    num_images: 1,
    output_format: "png",
    safety_tolerance: "4",
    limit_generations: false,
    enable_web_search: false,
  };
  const modelNode = {
    id: modelNodeId,
    type: "custommodelV2",
    dragHandle: ".node-header",
    owner: null,
    visibility: "private",
    isModel: true,
    data: {
      handles: {
        input: inputHandles,
        output: {
          result: { id: "output-result", type: "image", label: "result", order: 0, format: "uri" },
        },
      },
      name: "Gemini 3.1 Flash (Nano Banana 2)",
      color: "Yellow",
      menu: {
        icon: "AutoAwesomeIcon",
        isModel: true,
        displayName: "Gemini 3.1 Flash (Nano Banana 2)",
      },
      model: { name: model, service: "fal_imported", version: model },
      params,
      version: 3,
      kind: {
        type: "wildcard",
        model: { type: "predefined", name: model, version: model, service: "fal_imported" },
        inputs: kindInputs,
        parameters: [
          [
            {
              id: "image_urls",
              title: "image_urls",
              constraint: { type: "list" },
              defaultValue: { type: "list", value: urls },
            },
            { type: "value", data: { type: "list", value: urls } },
          ],
          [
            {
              id: "prompt",
              title: "prompt",
              constraint: { type: "string" },
              defaultValue: { type: "string", value: prompt },
            },
            { type: "value", data: { type: "string", value: prompt } },
          ],
          [
            {
              id: "resolution",
              title: "resolution",
              constraint: { type: "enum" },
              defaultValue: { type: "string", value: resolution },
            },
            { type: "value", data: { type: "string", value: resolution } },
          ],
          [
            {
              id: "aspect_ratio",
              title: "aspect_ratio",
              constraint: { type: "enum" },
              defaultValue: { type: "string", value: aspectRatio },
            },
            { type: "value", data: { type: "string", value: aspectRatio } },
          ],
          [
            {
              id: "num_images",
              title: "num_images",
              constraint: { type: "number" },
              defaultValue: { type: "number", value: 1 },
            },
            { type: "value", data: { type: "number", value: 1 } },
          ],
          [
            {
              id: "output_format",
              title: "output_format",
              constraint: { type: "enum" },
              defaultValue: { type: "string", value: "png" },
            },
            { type: "value", data: { type: "string", value: "png" } },
          ],
          [
            {
              id: "safety_tolerance",
              title: "safety_tolerance",
              constraint: { type: "enum" },
              defaultValue: { type: "string", value: "4" },
            },
            { type: "value", data: { type: "string", value: "4" } },
          ],
          [
            {
              id: "limit_generations",
              title: "limit_generations",
              constraint: { type: "boolean" },
              defaultValue: { type: "boolean", value: false },
            },
            { type: "value", data: { type: "boolean", value: false } },
          ],
          [
            {
              id: "enable_web_search",
              title: "enable_web_search",
              constraint: { type: "boolean" },
              defaultValue: { type: "boolean", value: false },
            },
            { type: "value", data: { type: "boolean", value: false } },
          ],
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
    position: { x: 600 + urls.length * 40, y: 300 },
    width: 460,
    height: 500,
  };
  const edges = importNodes.map((n, i) => ({
    id: "e-" + mkId(),
    source: (n as { id: string }).id,
    target: modelNodeId,
    sourceHandle: `${(n as { id: string }).id}-output-file`,
    targetHandle: `${modelNodeId}-input-${inputKey(i)}`,
    type: "custom",
    data: {
      sourceColor: "Yambo_Blue",
      targetColor: "Yellow",
      sourceHandleType: "any",
      targetHandleType: "image",
    },
  }));
  return { model, nodes: [...importNodes, modelNode], edges };
}

function buildGptImage2Recipe(prompt: string, quality: string, urls: string[]): Built {
  const model = "openai/gpt-image-2/edit";
  const modelNodeId = "n_" + Date.now() + "_mdl";
  const importNodes = urls.map((u, i) =>
    mkImportNode("n_" + Date.now() + "_" + i, u, `ref_${i + 1}.jpg`, 100 + i * 460),
  );
  const inputHandles: Record<string, unknown> = {};
  const kindInputs: unknown[] = [];
  urls.forEach((_, i) => {
    const key = gptEditInputKey(i);
    inputHandles[key] = {
      id: `input-${key}`,
      type: "image",
      label: i === 0 ? "first_frame" : key,
      format: "text",
      required: i === 0,
    };
    kindInputs.push([
      { id: key, title: key, validTypes: ["image"], required: i === 0 },
      { nodeId: (importNodes[i] as { id: string }).id, outputId: "file" },
    ]);
  });
  const params = { image_urls: urls, quality, prompt };
  const modelNode = {
    id: modelNodeId,
    type: "custommodelV2",
    dragHandle: ".node-header",
    owner: null,
    visibility: "private",
    isModel: true,
    data: {
      handles: {
        input: inputHandles,
        output: {
          result: { id: "output-result", type: "image", label: "result", order: 0, format: "uri" },
        },
      },
      name: "ChatGPT Image Edit",
      color: "Red",
      menu: { icon: "EmojiObjectsIcon", isModel: true, displayName: "ChatGPT Image Edit" },
      model: { name: model, service: "fal_imported", version: model },
      params,
      schema: {
        image_urls: { type: "list", title: "image_urls", required: true },
        prompt: { type: "string", title: "Prompt", required: true },
        quality: {
          type: "enum",
          order: 0,
          title: "Quality",
          default: "medium",
          options: ["low", "medium", "high"],
        },
      },
      version: 3,
      kind: {
        type: "wildcard",
        model: { type: "predefined", name: model, version: model, service: "fal_imported" },
        inputs: kindInputs,
        parameters: [
          [
            {
              id: "image_urls",
              title: "image_urls",
              constraint: { type: "list" },
              defaultValue: { type: "list", value: urls },
            },
            { type: "value", data: { type: "list", value: urls } },
          ],
          [
            {
              id: "prompt",
              title: "prompt",
              constraint: { type: "string" },
              defaultValue: { type: "string", value: prompt },
            },
            { type: "value", data: { type: "string", value: prompt } },
          ],
          [
            {
              id: "quality",
              title: "quality",
              constraint: { type: "enum" },
              defaultValue: { type: "string", value: quality },
            },
            { type: "value", data: { type: "string", value: quality } },
          ],
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
  const edges = importNodes.map((node, i) => {
    const nodeId = (node as { id: string }).id;
    return {
      id: "e-" + mkId(),
      source: nodeId,
      target: modelNodeId,
      sourceHandle: `${nodeId}-output-file`,
      targetHandle: `${modelNodeId}-input-${gptEditInputKey(i)}`,
      type: "custom",
      data: {
        sourceColor: "Yambo_Blue",
        targetColor: "Red",
        sourceHandleType: "any",
        targetHandleType: "image",
      },
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
  // Fetch via same-origin proxy to bypass CORS on marketplace CDNs.
  const proxied = /^https?:\/\//i.test(url)
    ? `/api/public/proxy-image?url=${encodeURIComponent(url)}`
    : url;
  const res = await fetch(proxied);
  if (!res.ok) throw new Error(`Gagal fetch reference #${i + 1} (${res.status})`);
  const blob = await res.blob();
  const type = blob.type || "image/jpeg";
  const ext = type.includes("png") ? "png" : type.includes("webp") ? "webp" : "jpg";
  return new File([blob], `ref_${i + 1}.${ext}`, { type });
}

export type WeavyStoryboardOpts = {
  modelKey: string; // "nanobanana2" | "gptimage2"
  prompt: string;
  quality: string;
  ratio: string;
  referenceUrls: string[]; // remote product images (max 6)
};

export async function generateWeavyStoryboard(opts: WeavyStoryboardOpts): Promise<string> {
  const refs = (opts.referenceUrls || []).filter(Boolean).slice(0, 6);
  if (refs.length === 0) throw new Error("Storyboard butuh minimal 1 gambar referensi produk.");

  const tried = new Set<string>();
  let lastErr: Error | null = null;

  while (true) {
    const active = await getActiveWeavyAccessToken();
    if (!active) break;
    if (tried.has(active.id)) break;
    tried.add(active.id);
    try {
      // Fetch remote refs → File → upload semua ke Weavy asset store.
      const files = await Promise.all(refs.map((u, i) => urlToFile(u, i)));
      const uploadedUrls: string[] = [];
      for (let i = 0; i < files.length; i++) {
        const up = await uploadWeavyAssetWithRetry(
          files[i],
          `ref_${Date.now()}_${i}.jpg`,
          active.accessToken,
        );
        uploadedUrls.push(resolveWeavyAssetUrl(up, "image"));
      }

      const isNb = opts.modelKey === "nanobanana2";
      const built = isNb
        ? buildNb2Recipe(opts.prompt, opts.quality || "1K", opts.ratio || "9:16", uploadedUrls)
        : buildGptImage2Recipe(opts.prompt, opts.quality || "medium", uploadedUrls);

      const { id: recipeId, v3 } = await createWeavyRecipe(active.accessToken);
      await saveWeavyRecipe(
        recipeId,
        { nodes: built.nodes, edges: built.edges, v3 },
        active.accessToken,
      );
      await approveWeavyModel(built.model, active.accessToken);
      const { batchId } = await executeWeavyBatch(
        recipeId,
        built.nodes,
        built.edges,
        active.accessToken,
        built.model,
      );
      return await pollWeavyImage(recipeId, batchId, active.accessToken, uploadedUrls);
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
};

export async function generateWeavyEdit(opts: WeavyEditOpts): Promise<string> {
  const files = (opts.files || []).filter(Boolean).slice(0, 6);
  if (files.length === 0) throw new Error("Weavy edit butuh minimal 1 file.");

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
        const up = await uploadWeavyAssetWithRetry(
          files[i],
          `ref_${Date.now()}_${i}.jpg`,
          active.accessToken,
        );
        uploadedUrls.push(resolveWeavyAssetUrl(up, "image"));
      }

      const isNb = opts.modelKey === "nanobanana2";
      const built = isNb
        ? buildNb2Recipe(opts.prompt, opts.quality || "1K", opts.ratio || "9:16", uploadedUrls)
        : buildGptImage2Recipe(opts.prompt, opts.quality || "medium", uploadedUrls);

      const { id: recipeId, v3 } = await createWeavyRecipe(active.accessToken);
      await saveWeavyRecipe(
        recipeId,
        { nodes: built.nodes, edges: built.edges, v3 },
        active.accessToken,
      );
      await approveWeavyModel(built.model, active.accessToken);
      const { batchId } = await executeWeavyBatch(
        recipeId,
        built.nodes,
        built.edges,
        active.accessToken,
        built.model,
      );
      return await pollWeavyImage(recipeId, batchId, active.accessToken, uploadedUrls);
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
