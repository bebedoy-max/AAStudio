// POST /api/public/companion/payment/paid
// Body: { order_id, device_id, received_at }
// Menandai pesanan lunas + fulfill (kirim token) — idempotent.
import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, preflight } from "@/lib/companion/http";

export const Route = createFileRoute("/api/public/companion/payment/paid")({
  server: {
    handlers: {
      OPTIONS: async () => preflight(),
      POST: async ({ request }) => {
        const { authenticateDevice, findPurchaseByOrderId } = await import(
          "@/lib/companion/companion.server"
        );

        const device = await authenticateDevice(request);
        if (!device) return jsonResponse({ ok: false, error: "unauthorized" }, 401);

        let body: { order_id?: string; received_at?: string };
        try {
          body = await request.json();
        } catch {
          return jsonResponse({ ok: false, error: "invalid json" }, 400);
        }
        const orderId = (body.order_id ?? "").trim();
        if (!orderId) return jsonResponse({ ok: false, error: "missing order_id" }, 400);

        try {
          const pr = await findPurchaseByOrderId(orderId);
          if (!pr) return jsonResponse({ ok: false, error: "unknown order" }, 404);
          if (pr.status === "approved") {
            return jsonResponse({ ok: true, status: "PAID", note: "already approved" });
          }

          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const admin = supabaseAdmin as unknown as { from: (t: string) => any };
          try {
            await admin
              .from("purchase_requests")
              .update({ gopay_paid_at: body.received_at ?? new Date().toISOString() })
              .eq("id", pr.id);
          } catch {
            /* non-fatal */
          }

          const { fulfillPurchaseAfterPayment } = await import("@/lib/midtrans/fulfill.server");
          await fulfillPurchaseAfterPayment(pr.id);
          return jsonResponse({ ok: true, order_id: orderId, status: "PAID" });
        } catch (e) {
          console.error("[companion/paid]", e);
          return jsonResponse({ ok: false, error: "fulfill failed" }, 500);
        }
      },
    },
  },
});
