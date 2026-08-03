// Admin: pilih token bank provider mana yang dijual + harga per key.
// Provider yang tidak aktif (atau harga 0) tidak akan muncul di dialog
// "Beli Token" milik user.
import { useEffect, useState } from "react";
import { Loader2, Save, Coins } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/dashboard/ui";
import {
  BANK_PROVIDERS,
  PROVIDER_LABELS,
  listBankPrices,
  listBankStock,
  setBankPrice,
  type BankProvider,
} from "@/lib/token-bank/bank.functions";

type Draft = { price: number; active: boolean };

function rupiah(n: number) {
  return "Rp " + n.toLocaleString("id-ID");
}

export function TokenBankPricesSection() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [saved, setSaved] = useState<Record<string, Draft>>({});
  const [stock, setStock] = useState<Record<string, number>>({});

  function isDirty(p: string) {
    const a = drafts[p];
    const b = saved[p];
    if (!a || !b) return false;
    return a.price !== b.price || a.active !== b.active;
  }

  async function load() {
    setLoading(true);
    try {
      const [prices, st] = await Promise.all([
        listBankPrices().catch(() => [] as Awaited<ReturnType<typeof listBankPrices>>),
        listBankStock().catch(() => ({}) as Record<string, number>),
      ]);
      const map: Record<string, Draft> = {};
      for (const p of BANK_PROVIDERS) map[p] = { price: 0, active: false };
      for (const p of prices) map[p.provider] = { price: p.price_idr, active: p.is_active };
      setDrafts(map);
      setSaved(JSON.parse(JSON.stringify(map)) as Record<string, Draft>);
      setStock(st);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function save(provider: BankProvider) {
    const d = drafts[provider];
    if (!d) return;
    if (d.active && d.price <= 0) {
      toast.error("Harga harus lebih dari 0 untuk dijual");
      return;
    }
    setSaving(provider);
    try {
      await setBankPrice({ data: { provider, price_idr: d.price, is_active: d.active } });
      setSaved((c) => ({ ...c, [provider]: { ...d } }));
      toast.success(`${PROVIDER_LABELS[provider]} tersimpan`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal menyimpan");
    } finally {
      setSaving(null);
    }
  }

  return (
    <Card
      title="Penjualan Token Bank"
      sub="Aktifkan provider yang dijual & atur harga per token. Hanya provider aktif yang tampil di pop-up Beli Token user."
    >
      {loading ? (
        <div className="p-8 grid place-items-center">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {BANK_PROVIDERS.map((p) => {
            const d = drafts[p] ?? { price: 0, active: false };
            const s = stock[p] ?? 0;
            return (
              <div
                key={p}
                className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-card/40 p-3"
              >
                <label className="flex items-center gap-2 min-w-[210px] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={d.active}
                    onChange={(e) =>
                      setDrafts((c) => ({ ...c, [p]: { ...d, active: e.target.checked } }))
                    }
                    className="h-4 w-4 accent-primary"
                  />
                  <Coins className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">{PROVIDER_LABELS[p]}</span>
                </label>

                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                    Harga
                  </span>
                  <input
                    type="number"
                    min={0}
                    step={1000}
                    value={d.price}
                    onChange={(e) =>
                      setDrafts((c) => ({
                        ...c,
                        [p]: { ...d, price: Math.max(0, Math.floor(Number(e.target.value) || 0)) },
                      }))
                    }
                    className="w-32 rounded-xl border border-border bg-background/60 px-3 py-1.5 text-sm font-mono"
                  />
                  <span className="text-xs text-muted-foreground">{rupiah(d.price)}</span>
                </div>

                <span
                  className={`rounded-full border px-2.5 py-1 text-[10px] font-mono ${
                    s > 0
                      ? "border-emerald-400/40 text-emerald-300"
                      : "border-border text-muted-foreground"
                  }`}
                >
                  Stok {s}
                </span>

                <button
                  onClick={() => save(p)}
                  disabled={saving === p || !isDirty(p)}
                  className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-border bg-card/50 px-3.5 py-1.5 text-xs hover:bg-sidebar-accent/60 disabled:opacity-40"
                >
                  {saving === p ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Save className="h-3.5 w-3.5" />
                  )}
                  Simpan
                </button>
              </div>
            );
          })}
          <div className="mt-1 text-[11px] text-muted-foreground">
            Setelah pembayaran sukses, token dari stok Token Bank otomatis dikirim ke Token Manager
            user sesuai provider yang dibeli.
          </div>
        </div>
      )}
    </Card>
  );
}
