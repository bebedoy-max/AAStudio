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
import {
  getFirstLeonardoKey,
  uploadLeonardoInitImage,
  leonardoFetch,
  isLeonardoTokenExpired,
} from "./leonardo";

// ------------------------------------------------------------------
// Catalog
// ------------------------------------------------------------------
export type UpscalerProvider = "topaz" | "magnific" | "leonardo";
export type UpscalerMode = "upscale" | "enhance";

export type LeonardoUpscalerKind = "legacy" | "ultra" | "pro";
export type LeonardoProType = "precise" | "creative";
export type LeonardoUpscaleMultiplier = 2 | 3 | 4 | 5 | 6 | 8;

export type LeonardoAuroraParams = {
  /** Upscaler family di dashboard Leonardo. */
  upscaler: LeonardoUpscalerKind;
  /** Sub-type khusus Pro (Precise / Creative). */
  pro_type: LeonardoProType;
  /** Upscale Multiplier (2x – 8x). */
  upscale_factor: LeonardoUpscaleMultiplier;
  /** "Fix AI Image Artifacts" toggle. ON → clean, OFF → detailed. */
  fix_artifacts: boolean;
};


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
// Leonardo Aurora — GraphQL Generate + poll UpscaleVariation
// ------------------------------------------------------------------
async function getImageDims(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.naturalWidth || 1024, height: img.naturalHeight || 1024 });
      URL.revokeObjectURL(url);
    };
    img.onerror = () => {
      resolve({ width: 1024, height: 1024 });
      URL.revokeObjectURL(url);
    };
    img.src = url;
  });
}

const AURORA_GENERATE_QUERY = `mutation Generate($request: CreateGenerationRequest!) {
  generate(request: $request) {
    apiCreditCost
    generationId
    __typename
  }
}`;

const AURORA_POLL_QUERY = `query GetLatestPendingUpscaleVariationForGeneration($generationId: uuid!) {
  generations_by_pk(id: $generationId) {
    generated_images(order_by: [{createdAt: desc}]) {
      generated_image_variation_generics(
        where: {transformType: {_eq: UPSCALE}}
        order_by: [{createdAt: desc}]
        limit: 5
      ) {
        id
        createdAt
        status
        url
        transformType
        upscale_details {
          id
          variationId
          upscaleMultiplier
          width
          height
          mode
          modelId
          optional_metadata
          generated_image_variation_generic {
            id
            status
            url
            __typename
          }
          __typename
        }
        __typename
      }
      __typename
    }
    __typename
  }
}`;

const AURORA_GET_VARIATION_QUERY = `query GetImageVariationGeneric($where: generated_image_variation_generic_bool_exp) {
  generated_image_variation_generic(where: $where) {
    id
    createdAt
    status
    url
    transformType
    upscale_details {
      id
      variationId
      upscaleMultiplier
      width
      height
      mode
      modelId
      optional_metadata
      generated_image_variation_generic {
        id
        status
        url
        __typename
      }
      __typename
    }
    __typename
  }
}`;

type AuroraVariation = {
  id: string;
  status?: string;
  url?: string;
  upscale_details?: Array<{
    optional_metadata?: unknown;
    generated_image_variation_generic?: { status?: string; url?: string } | null;
  }> | {
    optional_metadata?: unknown;
    generated_image_variation_generic?: { status?: string; url?: string } | null;
  } | null;
};

function firstAuroraUpscaleDetail(v: AuroraVariation) {
  if (Array.isArray(v.upscale_details)) return v.upscale_details[0] ?? null;
  return v.upscale_details ?? null;
}

function stringifyAuroraDetail(value: unknown): string {
  if (!value) return "";
  if (typeof value === "string") return value;
  try {
    const json = JSON.stringify(value);
    return json === "{}" || json === "null" ? "" : json.slice(0, 400);
  } catch {
    return String(value).slice(0, 400);
  }
}

function readAuroraVariationStatus(v: AuroraVariation): string {
  return String(firstAuroraUpscaleDetail(v)?.generated_image_variation_generic?.status || v.status || "").toUpperCase();
}

function readAuroraVariationUrl(v: AuroraVariation): string | null {
  return firstAuroraUpscaleDetail(v)?.generated_image_variation_generic?.url || v.url || null;
}

type LeonardoRestImage = {
  url?: string | null;
  generated_image_variation_generics?: AuroraVariation[] | null;
};

type LeonardoRestGeneration = {
  id?: string;
  status?: string;
  generated_images?: LeonardoRestImage[] | null;
  error?: unknown;
  failureReason?: unknown;
};

function unwrapRestGeneration(res: unknown): LeonardoRestGeneration | null {
  if (!res || typeof res !== "object") return null;
  const r = res as Record<string, unknown>;
  const direct = r.generations_by_pk ?? r.generation ?? r.data;
  if (direct && typeof direct === "object") {
    const d = direct as Record<string, unknown>;
    const nested = d.generations_by_pk ?? d.generation;
    return ((nested && typeof nested === "object" ? nested : direct) as LeonardoRestGeneration) ?? null;
  }
  return r as LeonardoRestGeneration;
}

async function fetchAuroraRestGeneration(token: string, generationId: string): Promise<LeonardoRestGeneration | null> {
  const res = await leonardoFetch<unknown>({
    token,
    base: "api",
    path: `/api/rest/v1/generations/${encodeURIComponent(generationId)}`,
    method: "GET",
  });
  return unwrapRestGeneration(res);
}

function resolveAuroraModel(params: LeonardoAuroraParams): string {
  if (params.upscaler === "legacy") return "legacy-upscaler";
  if (params.upscaler === "ultra") return "universal-upscaler";
  return params.pro_type === "creative" ? "aurora-upscaler-creative" : "aurora-upscaler-precise";
}

const AURORA_MAX_OUTPUT_MEGAPIXELS = 105;
const AURORA_FACTORS: LeonardoUpscaleMultiplier[] = [2, 3, 4, 5, 6, 8];

function outputMegapixels(width: number, height: number, factor: LeonardoUpscaleMultiplier): number {
  return (width * height * factor * factor) / 1_000_000;
}

function getSafeAuroraFactor(width: number, height: number, requested: LeonardoUpscaleMultiplier): LeonardoUpscaleMultiplier {
  const requestedIndex = AURORA_FACTORS.indexOf(requested);
  const allowed = AURORA_FACTORS.slice(0, requestedIndex + 1).reverse();
  return allowed.find((factor) => outputMegapixels(width, height, factor) <= AURORA_MAX_OUTPUT_MEGAPIXELS) ?? 2;
}

function buildAuroraRequest(params: LeonardoAuroraParams, imageId: string, width: number, height: number) {
  const model = resolveAuroraModel(params);
  const upscale_mode: "clean" | "detailed" = params.fix_artifacts ? "clean" : "detailed";
  const request = {
    model,
    public: false,
    parameters: {
      guidances: {
        image_reference: [
          { image: { id: imageId, type: "UPLOADED" } },
        ],
      },
      upscale_factor: params.upscale_factor,
      width,
      height,
    },
  };
  if (params.upscaler === "pro" && params.pro_type === "creative") {
    return {
      ...request,
      parameters: {
        ...request.parameters,
        creativity: params.fix_artifacts ? "low" : "mid",
      },
    };
  }
  return {
    ...request,
    parameters: {
      ...request.parameters,
      upscale_mode,
    },
  };
}

function extractAuroraGenerationId(res: unknown): string | null {
  if (!res || typeof res !== "object") return null;
  const r = res as Record<string, unknown>;
  const candidates: unknown[] = [
    (r.generate as Record<string, unknown> | undefined)?.generationId,
    (r.generate as Record<string, unknown> | undefined)?.generation_id,
    (r.sdGenerationJob as Record<string, unknown> | undefined)?.generationId,
    (r.sdGenerationJob as Record<string, unknown> | undefined)?.generation_id,
    r.generationId,
    r.generation_id,
    r.id,
    (r.data as Record<string, unknown> | undefined)?.generationId,
    (r.data as Record<string, unknown> | undefined)?.generation_id,
    (r.data as Record<string, unknown> | undefined)?.id,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) return candidate;
  }
  return null;
}

async function submitAuroraGeneration(
  token: string,
  request: ReturnType<typeof buildAuroraRequest>,
): Promise<string> {
  try {
    const rest = await leonardoFetch<unknown>({
      token,
      base: "cloud",
      path: "/api/rest/v2/generations",
      method: "POST",
      body: request,
    });
    const restGenerationId = extractAuroraGenerationId(rest);
    if (restGenerationId) return restGenerationId;
    const restDetail = stringifyAuroraDetail(rest);
    throw new Error(restDetail || "response kosong");
  } catch (restError) {
    const restMessage = restError instanceof Error ? restError.message : String(restError);
    const gen = await leonardoFetch<{ data?: { generate?: { generationId?: string } }; errors?: unknown }>({
      token,
      base: "api",
      path: "/v1/graphql",
      method: "POST",
      body: {
        operationName: "Generate",
        variables: { request },
        query: AURORA_GENERATE_QUERY,
      },
    });
    const generationId = gen?.data?.generate?.generationId;
    if (!generationId) {
      const detail = stringifyAuroraDetail(gen?.errors || gen);
      throw new Error(`Leonardo: generationId tidak ditemukan — REST v2: ${restMessage}${detail ? `; GraphQL: ${detail}` : ""}`);
    }
    return generationId;
  }
}

async function fetchAuroraVariationDetail(token: string, variationId: string): Promise<AuroraVariation | null> {
  const info = await leonardoFetch<{
    data?: { generated_image_variation_generic?: AuroraVariation[] };
  }>({
    token,
    base: "api",
    path: "/v1/graphql",
    method: "POST",
    body: {
      operationName: "GetImageVariationGeneric",
      variables: { where: { id: { _in: [variationId] } } },
      query: AURORA_GET_VARIATION_QUERY,
    },
  });
  return info?.data?.generated_image_variation_generic?.[0] ?? null;
}

async function waitForAuroraResult(
  token: string,
  generationId: string,
  onLog: (m: string) => void,
): Promise<string> {
  let lastStatus = "";
  const maxAttempts = 150;
  for (let a = 0; a < maxAttempts; a++) {
    await new Promise((r) => setTimeout(r, a < 12 ? 4000 : 6000));
    let variations: AuroraVariation[] = [];
    try {
      const pend = await leonardoFetch<{
        data?: {
          generations_by_pk?: {
            generated_images?: Array<{
              generated_image_variation_generics?: AuroraVariation[];
            }>;
          };
        };
      }>({
        token,
        base: "api",
        path: "/v1/graphql",
        method: "POST",
        body: {
          operationName: "GetLatestPendingUpscaleVariationForGeneration",
          variables: { generationId },
          query: AURORA_POLL_QUERY,
        },
      });
      variations = (pend?.data?.generations_by_pk?.generated_images ?? [])
        .flatMap((im) => im.generated_image_variation_generics ?? [])
        .filter((v): v is AuroraVariation => !!v?.id);
    } catch {
      variations = [];
    }
    for (const variation of variations) {
      const status = readAuroraVariationStatus(variation);
      const url = readAuroraVariationUrl(variation);
      if (url && ["COMPLETE", "COMPLETED", "SUCCESS", "SUCCEEDED", "DONE"].includes(status)) return url;
      if (["FAILED", "ERROR", "CANCELED", "CANCELLED"].includes(status)) {
        const detailVariation = await fetchAuroraVariationDetail(token, variation.id).catch(() => variation);
        const detail = stringifyAuroraDetail(firstAuroraUpscaleDetail(detailVariation ?? variation)?.optional_metadata);
        throw new Error(`Leonardo Aurora: ${status}${detail ? ` — ${detail}` : ""}`);
      }
      if (status && status !== lastStatus) {
        lastStatus = status;
        onLog(`Poll Aurora: ${status.toLowerCase()}`);
      }
    }

    const restGeneration = await fetchAuroraRestGeneration(token, generationId).catch(() => null);
    const restStatus = String(restGeneration?.status || "").toUpperCase();
    const restImages = restGeneration?.generated_images ?? [];
    const restVariations = restImages.flatMap((image) => image.generated_image_variation_generics ?? []);
    const restUrl = restVariations.map(readAuroraVariationUrl).find((url): url is string => !!url) ?? null;
    if (restUrl && ["COMPLETE", "COMPLETED", "SUCCESS", "SUCCEEDED", "DONE"].includes(restStatus)) return restUrl;
    if (["FAILED", "ERROR", "CANCELED", "CANCELLED"].includes(restStatus)) {
      const detail = stringifyAuroraDetail(restGeneration?.failureReason ?? restGeneration?.error);
      throw new Error(`Leonardo Aurora: ${restStatus}${detail ? ` — ${detail}` : ""}`);
    }
    if (restStatus && restStatus !== lastStatus) {
      lastStatus = restStatus;
      onLog(`Poll Aurora: ${restStatus.toLowerCase()}`);
    }
  }
  throw new Error("Leonardo Aurora: timeout menunggu hasil");
}

async function runLeonardoAuroraOne(
  file: File,
  params: LeonardoAuroraParams,
  onLog: (m: string) => void,
): Promise<string> {
  const token = getFirstLeonardoKey();
  if (!token) throw new Error("Belum ada token Leonardo di Kelola Token");
  if (isLeonardoTokenExpired(token)) throw new Error("Token Leonardo expired — paste JWT baru");

  const source = file.size > 8 * 1024 * 1024 ? await compressImage(file, 2048, 0.92) : file;
  const { width, height } = await getImageDims(source);
  const mime = (source.type || "").toLowerCase();
  const ext: "png" | "jpg" | "webp" = mime.includes("webp")
    ? "webp"
    : mime.includes("png")
      ? "png"
      : "jpg";

  onLog("Upload ke Leonardo...");
  const imageId = await uploadLeonardoInitImage(token, source, ext);

  const safeFactor = getSafeAuroraFactor(width, height, params.upscale_factor);
  const primaryParams = { ...params, upscale_factor: safeFactor };
  if (safeFactor !== params.upscale_factor) {
    const requestedMp = outputMegapixels(width, height, params.upscale_factor).toFixed(1);
    const safeMp = outputMegapixels(width, height, safeFactor).toFixed(1);
    onLog(`Multiplier ${params.upscale_factor}x melebihi limit Aurora ±${AURORA_MAX_OUTPUT_MEGAPIXELS}MP (${requestedMp}MP), pakai ${safeFactor}x (${safeMp}MP)...`);
  }

  const attempts: LeonardoAuroraParams[] = [primaryParams];
  // Fallback aman: Leonardo sering mengembalikan FAILED tanpa detail ketika
  // kombinasi model/multiplier melewati limit internal; retry 2x agar job tetap sukses.
  if (primaryParams.upscale_factor !== 2) {
    attempts.push({ ...primaryParams, upscale_factor: 2 });
  }

  let lastErr: Error | null = null;
  for (let i = 0; i < attempts.length; i++) {
    const attempt = attempts[i];
    const request = buildAuroraRequest(attempt, imageId, width, height);
    const mode = attempt.fix_artifacts ? "clean" : "detailed";
    onLog(`Generate ${request.model} (${attempt.upscale_factor}x · ${mode}${attempt.upscaler === "pro" ? ` · ${attempt.pro_type}` : ""})...`);
    try {
      const generationId = await submitAuroraGeneration(token, request);
      onLog("Menunggu hasil...");
      return await waitForAuroraResult(token, generationId, onLog);
    } catch (e) {
      lastErr = e instanceof Error ? e : new Error(String(e));
      const canFallback = i < attempts.length - 1 && /failed|error|invalid|upscale|resolution|size|too large|timeout/i.test(lastErr.message);
      if (!canFallback) break;
      onLog(`Aurora retry pakai 2x karena: ${lastErr.message}`);
    }
  }
  throw lastErr ?? new Error("Leonardo Aurora: gagal");
}


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
  leonardo?: LeonardoAuroraParams;
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
            : opts.provider === "leonardo"
              ? await runLeonardoAuroraOne(
                  j.file,
                  opts.leonardo ?? { upscaler: "pro", pro_type: "precise", upscale_factor: 2, fix_artifacts: true },
                  log,
                )
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