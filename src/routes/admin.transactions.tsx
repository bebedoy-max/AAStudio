import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Loader2, ShieldCheck, Filter, Download, RefreshCw, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { DashboardShell, PageHero } from "@/components/dashboard/shell";
import { Card } from "@/components/dashboard/ui";
import { useAuth } from "@/lib/auth-context";
import { confirmDialog } from "@/components/ui-confirm";
import {
  BANK_PROVIDERS,
  PROVIDER_LABELS,
  type BankProvider,
  type BankTxRow,
  listBankTransactions,
  resetBankTransactions,
  searchUsersForTransfer,
} from "@/lib/token-bank/bank.functions";

export const Route = createFileRoute("/admin/transactions")({
  head: () => ({
    meta: [
      { title: "Laporan Data Transaksi — Admin" },
      { name: "description", content: "Riwayat penjualan & transfer token per provider, per user." },
    ],
  }),
  component: Page,
});

function Page() {
  return (
    <DashboardShell>
      <PageHero
        eyebrow="Admin"
        title="Laporan Data"
        highlight="Transaksi"
        desc="Riwayat token yang tersalur ke user — penjualan lewat checkout maupun transfer manual admin."
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

type KindFilter = "" | "purchase" | "transfer";
type Preset = "all" | "today" | "7d" | "30d" | "month" | "custom";

function rupiah(n: number) {
  return "Rp " + (n || 0).toLocaleString("id-ID");
}

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function presetRange(p: Preset): { from: string; to: string } {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (p === "today") return { from: isoDate(today), to: isoDate(today) };
  if (p === "7d") {
    const from = new Date(today);
    from.setDate(from.getDate() - 6);
    return { from: isoDate(from), to: isoDate(today) };
  }
  if (p === "30d") {
    const from = new Date(today);
    from.setDate(from.getDate() - 29);
    return { from: isoDate(from), to: isoDate(today) };
  }
  if (p === "month") {
    const from = new Date(now.getFullYear(), now.getMonth(), 1);
    return { from: isoDate(from), to: isoDate(today) };
  }
  return { from: "", to: "" };
}

function Body() {
  const [provider, setProvider] = useState<BankProvider | "">("");
  const [kind, setKind] = useState<KindFilter>("");
  const [preset, setPreset] = useState<Preset>("30d");
  const [dateFrom, setDateFrom] = useState<string>(presetRange("30d").from);
  const [dateTo, setDateTo] = useState<string>(presetRange("30d").to);
  const [userQ, setUserQ] = useState("");
  const [userResults, setUserResults] = useState<
    { id: string; email: string | null; display_name: string | null }[]
  >([]);
  const [picked, setPicked] = useState<{ id: string; email: string | null; display_name: string | null } | null>(null);
  const [rows, setRows] = useState<BankTxRow[]>([]);
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const r = await listBankTransactions({
        data: {
          provider: provider || null,
          kind: kind || null,
          userId: picked?.id ?? null,
          dateFrom: dateFrom ? `${dateFrom}T00:00:00.000Z` : null,
          dateTo: dateTo ? `${dateTo}T23:59:59.999Z` : null,
        },
      });
      setRows(r);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal memuat laporan");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!userQ.trim()) {
      setUserResults([]);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const r = await searchUsersForTransfer({ data: { q: userQ } });
        setUserResults(r);
      } catch {
        /* ignore */
      }
    }, 300);
    return () => clearTimeout(t);
  }, [userQ]);

  function applyPreset(p: Preset) {
    setPreset(p);
    if (p === "all") {
      setDateFrom("");
      setDateTo("");
    } else if (p !== "custom") {
      const r = presetRange(p);
      setDateFrom(r.from);
      setDateTo(r.to);
    }
  }

  const totals = useMemo(() => {
    const t = { count: rows.length, income: 0, transfer: 0, keys: rows.length };
    for (const r of rows) {
      if (r.kind === "purchase") t.income += r.price_idr || 0;
      else if (r.kind === "transfer") t.transfer += 1;
    }
    return t;
  }, [rows]);

  const byProvider = useMemo(() => {
    const m: Record<string, { qty: number; income: number }> = {};
    for (const r of rows) {
      const b = (m[r.provider] ||= { qty: 0, income: 0 });
      b.qty += 1;
      if (r.kind === "purchase") b.income += r.price_idr || 0;
    }
    return m;
  }, [rows]);

  function exportCSV() {
    const header = ["Tanggal", "Provider", "Jenis", "User", "Email", "Harga (IDR)", "Key ID", "Purchase Request"];
    const lines = [header.join(",")];
    for (const r of rows) {
      const row = [
        new Date(r.created_at).toISOString(),
        r.provider,
        r.kind,
        (r.user_display_name || "").replace(/,/g, " "),
        (r.user_email || "").replace(/,/g, " "),
        String(r.price_idr || 0),
        r.key_id ?? "",
        r.purchase_request_id ?? "",
      ];
      lines.push(row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","));
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `laporan-transaksi-${dateFrom || "all"}_${dateTo || "all"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Filters */}
      <Card>
        <div className="p-4 border-b border-border/60 flex items-center gap-2">
          <Filter className="h-4 w-4 text-primary" />
          <div className="font-display text-lg">Filter Laporan</div>
        </div>
        <div className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-1">Provider</div>
            <select
              value={provider}
              onChange={(e) => setProvider(e.target.value as BankProvider | "")}
              className="w-full rounded-xl border border-border bg-card/50 px-3 py-2 text-sm outline-none focus:border-primary/60"
            >
              <option value="">Semua provider</option>
              {BANK_PROVIDERS.map((p) => (
                <option key={p} value={p}>
                  {PROVIDER_LABELS[p]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-1">Jenis</div>
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as KindFilter)}
              className="w-full rounded-xl border border-border bg-card/50 px-3 py-2 text-sm outline-none focus:border-primary/60"
            >
              <option value="">Semua jenis</option>
              <option value="purchase">Penjualan (checkout)</option>
              <option value="transfer">Transfer manual</option>
            </select>
          </div>
          <div>
            <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-1">Periode</div>
            <select
              value={preset}
              onChange={(e) => applyPreset(e.target.value as Preset)}
              className="w-full rounded-xl border border-border bg-card/50 px-3 py-2 text-sm outline-none focus:border-primary/60"
            >
              <option value="all">Semua</option>
              <option value="today">Hari ini</option>
              <option value="7d">7 hari terakhir</option>
              <option value="30d">30 hari terakhir</option>
              <option value="month">Bulan ini</option>
              <option value="custom">Custom</option>
            </select>
          </div>
          <div className="relative">
            <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-1">User</div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <input
                value={picked ? picked.email ?? picked.display_name ?? picked.id : userQ}
                onChange={(e) => {
                  setUserQ(e.target.value);
                  setPicked(null);
                }}
                placeholder="Semua user — cari email/nama"
                className="w-full rounded-xl border border-border bg-card/50 pl-8 pr-3 py-2 text-sm outline-none focus:border-primary/60"
              />
            </div>
            {!picked && userResults.length > 0 && (
              <div className="absolute z-20 mt-1 w-full rounded-xl border border-border bg-card overflow-hidden shadow-lg">
                {userResults.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => {
                      setPicked(r);
                      setUserQ("");
                      setUserResults([]);
                    }}
                    className="block w-full text-left px-3 py-2 text-sm hover:bg-sidebar-accent/50 border-b border-border/40 last:border-0"
                  >
                    <div className="font-medium truncate">{r.display_name || "—"}</div>
                    <div className="text-xs text-muted-foreground truncate">{r.email}</div>
                  </button>
                ))}
              </div>
            )}
            {picked && (
              <button
                onClick={() => {
                  setPicked(null);
                  setUserQ("");
                }}
                className="mt-1 text-[10px] text-muted-foreground hover:text-foreground"
              >
                Hapus filter user
              </button>
            )}
          </div>

          <div className="md:col-span-2">
            <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-1">Dari tanggal</div>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => {
                setDateFrom(e.target.value);
                setPreset("custom");
              }}
              className="w-full rounded-xl border border-border bg-card/50 px-3 py-2 text-sm outline-none focus:border-primary/60"
            />
          </div>
          <div className="md:col-span-2">
            <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-1">Sampai tanggal</div>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => {
                setDateTo(e.target.value);
                setPreset("custom");
              }}
              className="w-full rounded-xl border border-border bg-card/50 px-3 py-2 text-sm outline-none focus:border-primary/60"
            />
          </div>
        </div>
        <div className="p-4 pt-0 flex flex-wrap items-center justify-end gap-2">
          <button
            onClick={() => {
              setProvider("");
              setKind("");
              setPicked(null);
              setUserQ("");
              applyPreset("all");
            }}
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card/50 px-3 py-1.5 text-xs hover:bg-sidebar-accent/40"
          >
            Reset
          </button>
          <button
            onClick={exportCSV}
            disabled={rows.length === 0}
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card/50 px-3 py-1.5 text-xs hover:bg-sidebar-accent/40 disabled:opacity-40"
          >
            <Download className="h-3.5 w-3.5" /> Export CSV
          </button>
          <button
            onClick={async () => {
              const ok = await confirmDialog({
                title: "Reset laporan transaksi?",
                description:
                  "Seluruh catatan token_bank_transactions akan dihapus permanen. Aksi ini tidak bisa dibatalkan.",
                confirmLabel: "Hapus Semua",
                tone: "danger",
              });
              if (!ok) return;
              try {
                await resetBankTransactions({});
                toast.success("Data laporan transaksi telah dihapus.");
                setRows([]);
              } catch (e) {
                toast.error(e instanceof Error ? e.message : "Gagal reset data");
              }
            }}
            className="inline-flex items-center gap-1.5 rounded-full border border-rose-400/40 text-rose-300 bg-rose-500/10 px-3 py-1.5 text-xs hover:bg-rose-500/20"
          >
            <Trash2 className="h-3.5 w-3.5" /> Reset Data
          </button>
          <button
            onClick={load}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-60"
            style={{ background: "var(--gradient-neon)" }}
          >
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Terapkan
          </button>
        </div>
      </Card>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Total Transaksi" value={totals.count.toLocaleString("id-ID")} />
        <StatCard label="Total Penjualan" value={rupiah(totals.income)} tone="ok" />
        <StatCard label="Transfer Manual" value={totals.transfer.toLocaleString("id-ID")} />
        <StatCard label="Total Key Tersalur" value={totals.keys.toLocaleString("id-ID")} />
      </div>

      {/* Per-provider breakdown */}
      {Object.keys(byProvider).length > 0 && (
        <Card>
          <div className="p-4 border-b border-border/60 font-display text-lg">Ringkasan per Provider</div>
          <div className="p-4 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {Object.entries(byProvider).map(([p, v]) => (
              <div key={p} className="rounded-xl border border-border/60 bg-card/40 p-3">
                <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                  {PROVIDER_LABELS[p as BankProvider] ?? p}
                </div>
                <div className="mt-1 font-display text-lg">{v.qty} key</div>
                <div className="text-xs text-emerald-300 font-mono">{rupiah(v.income)}</div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Table */}
      <Card>
        <div className="p-4 border-b border-border/60 flex items-center justify-between">
          <div className="font-display text-lg">Rincian Transaksi</div>
          <div className="text-xs text-muted-foreground">{rows.length} baris</div>
        </div>
        {loading ? (
          <div className="p-8 grid place-items-center">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          </div>
        ) : rows.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            Tidak ada transaksi cocok dengan filter.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                <tr className="border-b border-border/60">
                  <th className="px-4 py-2">Tanggal</th>
                  <th className="px-4 py-2">Provider</th>
                  <th className="px-4 py-2">Jenis</th>
                  <th className="px-4 py-2">User</th>
                  <th className="px-4 py-2 text-right">Harga</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-border/40 hover:bg-sidebar-accent/20 align-top">
                    <td className="px-4 py-2 text-xs text-muted-foreground font-mono">
                      {new Date(r.created_at).toLocaleString("id-ID")}
                    </td>
                    <td className="px-4 py-2">{PROVIDER_LABELS[r.provider]}</td>
                    <td className="px-4 py-2">
                      <span
                        className={[
                          "inline-flex text-[10px] font-mono uppercase tracking-widest px-2 py-0.5 rounded-full border",
                          r.kind === "purchase"
                            ? "border-emerald-400/40 text-emerald-300 bg-emerald-400/10"
                            : "border-sky-400/40 text-sky-300 bg-sky-400/10",
                        ].join(" ")}
                      >
                        {r.kind === "purchase" ? "penjualan" : r.kind}
                      </span>
                    </td>
                    <td className="px-4 py-2">
                      <div className="text-[13px]">{r.user_display_name || "—"}</div>
                      <div className="text-[11px] text-muted-foreground truncate max-w-[240px]">
                        {r.user_email || r.user_id.slice(0, 8) + "…"}
                      </div>
                    </td>
                    <td className="px-4 py-2 text-right font-mono">{rupiah(r.price_idr)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function StatCard({ label, value, tone }: { label: string; value: string; tone?: "ok" }) {
  return (
    <div className="neumorph p-4">
      <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">{label}</div>
      <div
        className={[
          "mt-1 font-display text-2xl tabular-nums",
          tone === "ok" ? "text-emerald-300" : "text-foreground",
        ].join(" ")}
      >
        {value}
      </div>
    </div>
  );
}
