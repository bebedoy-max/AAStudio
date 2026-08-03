// Server-only HTTP client untuk TemanQRIS (https://temanqris.com).
// Docs: https://temanqris.com/docs  •  Base URL: https://temanqris.com/api/qris
//
// Auth: header `X-API-Key: <api_key>` (ambil dari Dashboard → Settings).
// Alur yang dipakai aplikasi ini:
//   1. POST /generate      → QRIS dinamis (qr_image base64 + payment_link.link_code)
//   2. Customer scan & bayar, lalu klik "Sudah bayar"
//      → POST /api/pay/:link_code/confirm  (public, tanpa API key)
//      → status order jadi `awaiting_confirmation`, TemanQRIS kirim webhook
//   3. POST /orders/:orderId/verify  → status jadi `paid` (webhook payment.confirmed)
//   4. GET  /orders/:orderId         → polling status (pending/awaiting_confirmation/paid/expired/cancelled)
import { createHmac, timingSafeEqual } from "node:crypto";

const BASE = "https://temanqris.com/api/qris";
const PUBLIC_BASE = "https://temanqris.com/api/pay";
export const TEMANQRIS_SITE = "https://temanqris.com";

export type TemanQrisConfig = {
  apiKey: string;
  webhookSecret?: string;
  /** Kalau true, webhook `payment.awaiting_confirmation` langsung di-verify + fulfill. */
  autoVerify: boolean;
  /** Optional: ID QRIS statis spesifik kalau punya banyak. */
  qrisId?: number;
};

async function tq<T>(params: {
  cfg: TemanQrisConfig;
  method: "GET" | "POST" | "DELETE";
  path: string;
  body?: unknown;
}): Promise<{ ok: boolean; status: number; json: T | null; raw: string }> {
  const res = await fetch(`${BASE}${params.path}`, {
    method: params.method,
    headers: {
      "X-API-Key": params.cfg.apiKey,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: params.body != null ? JSON.stringify(params.body) : undefined,
  });
  const raw = await res.text();
  let json: unknown = null;
  try {
    json = raw ? JSON.parse(raw) : null;
  } catch {
    json = null;
  }
  return { ok: res.ok, status: res.status, json: json as T | null, raw };
}

function errMessage(r: { json: any; raw: string; status: number }) {
  return r.json?.message ?? r.json?.error ?? r.raw?.slice(0, 200) ?? `HTTP ${r.status}`;
}

export type TemanQrisCharge = {
  orderId: string;
  linkCode: string | null;
  qrImage: string | null; // data:image/png;base64,...
  qrisString: string | null;
  paymentUrl: string | null;
  amount: number;
  totalAmount: number;
  expiresAt: string | null; // ISO
  raw: unknown;
};

/** Buat QRIS dinamis (+ payment link) untuk satu order. */
export async function createTemanQrisCharge(params: {
  cfg: TemanQrisConfig;
  orderId: string; // max 30 chars
  amountIdr: number;
  description: string;
  webhookUrl?: string;
  callbackUrl?: string;
}): Promise<TemanQrisCharge> {
  type Resp = {
    success?: boolean;
    qris?: string;
    qr_image?: string;
    amount?: number;
    expires_at?: string;
    payment_link?: {
      link_code?: string;
      order_id?: string;
      url?: string;
      amount?: number;
      expires_at?: string;
    };
    message?: string;
  };
  const body: Record<string, unknown> = {
    amount: Math.round(params.amountIdr),
    order_id: params.orderId.slice(0, 30),
    description: params.description.slice(0, 120),
  };
  if (params.cfg.qrisId) body.qris_id = params.cfg.qrisId;
  if (params.webhookUrl) body.webhook_url = params.webhookUrl;
  if (params.callbackUrl) body.callback_url = params.callbackUrl;

  const r = await tq<Resp>({ cfg: params.cfg, method: "POST", path: "/generate", body });
  if (!r.ok || !r.json || (!r.json.qr_image && !r.json.qris)) {
    throw new Error(`TemanQRIS generate gagal: ${errMessage(r)}`);
  }
  const link = r.json.payment_link;
  const expires = link?.expires_at ?? r.json.expires_at ?? null;
  return {
    orderId: link?.order_id ?? params.orderId,
    linkCode: link?.link_code ?? null,
    qrImage: r.json.qr_image ?? null,
    qrisString: r.json.qris ?? null,
    paymentUrl: link?.url ? `${TEMANQRIS_SITE}${link.url}` : null,
    amount: Math.round(params.amountIdr),
    totalAmount: link?.amount ?? r.json.amount ?? Math.round(params.amountIdr),
    expiresAt: expires ? new Date(expires).toISOString() : null,
    raw: r.json,
  };
}

export type TemanQrisOrderStatus =
  "pending" | "awaiting_confirmation" | "paid" | "expired" | "cancelled";

export type TemanQrisOrder = {
  status: TemanQrisOrderStatus;
  isPaid: boolean;
  isExpired: boolean;
  amount: number | null;
  totalAmount: number | null;
  paidAt: string | null;
  raw: unknown;
};

export async function fetchTemanQrisOrder(
  cfg: TemanQrisConfig,
  orderId: string,
): Promise<TemanQrisOrder | null> {
  type Resp = {
    success?: boolean;
    order?: {
      order_id?: string;
      status?: string;
      is_paid?: boolean;
      is_expired?: boolean;
      amount?: number;
      total_amount?: number;
      paid_at?: string | null;
    };
  };
  const r = await tq<Resp>({
    cfg,
    method: "GET",
    path: `/orders/${encodeURIComponent(orderId)}`,
  });
  if (r.status === 404) return null;
  if (!r.ok || !r.json?.order) throw new Error(`TemanQRIS status gagal: ${errMessage(r)}`);
  const o = r.json.order;
  return {
    status: (o.status as TemanQrisOrderStatus) ?? "pending",
    isPaid: Boolean(o.is_paid) || o.status === "paid",
    isExpired: Boolean(o.is_expired) || o.status === "expired",
    amount: o.amount ?? null,
    totalAmount: o.total_amount ?? null,
    paidAt: o.paid_at ?? null,
    raw: r.json,
  };
}

/** Customer klik "Sudah bayar" → status jadi awaiting_confirmation (public endpoint). */
export async function claimTemanQrisPaid(linkCode: string): Promise<boolean> {
  try {
    const res = await fetch(`${PUBLIC_BASE}/${encodeURIComponent(linkCode)}/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Merchant-side verify → status jadi `paid` + webhook payment.confirmed. */
export async function verifyTemanQrisOrder(
  cfg: TemanQrisConfig,
  orderId: string,
  opts?: { payerName?: string; payerNote?: string },
): Promise<boolean> {
  const r = await tq<{ success?: boolean; error?: string; message?: string }>({
    cfg,
    method: "POST",
    path: `/orders/${encodeURIComponent(orderId)}/verify`,
    body: {
      payer_name: opts?.payerName ?? "AA Creative Studio",
      payer_note: opts?.payerNote ?? "Auto-verified oleh backend aplikasi",
    },
  });
  // "Order already verified" tetap dianggap sukses (idempotent).
  if (!r.ok) {
    const msg = String(errMessage(r)).toLowerCase();
    if (msg.includes("already")) return true;
    return false;
  }
  return true;
}

export async function cancelTemanQrisOrder(cfg: TemanQrisConfig, orderId: string) {
  await tq({ cfg, method: "POST", path: `/orders/${encodeURIComponent(orderId)}/cancel` });
}

/** Cek kredensial: GET /my-qris (juga memberi tahu apakah QRIS statis sudah diupload). */
export async function pingTemanQris(
  cfg: TemanQrisConfig,
): Promise<{ ok: boolean; message: string }> {
  type Resp = { success?: boolean; has_qris?: boolean; message?: string };
  const r = await tq<Resp>({ cfg, method: "GET", path: "/my-qris" });
  if (r.status === 401 || r.status === 403) {
    return { ok: false, message: `API Key TemanQRIS ditolak (HTTP ${r.status})` };
  }
  if (!r.ok) return { ok: false, message: `TemanQRIS HTTP ${r.status}: ${errMessage(r)}` };
  if (r.json?.has_qris === false) {
    return {
      ok: false,
      message:
        "API Key valid, tapi QRIS statis belum diupload. Upload sekali di dashboard TemanQRIS (atau POST /api/qris/upload).",
    };
  }
  return { ok: true, message: "Terkoneksi ke TemanQRIS — QRIS statis siap dipakai." };
}

/** Verifikasi header X-TemanQRIS-Signature: "sha256=<hmac hex of raw body>". */
export function verifyTemanQrisSignature(params: {
  secret: string;
  rawBody: string;
  signature: string | null;
}): boolean {
  if (!params.secret || !params.signature) return false;
  const expected =
    "sha256=" + createHmac("sha256", params.secret).update(params.rawBody, "utf8").digest("hex");
  const a = Buffer.from(params.signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** Ambil konfigurasi TemanQRIS aktif dari tabel payment_gateways. */
export async function loadTemanQrisConfig(gatewayId?: string): Promise<{
  cfg: TemanQrisConfig;
  gatewayId: string;
} | null> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    type LooseClient = { from: (t: string) => any };
    const admin = supabaseAdmin as unknown as LooseClient;
    let q = admin
      .from("payment_gateways")
      .select("id, environment, config_ciphertext, is_active, provider")
      .eq("provider", "temanqris");
    if (gatewayId) q = q.eq("id", gatewayId);
    else q = q.eq("is_active", true).order("updated_at", { ascending: false }).limit(1);
    const { data } = await q.maybeSingle();
    const row = data as { id: string; config_ciphertext: string } | null;
    if (!row?.config_ciphertext) return null;
    const { decryptString } = await import("@/lib/tokens/crypto.server");
    const cfg = JSON.parse(await decryptString(row.config_ciphertext)) as Record<string, string>;
    if (!cfg.api_key) return null;
    return {
      gatewayId: row.id,
      cfg: {
        apiKey: cfg.api_key,
        webhookSecret: cfg.webhook_secret || undefined,
        autoVerify:
          String(cfg.auto_verify ?? "")
            .trim()
            .toLowerCase() === "on",
        qrisId: cfg.qris_id ? Number(cfg.qris_id) || undefined : undefined,
      },
    };
  } catch (e) {
    console.warn("[temanqris] loadTemanQrisConfig error", e);
    return null;
  }
}
