// Server proxy for Dola (www.dola.com — ByteDance "samantha"/Doubao web stack).
//
// Browser tidak bisa memanggil www.dola.com langsung (cookie session + CORS),
// jadi semua request diteruskan dari edge memakai cookie string milik user
// (di-capture extension atau di-paste manual di Token Manager → Dola).
//
// Action yang didukung:
//   • completion   : kirim prompt (T2V / I2V) ke /chat/completion (SSE) dan
//                    kumpulkan URL video dari stream.
//   • poll         : tarik ulang chain pesan conversation untuk ambil video
//                    yang selesai render belakangan.
//   • upload-image : upload gambar ke ImageX (dipakai jalur image-to-video).
//   • ping         : cek cookie masih valid.
import { createFileRoute } from "@tanstack/react-router";

const DOLA = "https://www.dola.com";
const IMAGEX = "https://imagex-ap-southeast-1.bytevcloudapi.com";
const IMAGEX_SERVICE_ID = "uo7y4d541q";
const DOLA_BOT_ID = "7339470689562525703";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0";

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
  });
}

function cookieValue(cookie: string, name: string): string {
  const m = new RegExp(`(?:^|;\\s*)${name}=([^;]*)`).exec(cookie);
  return m?.[1] ? decodeURIComponent(m[1]) : "";
}

/** Extension menempelkan header STS ImageX ke cookie string sebagai
 *  `__imagex_sts=STS2<base64>`. Buang sebelum cookie dikirim ke dola.com. */
function stripSts(cookie: string): string {
  return cookie
    .split(/;\s*/)
    .filter((c) => c && !c.startsWith("__imagex_sts="))
    .join("; ");
}

/** STS2<base64 JSON> memuat AccessKeyId + SignedSecretAccessKey + ExpiredTime,
 *  jadi kredensial AWS4 bisa diturunkan langsung dari header browser. */
function credsFromStsToken(token: string): StsCreds | null {
  const raw = token.startsWith("STS2") ? token.slice(4) : token;
  try {
    const json = JSON.parse(atob(raw)) as Record<string, unknown>;
    const accessKeyId = String(json["AccessKeyId"] ?? "");
    const secret = String(json["SignedSecretAccessKey"] ?? json["SecretAccessKey"] ?? "");
    if (!accessKeyId || !secret) return null;
    const exp = Number(json["ExpiredTime"] ?? 0);
    if (exp && exp * 1000 < Date.now()) return null;
    return { AccessKeyId: accessKeyId, SecretAccessKey: secret, SessionToken: token };
  } catch {
    return null;
  }
}

function commonQuery(cookie: string): string {
  const webId = cookieValue(cookie, "ttwid") ? "" : "";
  void webId;
  const params: Record<string, string> = {
    version_code: "20800",
    language: "en-GB",
    device_platform: "web",
    doubao_device_platform: "web",
    aid: "495671",
    real_aid: "495671",
    pkg_type: "release_version",
    pc_version: "3.29.13",
    doubao_pc_version: "3.29.13",
    region: "SG",
    sys_region: "SG",
    samantha_web: "1",
    web_platform: "browser",
    "use-olympus-account": "1",
  };
  const msToken = cookieValue(cookie, "msToken");
  if (msToken) params["msToken"] = msToken;
  params["tz_name"] = "Asia/Jakarta";
  return new URLSearchParams(params).toString();
}

function dolaHeaders(cookie: string, extra: Record<string, string> = {}) {
  return {
    accept: "*/*",
    "accept-language": "en-GB,en;q=0.9",
    "agw-js-conv": "str",
    "content-type": "application/json",
    cookie: stripSts(cookie),
    origin: DOLA,
    referer: `${DOLA}/chat/`,
    "user-agent": UA,
    ...extra,
  };
}

const uuid = () =>
  "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });

/* ------------------------------- helpers -------------------------------- */

/** Cari semua URL media (mp4 / image) di dalam struktur JSON apa pun. */
function collectMedia(node: unknown, out: { videos: string[]; images: string[] }, depth = 0) {
  if (depth > 12 || node == null) return;
  if (typeof node === "string") {
    const trimmed = node.trim();
    if (/^https?:\/\/\S+\.(mp4|mov|webm)(\?|$)/i.test(trimmed)) {
      if (!out.videos.includes(trimmed)) out.videos.push(trimmed);
      return;
    }
    if (/^https?:\/\/\S+\.(png|jpe?g|webp)(\?|$)/i.test(trimmed)) {
      if (!out.images.includes(trimmed)) out.images.push(trimmed);
      return;
    }
    // Konten pesan Dola sering berupa JSON yang di-stringify.
    if ((trimmed.startsWith("{") || trimmed.startsWith("[")) && trimmed.length < 200_000) {
      try {
        collectMedia(JSON.parse(trimmed), out, depth + 1);
      } catch {
        /* ignore */
      }
    }
    return;
  }
  if (Array.isArray(node)) {
    for (const item of node) collectMedia(item, out, depth + 1);
    return;
  }
  if (typeof node === "object") {
    for (const v of Object.values(node as Record<string, unknown>)) collectMedia(v, out, depth + 1);
  }
}

/* ------------------------------ ImageX (i2v) ----------------------------- */

const enc = new TextEncoder();
async function hmac(key: ArrayBuffer | Uint8Array, data: string): Promise<ArrayBuffer> {
  const k = await crypto.subtle.importKey("raw", key as BufferSource, { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
  ]);
  return crypto.subtle.sign("HMAC", k, enc.encode(data));
}
const hex = (buf: ArrayBuffer) =>
  Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

/** AWS4 signature dengan SignedHeaders=x-amz-date;x-amz-security-token
 *  (persis seperti yang dipakai web Dola untuk ImageX). */
async function signImageX(opts: {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken: string;
  query: string;
  amzDate: string;
}): Promise<string> {
  const date = opts.amzDate.slice(0, 8);
  const region = "us-east-1";
  const service = "imagex";
  const signedHeaders = "x-amz-date;x-amz-security-token";
  const canonicalHeaders = `x-amz-date:${opts.amzDate}\nx-amz-security-token:${opts.sessionToken}\n`;
  const payloadHash = hex(await crypto.subtle.digest("SHA-256", enc.encode("")));
  const canonicalRequest = ["GET", "/", opts.query, canonicalHeaders, signedHeaders, payloadHash].join("\n");
  const scope = `${date}/${region}/${service}/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    opts.amzDate,
    scope,
    hex(await crypto.subtle.digest("SHA-256", enc.encode(canonicalRequest))),
  ].join("\n");
  let key: ArrayBuffer = await hmac(enc.encode(`AWS4${opts.secretAccessKey}`), date);
  key = await hmac(key, region);
  key = await hmac(key, service);
  key = await hmac(key, "aws4_request");
  const sig = hex(await hmac(key, stringToSign));

  return `AWS4-HMAC-SHA256 Credential=${opts.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${sig}`;
}

type StsCreds = { AccessKeyId: string; SecretAccessKey: string; SessionToken: string };

type ImageXUploadTarget = {
  host: string;
  uri: string;
  auth: string;
};

async function fetchUploadCreds(cookie: string): Promise<StsCreds | null> {
  // 1) Header STS asli dari browser (paling akurat) bila extension mengirimnya.
  const captured = cookieValue(cookie, "__imagex_sts");
  if (captured) {
    const creds = credsFromStsToken(captured);
    if (creds) return creds;
  }
  // 2) Fallback: minta STS upload lewat API Dola (stack Doubao/samantha).
  //    Response memakai snake_case (`access_key_id`, `secret_access_key`,
  //    `session_token`) atau CamelCase, tergantung endpoint.
  const attempts: { path: string; method: "GET" | "POST"; body?: unknown }[] = [
    { path: "/alice/upload/auth_token", method: "POST", body: { scene: "bot_chat" } },
    { path: "/alice/upload/auth_token", method: "GET" },
    { path: "/samantha/media/get_upload_token", method: "POST", body: { scene: 1 } },
    { path: "/alice/upload/upload_token", method: "POST", body: { scene: "bot_chat" } },
  ];
  for (const a of attempts) {
    try {
      const res = await fetch(`${DOLA}${a.path}?${commonQuery(cookie)}`, {
        method: a.method,
        headers: dolaHeaders(cookie),
        ...(a.method === "POST" ? { body: JSON.stringify(a.body ?? {}) } : {}),
      });
      if (!res.ok) continue;
      const text = await res.text();
      let data: unknown = null;
      try {
        data = JSON.parse(text);
      } catch {
        continue;
      }
      const creds = findCreds(data);
      if (creds) return creds;
      // Beberapa response hanya membawa string STS2… langsung.
      const m = /STS2[A-Za-z0-9+/=]+/.exec(text);
      if (m) {
        const fromSts = credsFromStsToken(m[0]);
        if (fromSts) return fromSts;
      }
    } catch {
      /* coba endpoint berikutnya */
    }
  }
  return null;
}

/** Cari pasangan kredensial AWS di dalam response apa pun (Camel/snake case). */
function findCreds(node: unknown, depth = 0): StsCreds | null {
  if (depth > 8 || !node || typeof node !== "object") return null;
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findCreds(item, depth + 1);
      if (found) return found;
    }
    return null;
  }
  const o = node as Record<string, unknown>;
  const pick = (...keys: string[]) => {
    for (const k of keys) if (typeof o[k] === "string" && o[k]) return String(o[k]);
    return "";
  };
  const id = pick("AccessKeyId", "access_key_id", "AccessKeyID");
  const secret = pick("SecretAccessKey", "secret_access_key", "SignedSecretAccessKey");
  const session = pick("SessionToken", "session_token", "CurrentTime");
  if (id && secret) return { AccessKeyId: id, SecretAccessKey: secret, SessionToken: session };
  for (const v of Object.values(o)) {
    const found = findCreds(v, depth + 1);
    if (found) return found;
  }
  return null;
}

/* CRC32 — header wajib pada upload ImageX. */
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  return table;
})();
function crc32(bytes: Uint8Array): string {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]!) & 0xff]! ^ (c >>> 8);
  return ((c ^ 0xffffffff) >>> 0).toString(16).padStart(8, "0");
}

async function authorizeImageUpload(cookie: string, fileSize: number, ext: string): Promise<Response> {
  const creds = await fetchUploadCreds(cookie);
  if (!creds) {
    return json(
      {
        ok: false,
        error:
          "upload_token_unavailable — token upload ImageX tidak ditemukan. Buka tab www.dola.com lalu kirim 1 gambar sekali agar extension menangkap header x-amz-security-token, kemudian Grab ulang tokennya.",
      },
      502,
    );
  }

  const amzDate = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  // Query harus urut byte-order (SigV4) — "s" (random) selalu terakhir.
  const params: [string, string][] = [
    ["Action", "ApplyImageUpload"],
    ["FileExtension", ext.startsWith(".") ? ext : `.${ext}`],
    ["FileSize", String(fileSize)],
    ["ServiceId", IMAGEX_SERVICE_ID],
    ["Version", "2018-08-01"],
    ["s", Math.random().toString(36).slice(2, 14)],
  ];
  const query = params
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");
  const authorization = await signImageX({
    accessKeyId: creds.AccessKeyId,
    secretAccessKey: creds.SecretAccessKey,
    sessionToken: creds.SessionToken,
    query,
    amzDate,
  });
  const applyRes = await fetch(`${IMAGEX}/?${query}`, {
    headers: {
      accept: "*/*",
      authorization,
      origin: DOLA,
      referer: `${DOLA}/`,
      "user-agent": UA,
      "x-amz-date": amzDate,
      "x-amz-security-token": creds.SessionToken,
    },
  });
  const applyText = await applyRes.text();
  let apply: {
    Result?: { UploadAddress?: { StoreInfos?: { StoreUri: string; Auth: string }[]; UploadHosts?: string[] } };
    ResponseMetadata?: { Error?: { Code?: string; Message?: string } };
  } | null = null;
  try {
    apply = JSON.parse(applyText);
  } catch {
    /* non-JSON */
  }
  const store = apply?.Result?.UploadAddress?.StoreInfos?.[0];
  const host = apply?.Result?.UploadAddress?.UploadHosts?.[0];
  if (!store || !host) {
    const err = apply?.ResponseMetadata?.Error;
    const detail = err?.Message || err?.Code || applyText.slice(0, 300) || `HTTP ${applyRes.status}`;
    const expired = /expire|token|denied|signature/i.test(detail);
    return json(
      {
        ok: false,
        error:
          `apply_upload_failed — ${detail}` +
          (expired
            ? " · Token upload ImageX kemungkinan kadaluarsa. Buka tab www.dola.com, kirim 1 gambar sekali, lalu Grab ulang token di extension."
            : ""),
      },
      502,
    );
  }

  const target: ImageXUploadTarget = { host, uri: store.StoreUri, auth: store.Auth };
  return json({ ok: true, upload: target });
}

async function uploadImage(cookie: string, bin: Uint8Array, ext: string) {
  const authorized = await authorizeImageUpload(cookie, bin.byteLength, ext);
  const result = (await authorized.clone().json().catch(() => null)) as {
    ok?: boolean;
    upload?: ImageXUploadTarget;
  } | null;
  if (!result?.ok || !result.upload) return authorized;

  const putRes = await fetch(`https://${result.upload.host}/upload/v1/${result.upload.uri}`, {
    method: "POST",
    headers: {
      Authorization: result.upload.auth,
      "Content-Type": "application/octet-stream",
      "Content-CRC32": crc32(bin),
    },
    body: bin as unknown as BodyInit,
  });
  if (!putRes.ok) return json({ ok: false, error: `upload_failed_${putRes.status}` }, 502);

  return json({ ok: true, uri: result.upload.uri });
}

/* ------------------------------- completion ------------------------------ */

async function completion(cookie: string, body: Record<string, unknown>) {
  const prompt = String(body["prompt"] ?? "");
  const imageUri = body["imageUri"] ? String(body["imageUri"]) : "";
  const conversationId = body["conversationId"] ? String(body["conversationId"]) : "0";
  const isNew = !conversationId || conversationId === "0";
  const model = String(body["model"] ?? "seedance_v2.0");
  const ratio = String(body["ratio"] ?? "9:16");
  const duration = Number(body["duration"] ?? 5) || 5;
  const imageWidth = Number(body["imageWidth"] ?? 0) || 0;
  const imageHeight = Number(body["imageHeight"] ?? 0) || 0;

  // Format persis seperti web Dola: message berisi content_block,
  // skill video dipilih lewat chat_ability (ability_type 17).
  const messages: unknown[] = [];
  if (imageUri) {
    messages.push({
      local_message_id: uuid(),
      content_block: [
        {
          block_type: 10052,
          content: {
            attachment_block: {
              attachments: [
                {
                  type: 1,
                  identifier: uuid(),
                  image: {
                    name: imageUri.split("/").pop() || "image.png",
                    uri: imageUri,
                    image_ori: { url: "", width: imageWidth, height: imageHeight, format: "", url_formats: {} },
                  },
                  parse_state: 0,
                  review_state: 1,
                  upload_status: 1,
                  progress: 100,
                  src: "",
                },
              ],
            },
            pc_event_block: "",
          },
          block_id: uuid(),
          parent_id: "",
          meta_info: [],
          append_fields: [],
        },
      ],
      message_status: 0,
    });
  }
  messages.push({
    local_message_id: uuid(),
    content_block: [
      {
        block_type: 10000,
        content: {
          text_block: { text: prompt, icon_url: "", icon_url_dark: "", summary: "" },
          pc_event_block: "",
        },
        block_id: uuid(),
        parent_id: "",
        meta_info: [],
        append_fields: [],
      },
    ],
    message_status: 0,
  });

  const collectId = uuid();
  const localConversationId = `local_${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const payload = {
    client_meta: {
      local_conversation_id: localConversationId,
      conversation_id: isNew ? "" : conversationId,
      bot_id: DOLA_BOT_ID,
      last_section_id: "",
      last_message_index: null,
    },
    messages,
    option: {
      send_message_scene: "",
      create_time_ms: Date.now(),
      collect_id: collectId,
      is_audio: false,
      answer_with_suggest: false,
      tts_switch: false,
      need_deep_think: 0,
      click_clear_context: false,
      from_suggest: false,
      is_regen: false,
      is_replace: false,
      is_from_click_option: false,
      is_from_click_softlink: false,
      disable_sse_cache: false,
      select_text_action: "",
      is_select_text: false,
      resend_for_regen: false,
      scene_type: 0,
      unique_key: uuid(),
      start_seq: 0,
      need_create_conversation: isNew,
      conversation_init_option: { need_ack_conversation: true },
      regen_query_id: [],
      edit_query_id: [],
      regen_instruction: "",
      no_replace_for_regen: false,
      message_from: 0,
      shared_app_name: "",
      shared_app_id: "",
      sse_recv_event_options: { support_chunk_delta: true },
      is_ai_playground: false,
      is_old_user: false,
      recovery_option: {
        is_recovery: false,
        req_create_time_sec: Math.floor(Date.now() / 1000),
        append_sse_event_scene: 0,
      },
      message_storage_type: 0,
    },
    chat_ability: {
      ability_type: 17,
      ability_param: JSON.stringify({ ratio, model, duration }),
    },
    user_context: [],
    ext: {
      answer_with_suggest: "0",
      sub_conv_firstmet_type: "1",
      collection_id: collectId,
      conversation_init_option: '{"need_ack_conversation":true}',
      commerce_credit_config_enable: "0",
    },
  };

  const res = await fetch(`${DOLA}/chat/completion?${commonQuery(cookie)}`, {
    method: "POST",
    headers: dolaHeaders(cookie, {
      accept: "*/*",
      "agw-js-conv": "str, str",
      "last-event-id": "undefined",
      referer: `${DOLA}/chat/${localConversationId}`,
    }),
    body: JSON.stringify(payload),
  });

  const text = await res.text();
  if (!res.ok) {
    return json({ ok: false, status: res.status, error: text.slice(0, 400) }, 200);
  }

  const media = { videos: [] as string[], images: [] as string[] };
  let convId = conversationId;
  for (const line of text.split("\n")) {
    if (!line.startsWith("data:")) continue;
    const raw = line.slice(5).trim();
    if (!raw || raw === "[DONE]") continue;
    let evt: unknown = null;
    try {
      evt = JSON.parse(raw);
    } catch {
      continue;
    }
    const asObj = evt as { conversation_id?: string; event_data?: string };
    if (asObj?.conversation_id) convId = String(asObj.conversation_id);
    collectMedia(evt, media);
  }
  // conversation_id kadang hanya muncul di dalam event_data.
  if (convId === "0") {
    const m = /"conversation_id"\s*:\s*"?(\d{6,})"?/.exec(text);
    if (m?.[1]) convId = m[1];
  }

  return json({
    ok: true,
    conversationId: convId,
    videos: media.videos,
    images: media.images,
    raw: media.videos.length === 0 ? text.slice(0, 2000) : undefined,
  });
}

/** Tarik ulang pesan terakhir sebuah conversation — video Dola sering selesai
 *  setelah stream completion ditutup. */
async function poll(cookie: string, conversationId: string) {
  const res = await fetch(`${DOLA}/im/chain/single?${commonQuery(cookie)}`, {
    method: "POST",
    headers: dolaHeaders(cookie, { "content-type": "application/json; encoding=utf-8" }),
    body: JSON.stringify({
      cmd: 3100,
      uplink_body: {
        pull_singe_chain_uplink_body: {
          conversation_id: conversationId,
          conversation_type: 3,
          direction: 1,
          limit: 20,
          ext: {},
          filter: { index_list: [] },
        },
      },
      sequence_id: uuid(),
      channel: 2,
      version: "1",
    }),
  });
  const data = (await res.json().catch(() => null)) as unknown;
  const media = { videos: [] as string[], images: [] as string[] };
  collectMedia(data, media);
  return json({ ok: res.ok, status: res.status, videos: media.videos, images: media.images });
}

async function ping(cookie: string) {
  const res = await fetch(`${DOLA}/im/chain/recent_conv?${commonQuery(cookie)}`, {
    method: "POST",
    headers: dolaHeaders(cookie, { "content-type": "application/json; encoding=utf-8" }),
    body: JSON.stringify({
      cmd: 3200,
      uplink_body: {
        pull_recent_conv_chain_uplink_body: {
          limit: 1,
          message_count_per_conv: 1,
          api_version: 1,
          conv_version: 0,
          direction: 3,
          option: { not_need_message: true },
        },
      },
      sequence_id: uuid(),
      channel: 2,
      version: "1",
    }),
  });
  const text = await res.text();
  const valid = res.ok && !/not\s*login|session.*(expired|invalid)/i.test(text);
  return json({ ok: valid, status: res.status, raw: valid ? undefined : text.slice(0, 300) });
}

/* --------------------------------- route --------------------------------- */

export const Route = createFileRoute("/api/public/dola")({
  server: {
    handlers: {
      OPTIONS: async () =>
        new Response(null, {
          status: 204,
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, X-Dola-Cookie",
          },
        }),
      POST: async ({ request }) => {
        const contentType = request.headers.get("content-type") || "";
        let cookie = request.headers.get("X-Dola-Cookie") || "";
        let body: Record<string, unknown> | null = null;
        let uploadBytes: Uint8Array | null = null;
        let uploadExt = ".png";
        if (contentType.includes("multipart/form-data")) {
          const form = await request.formData().catch(() => null);
          const image = form?.get("image");
          body = { action: String(form?.get("action") ?? "") };
          cookie = cookie || String(form?.get("cookie") ?? "");
          uploadExt = String(form?.get("ext") ?? ".png");
          if (image instanceof File) uploadBytes = new Uint8Array(await image.arrayBuffer());
        } else {
          body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
          cookie = cookie || String(body?.["_cookie"] ?? "");
        }
        const hasSession = /(?:^|;\s*)(sessionid|sessionid_ss|sid_tt|sid_guard|session_id|uid_tt)=/.test(cookie);
        if (!cookie || !hasSession) {
          return json({ ok: false, error: "Cookie session dola.com required" }, 400);
        }
        const action = String(body?.["action"] ?? "");
        try {
          if (action === "ping") return await ping(cookie);
          if (action === "completion") return await completion(cookie, body ?? {});
          if (action === "poll") return await poll(cookie, String(body?.["conversationId"] ?? ""));
          if (action === "authorize-upload") {
            const fileSize = Number(body?.["fileSize"] ?? 0);
            if (!Number.isSafeInteger(fileSize) || fileSize <= 0 || fileSize > 20 * 1024 * 1024) {
              return json({ ok: false, error: "invalid image size" }, 400);
            }
            return await authorizeImageUpload(cookie, fileSize, String(body?.["ext"] ?? ".png"));
          }
          if (action === "upload-image") {
            if (uploadBytes) return await uploadImage(cookie, uploadBytes, uploadExt);
            const base64 = String(body?.["base64"] ?? "");
            if (!base64) return json({ ok: false, error: "image file required" }, 400);
            const legacyBytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
            return await uploadImage(cookie, legacyBytes, String(body?.["ext"] ?? ".png"));
          }
          return json({ ok: false, error: "unknown action" }, 400);
        } catch (e) {
          return json({ ok: false, error: String((e as Error)?.message || e) }, 200);
        }
      },
    },
  },
});
