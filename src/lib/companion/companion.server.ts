// Server-only helpers untuk Creative Studio Companion (Android GoPay listener).
//
// Alur:
//   1. Perangkat register pakai enrollment secret → dapat API token (Bearer).
//   2. Perangkat kirim notifikasi pembayaran → dicocokkan dengan pesanan pending
//      berdasarkan NOMINAL UNIK + JENDELA WAKTU.
//   3. Kalau cocok persis satu, perangkat memanggil /payment/paid → fulfill.
//
// Tidak ada auto-approve tanpa nominal yang cocok, dan kandidat ganda selalu
// ditolak (ambiguous) supaya tidak salah menandai pesanan lunas.

/** Jendela waktu pencocokan (menit) sejak pesanan dibuat. */
export const MATCH_WINDOW_MINUTES = 90;

type LooseClient = { from: (t: string) => any };

async function admin(): Promise<LooseClient> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as LooseClient;
}

export async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Token acak 48 byte (hex) — hanya dikembalikan sekali saat register. */
export function randomToken(): string {
  const bytes = new Uint8Array(48);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Bandingkan string dengan waktu konstan. */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export type CompanionDevice = {
  id: string;
  device_id: string;
  device_name: string | null;
  active: boolean;
};

/** Ambil perangkat dari header Authorization: Bearer <token>. */
export async function authenticateDevice(
  request: Request,
): Promise<CompanionDevice | null> {
  const header = request.headers.get("authorization") ?? request.headers.get("Authorization");
  if (!header?.toLowerCase().startsWith("bearer ")) return null;
  const token = header.slice(7).trim();
  if (!token) return null;

  const db = await admin();
  const { data } = await db
    .from("companion_devices")
    .select("id, device_id, device_name, active")
    .eq("token_hash", await sha256Hex(token))
    .maybeSingle();
  const device = data as CompanionDevice | null;
  if (!device || !device.active) return null;

  try {
    await db
      .from("companion_devices")
      .update({ last_seen_at: new Date().toISOString() })
      .eq("id", device.id);
  } catch {
    /* non-fatal */
  }
  return device;
}

/** Register / re-register perangkat. Mengembalikan API token baru. */
export async function registerDevice(input: {
  deviceId: string;
  deviceName?: string | null;
  androidVersion?: string | null;
}): Promise<{ token: string }> {
  const token = randomToken();
  const tokenHash = await sha256Hex(token);
  const db = await admin();
  const { error } = await db.from("companion_devices").upsert(
    {
      device_id: input.deviceId,
      device_name: input.deviceName ?? null,
      android_version: input.androidVersion ?? null,
      token_hash: tokenHash,
      active: true,
      last_seen_at: new Date().toISOString(),
    },
    { onConflict: "device_id" },
  );
  if (error) throw new Error(error.message ?? "register failed");
  return { token };
}

type PurchaseRow = {
  id: string;
  status: string;
  created_at: string;
  price_idr: number | null;
  temanqris_order_id: string | null;
  temanqris_total_amount: number | null;
  temanqris_expires_at: string | null;
  gopay_expected_amount: number | null;
};

/** Nominal yang dianggap sah untuk sebuah pesanan. */
function expectedAmounts(pr: PurchaseRow): number[] {
  const list = [pr.gopay_expected_amount, pr.temanqris_total_amount, pr.price_idr];
  return Array.from(new Set(list.filter((n): n is number => typeof n === "number" && n > 0)));
}

export type MatchResult =
  | { match: true; purchaseId: string; orderId: string }
  | { match: false; reason: "no_candidate" | "ambiguous" };

/**
 * Cocokkan nominal notifikasi dengan pesanan pending di jendela waktu.
 * Kandidat > 1 → ambiguous (ditolak) agar tidak salah lunas.
 */
export async function matchPurchaseByAmount(amount: number): Promise<MatchResult> {
  const db = await admin();
  const since = new Date(Date.now() - MATCH_WINDOW_MINUTES * 60_000).toISOString();
  const { data } = await db
    .from("purchase_requests")
    .select(
      "id, status, created_at, price_idr, temanqris_order_id, temanqris_total_amount, temanqris_expires_at, gopay_expected_amount",
    )
    .eq("status", "pending")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(200);

  const rows = ((data ?? []) as PurchaseRow[]).filter((pr) => {
    if (pr.temanqris_expires_at && new Date(pr.temanqris_expires_at).getTime() < Date.now()) {
      return false;
    }
    return expectedAmounts(pr).includes(amount);
  });

  if (rows.length === 0) return { match: false, reason: "no_candidate" };
  if (rows.length > 1) return { match: false, reason: "ambiguous" };
  const pr = rows[0]!;
  return { match: true, purchaseId: pr.id, orderId: pr.temanqris_order_id ?? pr.id };
}

/** Cari pesanan dari order_id yang dikirim perangkat (id internal atau order TemanQRIS). */
export async function findPurchaseByOrderId(orderId: string): Promise<{ id: string; status: string } | null> {
  const db = await admin();
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(orderId);
  const { data } = await db
    .from("purchase_requests")
    .select("id, status")
    .eq(isUuid ? "id" : "temanqris_order_id", orderId)
    .maybeSingle();
  return (data as { id: string; status: string } | null) ?? null;
}

/** Simpan log event; mengembalikan false kalau hash sudah pernah diproses. */
export async function recordEvent(input: {
  deviceId: string;
  amount: number;
  receivedAt: string | null;
  title: string | null;
  text: string | null;
  status: string;
  detail?: string | null;
  matchedPurchaseId?: string | null;
}): Promise<{ inserted: boolean; hash: string }> {
  const hash = await sha256Hex(
    `${input.deviceId}|${input.amount}|${input.receivedAt ?? ""}|${(input.title ?? "").slice(0, 80)}`,
  );
  const db = await admin();
  const { error } = await db.from("companion_events").insert({
    device_id: input.deviceId,
    event_hash: hash,
    amount: input.amount,
    notification_title: input.title,
    notification_text: input.text,
    received_at: input.receivedAt,
    status: input.status,
    detail: input.detail ?? null,
    matched_purchase_id: input.matchedPurchaseId ?? null,
  });
  return { inserted: !error, hash };
}

export async function updateEventStatus(hash: string, status: string, detail?: string) {
  const db = await admin();
  try {
    await db
      .from("companion_events")
      .update({ status, detail: detail ?? null })
      .eq("event_hash", hash);
  } catch {
    /* non-fatal */
  }
}
