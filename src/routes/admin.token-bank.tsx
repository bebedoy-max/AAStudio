import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import {
  Loader2,
  ShieldCheck,
  Save,
  Plus,
  Trash2,
  Send,
  Eye,
  EyeOff,
  Search,
  RefreshCw,
  Trash,
} from "lucide-react";
import { DashboardShell, PageHero } from "@/components/dashboard/shell";
import { Card } from "@/components/dashboard/ui";
import { useAuth } from "@/lib/auth-context";
import { checkWeavyToken } from "@/lib/providers/weavy";
import { checkWavespeedBalance } from "@/lib/providers/wavespeed";
import { checkMagnificKey } from "@/lib/providers/magnific";
import { checkElevenKey } from "@/lib/providers/eleven";
import { checkRoboneoToken, fetchRoboneoBalance } from "@/lib/providers/roboneo";
import { confirmDialog } from "@/components/ui-confirm";
import {
  BANK_PROVIDERS,
  PROVIDER_LABELS,
  type BankProvider,
  addBankKeys,
  deleteBankKey,
  deleteAllBankKeys,
  restoreAssignedBankKeys,
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
const BANK_CHECKS_CACHE_KEY = "aatools.tokenBank.checkInfo.v1";

function rupiah(n: number) {
  return "Rp " + n.toLocaleString("id-ID");
}

function maskKey(k: string) {
  if (k.length <= 8) return "•".repeat(k.length);
  return k.slice(0, 4) + "••••" + k.slice(-4);
}

function readBankChecksCache(): Record<string, CheckInfo> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(BANK_CHECKS_CACHE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, CheckInfo>) : {};
  } catch {
    return {};
  }
}

function writeBankChecksCache(next: Record<string, CheckInfo>) {
  if (typeof window === "undefined") return;
  localStorage.setItem(BANK_CHECKS_CACHE_KEY, JSON.stringify(next));
}

function Body() {
  const [tab, setTab] = useState<BankProvider>("brain");
  const [inventory, setInventory] = useState<InvRow[]>([]);
  const [prices, setPrices] = useState<Record<string, PriceRow>>({});
  const [loading, setLoading] = useState(true);
  const [transferOpen, setTransferOpen] = useState(false);
  const [checks, setChecks] = useState<Record<string, CheckInfo>>(() => readBankChecksCache());
  const [checkingAll, setCheckingAll] = useState(false);
  const [checkProgress, setCheckProgress] = useState<{ done: number; total: number } | null>(null);

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

  const allForTab = byProvider[tab] ?? [];
  const currentList = allForTab.filter((r) => r.status === "available");
  const available = currentList.length;
  const assigned = allForTab.length - currentList.length;

  async function checkOne(row: InvRow) {
    setChecks((s) => ({ ...s, [row.id]: { label: "Cek…", tone: "muted", loading: true } }));
    const info = await runProviderCheck(row.provider, row.key_value);
    setChecks((s) => {
      const next = { ...s, [row.id]: info };
      writeBankChecksCache(next);
      return next;
    });
    return info;
  }

  async function runChecks(rows: InvRow[]) {
    if (rows.length === 0) return;
    setCheckingAll(true);
    setCheckProgress({ done: 0, total: rows.length });
    try {
      for (let i = 0; i < rows.length; i++) {
        await checkOne(rows[i]);
        setCheckProgress({ done: i + 1, total: rows.length });
      }
    } finally {
      setCheckingAll(false);
      setTimeout(() => setCheckProgress(null), 800);
    }
  }

  async function onAdded(insertedIds: string[], preChecks: Record<string, CheckInfo>) {
    // Reload inventory; use the pre-validated CheckInfo so the table shows
    // real credit info immediately without a second probe.
    await load();
    if (Object.keys(preChecks).length > 0) {
      setChecks((s) => {
        const next = { ...s, ...preChecks };
        writeBankChecksCache(next);
        return next;
      });
    }
    // Any inserted rows without a preCheck fallback to a single check.
    setTimeout(async () => {
      const inv = await listBankInventory();
      setInventory(inv);
      const rowsWithoutCheck = inv.filter(
        (r) => insertedIds.includes(r.id) && !preChecks[r.id],
      );
      if (rowsWithoutCheck.length > 0) await runChecks(rowsWithoutCheck);
    }, 0);
  }

  async function onDeleteAll() {
    const availableRows = currentList.filter((r) => r.status === "available");
    if (availableRows.length === 0) return toast.info("Tidak ada key available untuk dihapus");
    const ok = await confirmDialog({
      title: `Hapus semua key ${PROVIDER_LABELS[tab]}?`,
      description: `${availableRows.length} key available akan dihapus dari bank. Key yang sudah assigned ke user tidak ikut terhapus. Aksi ini tidak dapat dibatalkan.`,
      confirmLabel: `Hapus ${availableRows.length} key`,
    });
    if (!ok) return;
    try {
      await deleteAllBankKeys({ data: { provider: tab, includeAssigned: false } });
      toast.success(`${availableRows.length} key dihapus`);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal hapus");
    }
  }

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
          <AddKeys provider={tab} onDone={onAdded} progress={checkProgress} />
          <Card>
            <div className="p-4 border-b border-border/60 flex items-center justify-between gap-3">
              <div>
                <div className="font-display text-lg">{PROVIDER_LABELS[tab]}</div>
                <div className="text-xs text-muted-foreground">
                  {available} tersedia · {assigned} sudah tersalur (lihat Laporan Transaksi)
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={onDeleteAll}
                  disabled={available === 0}
                  className="inline-flex items-center gap-1.5 rounded-full border border-rose-400/40 bg-rose-500/10 text-rose-300 px-3 py-1.5 text-xs font-semibold hover:bg-rose-500/20 disabled:opacity-40"
                  title="Hapus semua key available"
                >
                  <Trash className="h-3.5 w-3.5" /> Hapus Semua
                </button>
                <button
                  onClick={() => setTransferOpen(true)}
                  disabled={available === 0}
                  className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-50"
                  style={{ background: "var(--gradient-neon)" }}
                >
                  <Send className="h-3.5 w-3.5" /> Transfer ke User
                </button>
              </div>
            </div>
            {loading ? (
              <div className="p-8 grid place-items-center">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
              </div>
            ) : currentList.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">Tidak ada key tersedia.</div>
            ) : (
              <KeyList
                rows={currentList}
                checks={checks}
                checkingAll={checkingAll}
                onCheckOne={checkOne}
                onCheckAll={() => runChecks(currentList)}
                onDeleted={load}
              />
            )}
          </Card>
        </div>

        <div className="flex flex-col gap-4">
          <PricePanel provider={tab} price={prices[tab]} onSaved={load} />
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

type AddSummary = {
  provider: BankProvider;
  total: number;
  duplicate: number;
  alreadyAvailable: number;
  restored: number;
  invalidFormat: number;
  probeFailed: number;
  added: number;
  addedRows: { key: string; label: string; tone: CheckInfo["tone"] }[];
  rejectedRows: { key: string; label: string }[];
};

function AddKeys({
  provider,
  onDone,
  progress,
}: {
  provider: BankProvider;
  onDone: (insertedIds: string[], preChecks: Record<string, CheckInfo>) => void;
  progress: { done: number; total: number } | null;
}) {
  const [bulk, setBulk] = useState("");
  const [busy, setBusy] = useState(false);
  const [checkPct, setCheckPct] = useState<{ done: number; total: number } | null>(null);
  const [summary, setSummary] = useState<AddSummary | null>(null);

  async function submit() {
    const rawKeys = bulk.split(/[\n,]/).map((s) => s.trim()).filter(Boolean);
    if (rawKeys.length === 0) return toast.error("Isi minimal 1 key");
    setBusy(true);
    setSummary(null);
    try {
      // Dedupe against available inventory for this provider. Assigned keys are
      // no longer treated as a hard duplicate because admins often reset the
      // report and need to return those keys to stock.
      const inv = await listBankInventory();
      const providerRows = inv.filter((r) => r.provider === provider);
      const availableKeys = new Set(providerRows.filter((r) => r.status === "available").map((r) => r.key_value));
      const assignedKeys = new Set(providerRows.filter((r) => r.status === "assigned").map((r) => r.key_value));
      const uniq = Array.from(new Set(rawKeys));
      const inputDuplicates = rawKeys.length - uniq.length;
      const availableDuplicates = uniq.filter((k) => availableKeys.has(k)).length;
      const assignedToRestore = uniq.filter((k) => assignedKeys.has(k) && !availableKeys.has(k));
      const duplicate = inputDuplicates;
      const toCheck = uniq.filter((k) => !availableKeys.has(k) && !assignedKeys.has(k));

      // Pre-validate every key by hitting the provider's check endpoint before
      // anything is written to the bank. Only rows with tone !== "bad" are
      // inserted; the resolved CheckInfo is passed to the caller so the table
      // shows the real credit info immediately (no "Cek…" step).
      const preChecks: Record<string, CheckInfo> = {};
      const accepted: string[] = [];
      const rejected: { key: string; label: string }[] = [];
      let invalidFormat = 0;
      let probeFailed = 0;

      setCheckPct({ done: 0, total: toCheck.length });
      for (let i = 0; i < toCheck.length; i++) {
        const k = toCheck[i];
        const info = await runProviderCheck(provider, k);
        if (info.tone === "bad") {
          rejected.push({ key: k, label: info.label });
          if (info.label.toLowerCase().includes("format") || info.label.toLowerCase().includes("bukan"))
            invalidFormat++;
          else probeFailed++;
        } else {
          accepted.push(k);
          preChecks[k] = info;
        }
        setCheckPct({ done: i + 1, total: toCheck.length });
      }

      let insertedIds: string[] = [];
      let idsByKey: Record<string, string> = {};
      let restoredRows: { id: string; key_value: string }[] = [];
      if (accepted.length > 0) {
        const r = await addBankKeys({ data: { provider, keys: accepted } });
        insertedIds = r.inserted.map((x) => x.id);
        idsByKey = Object.fromEntries(r.inserted.map((x) => [x.key_value, x.id]));
      }
      if (assignedToRestore.length > 0) {
        const r = await restoreAssignedBankKeys({ data: { provider, keys: assignedToRestore } });
        restoredRows = r.restored;
        insertedIds = insertedIds.concat(restoredRows.map((x) => x.id));
        idsByKey = { ...idsByKey, ...Object.fromEntries(restoredRows.map((x) => [x.key_value, x.id])) };
      }

      // Map preChecks (keyed by key_value) to row-id keyed cache for parent.
      const idChecks: Record<string, CheckInfo> = {};
      for (const [k, info] of Object.entries(preChecks)) {
        const id = idsByKey[k];
        if (id) idChecks[id] = info;
      }

      setSummary({
        provider,
        total: rawKeys.length,
        duplicate,
        alreadyAvailable: availableDuplicates,
        restored: restoredRows.length,
        invalidFormat,
        probeFailed,
        added: accepted.length + restoredRows.length,
        addedRows: accepted.map((k) => ({
          key: k,
          label: preChecks[k]?.label ?? "OK",
          tone: preChecks[k]?.tone ?? "muted",
        })).concat(restoredRows.map((r) => ({
          key: r.key_value,
          label: "Dikembalikan ke stok",
          tone: "ok" as const,
        }))),
        rejectedRows: rejected,
      });

      const changedCount = accepted.length + restoredRows.length;
      if (changedCount > 0) {
        toast.success(`${changedCount} key tersedia di bank`);
        setBulk("");
      } else if (availableDuplicates > 0 && rejected.length === 0) {
        toast.info("Semua key sudah tersedia di bank");
        setBulk("");
      } else {
        toast.error("Tidak ada key valid yang disimpan");
      }
      onDone(insertedIds, idChecks);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal simpan");
    } finally {
      setBusy(false);
      setTimeout(() => setCheckPct(null), 600);
    }
  }

  const pct = progress
    ? Math.round((progress.done / progress.total) * 100)
    : checkPct
      ? Math.round((checkPct.done / Math.max(1, checkPct.total)) * 100)
      : 0;
  const activePct = progress ?? checkPct;

  return (
    <Card>
      <div className="p-4 border-b border-border/60">
        <div className="font-display text-lg flex items-center gap-2">
          <Plus className="h-4 w-4" /> Tambah key {PROVIDER_LABELS[provider]}
        </div>
        <div className="text-xs text-muted-foreground mt-0.5">
          1 key per baris. Setiap key <b>dites dulu</b> ke provider — hanya yang valid disimpan ke bank.
          {provider === "eleven" && " (ElevenLabs: tes suara 1 kata via TTS)"}
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
        {activePct && (
          <div className="rounded-xl border border-border bg-card/40 p-2.5">
            <div className="flex items-center justify-between text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-1">
              <span>{progress ? "Auto-check key baru" : "Validasi key…"}</span>
              <span>
                {activePct.done}/{activePct.total}
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full transition-all"
                style={{ width: `${pct}%`, background: "var(--gradient-neon)" }}
              />
            </div>
          </div>
        )}
        <div className="flex justify-end">
          <button
            onClick={submit}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
            style={{ background: "var(--gradient-neon)" }}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Cek &amp; Simpan
          </button>
        </div>
        {summary && (
          <AddSummaryPopup summary={summary} onClose={() => setSummary(null)} />
        )}
      </div>
    </Card>
  );
}

function AddSummaryPopup({ summary, onClose }: { summary: AddSummary; onClose: () => void }) {
  const available = summary.added + summary.alreadyAvailable;
  const rejected = summary.total - available - summary.duplicate;
  if (typeof document === "undefined") return null;
  return createPortal((
    <div
      className="fixed inset-0 z-[70] grid place-items-center bg-black/70 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="neumorph w-full max-w-md p-5 relative"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-[11px] font-mono uppercase tracking-[0.25em] text-muted-foreground">
          Ringkasan Import
        </div>
        <div className="mt-1 font-display text-xl">
          {PROVIDER_LABELS[summary.provider]}{" "}
          <span className="text-gradient">· {available}/{summary.total} tersedia</span>
        </div>

        <div className="mt-4 rounded-xl border border-border/60 bg-card/40 divide-y divide-border/50 text-[12.5px]">
          <RowLine label="Total input" value={summary.total} />
          <RowLine label="Duplikat dalam input" value={summary.duplicate} tone="muted" />
          <RowLine label="Sudah ada di bank" value={summary.alreadyAvailable} tone="muted" />
          <RowLine label="Dikembalikan ke stok" value={summary.restored} tone={summary.restored ? "ok" : "muted"} />
          <RowLine label="Format salah" value={summary.invalidFormat} tone={summary.invalidFormat ? "bad" : "muted"} />
          <RowLine
            label="Invalid / probe gagal"
            value={summary.probeFailed}
            tone={summary.probeFailed ? "bad" : "muted"}
          />
          <RowLine label="Berhasil disimpan" value={summary.added} tone="ok" />
        </div>

        {summary.rejectedRows.length > 0 && (
          <details className="mt-3">
            <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">
              Lihat {rejected} key ditolak
            </summary>
            <div className="mt-2 rounded-lg border border-rose-400/30 bg-rose-400/5 p-2 max-h-40 overflow-y-auto text-[11px] font-mono flex flex-col gap-1">
              {summary.rejectedRows.map((r, i) => (
                <div key={i} className="flex items-center justify-between gap-2">
                  <span className="text-rose-300 truncate">{maskKey(r.key)}</span>
                  <span className="text-rose-300/80 shrink-0">{r.label}</span>
                </div>
              ))}
            </div>
          </details>
        )}

        <div className="mt-5 flex justify-end">
          <button
            onClick={onClose}
            className="inline-flex items-center gap-1.5 rounded-full px-5 py-2 text-sm font-semibold text-primary-foreground"
            style={{ background: "var(--gradient-neon)" }}
          >
            OK
          </button>
        </div>
      </div>
    </div>
  ), document.body);
}

function RowLine({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | string;
  tone?: "ok" | "warn" | "bad" | "muted";
}) {
  const cls =
    tone === "ok"
      ? "text-emerald-400"
      : tone === "warn"
        ? "text-amber-300"
        : tone === "bad"
          ? "text-rose-400"
          : tone === "muted"
            ? "text-muted-foreground"
            : "text-foreground";
  return (
    <div className="flex items-center justify-between gap-3 px-3.5 py-2">
      <span className="text-muted-foreground">{label}</span>
      <span className={`font-semibold font-mono tabular-nums ${cls}`}>{value}</span>
    </div>
  );
}

type CheckInfo = { label: string; tone: "ok" | "warn" | "bad" | "muted"; loading?: boolean };

async function runProviderCheck(provider: BankProvider, key: string): Promise<CheckInfo> {
  try {
    switch (provider) {
      case "weavy": {
        // Weavy refresh token: string panjang (biasanya >200 char, prefix AMf-/AEu-).
        const isWeavyFormat = key.length >= 100 && /^[A-Za-z0-9_-]+$/.test(key);
        const r = await checkWeavyToken(key);
        if (!r.ok) {
          // Probe Firebase kadang gagal transient (rate-limit / CORS / refresh token
          // baru saja dipakai di Token Manager). Jangan hanguskan batch — tetap simpan
          // kalau formatnya benar, admin bisa "Cek ulang" nanti dari tabel.
          return isWeavyFormat
            ? { label: "Belum tervalidasi (simpan)", tone: "warn" }
            : { label: "Format tidak dikenal", tone: "bad" };
        }
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
        // ElevenLabs API key: sk_ + 40..80 hex.
        const isElevenFormat = /^sk_[a-f0-9]{40,80}$/i.test(key);
        const r = await checkElevenKey(key);
        if (!r.ok) {
          // Endpoint /v1/user/subscription & TTS probe kadang 401 walau key valid
          // (scope terbatas, voice default tidak diizinkan). Konsisten dg flow
          // "Tes suara" di Token Manager: kalau format benar, tetap simpan.
          return isElevenFormat
            ? { label: "Belum tervalidasi (simpan)", tone: "warn" }
            : { label: "Bukan format sk_…", tone: "bad" };
        }
        if (r.remaining == null) {
          return { label: `Aktif${r.tier ? ` · ${r.tier}` : ""}`, tone: "ok" };
        }
        const rem = r.remaining;
        return {
          label: `${rem.toLocaleString("id-ID")} chars${r.tier ? ` · ${r.tier}` : ""}`,
          tone: rem <= 0 ? "bad" : rem < 500 ? "warn" : "ok",
        };
      }
      case "magnific": {
        const r = await checkMagnificKey(key);
        return r.ok ? { label: "Tersimpan (no probe)", tone: "muted" } : { label: "Invalid", tone: "bad" };
      }
      case "brain": {
        const isAIza = /^AIza[0-9A-Za-z_-]{20,}$/.test(key);
        const isAQ = /^AQ\.[A-Za-z0-9_-]{20,}$/.test(key);
        if (!isAIza && !isAQ) return { label: "Bukan format AIza…/AQ…", tone: "bad" };
        // Probe both AIza dan AQ. lewat endpoint models — sama seperti flow
        // di Token Manager user, sehingga info status konsisten.
        try {
          const r = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}&pageSize=1`,
          );
          if (r.ok) {
            const data = (await r.json().catch(() => ({}))) as { models?: unknown[] };
            const n = Array.isArray(data.models) ? data.models.length : 0;
            return { label: n > 0 ? `OK · ${n}+ model tersedia` : "Aktif", tone: "ok" };
          }
          if (r.status === 429) return { label: "Rate-limited", tone: "warn" };
          if (r.status === 401 || r.status === 403 || r.status === 400)
            return { label: "Key ditolak", tone: "bad" };
          return { label: `HTTP ${r.status}`, tone: "bad" };
        } catch {
          return { label: "Gagal cek jaringan", tone: "bad" };
        }
      }
      case "roboneo": {
        const chk = await checkRoboneoToken(key);
        if (!chk.ok) return { label: chk.message || "Invalid", tone: "bad" };
        try {
          const bal = await fetchRoboneoBalance(key);
          if (bal.ok && bal.balance != null) {
            return {
              label: `${bal.balance} cr`,
              tone: bal.balance <= 0 ? "bad" : bal.balance < 5 ? "warn" : "ok",
            };
          }
          return { label: chk.message || "Aktif", tone: "ok" };
        } catch {
          return { label: chk.message || "Aktif", tone: "ok" };
        }
      }
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

function KeyList({
  rows,
  checks,
  checkingAll,
  onCheckOne,
  onCheckAll,
  onDeleted,
}: {
  rows: InvRow[];
  checks: Record<string, CheckInfo>;
  checkingAll: boolean;
  onCheckOne: (row: InvRow) => Promise<CheckInfo>;
  onCheckAll: () => Promise<void>;
  onDeleted: () => void;
}) {
  const [reveal, setReveal] = useState<Record<string, boolean>>({});
  const [deleting, setDeleting] = useState<string | null>(null);

  async function del(row: InvRow) {
    const ok = await confirmDialog({
      title: "Hapus key ini dari bank?",
      description: `Key ${maskKey(row.key_value)} akan dihapus permanen dari inventory.`,
      confirmLabel: "Hapus key",
    });
    if (!ok) return;
    setDeleting(row.id);
    try {
      await deleteBankKey({ data: { id: row.id } });
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
          onClick={onCheckAll}
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
            <th className="px-4 py-2">Info Sisa Credit</th>
            <th className="px-4 py-2">Status / Penerima</th>
            <th className="px-4 py-2">Ditambahkan</th>
            <th className="px-4 py-2 text-right">Aksi</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b border-border/40 hover:bg-sidebar-accent/20 align-top">
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
                    onClick={() => onCheckOne(r)}
                    className="inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-full border border-border bg-card/50 hover:bg-sidebar-accent/40"
                  >
                    <RefreshCw className="h-3 w-3" /> Cek
                  </button>
                )}
              </td>
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
                {r.status === "assigned" && (
                  <div className="mt-1 text-[11px] leading-tight">
                    <div className="text-foreground/85 truncate max-w-[220px]">
                      {r.assigned_display_name || "—"}
                    </div>
                    <div className="text-muted-foreground truncate max-w-[220px]">
                      {r.assigned_email || r.assigned_to?.slice(0, 8) + "…"}
                    </div>
                    {r.assigned_at && (
                      <div className="text-[10px] text-muted-foreground/80 font-mono">
                        {new Date(r.assigned_at).toLocaleDateString("id-ID")}
                      </div>
                    )}
                  </div>
                )}
              </td>
              <td className="px-4 py-2 text-xs text-muted-foreground">
                {new Date(r.created_at).toLocaleDateString("id-ID")}
              </td>
              <td className="px-4 py-2 text-right">
                <button
                  onClick={() => del(r)}
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

function PricePanel({
  provider,
  price,
  onSaved,
}: {
  provider: BankProvider;
  price: PriceRow | undefined;
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState<{ price: number; active: boolean }>({
    price: price?.price_idr ?? 0,
    active: price?.is_active ?? true,
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraft({ price: price?.price_idr ?? 0, active: price?.is_active ?? true });
  }, [provider, price]);

  async function save() {
    setSaving(true);
    try {
      await setBankPrice({
        data: { provider, price_idr: draft.price, is_active: draft.active },
      });
      toast.success(`${PROVIDER_LABELS[provider]}: harga tersimpan`);
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <div className="p-4 border-b border-border/60">
        <div className="font-display text-lg">Harga jual · {PROVIDER_LABELS[provider]}</div>
        <div className="text-xs text-muted-foreground">
          Harga khusus untuk provider ini. Set 0 / nonaktif = tidak muncul di toko user.
        </div>
      </div>
      <div className="p-4 flex flex-col gap-3">
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={draft.active}
            onChange={(e) => setDraft((s) => ({ ...s, active: e.target.checked }))}
            className="h-3.5 w-3.5 rounded border-border"
          />
          Aktif di toko
        </label>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={0}
            value={draft.price}
            onChange={(e) =>
              setDraft((s) => ({ ...s, price: Number(e.target.value) || 0 }))
            }
            className="flex-1 rounded-xl border border-border bg-card/50 px-3 py-2 text-sm font-mono outline-none focus:border-primary/60"
          />
          <button
            onClick={save}
            disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-60"
            style={{ background: "var(--gradient-neon)" }}
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            Simpan
          </button>
        </div>
        <div className="text-[10px] font-mono text-muted-foreground">{rupiah(draft.price)} / key</div>
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
