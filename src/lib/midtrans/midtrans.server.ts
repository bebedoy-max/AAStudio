// Server-only Midtrans HTTP client + signature verification.
// Loaded dynamically from server functions and webhook route.
import { createHash } from "node:crypto";

function isProduction() {
  return (process.env.MIDTRANS_MODE ?? "production").toLowerCase() === "production";
}

export function midtransApiBase() {
  return isProduction() ? "https://api.midtrans.com" : "https://api.sandbox.midtrans.com";
}

function serverKey() {
  const key = process.env.MIDTRANS_SERVER_KEY;
  if (!key) throw new Error("MIDTRANS_SERVER_KEY not set");
  return key;
}

function authHeader() {
  const b64 = Buffer.from(serverKey() + ":", "utf8").toString("base64");
  return `Basic ${b64}`;
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

  const res = await fetch(`${midtransApiBase()}/v2/charge`, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      authorization: authHeader(),
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
  const res = await fetch(`${midtransApiBase()}/v2/${encodeURIComponent(orderId)}/status`, {
    headers: { accept: "application/json", authorization: authHeader() },
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
export function verifyNotificationSignature(payload: {
  order_id?: string;
  status_code?: string;
  gross_amount?: string;
  signature_key?: string;
}): boolean {
  if (!payload.signature_key || !payload.order_id || !payload.status_code || !payload.gross_amount) {
    return false;
  }
  const expected = createHash("sha512")
    .update(payload.order_id + payload.status_code + payload.gross_amount + serverKey())
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
