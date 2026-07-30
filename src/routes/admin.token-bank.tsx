import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { DashboardShell, PageHero } from "@/components/dashboard/shell";
import { Card, PrimaryButton, GhostButton, Input } from "@/components/dashboard/ui";
import { Loader2, ShieldCheck, Trash2, Send, RefreshCw, Search, X, KeyRound, ArrowLeft, Eye, EyeOff, Plus } from "lucide-react";
import { toast } from "sonner";
import { confirmDialog } from "@/components/ui-confirm";
import {
  BANK_PROVIDERS,
  PROVIDER_LABELS,
  type BankProvider,
  listBankInventory,
  deleteBankKeys,
  transferBankKeysByIds,
  searchUsersForTransfer,
  addBankKeys,
} from "@/lib/token-bank/bank.functions";
import { checkWeavyToken } from "@/lib/providers/weavy";
import { checkWavespeedBalance } from "@/lib/providers/wavespeed";
import { checkMagnificKey } from "@/lib/providers/magnific";
import { checkFramiaToken, fetchFramiaBalance } from "@/lib/providers/framia";
import { fetchRoboneoBalance } from "@/lib/providers/roboneo";
import { fetchFireflyBalance } from "@/lib/providers/firefly";
import { checkElevenKey } from "@/lib/providers/eleven";
import { CheckCircle2, XCircle, AlertTriangle, Activity } from "lucide-react";

export const Route = createFileRoute("/admin/token-bank")({
  head: () => ({
    meta: [
      { title: "Token Bank — Admin" },
      { name: "description", content: "Kelola inventaris key Token Bank: pilih banyak untuk transfer atau hapus." },
    ],
  }),
  component: AdminTokenBankPage,
});

type Row = {
  id: string;
  provider: BankProvider;
  key_value: string;
  label: string | null;
  status: string;
  assigned_to: string | null;
  assigned_at: string | null;
  assigned_email: string | null;
  assigned_display_name: string | null;
  created_at: string;
};

function AdminTokenBankPage() {
  return (
    <DashboardShell>
      <PageHero eyebrow="Admin" title="Token" highlight="Bank" desc="Inventaris key semua provider — pilih beberapa untuk dikirim ke user atau dihapus sekaligus." />
      <div className="mb-3">
        <Link to="/admin" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" /> Kembali ke Dashboard
        </Link>
      </div>
      <Gate />
    </DashboardShell>
  );
}

function Gate() {
  const { loading, isAdmin } = useAuth();
  if (loading) return <Card><div className="p-8 grid place-items-center"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div></Card>;
  if (!isAdmin) return (
    <Card>
      <div className="p-8 text-center">
        <ShieldCheck className="h-8 w-8 text-muted-foreground mx-auto" />
        <div className="mt-3 font-display text-lg">Akses ditolak</div>
        <p className="mt-1 text-sm text-muted-foreground">Halaman ini hanya untuk admin.</p>
      </div>
    </Card>
  );
  return <Body />;
}

function mask(k: string) {
  if (k.length <= 10) return k.slice(0, 3) + "…";
  return k.slice(0, 6) + "…" + k.slice(-4);
}

function Body() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [provider, setProvider] = useState<BankProvider | "">("");
  const [status, setStatus] = useState<"all" | "available" | "assigned">("all");
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [checkStates, setCheckStates] = useState<Record<string, CheckState>>({});
  const [checking, setChecking] = useState(false);
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  function toggleReveal(id: string) {
    setRevealed((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }

  async function load() {
    setLoading(true);
    try {
      const r = (await listBankInventory({})) as unknown as Row[];
      setRows(r);
      setSelected(new Set());
    } catch (e) {
      toast.error("Gagal memuat: " + (e instanceof Error ? e.message : ""));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (provider && r.provider !== provider) return false;
      if (status !== "all" && r.status !== status) return false;
      if (!term) return true;
      return (
        r.key_value.toLowerCase().includes(term) ||
        (r.label ?? "").toLowerCase().includes(term) ||
        (r.assigned_email ?? "").toLowerCase().includes(term) ||
        (r.assigned_display_name ?? "").toLowerCase().includes(term)
      );
    });
  }, [rows, provider, status, q]);

  const selectedRows = useMemo(() => filtered.filter((r) => selected.has(r.id)), [filtered, selected]);
  const selectableIds = useMemo(() => filtered.map((r) => r.id), [filtered]);
  const allSelected = selectableIds.length > 0 && selectableIds.every((id) => selected.has(id));
  const someSelected = selected.size > 0;
  const canTransfer = selectedRows.length > 0 && selectedRows.every((r) => r.status === "available");

  function toggle(id: string) {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }
  function toggleAll() {
    setSelected((s) => {
      if (allSelected) {
        const n = new Set(s);
        for (const id of selectableIds) n.delete(id);
        return n;
      }
      const n = new Set(s);
      for (const id of selectableIds) n.add(id);
      return n;
    });
  }
  function clearSelection() { setSelected(new Set()); }

  async function bulkCheck() {
    if (selectedRows.length === 0) return;
    setChecking(true);
    // Mark all as pending/checking immediately for real-time feedback.
    setCheckStates((s) => {
      const n = { ...s };
      for (const r of selectedRows) n[r.id] = { status: "checking" };
      return n;
    });
    // Sequential to avoid provider rate-limits/bans.
    for (const r of selectedRows) {
      const res = await checkOne(r.provider, r.key_value);
      setCheckStates((s) => ({ ...s, [r.id]: res }));
    }
    setChecking(false);
  }

  async function bulkDelete() {
    if (selected.size === 0) return;
    const ok = await confirmDialog({
      title: `Hapus ${selected.size} key?`,
      description: "Key yang sudah di-assign ke user tetap aktif di token manager user. Aksi ini tidak bisa dibatalkan.",
      confirmLabel: "Hapus",
      tone: "danger",
    });
    if (!ok) return;
    setBusy(true);
    try {
      const ids = Array.from(selected);
      await deleteBankKeys({ data: { ids } });
      toast.success(`${ids.length} key dihapus`);
      await load();
    } catch (e) {
      toast.error("Gagal menghapus: " + (e instanceof Error ? e.message : ""));
    } finally {
      setBusy(false);
    }
  }

  const providerSummary = useMemo(() => {
    const map: Record<string, { total: number; available: number; assigned: number }> = {};
    for (const r of rows) {
      const s = (map[r.provider] ||= { total: 0, available: 0, assigned: 0 });
      s.total++;
      if (r.status === "available") s.available++;
      else if (r.status === "assigned") s.assigned++;
    }
    return map;
  }, [rows]);

  return (
    <div className="space-y-4">
      {/* Filters */}
      <Card>
        <div className="p-4 flex flex-wrap items-center gap-2">
          <select
            value={provider}
            onChange={(e) => setProvider(e.target.value as BankProvider | "")}
            className="h-9 rounded-lg border border-border bg-card/50 px-3 text-sm"
          >
            <option value="">Semua provider</option>
            {BANK_PROVIDERS.map((p) => (
              <option key={p} value={p}>{PROVIDER_LABELS[p]}</option>
            ))}
          </select>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as typeof status)}
            className="h-9 rounded-lg border border-border bg-card/50 px-3 text-sm"
          >
            <option value="all">Semua status</option>
            <option value="available">Available</option>
            <option value="assigned">Assigned</option>
          </select>
          <div className="relative flex-1 min-w-[200px]">
            <Search className="h-3.5 w-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari key / label / user…" className="pl-8" />
          </div>
          <GhostButton onClick={load} disabled={loading || busy}>
            <RefreshCw className={"h-3.5 w-3.5 " + (loading ? "animate-spin" : "")} /> Refresh
          </GhostButton>
          <PrimaryButton onClick={() => setAddOpen(true)} disabled={busy}>
            <Plus className="h-3.5 w-3.5" /> Tambah Key
          </PrimaryButton>
        </div>

        {/* Provider summary chips */}
        {Object.keys(providerSummary).length > 0 && (
          <div className="px-4 pb-4 flex flex-wrap gap-1.5">
            {BANK_PROVIDERS.map((p) => {
              const s = providerSummary[p];
              if (!s) return null;
              return (
                <button
                  key={p}
                  onClick={() => setProvider(provider === p ? "" : p)}
                  className={
                    "text-[10px] font-mono uppercase tracking-widest rounded-full px-2.5 py-1 border transition " +
                    (provider === p
                      ? "border-primary/60 bg-primary/10 text-foreground"
                      : "border-border bg-card/40 text-muted-foreground hover:text-foreground")
                  }
                  title={`${s.available} available · ${s.assigned} assigned`}
                >
                  {PROVIDER_LABELS[p]} <span className="opacity-70">({s.available}/{s.total})</span>
                </button>
              );
            })}
          </div>
        )}
      </Card>

      {/* Bulk action bar (sticky when selection active) */}
      {someSelected && (
        <div className="sticky top-2 z-20 neumorph p-2 sm:p-3 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 border border-primary/40 bg-card/90 backdrop-blur">
          <div className="flex items-center gap-2 text-sm min-w-0">
            <KeyRound className="h-4 w-4 text-primary shrink-0" />
            <span className="font-display truncate">{selected.size} key terpilih</span>
            {!canTransfer && (
              <span className="hidden sm:inline text-[11px] text-amber-300 truncate">
                (transfer hanya untuk key status <b>available</b>)
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <GhostButton onClick={clearSelection} disabled={busy} aria-label="Batal" className="h-8 w-8 sm:h-9 sm:w-auto sm:px-2.5 inline-flex items-center justify-center">
              <X className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Batal</span>
            </GhostButton>
            <button
              disabled={!canTransfer || busy}
              onClick={() => setTransferOpen(true)}
              aria-label="Kirim ke user"
              className="inline-flex items-center justify-center gap-1.5 rounded-lg h-8 w-8 sm:h-9 sm:w-auto sm:px-3 text-xs font-semibold text-primary-foreground disabled:opacity-50"
              style={{ background: "var(--gradient-neon)" }}
            >
              <Send className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Kirim ke user</span>
            </button>
            <button
              disabled={busy || checking || selectedRows.length === 0}
              onClick={bulkCheck}
              aria-label="Cek"
              className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-primary/40 text-primary h-8 w-8 sm:h-9 sm:w-auto sm:px-3 text-xs hover:bg-primary/10 disabled:opacity-50"
            >
              {checking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Activity className="h-3.5 w-3.5" />} <span className="hidden sm:inline">Cek</span>
            </button>
            <button
              disabled={busy}
              onClick={bulkDelete}
              aria-label="Hapus"
              className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-rose-400/40 text-rose-300 h-8 w-8 sm:h-9 sm:w-auto sm:px-3 text-xs hover:bg-rose-500/10 disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />} <span className="hidden sm:inline">Hapus</span>
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      <Card>
        {loading ? (
          <div className="p-8 grid place-items-center"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">Tidak ada key.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                <tr className="border-b border-border/60">
                  <th className="px-3 py-3 w-8">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleAll}
                      aria-label="Pilih semua"
                      className="h-4 w-4 accent-primary cursor-pointer"
                    />
                  </th>
                  <th className="px-3 py-3">Provider</th>
                  <th className="px-3 py-3">Key</th>
                  <th className="px-3 py-3">Credits</th>
                  <th className="px-3 py-3 hidden md:table-cell">Status</th>
                  <th className="px-3 py-3 hidden md:table-cell">Assigned</th>
                  <th className="px-3 py-3 hidden md:table-cell">Waktu</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const sel = selected.has(r.id);
                  return (
                    <tr
                      key={r.id}
                      onClick={() => toggle(r.id)}
                      className={
                        "border-b border-border/40 cursor-pointer transition " +
                        (sel ? "bg-primary/10" : "hover:bg-sidebar-accent/20")
                      }
                    >
                      <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={sel}
                          onChange={() => toggle(r.id)}
                          className="h-4 w-4 accent-primary cursor-pointer"
                        />
                      </td>
                      <td className="px-3 py-2 text-xs">{PROVIDER_LABELS[r.provider]}</td>
                      <td className="px-3 py-2 font-mono text-xs" onClick={(e) => e.stopPropagation()}>
                        <div className="inline-flex items-center gap-1.5 max-w-[52vw] md:max-w-none">
                          <span className={revealed.has(r.id) ? "break-all" : ""}>
                            {revealed.has(r.id) ? r.key_value : mask(r.key_value)}
                          </span>
                          <button
                            type="button"
                            onClick={() => toggleReveal(r.id)}
                            aria-label={revealed.has(r.id) ? "Sembunyikan token" : "Tampilkan token"}
                            className="shrink-0 h-6 w-6 grid place-items-center rounded-md border border-border/60 text-muted-foreground hover:text-foreground hover:bg-sidebar-accent/30"
                          >
                            {revealed.has(r.id) ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                          </button>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-xs" onClick={(e) => e.stopPropagation()}>
                        <CreditCell state={checkStates[r.id]} />
                      </td>
                      <td className="px-3 py-2 hidden md:table-cell">
                        <StatusPill status={r.status} />
                      </td>
                      <td className="px-3 py-2 text-xs hidden md:table-cell">
                        {r.assigned_to ? (
                          <>
                            <div className="text-foreground">{r.assigned_display_name || "—"}</div>
                            <div className="text-muted-foreground">{r.assigned_email}</div>
                          </>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-[11px] text-muted-foreground hidden md:table-cell">
                        {new Date(r.created_at).toLocaleString("id-ID")}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {transferOpen && (
        <TransferDialog
          selectedIds={Array.from(selected)}
          onClose={() => setTransferOpen(false)}
          onDone={async () => {
            setTransferOpen(false);
            await load();
          }}
        />
      )}

      {addOpen && (
        <AddKeysDialog
          defaultProvider={provider || "brain"}
          existing={rows.map((r) => ({ provider: r.provider, key_value: r.key_value }))}
          onClose={() => setAddOpen(false)}
          onDone={async () => {
            setAddOpen(false);
            await load();
          }}
        />
      )}
    </div>
  );
}

function CreditCell({ state }: { state: CheckState | undefined }) {
  if (!state) return <span className="text-muted-foreground">—</span>;
  if (state.status === "checking")
    return (
      <span className="inline-flex items-center gap-1.5 text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" /> Cek…
      </span>
    );
  if (state.status === "pending") return <span className="text-muted-foreground">—</span>;
  const color =
    state.status === "ok" ? "text-emerald-300"
    : state.status === "warn" ? "text-amber-300"
    : "text-rose-300";
  return (
    <span className={`inline-flex items-center gap-1.5 ${color}`} title={state.detail}>
      <StatusIcon state={state.status} />
      <span className="truncate max-w-[220px]">{state.detail}</span>
    </span>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    available: "border-emerald-400/50 text-emerald-300 bg-emerald-400/10",
    assigned: "border-primary/50 text-primary bg-primary/10",
  };
  const cls = map[status] ?? "border-border text-muted-foreground bg-card/40";
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-widest px-2 py-0.5 rounded-full border ${cls}`}>
      {status}
    </span>
  );
}

function TransferDialog({
  selectedIds,
  onClose,
  onDone,
}: {
  selectedIds: string[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<{ id: string; email: string | null; display_name: string | null }[]>([]);
  const [target, setTarget] = useState<{ id: string; email: string | null; display_name: string | null } | null>(null);
  const [searching, setSearching] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setResults([]); return; }
    let cancel = false;
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const r = (await searchUsersForTransfer({ data: { q: term } })) as unknown as {
          id: string; email: string | null; display_name: string | null;
        }[];
        if (!cancel) setResults(r);
      } catch { /* ignore */ }
      finally { if (!cancel) setSearching(false); }
    }, 250);
    return () => { cancel = true; clearTimeout(t); };
  }, [q]);

  async function send() {
    if (!target) return;
    setSending(true);
    try {
      const r = (await transferBankKeysByIds({ data: { ids: selectedIds, targetUserId: target.id } })) as unknown as { delivered: number };
      toast.success(`${r.delivered} key terkirim ke ${target.display_name || target.email}`);
      onDone();
    } catch (e) {
      toast.error("Gagal transfer: " + (e instanceof Error ? e.message : ""));
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[80] grid place-items-center bg-black/70 backdrop-blur-sm p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="neumorph w-full max-w-md p-5 relative" style={{ background: "var(--gradient-card, hsl(var(--card)))" }}>
        <button onClick={onClose} className="absolute top-3 right-3 h-8 w-8 grid place-items-center rounded-full border border-border bg-card">
          <X className="h-4 w-4" />
        </button>
        <div className="font-display text-lg mb-1">Kirim {selectedIds.length} key</div>
        <div className="text-xs text-muted-foreground mb-4">Cari user berdasarkan email atau nama.</div>

        <div className="relative">
          <Search className="h-3.5 w-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input autoFocus value={q} onChange={(e) => { setQ(e.target.value); setTarget(null); }} placeholder="email@domain.com / nama…" className="pl-8" />
        </div>

        {q.trim().length >= 2 && (
          <div className="mt-2 max-h-56 overflow-y-auto rounded-xl border border-border/60 bg-card/40 divide-y divide-border/40">
            {searching ? (
              <div className="p-3 text-xs text-muted-foreground flex items-center gap-2"><Loader2 className="h-3 w-3 animate-spin" /> Mencari…</div>
            ) : results.length === 0 ? (
              <div className="p-3 text-xs text-muted-foreground">Tidak ada hasil.</div>
            ) : (
              results.map((u) => (
                <button
                  key={u.id}
                  onClick={() => setTarget(u)}
                  className={
                    "w-full text-left px-3 py-2 text-sm transition " +
                    (target?.id === u.id ? "bg-primary/10 text-foreground" : "hover:bg-sidebar-accent/30")
                  }
                >
                  <div className="font-medium">{u.display_name || "—"}</div>
                  <div className="text-xs text-muted-foreground">{u.email}</div>
                </button>
              ))
            )}
          </div>
        )}

        {target && (
          <div className="mt-3 rounded-lg border border-primary/40 bg-primary/10 px-3 py-2 text-xs">
            Target: <b>{target.display_name || target.email}</b>
          </div>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <GhostButton onClick={onClose} disabled={sending}>Batal</GhostButton>
          <PrimaryButton onClick={send} disabled={!target || sending}>
            {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />} Kirim
          </PrimaryButton>
        </div>
      </div>
    </div>
  );
}

type CheckState =
  | { status: "pending" }
  | { status: "checking" }
  | { status: "ok"; detail: string }
  | { status: "warn"; detail: string }
  | { status: "fail"; detail: string };

async function checkOne(provider: BankProvider, key: string): Promise<CheckState> {
  try {
    switch (provider) {
      case "brain": {
        const r = await fetch(
          "https://generativelanguage.googleapis.com/v1beta/models?pageSize=1",
          { headers: { "x-goog-api-key": key } },
        );
        if (r.ok) {
          const d = (await r.json().catch(() => ({}))) as { models?: unknown[] };
          const n = Array.isArray(d.models) ? d.models.length : 0;
          return { status: "ok", detail: n > 0 ? `Valid · ${n}+ model` : "Valid" };
        }
        if (r.status === 429) return { status: "warn", detail: "429 · rate-limit / quota" };
        if (r.status === 401 || r.status === 403 || r.status === 400)
          return { status: "fail", detail: `${r.status} · key ditolak` };
        return { status: "fail", detail: `HTTP ${r.status}` };
      }
      case "weavy": {
        const r = await checkWeavyToken(key);
        if (!r.ok) return { status: "fail", detail: "Refresh gagal / expired" };
        const cr = r.credits;
        const email = r.email ? ` · ${r.email}` : "";
        if (cr === null) return { status: "warn", detail: `Credits: —${email}` };
        return {
          status: cr > 0 ? "ok" : "warn",
          detail: `${cr} credits${email}`,
        };
      }
      case "wavespeed": {
        const r = await checkWavespeedBalance(key);
        if (!r.ok) return { status: "fail", detail: "Key ditolak" };
        if (r.balance === null) return { status: "warn", detail: "Balance —" };
        return { status: r.balance > 0 ? "ok" : "warn", detail: `$${r.balance}` };
      }
      case "magnific": {
        // No safe probe — treat as unknown.
        return { status: "warn", detail: "Tidak dapat dicek (endpoint konsumsi credit)" };
      }
      case "framia": {
        const chk = await checkFramiaToken(key);
        if (!chk.ok) return { status: "fail", detail: chk.message || "Token tidak valid" };
        const bal = await fetchFramiaBalance(key).catch(() => null);
        const exp = chk.expiresAt ? ` · exp ${new Date(chk.expiresAt).toLocaleDateString("id-ID")}` : "";
        const email = chk.email ? ` · ${chk.email}` : "";
        const b = bal && bal.ok ? ` · ${bal.balance ?? "—"} cr` : "";
        return { status: "ok", detail: `Valid${b}${email}${exp}` };
      }
      case "roboneo": {
        const r = await fetchRoboneoBalance(key);
        if (!r.ok) return { status: "fail", detail: r.message || "Token tidak valid / expired" };
        if (r.balance === null) return { status: "warn", detail: "Credit tidak terbaca" };
        return {
          status: r.balance > 0 ? "ok" : "warn",
          detail: `${r.balance.toLocaleString("id-ID")} credit`,
        };
      }
      case "firefly": {
        const r = await fetchFireflyBalance(key);
        if (!r.ok) return { status: "fail", detail: r.message || "Token Firefly tidak valid / expired" };
        if (r.balance === null) return { status: "warn", detail: "Credit tidak terbaca" };
        return {
          status: r.balance > 0 ? "ok" : "warn",
          detail: `${r.balance.toLocaleString("id-ID")} credit`,
        };
      }
      case "eleven": {
        const r = await checkElevenKey(key);
        if (!r.ok) return { status: "fail", detail: "Key ditolak / gagal" };
        const rem = r.remaining ?? Math.max(0, r.characterLimit - r.characterCount);
        return {
          status: rem > 0 ? "ok" : "warn",
          detail: `${rem.toLocaleString("id-ID")} char sisa${r.tier ? ` · ${r.tier}` : ""}`,
        };
      }
      case "shotstack":
      case "creatomate":
        return { status: "warn", detail: "Cek otomatis belum didukung untuk provider ini" };
    }
  } catch (e) {
    return { status: "fail", detail: (e as Error).message || "error" };
  }
}

function StatusIcon({ state }: { state: CheckState["status"] }) {
  if (state === "ok") return <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />;
  if (state === "warn") return <AlertTriangle className="h-4 w-4 text-amber-300 shrink-0" />;
  if (state === "fail") return <XCircle className="h-4 w-4 text-rose-400 shrink-0" />;
  if (state === "checking") return <Loader2 className="h-4 w-4 animate-spin text-primary shrink-0" />;
  return <div className="h-4 w-4 rounded-full border border-border shrink-0" />;
}

// Provider yang tidak punya endpoint cek aman (cek otomatis dilewati).
const UNCHECKABLE_PROVIDERS: BankProvider[] = ["magnific", "shotstack", "creatomate"];

// Validasi format dasar sebelum hit provider (hemat request & tolak sampah).
function formatIssue(provider: BankProvider, key: string): string | null {
  if (/\s/.test(key)) return "Format salah · mengandung spasi";
  if (key.length < 12) return "Format salah · terlalu pendek";
  if (provider === "brain" && !/^AIza[\w-]{20,}$/.test(key) && !/^sk-[\w-]{20,}$/.test(key))
    return "Format salah · bukan Gemini (AIza…) / OpenAI (sk-…)";
  if (provider === "eleven" && !/^[A-Za-z0-9_-]{20,}$/.test(key)) return "Format salah";
  return null;
}

type VerifyRow = {
  key: string;
  state: CheckState | { status: "skip"; detail: string } | { status: "dup"; detail: string };
};

function AddKeysDialog({
  defaultProvider,
  existing,
  onClose,
  onDone,
}: {
  defaultProvider: BankProvider;
  existing: { provider: BankProvider; key_value: string }[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [provider, setProvider] = useState<BankProvider>(defaultProvider);
  const [label, setLabel] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [results, setResults] = useState<VerifyRow[] | null>(null);

  const keys = useMemo(
    () =>
      Array.from(
        new Set(
          text
            .split(/[\r\n,]+/)
            .map((s) => s.trim())
            .filter(Boolean),
        ),
      ),
    [text],
  );

  const existingSet = useMemo(
    () => new Set(existing.filter((r) => r.provider === provider).map((r) => r.key_value)),
    [existing, provider],
  );

  const accepted = useMemo(
    () => (results ?? []).filter((r) => r.state.status === "ok" || r.state.status === "skip"),
    [results],
  );
  const rejected = useMemo(
    () => (results ?? []).filter((r) => r.state.status !== "ok" && r.state.status !== "skip"),
    [results],
  );

  async function verify() {
    if (keys.length === 0) {
      toast.error("Masukkan minimal 1 key");
      return;
    }
    setVerifying(true);
    setResults(null);
    setProgress({ done: 0, total: keys.length });
    const out: VerifyRow[] = [];
    const seen = new Set<string>();
    for (const k of keys) {
      if (existingSet.has(k) || seen.has(k)) {
        out.push({ key: k, state: { status: "dup", detail: "Duplikat · sudah ada di Token Bank" } });
      } else {
        seen.add(k);
        const fmt = formatIssue(provider, k);
        if (fmt) {
          out.push({ key: k, state: { status: "fail", detail: fmt } });
        } else if (UNCHECKABLE_PROVIDERS.includes(provider)) {
          out.push({ key: k, state: { status: "skip", detail: "Cek otomatis tidak tersedia · disimpan" } });
        } else {
          out.push({ key: k, state: await checkOne(provider, k) });
        }
      }
      setProgress((p) => ({ ...p, done: p.done + 1 }));
      setResults([...out]);
    }
    setVerifying(false);
  }

  async function saveAccepted() {
    const list = accepted.map((r) => r.key);
    if (list.length === 0) {
      toast.error("Tidak ada key valid untuk disimpan");
      return;
    }
    setBusy(true);
    try {
      const r = (await addBankKeys({
        data: { provider, keys: list, label: label.trim() || undefined },
      })) as unknown as { added: number };
      toast.success(`${r.added} key valid ditambahkan ke ${PROVIDER_LABELS[provider]}`);
      onDone();
    } catch (e) {
      toast.error("Gagal menambah: " + (e instanceof Error ? e.message : ""));
    } finally {
      setBusy(false);
    }
  }

  const badge = (s: VerifyRow["state"]["status"]) =>
    s === "ok"
      ? "text-emerald-300 border-emerald-400/40 bg-emerald-400/10"
      : s === "skip"
        ? "text-sky-300 border-sky-400/40 bg-sky-400/10"
        : s === "warn"
          ? "text-amber-300 border-amber-400/40 bg-amber-400/10"
          : s === "dup"
            ? "text-violet-300 border-violet-400/40 bg-violet-400/10"
            : "text-rose-300 border-rose-400/40 bg-rose-400/10";

  const labelOf = (s: VerifyRow["state"]["status"]) =>
    s === "ok" ? "Valid" : s === "skip" ? "Tanpa cek" : s === "warn" ? "Credit kosong" : s === "dup" ? "Duplikat" : "Gagal";

  return (
    <div className="fixed inset-0 z-[80] grid place-items-center bg-black/70 backdrop-blur-sm p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="neumorph w-full max-w-lg max-h-[90vh] overflow-y-auto p-5 relative"
        style={{ background: "var(--gradient-card, hsl(var(--card)))" }}
      >
        <button
          onClick={onClose}
          className="absolute top-3 right-3 h-8 w-8 grid place-items-center rounded-full border border-border bg-card"
        >
          <X className="h-4 w-4" />
        </button>
        <div className="font-display text-lg mb-1">Tambah Key ke Token Bank</div>
        <div className="text-xs text-muted-foreground mb-4">
          Semua key dicek dulu (valid, expired, format, credit, duplikat). Hanya key valid yang
          disimpan ke Token Bank.
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
              Provider
            </label>
            <select
              value={provider}
              onChange={(e) => {
                setProvider(e.target.value as BankProvider);
                setResults(null);
              }}
              className="mt-1 w-full h-9 rounded-lg border border-border bg-card/50 px-3 text-sm"
            >
              {BANK_PROVIDERS.map((p) => (
                <option key={p} value={p}>
                  {PROVIDER_LABELS[p]}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
              Label (opsional)
            </label>
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="mis. batch-oktober / donatur X"
              className="mt-1"
            />
          </div>

          <div>
            <label className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
              Key ({keys.length})
            </label>
            <textarea
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                setResults(null);
              }}
              rows={6}
              placeholder="Tempel key di sini. Satu key per baris."
              className="mt-1 w-full rounded-lg border border-border bg-card/50 px-3 py-2 text-sm font-mono resize-y"
            />
          </div>
        </div>

        {verifying && (
          <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
            Mengecek key… {progress.done}/{progress.total}
          </div>
        )}

        {results && (
          <div className="mt-4 rounded-xl border border-border bg-card/40 p-3">
            <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-mono uppercase tracking-widest">
              <span className="rounded-full border border-emerald-400/40 bg-emerald-400/10 px-2 py-0.5 text-emerald-300">
                {accepted.length} siap simpan
              </span>
              <span className="rounded-full border border-rose-400/40 bg-rose-400/10 px-2 py-0.5 text-rose-300">
                {rejected.length} ditolak
              </span>
            </div>
            <div className="mt-2 max-h-60 overflow-y-auto flex flex-col gap-1.5">
              {results.map((r) => (
                <div key={r.key} className="flex items-start gap-2 text-xs">
                  <span
                    className={
                      "shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-mono " +
                      badge(r.state.status)
                    }
                  >
                    {labelOf(r.state.status)}
                  </span>
                  <div className="min-w-0">
                    <div className="font-mono text-[11px] text-muted-foreground truncate">{mask(r.key)}</div>
                    <div className="text-[11px]">
                      {"detail" in r.state ? r.state.detail : "—"}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <GhostButton onClick={onClose} disabled={busy || verifying}>
            Tutup
          </GhostButton>
          <GhostButton onClick={verify} disabled={busy || verifying || keys.length === 0}>
            {verifying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Activity className="h-3.5 w-3.5" />}
            Cek {keys.length} key
          </GhostButton>
          <PrimaryButton onClick={saveAccepted} disabled={busy || verifying || accepted.length === 0}>
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            Simpan {accepted.length} valid
          </PrimaryButton>
        </div>
      </div>
    </div>
  );
}