// Server fn: pastikan sebuah pesanan punya NOMINAL UNIK untuk pencocokan
// notifikasi GoPay Merchant (dipakai Companion Android).
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type GopayAmount = { amount: number; base: number; code: number } | null;

export const ensureGopayAmount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { purchaseId: string }) => {
    const id = String(input?.purchaseId ?? "").trim();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      throw new Error("purchaseId tidak valid");
    }
    return { purchaseId: id };
  })
  .handler(async ({ data, context }): Promise<GopayAmount> => {
    // Pesanan harus milik pemanggil — RLS user client yang memverifikasi.
    const db = context.supabase as unknown as { from: (t: string) => any };
    const { data: own } = await db
      .from("purchase_requests")
      .select("id, status")
      .eq("id", data.purchaseId)
      .maybeSingle();
    const row = own as { id: string; status: string } | null;
    if (!row || row.status !== "pending") return null;

    const { assignUniqueGopayAmount } = await import("./companion.server");
    return await assignUniqueGopayAmount(data.purchaseId);
  });
