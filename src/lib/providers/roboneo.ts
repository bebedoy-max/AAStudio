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

/** Roboneo access-tokens embed a uid in a base64 payload after the `_v2` prefix,
 * shape: `<hash>#<ts>#<uid>#<n>#<hash>#ALI_YUN#BJ_HW#<sig>`. Gateway rejects the
 * request (error_code 98 "token error") unless parameter.uid matches. */
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
const ROBONEO_TASK_ROOMS = new Map<string, string>();

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
  // Route through our edge proxy — Meitu gateway rejects Origin != roboneo.com.
  const r = await fetch(`/api/public/roboneo`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Roboneo-Token": accessToken,
    },
    body: JSON.stringify({ path, parameter }),
  });
  const wrap = (await r.json().catch(() => null)) as {
    ok?: boolean;
    status?: number;
    data?: { error_code?: number; error_msg?: string; parameter?: unknown } | null;
    raw?: string;
  } | null;
  const obj = wrap?.data ?? {};
  if (!wrap?.ok || (obj.error_code && obj.error_code !== 0)) {
    const message = obj.error_msg || `HTTP ${wrap?.status ?? r.status}`;
    throw new Error(
      `Roboneo ${path}: ${message}` +
        (message === "Please log in first" ? " — access-token Roboneo perlu login ulang" : "") +
        (wrap?.raw ? ` — ${wrap.raw.slice(0, 200)}` : ""),
    );
  }
  return obj.parameter as T;

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
    if (parts[2] === "0") {
      return { ok: false, message: "Token Roboneo belum login (uid=0). Login ulang di roboneo.com lalu ambil access-token baru." };
    }
    const ts = Number(parts[1]);
    if (Number.isFinite(ts) && ts > 0) {
      // Meitu timestamps observed as seconds; treat >180 days as likely expired.
      const ageDays = (Date.now() / 1000 - ts) / 86400;
      if (ageDays > 180) {
        return { ok: true, message: `Umur token ~${Math.round(ageDays)} hari — kemungkinan expired` };
      }
    }
    return { ok: true };
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
}): Promise<string> {
  const roomId = genRoomId();
  const nodeId = uuid();
  const node = {
    tool_abstract_name: { cn: "Motion Control", en: "Motion Control" },
    node_id: nodeId,
    name: "video_bonbon_motioncontrol_v26",
    parameters: {
      quality: opts.quality ?? "std",
      image_url: opts.imageUrl,
      video_url: opts.videoUrl,
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
  ROBONEO_TASK_ROOMS.set(ids[0]!, roomId);
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
  const roomId = ROBONEO_TASK_ROOMS.get(opts.taskId);
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
  while (Date.now() - start < tm) {
    await new Promise((r) => setTimeout(r, 4000));
    const res = await rnCall<{
      tasks?: Record<string, RoboneoTask>;
      media_info_list?: Array<{ url?: string; media_url?: string }>;
    }>("nodeexecutequery", opts.accessToken, {
      task_ids: [opts.taskId],
      ...(roomId ? { room_id: roomId } : {}),
    });
    const t = res?.tasks?.[opts.taskId] || ({} as RoboneoTask);
    const steps = Array.isArray(t.steps) ? t.steps : [];
    const step = steps.find((item) => /success|succeeded|completed|done|finished/i.test(String(item.status || item.state || ""))) || steps[0];
    const stepOutputs = steps.map((item) => parseMaybeJson(item.output));
    const stepOutput = parseMaybeJson(step?.output);
    const status = String(t.status || t.state || step?.status || step?.state || "").toLowerCase();
    // Prefer real progress field from the API; fall back to elapsed-time estimate.
    const realPct = findProgress(t) ?? findProgress(stepOutput) ?? findProgress(res);
    const fakePct = Math.min(94, 20 + Math.round(((Date.now() - start) / tm) * 74));
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
      ROBONEO_TASK_ROOMS.delete(opts.taskId);
      return outputUrl;
    }
    if (isSuccess) {
      ROBONEO_TASK_ROOMS.delete(opts.taskId);
      const debugKeys = JSON.stringify({
        taskKeys: Object.keys(t),
        stepKeys: steps.map((item) => Object.keys(item)),
        responseKeys: Object.keys(res || {}),
        urlCount: collectMediaUrls({ task: t, output: stepOutputs, response: res }).length,
        hasLastImageUrl: Boolean(t.last_image_url),
        hasMediaMeta: Boolean(t.media_meta),
      });
      throw new Error(`Roboneo: task selesai tapi URL output tidak ditemukan (${debugKeys.slice(0, 300)})`);
    }
    if (["fail", "failed", "error", "cancelled", "canceled"].includes(status)) {
      ROBONEO_TASK_ROOMS.delete(opts.taskId);
      const parsedOutput = stepOutput && typeof stepOutput === "object" ? (stepOutput as Record<string, unknown>) : null;
      const message =
        t.error_message ||
        t.error_msg ||
        step?.error_message ||
        step?.error_msg ||
        (typeof parsedOutput?.error_message === "string" ? parsedOutput.error_message : undefined) ||
        (typeof parsedOutput?.error_msg === "string" ? parsedOutput.error_msg : undefined) ||
        step?.fail_code ||
        "unknown";
      throw new Error("Roboneo failed: " + message);
    }
  }
  throw new Error("Roboneo timeout");
}

/** Detect if an error looks like an auth/credit failure worth rotating tokens for. */
export function isRoboneoRotatableError(msg: string): boolean {
  return /token|auth|log\s*in|login|expired|unauth|401|403|insufficient|balance|credit|quota/i.test(msg);
}

/**
 * Fetch VIP / credit info via `/roboneo/sync/request/vipshow`.
 * Response shape isn't fully documented — we recursively scan for a numeric
 * field whose key hints at "credit / balance / remain / quota / point".
 */
export async function fetchRoboneoBalance(
  accessToken: string,
): Promise<{ ok: boolean; balance: number | null; message?: string }> {
  try {
    const res = await rnCall<Record<string, unknown>>("vipshow", accessToken, {
      features: "",
      later_face: 0,
    });
    const findNum = (obj: unknown, hints: string[]): number | null => {
      if (!obj || typeof obj !== "object") return null;
      for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
        const lk = k.toLowerCase();
        if (typeof v === "number" && hints.some((h) => lk.includes(h))) return v;
        if (typeof v === "string" && /^\d+(\.\d+)?$/.test(v) && hints.some((h) => lk.includes(h)))
          return Number(v);
        if (v && typeof v === "object") {
          const r = findNum(v, hints);
          if (r !== null) return r;
        }
      }
      return null;
    };
    const bal = findNum(res, [
      "credit",
      "balance",
      "remain",
      "quota",
      "point",
      "coin",
      "energy",
    ]);
    return { ok: true, balance: bal };
  } catch (e) {
    return { ok: false, balance: null, message: (e as Error).message };
  }
}
