// TemanQRIS webhook. TemanQRIS POST JSON ke sini saat status pembayaran berubah.
// Header: X-TemanQRIS-Signature (sha256=<hmac hex raw body>), X-TemanQRIS-Event.
// Event: payment.awaiting_confirmation | payment.confirmed
//
// Selalu balas 200 supaya TemanQRIS tidak retry-storm; kegagalan dicatat di log.
import { createFileRoute } from "@tanstack/react-router";

const OK = (body: Record<string, unknown>) => Response.json(body, { status: 200 });

export const Route = createFileRoute("/api/public/temanqris/notification")({
  server: {
    handlers: {
      GET: async () => OK({ ok: true, endpoint: "temanqris-notification", method: "GET" }),

      POST: async ({ request }) => {
        let rawBody = "";
        try {
          rawBody = await request.text();
        } catch {
          return OK({ ok: true, note: "empty body accepted" });
        }
        let payload: {
          event?: string;
          timestamp?: string;
          data?: {
            order_id?: string;
            link_code?: string;
            amount?: number;
            status?: string;
            paid_at?: string | null;
          };
        } = {};
        try {
          payload = rawBody ? JSON.parse(rawBody) : {};
        } catch {
          console.warn("[temanqris-webhook] non-JSON body", rawBody.slice(0, 200));
          return OK({ ok: true, note: "non-JSON accepted" });
        }

        const orderId = payload.data?.order_id;
        const linkCode = payload.data?.link_code;
        if (!orderId && !linkCode) {
          console.warn("[temanqris-webhook] missing order_id/link_code (test ping?)");
          return OK({ ok: true, note: "test ping accepted" });
        }

        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          type LooseClient = { from: (t: string) => any };
          const admin = supabaseAdmin as unknown as LooseClient;

          let q = admin
            .from("purchase_requests")
            .select("id, status, payment_gateway_id, temanqris_order_id");
          q = orderId ? q.eq("temanqris_order_id", orderId) : q.eq("temanqris_link_code", linkCode);
          const { data: prRaw } = await q.maybeSingle();
          const pr = prRaw as
            | { id: string; status: string; payment_gateway_id: string | null; temanqris_order_id: string | null }
            | null;
          if (!pr) {
            console.warn("[temanqris-webhook] unknown order", orderId ?? linkCode);
            return OK({ ok: true, skipped: "unknown order" });
          }

          const {
            loadTemanQrisConfig,
            verifyTemanQrisSignature,
            verifyTemanQrisOrder,
            fetchTemanQrisOrder,
          } = await import("@/lib/payments/temanqris.server");
          const loaded = await loadTemanQrisConfig(pr.payment_gateway_id ?? undefined);
          if (!loaded) {
            console.warn("[temanqris-webhook] no config, ignored");
            return OK({ ok: true, note: "no config, ignored" });
          }

          // Signature wajib kalau webhook secret dikonfigurasi admin.
          if (loaded.cfg.webhookSecret) {
            const valid = verifyTemanQrisSignature({
              secret: loaded.cfg.webhookSecret,
              rawBody,
              signature:
                request.headers.get("X-TemanQRIS-Signature") ??
                request.headers.get("x-temanqris-signature"),
            });
            if (!valid) {
              console.warn("[temanqris-webhook] invalid signature", orderId ?? linkCode);
              return OK({ ok: true, note: "invalid signature ignored" });
            }
          }

          try {
            await admin.from("purchase_requests").update({ temanqris_raw: payload }).eq("id", pr.id);
          } catch {
            /* non-fatal */
          }

          if (pr.status === "approved") return OK({ ok: true, status: "approved" });

          const event = payload.event ?? request.headers.get("X-TemanQRIS-Event") ?? "";
          const status = String(payload.data?.status ?? "").toLowerCase();
          const effectiveOrderId = pr.temanqris_order_id ?? orderId!;

          // Sudah paid & terverifikasi → fulfill.
          if (event === "payment.confirmed" || status === "paid") {
            const { fulfillPurchaseAfterPayment } = await import("@/lib/midtrans/fulfill.server");
            await fulfillPurchaseAfterPayment(pr.id);
            return OK({ ok: true, status: "approved" });
          }

          // Customer klaim sudah bayar. Kalau auto_verify=on → verify + fulfill otomatis.
          if (event === "payment.awaiting_confirmation" || status === "awaiting_confirmation") {
            if (loaded.cfg.autoVerify) {
              const ok = await verifyTemanQrisOrder(loaded.cfg, effectiveOrderId, {
                payerNote: "Auto-verified oleh webhook TemanQRIS",
              });
              if (ok) {
                const { fulfillPurchaseAfterPayment } = await import(
                  "@/lib/midtrans/fulfill.server"
                );
                await fulfillPurchaseAfterPayment(pr.id);
                return OK({ ok: true, status: "approved", auto_verified: true });
              }
              console.warn("[temanqris-webhook] auto-verify gagal", effectiveOrderId);
            }
            await admin
              .from("purchase_requests")
              .update({
                admin_note:
                  "TemanQRIS: customer klaim sudah bayar — menunggu verifikasi dana masuk",
              })
              .eq("id", pr.id);
            return OK({ ok: true, status: "awaiting_confirmation" });
          }

          if (["expired", "cancelled"].includes(status)) {
            await admin
              .from("purchase_requests")
              .update({
                status: "rejected",
                admin_note: `TemanQRIS: ${status}`,
                reviewed_at: new Date().toISOString(),
              })
              .eq("id", pr.id);
            return OK({ ok: true, status: "rejected" });
          }

          // Event tak dikenal → reconcile lewat API.
          const order = await fetchTemanQrisOrder(loaded.cfg, effectiveOrderId);
          if (order?.isPaid) {
            const { fulfillPurchaseAfterPayment } = await import("@/lib/midtrans/fulfill.server");
            await fulfillPurchaseAfterPayment(pr.id);
            return OK({ ok: true, status: "approved" });
          }
          return OK({ ok: true, status: order?.status ?? "pending" });
        } catch (e) {
          console.error("[temanqris-webhook] handler error", e);
          return OK({ ok: false, note: "handler error logged" });
        }
      },
    },
  },
});
