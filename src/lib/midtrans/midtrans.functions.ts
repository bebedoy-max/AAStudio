// Client-callable server functions for creating Midtrans QRIS charges
// and polling status. Uses signed-in user session (requireSupabaseAuth).
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type LooseClient = {
  from: (t: string) => any;
};

function newOrderId() {
  const rnd = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `AA-${Date.now()}-${rnd}`;
}

/**
 * Creates a Midtrans QRIS charge for an EXISTING pending purchase_request
 * owned by the current user. Stores order_id / qr_url on the row so the
 * client can display the QR and poll status.
 */
export const createMidtransQris = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { purchaseRequestId: string }) => {
    if (!data.purchaseRequestId) throw new Error("purchaseRequestId required");
    return data;
  })
  .handler(async ({ data, context }) => {
    const db = context.supabase as unknown as LooseClient;

    // Load request scoped to current user (RLS enforces ownership).
    const { data: prRaw, error } = await db
      .from("purchase_requests")
      .select(
        "id, user_id, price_idr, status, note, route_key, midtrans_order_id, midtrans_qr_url, midtrans_expires_at",
      )
      .eq("id", data.purchaseRequestId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    const pr = prRaw as
      | {
          id: string;
          user_id: string;
          price_idr: number;
          status: string;
          note: string | null;
          route_key: string;
          midtrans_order_id: string | null;
          midtrans_qr_url: string | null;
          midtrans_expires_at: string | null;
        }
      | null;
    if (!pr) throw new Error("Purchase request not found");
    if (pr.user_id !== context.userId) throw new Error("Forbidden");
    if (pr.status !== "pending") throw new Error(`Purchase is already ${pr.status}`);
    if (pr.price_idr < 1) throw new Error("Amount must be >= Rp 1");

    // If already has a valid QR, return it (idempotent).
    if (pr.midtrans_qr_url && pr.midtrans_order_id) {
      const expiresValid = pr.midtrans_expires_at
        ? new Date(pr.midtrans_expires_at).getTime() > Date.now()
        : true;
      if (expiresValid) {
        return {
          orderId: pr.midtrans_order_id,
          qrUrl: pr.midtrans_qr_url,
          amount: pr.price_idr,
          expiresAt: pr.midtrans_expires_at,
        };
      }
    }

    const { createQrisCharge } = await import("@/lib/midtrans/midtrans.server");
    const orderId = newOrderId();
    const itemName = (pr.note ?? pr.route_key ?? "Payment").replace(/\s+/g, " ").trim();
    const charge = await createQrisCharge({
      orderId,
      amountIdr: pr.price_idr,
      itemName: itemName || pr.route_key,
    });

    const { error: upErr } = await db
      .from("purchase_requests")
      .update({
        midtrans_order_id: charge.order_id,
        midtrans_transaction_id: charge.transaction_id,
        midtrans_qr_url: charge.qr_url,
        midtrans_gross_amount: Math.round(pr.price_idr),
        midtrans_expires_at: charge.expiry_time
          ? new Date(charge.expiry_time.replace(" ", "T") + "+07:00").toISOString()
          : null,
        payment_method_name: "QRIS (Midtrans)",
      })
      .eq("id", pr.id);
    if (upErr) throw new Error(upErr.message);

    return {
      orderId: charge.order_id,
      qrUrl: charge.qr_url,
      amount: pr.price_idr,
      expiresAt: charge.expiry_time,
    };
  });

/**
 * Poll Midtrans and reconcile local status. Used as a fallback when the
 * webhook is delayed. Also auto-fulfills on paid.
 */
export const checkMidtransStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { purchaseRequestId: string }) => {
    if (!data.purchaseRequestId) throw new Error("purchaseRequestId required");
    return data;
  })
  .handler(async ({ data, context }) => {
    const db = context.supabase as unknown as LooseClient;
    const { data: prRaw, error } = await db
      .from("purchase_requests")
      .select("id, user_id, status, midtrans_order_id, midtrans_expires_at")
      .eq("id", data.purchaseRequestId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    const pr = prRaw as {
      id: string;
      user_id: string;
      status: string;
      midtrans_order_id: string | null;
      midtrans_expires_at: string | null;
    } | null;
    if (!pr) throw new Error("Purchase request not found");
    if (pr.user_id !== context.userId) throw new Error("Forbidden");
    if (pr.status === "approved") return { status: "approved" as const };
    if (!pr.midtrans_order_id) return { status: pr.status };

    const { fetchTransactionStatus, midtransStatusToInternal } = await import(
      "@/lib/midtrans/midtrans.server"
    );
    const st = await fetchTransactionStatus(pr.midtrans_order_id);
    const internal = midtransStatusToInternal(st.transaction_status, st.fraud_status);

    // Auto-cancel jika sudah lewat waktu kadaluarsa dan belum dibayar.
    const isExpired =
      pr.midtrans_expires_at != null &&
      new Date(pr.midtrans_expires_at).getTime() < Date.now();
    if (isExpired && internal !== "paid") {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await (supabaseAdmin as unknown as LooseClient)
        .from("purchase_requests")
        .update({
          status: "rejected",
          admin_note: "QRIS kadaluarsa (1 jam) — dibatalkan otomatis",
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", pr.id);
      return { status: "rejected" as const };
    }

    if (internal === "paid") {
      const { fulfillPurchaseAfterPayment } = await import("@/lib/midtrans/fulfill.server");
      await fulfillPurchaseAfterPayment(pr.id);
      return { status: "approved" as const };
    }
    if (internal === "failed") {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await (supabaseAdmin as unknown as LooseClient)
        .from("purchase_requests")
        .update({
          status: "rejected",
          admin_note: `Midtrans: ${st.transaction_status ?? "failed"}`,
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", pr.id);
      return { status: "rejected" as const };
    }
    return { status: "pending" as const };
  });
