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
  return new URLSearchParams(params).toString();
}

function dolaHeaders(cookie: string, extra: Record<string, string> = {}) {
  return {
    accept: "*/*",
    "accept-language": "en-GB,en;q=0.9",
    "agw-js-conv": "str",
    "content-type": "application/json",
    cookie,
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

async function fetchUploadCreds(cookie: string): Promise<StsCreds | null> {
  const paths = ["/alice/upload/auth_token", "/samantha/media/get_upload_token", "/alice/upload/upload_token"];
  for (const p of paths) {
    try {
      const res = await fetch(`${DOLA}${p}?${commonQuery(cookie)}`, {
        method: "POST",
        headers: dolaHeaders(cookie),
        body: JSON.stringify({ scene: 1, service_id: IMAGEX_SERVICE_ID }),
      });
      if (!res.ok) continue;
      const data = (await res.json()) as unknown;
      const found: StsCreds[] = [];
      const walk = (n: unknown, d = 0) => {
        if (d > 8 || !n || typeof n !== "object") return;
        const o = n as Record<string, unknown>;
        if (typeof o["AccessKeyId"] === "string" && typeof o["SecretAccessKey"] === "string") {
          found.push({
            AccessKeyId: String(o["AccessKeyId"]),
            SecretAccessKey: String(o["SecretAccessKey"]),
            SessionToken: String(o["SessionToken"] ?? o["session_token"] ?? ""),
          });
        }
        for (const v of Object.values(o)) walk(v, d + 1);
      };
      walk(data);
      if (found[0]) return found[0];
    } catch {
      /* coba path berikutnya */
    }
  }
  return null;
}

async function uploadImage(cookie: string, base64: string, ext: string) {
  const creds = await fetchUploadCreds(cookie);
  if (!creds) return json({ ok: false, error: "upload_token_unavailable" }, 502);

  const bin = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const amzDate = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const query = new URLSearchParams({
    Action: "ApplyImageUpload",
    FileExtension: ext.startsWith(".") ? ext : `.${ext}`,
    FileSize: String(bin.byteLength),
    ServiceId: IMAGEX_SERVICE_ID,
    Version: "2018-08-01",
  }).toString();
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
  const apply = (await applyRes.json().catch(() => null)) as
    | { Result?: { UploadAddress?: { StoreInfos?: { StoreUri: string; Auth: string }[]; UploadHosts?: string[] } } }
    | null;
  const store = apply?.Result?.UploadAddress?.StoreInfos?.[0];
  const host = apply?.Result?.UploadAddress?.UploadHosts?.[0];
  if (!store || !host) return json({ ok: false, error: "apply_upload_failed", data: apply }, 502);

  const putRes = await fetch(`https://${host}/upload/v1/${store.StoreUri}`, {
    method: "POST",
    headers: {
      Authorization: store.Auth,
      "Content-Type": "application/octet-stream",
      "Content-CRC32": "",
    },
    body: bin as unknown as BodyInit,
  });
  if (!putRes.ok) return json({ ok: false, error: `upload_failed_${putRes.status}` }, 502);

  return json({ ok: true, uri: store.StoreUri });
}

/* ------------------------------- completion ------------------------------ */

async function completion(cookie: string, body: Record<string, unknown>) {
  const prompt = String(body["prompt"] ?? "");
  const imageUri = body["imageUri"] ? String(body["imageUri"]) : "";
  const conversationId = body["conversationId"] ? String(body["conversationId"]) : "0";

  const content: Record<string, unknown> = { text: prompt };
  if (imageUri) content["image_list"] = [{ image_uri: imageUri }];

  const payload = {
    messages: [
      {
        content: JSON.stringify(content),
        content_type: imageUri ? 2009 : 2001,
        attachments: [],
      },
    ],
    completion_option: {
      is_regen: false,
      with_suggest: false,
      need_create_conversation: conversationId === "0",
      launch_stage: 1,
      is_replace: false,
      is_delete: false,
      message_from: 0,
      event_id: "0",
    },
    conversation_id: conversationId,
    section_id: conversationId,
    local_conversation_id: `local_${Date.now()}`,
    local_message_id: uuid(),
  };

  const res = await fetch(`${DOLA}/chat/completion?${commonQuery(cookie)}`, {
    method: "POST",
    headers: dolaHeaders(cookie, { accept: "text/event-stream" }),
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
        const cookie = request.headers.get("X-Dola-Cookie") || "";
        if (!cookie || !/sessionid=/.test(cookie)) {
          return json({ ok: false, error: "X-Dola-Cookie (cookie session dola.com) required" }, 400);
        }
        const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
        const action = String(body?.["action"] ?? "");
        try {
          if (action === "ping") return await ping(cookie);
          if (action === "completion") return await completion(cookie, body ?? {});
          if (action === "poll") return await poll(cookie, String(body?.["conversationId"] ?? ""));
          if (action === "upload-image") {
            return await uploadImage(cookie, String(body?.["base64"] ?? ""), String(body?.["ext"] ?? ".png"));
          }
          return json({ ok: false, error: "unknown action" }, 400);
        } catch (e) {
          return json({ ok: false, error: String((e as Error)?.message || e) }, 200);
        }
      },
    },
  },
});
