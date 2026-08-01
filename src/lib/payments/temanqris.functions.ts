// Server fn untuk alur TemanQRIS dari sisi user:
//  - claimTemanQrisPayment : tombol "Saya sudah bayar" → status awaiting_confirmation
//                            (+ auto verify & fulfill kalau admin mengaktifkan auto_verify)
//  - checkTemanQrisStatus  : polling status order (fallback kalau webhook telat)
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type LooseClient = { from: (t: string) => any };

type PrRow = {
  id: string;
  user_id: string;
  status: string;
  payment_gateway_id: string | null;
  temanqris_order_id: string | null;
  temanqris_link_code: string | null;
  temanqris_expires_at: string | null;
};

async function loadPr(context: { supabase: unknown; userId: string }, id: string) {
  const db = context.supabase as unknown as LooseClient;
  const { data, error } = await db
    .from("purchase_requests")
    .select(
      "id, user_id, status, payment_gateway_id, temanqris_order_id, temanqris_link_code, temanqris_expires_at",
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const pr = data as PrRow | null;
  if (!pr) throw new Error("Purchase request tidak ditemukan");
  if (pr.user_id !== context.userId) throw new Error("Forbidden");
  return pr;
}

export const claimTemanQrisPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { purchaseRequestId: string }) => {
    if (!d.purchaseRequestId) throw new Error("purchaseRequestId required");
    return d;
  })
  .handler(async ({ data, context }) => {
    const pr = await loadPr(context, data.purchaseRequestId);
    if (pr.status === "approved") return { status: "approved" as const };
    if (!pr.temanqris_link_code) throw new Error("Order TemanQRIS belum dibuat");

    const { loadTemanQrisConfig, claimTemanQrisPaid, fetchTemanQrisOrder, verifyTemanQrisOrder } =
      await import("@/lib/payments/temanqris.server");
    const loaded = await loadTemanQrisConfig(pr.payment_gateway_id ?? undefined);
    if (!loaded) throw new Error("Konfigurasi TemanQRIS tidak ditemukan");

    await claimTemanQrisPaid(pr.temanqris_link_code);

    const orderId = pr.temanqris_order_id;
    if (orderId) {
      // Kalau dana benar-benar sudah masuk & TemanQRIS sudah tandai paid, fulfill.
      const order = await fetchTemanQrisOrder(loaded.cfg, orderId).catch(() => null);
      if (order?.isPaid) {
        const { fulfillPurchaseAfterPayment } = await import("@/lib/midtrans/fulfill.server");
        await fulfillPurchaseAfterPayment(pr.id);
        return { status: "approved" as const };
      }
      if (loaded.cfg.autoVerify) {
        const ok = await verifyTemanQrisOrder(loaded.cfg, orderId, {
          payerNote: "Auto-verify (mode otomatis aktif)",
        });
        if (ok) {
          const { fulfillPurchaseAfterPayment } = await import("@/lib/midtrans/fulfill.server");
          await fulfillPurchaseAfterPayment(pr.id);
          return { status: "approved" as const };
        }
      }
    }
    return { status: "awaiting_confirmation" as const };
  });

export const checkTemanQrisStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { purchaseRequestId: string }) => {
    if (!d.purchaseRequestId) throw new Error("purchaseRequestId required");
    return d;
  })
  .handler(async ({ data, context }) => {
    const pr = await loadPr(context, data.purchaseRequestId);
    if (pr.status === "approved") return { status: "approved" as const };
    if (!pr.temanqris_order_id) return { status: pr.status };

    const { loadTemanQrisConfig, fetchTemanQrisOrder } = await import(
      "@/lib/payments/temanqris.server"
    );
    const loaded = await loadTemanQrisConfig(pr.payment_gateway_id ?? undefined);
    if (!loaded) return { status: "pending" as const };
    // Polling HANYA membaca status asli dari TemanQRIS. Jangan pernah
    // mengirim confirm/verify sendiri di sini — itu membuat order yang belum
    // dibayar ikut ditandai lunas (false positive).
    const order = await fetchTemanQrisOrder(loaded.cfg, pr.temanqris_order_id).catch(() => null);


    if (order?.isPaid) {
      const { fulfillPurchaseAfterPayment } = await import("@/lib/midtrans/fulfill.server");
      await fulfillPurchaseAfterPayment(pr.id);
      return { status: "approved" as const };
    }

    const expired =
      order?.isExpired ||
      (pr.temanqris_expires_at != null &&
        new Date(pr.temanqris_expires_at).getTime() < Date.now());
    if (expired) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await (supabaseAdmin as unknown as LooseClient)
        .from("purchase_requests")
        .update({
          status: "rejected",
          admin_note: "QRIS TemanQRIS kadaluarsa — dibatalkan otomatis",
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", pr.id);
      return { status: "rejected" as const };
    }
    if (order?.status === "cancelled") return { status: "rejected" as const };
    if (order?.status === "awaiting_confirmation")
      return { status: "awaiting_confirmation" as const };
    return { status: "pending" as const };
  });
