// Server fn untuk membuat charge di provider yang dipilih user di picker.
// Sekarang: dispatch ke Midtrans (QRIS inline) atau DOKU (Checkout redirect).
import { createServerFn } from "@tanstack/react-start";
import { getRequestHost } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { DOKU_METHODS } from "./method-catalog";

type LooseClient = { from: (t: string) => any };

function newInvoice(prefix: string) {
  const rnd = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `${prefix}-${Date.now()}-${rnd}`;
}

export type CreatePaymentInput = {
  purchaseRequestId: string;
  gatewayId: string;
  provider: "midtrans" | "doku";
  methodCode: string; // e.g. QRIS, VIRTUAL_ACCOUNT_BCA
};

export type CreatePaymentResult =
  | {
      mode: "redirect";
      redirectUrl: string;
      invoiceNumber: string;
      amount: number;
      expiresAt: string | null;
      provider: "doku";
    }
  | {
      mode: "inline_qris";
      orderId: string;
      qrUrl: string;
      amount: number;
      expiresAt: string | null;
      provider: "midtrans";
    };

export const createPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: CreatePaymentInput) => {
    if (!d.purchaseRequestId) throw new Error("purchaseRequestId required");
    if (!d.gatewayId) throw new Error("gatewayId required");
    if (d.provider !== "midtrans" && d.provider !== "doku") throw new Error("provider tidak didukung");
    if (!d.methodCode) throw new Error("methodCode required");
    return d;
  })
  .handler(async ({ data, context }): Promise<CreatePaymentResult> => {
    const db = context.supabase as unknown as LooseClient;
    const { data: prRaw, error } = await db
      .from("purchase_requests")
      .select(
        "id, user_id, price_idr, status, note, route_key, midtrans_order_id, midtrans_qr_url, midtrans_expires_at, doku_invoice_number, doku_payment_url, doku_expires_at, payment_provider",
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
          doku_invoice_number: string | null;
          doku_payment_url: string | null;
          doku_expires_at: string | null;
          payment_provider: string | null;
        }
      | null;
    if (!pr) throw new Error("Purchase request tidak ditemukan");
    if (pr.user_id !== context.userId) throw new Error("Forbidden");
    if (pr.status !== "pending") throw new Error(`Purchase sudah ${pr.status}`);
    if (pr.price_idr < 1) throw new Error("Amount harus >= Rp 1");

    const itemName = (pr.note ?? pr.route_key ?? "Payment").replace(/\s+/g, " ").trim().slice(0, 60);

    if (data.provider === "midtrans") {
      // Reuse existing Midtrans QRIS flow.
      if (pr.midtrans_qr_url && pr.midtrans_order_id) {
        const expiresValid = pr.midtrans_expires_at
          ? new Date(pr.midtrans_expires_at).getTime() > Date.now()
          : true;
        if (expiresValid) {
          return {
            mode: "inline_qris",
            provider: "midtrans",
            orderId: pr.midtrans_order_id,
            qrUrl: pr.midtrans_qr_url,
            amount: pr.price_idr,
            expiresAt: pr.midtrans_expires_at,
          };
        }
      }
      const { createQrisCharge } = await import("@/lib/midtrans/midtrans.server");
      const orderId = newInvoice("AA");
      const charge = await createQrisCharge({
        orderId,
        amountIdr: pr.price_idr,
        itemName: itemName || pr.route_key,
      });
      const expiresIso = charge.expiry_time
        ? new Date(charge.expiry_time.replace(" ", "T") + "+07:00").toISOString()
        : null;
      await db
        .from("purchase_requests")
        .update({
          midtrans_order_id: charge.order_id,
          midtrans_transaction_id: charge.transaction_id,
          midtrans_qr_url: charge.qr_url,
          midtrans_gross_amount: Math.round(pr.price_idr),
          midtrans_expires_at: expiresIso,
          payment_provider: "midtrans",
          payment_gateway_id: data.gatewayId,
          payment_method_code: data.methodCode,
          payment_method_name: "QRIS (Midtrans)",
        })
        .eq("id", pr.id);
      return {
        mode: "inline_qris",
        provider: "midtrans",
        orderId: charge.order_id,
        qrUrl: charge.qr_url,
        amount: pr.price_idr,
        expiresAt: expiresIso,
      };
    }

    // DOKU
    if (pr.doku_payment_url && pr.doku_invoice_number) {
      const expiresValid = pr.doku_expires_at
        ? new Date(pr.doku_expires_at).getTime() > Date.now()
        : true;
      if (expiresValid) {
        return {
          mode: "redirect",
          provider: "doku",
          redirectUrl: pr.doku_payment_url,
          invoiceNumber: pr.doku_invoice_number,
          amount: pr.price_idr,
          expiresAt: pr.doku_expires_at,
        };
      }
    }

    const { loadDokuConfig, createDokuCheckout } = await import("./doku.server");
    const loaded = await loadDokuConfig(data.gatewayId);
    if (!loaded) throw new Error("Konfigurasi DOKU tidak ditemukan / tidak bisa didekripsi");
    const invoice = newInvoice("AA");
    // Origin untuk callback / notification URL
    let origin = process.env.SITE_URL ?? "";
    try {
      const host = getRequestHost();
      if (host) origin = `https://${host}`;
    } catch {
      /* not in request scope */
    }
    const notifPath = "/api/public/doku/notification";
    const notificationUrl = origin ? `${origin}${notifPath}` : undefined;
    const checkout = await createDokuCheckout({
      cfg: loaded.cfg,
      invoiceNumber: invoice,
      amountIdr: pr.price_idr,
      itemName: itemName || pr.route_key,
      paymentMethodTypes: [data.methodCode],
      notificationUrl,
      callbackUrl: origin || undefined,
    });

    const dokuMethod = DOKU_METHODS.find((x) => x.code === data.methodCode);
    const providerLabel = `${dokuMethod?.label ?? data.methodCode} (DOKU)`;

    await db
      .from("purchase_requests")
      .update({
        doku_invoice_number: checkout.invoiceNumber,
        doku_payment_url: checkout.paymentUrl,
        doku_expires_at: checkout.expiresAt,
        doku_raw: checkout.raw,
        payment_provider: "doku",
        payment_gateway_id: data.gatewayId,
        payment_method_code: data.methodCode,
        payment_method_name: providerLabel,
      })
      .eq("id", pr.id);

    return {
      mode: "redirect",
      provider: "doku",
      redirectUrl: checkout.paymentUrl,
      invoiceNumber: checkout.invoiceNumber,
      amount: pr.price_idr,
      expiresAt: checkout.expiresAt,
    };
  });

/** Polling status purchase — dipakai halaman checkout untuk auto-close. */
export const pollPurchaseStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { purchaseRequestId: string }) => {
    if (!d.purchaseRequestId) throw new Error("purchaseRequestId required");
    return d;
  })
  .handler(async ({ data, context }) => {
    const db = context.supabase as unknown as LooseClient;
    const { data: row } = await db
      .from("purchase_requests")
      .select("status, payment_provider")
      .eq("id", data.purchaseRequestId)
      .maybeSingle();
    const st = (row as { status?: string } | null)?.status ?? "pending";
    return { status: st };
  });
