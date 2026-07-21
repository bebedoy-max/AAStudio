// UI picker metode pembayaran + panel DOKU (redirect) / Midtrans (QRIS inline).
// Dipakai oleh CheckoutDialog dan BuyTokenDialog.
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Loader2,
  QrCode,
  CreditCard,
  Wallet,
  Landmark,
  Store,
  ExternalLink,
  CircleCheck,
  CircleAlert,
} from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { listActivePaymentMethods, type ActivePaymentMethod } from "@/lib/payments/methods.functions";
import { createPayment, pollPurchaseStatus } from "@/lib/payments/charge.functions";
import { MidtransQrisPanel } from "@/components/payments/midtrans-qris-panel";

function rupiah(n: number) {
  return "Rp " + (n || 0).toLocaleString("id-ID");
}

function iconFor(kind: ActivePaymentMethod["kind"]) {
  switch (kind) {
    case "qris":
      return QrCode;
    case "card":
      return CreditCard;
    case "ewallet":
      return Wallet;
    case "convenience":
      return Store;
    case "direct_debit":
    case "va":
    default:
      return Landmark;
  }
}

type Selection = { method: ActivePaymentMethod } | null;

export function PaymentPicker({
  purchaseRequestId,
  amount,
  onApproved,
}: {
  purchaseRequestId: string;
  amount: number;
  onApproved?: () => void;
}) {
  const listFn = useServerFn(listActivePaymentMethods);
  const chargeFn = useServerFn(createPayment);
  const pollFn = useServerFn(pollPurchaseStatus);
  const [methods, setMethods] = useState<ActivePaymentMethod[] | null>(null);
  const [selected, setSelected] = useState<Selection>(null);
  const [creating, setCreating] = useState(false);
  const [dokuRedirect, setDokuRedirect] = useState<{
    url: string;
    invoice: string;
    expiresAt: string | null;
  } | null>(null);
  const [midtrans, setMidtrans] = useState<boolean>(false); // sekali user pilih QRIS midtrans, render panel
  const [approved, setApproved] = useState(false);
  const notifiedRef = useRef(false);

  useEffect(() => {
    (async () => {
      try {
        const list = await listFn();
        setMethods(list);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Gagal memuat metode pembayaran");
        setMethods([]);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Poll status supaya redirect DOKU kembali → dialog auto refresh.
  useEffect(() => {
    if (approved) return;
    const t = setInterval(async () => {
      try {
        const { data } = await supabase
          .from("purchase_requests")
          .select("status")
          .eq("id", purchaseRequestId)
          .maybeSingle();
        const st = (data as { status?: string } | null)?.status;
        if (st === "approved") return finalize("approved");
        if (st === "rejected") return finalize("rejected");
        // fallback (setiap 3 tick) via server fn
      } catch {
        /* silent */
      }
    }, 4000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [purchaseRequestId, approved]);

  function finalize(next: "approved" | "rejected") {
    if (notifiedRef.current) return;
    notifiedRef.current = true;
    if (next === "approved") {
      setApproved(true);
      toast.success("Pembayaran diterima — pesanan diproses!");
      onApproved?.();
    } else {
      toast.error("Pembayaran gagal / kadaluarsa");
    }
  }

  const grouped = useMemo(() => {
    const map = new Map<string, ActivePaymentMethod[]>();
    for (const m of methods ?? []) {
      const key = `${m.provider}::${m.providerLabel}::${m.environment}`;
      const arr = map.get(key) ?? [];
      arr.push(m);
      map.set(key, arr);
    }
    return Array.from(map.entries());
  }, [methods]);

  async function pick(m: ActivePaymentMethod) {
    setSelected({ method: m });
    setCreating(true);
    try {
      const r = await chargeFn({
        data: {
          purchaseRequestId,
          gatewayId: m.gatewayId,
          provider: m.provider as "midtrans" | "doku",
          methodCode: m.methodCode,
        },
      });
      if (r.mode === "redirect") {
        setDokuRedirect({ url: r.redirectUrl, invoice: r.invoiceNumber, expiresAt: r.expiresAt });
      } else if (r.mode === "inline_qris") {
        setMidtrans(true);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal memulai pembayaran");
      setSelected(null);
    } finally {
      setCreating(false);
    }
  }

  if (approved) {
    return (
      <div className="rounded-2xl border border-emerald-400/40 bg-emerald-400/5 p-6 flex flex-col items-center gap-2 text-emerald-200">
        <CircleCheck className="h-8 w-8" />
        <div className="font-semibold">Pembayaran diterima</div>
        <div className="text-xs opacity-80">Pesanan otomatis diproses.</div>
      </div>
    );
  }

  // Midtrans QRIS inline: reuse existing panel yang sudah polling sendiri.
  if (midtrans) {
    return (
      <MidtransQrisPanel
        purchaseRequestId={purchaseRequestId}
        amount={amount}
        onApproved={() => finalize("approved")}
      />
    );
  }

  // DOKU redirect card
  if (dokuRedirect && selected) {
    return (
      <div className="rounded-2xl border border-border bg-card/40 p-5 flex flex-col items-center gap-3 text-center">
        <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
          Metode dipilih
        </div>
        <div className="font-semibold text-lg">{selected.method.methodLabel}</div>
        <div className="text-xs text-muted-foreground">
          Invoice: <span className="font-mono">{dokuRedirect.invoice}</span>
        </div>
        <div className="font-display text-2xl text-gradient">{rupiah(amount)}</div>
        <a
          href={dokuRedirect.url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 inline-flex items-center gap-1.5 rounded-full px-5 py-2 text-sm font-semibold text-primary-foreground"
          style={{ background: "var(--gradient-neon)" }}
        >
          Bayar sekarang <ExternalLink className="h-4 w-4" />
        </a>
        <div className="text-[11px] text-muted-foreground max-w-sm">
          Halaman pembayaran DOKU akan terbuka di tab baru. Setelah membayar, kembali ke sini —
          status akan diperbarui otomatis.
        </div>
        <div className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin text-primary" />
          Menunggu konfirmasi pembayaran…
        </div>
        <button
          onClick={() => {
            setDokuRedirect(null);
            setSelected(null);
          }}
          className="mt-1 text-[11px] text-muted-foreground hover:text-foreground underline"
        >
          Pilih metode lain
        </button>
      </div>
    );
  }

  if (!methods) {
    return (
      <div className="rounded-2xl border border-border bg-card/40 p-6 grid place-items-center gap-3">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
        <div className="text-xs text-muted-foreground">Memuat metode pembayaran…</div>
      </div>
    );
  }

  if (methods.length === 0) {
    return (
      <div className="rounded-2xl border border-rose-400/40 bg-rose-400/5 p-4 text-sm text-rose-200 flex items-start gap-2">
        <CircleAlert className="h-4 w-4 mt-0.5" />
        <div>
          Belum ada metode pembayaran aktif. Admin dapat mengaktifkan di{" "}
          <span className="font-mono">/admin/payments</span>.
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {grouped.map(([key, items]) => {
        const [provider, providerLabel, env] = key.split("::");
        return (
          <div key={key} className="rounded-2xl border border-border bg-card/40 p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                {providerLabel}
              </div>
              {env === "sandbox" && (
                <span className="text-[9px] font-mono uppercase tracking-wider px-2 py-0.5 rounded-full border border-amber-400/40 text-amber-300">
                  Sandbox
                </span>
              )}
              {env !== "sandbox" && (
                <span className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground/60">
                  {provider}
                </span>
              )}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {items.map((m) => {
                const Icon = iconFor(m.kind);
                const active = selected?.method === m;
                return (
                  <button
                    key={`${m.gatewayId}-${m.methodCode}`}
                    onClick={() => pick(m)}
                    disabled={creating}
                    className={[
                      "group flex items-center gap-2 rounded-xl border px-3 py-2.5 text-left transition-all",
                      active
                        ? "border-primary bg-primary/10 text-foreground"
                        : "border-border bg-card/60 hover:border-primary/60 hover:bg-primary/[0.06]",
                      creating ? "opacity-60 cursor-wait" : "",
                    ].join(" ")}
                  >
                    <span
                      className={[
                        "h-8 w-8 grid place-items-center rounded-lg shrink-0",
                        active ? "bg-primary/20 text-primary" : "bg-sidebar-accent/60 border border-border",
                      ].join(" ")}
                    >
                      {creating && active ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Icon className="h-4 w-4" />
                      )}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium leading-tight truncate">{m.methodLabel}</div>
                      <div className="text-[10px] text-muted-foreground/70 font-mono truncate">
                        {m.methodCode}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
      <div className="text-[10px] text-muted-foreground text-center">
        Total dibayar: <span className="font-display text-sm text-gradient">{rupiah(amount)}</span>
      </div>
    </div>
  );
}
