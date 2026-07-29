// Roboneo provider client (Meitu AI Engine Gateway).
// Docs source: reverse-engineered from https://www.roboneo.com/ai_flow captured requests.
//
// Endpoints digunakan:
//   POST https://ai-engine-gateway-roboneo.meitu.com/roboneo/sync/request
//   path_scene=nodeexecute / nodeexecutequery / vipshow di dalam body.parameter
//
// Auth: header `access-token: _v2...` + `client-id: 1189857684` (Origin/Referer=https://www.roboneo.com).
// WARNING: Endpoint memerlukan Origin=https://www.roboneo.com; call langsung dari
// browser aplikasi ini (origin lain) akan diblok oleh CORS. Kalau gagal preflight,
// pindah ke server proxy (src/routes/api/public/roboneo.ts).
//
// Untuk motion control Kling 2.6 std: apiName = "video_bonbon_motioncontrol_v26",
// parameters = { quality: "std" }, dengan image_url + video_url + optional prompt.

import { pushTokenAsync } from "@/lib/tokens/sync";

export const ROBONEO_GATEWAY = "https://ai-engine-gateway-roboneo.meitu.com";
export const ROBONEO_CLIENT_ID = "1189857684";
export const LS_ROBONEO_KEYS = "aatools.roboneo.keys";

export type RoboneoKey = {
  id: string;
  key: string;
  balance: number | null;
  status: "active" | "empty" | "pending" | "failed";
  note?: string;
};

/* --------------------------------- storage --------------------------------- */

export function getAllRoboneoKeys(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(LS_ROBONEO_KEYS);
    if (!raw) return [];
    const list = JSON.parse(raw) as { key: string }[];
    return list.map((x) => x?.key).filter((k): k is string => !!k);
  } catch {
    return [];
  }
}

export function getFirstRoboneoKey(): string | null {
  return getAllRoboneoKeys()[0] || null;
}

export function removeRoboneoKeyFromManager(
  accessToken: string,
  reason?: string,
): { removed: boolean; remaining: number } {
  if (typeof window === "undefined") return { removed: false, remaining: 0 };
  try {
    const raw = localStorage.getItem(LS_ROBONEO_KEYS);
    const list = raw ? (JSON.parse(raw) as RoboneoKey[]) : [];
    const next = list.filter((item) => item?.key !== accessToken);
    if (next.length === list.length) return { removed: false, remaining: next.length };
    const value = JSON.stringify(next);
    localStorage.setItem(LS_ROBONEO_KEYS, value);
    pushTokenAsync(LS_ROBONEO_KEYS, value);
    window.dispatchEvent(
      new CustomEvent("aatools:tokens-synced", {
        detail: { provider: "roboneo", action: "removed", reason },
      }),
    );
    window.dispatchEvent(new Event("storage"));
    return { removed: true, remaining: next.length };
  } catch (e) {
    console.warn("[roboneo] gagal menghapus token kosong", e);
    return { removed: false, remaining: getAllRoboneoKeys().length };
  }
}

/* --------------------------------- helpers --------------------------------- */

const uuid = () =>
  "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });

const genRoomId = () => {
  // Format observasi: <base64uid>-<hex32>-<timestamp>
  const uid = Math.floor(Math.random() * 1e10).toString();
  const b64 = btoa(uid).replace(/=/g, "");
  const hex = Array.from({ length: 32 }, () =>
    Math.floor(Math.random() * 16).toString(16),
  ).join("");
  return `${b64}-${hex}-${Date.now()}`;
};

const genGid = () => {
  const rnd = (n: number) =>
    Array.from({ length: n }, () => Math.floor(Math.random() * 16).toString(16)).join("");
  return `${rnd(14)}-${rnd(15)}-${rnd(7)}-${rnd(7)}-${rnd(14)}`;
};

/** Roboneo access-tokens embed a numeric field in a base64 payload after the
 * `_v2` prefix, shape: `<hash>#<ts>#<uid-or-session-field>#<n>#<hash>#ALI_YUN#BJ_HW#<sig>`.
 * Older authenticated tokens exposed a real uid here; current Roboneo sessions
 * can legitimately expose `0`, so we only mirror the value instead of rejecting it. */
function extractUid(accessToken: string): string {
  try {
    let b64 = accessToken.replace(/^_v\d+/, "");
    b64 = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
    const decoded =
      typeof atob === "function"
        ? atob(b64)
        : Buffer.from(b64, "base64").toString("binary");
    const parts = decoded.split("#");
    const uid = parts[2];
    if (uid && /^\d+$/.test(uid)) return uid;
  } catch {
    /* ignore */
  }
  return "0";
}

/** Fixed gateway signature — reverse-engineered from Roboneo web bundle
 *  (`i.Z.roboneo.token()` reads this constant from state; the gateway also
 *  accepts the value shipped in `roboneo-cli/.env.bundle`). Any other value
 *  yields `error_code:98 "request fail, token error: <value>"`. */
const ROBONEO_PARAM_TOKEN = "45C30555F10E49629098A75F95828DA6";
const ROBONEO_TASK_CONTEXT = new Map<string, { roomId: string; nodeId: string }>();

/** Common parameter block yang diminta gateway roboneo di setiap request. */
function baseParameter(accessToken: string, pathScene: string, roomId?: string) {
  return {
    token: ROBONEO_PARAM_TOKEN,
    gid: genGid(),
    uid: extractUid(accessToken),
    trace_id: uuid(),
    client_id: ROBONEO_CLIENT_ID,
    app_scene: "roboneo",
    area_code: "ID",
    lang: "en",
    time_zone: "Asia/Jakarta",
    tt_ttclid: "",
    tt_ttp: "",
    first_url: "https://www.roboneo.com/home",
    page_url: "https://www.roboneo.com/ai_flow",
    referrer: "https://www.roboneo.com/home",
    pixel_ready: 1,
    extra: { big_data_patch: { position_type: "/ai_flow" } },
    path_scene: pathScene,
    room_id: roomId ?? genRoomId(),
    _access_token: accessToken, // internal helper, di-strip di rnCall
  };
}


async function rnCall<T = unknown>(
  path: "nodeexecute" | "nodeexecutequery" | "vipshow",
  accessToken: string,
  parameterExtras: Record<string, unknown>,
): Promise<T> {
  const base = baseParameter(accessToken, path, parameterExtras.room_id as string | undefined);
  const { _access_token: _at, ...cleanBase } = base;
  const parameter = { ...cleanBase, ...parameterExtras };

  // Meitu gateway occasionally responds with 5xx / connection reset
  // (Envoy "upstream connect error"). Retry a few times with backoff before
  // giving up so a single blip doesn't kill an in-flight generation.
  const MAX_ATTEMPTS = 5;
  let lastErr = "";
  let lastStatus = 0;
  let lastRaw: string | undefined;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let r: Response;
    try {
      r = await fetch(`/api/public/roboneo`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Roboneo-Token": accessToken,
        },
        body: JSON.stringify({ path, parameter }),
      });
    } catch (e) {
      lastErr = `network: ${(e as Error).message}`;
      lastStatus = 0;
      if (attempt < MAX_ATTEMPTS) {
        await new Promise((res) => setTimeout(res, 1500 * attempt));
        continue;
      }
      break;
    }
    const wrap = (await r.json().catch(() => null)) as {
      ok?: boolean;
      status?: number;
      data?: { error_code?: number; error_msg?: string; parameter?: unknown } | null;
      raw?: string;
    } | null;
    const upstreamStatus = wrap?.status ?? r.status;
    const obj = wrap?.data ?? {};
    lastStatus = upstreamStatus;
    lastRaw = wrap?.raw;

    // Transient upstream failure — retry.
    const isTransient =
      !wrap?.ok &&
      (upstreamStatus === 502 ||
        upstreamStatus === 503 ||
        upstreamStatus === 504 ||
        upstreamStatus === 429 ||
        upstreamStatus === 0);
    if (isTransient && attempt < MAX_ATTEMPTS) {
      lastErr = `HTTP ${upstreamStatus}`;
      await new Promise((res) => setTimeout(res, 1500 * attempt));
      continue;
    }

    if (!wrap?.ok || (obj.error_code && obj.error_code !== 0)) {
      const message = obj.error_msg || `HTTP ${upstreamStatus}`;
      throw new Error(
        `Roboneo ${path}: ${message}` +
          (obj.error_code ? ` (error_code=${obj.error_code})` : "") +
          (message === "Please log in first" ? " — access-token Roboneo perlu login ulang" : "") +
          (wrap?.raw ? ` — ${wrap.raw.slice(0, 200)}` : ""),
      );
    }
    return obj.parameter as T;
  }
  throw new Error(
    `Roboneo ${path}: ${lastErr || `HTTP ${lastStatus}`} setelah ${MAX_ATTEMPTS} percobaan` +
      (lastRaw ? ` — ${lastRaw.slice(0, 200)}` : ""),
  );
}

/* --------------------------------- calls ----------------------------------- */

/**
 * Structural validator. The Meitu gateway rejects our reverse-engineered probe
 * (empty `task_ids`) with `token error` even for tokens that work fine on
 * roboneo.com — the endpoint requires device/session fingerprint we can't
 * replicate from a server. So we validate the token *shape* instead: `_v2`
 * prefix + base64 payload of `<hash>#<ts>#<uid>#<n>#<hash>#ALI_YUN#BJ_HW#<sig>`.
 * Real validity surfaces the first time the token is used to submit a job.
 */
export async function checkRoboneoToken(
  accessToken: string,
): Promise<{ ok: boolean; message?: string }> {
  const trimmed = (accessToken || "").trim();
  if (!/^_v\d+/.test(trimmed)) {
    return { ok: false, message: "Format token salah (harus diawali _v2...)" };
  }
  try {
    let b64 = trimmed.replace(/^_v\d+/, "");
    b64 = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
    const decoded =
      typeof atob === "function"
        ? atob(b64)
        : Buffer.from(b64, "base64").toString("binary");
    const parts = decoded.split("#");
    if (parts.length < 6 || !/^\d+$/.test(parts[2] ?? "")) {
      return { ok: false, message: "Payload token tidak valid" };
    }
    const hasZeroUidField = parts[2] === "0";
    const ts = Number(parts[1]);
    if (Number.isFinite(ts) && ts > 0) {
      // Meitu timestamps observed as seconds; treat >180 days as likely expired.
      const ageDays = (Date.now() / 1000 - ts) / 86400;
      if (ageDays > 180) {
        return { ok: true, message: `Umur token ~${Math.round(ageDays)} hari — kemungkinan expired` };
      }
    }
    return {
      ok: true,
      message: hasZeroUidField
        ? "Struktur token valid; payload berisi uid=0 (format resmi Roboneo terbaru). Jika generate gagal 'Please log in first', ambil token dari request Network setelah benar-benar login."
        : undefined,
    };
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }
}


/**
 * Submit motion-control Kling job. Mengembalikan taskId untuk di-poll.
 * NB: Struktur nodeexecute mengikuti Roboneo web bundle: node_id wajib ada di
 * node dan root parameter, workflow_version=v2, need_node_name=true, dan tasks
 * dikembalikan sebagai array.
 */
export async function submitRoboneoMotion(opts: {
  accessToken: string;
  imageUrl: string;
  videoUrl: string;
  prompt?: string;
  quality?: "std" | "pro";
  orientation?: "image" | "video";
}): Promise<string> {
  const roomId = genRoomId();
  const nodeId = uuid();
  const orientation = opts.orientation ?? "video";
  const node = {
    tool_abstract_name: { cn: "Motion Control", en: "Motion Control" },
    node_id: nodeId,
    name: "video_bonbon_motioncontrol_v26",
    parameters: {
      quality: opts.quality ?? "std",
      image_url: opts.imageUrl,
      video_url: opts.videoUrl,
      character_orientation: orientation,
      orientation,
      prompt: opts.prompt ?? "",
      random: `${Date.now()}-${Math.floor(10_000_000 + Math.random() * 89_999_999)}`,
    },
  };
  const result = await rnCall<{
    tasks?: Record<string, unknown> | Array<{ task_id?: string }>;
    task_ids?: string[];
  }>(
    "nodeexecute",
    opts.accessToken,
    {
      room_id: roomId,
      node_id: nodeId,
      need_node_name: true,
      workflow_version: "v2",
      node_list_array: [[node]],
    },
  );
  // task id bisa muncul sebagai key di `tasks` atau di `task_ids`.
  const ids = result?.task_ids?.length
    ? result.task_ids
    : Array.isArray(result?.tasks)
      ? result.tasks.map((task) => task.task_id).filter((id): id is string => Boolean(id))
      : Object.keys(result?.tasks || {});
  if (!ids.length) throw new Error("Roboneo: submit sukses tapi task_id tidak ditemukan");
  ROBONEO_TASK_CONTEXT.set(ids[0]!, { roomId, nodeId });
  return ids[0]!;
}

/**
 * Submit Roboneo image-to-video job. Parameter & apiName per model diambil
 * dari recipe flow_share resmi:
 *  - "rn:seedance-pro" → apiName `api_v1_outsourcing_img_to_video`
 *      params: ratio, resolution (480p/720p/1080p), video_duration (5/10/12)
 *      recipe: d56CL0CD7eVX
 *  - "rn:google-omni"  → apiName `video_barley_i2v_omni_flash`
 *      params: ratio, video_duration (5/10)  — tidak ada resolusi/sound
 *      recipe: 2mXIxsFvbfXw
 *  - "rn:kling-v26"    → apiName `video_bonbon_img2vid_v26`
 *      params: sound (on/off), video_duration (5/10) — tidak ada ratio
 *      recipe: xd_pUp8JDcE0
 */
export async function submitRoboneoI2V(opts: {
  accessToken: string;
  imageUrl: string;
  prompt?: string;
  modelKey?: string;            // preferred: full modelKey ("rn:seedance-pro" dst)
  modelVersion?: "v26" | "v21"; // legacy
  quality?: "std" | "pro";      // legacy — hanya untuk apiName kling lama
  ratio?: string;
  duration?: number;
  resolution?: string;          // seedance-pro only
  sound?: "on" | "off";         // kling-v26 only
}): Promise<string> {
  const roomId = genRoomId();
  const nodeId = uuid();

  const mk = (opts.modelKey || "").toLowerCase();
  // paramFamily = himpunan parameter yang diterima recipe di Meitu:
  //   "seedance"  → ratio + resolution + video_duration + sound
  //   "happyhorse"→ ratio + resolution + video_duration
  //   "kling3"    → ratio + video_duration + sound
  //   "kling26"   → sound + video_duration (recipe lama, tidak ada ratio)
  //   "omni"      → ratio + video_duration
  //   "legacy21"  → ratio + duration + quality
  type ParamFamily = "seedance" | "happyhorse" | "kling3" | "kling26" | "omni" | "legacy21";
  type Spec = { apiName: string; recipeCode?: string; toolLabel: string; family: ParamFamily };
  const specs: Record<string, Spec> = {
    // Confirmed dari model_list resmi Roboneo (session token user).
    "rn:seedance-1.0": {
      apiName: "api_v1_outsourcing_img_to_video",
      recipeCode: "d56CL0CD7eVX",
      toolLabel: "Seedance 1.0",
      family: "seedance",
    },
    // Alias lama (backward-compat)
    "rn:seedance-pro": {
      apiName: "api_v1_outsourcing_img_to_video",
      recipeCode: "d56CL0CD7eVX",
      toolLabel: "Seedance Pro",
      family: "seedance",
    },
    "rn:seedance-2.0": {
      apiName: "video_toffee_i2v_v20",
      toolLabel: "Seedance 2.0",
      family: "seedance",
    },
    "rn:seedance-2.0-mini": {
      apiName: "video_toffee_i2v_v20_mini",
      toolLabel: "Seedance 2.0 Mini",
      family: "seedance",
    },
    "rn:seedance-2.0-fast": {
      apiName: "video_toffee_i2v_v20_fast",
      toolLabel: "Seedance 2.0 Fast",
      family: "seedance",
    },
    "rn:happyhorse-1.1": {
      apiName: "images2video_edit_hydra",
      toolLabel: "Happy Horse 1.1",
      family: "happyhorse",
    },
    "rn:happyhorse-1.0": {
      apiName: "video_happyhorse_i2v",
      toolLabel: "Happy Horse 1.0",
      family: "happyhorse",
    },
    "rn:kling-v3": {
      apiName: "video_bonbon_img2vid_v30",
      toolLabel: "Kling 3.0",
      family: "kling3",
    },
    "rn:kling-v3-turbo": {
      apiName: "video_bonbon_i2v_v3turbo",
      toolLabel: "Kling 3.0 Turbo",
      family: "kling3",
    },
    "rn:google-omni": {
      apiName: "video_barley_i2v_omni_flash",
      recipeCode: "2mXIxsFvbfXw",
      toolLabel: "Google Omni",
      family: "omni",
    },
    "rn:kling-v26:std": {
      apiName: "video_bonbon_img2vid_v26",
      recipeCode: "xd_pUp8JDcE0",
      toolLabel: "Kling 2.6",
      family: "kling26",
    },
    "rn:kling-v26": {
      apiName: "video_bonbon_img2vid_v26",
      recipeCode: "xd_pUp8JDcE0",
      toolLabel: "Kling 2.6",
      family: "kling26",
    },
    // legacy fallbacks (nama apiName lama — mungkin sudah tidak dilayani gateway)
    "rn:kling-v21": { apiName: "video_bonbon_kling_v21", toolLabel: "Kling 2.1", family: "legacy21" },
    "rn:kling-v21:std": { apiName: "video_bonbon_kling_v21", toolLabel: "Kling 2.1", family: "legacy21" },
  };
  const legacyFallback: Spec =
    opts.modelVersion === "v21"
      ? { apiName: "video_bonbon_kling_v21", toolLabel: "Kling 2.1", family: "legacy21" }
      : {
          apiName: "video_bonbon_img2vid_v26",
          recipeCode: "xd_pUp8JDcE0",
          toolLabel: "Kling 2.6",
          family: "kling26",
        };
  const spec = specs[mk] || legacyFallback;

  const params: Record<string, unknown> = {
    image_url: opts.imageUrl,
    prompt: opts.prompt ?? "",
    random: `${Date.now()}-${Math.floor(10_000_000 + Math.random() * 89_999_999)}`,
  };

  const dur = opts.duration ?? 5;
  switch (spec.family) {
    case "seedance":
      params.ratio = opts.ratio ?? "9:16";
      params.resolution = opts.resolution ?? "720p";
      params.video_duration = dur;
      params.sound = opts.sound ?? "off";
      break;
    case "happyhorse":
      params.ratio = opts.ratio ?? "9:16";
      params.resolution = opts.resolution ?? "720p";
      params.video_duration = dur;
      break;
    case "kling3":
      params.ratio = opts.ratio ?? "9:16";
      params.video_duration = dur;
      params.sound = opts.sound ?? "off";
      break;
    case "omni":
      params.ratio = opts.ratio ?? "9:16";
      params.video_duration = dur;
      break;
    case "kling26":
      params.sound = opts.sound ?? "off";
      params.video_duration = dur;
      break;
    case "legacy21":
    default:
      params.ratio = opts.ratio ?? "9:16";
      params.duration = dur;
      params.quality = opts.quality ?? "std";
      break;
  }
  if (spec.recipeCode) params.recipe_code = spec.recipeCode;

  const node = {
    tool_abstract_name: { cn: spec.toolLabel, en: spec.toolLabel },
    node_id: nodeId,
    name: spec.apiName,
    parameters: params,
  };
  const result = await rnCall<{
    tasks?: Record<string, unknown> | Array<{ task_id?: string }>;
    task_ids?: string[];
  }>("nodeexecute", opts.accessToken, {
    room_id: roomId,
    node_id: nodeId,
    need_node_name: true,
    workflow_version: "v2",
    node_list_array: [[node]],
  });
  const ids = result?.task_ids?.length
    ? result.task_ids
    : Array.isArray(result?.tasks)
      ? result.tasks.map((task) => task.task_id).filter((id): id is string => Boolean(id))
      : Object.keys(result?.tasks || {});
  if (!ids.length) throw new Error("Roboneo: submit sukses tapi task_id tidak ditemukan");
  ROBONEO_TASK_CONTEXT.set(ids[0]!, { roomId, nodeId });
  return ids[0]!;
}


export type RoboneoTask = {
  status?: string;
  state?: string;
  progress?: number;
  media_info_list?: Array<{ url?: string; media_url?: string }>;
  last_image_url?: string;
  last_image_urls?: string[];
  initial_transferred_urls?: string[];
  media_meta?: unknown;
  steps?: Array<{
    state?: string;
    status?: string;
    output?: string;
    error_message?: string;
    error_msg?: string;
    fail_code?: string;
  }>;
  error_message?: string;
  error_code?: number;
  error_msg?: string;
};

/** Poll status task. Return output URL saat sukses. */
export async function pollRoboneoTask(opts: {
  accessToken: string;
  taskId: string;
  timeoutMs?: number;
  onProgress?: (pct: number, status: string) => void;
}): Promise<string> {
  const start = Date.now();
  const tm = opts.timeoutMs ?? 1_800_000;
  const taskContext = ROBONEO_TASK_CONTEXT.get(opts.taskId);
  const parseMaybeJson = (value: unknown): unknown => {
    if (typeof value !== "string") return value;
    const trimmed = value.trim();
    if (!trimmed) return value;
    if (!trimmed.startsWith("{") && !trimmed.startsWith("[") && !trimmed.startsWith('"')) return value;
    try {
      const parsed = JSON.parse(trimmed);
      return typeof parsed === "string" && parsed !== value ? parseMaybeJson(parsed) : parsed;
    } catch {
      return value;
    }
  };
  const collectUrlsFromText = (text: string): string[] => {
    const normalized = text
      .replace(/\\\//g, "/")
      .replace(/\\u002F/gi, "/")
      .replace(/&amp;/g, "&");
    const matches = normalized.match(/(?:https?:)?\/\/[^\s"'<>\\]+/gi) || [];
    return matches.map((url) => (url.startsWith("//") ? `https:${url}` : url).replace(/[),.;\]]+$/g, ""));
  };
  const collectMediaUrls = (value: unknown, acc: string[] = []): string[] => {
    value = parseMaybeJson(value);
    if (typeof value === "string") {
      if (/^https?:\/\//i.test(value)) acc.push(value);
      for (const url of collectUrlsFromText(value)) acc.push(url);
      return acc;
    }
    if (!value || typeof value !== "object") return acc;
    if (Array.isArray(value)) {
      for (const item of value) {
        collectMediaUrls(item, acc);
      }
      return acc;
    }
    const obj = value as Record<string, unknown>;
    for (const key of [
      "url",
      "uri",
      "src",
      "href",
      "last_image_url",
      "lastImageUrl",
      "media_url",
      "mediaUrl",
      "image_url",
      "imageUrl",
      "video_url",
      "videoUrl",
      "file_url",
      "fileUrl",
      "asset_url",
      "assetUrl",
      "origin_url",
      "originUrl",
      "original_url",
      "originalUrl",
      "preview_url",
      "previewUrl",
      "source_url",
      "sourceUrl",
      "output_url",
      "outputUrl",
      "download_url",
      "downloadUrl",
      "signed_url",
      "signedUrl",
      "play_url",
      "playUrl",
      "cover_url",
      "coverUrl",
    ]) {
      const candidate = obj[key];
      if (typeof candidate === "string") {
        if (/^https?:\/\//i.test(candidate)) acc.push(candidate);
        else if (/^\/\//.test(candidate)) acc.push(`https:${candidate}`);
        else for (const url of collectUrlsFromText(candidate)) acc.push(url);
      }
    }
    for (const nested of Object.values(obj)) {
      collectMediaUrls(nested, acc);
    }
    return acc;
  };
  const firstVideoLikeUrl = (...values: unknown[]): string | null => {
    const urls = Array.from(new Set(values.flatMap((value) => collectMediaUrls(value))));
    return (
      urls.find((url) => /\.(mp4|mov|webm|m4v)(\?|#|$)/i.test(url)) ||
      urls.find((url) => /video|mp4|mov|webm|m4v|vod|tos|myqcloud|aliyun|oss/i.test(url)) ||
      urls[0] ||
      null
    );
  };
  const findRoboneoErrorMessage = (value: unknown, depth = 0): string | null => {
    value = parseMaybeJson(value);
    if (depth > 8 || value == null) return null;
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (!trimmed || /^https?:\/\//i.test(trimmed)) return null;
      return trimmed;
    }
    if (typeof value !== "object") return null;
    const obj = value as Record<string, unknown>;
    for (const key of [
      "task_status_msg",
      "error_message",
      "error_msg",
      "message",
      "msg",
      "reason",
      "fail_reason",
      "fail_msg",
      "tips",
      "fail_code",
    ]) {
      const candidate = obj[key];
      if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        const found = findRoboneoErrorMessage(item, depth + 1);
        if (found) return found;
      }
      return null;
    }
    for (const nested of Object.values(obj)) {
      const found = findRoboneoErrorMessage(nested, depth + 1);
      if (found) return found;
    }
    return null;
  };
  // Recursively scan for a numeric "progress-like" field. Meitu gateway
  // has used `progress`, `percent`, `rate`, `schedule`, `process_rate` etc.
  const PROGRESS_HINTS = ["progress", "percent", "rate", "schedule", "process"];
  const findProgress = (value: unknown, depth = 0): number | null => {
    value = parseMaybeJson(value);
    if (depth > 6 || !value || typeof value !== "object") return null;
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const lk = k.toLowerCase();
      if (PROGRESS_HINTS.some((h) => lk.includes(h))) {
        const n = typeof v === "number" ? v : typeof v === "string" && /^\d+(\.\d+)?$/.test(v) ? Number(v) : NaN;
        if (Number.isFinite(n)) {
          // Normalize 0-1 to 0-100.
          const pct = n <= 1 ? n * 100 : n;
          if (pct >= 0 && pct <= 100) return pct;
        }
      }
    }
    for (const v of Object.values(value as Record<string, unknown>)) {
      const r = findProgress(v, depth + 1);
      if (r !== null) return r;
    }
    return null;
  };

  let loggedShape = false;
  let successNoUrlAttempts = 0;
  let transientPollErrors = 0;
  while (Date.now() - start < tm) {
    await new Promise((r) => setTimeout(r, 4000));
    let res: {
      tasks?: Record<string, RoboneoTask>;
      media_info_list?: Array<{ url?: string; media_url?: string }>;
    };
    try {
      res = await rnCall<{
        tasks?: Record<string, RoboneoTask>;
        media_info_list?: Array<{ url?: string; media_url?: string }>;
      }>("nodeexecutequery", opts.accessToken, {
        task_ids: [opts.taskId],
        ...(taskContext ? { room_id: taskContext.roomId, node_id: taskContext.nodeId, workflow_version: "v2" } : {}),
      });
      transientPollErrors = 0;
    } catch (e) {
      const msg = (e as Error).message || String(e);
      // Transient upstream (5xx / reset) — keep polling; the task is still
      // running on Meitu's side. Give up after several consecutive failures.
      if (/HTTP (502|503|504|429)|upstream|connection termination|network/i.test(msg)) {
        transientPollErrors++;
        opts.onProgress?.(0, `retrying (${transientPollErrors})`);
        if (transientPollErrors >= 8) throw e;
        continue;
      }
      throw e;
    }
    const t = res?.tasks?.[opts.taskId] || ({} as RoboneoTask);
    const steps = Array.isArray(t.steps) ? t.steps : [];
    const step = steps.find((item) => /success|succeeded|completed|done|finished/i.test(String(item.status || item.state || ""))) || steps[0];
    const stepOutputs = steps.map((item) => parseMaybeJson(item.output));
    const stepOutput = parseMaybeJson(step?.output);
    const status = String(t.status || t.state || step?.status || step?.state || "").toLowerCase();
    // Prefer real progress field from the API; fall back to elapsed-time estimate.
    const realPct = findProgress(t) ?? findProgress(stepOutput) ?? findProgress(res);
    // Estimasi progres berdasar durasi rata-rata job Roboneo (~8 menit), bukan
    // timeout total. Pakai kurva log agar mendekati (tapi tidak mencapai) 94%
    // saat mendekati durasi ekspektasi, lalu melambat setelahnya.
    const EXPECTED_MS = 8 * 60_000;
    const elapsed = Date.now() - start;
    const ratio = elapsed / EXPECTED_MS;
    // easing: 1 - 1/(1+ratio) → 0..~0.9 dalam durasi ekspektasi, cap di 0.94.
    const eased = Math.min(0.94, 1 - 1 / (1 + ratio * 1.6));
    const fakePct = Math.round(5 + eased * 89);
    const pct = realPct !== null ? Math.round(realPct) : fakePct;
    if (!loggedShape && typeof console !== "undefined") {
      loggedShape = true;
      try {
        // eslint-disable-next-line no-console
        console.debug("[roboneo] first poll payload", {
          taskKeys: Object.keys(t),
          stepKeys: steps.map((item) => Object.keys(item)),
          resKeys: Object.keys(res || {}),
          realPct,
          status,
          urlCount: collectMediaUrls({ task: t, output: stepOutputs, response: res }).length,
          sample: JSON.stringify({ task: t, output: stepOutputs }).slice(0, 600),
        });
      } catch {
        /* ignore */
      }
    }
    opts.onProgress?.(pct, status || "processing");
    const media = t.media_info_list?.[0] || res?.media_info_list?.[0];
    const isSuccess = ["success", "succeeded", "completed", "done", "finished"].includes(status);
    const outputUrl = isSuccess
      ? firstVideoLikeUrl(
          t.last_image_url,
          t.last_image_urls,
          t.initial_transferred_urls,
          t.media_meta,
          media?.url,
          media?.media_url,
          stepOutputs,
          stepOutput,
          t,
          res,
        )
      : firstVideoLikeUrl(media?.url, media?.media_url);
    if (outputUrl) {
      ROBONEO_TASK_CONTEXT.delete(opts.taskId);
      return outputUrl;
    }
    if (isSuccess) {
      // Meitu sometimes marks the outer task "success" while an inner step
      // actually failed (e.g. per-account concurrent-job limit, transient
      // upstream error). Surface that step error so the caller can rotate
      // tokens instead of showing a confusing "no URL" message.
      const stepErr = steps
        .map((item) => {
          return (
            item.error_message ||
            item.error_msg ||
            findRoboneoErrorMessage(item.output) ||
            item.fail_code
          );
        })
        .find((v): v is string => Boolean(v));
      if (stepErr) {
        ROBONEO_TASK_CONTEXT.delete(opts.taskId);
        // Prefix with "quota" so isRoboneoRotatableError picks it up — most
        // real causes here (concurrency cap, credit, temporary account block)
        // benefit from switching to the next token.
        throw new Error(`Roboneo failed (quota/step): ${stepErr}`);
      }
      // Success flag can arrive a beat before the URL is written into
      // media_metas / last_image_urls. Give it a few extra polls before
      // giving up — the task will typically populate within 8–16s.
      if (successNoUrlAttempts < 5) {
        successNoUrlAttempts++;
        opts.onProgress?.(Math.max(pct, 96), "finalizing");
        continue;
      }
      ROBONEO_TASK_CONTEXT.delete(opts.taskId);
      const rawSample = (() => {
        try {
          return JSON.stringify({ task: t, stepOutputs, response: res }).slice(0, 1200);
        } catch {
          return "";
        }
      })();
      const debugKeys = JSON.stringify({
        taskKeys: Object.keys(t),
        stepKeys: steps.map((item) => Object.keys(item)),
        responseKeys: Object.keys(res || {}),
        urlCount: collectMediaUrls({ task: t, output: stepOutputs, response: res }).length,
        hasLastImageUrl: Boolean(t.last_image_url),
        hasLastImageUrls: Array.isArray(t.last_image_urls) ? t.last_image_urls.length : false,
        hasMediaMeta: Boolean(t.media_meta),
        hasMediaMetas: Boolean((t as Record<string, unknown>).media_metas),
      });
      throw new Error(
        `Roboneo credit/quota habis: task selesai tapi URL output tidak ditemukan (${debugKeys.slice(0, 400)}) sample=${rawSample}`,
      );
    }
    if (["fail", "failed", "error", "cancelled", "canceled"].includes(status)) {
      ROBONEO_TASK_CONTEXT.delete(opts.taskId);
      const parsedOutput = stepOutput && typeof stepOutput === "object" ? (stepOutput as Record<string, unknown>) : null;
      const message =
        t.error_message ||
        t.error_msg ||
        step?.error_message ||
        step?.error_msg ||
        (typeof parsedOutput?.error_message === "string" ? parsedOutput.error_message : undefined) ||
        (typeof parsedOutput?.error_msg === "string" ? parsedOutput.error_msg : undefined) ||
        findRoboneoErrorMessage(t) ||
        findRoboneoErrorMessage(stepOutput) ||
        findRoboneoErrorMessage(res) ||
        step?.fail_code ||
        "unknown";
      const debug = JSON.stringify({
        status,
        taskErrorCode: t.error_code,
        failCode: step?.fail_code,
        stepStatus: step?.status || step?.state,
        output: stepOutput,
      }).slice(0, 500);
      throw new Error(`Roboneo failed: ${message}${debug ? ` · detail=${debug}` : ""}`);
    }
  }
  throw new Error("Roboneo timeout");
}

/** Detect if an error looks like an auth/credit failure worth rotating tokens for. */
export function isRoboneoRotatableError(msg: string): boolean {
  return (
    /token|auth|log\s*in|login|expired|unauth|401|403|insufficient|balance|credit|quota|URL output tidak ditemukan|output tidak ditemukan|no output URL|CHARGE_FAILED|charge.?failed|payment.?required|余额不足|余额不够|积分不足|账户余额|欠费|VIP|会员/i.test(
      msg,
    )
  );
}

/**
 * Fetch Roboneo credit/membership info via `/api/commerce/membership_info`.
 * Endpoint: https://agent-api-roboneo.meitu.com/api/commerce/membership_info
 * Response shape typically:
 *   { error_code, error_msg, data: { credit, free_credit, vip_credit, ...vip_info } }
 * We scan recursively for numeric fields hinting at credit/balance/point.
 */
export async function fetchRoboneoBalance(
  accessToken: string,
): Promise<{
  ok: boolean;
  balance: number | null;
  free?: number | null;
  vip?: number | null;
  message?: string;
}> {
  try {
    const r = await fetch("/api/public/roboneo-membership", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Roboneo-Token": accessToken,
      },
    });
    const wrap = (await r.json().catch(() => null)) as {
      ok?: boolean;
      status?: number;
      data?: { error_code?: number; error_msg?: string; data?: unknown } | null;
      raw?: string;
    } | null;
    if (!wrap?.ok) {
      return {
        ok: false,
        balance: null,
        message: `HTTP ${wrap?.status ?? r.status}${wrap?.raw ? ` — ${wrap.raw.slice(0, 200)}` : ""}`,
      };
    }
    const obj = wrap.data ?? {};
    const errorCode = obj.error_code ?? (obj as { code?: number }).code;
    if (errorCode && errorCode !== 0) {
      return {
        ok: false,
        balance: null,
        message: obj.error_msg || (obj as { message?: string }).message || `error_code=${errorCode}`,
      };
    }
    const payload = (obj.data ?? (obj as { result?: unknown }).result ?? obj) as unknown;

    const pickNum = (o: unknown, keys: string[]): number | null => {
      if (!o || typeof o !== "object") return null;
      for (const [k, v] of Object.entries(o as Record<string, unknown>)) {
        const lk = k.toLowerCase();
        if (keys.some((h) => lk === h || lk.includes(h))) {
          if (typeof v === "number") return v;
          if (typeof v === "string" && /^-?\d+(\.\d+)?$/.test(v)) return Number(v);
        }
      }
      for (const v of Object.values(o as Record<string, unknown>)) {
        if (v && typeof v === "object") {
          const r = pickNum(v, keys);
          if (r !== null) return r;
        }
      }
      return null;
    };

    const pickDetailBalance = (o: unknown, titleHint: RegExp): number | null => {
      if (!o || typeof o !== "object") return null;
      const detailList = (o as { detail_list?: unknown }).detail_list;
      if (Array.isArray(detailList)) {
        for (const item of detailList) {
          if (!item || typeof item !== "object") continue;
          const title = String((item as { title?: unknown }).title ?? "");
          if (!titleHint.test(title)) continue;
          const balances = (item as { meiye_balance_list?: unknown }).meiye_balance_list;
          if (!Array.isArray(balances)) continue;
          for (const balanceItem of balances) {
            if (!balanceItem || typeof balanceItem !== "object") continue;
            const raw = (balanceItem as { left_info?: unknown }).left_info;
            if (typeof raw === "number") return raw;
            if (typeof raw === "string") {
              const normalized = raw.replace(/,/g, "").trim();
              if (/^-?\d+(\.\d+)?$/.test(normalized)) return Number(normalized);
            }
          }
        }
      }
      for (const v of Object.values(o as Record<string, unknown>)) {
        if (v && typeof v === "object") {
          const found = pickDetailBalance(v, titleHint);
          if (found !== null) return found;
        }
      }
      return null;
    };

    const cyberCarrots = pickDetailBalance(payload, /cyber|carrot/i);
    const dailyFree = pickDetailBalance(payload, /daily|free/i);
    const free = pickNum(payload, ["free_credit", "free_amount", "daily_free", "free"]) ?? dailyFree;
    const vip = pickNum(payload, ["vip_credit", "vip_amount", "vip"]);
    const total =
      pickNum(payload, ["total_amount", "total_credit", "credit_balance", "balance", "credit", "remain", "point", "coin", "energy", "quota"]) ??
      cyberCarrots ??
      ((free ?? 0) + (vip ?? 0) || null);

    return {
      ok: true,
      balance: total,
      free,
      vip,
      message: total !== null ? `Cyber Carrots ${total}${free !== null ? ` · Daily free ${free}` : ""}` : undefined,
    };
  } catch (e) {
    return { ok: false, balance: null, message: (e as Error).message };
  }
}
