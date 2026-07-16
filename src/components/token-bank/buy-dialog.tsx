// User-facing "Beli Token" dialog: pick provider + qty, then reuse the
// existing purchase_requests flow (upload proof → admin approves → keys land
// in Token Manager automatically).
import { useEffect, useMemo, useState } from "react";
import { X, Loader2, Copy, Check, QrCode, Landmark, Wallet, CircleDollarSign, Upload } from "lucide-react";
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

const iconByType = {
  qris: QrCode,
  bank: Landmark,
  ewallet: Wallet,
  custom: CircleDollarSign,
} as const;

function rupiah(n: number) {
  return "Rp " + n.toLocaleString("id-ID");
}

export function BuyTokenDialog({ onClose }: { onClose: () => void }) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [prices, setPrices] = useState<Record<string, { price_idr: number; is_active: boolean }>>({});
  const [stock, setStock] = useState<Record<string, number>>({});
  const [provider, setProvider] = useState<BankProvider | null>(null);
  const [qty, setQty] = useState(1);
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [methodId, setMethodId] = useState("");
  const [signedImage, setSignedImage] = useState<string | null>(null);
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [proofPreview, setProofPreview] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        // Load independently — a failure in one shouldn't hide the whole catalog.
        const [prSettled, stSettled, pmRes] = await Promise.all([
          listBankPrices().catch((e) => {
            console.warn("[buy-dialog] listBankPrices failed", e);
            return [] as Awaited<ReturnType<typeof listBankPrices>>;
          }),
          listBankStock().catch((e) => {
            console.warn("[buy-dialog] listBankStock failed", e);
            return {} as Record<string, number>;
          }),
          supabase.from("payment_methods").select("*").eq("is_active", true).order("sort_order"),
        ]);
        const pr = prSettled;
        const st = stSettled;
        const pm = pmRes.data;
        const priceMap: Record<string, { price_idr: number; is_active: boolean }> = {};
        for (const p of pr) priceMap[p.provider] = { price_idr: p.price_idr, is_active: p.is_active };
        setPrices(priceMap);
        setStock(st);
        setMethods((pm ?? []) as PaymentMethod[]);
        if ((pm ?? []).length > 0) setMethodId((pm as PaymentMethod[])[0].id);
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
  }, [prices, stock]);

  const selectedMethod = useMemo(
    () => methods.find((m) => m.id === methodId) ?? null,
    [methods, methodId],
  );

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

  const unitPrice = provider ? prices[provider]?.price_idr ?? 0 : 0;
  const stockLeft = provider ? stock[provider] ?? 0 : 0;
  const total = unitPrice * qty;

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
    if (!provider) return toast.error("Pilih token yang mau dibeli");
    if (qty < 1 || qty > stockLeft) return toast.error(`Qty harus 1-${stockLeft}`);
    if (!selectedMethod) return toast.error("Pilih metode pembayaran");
    if (!proofFile) return toast.error("Upload bukti pembayaran dulu");
    setSubmitting(true);
    try {
      const ext = proofFile.name.split(".").pop() || "png";
      const path = `${user.id}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("payment-proofs")
        .upload(path, proofFile, { upsert: false, contentType: proofFile.type });
      if (upErr) throw upErr;

      const row = {
        user_id: user.id,
        route_key: `token_bank.${provider}`,
        price_idr: total,
        payment_method_id: selectedMethod.id,
        payment_method_name: selectedMethod.name,
        proof_image_url: path,
        note: `[TOKEN BANK] ${qty}× ${PROVIDER_LABELS[provider]}`,
        status: "pending" as const,
        request_kind: "token_bank",
        token_provider: provider,
        token_qty: qty,
      };
      // Extra fields added by migration — cast to bypass generated types.
      const { error: insErr } = await supabase
        .from("purchase_requests")
        .insert(row as never);
      if (insErr) throw insErr;

      toast.success("Permintaan dikirim! Setelah admin approve, token otomatis masuk ke Token Manager kamu.");
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal mengirim");
    } finally {
      setSubmitting(false);
    }
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

        {loading ? (
          <div className="py-12 grid place-items-center">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          </div>
        ) : catalog.length === 0 ? (
          <div className="mt-6 p-6 text-center rounded-2xl border border-border bg-card/40 text-sm text-muted-foreground">
            Belum ada token yang dijual saat ini. Hubungi admin.
          </div>
        ) : (
          <>
            <div className="mt-4">
              <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-2">
                Pilih provider
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {catalog.map((p) => {
                  const active = provider === p;
                  return (
                    <button
                      key={p}
                      onClick={() => setProvider(p)}
                      className={[
                        "text-left rounded-xl border px-3 py-2.5 transition",
                        active
                          ? "border-primary/60 bg-primary/[0.08]"
                          : "border-border bg-card/40 hover:bg-sidebar-accent/40",
                      ].join(" ")}
                    >
                      <div className="text-sm font-medium">{PROVIDER_LABELS[p]}</div>
                      <div className="text-[11px] text-muted-foreground font-mono">
                        {rupiah(prices[p].price_idr)} / key ·{" "}
                        {(stock[p] ?? 0) > 0
                          ? `stok ${stock[p]}`
                          : <span className="text-rose-300">stok habis</span>}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {provider && (
              <>
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <label>
                    <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-1.5">
                      Qty (max {stockLeft})
                    </div>
                    <input
                      type="number"
                      min={1}
                      max={stockLeft}
                      value={qty}
                      onChange={(e) => setQty(Math.max(1, Number(e.target.value) || 1))}
                      className="w-full rounded-2xl border border-border bg-card/50 px-3 py-2.5 text-sm outline-none focus:border-primary/60"
                    />
                  </label>
                  <div>
                    <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-1.5">
                      Total
                    </div>
                    <div className="rounded-2xl border border-border bg-card/40 px-3 py-2.5 font-display text-xl text-gradient">
                      {rupiah(total)}
                    </div>
                  </div>
                </div>

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
                            onClick={() => setMethodId(m.id)}
                            className={[
                              "flex items-center gap-2 rounded-xl border px-3 py-2.5 text-left transition",
                              active
                                ? "border-primary/60 bg-primary/[0.08]"
                                : "border-border bg-card/40 hover:bg-sidebar-accent/40",
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

                {selectedMethod && (
                  <div className="mt-4 rounded-2xl border border-border bg-card/40 p-4">
                    {selectedMethod.type === "qris" && signedImage && (
                      <div className="flex flex-col items-center gap-2">
                        <img
                          src={signedImage}
                          alt="QRIS"
                          className="max-h-64 rounded-xl border border-border bg-white p-2"
                        />
                        <div className="text-xs text-muted-foreground">Scan QRIS di atas untuk membayar</div>
                      </div>
                    )}
                    {selectedMethod.type !== "qris" && (
                      <div className="flex flex-col gap-2">
                        {selectedMethod.account_number && (
                          <div className="flex items-center justify-between rounded-xl border border-border bg-background/40 px-3 py-2.5">
                            <div className="min-w-0">
                              <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                                Nomor
                              </div>
                              <div className="font-mono text-sm truncate">
                                {selectedMethod.account_number}
                              </div>
                            </div>
                            <button
                              onClick={() => copy(selectedMethod.account_number!, "num")}
                              className="ml-3 inline-flex items-center gap-1 rounded-full border border-border bg-card/50 px-3 py-1.5 text-xs hover:bg-card"
                            >
                              {copied === "num" ? (
                                <Check className="h-3.5 w-3.5" />
                              ) : (
                                <Copy className="h-3.5 w-3.5" />
                              )}
                              Salin
                            </button>
                          </div>
                        )}
                        {selectedMethod.account_holder && (
                          <div className="rounded-xl border border-border bg-background/40 px-3 py-2.5">
                            <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                              Atas nama
                            </div>
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
                    {proofPreview && (
                      <img
                        src={proofPreview}
                        alt="preview"
                        className="h-12 w-12 rounded-lg object-cover"
                      />
                    )}
                    <input type="file" accept="image/*" className="sr-only" onChange={onProofChange} />
                  </label>
                </div>

                <div className="mt-6 flex items-center justify-end gap-2 pt-4 border-t border-border/60">
                  <button
                    onClick={onClose}
                    className="rounded-full border border-border bg-card/50 px-4 py-2 text-sm"
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
          </>
        )}
      </div>
    </div>
  );
}
