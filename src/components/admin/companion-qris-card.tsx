// Admin: QRIS statis merchant (GoPay Merchant) -> generator QRIS dinamis internal.
// Admin cukup upload gambar QR statis (atau paste payload); sistem membaca
// payload EMVCo, memvalidasi CRC, lalu membuat QR baru bernominal unik tiap
// transaksi. Auto-verify pembayarannya dikerjakan Companion Android.
import { useEffect, useRef, useState } from "react";
import { Loader2, QrCode, Upload, Save, TriangleAlert, Eye } from "lucide-react";
import { toast } from "sonner";
import { validateQris, toDynamicQris } from "@/lib/payments/qris";
import { decodeQrFromFile, renderQrDataUrl } from "@/lib/payments/qr-image";
import { getCompanionQris, saveCompanionQris } from "@/lib/payments/qris-store";

const PREVIEW_AMOUNT = 50123;

export function CompanionQrisCard() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [payload, setPayload] = useState("");
  const [active, setActive] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [decoding, setDecoding] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    (async () => {
      try {
        const row = await getCompanionQris();
        setPayload(row?.static_payload ?? "");
        setActive(Boolean(row?.active));
      } catch {
        /* tabel belum dibuat — biarkan kosong */
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const check = payload.trim() ? validateQris(payload) : null;

  useEffect(() => {
    if (!check?.ok) return setPreview(null);
    let alive = true;
    (async () => {
      try {
        const dyn = toDynamicQris(payload, PREVIEW_AMOUNT);
        const url = await renderQrDataUrl(dyn, 260);
        if (alive) setPreview(url);
      } catch {
        if (alive) setPreview(null);
      }
    })();
    return () => {
      alive = false;
    };
  }, [payload, check?.ok]);

  async function onFile(file: File | null) {
    if (!file) return;
    setDecoding(true);
    try {
      const text = await decodeQrFromFile(file);
      if (!text) return toast.error("QR tidak terbaca — coba gambar yang lebih tajam.");
      const v = validateQris(text);
      if (!v.ok) return toast.error(v.error);
      setPayload(text.trim());
      toast.success(`QRIS terbaca: ${v.merchantName ?? "merchant"}`);
    } catch {
      toast.error("Gagal membaca gambar QR.");
    } finally {
      setDecoding(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function save() {
    const trimmed = payload.trim();
    if (trimmed && !validateQris(trimmed).ok) {
      return toast.error("Payload QRIS tidak valid — perbaiki dulu.");
    }
    setSaving(true);
    try {
      const v = trimmed ? validateQris(trimmed) : null;
      await saveCompanionQris({
        static_payload: trimmed || null,
        merchant_name: v?.ok ? v.merchantName : null,
        merchant_city: v?.ok ? v.city : null,
        active: Boolean(trimmed) && active,
      });
      toast.success("QRIS merchant tersimpan");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal menyimpan");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-3xl border border-border bg-card/40 p-4">
      <div className="flex flex-wrap items-start gap-3 border-b border-border/60 pb-3">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-2xl border border-primary/40 bg-primary/10">
          <QrCode className="h-4 w-4 text-primary" />
        </div>
        <div className="min-w-[220px] flex-1">
          <div className="font-display text-base">QRIS Dinamis Internal</div>
          <div className="text-[11px] text-muted-foreground">
            Upload gambar QRIS statis GoPay Merchant sekali. Sistem membuat QR baru bernominal unik
            untuk setiap pesanan — tanpa TemanQRIS, tanpa MDR tambahan.
          </div>
        </div>
        <span
          className={`rounded-full border px-2.5 py-1 text-[10px] font-mono ${
            active && check?.ok
              ? "border-emerald-400/40 text-emerald-300"
              : "border-border text-muted-foreground"
          }`}
        >
          {active && check?.ok ? "Aktif" : "Nonaktif"}
        </span>
      </div>

      {loading ? (
        <div className="grid place-items-center p-8">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        </div>
      ) : (
        <div className="grid gap-4 pt-4 md:grid-cols-[minmax(0,1fr)_260px]">
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => fileRef.current?.click()}
                disabled={decoding}
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card/50 px-3.5 py-1.5 text-xs hover:bg-sidebar-accent/60 disabled:opacity-60"
              >
                {decoding ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Upload className="h-3.5 w-3.5" />
                )}
                Upload gambar QR statis
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => void onFile(e.target.files?.[0] ?? null)}
              />
              <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={active}
                  onChange={(e) => setActive(e.target.checked)}
                  className="h-3.5 w-3.5 accent-[color:var(--primary)]"
                />
                Aktifkan di halaman checkout
              </label>
            </div>

            {check && !check.ok && (
              <div className="flex items-start gap-2 rounded-2xl border border-destructive/40 bg-destructive/5 p-3 text-[11px] text-destructive">
                <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {check.error}
              </div>
            )}


            <div className="flex justify-end">
              <button
                onClick={() => void save()}
                disabled={saving}
                className="inline-flex items-center gap-1.5 rounded-full px-5 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-60"
                style={{ background: "var(--gradient-neon)" }}
              >
                {saving ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Save className="h-3.5 w-3.5" />
                )}
                Simpan
              </button>
            </div>
          </div>

          <div className="flex flex-col items-center gap-2 rounded-2xl border border-border bg-background/40 p-4">
            <div className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
              <Eye className="h-3 w-3" />
              Pratinjau dinamis
            </div>
            {preview ? (
              <>
                <img
                  src={preview}
                  alt="Pratinjau QRIS dinamis dengan nominal contoh"
                  className="h-[200px] w-[200px] rounded-xl bg-white p-1"
                />
                <div className="text-[11px] text-muted-foreground">
                  Contoh nominal{" "}
                  <b className="font-mono text-foreground">
                    Rp {PREVIEW_AMOUNT.toLocaleString("id-ID")}
                  </b>
                </div>
              </>
            ) : (
              <div className="grid h-[200px] w-[200px] place-items-center rounded-xl border border-dashed border-border text-center text-[11px] text-muted-foreground">
                Belum ada payload valid
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
