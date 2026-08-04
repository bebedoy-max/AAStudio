// Checkout: QRIS dinamis internal (dari QRIS statis merchant) dengan nominal
// unik. Pembayarannya diverifikasi otomatis oleh Companion Android yang membaca
// notifikasi GoPay Merchant, jadi panel ini cuma memantau status pesanan.
import { useEffect, useState } from "react";
import { Loader2, QrCode, CircleCheck, Download, Clock, CircleX } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toDynamicQris } from "@/lib/payments/qris";
import { renderQrDataUrl } from "@/lib/payments/qr-image";
import { getCompanionQris } from "@/lib/payments/qris-store";
import { expireGopayPurchase } from "@/lib/companion/gopay.functions";

/** Batas waktu pembayaran companion (ms) — harus sama dengan sisi server. */
const EXPIRY_MS = 60 * 60 * 1000;

function formatCountdown(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function rupiah(n: number) {
  return "Rp " + (n || 0).toLocaleString("id-ID");
}

export function GopayQrisPanel({
  purchaseRequestId,
  amount,
  createdAt,
  onApproved,
  onExpired,
}: {
  purchaseRequestId: string;
  amount: number;
  createdAt?: string | null;
  onApproved?: () => void;
  onExpired?: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [qr, setQr] = useState<string | null>(null);
  const [merchant, setMerchant] = useState<string | null>(null);
  const [paid, setPaid] = useState(false);
  const [expired, setExpired] = useState(false);
  const deadline =
    (createdAt ? new Date(createdAt).getTime() : Date.now()) + EXPIRY_MS;
  const [remaining, setRemaining] = useState(() => Math.max(0, deadline - Date.now()));

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const row = await getCompanionQris();
        if (!row?.active || !row.static_payload) return;
        const dyn = toDynamicQris(row.static_payload, amount);
        const url = await renderQrDataUrl(dyn, 320);
        if (!alive) return;
        setMerchant(row.merchant_name ?? null);
        setQr(url);
      } catch {
        /* QRIS belum diatur / payload tidak valid — panel disembunyikan */
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [amount]);

  // Hitung mundur batas waktu 1 jam → batalkan otomatis saat habis.
  useEffect(() => {
    if (paid || expired) return;
    const t = setInterval(() => {
      const left = Math.max(0, deadline - Date.now());
      setRemaining(left);
      if (left === 0) {
        setExpired(true);
        void expireGopayPurchase({ data: { purchaseId: purchaseRequestId } }).finally(() => {
          onExpired?.();
        });
      }
    }, 1000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paid, expired, deadline, purchaseRequestId]);

  // Polling status pesanan — Companion menandai lunas dari sisi server.
  useEffect(() => {
    if (paid || expired || !qr) return;
    const t = setInterval(async () => {
      const { data } = await supabase
        .from("purchase_requests")
        .select("status")
        .eq("id", purchaseRequestId)
        .maybeSingle();
      if ((data as { status?: string } | null)?.status === "approved") {
        setPaid(true);
        onApproved?.();
      }
    }, 6000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paid, expired, qr, purchaseRequestId]);

  if (loading) {
    return (
      <div className="grid place-items-center rounded-2xl border border-border bg-card/40 p-6">
        <Loader2 className="h-4 w-4 animate-spin text-primary" />
      </div>
    );
  }
  if (!qr) return null;

  return (
    <div className="rounded-2xl border border-border bg-card/40 p-4">
      <div className="flex items-center gap-2 border-b border-border/60 pb-3">
        <QrCode className="h-4 w-4 text-primary" />
        <div className="text-sm font-semibold">Scan QRIS {merchant ? `· ${merchant}` : ""}</div>
      </div>
      {expired ? (
        <div className="flex flex-col items-center gap-2 py-6 text-destructive">
          <CircleX className="h-8 w-8" />
          <div className="text-sm font-semibold">Waktu pembayaran habis</div>
          <div className="text-center text-[11px] text-muted-foreground">
            Pesanan dibatalkan otomatis setelah 1 jam. Silakan buat pesanan baru.
          </div>
        </div>
      ) : paid ? (
        <div className="flex flex-col items-center gap-2 py-6 text-emerald-200">
          <CircleCheck className="h-8 w-8" />
          <div className="text-sm font-semibold">Pembayaran terverifikasi otomatis</div>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3 pt-4">
          <img
            src={qr}
            alt="QRIS dinamis pembayaran"
            className="h-[240px] w-[240px] rounded-xl bg-white p-2"
          />
          <div className="text-center">
            <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
              Nominal terkunci di QR
            </div>
            <div className="font-display text-xl text-gradient">{rupiah(amount)}</div>
          </div>
          <a
            href={qr}
            download={`qris-${amount}.png`}
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card/50 px-3.5 py-1.5 text-xs hover:bg-sidebar-accent/60"
          >
            <Download className="h-3.5 w-3.5" />
            Simpan QR
          </a>
          <div className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card/50 px-3 py-1 text-xs">
            <Clock className="h-3.5 w-3.5 text-primary" />
            <span className="font-mono">{formatCountdown(remaining)}</span>
            <span className="text-muted-foreground">tersisa</span>
          </div>
          <div className="text-center text-[11px] text-muted-foreground">
            Scan dari aplikasi apa pun (GoPay, DANA, OVO, m-banking). Nominal sudah terisi otomatis
            — jangan diubah. Pesanan disetujui otomatis begitu dana masuk terdeteksi, dan dibatalkan
            otomatis kalau belum dibayar dalam 1 jam.
          </div>
        </div>
      )}
    </div>
  );
}
