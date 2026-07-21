// DOKU (Jokul) notification webhook. DOKU POST JSON di sini setiap perubahan
// status transaksi. Kita verify signature (HMAC-SHA256) lalu fulfill.
// Selalu balas 200 supaya DOKU tidak mengasumsikan endpoint down.
import { createFileRoute } from "@tanstack/react-router";

const OK = (body: Record<string, unknown>) => Response.json(body, { status: 200 });
const NOTIF_PATH = "/api/public/doku/notification";

export const Route = createFileRoute("/api/public/doku/notification")({
  server: {
    handlers: {
      GET: async () => OK({ ok: true, endpoint: "doku-notification", method: "GET" }),

      POST: async ({ request }) => {
        let rawBody = "";
        try {
          rawBody = await request.text();
        } catch {
          return OK({ ok: true, note: "empty body accepted" });
        }
        let payload: Record<string, unknown> = {};
        try {
          payload = rawBody ? (JSON.parse(rawBody) as Record<string, unknown>) : {};
        } catch {
          console.warn("[doku-webhook] non-JSON body", rawBody.slice(0, 200));
          return OK({ ok: true, note: "non-JSON accepted" });
        }

        // Payload DOKU: { transaction: { status, ... }, order: { invoice_number, amount, ... }, ... }
        const order = (payload.order ?? {}) as { invoice_number?: string; amount?: number };
        const transaction = (payload.transaction ?? {}) as { status?: string; original_request_id?: string };
        const invoice = order.invoice_number;
        if (!invoice) {
          console.warn("[doku-webhook] missing invoice_number, likely test ping");
          return OK({ ok: true, note: "test ping accepted" });
        }

        // Lookup purchase — verifikasi signature pakai config gateway yang dipakai.
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          type LooseClient = { from: (t: string) => any };
          const admin = supabaseAdmin as unknown as LooseClient;

          const { data: prRaw } = await admin
            .from("purchase_requests")
            .select("id, status, payment_gateway_id")
            .eq("doku_invoice_number", invoice)
            .maybeSingle();
          const pr = prRaw as
            | { id: string; status: string; payment_gateway_id: string | null }
            | null;
          if (!pr) {
            console.warn("[doku-webhook] unknown invoice", invoice);
            return OK({ ok: true, skipped: "unknown invoice" });
          }

          const { loadDokuConfig, verifyDokuNotificationSignature } = await import(
            "@/lib/payments/doku.server"
          );
          const loaded = await loadDokuConfig(pr.payment_gateway_id ?? undefined);
          if (!loaded) {
            console.warn("[doku-webhook] no doku config to verify signature");
            return OK({ ok: true, note: "no config, ignored" });
          }
          const valid = verifyDokuNotificationSignature({
            cfg: loaded.cfg,
            headers: request.headers,
            rawBody,
            requestTarget: NOTIF_PATH,
          });
          if (!valid) {
            console.warn("[doku-webhook] invalid signature for invoice", invoice);
            return OK({ ok: true, note: "invalid signature ignored" });
          }

          // Audit log raw payload.
          try {
            await admin
              .from("purchase_requests")
              .update({ doku_raw: payload })
              .eq("id", pr.id);
          } catch {
            /* non-fatal */
          }

          const status = String(transaction.status ?? "").toUpperCase();
          // DOKU status umum: SUCCESS, PENDING, FAILED, VOID, EXPIRED
          if (status === "SUCCESS" || status === "SETTLEMENT") {
            const { fulfillPurchaseAfterPayment } = await import(
              "@/lib/midtrans/fulfill.server"
            );
            await fulfillPurchaseAfterPayment(pr.id);
            return OK({ ok: true, status: "approved" });
          }
          if (["FAILED", "VOID", "EXPIRED", "REFUNDED"].includes(status)) {
            await admin
              .from("purchase_requests")
              .update({
                status: "rejected",
                admin_note: `DOKU: ${status}`,
                reviewed_at: new Date().toISOString(),
              })
              .eq("id", pr.id);
            return OK({ ok: true, status: "rejected" });
          }
          return OK({ ok: true, status: "pending" });
        } catch (e) {
          console.error("[doku-webhook] handler error", e);
          return OK({ ok: false, note: "handler error logged" });
        }
      },
    },
  },
});
