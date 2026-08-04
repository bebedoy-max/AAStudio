// Framia (Converge AI) provider client.
// Source: reverse-engineered from https://framia.converge.ai/ browser network capture.
//
// Auth: Bearer JWT dari Auth0 (issuer https://auth.converge.ai/). Token
// berumur ~24 jam — treat identik dengan Roboneo: sekali disimpan tidak
// pernah auto-drop, user cukup replace manual ketika Framia memaksa logout.
//
// Semua request langsung ke api.framia.pro diblok CORS (Origin harus
// framia.converge.ai), jadi kita proxy via /api/public/framia yang meneruskan
// header Bearer, Origin, dan Referer yang benar.

const LS_FRAMIA_KEYS = "aatools.framia.keys";
export const FRAMIA_BASE = "https://api.framia.pro";
export const FRAMIA_ORIGIN = "https://framia.converge.ai";

export type FramiaKey = {
  id: string;
  key: string;
  balance: number | null;
  status: "active" | "empty" | "pending" | "failed";
  note?: string;
  userEmail?: string;
  plan?: string;
  expiresAt?: number; // ms
};

/* -------------------------------- storage --------------------------------- */

export function getAllFramiaKeys(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(LS_FRAMIA_KEYS);
    if (!raw) return [];
    const list = JSON.parse(raw) as { key: string }[];
    return list.map((x) => x?.key).filter((k): k is string => !!k);
  } catch {
    return [];
  }
}

export function getFirstFramiaKey(): string | null {
  return getAllFramiaKeys()[0] ?? null;
}

/* -------------------------- auto-rotation helpers ------------------------- */

/**
 * True bila pesan error dari Framia bisa dipulihkan dengan token lain
 * (credit habis, quota/limit, token expired/unauthorized, dsb).
 */
export function isFramiaRotatableError(msg: string): boolean {
  const m = (msg || "").toLowerCase();
  // Broaden: Framia runs sering gagal karena berbagai sebab (node failed,
  // resource kosong, HTTP 5xx, network). Untuk auto-rotate di batch (naratif),
  // treat hampir semua kegagalan run sebagai rotatable — token berikutnya
  // punya kesempatan lolos. Hanya error validasi input eksplisit yang tidak
  // rotate (mis. prompt kosong / file corrupt terdeteksi client-side).
  return /credit|insufficient|not enough|out of|balance|quota|exhaust|limit reached|too many|rate.?limit|402|401|403|unauthor|forbidden|expired|invalid.*token|token.*invalid|node failed|video url|url tidak|run_id|500|502|503|504|server error|internal|network|fetch|timeout|timed out|failed|gagal/.test(
    m,
  );
}

export type FramiaRotateOpts = {
  onRotate?: (nextIndex: number, total: number, reason: string) => void;
  skipExpired?: boolean;
};

/**
 * Jalankan operasi Framia dengan auto-rotate: coba tiap token berurutan;
 * kalau error rotatable (credit habis / token expired / 401 / 403) lanjut ke
 * token berikutnya. Bila semua gagal, throw error terakhir.
 */
export async function runFramiaWithRotation<T>(
  fn: (token: string) => Promise<T>,
  opts: FramiaRotateOpts = {},
): Promise<T> {
  if (getAllFramiaKeys().length === 0) {
    throw new Error(
      "Belum ada token Framia. Buka Manage → Tokens → Framia dan tambahkan Bearer JWT.",
    );
  }
  const { preflightTokens } = await import("@/lib/tokens/preflight");
  const pre = await preflightTokens("framia", { onLog: (m) => opts.onRotate?.(0, 0, m) });
  const keys = pre.keys.length ? pre.keys : pre.emptyKeys;
  if (keys.length === 0) {
    throw new Error(
      "Tidak ada token Framia yang available (semua expired / habis credit). Update di Manage → Tokens.",
    );
  }

  let lastErr: Error | null = null;
  for (let i = 0; i < keys.length; i++) {
    const token = keys[i];
    if (opts.skipExpired !== false && isFramiaTokenExpired(token)) {
      lastErr = new Error(`Token #${i + 1} expired`);
      if (i < keys.length - 1) opts.onRotate?.(i + 1, keys.length, "token expired");
      continue;
    }
    try {
      return await fn(token);
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      lastErr = err;
      if (!isFramiaRotatableError(err.message) || i === keys.length - 1) throw err;
      opts.onRotate?.(i + 1, keys.length, err.message);
    }
  }
  throw lastErr ?? new Error("Framia: semua token gagal / habis credit");
}

/* -------------------------------- helpers --------------------------------- */

/** Decode payload JWT tanpa validasi signature — sekedar untuk ambil exp/email. */
export function decodeFramiaJwt(token: string): { exp?: number; iat?: number; sub?: string } | null {
  try {
    const parts = token.split(".");
    if (parts.length < 2) return null;
    const payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = payload + "=".repeat((4 - (payload.length % 4)) % 4);
    const json =
      typeof atob === "function" ? atob(padded) : Buffer.from(padded, "base64").toString("binary");
    return JSON.parse(json);
  } catch {
    return null;
  }
}

export function isFramiaTokenExpired(token: string): boolean {
  const p = decodeFramiaJwt(token);
  if (!p?.exp) return false;
  return Date.now() > p.exp * 1000;
}

/** Format bearer JWT: `eyJ...eyJ....sig`. */
export function isFramiaFormat(token: string): boolean {
  const t = (token || "").trim();
  return /^eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(t);
}

/* ---------------------------- low-level proxy ----------------------------- */

type ProxyOpts = {
  token: string;
  path: string; // starts with /video/... or /api/...
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
};

export async function framiaFetch<T = unknown>(opts: ProxyOpts): Promise<T> {
  const { token, path, method = "GET", body, query } = opts;
  const qs = query
    ? "?" +
      Object.entries(query)
        .filter(([, v]) => v !== undefined && v !== null && v !== "")
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
        .join("&")
    : "";
  const r = await fetch(`/api/public/framia`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Framia-Token": token },
    body: JSON.stringify({ path: path + qs, method, body }),
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
      pick("detail") ||
      pick("message") ||
      pick("error") ||
      pick("msg") ||
      pick("errors") ||
      (d ? JSON.stringify(d).slice(0, 300) : "") ||
      wrap?.raw?.slice(0, 300) ||
      `HTTP ${wrap?.status ?? r.status}`;
    throw new Error(`Framia ${method} ${path}: ${err}`);
  }

  return wrap.data as T;
}

/* ------------------------------ user / account ---------------------------- */

export type FramiaCredits = { credits?: number; balance?: number; plan?: string };
export type FramiaProfile = {
  user_id?: string | number;
  email?: string;
  nickname?: string;
  workspace_id?: string;
  workspaceId?: string;
  default_workspace_id?: string;
  defaultWorkspaceId?: string;
  active_workspace_id?: string;
  activeWorkspaceId?: string;
  current_workspace_id?: string;
  currentWorkspaceId?: string;
  subscription_plan?: string;
  subscription_plan_name?: string;
  [k: string]: unknown;
};

export async function fetchFramiaCredits(token: string): Promise<FramiaCredits> {
  const raw = await framiaFetch<Record<string, unknown>>({
    token,
    path: "/video/api/v1/user/credits",
  });
  const data = unwrapFramiaEnvelope<Record<string, unknown>>(raw);
  const credits = asObject(data.credits) ?? data;
  return {
    ...data,
    credits: typeof credits.credits_balance === "number" ? credits.credits_balance : undefined,
    balance:
      typeof credits.credit_cent_balance === "number"
        ? credits.credit_cent_balance
        : typeof data.balance === "number"
          ? data.balance
          : undefined,
    plan: typeof data.plan === "string" ? data.plan : undefined,
  } as FramiaCredits;
}

export async function fetchFramiaProfile(token: string): Promise<FramiaProfile> {
  const info = await framiaFetch<Record<string, unknown>>({ token, path: "/video/api/v2/user/info" });
  return unwrapFramiaEnvelope<FramiaProfile>(info);
}

export async function fetchFramiaCreatorProfile(token: string): Promise<Record<string, unknown>> {
  const profile = await framiaFetch<Record<string, unknown>>({ token, path: "/video/api/v2/creator/profile" });
  return unwrapFramiaEnvelope<Record<string, unknown>>(profile);
}

const WORKSPACE_ID_KEYS = new Set([
  "workspace_id",
  "workspaceId",
  "default_workspace_id",
  "defaultWorkspaceId",
  "active_workspace_id",
  "activeWorkspaceId",
  "current_workspace_id",
  "currentWorkspaceId",
]);

function findWorkspaceIdInValue(value: unknown, depth = 0): string | null {
  if (!value || depth > 5) return null;
  if (typeof value === "string") return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findWorkspaceIdInValue(item, depth + 1);
      if (found) return found;
    }
    return null;
  }
  if (typeof value !== "object") return null;

  const obj = value as Record<string, unknown>;
  for (const [key, raw] of Object.entries(obj)) {
    if (typeof raw !== "string" || !raw.trim()) continue;
    if (WORKSPACE_ID_KEYS.has(key)) return raw.trim();
    const normalized = key.toLowerCase().replace(/[^a-z]/g, "");
    if (normalized.includes("workspace") && normalized.includes("id")) return raw.trim();
  }

  for (const key of ["workspace", "current_workspace", "default_workspace", "active_workspace"]) {
    const nested = obj[key];
    if (nested && typeof nested === "object") {
      const nestedObj = nested as Record<string, unknown>;
      const id = nestedObj.id;
      if (typeof id === "string" && id.trim()) return id.trim();
    }
  }

  for (const raw of Object.values(obj)) {
    const found = findWorkspaceIdInValue(raw, depth + 1);
    if (found) return found;
  }
  return null;
}

export function findFramiaWorkspaceId(...sources: unknown[]): string | null {
  for (const source of sources) {
    const found = findWorkspaceIdInValue(source);
    if (found) return found;
  }
  return null;
}

export async function fetchFramiaSubscription(token: string) {
  return framiaFetch<Record<string, unknown>>({ token, path: "/api/payment/subscription/status" });
}

/**
 * Structural + expiry validator. Since Framia auth is Auth0 JWT we can decode
 * exp locally without burning an API call.
 */
export async function checkFramiaToken(
  token: string,
): Promise<{ ok: boolean; message?: string; expiresAt?: number; email?: string; plan?: string }> {
  const t = (token || "").trim();
  if (!isFramiaFormat(t)) {
    return { ok: false, message: "Format token salah (harus JWT eyJ...eyJ...)" };
  }
  const p = decodeFramiaJwt(t);
  if (!p?.exp) return { ok: false, message: "JWT tidak berisi exp" };
  const exp = p.exp * 1000;
  if (Date.now() > exp) {
    return { ok: false, message: `Token expired ${new Date(exp).toLocaleString()}` };
  }
  try {
    const profile = await fetchFramiaProfile(t).catch(() => null);
    return {
      ok: true,
      expiresAt: exp,
      email: profile?.email,
      plan: profile?.subscription_plan_name || profile?.subscription_plan,
    };
  } catch {
    return { ok: true, expiresAt: exp };
  }
}

export async function fetchFramiaBalance(
  token: string,
): Promise<{ ok: boolean; balance: number | null; message?: string }> {
  try {
    const c = await fetchFramiaCredits(token);
    const balance =
      typeof c.credits === "number"
        ? c.credits
        : typeof c.balance === "number"
          ? c.balance
          : null;
    return { ok: true, balance };
  } catch (e) {
    return { ok: false, balance: null, message: (e as Error).message };
  }
}

/* ------------------------------- discovery -------------------------------- */

export type FramiaSkill = {
  id?: string;
  skill_id?: string;
  name?: string;
  display_name?: string;
  description?: string;
  category?: string;
  input_schema?: unknown;
  output_schema?: unknown;
  workflow_id?: string;
  cost?: number | null;
  media_type?: string;
  [k: string]: unknown;
};

export type FramiaTemplate = {
  id?: string;
  template_id?: string;
  workflow_id?: string;
  name?: string;
  description?: string;
  cover_url?: string;
  category_id?: string | number;
  tags?: string[];
  [k: string]: unknown;
};

export type FramiaCategory = {
  id?: string | number;
  name?: string;
  templates?: FramiaTemplate[];
  [k: string]: unknown;
};

export type FramiaAgentNodeOptions = Record<string, unknown>;
export type FramiaCanvasNodeRules = Record<string, unknown>;

export async function listFramiaSkills(token: string): Promise<FramiaSkill[]> {
  const data = await framiaFetch<{ items?: FramiaSkill[]; data?: FramiaSkill[] } | FramiaSkill[]>({
    token,
    path: "/video/api/workflows/skills",
    query: { user_invocable: true },
  });
  if (Array.isArray(data)) return data;
  return data?.items ?? data?.data ?? [];
}

export async function listFramiaTemplates(
  token: string,
  opts: { scope?: string; page?: number; page_size?: number; category_id?: string | number } = {},
): Promise<FramiaTemplate[]> {
  const data = await framiaFetch<{ items?: FramiaTemplate[]; data?: FramiaTemplate[] } | FramiaTemplate[]>({
    token,
    path: "/video/api/workflows/templates",
    query: {
      scope: opts.scope ?? "all",
      page: opts.page ?? 1,
      page_size: opts.page_size ?? 200,
      category_id: opts.category_id,
    },
  });
  if (Array.isArray(data)) return data;
  return data?.items ?? data?.data ?? [];
}

export async function listFramiaTemplateCategories(
  token: string,
  withTemplates = true,
): Promise<FramiaCategory[]> {
  const data = await framiaFetch<
    { items?: FramiaCategory[]; data?: FramiaCategory[] } | FramiaCategory[]
  >({
    token,
    path: "/video/api/workflows/template-categories",
    query: withTemplates ? { with_templates: true, template_limit: 200 } : undefined,
  });
  if (Array.isArray(data)) return data;
  return data?.items ?? data?.data ?? [];
}

export async function fetchAgentNodeOptions(token: string): Promise<FramiaAgentNodeOptions> {
  return framiaFetch<FramiaAgentNodeOptions>({ token, path: "/video/api/workflows/agent-node/options" });
}

export async function fetchCanvasNodeRules(token: string): Promise<FramiaCanvasNodeRules> {
  return framiaFetch<FramiaCanvasNodeRules>({ token, path: "/video/api/workflows/canvas-node-rules" });
}

/* --------------------------------- assets --------------------------------- */

export async function listSystemAvatars(token: string) {
  return framiaFetch<unknown>({ token, path: "/video/api/v2/avatar/system-list" });
}
export async function listUserAvatars(token: string) {
  return framiaFetch<unknown>({ token, path: "/video/api/v2/avatar/user/list" });
}
export async function listSystemGarments(token: string) {
  return framiaFetch<unknown>({ token, path: "/video/api/v2/garment/system-list" });
}
export async function listWorkspaceBrandkits(token: string, workspaceId: string) {
  return framiaFetch<unknown>({
    token,
    path: `/video/api/v2/workspaces/${encodeURIComponent(workspaceId)}/brandkits`,
  });
}

/* -------------------------------- projects -------------------------------- */

export type FramiaProject = {
  id?: string;
  project_id?: string;
  canvas_id?: string;
  workspace_id?: string;
  thread_id?: string;
  main_thread_id?: string;
  [k: string]: unknown;
};

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function unwrapFramiaEnvelope<T = unknown>(value: unknown): T {
  let current = value;
  for (let depth = 0; depth < 4; depth += 1) {
    const obj = asObject(current);
    if (!obj) return current as T;
    const looksLikeEnvelope = "code" in obj && ("data" in obj || "message" in obj || "detail" in obj);
    if (!looksLikeEnvelope || !("data" in obj)) return current as T;
    current = obj.data;
  }
  return current as T;
}

function pickString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return undefined;
}

function pickMainThreadId(project: Record<string, unknown> | null): string | undefined {
  const direct = pickString(project?.thread_id, project?.main_thread_id);
  if (direct) return direct;
  const threads = project?.threads;
  if (!Array.isArray(threads)) return undefined;
  const main = threads.find((thread) => asObject(thread)?.is_main === true) ?? threads[0];
  return pickString(asObject(main)?.thread_id, asObject(main)?.id);
}

function pickArrayFromObject<T>(value: unknown, keys: string[], depth = 0): T[] | null {
  if (depth > 5) return null;
  if (Array.isArray(value)) return value as T[];
  const obj = asObject(value);
  if (!obj) return null;
  for (const key of keys) {
    const direct = obj[key];
    if (Array.isArray(direct)) return direct as T[];
  }
  for (const key of ["data", "result", "results", "payload"]) {
    const nested = pickArrayFromObject<T>(obj[key], keys, depth + 1);
    if (nested) return nested;
  }
  return null;
}

export async function createFramiaProject(
  token: string,
  opts: { workspaceId?: string | null; executionMode?: "auto" | "manual"; category?: string },
): Promise<FramiaProject> {
  const body: Record<string, unknown> = {
    execution_mode: opts.executionMode ?? "auto",
    source: "user",
    category: opts.category ?? "workflow_canvas",
  };
  if (opts.workspaceId) body.workspace_id = opts.workspaceId;
  const raw = await framiaFetch<unknown>({
    token,
    path: "/video/api/v2/projects",
    method: "POST",
    body,
  });
  // Observed Framia v2 shape:
  // { code, data: { project: { project_id, main_thread_id, ... }, canvas: { canvas_id }, workflow: { canvas_id } } }
  // Normalize it because downstream I2V needs project_id + canvas_id + thread_id
  // on one object. Older/bare response shapes are also supported.
  const root = asObject(raw);
  const data = asObject(root?.data) ?? root;
  const nestedData = asObject(data?.data) ?? data;
  const project = asObject(nestedData?.project) ?? asObject(root?.project) ?? nestedData ?? root;
  const canvas = asObject(nestedData?.canvas) ?? asObject(root?.canvas);
  const workflow = asObject(nestedData?.workflow) ?? asObject(root?.workflow);
  const projectId = pickString(project?.project_id, project?.id, nestedData?.project_id, root?.project_id, root?.id);
  const canvasId = pickString(
    project?.canvas_id,
    nestedData?.canvas_id,
    canvas?.canvas_id,
    canvas?.id,
    workflow?.canvas_id,
    root?.canvas_id,
  );
  const threadId = pickMainThreadId(project);

  return {
    ...(root ?? {}),
    ...(nestedData ?? {}),
    ...(project ?? {}),
    project_id: projectId,
    id: pickString(project?.id, projectId),
    canvas_id: canvasId,
    thread_id: threadId,
    main_thread_id: pickString(project?.main_thread_id, threadId),
  } as FramiaProject;
}

export async function listFramiaProjects(token: string): Promise<FramiaProject[]> {
  const raw = await framiaFetch<unknown>({
    token,
    path: "/video/api/v2/projects",
    query: { page: 1, per_page: 20 },
  });
  // Framia v2 wraps responses as { code, message, data: { projects: [...] } };
  // some endpoints return bare arrays or `{ items | data | projects }` shapes.
  return pickArrayFromObject<FramiaProject>(raw, ["projects", "items", "list", "results"]) ?? [];
}

export async function getFramiaProject(token: string, projectId: string): Promise<FramiaProject> {
  return framiaFetch<FramiaProject>({
    token,
    path: `/video/api/v2/projects/${encodeURIComponent(projectId)}`,
  });
}

export async function listProjectResources(token: string, projectId: string) {
  return framiaFetch<unknown>({
    token,
    path: `/video/api/v2/projects/${encodeURIComponent(projectId)}/resources`,
  });
}

export async function getResourceInfo(token: string, resourceId: string) {
  const raw = await framiaFetch<{
    resource_id?: string;
    resource_info?: Record<string, unknown>;
    media_type?: string;
    url?: string;
    download_url?: string;
    [k: string]: unknown;
  }>({ token, path: `/video/api/v1/resources/${encodeURIComponent(resourceId)}/info` });
  const data = unwrapFramiaEnvelope<typeof raw>(raw);
  const resourceInfo = asObject(data.resource_info);
  return {
    ...data,
    ...(resourceInfo ?? {}),
    resource_id: pickString(data.resource_id, resourceInfo?.resource_id, resourceId),
    url: pickString(data.url, resourceInfo?.url, resourceInfo?.preview_url, resourceInfo?.download_url),
    download_url: pickString(data.download_url, resourceInfo?.download_url, resourceInfo?.url, resourceInfo?.preview_url),
  };
}

/* -------------------------------- pricing --------------------------------- */

export type FramiaPricingRequest = {
  projectId: string;
  canvasId: string;
  type: "image" | "video" | "audio" | string;
  model: string;
  aspectRatio?: string;
  resolution?: string;
  prompt?: string;
  resource?: unknown[];
  currentResourceId?: string;
  useAi?: boolean;
};

export async function computeResourcePricing(token: string, req: FramiaPricingRequest) {
  return framiaFetch<{ price?: number; credits?: number; [k: string]: unknown }>({
    token,
    path: `/video/api/v2/projects/${encodeURIComponent(req.projectId)}/ai/resource_process_pricing`,
    method: "POST",
    body: {
      prompt: req.prompt ?? "",
      resource: req.resource ?? [],
      current_resource_id: req.currentResourceId ?? "",
      canvas_id: req.canvasId,
      task_params: {
        model: req.model,
        aspect_ratio: req.aspectRatio ?? "16:9",
        resolution: req.resolution ?? "2K",
      },
      type: req.type,
      use_ai: req.useAi ?? false,
    },
  });
}

/* --------------------------------- upload --------------------------------- */

export type FramiaPresignResp = {
  presigned_url?: string;
  upload_url?: string;
  url?: string;
  key?: string;
  scene?: string;
  [k: string]: unknown;
};

async function uploadFramiaBlobViaProxy(uploadUrl: string, file: Blob): Promise<void> {
  const form = new FormData();
  form.append("uploadUrl", uploadUrl);
  form.append("file", file, "upload.bin");
  const r = await fetch("/api/public/framia", { method: "POST", body: form });
  const wrap = (await r.json().catch(() => null)) as {
    ok?: boolean;
    status?: number;
    raw?: string;
  } | null;
  if (!r.ok || !wrap?.ok) {
    const raw = wrap?.raw ? `: ${wrap.raw}` : "";
    throw new Error(`Framia S3 upload failed HTTP ${wrap?.status ?? r.status}${raw}`);
  }
}

export async function getUploadPresigned(
  token: string,
  opts: { projectId: string; filename: string; scene?: string },
): Promise<FramiaPresignResp> {
  const raw = await framiaFetch<unknown>({
    token,
    path: "/video/api/v2/get_upload_presigned_url",
    method: "POST",
    body: {
      project_id: opts.projectId,
      filename: opts.filename,
      scene: opts.scene ?? "canvas_upload",
    },
  });
  return unwrapFramiaEnvelope<FramiaPresignResp>(raw);
}

export async function markUploadDone(
  token: string,
  opts: {
    projectId: string;
    threadId: string;
    filename: string;
    key: string;
    scene?: string;
    originalFilename?: string;
  },
) {
  const raw = await framiaFetch<unknown>({
    token,
    path: `/video/api/v2/projects/${encodeURIComponent(opts.projectId)}/upload_done`,
    method: "POST",
    body: {
      thread_id: opts.threadId,
      filename: opts.filename,
      key: opts.key,
      scene: opts.scene ?? "canvas_upload",
      params: { original_filename: opts.originalFilename ?? opts.filename },
    },
  });
  const data = unwrapFramiaEnvelope<Record<string, unknown>>(raw);
  const resource = asObject(data.resource) ?? asObject(data.asset) ?? data;
  return {
    ...data,
    resource_id: pickString(data.resource_id, resource.resource_id, resource.id),
    id: pickString(data.id, resource.id, data.resource_id, resource.resource_id),
  };
}

/**
 * Upload a Blob/File to Framia. Runs presign → PUT to S3 (via presigned URL,
 * bypassing our proxy) → upload_done registration → returns resource_id.
 */
export async function uploadFramiaAsset(
  token: string,
  opts: { projectId: string; threadId: string; file: Blob; filename: string; scene?: string },
): Promise<{ resource_id: string; key: string }> {
  const filename =
    `${Date.now()}-${crypto.randomUUID?.() ?? Math.random().toString(36).slice(2)}-` +
    opts.filename.replace(/[^A-Za-z0-9._-]/g, "");
  const presign = await getUploadPresigned(token, {
    projectId: opts.projectId,
    filename,
    scene: opts.scene,
  });
  const uploadUrl = presign.presigned_url || presign.upload_url || presign.url;
  const key = presign.key;
  if (!uploadUrl || !key) throw new Error("Framia: presigned URL kosong");
  // Browser direct PUT to Aliyun OSS can fail as a generic "Failed to fetch"
  // because the presigned URL is not CORS-friendly. Route the binary upload
  // through the Framia proxy while preserving the signed octet-stream header.
  await uploadFramiaBlobViaProxy(uploadUrl, opts.file);
  const done = await markUploadDone(token, {
    projectId: opts.projectId,
    threadId: opts.threadId,
    filename,
    key,
    scene: opts.scene,
    originalFilename: opts.filename,
  });
  const resourceId = done.resource_id || done.id;
  if (!resourceId) throw new Error("Framia upload_done tidak mengembalikan resource_id");
  return { resource_id: String(resourceId), key };
}

/* ------------------------------ workflow runs ----------------------------- */

export type FramiaResourceRef = { resource_id: string; media_type: string };

export type FramiaRunRequest = {
  workflowId: string;
  workflowVersion?: number;
  projectId: string;
  canvasId: string;
  sourceType?: "ad_hoc" | "template" | "skill";
  sourceId?: string;
  clientRunId?: string;
  /** Free-form input map — key is node id, value is that node's output payload. */
  inputRefs?: Record<string, unknown>;
  contextRefs?: Record<string, unknown>;
  executionBackend?: "temporal" | string;
};

export type FramiaRun = {
  run_id?: string;
  id?: string;
  status?: string;
  [k: string]: unknown;
};

const genClientRunId = () =>
  `workflow-client-run-${Math.random().toString(36).slice(2, 10)}-${Math.random()
    .toString(36)
    .slice(2, 14)}`;

async function publishWorkflowVersion(
  token: string,
  req: FramiaRunRequest,
  version: number,
): Promise<{ version: number; error?: string }> {
  const canvasSnapshot = asObject(req.contextRefs)?.canvas_snapshot;
  if (!canvasSnapshot) return { version };
  // Some Framia deployments reject millisecond versions (int32 overflow),
  // so retry with a second-resolution version before giving up.
  const candidates = [version, Math.floor(Date.now() / 1000), 1];
  let lastError = "";
  for (const v of candidates) {
    try {
      await framiaFetch<unknown>({
        token,
        path: "/video/api/workflows/versions",
        method: "POST",
        body: {
          workflow_id: req.workflowId,
          version: v,
          owner_type: "project",
          owner_id: req.projectId,
          project_id: req.projectId,
          canvas_id: req.canvasId,
          canvas_snapshot: canvasSnapshot,
        },
      });
      return { version: v };
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
      if (/401|403|credit|unauthorized/i.test(lastError)) throw e;
    }
  }
  // Publishing failed: still attempt the run (ad-hoc runs often carry the
  // snapshot in context_refs), but keep the reason for error reporting.
  return { version, error: lastError };
}


/**
 * Kick off a workflow run. Payload shape follows the browser capture of the
 * canvas "Run" button. `inputRefs` should be a `{ nodes: { <node_id>: { output: {...} } } }`
 * object; for a simple image-to-video run you can pass a single image node:
 *   {
 *     nodes: {
 *       "image-abc": { output: { result: { kind: "resource_collection", media_type: "image",
 *         resources: [{ resource_id, media_type: "image" }] } } }
 *     }
 *   }
 */
export async function createWorkflowRun(token: string, req: FramiaRunRequest): Promise<FramiaRun> {
  const requested = req.workflowVersion ?? Date.now();
  const published = await publishWorkflowVersion(token, req, requested);
  const workflowVersion = published.version;
  const contextRefs = asObject(req.contextRefs);
  const runContextRefs = contextRefs
    ? Object.fromEntries(Object.entries(contextRefs).filter(([key]) => key !== "canvas_snapshot"))
    : { run_kind: "execution_graph" };
  const raw = await framiaFetch<unknown>({
    token,
    path: "/video/api/workflows/runs",
    method: "POST",
    body: {
      workflow_id: req.workflowId,
      workflow_version: workflowVersion,
      source_type: req.sourceType ?? "ad_hoc",
      source_id: req.sourceId ?? `video-${Math.random().toString(16).slice(2, 14)}`,
      client_run_id: req.clientRunId ?? genClientRunId(),
      project_id: req.projectId,
      canvas_id: req.canvasId,
      input_refs: req.inputRefs ?? {},
      // The browser publishes canvas_snapshot through /workflows/versions,
      // then sends only run_kind + execution_node_ids in the run request.
      context_refs: runContextRefs,
      execution_backend: req.executionBackend ?? "temporal",
    },
  }).catch((e: unknown) => {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(published.error ? `${msg} (publish version gagal: ${published.error})` : msg);
  });

  const data = unwrapFramiaEnvelope<Record<string, unknown>>(raw);
  const run = asObject(data.run) ?? asObject(data.workflow_run) ?? asObject(data.workflowRun) ?? data;
  const runId = pickString(run.run_id, run.workflow_run_id, run.id, data.run_id, data.workflow_run_id, data.id);
  return {
    ...data,
    ...run,
    run_id: runId,
    id: pickString(run.id, runId),
  } as FramiaRun;
}

export type FramiaRunNode = {
  node_id?: string;
  status?: string;
  progress?: number;
  output?: unknown;
  error?: unknown;
  [k: string]: unknown;
};

export async function listRunNodes(token: string, runId: string): Promise<FramiaRunNode[]> {
  const raw = await framiaFetch<
    { nodes?: FramiaRunNode[]; items?: FramiaRunNode[] } | FramiaRunNode[]
  >({
    token,
    path: `/video/api/workflows/runs/${encodeURIComponent(runId)}/nodes`,
  });
  const data = unwrapFramiaEnvelope<{ nodes?: FramiaRunNode[]; items?: FramiaRunNode[] } | FramiaRunNode[]>(raw);
  return pickArrayFromObject<FramiaRunNode>(data, ["nodes", "items", "node_runs", "run_nodes", "tasks", "results"]) ?? [];
}

/** Ambil detail run (berisi error/reason level-run yang tidak muncul di /nodes). */
export async function getRunDetail(token: string, runId: string): Promise<Record<string, unknown>> {
  const raw = await framiaFetch<unknown>({
    token,
    path: `/video/api/workflows/runs/${encodeURIComponent(runId)}`,
  });
  return (unwrapFramiaEnvelope<Record<string, unknown>>(raw) ?? {}) as Record<string, unknown>;
}

export async function listWorkflowRuns(
  token: string,
  opts: {
    projectId: string;
    canvasId?: string;
    status?: "queued" | "running" | "waiting_approval" | "success" | "failed";
    page?: number;
    perPage?: number;
  },
) {
  return framiaFetch<unknown>({
    token,
    path: "/video/api/workflows/runs",
    query: {
      project_id: opts.projectId,
      canvas_id: opts.canvasId,
      status: opts.status,
      page: opts.page ?? 1,
      per_page: opts.perPage ?? 100,
    },
  });
}

const FRAMIA_TERMINAL_STATUSES = new Set(["success", "succeeded", "completed", "failed", "canceled", "cancelled"]);

/** Poll a run until every node reaches terminal status. */
export async function waitForRunCompletion(
  token: string,
  runId: string,
  opts: { timeoutMs?: number; intervalMs?: number; onTick?: (nodes: FramiaRunNode[]) => void } = {},
): Promise<FramiaRunNode[]> {
  const { timeoutMs = 20 * 60_000, intervalMs = 3_000 } = opts;
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const nodes = await listRunNodes(token, runId).catch(() => []);
    opts.onTick?.(nodes);
    const allTerminal = nodes.length > 0 && nodes.every((n) => FRAMIA_TERMINAL_STATUSES.has(String(n.status ?? "").toLowerCase()));
    if (allTerminal) return nodes;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(`Framia run ${runId} timeout setelah ${Math.round(timeoutMs / 1000)} detik`);
}
