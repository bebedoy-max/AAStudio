// Panel pembayaran TemanQRIS. QR + countdown + tombol "Saya sudah bayar"
// (TemanQRIS tidak mendeteksi mutasi bank otomatis, jadi konfirmasi customer
// dipakai untuk memicu webhook; kalau admin mengaktifkan auto verify, pesanan
// langsung disetujui). Status juga dipolling sebagai fallback webhook.
import { useEffect, useRef, useState } from "react";
import { Loader2, CircleCheck, CircleAlert, QrCode, ExternalLink, BadgeCheck } from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { claimTemanQrisPayment, checkTemanQrisStatus } from "@/lib/payments/temanqris.functions";

function rupiah(n: number) {
  return "Rp " + (n || 0).toLocaleString("id-ID");
}

export function TemanQrisPanel({
  purchaseRequestId,
  orderId,
  qrImage,
  paymentUrl,
  amount,
  expiresAt,
  onApproved,
  onBack,
}: {
  purchaseRequestId: string;
  orderId: string;
  qrImage: string | null;
  paymentUrl: string | null;
  amount: number;
  expiresAt: string | null;
  onApproved?: () => void;
  onBack?: () => void;
}) {
  const claimFn = useServerFn(claimTemanQrisPayment);
  const checkFn = useServerFn(checkTemanQrisStatus);
  const [state, setState] = useState<"pending" | "awaiting" | "approved" | "rejected">("pending");
  const [claiming, setClaiming] = useState(false);
  const [now, setNow] = useState(Date.now());
  const notifiedRef = useRef(false);

  function finish(next: "approved" | "rejected") {
    setState(next);
    if (notifiedRef.current) return;
    notifiedRef.current = true;
    if (next === "approved") {
      toast.success("Pembayaran diterima — pesanan diproses!");
      onApproved?.();
    } else {
      toast.error("Pembayaran gagal / kadaluarsa");
    }
  }

  // Countdown + auto expire.
  useEffect(() => {
    const t = setInterval(() => {
      const cur = Date.now();
      setNow(cur);
      if (
        (state === "pending" || state === "awaiting") &&
        expiresAt &&
        new Date(expiresAt).getTime() <= cur
      ) {
        finish("rejected");
      }
    }, 1000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, expiresAt]);

  // Polling: baris supabase dulu (biasanya webhook update lebih cepat),
  // tiap tick ke-3 fallback ke API TemanQRIS.
  useEffect(() => {
    if (state === "approved" || state === "rejected") return;
    let tick = 0;
    const t = setInterval(async () => {
      tick += 1;
      try {
        const { data } = await supabase
          .from("purchase_requests")
          .select("status")
          .eq("id", purchaseRequestId)
          .maybeSingle();
        const st = (data as { status?: string } | null)?.status;
        if (st === "approved") return finish("approved");
        if (st === "rejected") return finish("rejected");
        if (tick % 3 === 0) {
          const r = await checkFn({ data: { purchaseRequestId } });
          if (r.status === "approved") return finish("approved");
          if (r.status === "rejected") return finish("rejected");
          if (r.status === "awaiting_confirmation") setState("awaiting");
        }
      } catch {
        /* silent — retry */
      }
    }, 5000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, purchaseRequestId]);

  async function claim() {
    setClaiming(true);
    try {
      const r = await claimFn({ data: { purchaseRequestId } });
      if (r.status === "approved") return finish("approved");
      setState("awaiting");
      toast.success("Konfirmasi terkirim — menunggu verifikasi pembayaran.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal mengirim konfirmasi");
    } finally {
      setClaiming(false);
    }
  }

  const secondsLeft = expiresAt
    ? Math.max(0, Math.floor((new Date(expiresAt).getTime() - now) / 1000))
    : null;
  const mm = secondsLeft != null ? String(Math.floor(secondsLeft / 60)).padStart(2, "0") : null;
  const ss = secondsLeft != null ? String(secondsLeft % 60).padStart(2, "0") : null;

  if (state === "approved") {
    return (
      <div className="rounded-2xl border border-emerald-400/40 bg-emerald-400/5 p-6 flex flex-col items-center gap-2 text-emerald-200">
        <CircleCheck className="h-8 w-8" />
        <div className="font-semibold">Pembayaran diterima</div>
        <div className="text-xs opacity-80">Pesanan otomatis diproses.</div>
      </div>
    );
  }

  if (state === "rejected") {
    return (
      <div className="rounded-2xl border border-rose-400/40 bg-rose-400/5 p-6 flex flex-col items-center gap-2 text-rose-200">
        <CircleAlert className="h-8 w-8" />
        <div className="font-semibold">Pembayaran gagal atau kadaluarsa</div>
        {onBack && (
          <button
            onClick={onBack}
            className="mt-2 text-[11px] text-muted-foreground hover:text-foreground underline"
          >
            Pilih metode lain
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-card/40 p-4 flex flex-col items-center gap-3">
      <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
        <QrCode className="h-3.5 w-3.5 text-primary" /> Scan QRIS (TemanQRIS)
      </div>
      {qrImage ? (
        <img
          src={qrImage}
          alt="QRIS TemanQRIS"
          className="max-h-64 w-64 rounded-xl border border-border bg-white p-3"
        />
      ) : (
        paymentUrl && (
          <a
            href={paymentUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-full px-5 py-2 text-sm font-semibold text-primary-foreground"
            style={{ background: "var(--gradient-neon)" }}
          >
            Buka halaman pembayaran <ExternalLink className="h-4 w-4" />
          </a>
        )
      )}
      <div className="text-center">
        <div className="font-display text-xl text-gradient">{rupiah(amount)}</div>
        <div className="text-[11px] text-muted-foreground font-mono">Order: {orderId}</div>
        {secondsLeft != null && secondsLeft > 0 && (
          <div className="mt-1 text-[11px] text-amber-300 font-mono">
            Kadaluarsa dalam {mm}:{ss}
          </div>
        )}
      </div>

      {state === "awaiting" ? (
        <div className="flex flex-col items-center gap-1 text-[11px] text-amber-200">
          <div className="flex items-center gap-1.5">
            <Loader2 className="h-3 w-3 animate-spin" /> Menunggu verifikasi pembayaran…
          </div>
          <div className="text-muted-foreground text-center max-w-xs">
            Status akan otomatis berubah begitu pembayaran terverifikasi.
          </div>
        </div>
      ) : (
        <>
          <button
            onClick={claim}
            disabled={claiming}
            className="inline-flex items-center gap-1.5 rounded-full px-5 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
            style={{ background: "var(--gradient-neon)" }}
          >
            {claiming ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <BadgeCheck className="h-4 w-4" />
            )}
            Saya sudah bayar
          </button>
          <div className="text-[11px] text-muted-foreground text-center max-w-xs">
            Scan QR di atas dengan aplikasi bank / e-wallet, lalu tekan tombol ini supaya
            pembayaran diverifikasi otomatis.
          </div>
          {paymentUrl && (
            <a
              href={paymentUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[11px] text-muted-foreground hover:text-foreground underline inline-flex items-center gap-1"
            >
              Buka halaman TemanQRIS <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </>
      )}
      {onBack && (
        <button
          onClick={onBack}
          className="text-[11px] text-muted-foreground hover:text-foreground underline"
        >
          Pilih metode lain
        </button>
      )}
    </div>
  );
}
