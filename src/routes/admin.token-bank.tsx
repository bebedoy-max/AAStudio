import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2, ShieldCheck, Save, Plus, Trash2, Send, Eye, EyeOff, Search, RefreshCw } from "lucide-react";
import { DashboardShell, PageHero } from "@/components/dashboard/shell";
import { Card } from "@/components/dashboard/ui";
import { useAuth } from "@/lib/auth-context";
import { checkWeavyToken } from "@/lib/providers/weavy";
import { checkWavespeedBalance } from "@/lib/providers/wavespeed";
import { checkMagnificKey } from "@/lib/providers/magnific";
import { checkElevenKey } from "@/lib/providers/eleven";
import {
  BANK_PROVIDERS,
  PROVIDER_LABELS,
  type BankProvider,
  addBankKeys,
  deleteBankKey,
  listBankInventory,
  listBankPrices,
  setBankPrice,
  transferBankKeys,
  searchUsersForTransfer,
} from "@/lib/token-bank/bank.functions";

export const Route = createFileRoute("/admin/token-bank")({
  head: () => ({
    meta: [
      { title: "Token Bank — Admin" },
      { name: "description", content: "Stok API key semua provider, transfer / jual ke user." },
    ],
  }),
  component: TokenBankPage,
});

function TokenBankPage() {
  return (
    <DashboardShell>
      <PageHero
        eyebrow="Admin"
        title="Token"
        highlight="Bank"
        desc="Simpan API key per provider, set harga, transfer manual atau jual ke user lewat checkout."
      />
      <Gate />
    </DashboardShell>
  );
}

function Gate() {
  const { loading, isAdmin } = useAuth();
  if (loading)
    return (
      <Card>
        <div className="p-8 grid place-items-center">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        </div>
      </Card>
    );
  if (!isAdmin)
    return (
      <Card>
        <div className="p-8 text-center">
          <ShieldCheck className="h-8 w-8 text-muted-foreground mx-auto" />
          <div className="mt-3 font-display text-lg">Akses ditolak</div>
        </div>
      </Card>
    );
  return <Body />;
}

type InvRow = Awaited<ReturnType<typeof listBankInventory>>[number];
type PriceRow = Awaited<ReturnType<typeof listBankPrices>>[number];

function rupiah(n: number) {
  return "Rp " + n.toLocaleString("id-ID");
}

function maskKey(k: string) {
  if (k.length <= 8) return "•".repeat(k.length);
  return k.slice(0, 4) + "••••" + k.slice(-4);
}

function Body() {
  const [tab, setTab] = useState<BankProvider>("brain");
  const [inventory, setInventory] = useState<InvRow[]>([]);
  const [prices, setPrices] = useState<Record<string, PriceRow>>({});
  const [loading, setLoading] = useState(true);
  const [transferOpen, setTransferOpen] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const [inv, pr] = await Promise.all([listBankInventory(), listBankPrices()]);
      setInventory(inv);
      const map: Record<string, PriceRow> = {};
      for (const p of pr) map[p.provider] = p;
      setPrices(map);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal memuat");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const byProvider = useMemo(() => {
    const g: Record<string, InvRow[]> = {};
    for (const r of inventory) (g[r.provider] ||= []).push(r);
    return g;
  }, [inventory]);

  const currentList = byProvider[tab] ?? [];
  const available = currentList.filter((r) => r.status === "available").length;
  const assigned = currentList.filter((r) => r.status === "assigned").length;

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <div className="p-3 flex flex-wrap gap-2">
          {BANK_PROVIDERS.map((p) => {
            const c = (byProvider[p] ?? []).filter((r) => r.status === "available").length;
            return (
              <button
                key={p}
                onClick={() => setTab(p)}
                className={[
                  "px-3.5 py-1.5 rounded-full text-xs font-medium border transition",
                  tab === p
                    ? "text-primary-foreground border-transparent"
                    : "border-border bg-card/40 text-foreground/80 hover:text-foreground",
                ].join(" ")}
                style={tab === p ? { background: "var(--gradient-neon)" } : undefined}
              >
                {PROVIDER_LABELS[p]}{" "}
                <span className="opacity-70 ml-1 font-mono">{c}</span>
              </button>
            );
          })}
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 flex flex-col gap-4">
          <AddKeys provider={tab} onDone={load} />
          <Card>
            <div className="p-4 border-b border-border/60 flex items-center justify-between gap-3">
              <div>
                <div className="font-display text-lg">{PROVIDER_LABELS[tab]}</div>
                <div className="text-xs text-muted-foreground">
                  {available} tersedia · {assigned} sudah dipakai · total {currentList.length}
                </div>
              </div>
              <button
                onClick={() => setTransferOpen(true)}
                disabled={available === 0}
                className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-50"
                style={{ background: "var(--gradient-neon)" }}
              >
                <Send className="h-3.5 w-3.5" /> Transfer ke User
              </button>
            </div>
            {loading ? (
              <div className="p-8 grid place-items-center">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
              </div>
            ) : currentList.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">Belum ada key.</div>
            ) : (
              <KeyList rows={currentList} provider={tab} onDeleted={load} />
            )}
          </Card>
        </div>

        <div className="flex flex-col gap-4">
          <AllPricesPanel prices={prices} onSaved={load} />
        </div>
      </div>

      {transferOpen && (
        <TransferDialog
          provider={tab}
          available={available}
          onClose={() => setTransferOpen(false)}
          onDone={() => {
            setTransferOpen(false);
            load();
          }}
        />
      )}
    </div>
  );
}

function AddKeys({ provider, onDone }: { provider: BankProvider; onDone: () => void }) {
  const [bulk, setBulk] = useState("");
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    const keys = bulk.split(/[\n,]/).map((s) => s.trim()).filter(Boolean);
    if (keys.length === 0) return toast.error("Isi minimal 1 key");
    setBusy(true);
    try {
      const r = await addBankKeys({ data: { provider, keys, label: label.trim() || undefined } });
      toast.success(`+${r.added} key tersimpan`);
      setBulk("");
      setLabel("");
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal simpan");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <div className="p-4 border-b border-border/60">
        <div className="font-display text-lg flex items-center gap-2">
          <Plus className="h-4 w-4" /> Tambah key {PROVIDER_LABELS[provider]}
        </div>
        <div className="text-xs text-muted-foreground mt-0.5">
          1 key per baris. Label opsional untuk mempermudah identifikasi.
        </div>
      </div>
      <div className="p-4 flex flex-col gap-3">
        <textarea
          value={bulk}
          onChange={(e) => setBulk(e.target.value)}
          rows={5}
          placeholder={"KEY_1\nKEY_2\n..."}
          className="w-full rounded-2xl border border-border bg-card/50 px-3 py-2.5 text-sm font-mono outline-none focus:border-primary/60"
        />
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Label / catatan (opsional)"
          className="w-full rounded-2xl border border-border bg-card/50 px-3 py-2.5 text-sm outline-none focus:border-primary/60"
        />
        <div className="flex justify-end">
          <button
            onClick={submit}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
            style={{ background: "var(--gradient-neon)" }}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Simpan
          </button>
        </div>
      </div>
    </Card>
  );
}

type CheckInfo = { label: string; tone: "ok" | "warn" | "bad" | "muted"; loading?: boolean };

async function runProviderCheck(provider: BankProvider, key: string): Promise<CheckInfo> {
  try {
    switch (provider) {
      case "weavy": {
        const r = await checkWeavyToken(key);
        if (!r.ok) return { label: "Invalid / expired", tone: "bad" };
        if (r.credits == null) return { label: r.email ?? "OK · credits ?", tone: "warn" };
        return {
          label: `${r.credits} cr${r.email ? ` · ${r.email}` : ""}`,
          tone: r.credits <= 0 ? "bad" : r.credits < 5 ? "warn" : "ok",
        };
      }
      case "wavespeed": {
        const r = await checkWavespeedBalance(key);
        if (!r.ok) return { label: "Invalid key", tone: "bad" };
        const b = r.balance ?? 0;
        return { label: `$${b.toFixed(2)}`, tone: b <= 0 ? "bad" : b < 1 ? "warn" : "ok" };
      }
      case "eleven": {
        const r = await checkElevenKey(key);
        if (!r.ok) return { label: "Invalid key", tone: "bad" };
        const rem = r.remaining ?? 0;
        return {
          label: `${rem.toLocaleString("id-ID")} chars${r.tier ? ` · ${r.tier}` : ""}`,
          tone: rem <= 0 ? "bad" : rem < 500 ? "warn" : "ok",
        };
      }
      case "magnific": {
        const r = await checkMagnificKey(key);
        return r.ok ? { label: "Tersimpan (no probe)", tone: "muted" } : { label: "Invalid", tone: "bad" };
      }
      case "brain":
        return {
          label: /^AIza[0-9A-Za-z_-]{35}$/.test(key) ? "Format Gemini OK" : "Bukan format AIza…",
          tone: /^AIza[0-9A-Za-z_-]{35}$/.test(key) ? "ok" : "bad",
        };
      case "shotstack":
      case "creatomate":
        return { label: "Tersimpan", tone: "muted" };
    }
  } catch (e) {
    return { label: e instanceof Error ? e.message : "Error", tone: "bad" };
  }
}

function toneClass(t: CheckInfo["tone"]) {
  return t === "ok"
    ? "text-emerald-300 border-emerald-400/40 bg-emerald-400/10"
    : t === "warn"
      ? "text-amber-300 border-amber-400/40 bg-amber-400/10"
      : t === "bad"
        ? "text-rose-300 border-rose-400/40 bg-rose-400/10"
        : "text-muted-foreground border-border bg-muted/10";
}

function KeyList({ rows, provider, onDeleted }: { rows: InvRow[]; provider: BankProvider; onDeleted: () => void }) {
  const [reveal, setReveal] = useState<Record<string, boolean>>({});
  const [deleting, setDeleting] = useState<string | null>(null);
  const [checks, setChecks] = useState<Record<string, CheckInfo>>({});
  const [checkingAll, setCheckingAll] = useState(false);

  async function checkOne(row: InvRow) {
    setChecks((s) => ({ ...s, [row.id]: { label: "Cek…", tone: "muted", loading: true } }));
    const info = await runProviderCheck(provider, row.key_value);
    setChecks((s) => ({ ...s, [row.id]: info }));
  }

  async function checkAll() {
    setCheckingAll(true);
    try {
      for (const r of rows) {
        // sequential to avoid provider rate limits
        await checkOne(r);
      }
    } finally {
      setCheckingAll(false);
    }
  }

  async function del(id: string) {
    if (!confirm("Hapus key ini dari bank?")) return;
    setDeleting(id);
    try {
      await deleteBankKey({ data: { id } });
      onDeleted();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal hapus");
    } finally {
      setDeleting(null);
    }
  }

  return (
    <div className="overflow-x-auto">
      <div className="px-4 pt-3 flex justify-end">
        <button
          onClick={checkAll}
          disabled={checkingAll || rows.length === 0}
          className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card/50 px-3 py-1.5 text-xs hover:bg-sidebar-accent/40 disabled:opacity-50"
        >
          {checkingAll ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          Cek semua
        </button>
      </div>
      <table className="w-full text-sm">
        <thead className="text-left text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
          <tr className="border-b border-border/60">
            <th className="px-4 py-2">Key</th>
            <th className="px-4 py-2">Info</th>
            <th className="px-4 py-2">Label</th>
            <th className="px-4 py-2">Status</th>
            <th className="px-4 py-2">Ditambahkan</th>
            <th className="px-4 py-2 text-right">Aksi</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b border-border/40 hover:bg-sidebar-accent/20">
              <td className="px-4 py-2 font-mono text-xs">
                {reveal[r.id] ? r.key_value : maskKey(r.key_value)}
                <button
                  onClick={() => setReveal((s) => ({ ...s, [r.id]: !s[r.id] }))}
                  className="ml-2 text-muted-foreground hover:text-foreground"
                  aria-label="Toggle"
                >
                  {reveal[r.id] ? <EyeOff className="inline h-3.5 w-3.5" /> : <Eye className="inline h-3.5 w-3.5" />}
                </button>
              </td>
              <td className="px-4 py-2">
                {checks[r.id] ? (
                  <span
                    className={[
                      "inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-full border",
                      toneClass(checks[r.id].tone),
                    ].join(" ")}
                  >
                    {checks[r.id].loading && <Loader2 className="h-3 w-3 animate-spin" />}
                    {checks[r.id].label}
                  </span>
                ) : (
                  <button
                    onClick={() => checkOne(r)}
                    className="inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-full border border-border bg-card/50 hover:bg-sidebar-accent/40"
                  >
                    <RefreshCw className="h-3 w-3" /> Cek
                  </button>
                )}
              </td>
              <td className="px-4 py-2 text-xs text-muted-foreground">{r.label ?? "—"}</td>
              <td className="px-4 py-2">
                <span
                  className={[
                    "inline-flex text-[10px] font-mono uppercase tracking-widest px-2 py-0.5 rounded-full border",
                    r.status === "available"
                      ? "border-emerald-400/40 text-emerald-300 bg-emerald-400/10"
                      : "border-muted-foreground/30 text-muted-foreground bg-muted/10",
                  ].join(" ")}
                >
                  {r.status}
                </span>
              </td>
              <td className="px-4 py-2 text-xs text-muted-foreground">
                {new Date(r.created_at).toLocaleDateString("id-ID")}
              </td>
              <td className="px-4 py-2 text-right">
                <button
                  onClick={() => del(r.id)}
                  disabled={deleting === r.id}
                  className="inline-flex items-center gap-1 rounded-full border border-rose-400/40 text-rose-300 px-2.5 py-1 text-xs hover:bg-rose-500/10 disabled:opacity-50"
                >
                  {deleting === r.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                  Hapus
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AllPricesPanel({
  prices,
  onSaved,
}: {
  prices: Record<string, PriceRow>;
  onSaved: () => void;
}) {
  type Draft = { price: number; active: boolean };
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    const next: Record<string, Draft> = {};
    for (const p of BANK_PROVIDERS) {
      const cur = prices[p];
      next[p] = { price: cur?.price_idr ?? 0, active: cur?.is_active ?? true };
    }
    setDrafts(next);
  }, [prices]);

  async function save(provider: BankProvider) {
    const d = drafts[provider];
    if (!d) return;
    setSaving(provider);
    try {
      await setBankPrice({ data: { provider, price_idr: d.price, is_active: d.active } });
      toast.success(`${PROVIDER_LABELS[provider]}: harga tersimpan`);
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal");
    } finally {
      setSaving(null);
    }
  }

  return (
    <Card>
      <div className="p-4 border-b border-border/60">
        <div className="font-display text-lg">Harga jual per provider</div>
        <div className="text-xs text-muted-foreground">
          Set harga & aktifkan masing-masing. Set 0 / nonaktif = tidak muncul di toko user.
        </div>
      </div>
      <div className="p-3 flex flex-col divide-y divide-border/50">
        {BANK_PROVIDERS.map((p) => {
          const d = drafts[p] ?? { price: 0, active: true };
          return (
            <div key={p} className="py-3 flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-medium">{PROVIDER_LABELS[p]}</div>
                <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={d.active}
                    onChange={(e) =>
                      setDrafts((s) => ({ ...s, [p]: { ...d, active: e.target.checked } }))
                    }
                    className="h-3.5 w-3.5 rounded border-border"
                  />
                  aktif
                </label>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={0}
                  value={d.price}
                  onChange={(e) =>
                    setDrafts((s) => ({
                      ...s,
                      [p]: { ...d, price: Number(e.target.value) || 0 },
                    }))
                  }
                  className="flex-1 rounded-xl border border-border bg-card/50 px-3 py-2 text-sm font-mono outline-none focus:border-primary/60"
                />
                <button
                  onClick={() => save(p)}
                  disabled={saving === p}
                  className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-60"
                  style={{ background: "var(--gradient-neon)" }}
                >
                  {saving === p ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                  Simpan
                </button>
              </div>
              <div className="text-[10px] font-mono text-muted-foreground">{rupiah(d.price)} / key</div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function TransferDialog({
  provider,
  available,
  onClose,
  onDone,
}: {
  provider: BankProvider;
  available: number;
  onClose: () => void;
  onDone: () => void;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<{ id: string; email: string | null; display_name: string | null }[]>([]);
  const [picked, setPicked] = useState<{ id: string; email: string | null } | null>(null);
  const [qty, setQty] = useState(1);
  const [busy, setBusy] = useState(false);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (!q.trim()) {
      setResults([]);
      return;
    }
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const r = await searchUsersForTransfer({ data: { q } });
        setResults(r);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  async function submit() {
    if (!picked) return toast.error("Pilih user tujuan");
    if (qty < 1 || qty > available) return toast.error(`Qty harus 1–${available}`);
    setBusy(true);
    try {
      await transferBankKeys({ data: { provider, qty, targetUserId: picked.id } });
      toast.success(`${qty} key ditransfer ke ${picked.email ?? picked.id}`);
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal transfer");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[70] grid place-items-center bg-background/80 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="neumorph w-full max-w-md p-6"
      >
        <div className="text-[11px] font-mono uppercase tracking-[0.25em] text-muted-foreground">Transfer</div>
        <h2 className="mt-1 font-display text-xl">
          Kirim token <span className="text-gradient">{PROVIDER_LABELS[provider]}</span>
        </h2>

        <div className="mt-4">
          <div className="text-[11px] uppercase tracking-widest text-muted-foreground mb-1.5">Cari user</div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPicked(null);
              }}
              placeholder="Email atau nama..."
              className="w-full rounded-2xl border border-border bg-card/50 pl-9 pr-3 py-2.5 text-sm outline-none focus:border-primary/60"
            />
          </div>
          {picked ? (
            <div className="mt-2 rounded-xl border border-primary/40 bg-primary/10 px-3 py-2 text-sm">
              ✓ {picked.email ?? picked.id}
            </div>
          ) : results.length > 0 ? (
            <div className="mt-2 rounded-xl border border-border overflow-hidden">
              {results.map((r) => (
                <button
                  key={r.id}
                  onClick={() => setPicked({ id: r.id, email: r.email })}
                  className="block w-full text-left px-3 py-2 text-sm hover:bg-sidebar-accent/50 border-b border-border/40 last:border-0"
                >
                  <div className="font-medium">{r.display_name || "—"}</div>
                  <div className="text-xs text-muted-foreground">{r.email}</div>
                </button>
              ))}
            </div>
          ) : searching ? (
            <div className="mt-2 text-xs text-muted-foreground">Mencari…</div>
          ) : null}
        </div>

        <div className="mt-4">
          <div className="text-[11px] uppercase tracking-widest text-muted-foreground mb-1.5">
            Qty (stok tersedia: {available})
          </div>
          <input
            type="number"
            min={1}
            max={available}
            value={qty}
            onChange={(e) => setQty(Math.max(1, Number(e.target.value) || 1))}
            className="w-full rounded-2xl border border-border bg-card/50 px-3 py-2.5 text-sm outline-none focus:border-primary/60"
          />
        </div>

        <div className="mt-6 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-full border border-border bg-card/50 px-4 py-2 text-sm"
          >
            Batal
          </button>
          <button
            onClick={submit}
            disabled={busy || !picked}
            className="inline-flex items-center gap-1.5 rounded-full px-5 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
            style={{ background: "var(--gradient-neon)" }}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Transfer
          </button>
        </div>
      </div>
    </div>
  );
}
