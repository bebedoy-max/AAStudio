// Checkout for feature-subscription purchases (30-day access to premium routes).
// Creates ONE purchase_request carrying the primary feature key + extras
// encoded in the note, then pays via Midtrans QRIS. Webhook auto-approves
// the row and grants route_permissions for every listed feature.
import { useEffect, useMemo, useState } from "react";
import { X, Loader2, CircleCheck } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, ALL_ROUTE_KEYS } from "@/lib/auth-context";
import { PaymentPicker } from "@/components/payments/payment-picker";

type FeaturePrice = { route_key: string; label: string; price_idr: number; is_active: boolean };

function rupiah(n: number) {
  return "Rp " + n.toLocaleString("id-ID");
}

type Order = { id: string; total: number; status: "pending" | "approved" | "rejected" };

export function CheckoutDialog({
  featureKeys,
  bundleLabel,
  bundlePrice,
  onClose,
  onSubmitted,
}: {
  featureKeys: string[];
  bundleLabel?: string | null;
  bundlePrice?: number | null;
  onClose: () => void;
  onSubmitted?: () => void;
}) {
  const { user } = useAuth();
  const [prices, setPrices] = useState<FeaturePrice[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [order, setOrder] = useState<Order | null>(null);

  useEffect(() => {
    (async () => {
      const { data: fp } = await supabase
        .from("feature_prices")
        .select("*")
        .in("route_key", featureKeys);
      setPrices((fp ?? []) as FeaturePrice[]);
      setLoading(false);
    })();
  }, [featureKeys.join(",")]);

  const individualTotal = useMemo(() => prices.reduce((s, p) => s + p.price_idr, 0), [prices]);
  const isBundle = !!bundleLabel && typeof bundlePrice === "number" && bundlePrice > 0;
  const total = isBundle ? (bundlePrice as number) : individualTotal;

  async function submit() {
    if (!user) return;
    if (total <= 0) return toast.error("Total pembayaran belum valid");
    setSubmitting(true);
    try {
      // Encode EVERY selected feature key in the FEATURES marker so the
      // server fulfiller grants route_permissions for the whole set — the
      // primary route_key alone would only unlock one feature.
      const allKeys = Array.from(
        new Set([...(prices.map((p) => p.route_key)), ...featureKeys]),
      );
      const primaryKey = allKeys[0];
      const featuresMarker =
        allKeys.length > 0 ? ` [FEATURES:${allKeys.join(",")}]` : "";
      const labelList = prices.map((p) => p.label).join(", ");
      const bundleTag = isBundle ? `[BUNDLE: ${bundleLabel}] ` : "";
      const note = `${bundleTag}${labelList}${featuresMarker}`.trim();

      const row = {
        user_id: user.id,
        route_key: primaryKey,
        price_idr: total,
        payment_method_id: null,
        payment_method_name: null,
        note,
        status: "pending" as const,
      };
      const { data, error } = await supabase
        .from("purchase_requests")
        .insert(row as never)
        .select("id, status")
        .single();
      if (error) throw error;
      const inserted = data as { id: string; status: Order["status"] };
      setOrder({ id: inserted.id, total, status: inserted.status });
      onSubmitted?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal membuat pesanan");
    } finally {
      setSubmitting(false);
    }
  }

  async function refreshStatus() {
    if (!order) return;
    const { data } = await supabase
      .from("purchase_requests")
      .select("status")
      .eq("id", order.id)
      .maybeSingle();
    const st = (data as { status?: Order["status"] } | null)?.status;
    if (st && st !== order.status) setOrder({ ...order, status: st });
  }

  return (
    <div
      className="fixed inset-0 z-[70] grid place-items-center bg-background/80 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="neumorph w-full max-w-2xl max-h-[92vh] overflow-y-auto p-6 relative"
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
          Checkout
        </div>
        <h2 className="mt-1 font-display text-2xl font-bold">
          Aktivasi <span className="text-gradient">via QRIS</span>
        </h2>

        {loading ? (
          <div className="py-12 grid place-items-center">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          </div>
        ) : (
          <>
            {/* Summary */}
            <div className="mt-4 rounded-2xl border border-border bg-card/40 p-4">
              <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-2">
                Ringkasan
              </div>
              {isBundle ? (
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-foreground/90">
                      {bundleLabel}
                      <span className="ml-2 text-[10px] text-muted-foreground">30 hari</span>
                    </span>
                    <span className="font-mono">{rupiah(total)}</span>
                  </div>
                  <div className="mt-1 text-[11px] text-muted-foreground">
                    Termasuk: {prices.map((p) => p.label).join(", ")}
                  </div>
                  {individualTotal > total && (
                    <div className="text-[11px] text-emerald-300">
                      Hemat {rupiah(individualTotal - total)} dibanding beli satuan.
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {prices.map((p) => (
                    <div key={p.route_key} className="flex items-center justify-between text-sm">
                      <span className="text-foreground/90">
                        {p.label}
                        <span className="ml-2 text-[10px] text-muted-foreground">30 hari</span>
                      </span>
                      <span className="font-mono">{rupiah(p.price_idr)}</span>
                    </div>
                  ))}
                </div>
              )}
              <div className="mt-3 pt-3 border-t border-border/60 flex items-center justify-between">
                <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                  Total
                </span>
                <span className="font-display text-xl text-gradient">{rupiah(total)}</span>
              </div>
            </div>

            {order ? (
              order.status === "approved" ? (
                <div className="mt-5 rounded-2xl border border-emerald-400/40 bg-emerald-400/5 p-6 flex flex-col items-center gap-2 text-emerald-200">
                  <CircleCheck className="h-8 w-8" />
                  <div className="font-semibold">Fitur aktif selama 30 hari</div>
                  <div className="text-xs opacity-80">Silakan tutup dialog dan gunakan fitur.</div>
                </div>
              ) : (
                <div className="mt-5">
                  <PaymentPicker
                    purchaseRequestId={order.id}
                    amount={order.total}
                    onApproved={refreshStatus}
                  />
                </div>
              )
            ) : (
              <>
                <div className="mt-4 rounded-xl border border-border/60 bg-primary/[0.04] p-3 text-[11px] text-muted-foreground">
                  Klik <b className="text-foreground">Lanjut</b> untuk memilih metode pembayaran
                  aktif (QRIS, Virtual Account, e-wallet, dsb.). Fitur langsung aktif begitu
                  pembayaran terkonfirmasi.
                </div>
                <div className="mt-6 flex items-center justify-end gap-2 pt-4 border-t border-border/60">
                  <button
                    onClick={onClose}
                    className="rounded-full border border-border bg-card/50 px-4 py-2 text-sm hover:bg-sidebar-accent/60"
                  >
                    Batal
                  </button>
                  <button
                    onClick={submit}
                    disabled={submitting || total <= 0}
                    className="inline-flex items-center gap-1.5 rounded-full px-5 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
                    style={{ background: "var(--gradient-neon)" }}
                  >
                    {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                    Lanjut · {rupiah(total)}
                  </button>
                </div>
              </>
            )}

            {order && (
              <div className="mt-5 flex justify-end">
                <button
                  onClick={onClose}
                  className="rounded-full border border-border bg-card/50 px-4 py-2 text-sm hover:bg-sidebar-accent/60"
                >
                  {order.status === "approved" ? "Selesai" : "Tutup"}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// Convenience: get feature label for keys not present in DB (fallback)
export function featureLabel(key: string): string {
  return ALL_ROUTE_KEYS.find((r) => r.key === key)?.label ?? key;
}
