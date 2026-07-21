// Server-only Midtrans HTTP client + signature verification.
// Loaded dynamically from server functions and webhook route.
//
// Sumber konfigurasi (server_key + environment) diprioritaskan dari tabel
// `payment_gateways` (provider='midtrans', is_active=true) yang dikelola
// admin lewat /admin/payments. Jika tidak ada baris aktif, fallback ke
// environment variables MIDTRANS_SERVER_KEY & MIDTRANS_MODE.
import { createHash } from "node:crypto";

type MidtransRuntimeConfig = {
  serverKey: string;
  isProduction: boolean;
  source: "db" | "env";
};

let _cached: { at: number; cfg: MidtransRuntimeConfig } | null = null;
const CACHE_MS = 30_000;

async function loadFromDb(): Promise<MidtransRuntimeConfig | null> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    type LooseClient = { from: (t: string) => any };
    const admin = supabaseAdmin as unknown as LooseClient;
    const { data } = await admin
      .from("payment_gateways")
      .select("environment, config_ciphertext, is_active")
      .eq("provider", "midtrans")
      .eq("is_active", true)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const row = data as { environment: string; config_ciphertext: string } | null;
    if (!row?.config_ciphertext) return null;
    const { decryptString } = await import("@/lib/tokens/crypto.server");
    const cfg = JSON.parse(await decryptString(row.config_ciphertext)) as Record<string, string>;
    if (!cfg.server_key) return null;
    return {
      serverKey: cfg.server_key,
      isProduction: row.environment === "production",
      source: "db",
    };
  } catch (e) {
    console.warn("[midtrans] gagal baca payment_gateways, fallback ke env", e);
    return null;
  }
}

function loadFromEnv(): MidtransRuntimeConfig | null {
  const key = process.env.MIDTRANS_SERVER_KEY;
  if (!key) return null;
  return {
    serverKey: key,
    isProduction: (process.env.MIDTRANS_MODE ?? "production").toLowerCase() === "production",
    source: "env",
  };
}

export async function getMidtransConfig(): Promise<MidtransRuntimeConfig> {
  if (_cached && Date.now() - _cached.at < CACHE_MS) return _cached.cfg;
  const cfg = (await loadFromDb()) ?? loadFromEnv();
  if (!cfg) {
    throw new Error(
      "Midtrans belum dikonfigurasi. Set di /admin/payments (payment_gateways) atau env MIDTRANS_SERVER_KEY.",
    );
  }
  _cached = { at: Date.now(), cfg };
  return cfg;
}

export function invalidateMidtransConfigCache() {
  _cached = null;
}

function apiBase(isProd: boolean) {
  return isProd ? "https://api.midtrans.com" : "https://api.sandbox.midtrans.com";
}

function authHeaderFor(serverKey: string) {
  const b64 = Buffer.from(serverKey + ":", "utf8").toString("base64");
  return `Basic ${b64}`;
}

/** @deprecated gunakan getMidtransConfig() */
export async function midtransApiBase() {
  const cfg = await getMidtransConfig();
  return apiBase(cfg.isProduction);
}

export type MidtransChargeResult = {
  order_id: string;
  transaction_id: string;
  gross_amount: string;
  qr_url: string;
  expiry_time: string | null;
  raw: unknown;
};

export async function createQrisCharge(params: {
  orderId: string;
  amountIdr: number;
  itemName: string;
  expiryMinutes?: number;
}): Promise<MidtransChargeResult> {
  const cfg = await getMidtransConfig();
  const expiry = params.expiryMinutes ?? 60; // default 1 jam
  const body = {
    payment_type: "qris",
    transaction_details: {
      order_id: params.orderId,
      gross_amount: Math.round(params.amountIdr),
    },
    qris: {
      acquirer: "gopay",
    },
    custom_expiry: {
      expiry_duration: expiry,
      unit: "minute",
    },
    item_details: [
      {
        id: params.orderId,
        price: Math.round(params.amountIdr),
        quantity: 1,
        name: params.itemName.slice(0, 50),
      },
    ],
  };

  const res = await fetch(`${apiBase(cfg.isProduction)}/v2/charge`, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      authorization: authHeaderFor(cfg.serverKey),
    },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as {
    status_code?: string;
    status_message?: string;
    transaction_id?: string;
    order_id?: string;
    gross_amount?: string;
    expiry_time?: string;
    actions?: { name: string; url: string }[];
  };
  const ok = res.ok && (json.status_code === "201" || json.status_code === "200");
  if (!ok) {
    throw new Error(`Midtrans charge failed: ${json.status_message ?? res.statusText}`);
  }
  const qr = json.actions?.find((a) => a.name === "generate-qr-code");
  if (!qr) throw new Error("Midtrans response missing QR URL");
  return {
    order_id: json.order_id!,
    transaction_id: json.transaction_id!,
    gross_amount: json.gross_amount!,
    qr_url: qr.url,
    expiry_time: json.expiry_time ?? null,
    raw: json,
  };
}

export async function fetchTransactionStatus(orderId: string) {
  const cfg = await getMidtransConfig();
  const res = await fetch(`${apiBase(cfg.isProduction)}/v2/${encodeURIComponent(orderId)}/status`, {
    headers: { accept: "application/json", authorization: authHeaderFor(cfg.serverKey) },
  });
  return (await res.json()) as {
    status_code?: string;
    transaction_status?: string;
    fraud_status?: string;
    order_id?: string;
    transaction_id?: string;
    gross_amount?: string;
    signature_key?: string;
    status_message?: string;
  };
}

/**
 * Midtrans notification signature = SHA512(order_id + status_code + gross_amount + server_key)
 */
export async function verifyNotificationSignature(payload: {
  order_id?: string;
  status_code?: string;
  gross_amount?: string;
  signature_key?: string;
}): Promise<boolean> {
  if (!payload.signature_key || !payload.order_id || !payload.status_code || !payload.gross_amount) {
    return false;
  }
  const cfg = await getMidtransConfig();
  const expected = createHash("sha512")
    .update(payload.order_id + payload.status_code + payload.gross_amount + cfg.serverKey)
    .digest("hex");
  return expected === payload.signature_key;
}

/**
 * Map Midtrans transaction_status → internal status.
 * settlement / capture (fraud=accept) => paid.
 */
export function midtransStatusToInternal(
  transactionStatus: string | undefined,
  fraudStatus: string | undefined,
): "paid" | "pending" | "failed" {
  if (!transactionStatus) return "pending";
  if (transactionStatus === "settlement") return "paid";
  if (transactionStatus === "capture" && (fraudStatus ?? "accept") === "accept") return "paid";
  if (["pending"].includes(transactionStatus)) return "pending";
  return "failed";
}
