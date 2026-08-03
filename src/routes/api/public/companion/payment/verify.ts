// POST /api/public/companion/payment/verify
// Body: { amount, received_at, device_id, notification_title, notification_text }
// Response: { match: true, order_id, status: "PAID" } | { match: false, reason }
//
// Hanya mencocokkan — tidak mengubah status pesanan.
import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, preflight } from "@/lib/companion/http";

export const Route = createFileRoute("/api/public/companion/payment/verify")({
  server: {
    handlers: {
      OPTIONS: async () => preflight(),
      POST: async ({ request }) => {
        const { authenticateDevice, matchPurchaseByAmount, recordEvent } =
          await import("@/lib/companion/companion.server");

        const device = await authenticateDevice(request);
        if (!device) return jsonResponse({ ok: false, error: "unauthorized" }, 401);

        let body: {
          amount?: number;
          received_at?: string;
          notification_title?: string;
          notification_text?: string;
        };
        try {
          body = await request.json();
        } catch {
          return jsonResponse({ ok: false, error: "invalid json" }, 400);
        }

        const amount = Math.round(Number(body.amount));
        if (!Number.isFinite(amount) || amount <= 0 || amount > 1_000_000_000) {
          return jsonResponse({ ok: false, error: "invalid amount" }, 400);
        }
        const receivedAt = body.received_at ?? new Date().toISOString();
        const title = (body.notification_title ?? "").slice(0, 200) || null;
        const text = (body.notification_text ?? "").slice(0, 1000) || null;

        try {
          const result = await matchPurchaseByAmount(amount);
          const logged = await recordEvent({
            deviceId: device.device_id,
            amount,
            receivedAt,
            title,
            text,
            status: result.match ? "matched" : result.reason,
            matchedPurchaseId: result.match ? result.purchaseId : null,
          });

          // Event dengan hash sama sudah pernah diproses → jangan proses ulang.
          if (!logged.inserted) {
            return jsonResponse({ match: false, reason: "duplicate" });
          }
          if (!result.match) {
            return jsonResponse({ match: false, reason: result.reason });
          }
          return jsonResponse({ match: true, order_id: result.orderId, status: "PAID" });
        } catch (e) {
          console.error("[companion/verify]", e);
          return jsonResponse({ ok: false, error: "verify failed" }, 500);
        }
      },
    },
  },
});
