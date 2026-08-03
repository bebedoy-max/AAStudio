// Adobe Firefly provider client (firefly.adobe.com web session token).
//
// Endpoints (via server proxy /api/public/firefly karena CORS):
//   GET  https://firefly.adobe.io/v1/credits/balance                 → sisa credit
//   POST https://firefly-3p.ff.adobe.io/v2/3p-videos/generate-async  → video (Veo / Sora dsb)
//   POST https://firefly.adobe.io/v3/images/generate-async           → image
//   GET  <statusUrl dari response async>                             → polling hasil
//
// Auth: Bearer IMS access token (eyJhbGci…) + x-api-key (default SunbreakWebUI1)
// dan optional x-account-id. Token disimpan di localStorage `aatools.firefly.keys`
// (format sama seperti provider simple lain: { id, key, balance, status, note }).

import { pushTokenAsync } from "@/lib/tokens/sync";
import { isRelayAvailable, relayFireflyRequest, bytesToBase64 } from "./firefly-relay";

export const LS_FIREFLY_KEYS = "aatools.firefly.keys";
export const FIREFLY_API = "https://firefly.adobe.io";
export const FIREFLY_3P_API = "https://firefly-3p.ff.adobe.io";
// The Firefly web client uploads reference images to the 3p host (verified in a
// real capture); firefly.adobe.io also works but 3p keeps blob ids in the same
// service that consumes them.
export const FIREFLY_STORAGE_API = "https://firefly-3p.ff.adobe.io";
export const FIREFLY_DEFAULT_API_KEY = "SunbreakWebUI1";
export const FIREFLY_PLAYGROUND_API_KEY = "clio-playground-web";

export type FireflyKey = {
  id: string;
  key: string;
  balance: number | null;
  status: "active" | "empty" | "pending" | "failed";
  note?: string;
  accountId?: string;
};

/* --------------------------------- storage --------------------------------- */

function readList(): FireflyKey[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(LS_FIREFLY_KEYS);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as FireflyKey[]) : [];
  } catch {
    return [];
  }
}

export function getAllFireflyKeys(): string[] {
  return readList()
    .map((x) => x?.key)
    .filter((k): k is string => !!k);
}

export function getFirstFireflyKey(): string | null {
  return getAllFireflyKeys()[0] || null;
}

export function getFireflyAccountId(token: string): string | undefined {
  return readList().find((x) => x.key === token)?.accountId || deriveFireflyAccountId(token);
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const raw = token.replace(/^Bearer\s+/i, "");
  const part = raw.split(".")[1];
  if (!part || typeof window === "undefined") return null;
  try {
    const normalized = part.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    return JSON.parse(atob(padded)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function deriveFireflyAccountId(token: string): string | undefined {
  const payload = decodeJwtPayload(token);
  const candidate = payload?.aa_id || payload?.user_id;
  return typeof candidate === "string" && candidate.includes("@AdobeID") ? candidate : undefined;
}

export function markFireflyKeyFailed(token: string, reason: string) {
  if (typeof window === "undefined") return;
  const list = readList();
  const next = list.map((x) =>
    x.key === token ? { ...x, status: "failed" as const, note: reason } : x,
  );
  const value = JSON.stringify(next);
  localStorage.setItem(LS_FIREFLY_KEYS, value);
  pushTokenAsync(LS_FIREFLY_KEYS, value);
  window.dispatchEvent(
    new CustomEvent("aatools:tokens-synced", {
      detail: { provider: "firefly", action: "failed", reason },
    }),
  );
  window.dispatchEvent(new Event("storage"));
}

export function isFireflyRotatableError(msg: string): boolean {
  // Capacity errors are not token problems — never rotate/mark the token failed.
  if (/system under load|sedang penuh|408/i.test(msg)) return false;
  return /401|403|429|expired|unauthorized|insufficient|quota|credit/i.test(msg);
}

/* ---------------------------------- proxy ---------------------------------- */

type ProxyResult<T> = { ok: boolean; status: number; data: T | null; raw?: string; error?: string };

export async function fireflyFetch<T = unknown>(opts: {
  token: string;
  url: string;
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: unknown;
  bodyBase64?: string;
  contentType?: string;
  accountId?: string;
  apiKey?: string;
  headers?: Record<string, string>;
}): Promise<ProxyResult<T>> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Firefly-Token": opts.token,
    "X-Firefly-Api-Key": opts.apiKey || FIREFLY_DEFAULT_API_KEY,
    "X-Firefly-Nonce": crypto.randomUUID().replace(/-/g, ""),
  };
  const acc = opts.accountId ?? getFireflyAccountId(opts.token);
  if (acc) headers["X-Firefly-Account"] = acc;

  // Prefer the extension relay: Adobe's 3P gate rejects datacenter IPs, so the
  // server proxy can only be a fallback (it still works for CORS-only calls).
  if (await isRelayAvailable()) {
    try {
      return await relayFireflyRequest<T>({
        url: opts.url,
        method: opts.method,
        body: opts.body,
        bodyBase64: opts.bodyBase64,
        contentType: opts.contentType,
        token: opts.token,
        apiKey: opts.apiKey || FIREFLY_DEFAULT_API_KEY,
        accountId: acc,
        nonce: headers["X-Firefly-Nonce"],
        headers: opts.headers,
      });
    } catch {
      /* relay unavailable/timeout → fall back to the server proxy */
    }
  }

  const r = await fetch("/api/public/firefly", {
    method: "POST",
    headers,
    body: JSON.stringify({
      url: opts.url,
      method: opts.method,
      body: opts.body,
      bodyBase64: opts.bodyBase64,
      contentType: opts.contentType,
      headers: opts.headers,
    }),
  });
  return parseProxyResponse<T>(r);
}

/** Proxy response may be non-JSON (gateway 413 / 502 HTML). Never let JSON.parse throw. */
async function parseProxyResponse<T>(r: Response): Promise<ProxyResult<T>> {
  const text = await r.text();
  try {
    return JSON.parse(text) as ProxyResult<T>;
  } catch {
    const snippet = text
      .replace(/<[^>]+>/g, " ")
      .trim()
      .slice(0, 200);
    const tooLarge =
      r.status === 413 || /request entity too large|payload too large/i.test(snippet);
    return {
      ok: false,
      status: r.status,
      data: null,
      error: tooLarge
        ? "Gambar referensi terlalu besar untuk dikirim (413). Coba gambar lebih kecil."
        : `Proxy Firefly balas non-JSON (HTTP ${r.status}): ${snippet || "kosong"}`,
    };
  }
}

/** Upload binary straight to the proxy (no base64) to stay under gateway body limits. */
async function fireflyUploadBinary<T = unknown>(opts: {
  token: string;
  url: string;
  bytes: ArrayBuffer;
  contentType: string;
  accountId?: string;
  apiKey?: string;
  sessionId?: string;
}): Promise<ProxyResult<T>> {
  const headers: Record<string, string> = {
    "Content-Type": "application/octet-stream",
    "X-Firefly-Url": opts.url,
    "X-Firefly-Content-Type": opts.contentType,
    "X-Firefly-Token": opts.token,
    "X-Firefly-Api-Key": opts.apiKey || FIREFLY_DEFAULT_API_KEY,
    "X-Firefly-Nonce": crypto.randomUUID().replace(/-/g, ""),
  };
  if (opts.sessionId) headers["X-Firefly-Session"] = opts.sessionId;
  const acc = opts.accountId ?? getFireflyAccountId(opts.token);
  if (acc) headers["X-Firefly-Account"] = acc;

  if (await isRelayAvailable()) {
    try {
      return await relayFireflyRequest<T>({
        url: opts.url,
        method: "POST",
        bodyBase64: bytesToBase64(opts.bytes),
        contentType: opts.contentType,
        token: opts.token,
        apiKey: opts.apiKey || FIREFLY_DEFAULT_API_KEY,
        accountId: acc,
        sessionId: opts.sessionId,
        nonce: headers["X-Firefly-Nonce"],
      });
    } catch {
      /* fall back to the server proxy */
    }
  }

  const r = await fetch("/api/public/firefly", { method: "POST", headers, body: opts.bytes });
  return parseProxyResponse<T>(r);
}

/** Re-encode reference image to JPEG ≤1280px and ≤600 KB so the upload never
 *  hits the gateway body limit (which returns plain-text "Request Entity Too Large"). */
async function shrinkForFirefly(file: File): Promise<File> {
  if (typeof document === "undefined") return file;
  const { compressImage } = await import("./weavy");
  let out = file;
  const budget = 600 * 1024;
  if (out.size <= budget && /jpe?g|png|webp/i.test(out.type)) {
    if (out.size <= budget) return out;
  }
  const steps: Array<[number, number]> = [
    [1280, 0.85],
    [1152, 0.75],
    [1024, 0.7],
    [896, 0.6],
  ];
  for (const [w, q] of steps) {
    try {
      out = await compressImage(file, w, q);
    } catch {
      return out;
    }
    if (out.size <= budget) return out;
  }
  return out;
}

function fireflyVideoSize(ratio: string): { width: number; height: number } {
  if (ratio === "9:16") return { width: 720, height: 1280 };
  if (ratio === "1:1") return { width: 1024, height: 1024 };
  if (ratio === "4:5") return { width: 864, height: 1080 };
  if (ratio === "3:4") return { width: 960, height: 1280 };
  return { width: 1280, height: 720 };
}

function randomHex(bytes = 32): string {
  const values = new Uint8Array(bytes);
  crypto.getRandomValues(values);
  return Array.from(values, (value) => value.toString(16).padStart(2, "0")).join("");
}

function randomSeed(): number {
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  return (values[0] || Date.now()) % 1_000_000;
}

function makeFireflySessionHeader(): string {
  return btoa(
    JSON.stringify({
      sid: crypto.randomUUID(),
      bfp: crypto.randomUUID(),
      ftr: `${randomHex(16)}_${Date.now()}__UDF43-m4_31ck_FOG8LhAY6h8=-339-v2_tt`,
    }),
  );
}

type FireflyBlobRef = { id?: string; presignedUrl?: string; creativeCloudFileId?: string };
type FireflyUploadImage = FireflyBlobRef & {
  id?: string;
  blobRef?: unknown;
  reference?: unknown;
};
type FireflyUploadResponse = {
  images?: FireflyUploadImage[];
  image?: FireflyUploadImage;
  id?: string;
};

function asFireflyBlobRef(value: unknown, depth = 0): FireflyBlobRef | null {
  if (depth > 5) return null;
  if (typeof value === "string" && value.trim()) return { id: value.trim() };
  if (Array.isArray(value)) {
    for (const item of value) {
      const nested = asFireflyBlobRef(item, depth + 1);
      if (nested) return nested;
    }
    return null;
  }
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    // Adobe's validator only accepts id | presignedUrl | creativeCloudFileId.
    for (const k of ["id", "presignedUrl", "creativeCloudFileId"]) {
      const v = obj[k];
      if (typeof v === "string" && v.trim()) return { [k]: v.trim() };
      const nested = asFireflyBlobRef(v, depth + 1);
      if (nested) return nested;
    }
    for (const k of ["localBlobRef", "remoteBlobRef", "uploadId", "assetId", "blobId"]) {
      const v = obj[k];
      if (typeof v === "string" && v.trim()) return { id: v.trim() };
      const nested = asFireflyBlobRef(v, depth + 1);
      if (nested) return nested;
    }
    for (const k of ["blobRef", "reference", "ref", "source", "image", "asset"]) {
      const nested = asFireflyBlobRef(obj[k], depth + 1);
      if (nested) return nested;
    }
    for (const v of Object.values(obj)) {
      const nested = asFireflyBlobRef(v, depth + 1);
      if (nested) return nested;
    }
    return null;
  }
  return null;
}

function pickUploadedImageRef(res: FireflyUploadResponse | null): FireflyBlobRef | null {
  const image = res?.images?.[0] || res?.image || null;
  const nested = image?.blobRef || image?.reference;
  return (
    asFireflyBlobRef(nested) ||
    asFireflyBlobRef(image?.id) ||
    asFireflyBlobRef(res?.id) ||
    asFireflyBlobRef(image) ||
    asFireflyBlobRef(res)
  );
}

async function uploadFireflyImage(opts: {
  token: string;
  file: File;
  accountId?: string;
  sessionId: string;
}): Promise<FireflyBlobRef> {
  const small = await shrinkForFirefly(opts.file);
  const bytes = await small.arrayBuffer();
  const res = await fireflyUploadBinary<FireflyUploadResponse>({
    token: opts.token,
    url: `${FIREFLY_STORAGE_API}/v2/storage/image`,
    bytes,
    contentType: small.type || "image/jpeg",
    accountId: opts.accountId,
    apiKey: FIREFLY_PLAYGROUND_API_KEY,
    sessionId: opts.sessionId,
  });
  const ref = pickUploadedImageRef(res.data);
  if (!res.ok || !ref) {
    throw new Error(
      `Firefly upload gagal (${res.status}): ${res.raw || JSON.stringify(res.data)?.slice(0, 200) || res.error || ""}`,
    );
  }
  return ref;
}

function fireflyVideoModelKey(model: FireflyVideoModel): string {
  if (model.modelVersion === "3.1-fast-generate") return "google:firefly:colligo:veo31-fast";
  if (model.modelVersion === "3.1-generate") return "google:firefly:colligo:veo31";
  if (model.modelVersion === "3.0-generate-002") return "adobe:firefly:colligo:video1";
  return `ugs:video:${model.modelId}@${model.modelVersion}`;
}

function buildFireflyVideoPayload(opts: {
  model: FireflyVideoModel;
  prompt: string;
  negativePrompt?: string;
  ratio: string;
  duration: number;
  referenceRef: FireflyBlobRef | null;
  seed?: number;
}): Record<string, unknown> {
  const seed = opts.seed ?? randomSeed();
  const size = fireflyVideoSize(opts.ratio || "16:9");
  const negativePrompt =
    opts.negativePrompt || "cartoon, vector art, & bad aesthetics & poor aesthetic";

  // Send the final Firefly web payload shape. `referenceBlobs` / `image.conditions`
  // are editor-side inputs that the web client transforms before submit; leaving
  // them in the network body can make Adobe validate an old `{ localBlobRef }`
  // shape and return 422 “Either id, presignedUrl, or creativeCloudFileId…”.
  return {
    model: fireflyVideoModelKey(opts.model),
    size,
    referenceFrames: opts.referenceRef
      ? [{ referenceFrame: opts.referenceRef }, null]
      : [null, null],
    shots: [
      {
        prompt: opts.prompt,
        negativePrompt,
        duration: opts.duration,
      },
    ],
    seed: String(seed),
    generateAudio: false,
    generateLoop: false,
    transparentBackground: false,
    fps: 24,
    camera: { motion: null, angle: "none", shotSize: "none", promptStyle: null },
    locale: "en-US",
    jobMode: "standard",
    multiShotMode: "off",
    debugGenerationEndpoint: "",
    characterReference: null,
    referenceVideo: null,
    cameraMotionReferenceVideo: null,
    editReferenceVideo: null,
    editAction: "modify",
    referenceImages: [],
    referenceVideos: [],
    referenceAudios: [],
    upscale: {
      enhancement: "precise",
      optimization: "speed",
      details: "subtle",
      outputResolution: { width: 1920, height: 1080 },
    },
  };
}

/* --------------------------------- balance --------------------------------- */

export type FireflyBalance = {
  ok: boolean;
  balance: number | null;
  message?: string;
  plan?: string;
};

type Quota = { total?: number; used?: number; available?: number };

type BalanceResponse = {
  total?: { quota?: Quota; planCap?: string; availableUntil?: string };
  credits?: { remaining?: number; total?: number; used?: number } & Record<
    string,
    { quota?: Quota } | unknown
  >;
  quota?: Quota;
  available?: number | string;
  availableCredits?: number | string;
  remainingCredits?: number | string;
  remaining?: number;
  balance?: number;
  generativeCredits?: { remaining?: number };
  entitlement?: { name?: string };
  plan?: string;
};

function pickNumber(...vals: unknown[]): number | null {
  for (const v of vals) {
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string" && v.trim() && Number.isFinite(Number(v))) return Number(v);
  }
  return null;
}

function findNumberByKey(value: unknown, keys: string[]): number | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  for (const key of keys) {
    const direct = pickNumber(record[key]);
    if (direct !== null) return direct;
  }
  for (const child of Object.values(record)) {
    const nested = findNumberByKey(child, keys);
    if (nested !== null) return nested;
  }
  return null;
}

export async function fetchFireflyBalance(token: string): Promise<FireflyBalance> {
  try {
    const res = await fireflyFetch<BalanceResponse>({
      token,
      url: `${FIREFLY_API}/v1/credits/balance`,
      method: "GET",
    });
    if (!res.ok) {
      return {
        ok: false,
        balance: null,
        message:
          res.status === 401 || res.status === 403
            ? "Token Firefly invalid / expired"
            : `Firefly HTTP ${res.status}`,
      };
    }
    const d = res.data || {};
    const balance =
      pickNumber(
        d.total?.quota?.available,
        d.quota?.available,
        d.availableCredits,
        d.remainingCredits,
        d.available,
        d.credits?.remaining,
        d.generativeCredits?.remaining,
        d.remaining,
        d.balance,
      ) ??
      findNumberByKey(d, [
        "available",
        "availableCredits",
        "remainingCredits",
        "remaining",
        "balance",
      ]);
    return { ok: true, balance, plan: d.plan || d.entitlement?.name };
  } catch (e) {
    return { ok: false, balance: null, message: (e as Error).message };
  }
}

export async function checkFireflyToken(token: string): Promise<{ ok: boolean; message?: string }> {
  const bal = await fetchFireflyBalance(token);
  return { ok: bal.ok, message: bal.message || bal.plan };
}

/* ------------------------------ cost estimation ----------------------------- */

export async function estimateFireflyCost(opts: {
  token: string;
  payload: Record<string, unknown>;
}): Promise<number | null> {
  try {
    const res = await fireflyFetch<{ cost?: number; credits?: number; totalCost?: number }>({
      token: opts.token,
      url: `${FIREFLY_3P_API}/v2/credits/estimate`,
      method: "POST",
      body: opts.payload,
    });
    if (!res.ok || !res.data) return null;
    return pickNumber(res.data.cost, res.data.credits, res.data.totalCost);
  } catch {
    return null;
  }
}

/* ---------------------------------- models ---------------------------------- */

export type FireflyVideoModel = {
  key: string; // "ff:veo:3.1-fast-generate"
  label: string;
  modelId: string;
  modelVersion: string;
  cost: string;
  durations?: number[];
};

export const FIREFLY_VIDEO_MODELS: FireflyVideoModel[] = [
  {
    key: "ff:seedance:seedance_2.0",
    label: "Seedance 2.0 (Firefly)",
    modelId: "seedance",
    modelVersion: "seedance_2.0",
    cost: "~var / 15s",
    durations: [5, 10, 15],
  },
  {
    key: "ff:veo:3.1-fast-generate",
    label: "Veo 3.1 Fast (Firefly)",
    modelId: "veo",
    modelVersion: "3.1-fast-generate",
    cost: "~20 cr / 8s",
    durations: [4, 6, 8],
  },
  {
    key: "ff:veo:3.1-generate",
    label: "Veo 3.1 (Firefly)",
    modelId: "veo",
    modelVersion: "3.1-generate",
    cost: "~40 cr / 8s",
    durations: [4, 6, 8],
  },
  {
    key: "ff:firefly:video-1",
    label: "Firefly Video Model 1",
    modelId: "firefly",
    modelVersion: "3.0-generate-002",
    cost: "~10 cr / 5s",
    durations: [5],
  },
];

export type FireflyImageModel = {
  key: string;
  label: string;
  modelVersion: string;
  cost: string;
};

export const FIREFLY_IMAGE_MODELS: FireflyImageModel[] = [
  {
    key: "ff:image4-standard",
    label: "Firefly Image 4 Standard",
    modelVersion: "image4_standard",
    cost: "~1 cr / image",
  },
  {
    key: "ff:image4-ultra",
    label: "Firefly Image 4 Ultra",
    modelVersion: "image4_ultra",
    cost: "~4 cr / image",
  },
  { key: "ff:image3", label: "Firefly Image 3", modelVersion: "image3", cost: "~1 cr / image" },
];

const RATIO_SIZE: Record<string, { width: number; height: number }> = {
  "1:1": { width: 2048, height: 2048 },
  "16:9": { width: 2048, height: 1152 },
  "9:16": { width: 1152, height: 2048 },
  "4:3": { width: 2048, height: 1536 },
  "3:4": { width: 1536, height: 2048 },
  "4:5": { width: 1638, height: 2048 },
  "2:3": { width: 1365, height: 2048 },
  "3:2": { width: 2048, height: 1365 },
};

/* --------------------------------- polling --------------------------------- */

type AsyncSubmit = {
  jobId?: string;
  statusUrl?: string;
  cancelUrl?: string;
  _links?: { self?: { href?: string }; cancel?: { href?: string } };
};

type AsyncStatus = {
  status?: string; // "pending" | "running" | "succeeded" | "failed"
  jobId?: string;
  progress?: number;
  result?: {
    outputs?: {
      video?: { url?: string };
      image?: { url?: string };
      url?: string;
      seed?: number;
    }[];
  };
  outputs?: { video?: { url?: string }; image?: { url?: string }; url?: string }[];
  error?: { message?: string };
  message?: string;
};

function extractUrl(s: AsyncStatus): string | null {
  const outs = s.result?.outputs || s.outputs || [];
  for (const o of outs) {
    const u = o?.video?.url || o?.image?.url || o?.url;
    if (typeof u === "string" && u) return u;
  }
  return null;
}

async function pollFirefly(opts: {
  token: string;
  statusUrl: string;
  accountId?: string;
  sessionId?: string;
  timeoutMs?: number;
  onProgress?: (msg: string, pct?: number) => void;
}): Promise<string> {
  const started = Date.now();
  const timeout = opts.timeoutMs ?? 15 * 60 * 1000;
  let pct = 25;
  while (Date.now() - started < timeout) {
    await new Promise((r) => setTimeout(r, 4000));
    const res = await fireflyFetch<AsyncStatus>({
      token: opts.token,
      url: opts.statusUrl,
      method: "GET",
      accountId: opts.accountId,
      apiKey: opts.sessionId ? FIREFLY_PLAYGROUND_API_KEY : undefined,
      headers: opts.sessionId ? { "x-arp-session-id": opts.sessionId } : undefined,
    });
    const st = res.data || {};
    const state = (st.status || "").toLowerCase();
    if (typeof st.progress === "number") pct = Math.max(pct, Math.min(95, Math.round(st.progress)));
    else pct = Math.min(95, pct + 3);
    opts.onProgress?.(`Firefly ${state || "processing"}…`, pct);

    if (["succeeded", "success", "completed", "done"].includes(state)) {
      const url = extractUrl(st);
      if (!url) throw new Error("Firefly: output URL tidak ditemukan");
      return url;
    }
    if (["failed", "error", "cancelled", "canceled"].includes(state)) {
      throw new Error(st.error?.message || st.message || "Firefly: job gagal");
    }
    if (!res.ok && (res.status === 401 || res.status === 403)) {
      throw new Error("Firefly: token invalid / expired (401)");
    }
  }
  throw new Error("Firefly: timeout menunggu hasil");
}

/* --------------------------------- generate -------------------------------- */

export type FireflyVideoOpts = {
  token: string;
  modelKey: string;
  prompt: string;
  ratio: string;
  duration: number;
  imageFile?: File;
  imageUrl?: string;
  negativePrompt?: string;
  accountId?: string;
  onProgress?: (msg: string, pct?: number) => void;
};

export async function generateFireflyVideo(opts: FireflyVideoOpts): Promise<string> {
  const model =
    FIREFLY_VIDEO_MODELS.find((m) => m.key === opts.modelKey) || FIREFLY_VIDEO_MODELS[0]!;
  const sessionId = makeFireflySessionHeader();
  const accountId = opts.accountId ?? getFireflyAccountId(opts.token);
  opts.onProgress?.(opts.imageFile ? "Firefly: upload reference…" : "Firefly: submit job…", 10);

  const referenceRef = opts.imageFile
    ? await uploadFireflyImage({ token: opts.token, file: opts.imageFile, accountId, sessionId })
    : opts.imageUrl
      ? asFireflyBlobRef({ presignedUrl: opts.imageUrl })
      : null;

  opts.onProgress?.("Firefly: submit job…", 18);

  // Model only accepts specific durations (Veo: 4/6/8s). Snap the UI value
  // to the nearest supported one instead of sending e.g. 10s and failing.
  const allowed = model.durations && model.durations.length ? model.durations : [8];
  const wanted = opts.duration || 8;
  const duration = allowed.reduce(
    (a, b) => (Math.abs(b - wanted) < Math.abs(a - wanted) ? b : a),
    allowed[0]!,
  );

  const payload = buildFireflyVideoPayload({
    model,
    prompt: opts.prompt,
    negativePrompt: opts.negativePrompt,
    ratio: opts.ratio,
    duration,
    referenceRef,
  });
  const relayOn = await isRelayAvailable(true);
  opts.onProgress?.(relayOn ? "Submit via extension relay (browser kamu)…" : "Submit Firefly…", 15);

  // Firefly frequently answers 408 "system under load" / 429 on the first hits.
  // Retry with backoff before surfacing an error to the user.
  let res = await fireflyFetch<AsyncSubmit>({
    token: opts.token,
    url: `${FIREFLY_3P_API}/v2/3p-videos/generate-async`,
    method: "POST",
    body: payload,
    accountId,
    apiKey: FIREFLY_PLAYGROUND_API_KEY,
    headers: { Accept: "*/*", "x-arp-session-id": sessionId, "x-nonce": randomHex(32) },
  });
  const backoff = [6000, 12000, 20000, 30000, 45000];
  for (
    let i = 0;
    i < backoff.length && !res.ok && [0, 408, 429, 500, 502, 503, 504].includes(res.status);
    i++
  ) {
    opts.onProgress?.(`Firefly sibuk (${res.status}), coba lagi ${i + 1}/${backoff.length}…`, 18);
    await new Promise((r) => setTimeout(r, backoff[i]!));
    res = await fireflyFetch<AsyncSubmit>({
      token: opts.token,
      url: `${FIREFLY_3P_API}/v2/3p-videos/generate-async`,
      method: "POST",
      body: buildFireflyVideoPayload({
        model,
        prompt: opts.prompt,
        negativePrompt: opts.negativePrompt,
        ratio: opts.ratio,
        duration,
        referenceRef,
      }),
      accountId,
      apiKey: FIREFLY_PLAYGROUND_API_KEY,
      headers: { Accept: "*/*", "x-arp-session-id": sessionId, "x-nonce": randomHex(32) },
    });
  }
  if (!res.ok) {
    if (res.status === 408 || res.status === 429) {
      throw new Error(
        `Firefly sedang penuh/limit (${res.status}: ${(res.data as { message?: string } | null)?.message || "system under load"}).` +
          (relayOn
            ? " Relay extension SUDAH aktif (request lewat firefly-tab), jadi ini Adobe/model yang menolak sementara. Coba ulang beberapa menit atau pilih model Firefly lain."
            : ` Relay extension TIDAK aktif di domain ini (${typeof window !== "undefined" ? window.location.host : "-"}). Update extension AA Creative ke v2.3.1+ (chrome://extensions → Reload), refresh halaman ini, lalu buka tab firefly.adobe.com dan cek tab "Relay" di extension harus berstatus Siap.`),
      );
    }
    throw new Error(
      `Firefly submit gagal (${res.status}): ${res.error || res.raw || JSON.stringify(res.data)?.slice(0, 200) || ""}`,
    );
  }
  const statusUrl =
    res.data?.statusUrl ||
    res.data?._links?.self?.href ||
    (res.data?.jobId ? `${FIREFLY_3P_API}/v2/status/${res.data.jobId}` : "");
  if (!statusUrl) throw new Error("Firefly: statusUrl tidak ada di response submit");

  return pollFirefly({
    token: opts.token,
    statusUrl,
    accountId,
    sessionId,
    onProgress: opts.onProgress,
  });
}

export type FireflyImageOpts = {
  token: string;
  modelKey: string;
  prompt: string;
  ratio: string;
  accountId?: string;
  onProgress?: (msg: string, pct?: number) => void;
};

export async function generateFireflyImage(opts: FireflyImageOpts): Promise<string> {
  const model =
    FIREFLY_IMAGE_MODELS.find((m) => m.key === opts.modelKey) || FIREFLY_IMAGE_MODELS[0]!;
  const size = RATIO_SIZE[opts.ratio] || RATIO_SIZE["1:1"]!;
  opts.onProgress?.("Firefly: submit image job…", 10);

  const res = await fireflyFetch<AsyncSubmit>({
    token: opts.token,
    url: `${FIREFLY_API}/v3/images/generate-async`,
    method: "POST",
    body: {
      prompt: opts.prompt,
      numVariations: 1,
      size,
      modelVersion: model.modelVersion,
    },
    accountId: opts.accountId,
  });
  if (!res.ok) {
    throw new Error(
      `Firefly image submit gagal (${res.status}): ${res.raw || JSON.stringify(res.data)?.slice(0, 200) || ""}`,
    );
  }
  const statusUrl =
    res.data?.statusUrl ||
    res.data?._links?.self?.href ||
    (res.data?.jobId ? `${FIREFLY_API}/v3/status/${res.data.jobId}` : "");
  if (!statusUrl) throw new Error("Firefly: statusUrl tidak ada di response submit");

  return pollFirefly({
    token: opts.token,
    statusUrl,
    accountId: opts.accountId,
    onProgress: opts.onProgress,
  });
}

/** Rotate across all stored Firefly tokens. */
export async function runFireflyWithRotation<T>(
  fn: (token: string) => Promise<T>,
  onRotate?: (index: number, total: number, reason: string) => void,
): Promise<T> {
  if (!getAllFireflyKeys().length)
    throw new Error(
      "Belum ada token Firefly. Buka Token Manager → Firefly dan tempel Bearer token.",
    );
  const { preflightTokens } = await import("@/lib/tokens/preflight");
  const pre = await preflightTokens("firefly", { onLog: (m) => onRotate?.(0, 0, m) });
  const tokens = pre.keys.length ? pre.keys : pre.emptyKeys;
  if (!tokens.length)
    throw new Error(
      "Tidak ada token Firefly yang available (semua invalid / habis credit). Update di Token Manager.",
    );

  let lastErr: Error | null = null;
  for (let i = 0; i < tokens.length; i++) {
    try {
      return await fn(tokens[i]!);
    } catch (e) {
      lastErr = e as Error;
      const msg = lastErr.message || String(e);
      if (!isFireflyRotatableError(msg)) throw e;
      markFireflyKeyFailed(tokens[i]!, msg.slice(0, 120));
      onRotate?.(i + 1, tokens.length, msg);
    }
  }
  throw lastErr || new Error("Firefly: semua token gagal");
}
