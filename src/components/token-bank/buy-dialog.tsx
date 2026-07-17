// User-facing "Beli Token" dialog: multi-provider cart, Midtrans QRIS auto-fulfill.
// Creates ONE purchase_request carrying the cart items in the note field,
// then generates a dynamic QRIS via Midtrans and shows it inline. On payment
// settlement, the Midtrans webhook auto-fulfills the order and pushes keys
// to Token Manager without any admin approval.
import { useEffect, useMemo, useState } from "react";
import {
  X,
  Loader2,
  CircleCheck,
  ShoppingBag,
  Plus,
  Minus,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import {
  BANK_PROVIDERS,
  PROVIDER_LABELS,
  type BankProvider,
  listBankPrices,
  listBankStock,
} from "@/lib/token-bank/bank.functions";
import { MidtransQrisPanel } from "@/components/payments/midtrans-qris-panel";

function rupiah(n: number) {
  return "Rp " + n.toLocaleString("id-ID");
}

export type CartItem = { provider: BankProvider; qty: number };

type OrderInfo = {
  id: string;
  items: CartItem[];
  total: number;
  status: "pending" | "approved" | "rejected";
};

// Serialize cart items into the request note so the server fulfillment can
// deliver every provider without a schema change.
export const CART_MARKER = "[TOKEN_BANK_CART]";
export function encodeCartInNote(items: CartItem[], label: string) {
  return `${label} ${CART_MARKER}${JSON.stringify(items)}`;
}
export function decodeCartFromNote(note: string | null | undefined): CartItem[] | null {
  if (!note) return null;
  const i = note.indexOf(CART_MARKER);
  if (i < 0) return null;
  try {
    const json = note.slice(i + CART_MARKER.length);
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed)) return null;
    return parsed
      .map((r) => ({ provider: String(r?.provider) as BankProvider, qty: Number(r?.qty) || 0 }))
      .filter((r) => r.qty > 0);
  } catch {
    return null;
  }
}

export function BuyTokenDialog({ onClose }: { onClose: () => void }) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [prices, setPrices] = useState<Record<string, { price_idr: number; is_active: boolean }>>({});
  const [stock, setStock] = useState<Record<string, number>>({});
  const [cart, setCart] = useState<Record<string, number>>({});
  const [submitting, setSubmitting] = useState(false);
  const [order, setOrder] = useState<OrderInfo | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [prSettled, stSettled] = await Promise.all([
          listBankPrices().catch(() => [] as Awaited<ReturnType<typeof listBankPrices>>),
          listBankStock().catch(() => ({}) as Record<string, number>),
        ]);
        const priceMap: Record<string, { price_idr: number; is_active: boolean }> = {};
        for (const p of prSettled) priceMap[p.provider] = { price_idr: p.price_idr, is_active: p.is_active };
        setPrices(priceMap);
        setStock(stSettled);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Gagal memuat katalog");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const catalog = useMemo(() => {
    return BANK_PROVIDERS.filter((p) => {
      const price = prices[p];
      if (!price || !price.is_active || price.price_idr <= 0) return false;
      return true;
    });
  }, [prices]);

  const cartItems: CartItem[] = useMemo(() => {
    const out: CartItem[] = [];
    for (const p of BANK_PROVIDERS) {
      const q = cart[p] ?? 0;
      if (q > 0) out.push({ provider: p, qty: q });
    }
    return out;
  }, [cart]);

  const total = useMemo(() => {
    let t = 0;
    for (const item of cartItems) t += (prices[item.provider]?.price_idr ?? 0) * item.qty;
    return t;
  }, [cartItems, prices]);
  const totalKeys = cartItems.reduce((a, x) => a + x.qty, 0);

  function bumpQty(p: BankProvider, delta: number) {
    setCart((c) => {
      const max = stock[p] ?? 0;
      const next = Math.max(0, Math.min(max, (c[p] ?? 0) + delta));
      return { ...c, [p]: next };
    });
  }
  function setQty(p: BankProvider, v: number) {
    setCart((c) => {
      const max = stock[p] ?? 0;
      return { ...c, [p]: Math.max(0, Math.min(max, Math.floor(Number(v) || 0))) };
    });
  }

  async function createOrder() {
    if (!user) return;
    if (cartItems.length === 0) return toast.error("Pilih minimal 1 token");
    for (const item of cartItems) {
      const s = stock[item.provider] ?? 0;
      if (item.qty > s) return toast.error(`Stok ${PROVIDER_LABELS[item.provider]} tinggal ${s}`);
    }
    setSubmitting(true);
    try {
      const primary = cartItems[0];
      const label = cartItems
        .map((c) => `${c.qty}× ${PROVIDER_LABELS[c.provider]}`)
        .join(", ");
      const row = {
        user_id: user.id,
        route_key: `token_bank.cart`,
        price_idr: total,
        payment_method_id: null,
        payment_method_name: "QRIS (Midtrans)",
        note: encodeCartInNote(cartItems, `[TOKEN BANK] ${label}`),
        status: "pending" as const,
        request_kind: "token_bank",
        token_provider: primary.provider,
        token_qty: primary.qty,
      };
      const { data, error } = await supabase
        .from("purchase_requests")
        .insert(row as never)
        .select("id, status")
        .single();
      if (error) throw error;
      const inserted = data as { id: string; status: OrderInfo["status"] };
      setOrder({ id: inserted.id, items: cartItems, total, status: inserted.status });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal membuat pesanan");
    } finally {
      setSubmitting(false);
    }
  }

  // Refresh row status when panel signals approval (also drives close-button label).
  async function refreshStatus() {
    if (!order) return;
    const { data } = await supabase
      .from("purchase_requests")
      .select("status")
      .eq("id", order.id)
      .maybeSingle();
    const st = (data as { status?: OrderInfo["status"] } | null)?.status;
    if (st && st !== order.status) setOrder({ ...order, status: st });
  }

  return (
    <div
      className="fixed inset-0 z-[70] grid place-items-center bg-background/80 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="neumorph w-full max-w-2xl max-h-[92vh] overflow-y-auto p-6 relative"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-3 right-3 h-9 w-9 grid place-items-center rounded-full border border-border bg-card/50 hover:bg-sidebar-accent/60"
        >
          <X className="h-4 w-4" />
        </button>
        <div className="text-[11px] font-mono uppercase tracking-[0.25em] text-muted-foreground">
          Token Bank
        </div>
        <h2 className="mt-1 font-display text-2xl font-bold">
          Beli <span className="text-gradient">API token</span>
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Pilih beberapa provider sekaligus. Bayar sekali lewat QRIS — token dikirim otomatis.
        </p>

        {loading ? (
          <div className="py-12 grid place-items-center">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          </div>
        ) : order ? (
          <OrderStatusView order={order} onClose={onClose} onApproved={refreshStatus} />
        ) : catalog.length === 0 ? (
          <div className="mt-6 p-6 text-center rounded-2xl border border-border bg-card/40 text-sm text-muted-foreground">
            Belum ada token yang dijual saat ini. Hubungi admin.
          </div>
        ) : (
          <>
            <div className="mt-4">
              <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-2">
                Pilih token
              </div>
              <div className="flex flex-col gap-2">
                {catalog.map((p) => {
                  const q = cart[p] ?? 0;
                  const s = stock[p] ?? 0;
                  const price = prices[p]?.price_idr ?? 0;
                  const disabled = s === 0;
                  return (
                    <div
                      key={p}
                      className={[
                        "flex items-center gap-3 rounded-xl border px-3 py-2.5 transition",
                        q > 0
                          ? "border-primary/60 bg-primary/[0.08]"
                          : "border-border bg-card/40",
                        disabled ? "opacity-60" : "",
                      ].join(" ")}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium">{PROVIDER_LABELS[p]}</div>
                        <div className="text-[11px] text-muted-foreground font-mono">
                          {rupiah(price)} / key ·{" "}
                          {s > 0 ? `stok ${s}` : <span className="text-rose-300">stok habis</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          disabled={disabled || q === 0}
                          onClick={() => bumpQty(p, -1)}
                          className="h-8 w-8 grid place-items-center rounded-full border border-border bg-card/60 hover:bg-sidebar-accent/60 disabled:opacity-40"
                        >
                          <Minus className="h-3.5 w-3.5" />
                        </button>
                        <input
                          type="number"
                          value={q}
                          min={0}
                          max={s}
                          disabled={disabled}
                          onChange={(e) => setQty(p, Number(e.target.value))}
                          className="w-14 rounded-xl border border-border bg-card/50 px-2 py-1 text-sm text-center font-mono outline-none focus:border-primary/60"
                        />
                        <button
                          disabled={disabled || q >= s}
                          onClick={() => bumpQty(p, +1)}
                          className="h-8 w-8 grid place-items-center rounded-full border border-border bg-card/60 hover:bg-sidebar-accent/60 disabled:opacity-40"
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <div className="w-24 text-right font-mono text-xs shrink-0">
                        {q > 0 ? (
                          <span className="text-primary">{rupiah(price * q)}</span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Receipt */}
            <div className="mt-4 rounded-2xl border border-border bg-card/40 p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                  Rincian pembelian
                </div>
                {cartItems.length > 0 && (
                  <button
                    onClick={() => setCart({})}
                    className="inline-flex items-center gap-1 text-[10px] text-rose-300 hover:text-rose-200"
                  >
                    <Trash2 className="h-3 w-3" /> Kosongkan
                  </button>
                )}
              </div>
              {cartItems.length === 0 ? (
                <div className="text-sm text-muted-foreground italic">
                  Belum ada item. Set qty pada baris di atas.
                </div>
              ) : (
                <>
                  <div className="flex flex-col gap-1 text-sm">
                    {cartItems.map((it) => {
                      const price = prices[it.provider]?.price_idr ?? 0;
                      return (
                        <div key={it.provider} className="flex items-center justify-between">
                          <span>{PROVIDER_LABELS[it.provider]}</span>
                          <span className="font-mono text-muted-foreground">
                            {it.qty} × {rupiah(price)} ={" "}
                            <span className="text-foreground">{rupiah(price * it.qty)}</span>
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  <div className="mt-2 pt-2 border-t border-border/60 flex items-center justify-between">
                    <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                      Total bayar ({totalKeys} key)
                    </span>
                    <span className="font-display text-lg text-gradient">{rupiah(total)}</span>
                  </div>
                </>
              )}
            </div>

            <div className="mt-4 rounded-xl border border-border/60 bg-primary/[0.04] p-3 text-[11px] text-muted-foreground">
              Pembayaran diproses otomatis via <b className="text-foreground">QRIS Midtrans</b>.
              Setelah lanjut, kamu akan mendapat kode QR untuk dibayar via GoPay, ShopeePay, Dana,
              OVO, BCA Mobile, atau aplikasi e-wallet/bank lainnya yang mendukung QRIS. Token
              langsung masuk ke Token Manager setelah pembayaran terkonfirmasi.
            </div>

            <div className="mt-6 flex items-center justify-end gap-2 pt-4 border-t border-border/60">
              <button
                onClick={createOrder}
                disabled={submitting || cartItems.length === 0 || total === 0}
                className="inline-flex items-center gap-1.5 rounded-full px-5 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
                style={{ background: "var(--gradient-neon)" }}
              >
                {submitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ShoppingBag className="h-4 w-4" />
                )}
                Lanjut ke QRIS · {rupiah(total)}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function OrderStatusView({
  order,
  onClose,
  onApproved,
}: {
  order: OrderInfo;
  onClose: () => void;
  onApproved: () => void;
}) {
  const paid = order.status === "approved";
  return (
    <div className="mt-5 flex flex-col gap-4">
      <div className="rounded-2xl border border-border bg-card/40 p-4">
        <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-2">
          Rincian pembelian
        </div>
        <div className="flex flex-col gap-1 text-sm">
          {order.items.map((it) => (
            <div key={it.provider} className="flex items-center justify-between">
              <span>{PROVIDER_LABELS[it.provider]}</span>
              <span className="font-mono">{it.qty} key</span>
            </div>
          ))}
        </div>
        <div className="mt-2 pt-2 border-t border-border/60 flex items-center justify-between">
          <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
            Total
          </span>
          <span className="font-display text-lg text-gradient">{rupiah(order.total)}</span>
        </div>
      </div>

      {paid ? (
        <div className="rounded-2xl border border-emerald-400/40 bg-emerald-400/5 p-6 flex flex-col items-center gap-2 text-emerald-200">
          <CircleCheck className="h-8 w-8" />
          <div className="font-semibold">Pembayaran diterima</div>
          <div className="text-xs opacity-80">
            Token sudah dikirim ke Manage → Token / API Manager.
          </div>
        </div>
      ) : (
        <MidtransQrisPanel
          purchaseRequestId={order.id}
          amount={order.total}
          onApproved={onApproved}
        />
      )}

      <div className="flex justify-end">
        <button
          onClick={onClose}
          className="rounded-full border border-border bg-card/50 px-4 py-2 text-sm hover:bg-sidebar-accent/60"
        >
          {paid ? "Selesai" : "Tutup"}
        </button>
      </div>
    </div>
  );
}
