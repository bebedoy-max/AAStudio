// Server-only DOKU (Jokul) HTTP client.
// Docs: https://developers.doku.com/accept-payment/checkout
//
// Signature scheme:
//   digest        = base64( sha256(request_body_json) )
//   stringToSign  = "Client-Id:<v>\nRequest-Id:<v>\nRequest-Timestamp:<v>\nRequest-Target:<path>\nDigest:<digest>"
//                   (Digest line dilewati kalau body kosong / GET)
//   Signature hdr = "HMACSHA256=" + base64( HMAC-SHA256(secret_key, stringToSign) )
import { createHash, createHmac, randomUUID } from "node:crypto";

export type DokuEnv = "sandbox" | "production";

export type DokuConfig = {
  clientId: string;
  secretKey: string;
  environment: DokuEnv;
};

function baseUrl(env: DokuEnv) {
  return env === "production" ? "https://api.doku.com" : "https://api-sandbox.doku.com";
}

function sha256Base64(input: string) {
  return createHash("sha256").update(input, "utf8").digest("base64");
}

function isoTimestampNoMs(d: Date = new Date()) {
  return d.toISOString().replace(/\.\d{3}Z$/, "Z");
}

function buildSignature(params: {
  clientId: string;
  secretKey: string;
  requestId: string;
  timestamp: string;
  requestTarget: string;
  bodyJson: string | null;
}) {
  const lines = [
    `Client-Id:${params.clientId}`,
    `Request-Id:${params.requestId}`,
    `Request-Timestamp:${params.timestamp}`,
    `Request-Target:${params.requestTarget}`,
  ];
  if (params.bodyJson && params.bodyJson.length > 0) {
    lines.push(`Digest:${sha256Base64(params.bodyJson)}`);
  }
  const stringToSign = lines.join("\n");
  const mac = createHmac("sha256", params.secretKey).update(stringToSign, "utf8").digest("base64");
  return `HMACSHA256=${mac}`;
}

async function dokuRequest<T>(params: {
  cfg: DokuConfig;
  method: "GET" | "POST";
  path: string;
  body?: unknown;
}): Promise<{ ok: boolean; status: number; json: T; raw: string }> {
  const url = `${baseUrl(params.cfg.environment)}${params.path}`;
  const bodyJson = params.body != null ? JSON.stringify(params.body) : null;
  const requestId = randomUUID();
  const timestamp = isoTimestampNoMs();
  const signature = buildSignature({
    clientId: params.cfg.clientId,
    secretKey: params.cfg.secretKey,
    requestId,
    timestamp,
    requestTarget: params.path,
    bodyJson,
  });

  const res = await fetch(url, {
    method: params.method,
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "Client-Id": params.cfg.clientId,
      "Request-Id": requestId,
      "Request-Timestamp": timestamp,
      Signature: signature,
    },
    body: bodyJson ?? undefined,
  });
  const raw = await res.text();
  let json: unknown = null;
  try {
    json = raw ? JSON.parse(raw) : null;
  } catch {
    json = null;
  }
  return { ok: res.ok, status: res.status, json: json as T, raw };
}

export type DokuCheckoutResult = {
  invoiceNumber: string;
  paymentUrl: string;
  expiresAt: string | null; // ISO
  raw: unknown;
};

export async function createDokuCheckout(params: {
  cfg: DokuConfig;
  invoiceNumber: string;
  amountIdr: number;
  itemName: string;
  callbackUrl?: string;
  notificationUrl?: string;
  paymentMethodTypes?: string[]; // batasi metode; kalau kosong DOKU tampilkan semua
  expiryMinutes?: number;
}): Promise<DokuCheckoutResult> {
  const body: Record<string, unknown> = {
    order: {
      amount: Math.round(params.amountIdr),
      invoice_number: params.invoiceNumber,
      line_items: [
        {
          name: (params.itemName || params.invoiceNumber).slice(0, 60),
          price: Math.round(params.amountIdr),
          quantity: 1,
        },
      ],
    },
    payment: {
      payment_due_date: params.expiryMinutes ?? 60,
    },
  };
  if (params.paymentMethodTypes && params.paymentMethodTypes.length > 0) {
    (body.payment as Record<string, unknown>).payment_method_types = params.paymentMethodTypes;
  }
  if (params.callbackUrl) body.callback_url = params.callbackUrl;
  if (params.notificationUrl) body.notification_url = params.notificationUrl;

  type Resp = {
    message?: string[] | string;
    response?: {
      order?: { invoice_number?: string };
      payment?: { url?: string; expired_date?: string; token_id?: string };
    };
  };
  const r = await dokuRequest<Resp>({
    cfg: params.cfg,
    method: "POST",
    path: "/checkout/v1/payment",
    body,
  });
  const invoice = r.json?.response?.order?.invoice_number ?? params.invoiceNumber;
  const url = r.json?.response?.payment?.url;
  if (!r.ok || !url) {
    const msg = Array.isArray(r.json?.message)
      ? r.json?.message.join("; ")
      : (r.json?.message ?? r.raw?.slice(0, 200) ?? `HTTP ${r.status}`);
    throw new Error(`DOKU checkout gagal: ${msg}`);
  }
  const expired = r.json?.response?.payment?.expired_date ?? null;
  return {
    invoiceNumber: invoice,
    paymentUrl: url,
    expiresAt: expired ? new Date(expired).toISOString() : null,
    raw: r.json,
  };
}

/**
 * Panggil endpoint status ringan. Kalau kredensial valid tapi invoice tidak
 * ada, DOKU balas 404 — kita anggap koneksi OK. 401 = kredensial salah.
 */
export async function pingDoku(cfg: DokuConfig): Promise<{ ok: boolean; status: number; message: string }> {
  const path = `/orders/v1/status/aa-conn-test-${Date.now()}`;
  const r = await dokuRequest<{ message?: string[] | string }>({
    cfg,
    method: "GET",
    path,
  });
  if (r.status === 401 || r.status === 403) {
    return { ok: false, status: r.status, message: `Kredensial DOKU ditolak (HTTP ${r.status})` };
  }
  if (r.status === 404 || r.status === 200) {
    return { ok: true, status: r.status, message: `Terkoneksi ke DOKU (${cfg.environment})` };
  }
  const msg = Array.isArray(r.json?.message) ? r.json?.message.join("; ") : (r.json?.message ?? r.raw?.slice(0, 160));
  return { ok: false, status: r.status, message: `DOKU HTTP ${r.status}: ${msg ?? "unknown"}` };
}

/**
 * Verify webhook notification signature.
 * DOKU mengirim header: Client-Id, Request-Id, Request-Timestamp, Signature.
 * requestTarget = path notifikasi (mis. "/api/public/doku/notification").
 */
export function verifyDokuNotificationSignature(params: {
  cfg: DokuConfig;
  headers: Headers;
  rawBody: string;
  requestTarget: string;
}): boolean {
  const clientId = params.headers.get("Client-Id") ?? params.headers.get("client-id") ?? "";
  const requestId = params.headers.get("Request-Id") ?? params.headers.get("request-id") ?? "";
  const timestamp =
    params.headers.get("Request-Timestamp") ?? params.headers.get("request-timestamp") ?? "";
  const signature = params.headers.get("Signature") ?? params.headers.get("signature") ?? "";
  if (!clientId || !requestId || !timestamp || !signature) return false;
  if (clientId !== params.cfg.clientId) return false;
  const expected = buildSignature({
    clientId: params.cfg.clientId,
    secretKey: params.cfg.secretKey,
    requestId,
    timestamp,
    requestTarget: params.requestTarget,
    bodyJson: params.rawBody || null,
  });
  // constant-time-ish compare
  if (expected.length !== signature.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  return diff === 0;
}

/**
 * Ambil konfigurasi DOKU aktif dari tabel payment_gateways.
 * Kalau `gatewayId` disediakan, ambil baris itu; jika tidak, ambil baris
 * DOKU aktif paling baru.
 */
export async function loadDokuConfig(gatewayId?: string): Promise<{
  cfg: DokuConfig;
  gatewayId: string;
} | null> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    type LooseClient = { from: (t: string) => any };
    const admin = supabaseAdmin as unknown as LooseClient;
    let q = admin
      .from("payment_gateways")
      .select("id, environment, config_ciphertext, is_active, provider")
      .eq("provider", "doku");
    if (gatewayId) q = q.eq("id", gatewayId);
    else q = q.eq("is_active", true).order("updated_at", { ascending: false }).limit(1);
    const { data } = await q.maybeSingle();
    const row = data as
      | { id: string; environment: string; config_ciphertext: string; is_active: boolean }
      | null;
    if (!row?.config_ciphertext) return null;
    const { decryptString } = await import("@/lib/tokens/crypto.server");
    const cfg = JSON.parse(await decryptString(row.config_ciphertext)) as Record<string, string>;
    if (!cfg.client_id || !cfg.secret_key) return null;
    return {
      gatewayId: row.id,
      cfg: {
        clientId: cfg.client_id,
        secretKey: cfg.secret_key,
        environment: row.environment === "production" ? "production" : "sandbox",
      },
    };
  } catch (e) {
    console.warn("[doku] loadDokuConfig error", e);
    return null;
  }
}
