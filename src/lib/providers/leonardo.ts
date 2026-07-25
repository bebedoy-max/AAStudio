// Leonardo.ai provider client — reverse-engineered from app.leonardo.ai.
//
// Auth: Cognito ID token (JWT `eyJ...eyJ...sig`) exposed by AWS Cognito for
// the leonardo user pool. Umur ~1 jam — expired token TIDAK auto-drop, hanya
// ditandai (user paste ulang JWT baru dari DevTools).
//
// Semua request langsung ke api.leonardo.ai diblok CORS (Origin harus
// app.leonardo.ai), jadi kita proxy via /api/public/leonardo.

const LS_LEONARDO_KEYS = "aatools.leonardo.keys";

export type LeonardoKey = {
  id: string;
  key: string;
  balance: number | null;
  status: "active" | "empty" | "pending" | "failed";
  note?: string;
  userEmail?: string;
  plan?: string;
  expiresAt?: number;
};

/* -------------------------------- storage --------------------------------- */

export function getAllLeonardoKeys(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(LS_LEONARDO_KEYS);
    if (!raw) return [];
    const list = JSON.parse(raw) as { key: string }[];
    return list.map((x) => x?.key).filter((k): k is string => !!k);
  } catch {
    return [];
  }
}

export function getFirstLeonardoKey(): string | null {
  return getAllLeonardoKeys()[0] ?? null;
}

/* ---------------------------- JWT / format ---------------------------- */

export function decodeLeonardoJwt(
  token: string,
): { exp?: number; iat?: number; sub?: string; email?: string; "cognito:username"?: string } | null {
  try {
    const parts = token.split(".");
    if (parts.length < 2) return null;
    const payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = payload + "=".repeat((4 - (payload.length % 4)) % 4);
    const jsonStr =
      typeof atob === "function" ? atob(padded) : Buffer.from(padded, "base64").toString("binary");
    return JSON.parse(jsonStr);
  } catch {
    return null;
  }
}

export function isLeonardoTokenExpired(token: string): boolean {
  const p = decodeLeonardoJwt(token);
  if (!p?.exp) return false;
  return Date.now() > p.exp * 1000;
}

export function isLeonardoFormat(token: string): boolean {
  const t = (token || "").trim();
  return /^eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(t);
}

/* --------------------------- auto-rotation --------------------------- */

export function isLeonardoRotatableError(msg: string): boolean {
  const m = (msg || "").toLowerCase();
  return /credit|insufficient|not enough|out of|balance|quota|exhaust|limit|too many|rate.?limit|402|401|403|unauthor|forbidden|expired|invalid.*token|token.*invalid|500|502|503|504|server error|network|fetch|timeout/.test(
    m,
  );
}

export type LeonardoRotateOpts = {
  onRotate?: (nextIndex: number, total: number, reason: string) => void;
  skipExpired?: boolean;
};

export async function runLeonardoWithRotation<T>(
  fn: (token: string) => Promise<T>,
  opts: LeonardoRotateOpts = {},
): Promise<T> {
  const keys = getAllLeonardoKeys();
  if (keys.length === 0) {
    throw new Error(
      "Belum ada token Leonardo. Buka Manage → Tokens → Leonardo dan tambahkan Bearer JWT.",
    );
  }
  let lastErr: Error | null = null;
  for (let i = 0; i < keys.length; i++) {
    const token = keys[i];
    if (opts.skipExpired !== false && isLeonardoTokenExpired(token)) {
      lastErr = new Error(`Token #${i + 1} expired`);
      if (i < keys.length - 1) opts.onRotate?.(i + 1, keys.length, "token expired");
      continue;
    }
    try {
      return await fn(token);
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      lastErr = err;
      if (!isLeonardoRotatableError(err.message) || i === keys.length - 1) throw err;
      opts.onRotate?.(i + 1, keys.length, err.message);
    }
  }
  throw lastErr ?? new Error("Leonardo: semua token gagal / expired");
}

/* ---------------------------- low-level proxy ---------------------------- */

type ProxyOpts = {
  token: string;
  base?: "api" | "cloud";
  path: string;
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: unknown;
};

export async function leonardoFetch<T = unknown>(opts: ProxyOpts): Promise<T> {
  const { token, base = "api", path, method = "GET", body } = opts;
  const r = await fetch(`/api/public/leonardo`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Leonardo-Token": token },
    body: JSON.stringify({ base, path, method, body }),
  });
  const wrap = (await r.json().catch(() => null)) as {
    ok: boolean;
    status: number;
    data: unknown;
    raw?: string;
  } | null;
  if (!wrap?.ok) {
    const d = (wrap?.data ?? null) as Record<string, unknown> | null;
    const pick = (k: string) => {
      const v = d && typeof d === "object" ? d[k] : undefined;
      if (typeof v === "string" && v.trim()) return v;
      if (v && typeof v === "object") return JSON.stringify(v).slice(0, 300);
      return "";
    };
    const err =
      pick("error") ||
      pick("message") ||
      pick("detail") ||
      pick("errors") ||
      (d ? JSON.stringify(d).slice(0, 300) : "") ||
      wrap?.raw?.slice(0, 300) ||
      `HTTP ${wrap?.status ?? r.status}`;
    throw new Error(`Leonardo ${method} ${path}: ${err}`);
  }
  return wrap.data as T;
}

/* ---------------------- account / balance (GraphQL) --------------------- */

const USER_DETAILS_QUERY = `query GetUserDetails {
  users {
    id
    username
    subscriptionTokens
    subscriptionGptTokens
    subscriptionModelTokens
    email: email
    user {
      email
    }
  }
}`;

export type LeonardoUser = {
  id?: string;
  username?: string;
  email?: string;
  subscriptionTokens?: number;
  subscriptionGptTokens?: number;
  subscriptionModelTokens?: number;
};

export async function fetchLeonardoUser(token: string): Promise<LeonardoUser | null> {
  const data = await leonardoFetch<{ data?: { users?: LeonardoUser[] } }>({
    token,
    base: "api",
    path: "/v1/graphql",
    method: "POST",
    body: { query: USER_DETAILS_QUERY, operationName: "GetUserDetails" },
  });
  const u = data?.data?.users?.[0];
  return u ?? null;
}

export async function checkLeonardoToken(
  token: string,
): Promise<{ ok: boolean; message?: string; expiresAt?: number; email?: string }> {
  const t = (token || "").trim();
  if (!isLeonardoFormat(t)) return { ok: false, message: "Format token salah (harus JWT eyJ...eyJ...)" };
  const p = decodeLeonardoJwt(t);
  if (!p?.exp) return { ok: false, message: "JWT tidak berisi exp" };
  const exp = p.exp * 1000;
  if (Date.now() > exp) {
    return { ok: false, message: `Token expired ${new Date(exp).toLocaleString()}` };
  }
  return { ok: true, expiresAt: exp, email: p.email || p["cognito:username"] };
}

export async function fetchLeonardoBalance(
  token: string,
): Promise<{ ok: boolean; balance: number | null; message?: string; email?: string }> {
  try {
    const u = await fetchLeonardoUser(token);
    const bal =
      typeof u?.subscriptionTokens === "number"
        ? u.subscriptionTokens
        : null;
    return { ok: true, balance: bal, email: u?.email || u?.username };
  } catch (e) {
    return { ok: false, balance: null, message: (e as Error).message };
  }
}

/* ---------------------- Platform models catalog ------------------------ */

export type LeonardoPlatformModel = {
  id: string; // slug used as v2 discriminator (e.g. "gpt-image-2")
  name: string;
  description?: string;
  category?: string;
};

// Full image-model slug list (mapped from OpenAPI v2 discriminator + productionApiAvailableModels).
// v2 endpoint uses slugs, NOT UUIDs, as the "model" field.
const ALL_IMAGE_MODELS: LeonardoPlatformModel[] = [
  { id: "gpt-image-2", name: "GPT Image 2", category: "Featured" },
  { id: "nano-banana-2", name: "Nano Banana 2", category: "Featured" },
  { id: "seedream-5.0-pro", name: "Seedream 5.0 Pro", category: "Featured" },
  { id: "flux-pro-2.0", name: "Flux.2 Pro", category: "Featured" },
  { id: "nano-banana-2-lite", name: "Nano Banana 2 Lite", category: "Google" },
  { id: "gemini-2.5-flash-image", name: "Nano Banana", category: "Google" },
  { id: "gpt-image-1.5", name: "GPT Image 1.5", category: "OpenAI" },
  { id: "seedream-4.5", name: "Seedream 4.5", category: "ByteDance" },
  { id: "seedream-4.0", name: "Seedream 4.0", category: "ByteDance" },
  { id: "ideogram-v4.0", name: "Ideogram 4.0", category: "Ideogram" },
  { id: "ideogram-v3.0", name: "Ideogram 3.0", category: "Ideogram" },
  { id: "flux-kontext-pro", name: "FLUX.1 Kontext", category: "Flux" },
  { id: "flux-kontext-max", name: "FLUX.1 Kontext Max", category: "Flux" },
  { id: "flux-dev", name: "FLUX Dev", category: "Flux" },
  { id: "flux-schnell", name: "FLUX Schnell", category: "Flux" },
  { id: "phoenix-v1.0", name: "Phoenix 1.0", category: "Leonardo" },
  { id: "phoenix-v0.9", name: "Phoenix 0.9", category: "Leonardo" },
  { id: "lucid-origin", name: "Lucid Origin", category: "Leonardo" },
  { id: "lucid-realism", name: "Lucid Realism", category: "Leonardo" },
  { id: "kino-xl", name: "Cinematic Kino", category: "Leonardo" },
  { id: "anime-xl", name: "Anime", category: "Leonardo" },
  { id: "lifelike-vision", name: "Lifelike Vision", category: "Leonardo" },
  { id: "lightning-xl", name: "Leonardo Lightning", category: "Leonardo" },
  { id: "portrait-perfect", name: "Portrait Perfect", category: "Leonardo" },
  { id: "stock-photography", name: "Stock Photography", category: "Leonardo" },
  { id: "illustrative-albedo", name: "Illustrative Albedo", category: "Leonardo" },
  { id: "concept-art", name: "Concept Art", category: "Leonardo" },
  { id: "graphic-design", name: "Graphic Design", category: "Leonardo" },
  { id: "recraft-v4", name: "Recraft V4", category: "Recraft" },
  { id: "recraft-v4-pro", name: "Recraft V4 Pro", category: "Recraft" },
  { id: "krea-2-turbo", name: "Krea 2 Turbo", category: "Krea" },
];

// Featured 4 requested by user — shown first in dropdown.
export const LEONARDO_MODELS = [
  { id: "gpt-image-2", label: "GPT Image 2", group: "Featured" },
  { id: "nano-banana-2", label: "Nano Banana 2", group: "Featured" },
  { id: "seedream-5.0-pro", label: "Seedream 5.0 Pro", group: "Featured" },
  { id: "flux-pro-2.0", label: "Flux.2 Pro", group: "Featured" },
] as const;

/**
 * Returns the full image-model catalog. If the caller wants server-verified
 * availability, this queries productionApiAvailableModels via GraphQL and
 * intersects by name; otherwise returns the static list.
 */
export async function fetchLeonardoPlatformModels(
  token: string,
): Promise<LeonardoPlatformModel[]> {
  try {
    const data = await leonardoFetch<{ data?: { productionApiAvailableModels?: Array<{ id: string; name: string }> } }>({
      token,
      base: "api",
      path: "/v1/graphql",
      method: "POST",
      body: { query: "query { productionApiAvailableModels { id name } }" },
    });
    const availableNames = new Set(
      (data?.data?.productionApiAvailableModels ?? []).map((m) => m.name.toLowerCase()),
    );
    if (availableNames.size === 0) return ALL_IMAGE_MODELS;
    // Only keep image slugs that the account has access to (case-insensitive name match).
    const filtered = ALL_IMAGE_MODELS.filter((m) => availableNames.has(m.name.toLowerCase()));
    return filtered.length > 0 ? filtered : ALL_IMAGE_MODELS;
  } catch {
    return ALL_IMAGE_MODELS;
  }
}

/* ---------------------- Init-image upload (references) ------------------ */

/**
 * Upload a Blob to Leonardo via our server-side proxy and get back an
 * imageId usable in `image_prompts`. We proxy because Leonardo's S3
 * accelerate bucket only allows Origin app.leonardo.ai — browser CORS
 * blocks direct upload from lovableproject.com.
 */
export async function uploadLeonardoInitImage(
  token: string,
  blob: Blob,
  extension: "png" | "jpg" | "jpeg" | "webp" = "png",
): Promise<string> {
  const buf = await blob.arrayBuffer();
  // base64 encode (chunked for large buffers)
  const bytes = new Uint8Array(buf);
  let bin = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  const b64 = btoa(bin);
  const res = await fetch("/api/public/leonardo-upload", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Leonardo-Token": token },
    body: JSON.stringify({ b64, ext: extension, mime: blob.type || undefined }),
  });
  const data = (await res.json().catch(() => null)) as { ok?: boolean; id?: string; error?: string } | null;
  if (!res.ok || !data?.ok || !data.id) {
    throw new Error(`Leonardo upload gagal: ${data?.error || res.status}`);
  }
  return data.id;
}

/** Fetch a remote URL → Blob (direct then proxy fallback). */
export async function fetchAsBlob(url: string): Promise<{ blob: Blob; ext: "png" | "jpg" | "jpeg" | "webp" }> {
  let res: Response;
  try {
    res = await fetch(url);
    if (!res.ok) throw new Error(`${res.status}`);
  } catch {
    res = await fetch(`/api/public/proxy-image?url=${encodeURIComponent(url)}`);
    if (!res.ok) throw new Error(`proxy-image ${res.status}`);
  }
  const blob = await res.blob();
  const mime = (blob.type || "").toLowerCase();
  const ext: "png" | "jpg" | "jpeg" | "webp" = mime.includes("webp")
    ? "webp"
    : mime.includes("jpeg") || mime.includes("jpg")
      ? "jpg"
      : "png";
  return { blob, ext };
}

/* ---------------------- Text-to-Image (v2 generations) ------------------ */

export type CreateGenerationInput = {
  prompt: string;
  modelId?: string;
  num_images?: number;
  width?: number;
  height?: number;
  negative_prompt?: string;
  public?: boolean;
  quality?: "low" | "medium" | "high";
  promptEnhance?: "OFF" | "AUTO" | "ON";
  /** Init-image IDs to reference (image prompts). */
  imagePromptIds?: string[];
  /** URLs to fetch + upload as references before generation. */
  referenceUrls?: string[];
  /** Blobs to upload as references before generation. */
  referenceBlobs?: Array<{ blob: Blob; ext?: "png" | "jpg" | "jpeg" | "webp" }>;
};

type LeonardoGenerationBase = "api" | "cloud";

type LeonardoGenerationAttempt = {
  base: LeonardoGenerationBase;
  parameters: Record<string, unknown>;
  label: string;
};

function extractGenerationId(res: unknown): string | null {
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
    r.jobId,
    (r.data as Record<string, unknown> | undefined)?.generationId,
    (r.data as Record<string, unknown> | undefined)?.generation_id,
    (r.data as Record<string, unknown> | undefined)?.id,
  ];
  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) return c;
  }
  return null;
}

function previewResponse(res: unknown, limit = 400): string {
  try {
    return JSON.stringify(res).slice(0, limit);
  } catch {
    return String(res).slice(0, limit);
  }
}

function isValidationResponse(res: unknown): boolean {
  const text = previewResponse(res, 1000).toLowerCase();
  return text.includes("validation") || text.includes("badrequestexception") || text.includes("bad request");
}

export async function createLeonardoGeneration(
  token: string,
  input: CreateGenerationInput,
): Promise<{ generationId: string; apiCreditCost?: number | null }> {
  const slug = input.modelId || LEONARDO_MODELS[0].id;
  const isGptImage2 = /^gpt-image-2$/i.test(slug);

  const baseParameters: Record<string, unknown> = {
    prompt: input.prompt,
    quantity: Math.max(1, Math.min(isGptImage2 ? 8 : 4, input.num_images ?? 1)),
    width: input.width ?? 1024,
    height: input.height ?? 1024,
  };

  const parameters: Record<string, unknown> = { ...baseParameters };

  parameters.prompt_enhance = input.promptEnhance ?? "OFF";

  if (isGptImage2) parameters.quality = (input.quality ?? "medium").toUpperCase();

  const nativeSupportsNeg = /^(phoenix|lucid|kino-xl|anime-xl|lightning-xl|flux-dev|flux-schnell|portrait|stock|illustrative|concept|lifelike|graphic|krea|recraft)/i.test(
    slug,
  );
  if (input.negative_prompt && nativeSupportsNeg) {
    parameters.negative_prompt = input.negative_prompt;
  }

  const promptIds = (input.imagePromptIds ?? []).filter((s) => typeof s === "string" && s.trim());
  if (promptIds.length > 0) {
    parameters.image_prompts = promptIds.map((id) => ({ id }));
  }

  const attempts: LeonardoGenerationAttempt[] = isGptImage2
    ? [
        // Official GPT Image 2 docs use cloud.leonardo.ai and uppercase quality
        // (LOW/MEDIUM/HIGH). Lowercase values validate on the UI but fail the v2 API.
        { base: "cloud", parameters, label: "cloud+quality+enhance" },
        { base: "api", parameters, label: "api+quality+enhance" },
        { base: "cloud", parameters: { ...baseParameters, quality: parameters.quality }, label: "cloud+quality" },
        { base: "cloud", parameters: { ...baseParameters, prompt_enhance: "OFF" }, label: "cloud+enhance" },
      ]
    : [{ base: "api", parameters, label: "api" }];

  const previews: string[] = [];
  for (const attempt of attempts) {
    let res: unknown;
    try {
      res = await leonardoFetch<unknown>({
        token,
        base: attempt.base,
        path: "/api/rest/v2/generations",
        method: "POST",
        body: {
          public: input.public ?? false,
          model: slug,
          parameters: attempt.parameters,
        },
      });
    } catch (e) {
      previews.push(`${attempt.label}: ${(e as Error).message}`);
      if (isGptImage2) continue;
      throw e;
    }

    const id = extractGenerationId(res);
    if (id) {
      const cost =
        (res as { generate?: { apiCreditCost?: number | null } })?.generate?.apiCreditCost ?? null;
      return { generationId: id, apiCreditCost: cost };
    }

    previews.push(`${attempt.label}: ${previewResponse(res)}`);
    if (!isGptImage2 || !isValidationResponse(res)) break;
  }

  throw new Error(`Leonardo v2: tidak ada generationId. Response: ${previews.join(" | ")}`);
}

export type LeonardoImage = {
  id?: string;
  url?: string;
  nsfw?: boolean;
};

export type GenerationStatus = {
  generations_by_pk?: {
    id: string;
    status: "PENDING" | "COMPLETE" | "FAILED";
    prompt?: string;
    modelId?: string;
    generated_images?: LeonardoImage[];
  };
};

export async function pollLeonardoGeneration(
  token: string,
  generationId: string,
): Promise<GenerationStatus["generations_by_pk"] | null> {
  const res = await leonardoFetch<GenerationStatus>({
    token,
    base: "api",
    path: `/api/rest/v1/generations/${encodeURIComponent(generationId)}`,
    method: "GET",
  });
  return res.generations_by_pk ?? null;
}

/** Convenience: create + poll until COMPLETE/FAILED (or timeout). */
export async function generateLeonardoImages(
  input: CreateGenerationInput,
  opts: {
    onProgress?: (msg: string) => void;
    onRotate?: (nextIndex: number, total: number, reason: string) => void;
    timeoutMs?: number;
    pollIntervalMs?: number;
  } = {},
): Promise<{ images: string[]; generationId: string }> {
  const timeoutMs = opts.timeoutMs ?? 5 * 60 * 1000;
  const pollMs = opts.pollIntervalMs ?? 4000;

  return runLeonardoWithRotation(
    async (token) => {
      // Resolve references → init-image IDs (uploads happen with active token).
      const promptIds: string[] = [...(input.imagePromptIds ?? [])];
      const urls = input.referenceUrls ?? [];
      const blobs = input.referenceBlobs ?? [];
      const totalRefs = urls.length + blobs.length;
      if (totalRefs > 0) {
        opts.onProgress?.(`Upload ${totalRefs} referensi ke Leonardo…`);
        for (let i = 0; i < urls.length; i++) {
          const { blob, ext } = await fetchAsBlob(urls[i]);
          const id = await uploadLeonardoInitImage(token, blob, ext);
          promptIds.push(id);
          opts.onProgress?.(`Referensi #${i + 1} terupload (${id.slice(0, 8)}…)`);
        }
        for (let i = 0; i < blobs.length; i++) {
          const b = blobs[i];
          const id = await uploadLeonardoInitImage(token, b.blob, b.ext ?? "png");
          promptIds.push(id);
          opts.onProgress?.(`Referensi file #${i + 1} terupload (${id.slice(0, 8)}…)`);
        }
      }

      opts.onProgress?.(`Submit ke Leonardo v2 (model: ${input.modelId || "auto"})…`);
      const { generationId } = await createLeonardoGeneration(token, { ...input, imagePromptIds: promptIds });
      opts.onProgress?.(`Generation ${generationId.slice(0, 8)}… menunggu render`);

      const started = Date.now();
      while (Date.now() - started < timeoutMs) {
        await new Promise((r) => setTimeout(r, pollMs));
        const g = await pollLeonardoGeneration(token, generationId);
        if (!g) continue;
        if (g.status === "COMPLETE") {
          const images = (g.generated_images ?? [])
            .map((x) => x.url)
            .filter((u): u is string => !!u);
          opts.onProgress?.(`Selesai — ${images.length} gambar`);
          return { images, generationId };
        }
        if (g.status === "FAILED") {
          throw new Error("Leonardo generation FAILED");
        }
        opts.onProgress?.(`Rendering… (${Math.round((Date.now() - started) / 1000)}s)`);
      }
      throw new Error("Leonardo generation timeout");
    },
    { onRotate: opts.onRotate },
  );
}

