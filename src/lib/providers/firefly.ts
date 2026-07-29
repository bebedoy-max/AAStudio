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

export const LS_FIREFLY_KEYS = "aatools.firefly.keys";
export const FIREFLY_API = "https://firefly.adobe.io";
export const FIREFLY_3P_API = "https://firefly-3p.ff.adobe.io";
export const FIREFLY_DEFAULT_API_KEY = "SunbreakWebUI1";

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
  return readList().find((x) => x.key === token)?.accountId;
}

export function markFireflyKeyFailed(token: string, reason: string) {
  if (typeof window === "undefined") return;
  const list = readList();
  const next = list.map((x) => (x.key === token ? { ...x, status: "failed" as const, note: reason } : x));
  const value = JSON.stringify(next);
  localStorage.setItem(LS_FIREFLY_KEYS, value);
  pushTokenAsync(LS_FIREFLY_KEYS, value);
  window.dispatchEvent(
    new CustomEvent("aatools:tokens-synced", { detail: { provider: "firefly", action: "failed", reason } }),
  );
  window.dispatchEvent(new Event("storage"));
}

export function isFireflyRotatableError(msg: string): boolean {
  return /401|403|429|expired|unauthorized|insufficient|quota|credit/i.test(msg);
}

/* ---------------------------------- proxy ---------------------------------- */

type ProxyResult<T> = { ok: boolean; status: number; data: T | null; raw?: string; error?: string };

export async function fireflyFetch<T = unknown>(opts: {
  token: string;
  url: string;
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: unknown;
  accountId?: string;
  apiKey?: string;
  headers?: Record<string, string>;
}): Promise<ProxyResult<T>> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Firefly-Token": opts.token,
    "X-Firefly-Api-Key": opts.apiKey || FIREFLY_DEFAULT_API_KEY,
  };
  const acc = opts.accountId ?? getFireflyAccountId(opts.token);
  if (acc) headers["X-Firefly-Account"] = acc;

  const r = await fetch("/api/public/firefly", {
    method: "POST",
    headers,
    body: JSON.stringify({
      url: opts.url,
      method: opts.method,
      body: opts.body,
      headers: opts.headers,
    }),
  });
  return (await r.json()) as ProxyResult<T>;
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
  credits?: { remaining?: number; total?: number; used?: number } & Record<string, { quota?: Quota } | unknown>;
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
    const balance = pickNumber(
      d.total?.quota?.available,
      d.quota?.available,
      d.availableCredits,
      d.remainingCredits,
      d.available,
      d.credits?.remaining,
      d.generativeCredits?.remaining,
      d.remaining,
      d.balance,
    ) ?? findNumberByKey(d, ["available", "availableCredits", "remainingCredits", "remaining", "balance"]);
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
    modelVersion: "video-1",
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
  { key: "ff:image4-standard", label: "Firefly Image 4 Standard", modelVersion: "image4_standard", cost: "~1 cr / image" },
  { key: "ff:image4-ultra", label: "Firefly Image 4 Ultra", modelVersion: "image4_ultra", cost: "~4 cr / image" },
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
  imageUrl?: string;
  accountId?: string;
  onProgress?: (msg: string, pct?: number) => void;
};

export async function generateFireflyVideo(opts: FireflyVideoOpts): Promise<string> {
  const model =
    FIREFLY_VIDEO_MODELS.find((m) => m.key === opts.modelKey) || FIREFLY_VIDEO_MODELS[0]!;
  opts.onProgress?.("Firefly: submit job…", 10);

  const payload: Record<string, unknown> = {
    modelId: model.modelId,
    modelVersion: model.modelVersion,
    prompt: opts.prompt,
    aspectRatio: opts.ratio || "16:9",
    durationSeconds: opts.duration || 8,
    numVariations: 1,
    ...(opts.imageUrl ? { image: { source: { url: opts.imageUrl } } } : {}),
  };

  const res = await fireflyFetch<AsyncSubmit>({
    token: opts.token,
    url: `${FIREFLY_3P_API}/v2/3p-videos/generate-async`,
    method: "POST",
    body: payload,
    accountId: opts.accountId,
  });
  if (!res.ok) {
    throw new Error(
      `Firefly submit gagal (${res.status}): ${res.raw || JSON.stringify(res.data)?.slice(0, 200) || ""}`,
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
    accountId: opts.accountId,
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
  const tokens = getAllFireflyKeys();
  if (!tokens.length)
    throw new Error("Belum ada token Firefly. Buka Token Manager → Firefly dan tempel Bearer token.");
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
