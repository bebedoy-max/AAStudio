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
