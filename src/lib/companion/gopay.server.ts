// Server-only: verifikasi kepemilikan pesanan sebelum menetapkan nominal unik.
import { assignUniqueGopayAmount } from "./companion.server";

type LooseClient = { from: (t: string) => any };

export async function assignGopayAmountForUser(
  supabase: unknown,
  userId: string,
  purchaseId: string,
): Promise<{ amount: number; base: number; code: number } | null> {
  const db = supabase as LooseClient;
  const { data } = await db
    .from("purchase_requests")
    .select("id, user_id, status")
    .eq("id", purchaseId)
    .maybeSingle();
  const row = data as { user_id: string | null; status: string } | null;
  if (!row || row.user_id !== userId) return null;
  if (row.status !== "pending") return null;
  return assignUniqueGopayAmount(purchaseId);
}

/**
 * Batalkan pesanan companion milik user kalau sudah lewat batas waktu 1 jam.
 * Dipakai panel checkout saat hitung mundur habis.
 */
export async function expireGopayPurchaseForUser(
  supabase: unknown,
  userId: string,
  purchaseId: string,
): Promise<{ expired: boolean }> {
  const { COMPANION_EXPIRY_MINUTES } = await import("./companion.server");
  const db = supabase as LooseClient;
  const { data } = await db
    .from("purchase_requests")
    .select("id, user_id, status, created_at")
    .eq("id", purchaseId)
    .maybeSingle();
  const row = data as { user_id: string | null; status: string; created_at: string } | null;
  if (!row || row.user_id !== userId) return { expired: false };
  if (row.status !== "pending") return { expired: row.status === "rejected" };
  const age = Date.now() - new Date(row.created_at).getTime();
  if (age < COMPANION_EXPIRY_MINUTES * 60_000) return { expired: false };

  const { expireStaleCompanionPurchases } = await import("./companion.server");
  await expireStaleCompanionPurchases();
  return { expired: true };
}
