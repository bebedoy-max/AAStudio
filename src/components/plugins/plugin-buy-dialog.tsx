// Dialog pembelian plug-in premium. Membuat satu purchase_request dengan
// route_key `plugin:<id>` lalu membayar via QRIS. Ketika status approved,
// tombol "Beli" di katalog otomatis berubah jadi "Unduh".
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X, Loader2, CircleCheck } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useServerFn } from "@tanstack/react-start";
import { ensureGopayAmount } from "@/lib/companion/gopay.functions";
import { GopayQrisPanel } from "@/components/payments/gopay-qris-panel";

export const PLUGIN_ROUTE_PREFIX = "plugin:";

export function pluginRouteKey(pluginId: string) {
  return `${PLUGIN_ROUTE_PREFIX}${pluginId}`;
}

function rupiah(n: number) {
  return "Rp " + (n || 0).toLocaleString("id-ID");
}

type Order = { id: string; status: string };

export function PluginBuyDialog({
  pluginId,
  name,
  price,
  onClose,
  onApproved,
}: {
  pluginId: string;
  name: string;
  price: number;
  onClose: () => void;
  onApproved: () => void;
}) {
  const { user } = useAuth();
  const [order, setOrder] = useState<Order | null>(null);
  const [gopayAmount, setGopayAmount] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [done, setDone] = useState(false);
  const assignGopay = useServerFn(ensureGopayAmount);

  useEffect(() => {
    if (order || creating || !user || price <= 0) return;
    void create();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, price]);

  async function create() {
    if (!user) return;
    setCreating(true);
    try {
      const { data, error } = await supabase
        .from("purchase_requests")
        .insert({
          user_id: user.id,
          route_key: pluginRouteKey(pluginId),
          price_idr: price,
          note: `Plug-IN ${name}`,
          status: "pending",
        } as never)
        .select("id, status")
        .single();
      if (error) throw error;
      const row = data as unknown as Order;
      setOrder(row);
      try {
        const unique = await assignGopay({ data: { purchaseId: row.id } });
        setGopayAmount(unique?.amount ?? null);
      } catch {
        setGopayAmount(null);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal membuat pesanan");
    } finally {
      setCreating(false);
    }
  }

  async function refreshStatus() {
    if (!order) return;
    const { data } = await supabase
      .from("purchase_requests")
      .select("status")
      .eq("id", order.id)
      .maybeSingle();
    const st = (data as { status?: string } | null)?.status;
    if (st && st !== order.status) {
      setOrder({ ...order, status: st });
      if (st === "approved") {
        setDone(true);
        onApproved();
        toast.success("Pembayaran terverifikasi — plug-in siap diunduh");
      }
    }
  }

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[70] grid place-items-center bg-background/80 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="neumorph w-full max-w-lg max-h-[92vh] overflow-y-auto p-6 relative"
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
          Beli <span className="text-gradient">{name}</span>
        </h2>

        <div className="mt-4 rounded-2xl border border-border bg-card/40 p-4 flex items-center justify-between">
          <span className="text-sm text-foreground/90">Harga plug-in</span>
          <span className="font-display text-xl text-gradient">{rupiah(price)}</span>
        </div>

        {!user ? (
          <div className="mt-5 text-sm text-muted-foreground">Silakan login terlebih dahulu.</div>
        ) : done || order?.status === "approved" ? (
          <div className="mt-5 rounded-2xl border border-emerald-400/40 bg-emerald-400/5 p-6 flex flex-col items-center gap-2 text-emerald-200">
            <CircleCheck className="h-8 w-8" />
            <div className="font-semibold">Pembayaran berhasil</div>
            <div className="text-xs opacity-80">Tutup dialog lalu klik tombol Unduh.</div>
          </div>
        ) : order && gopayAmount !== null ? (
          <div className="mt-5">
            <GopayQrisPanel
              purchaseRequestId={order.id}
              amount={gopayAmount}
              onApproved={refreshStatus}
            />
          </div>
        ) : (
          <div className="py-12 grid place-items-center gap-2">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <div className="text-xs text-muted-foreground">Menyiapkan pembayaran…</div>
          </div>
        )}

        <div className="mt-5 flex justify-end">
          <button
            onClick={onClose}
            className="rounded-full border border-border bg-card/50 px-4 py-2 text-sm hover:bg-sidebar-accent/60"
          >
            {done ? "Selesai" : "Tutup"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
