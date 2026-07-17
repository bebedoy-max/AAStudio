// Popup showing purchase detail + live payment status. Opened from the
// notification bell when a user clicks a purchase row.
import { X, Clock, CircleCheck, CircleAlert, QrCode, Landmark, Wallet, CircleDollarSign } from "lucide-react";
import { PROVIDER_LABELS } from "@/lib/token-bank/bank.functions";
import type { PurchaseView } from "@/lib/stores/purchase-feed";
import { rupiah } from "@/lib/stores/purchase-feed";
import { MidtransQrisPanel } from "@/components/payments/midtrans-qris-panel";

const statusMeta = {
  pending: {
    label: "Menunggu pembayaran",
    tone: "border-amber-400/40 text-amber-300 bg-amber-400/10",
    Icon: Clock,
  },
  approved: {
    label: "Pembayaran diterima",
    tone: "border-emerald-400/40 text-emerald-300 bg-emerald-400/10",
    Icon: CircleCheck,
  },
  rejected: {
    label: "Pembayaran ditolak",
    tone: "border-rose-400/40 text-rose-300 bg-rose-400/10",
    Icon: CircleAlert,
  },
} as const;

function methodIcon(name: string | null) {
  const n = (name ?? "").toLowerCase();
  if (n.includes("qris")) return QrCode;
  if (n.includes("bank") || n.includes("transfer")) return Landmark;
  if (n.includes("gopay") || n.includes("ovo") || n.includes("dana") || n.includes("wallet"))
    return Wallet;
  return CircleDollarSign;
}

export function PurchaseDetailDialog({
  purchase,
  onClose,
}: {
  purchase: PurchaseView;
  onClose: () => void;
}) {
  const meta = statusMeta[purchase.status];
  const StatusIcon = meta.Icon;
  const MethodIcon = methodIcon(purchase.payment_method_name);
  const dt = new Date(purchase.created_at);
  const reviewedAt = purchase.reviewed_at ? new Date(purchase.reviewed_at) : null;


  return (
    <div
      className="fixed inset-0 z-[80] grid place-items-center bg-background/80 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="neumorph w-full max-w-md max-h-[90vh] overflow-y-auto p-6 relative"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-3 right-3 h-9 w-9 grid place-items-center rounded-full border border-border bg-card/50 hover:bg-sidebar-accent/60"
          aria-label="Tutup"
        >
          <X className="h-4 w-4" />
        </button>
        <div className="text-[11px] font-mono uppercase tracking-[0.25em] text-muted-foreground">
          Detail pembelian
        </div>
        <h2 className="mt-1 font-display text-xl font-bold">{purchase.title}</h2>

        <div
          className={[
            "mt-4 inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold",
            meta.tone,
          ].join(" ")}
        >
          <StatusIcon className="h-3.5 w-3.5" />
          {meta.label}
        </div>

        {purchase.cart && purchase.cart.length > 0 && (
          <div className="mt-4 rounded-2xl border border-border bg-card/40 p-4">
            <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-2">
              Rincian item
            </div>
            <div className="flex flex-col gap-1 text-sm">
              {purchase.cart.map((it) => (
                <div key={it.provider} className="flex items-center justify-between">
                  <span>{PROVIDER_LABELS[it.provider] ?? it.provider}</span>
                  <span className="font-mono text-muted-foreground">{it.qty}× key</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="mt-4 rounded-2xl border border-border bg-card/40 p-4 flex flex-col gap-2 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Total</span>
            <span className="font-display text-lg text-gradient">{rupiah(purchase.price_idr)}</span>
          </div>
          {purchase.payment_method_name && (
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Metode</span>
              <span className="inline-flex items-center gap-1.5">
                <MethodIcon className="h-3.5 w-3.5 text-primary" />
                {purchase.payment_method_name}
              </span>
            </div>
          )}
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Order ID</span>
            <span className="font-mono text-xs">{purchase.id.slice(0, 8)}…</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Dibuat</span>
            <span className="font-mono text-xs">
              {dt.toLocaleString("id-ID", { dateStyle: "short", timeStyle: "short" })}
            </span>
          </div>
          {reviewedAt && (
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">
                {purchase.status === "approved" ? "Diverifikasi" : "Ditolak"}
              </span>
              <span className="font-mono text-xs">
                {reviewedAt.toLocaleString("id-ID", { dateStyle: "short", timeStyle: "short" })}
              </span>
            </div>
          )}
        </div>

        {purchase.status === "pending" && (
          <div className="mt-4">
            <MidtransQrisPanel
              purchaseRequestId={purchase.id}
              amount={purchase.price_idr}
            />
          </div>
        )}
        {purchase.status === "approved" && purchase.kind === "token_bank" && (
          <div className="mt-4 rounded-xl border border-emerald-400/30 bg-emerald-400/5 p-3 text-xs text-emerald-200/90">
            Token sudah dikirim ke Token Manager. Buka menu <b>Manage → Token / API Manager</b>.
          </div>
        )}
        {purchase.status === "rejected" && purchase.admin_note && (
          <div className="mt-4 rounded-xl border border-rose-400/30 bg-rose-400/5 p-3 text-xs text-rose-200/90">
            <div className="font-semibold mb-1">Catatan admin</div>
            {purchase.admin_note}
          </div>
        )}
      </div>
    </div>
  );
}
