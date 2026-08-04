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
export const MATCH_WINDOW_MINUTES = 60;

/** Batas waktu pembayaran companion (menit) sebelum dibatalkan otomatis. */
export const COMPANION_EXPIRY_MINUTES = 60;

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

/**
 * Sidik jari pendek untuk debugging perbandingan rahasia tanpa membocorkan nilainya.
 * 8 hex pertama dari SHA-256 — cukup untuk membandingkan dua sisi, tidak cukup untuk dibalik.
 */
export async function shortFingerprint(value: string): Promise<string> {
  if (!value) return "-";
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .slice(0, 4)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
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
}, diagnostic?: {
  requestId: string;
  build: string;
}): Promise<{ token: string }> {
  const context = {
    requestId: diagnostic?.requestId ?? "untracked",
    build: diagnostic?.build ?? "untracked",
    deviceId: input.deviceId,
  };
  console.info("[companion/registerDevice]", { ...context, stage: "GENERATE_TOKEN_START" });
  const token = randomToken();
  const tokenHash = await sha256Hex(token);
  console.info("[companion/registerDevice]", {
    ...context,
    stage: "TOKEN_GENERATED",
    tokenLength: token.length,
    tokenFingerprint: await shortFingerprint(token),
    tokenHashFingerprint: tokenHash.slice(0, 8),
  });

  console.info("[companion/registerDevice]", { ...context, stage: "ADMIN_CLIENT_START" });
  const db = await admin();
  console.info("[companion/registerDevice]", { ...context, stage: "ADMIN_CLIENT_READY" });
  const response = await db.from("companion_devices").upsert(
    {
      device_id: input.deviceId,
      device_name: input.deviceName ?? null,
      android_version: input.androidVersion ?? null,
      token_hash: tokenHash,
      active: true,
      last_seen_at: new Date().toISOString(),
    },
    { onConflict: "device_id" },
  ).select("id, device_id, token_hash, active").single();
  const row = response.data as {
    id?: string;
    device_id?: string;
    token_hash?: string;
    active?: boolean;
  } | null;
  console.info("[companion/registerDevice]", {
    ...context,
    stage: "SUPABASE_RESPONSE",
    status: response.status,
    statusText: response.statusText,
    hasError: Boolean(response.error),
    error: response.error
      ? {
          code: response.error.code,
          message: response.error.message,
          details: response.error.details,
          hint: response.error.hint,
        }
      : null,
    persisted: Boolean(row?.id),
    persistedDeviceId: row?.device_id,
    active: row?.active,
    tokenHashMatches: row?.token_hash === tokenHash,
    storedTokenHashFingerprint: row?.token_hash?.slice(0, 8),
  });
  if (response.error) {
    throw new Error(
      `companion_devices upsert failed (${response.error.code ?? "unknown"}): ${response.error.message ?? "register failed"}`,
    );
  }
  if (!row?.id || row.token_hash !== tokenHash) {
    throw new Error("companion_devices upsert could not be verified");
  }
  console.info("[companion/registerDevice]", { ...context, stage: "REGISTER_DEVICE_SUCCESS" });
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
  // Kalau pesanan sudah punya nominal unik GoPay, HANYA nominal itu yang sah —
  // fallback ke price_idr justru bikin dua order harga sama jadi ambiguous.
  if (typeof pr.gopay_expected_amount === "number" && pr.gopay_expected_amount > 0) {
    return [pr.gopay_expected_amount];
  }
  const list = [pr.temanqris_total_amount, pr.price_idr];
  return Array.from(new Set(list.filter((n): n is number => typeof n === "number" && n > 0)));
}

/** Rentang kode unik yang ditambahkan ke harga dasar (Rp1 – Rp99). */
const UNIQUE_CODE_MAX = 99;

/**
 * Tentukan nominal unik untuk pembayaran GoPay Merchant: harga dasar + kode
 * unik kecil yang belum dipakai pesanan pending lain di jendela pencocokan.
 * Idempotent — kalau pesanan sudah punya nominal, nilai itu dikembalikan.
 */
export async function assignUniqueGopayAmount(
  purchaseId: string,
): Promise<{ amount: number; base: number; code: number } | null> {
  const db = await admin();
  const { data: row } = await db
    .from("purchase_requests")
    .select("id, status, price_idr, gopay_expected_amount")
    .eq("id", purchaseId)
    .maybeSingle();
  const pr = row as { price_idr: number | null; gopay_expected_amount: number | null } | null;
  if (!pr) return null;
  const base = typeof pr.price_idr === "number" ? Math.round(pr.price_idr) : 0;
  if (base <= 0) return null;
  if (typeof pr.gopay_expected_amount === "number" && pr.gopay_expected_amount > 0) {
    return {
      amount: pr.gopay_expected_amount,
      base,
      code: pr.gopay_expected_amount - base,
    };
  }

  // Ambil kode pada siklus aktif. Karena sebuah siklus tidak mengandung
  // duplikat, kemunculan duplikat pertama saat membaca dari terbaru ke lama
  // menandai batas dengan siklus sebelumnya.
  const since = new Date(Date.now() - MATCH_WINDOW_MINUTES * 60_000).toISOString();
  const { data: pending } = await db
    .from("purchase_requests")
    .select("gopay_expected_amount")
    .eq("status", "pending")
    .gte("created_at", since)
    .not("gopay_expected_amount", "is", null)
    .limit(1000);
  const takenAmounts = new Set(
    ((pending ?? []) as { gopay_expected_amount: number | null }[])
      .map((r) => r.gopay_expected_amount)
      .filter((n): n is number => typeof n === "number"),
  );

  const { data: history } = await db
    .from("purchase_requests")
    .select("price_idr, gopay_expected_amount, created_at")
    .not("gopay_expected_amount", "is", null)
    .order("created_at", { ascending: false })
    .limit(UNIQUE_CODE_MAX + 1);
  const histRows = (history ?? []) as {
    price_idr: number | null;
    gopay_expected_amount: number | null;
  }[];
  const usedCodes = new Set<number>();
  for (const r of histRows) {
    const c = Math.round((r.gopay_expected_amount ?? 0) - (r.price_idr ?? 0));
    if (c < 1 || c > UNIQUE_CODE_MAX) continue;
    if (usedCodes.has(c)) break;
    usedCodes.add(c);
  }
  // Seluruh 1..99 sudah terpakai tepat satu kali → mulai siklus acak baru.
  if (usedCodes.size >= UNIQUE_CODE_MAX) usedCodes.clear();

  const candidates: number[] = [];
  for (let cand = 1; cand <= UNIQUE_CODE_MAX; cand++) {
    if (!usedCodes.has(cand) && !takenAmounts.has(base + cand)) candidates.push(cand);
  }
  if (candidates.length === 0) return null;
  const random = new Uint32Array(1);
  crypto.getRandomValues(random);
  const code = candidates[random[0] % candidates.length] ?? 0;
  if (code === 0) return null; // semua kode terpakai — biarkan tanpa nominal unik


  const amount = base + code;
  const expiresAt = new Date(Date.now() + COMPANION_EXPIRY_MINUTES * 60_000).toISOString();
  const { error } = await db
    .from("purchase_requests")
    .update({ gopay_expected_amount: amount, temanqris_expires_at: expiresAt })
    .eq("id", purchaseId);
  if (error) return null;
  return { amount, base, code };
}

/**
 * Batalkan otomatis pesanan companion yang pending lebih dari batas waktu.
 * Idempotent dan aman dipanggil sesering mungkin.
 */
export async function expireStaleCompanionPurchases(): Promise<number> {
  const db = await admin();
  const cutoff = new Date(Date.now() - COMPANION_EXPIRY_MINUTES * 60_000).toISOString();
  const { data } = await db
    .from("purchase_requests")
    .update({
      status: "rejected",
      admin_note: `Dibatalkan otomatis: pembayaran melewati batas waktu ${COMPANION_EXPIRY_MINUTES} menit.`,
      reviewed_at: new Date().toISOString(),
    })
    .eq("status", "pending")
    .not("gopay_expected_amount", "is", null)
    .lt("created_at", cutoff)
    .select("id");
  return ((data ?? []) as { id: string }[]).length;
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
  await expireStaleCompanionPurchases();
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
