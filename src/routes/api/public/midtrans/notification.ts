// Midtrans notification webhook. Midtrans POSTs JSON here after payment
// state changes. We verify signature, look up the purchase by order_id,
// then auto-fulfill on settlement.
//
// IMPORTANT: Midtrans "Test URL notifikasi" (dan retry mechanism-nya)
// menganggap URL sehat HANYA jika response HTTP 200. Karena itu handler
// ini selalu balas 200 — kegagalan (signature invalid, JSON invalid,
// order tak dikenal) dicatat via console tanpa mengembalikan 4xx/5xx.
import { createFileRoute } from "@tanstack/react-router";

const OK = (body: Record<string, unknown>) => Response.json(body, { status: 200 });

export const Route = createFileRoute("/api/public/midtrans/notification")({
  server: {
    handlers: {
      // Beberapa dashboard/monitoring melakukan GET untuk cek reachability.
      GET: async () =>
        OK({ ok: true, endpoint: "midtrans-notification", method: "GET" }),

      POST: async ({ request }) => {
        let payload: {
          order_id?: string;
          status_code?: string;
          gross_amount?: string;
          signature_key?: string;
          transaction_status?: string;
          fraud_status?: string;
          transaction_id?: string;
        } = {};
        try {
          payload = await request.json();
        } catch {
          console.warn("[midtrans-webhook] non-JSON body (kemungkinan test URL kosong)");
          return OK({ ok: true, note: "empty or invalid JSON accepted" });
        }

        // Test URL Midtrans kadang kirim payload minimal — balas 200 supaya lulus.
        if (!payload.order_id || !payload.signature_key) {
          console.warn("[midtrans-webhook] missing fields, likely test ping", payload);
          return OK({ ok: true, note: "test ping accepted" });
        }

        const { verifyNotificationSignature, midtransStatusToInternal } = await import(
          "@/lib/midtrans/midtrans.server"
        );
        if (!verifyNotificationSignature(payload)) {
          console.warn("[midtrans-webhook] invalid signature", { order_id: payload.order_id });
          // Tetap balas 200 supaya Midtrans dashboard tidak menandai URL down.
          return OK({ ok: true, note: "invalid signature ignored" });
        }

        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          type LooseClient = { from: (t: string) => any };
          const admin = supabaseAdmin as unknown as LooseClient;

          const { data: prRaw } = await admin
            .from("purchase_requests")
            .select("id, status")
            .eq("midtrans_order_id", payload.order_id)
            .maybeSingle();
          const pr = prRaw as { id: string; status: string } | null;
          if (!pr) {
            console.warn("[midtrans-webhook] no purchase for order", payload.order_id);
            return OK({ ok: true, skipped: "unknown order" });
          }

          // Audit log
          try {
            await admin
              .from("purchase_requests")
              .update({
                midtrans_raw: payload,
                midtrans_transaction_id: payload.transaction_id ?? null,
              })
              .eq("id", pr.id);
          } catch {
            /* non-fatal */
          }

          const internal = midtransStatusToInternal(
            payload.transaction_status,
            payload.fraud_status,
          );

          if (internal === "paid") {
            const { fulfillPurchaseAfterPayment } = await import("@/lib/midtrans/fulfill.server");
            await fulfillPurchaseAfterPayment(pr.id);
            return OK({ ok: true, status: "approved" });
          }

          if (internal === "failed") {
            await admin
              .from("purchase_requests")
              .update({
                status: "rejected",
                admin_note: `Midtrans: ${payload.transaction_status ?? "failed"}`,
                reviewed_at: new Date().toISOString(),
              })
              .eq("id", pr.id);
            return OK({ ok: true, status: "rejected" });
          }

          return OK({ ok: true, status: "pending" });
        } catch (e) {
          console.error("[midtrans-webhook] handler error", e);
          // Tetap 200 — supaya Midtrans tidak retry storm; kita re-reconcile via /status polling.
          return OK({ ok: false, note: "handler error logged" });
        }
      },
    },
  },
});
