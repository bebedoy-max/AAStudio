// Shared QRIS payment panel. Given a pending purchase_request id, creates a
// Midtrans QRIS charge on mount, shows the QR image + expiry countdown, and
// polls status until approved/rejected. Auto-fulfillment happens server-side
// via Midtrans webhook; polling is a fallback in case the webhook is delayed.
import { useEffect, useRef, useState } from "react";
import { Loader2, CircleCheck, CircleAlert, QrCode, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { createMidtransQris, checkMidtransStatus } from "@/lib/midtrans/midtrans.functions";

type Status = "loading" | "pending" | "approved" | "rejected" | "error";

function rupiah(n: number) {
  return "Rp " + (n || 0).toLocaleString("id-ID");
}

export function MidtransQrisPanel({
  purchaseRequestId,
  amount,
  onApproved,
}: {
  purchaseRequestId: string;
  amount: number;
  onApproved?: () => void;
}) {
  const createFn = useServerFn(createMidtransQris);
  const checkFn = useServerFn(checkMidtransStatus);
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>("loading");
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const notifiedRef = useRef(false);

  async function bootstrap() {
    setStatus("loading");
    setErrMsg(null);
    try {
      const r = await createFn({ data: { purchaseRequestId } });
      setQrUrl(r.qrUrl);
      setOrderId(r.orderId);
      setExpiresAt(r.expiresAt ?? null);
      setStatus("pending");
    } catch (e) {
      setErrMsg(e instanceof Error ? e.message : "Gagal membuat QRIS");
      setStatus("error");
    }
  }

  useEffect(() => {
    bootstrap();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [purchaseRequestId]);

  // Countdown ticker + auto-expire ke rejected saat waktu habis.
  useEffect(() => {
    const t = setInterval(() => {
      const cur = Date.now();
      setNow(cur);
      if (
        status === "pending" &&
        expiresAt &&
        new Date(expiresAt).getTime() <= cur
      ) {
        finish("rejected");
      }
    }, 1000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, expiresAt]);

  // Poll status: prefer supabase row (webhook usually updates it first),
  // fall back to Midtrans /status endpoint every 3rd tick.
  useEffect(() => {
    if (status !== "pending") return;
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
        }
      } catch {
        /* silent — retry next tick */
      }
    }, 5000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, purchaseRequestId]);

  function finish(next: "approved" | "rejected") {
    setStatus(next);
    if (next === "approved" && !notifiedRef.current) {
      notifiedRef.current = true;
      toast.success("Pembayaran diterima — pesanan diproses!");
      onApproved?.();
    }
    if (next === "rejected" && !notifiedRef.current) {
      notifiedRef.current = true;
      toast.error("Pembayaran gagal / kadaluarsa");
    }
  }

  const secondsLeft = expiresAt
    ? Math.max(0, Math.floor((new Date(expiresAt).getTime() - now) / 1000))
    : null;
  const mm = secondsLeft != null ? String(Math.floor(secondsLeft / 60)).padStart(2, "0") : null;
  const ss = secondsLeft != null ? String(secondsLeft % 60).padStart(2, "0") : null;

  if (status === "loading") {
    return (
      <div className="rounded-2xl border border-border bg-card/40 p-6 grid place-items-center gap-3">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
        <div className="text-xs text-muted-foreground">Membuat kode QRIS…</div>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="rounded-2xl border border-rose-400/40 bg-rose-400/5 p-4 text-sm text-rose-200">
        <div className="font-semibold mb-1">Gagal membuat QRIS</div>
        <div className="text-xs opacity-80">{errMsg}</div>
        <button
          onClick={bootstrap}
          className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-border bg-card/50 px-3 py-1.5 text-xs hover:bg-card"
        >
          <RefreshCw className="h-3 w-3" /> Coba lagi
        </button>
      </div>
    );
  }

  if (status === "approved") {
    return (
      <div className="rounded-2xl border border-emerald-400/40 bg-emerald-400/5 p-6 flex flex-col items-center gap-2 text-emerald-200">
        <CircleCheck className="h-8 w-8" />
        <div className="font-semibold">Pembayaran diterima</div>
        <div className="text-xs opacity-80">Pesanan otomatis diproses.</div>
      </div>
    );
  }

  if (status === "rejected") {
    return (
      <div className="rounded-2xl border border-rose-400/40 bg-rose-400/5 p-6 flex flex-col items-center gap-2 text-rose-200">
        <CircleAlert className="h-8 w-8" />
        <div className="font-semibold">Pembayaran gagal atau kadaluarsa</div>
        <button
          onClick={bootstrap}
          className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-border bg-card/50 px-3 py-1.5 text-xs text-foreground hover:bg-card"
        >
          <RefreshCw className="h-3 w-3" /> Buat QR baru
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-card/40 p-4 flex flex-col items-center gap-3">
      <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
        <QrCode className="h-3.5 w-3.5 text-primary" /> Scan QRIS untuk membayar
      </div>
      {qrUrl && (
        <img
          src={qrUrl}
          alt="QRIS"
          className="max-h-64 w-64 rounded-xl border border-border bg-white p-3"
        />
      )}
      <div className="text-center">
        <div className="font-display text-xl text-gradient">{rupiah(amount)}</div>
        <div className="text-[11px] text-muted-foreground font-mono">
          Order: {orderId}
        </div>
        {secondsLeft != null && secondsLeft > 0 && (
          <div className="mt-1 text-[11px] text-amber-300 font-mono">
            Kadaluarsa dalam {mm}:{ss}
          </div>
        )}
      </div>
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin text-primary" />
        Menunggu pembayaran… status otomatis diperbarui.
      </div>
    </div>
  );
}
