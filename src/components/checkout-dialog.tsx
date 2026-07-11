import { useEffect, useMemo, useState } from "react";
import { X, Upload, Loader2, Copy, Check, QrCode, Landmark, Wallet, CircleDollarSign } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, ALL_ROUTE_KEYS } from "@/lib/auth-context";

type PaymentMethod = {
  id: string;
  type: "qris" | "bank" | "ewallet" | "custom";
  name: string;
  instructions: string | null;
  account_number: string | null;
  account_holder: string | null;
  image_url: string | null;
  is_active: boolean;
  sort_order: number;
};

type FeaturePrice = { route_key: string; label: string; price_idr: number; is_active: boolean };

function rupiah(n: number) {
  return "Rp " + n.toLocaleString("id-ID");
}

const iconByType = {
  qris: QrCode,
  bank: Landmark,
  ewallet: Wallet,
  custom: CircleDollarSign,
} as const;

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
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [methodId, setMethodId] = useState<string>("");
  const [signedImage, setSignedImage] = useState<string | null>(null);
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [proofPreview, setProofPreview] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const [{ data: fp }, { data: pm }] = await Promise.all([
        supabase.from("feature_prices").select("*").in("route_key", featureKeys),
        supabase.from("payment_methods").select("*").eq("is_active", true).order("sort_order"),
      ]);
      setPrices((fp ?? []) as FeaturePrice[]);
      setMethods((pm ?? []) as PaymentMethod[]);
      if ((pm ?? []).length > 0) setMethodId((pm as PaymentMethod[])[0].id);
      setLoading(false);
    })();
  }, [featureKeys.join(",")]);

  const selectedMethod = useMemo(() => methods.find((m) => m.id === methodId) ?? null, [methods, methodId]);

  // Sign QRIS / method image URL
  useEffect(() => {
    setSignedImage(null);
    if (!selectedMethod?.image_url) return;
    (async () => {
      const { data } = await supabase.storage
        .from("payment-assets")
        .createSignedUrl(selectedMethod.image_url!, 3600);
      setSignedImage(data?.signedUrl ?? null);
    })();
  }, [selectedMethod?.image_url]);

  const individualTotal = useMemo(() => prices.reduce((s, p) => s + p.price_idr, 0), [prices]);
  const isBundle = !!bundleLabel && typeof bundlePrice === "number" && bundlePrice > 0;
  const total = isBundle ? (bundlePrice as number) : individualTotal;

  function onProofChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 5 * 1024 * 1024) {
      toast.error("Bukti transfer maksimal 5MB");
      return;
    }
    setProofFile(f);
    setProofPreview(URL.createObjectURL(f));
  }

  async function copy(text: string, key: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      toast.error("Gagal menyalin");
    }
  }

  async function submit() {
    if (!user) return;
    if (!selectedMethod) return toast.error("Pilih metode pembayaran");
    if (!proofFile) return toast.error("Upload bukti pembayaran dulu");
    setSubmitting(true);
    try {
      // Upload proof
      const ext = proofFile.name.split(".").pop() || "png";
      const path = `${user.id}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("payment-proofs")
        .upload(path, proofFile, { upsert: false, contentType: proofFile.type });
      if (upErr) throw upErr;

      // Insert one purchase_request per feature
      const bundleNote = isBundle ? "[BUNDLE: FULL AKSES] " : "";
      const rows = prices.map((p, i) => ({
        user_id: user.id,
        route_key: p.route_key,
        // Bundle mode: attribute the full discount price to the first row, others = 0.
        price_idr: isBundle ? (i === 0 ? (bundlePrice as number) : 0) : p.price_idr,
        payment_method_id: selectedMethod.id,
        payment_method_name: selectedMethod.name,
        proof_image_url: path,
        note: (bundleNote + (note || "")).trim() || null,
        status: "pending" as const,
      }));
      const { error: insErr } = await supabase.from("purchase_requests").insert(rows);
      if (insErr) throw insErr;

      toast.success("Permintaan dikirim! Admin akan memverifikasi pembayaran Anda.");
      onSubmitted?.();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal mengirim permintaan");
    } finally {
      setSubmitting(false);
    }
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
          Selesaikan <span className="text-gradient">pembayaran</span>
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

            {/* Payment methods */}
            <div className="mt-5">
              <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-2">
                Metode pembayaran
              </div>
              {methods.length === 0 ? (
                <div className="text-sm text-muted-foreground p-4 border border-border rounded-xl">
                  Belum ada metode pembayaran aktif. Hubungi admin.
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {methods.map((m) => {
                    const active = m.id === methodId;
                    const Icon = iconByType[m.type];
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setMethodId(m.id)}
                        className={[
                          "flex items-center gap-2 rounded-xl border px-3 py-2.5 text-left transition",
                          active ? "border-primary/60 bg-primary/[0.08]" : "border-border bg-card/40 hover:bg-sidebar-accent/40",
                        ].join(" ")}
                      >
                        <Icon className="h-4 w-4 text-primary shrink-0" />
                        <span className="text-sm truncate">{m.name}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Selected method details */}
            {selectedMethod && (
              <div className="mt-4 rounded-2xl border border-border bg-card/40 p-4">
                {selectedMethod.type === "qris" && signedImage && (
                  <div className="flex flex-col items-center gap-2">
                    <img src={signedImage} alt="QRIS" className="max-h-64 rounded-xl border border-border bg-white p-2" />
                    <div className="text-xs text-muted-foreground">Scan QRIS di atas untuk membayar</div>
                  </div>
                )}
                {selectedMethod.type !== "qris" && (
                  <div className="flex flex-col gap-2">
                    {selectedMethod.account_number && (
                      <div className="flex items-center justify-between rounded-xl border border-border bg-background/40 px-3 py-2.5">
                        <div className="min-w-0">
                          <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Nomor</div>
                          <div className="font-mono text-sm truncate">{selectedMethod.account_number}</div>
                        </div>
                        <button
                          onClick={() => copy(selectedMethod.account_number!, "num")}
                          className="ml-3 inline-flex items-center gap-1 rounded-full border border-border bg-card/50 px-3 py-1.5 text-xs hover:bg-card"
                        >
                          {copied === "num" ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                          Salin
                        </button>
                      </div>
                    )}
                    {selectedMethod.account_holder && (
                      <div className="rounded-xl border border-border bg-background/40 px-3 py-2.5">
                        <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Atas nama</div>
                        <div className="text-sm">{selectedMethod.account_holder}</div>
                      </div>
                    )}
                  </div>
                )}
                {selectedMethod.instructions && (
                  <div className="mt-3 text-xs text-muted-foreground whitespace-pre-line">
                    {selectedMethod.instructions}
                  </div>
                )}
              </div>
            )}

            {/* Proof upload */}
            <div className="mt-5">
              <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-2">
                Bukti pembayaran <span className="text-rose-400">*</span>
              </div>
              <label className="flex items-center gap-3 rounded-2xl border border-dashed border-border bg-card/30 px-4 py-4 cursor-pointer hover:bg-sidebar-accent/40">
                <Upload className="h-4 w-4 text-primary" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm">
                    {proofFile ? proofFile.name : "Klik untuk upload gambar (max 5MB)"}
                  </div>
                  <div className="text-[10px] text-muted-foreground">JPG / PNG</div>
                </div>
                {proofPreview && <img src={proofPreview} alt="preview" className="h-12 w-12 rounded-lg object-cover" />}
                <input
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  onChange={onProofChange}
                />
              </label>
            </div>

            {/* Note */}
            <div className="mt-4">
              <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-2">
                Catatan (opsional)
              </div>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                placeholder="Contoh: Nama pengirim di bukti transfer…"
                className="w-full rounded-2xl border border-border bg-card/50 px-3 py-2.5 text-sm outline-none focus:border-primary/60"
              />
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
                disabled={submitting || !proofFile || !selectedMethod}
                className="inline-flex items-center gap-1.5 rounded-full px-5 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
                style={{ background: "var(--gradient-neon)" }}
              >
                {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                Kirim untuk diverifikasi
              </button>
            </div>
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