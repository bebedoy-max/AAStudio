import { useEffect, useMemo, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Loader2,
  Plus,
  Trash2,
  Save,
  X,
  Plug,
  CheckCircle2,
  AlertCircle,
  Power,
  ExternalLink,
} from "lucide-react";
import { Card } from "@/components/dashboard/ui";
import {
  listPaymentGateways,
  upsertPaymentGateway,
  deletePaymentGateway,
  togglePaymentGateway,
  testPaymentGateway,
  type GatewayListItem,
} from "@/lib/payments/gateways.functions";
import { PAYMENT_PROVIDERS, getProviderDef, type ProviderDef } from "@/lib/payments/providers-catalog";

export function PaymentGatewaysSection() {
  const [items, setItems] = useState<GatewayListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<{ mode: "new" | "edit"; row?: GatewayListItem } | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);

  const fetchList = useServerFn(listPaymentGateways);
  const upsert = useServerFn(upsertPaymentGateway);
  const remove = useServerFn(deletePaymentGateway);
  const toggle = useServerFn(togglePaymentGateway);
  const test = useServerFn(testPaymentGateway);

  async function load() {
    setLoading(true);
    try {
      setItems((await fetchList()) as GatewayListItem[]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal memuat gateway");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleDelete(row: GatewayListItem) {
    if (!confirm(`Hapus konfigurasi "${row.label}"?`)) return;
    try {
      await remove({ data: { id: row.id } });
      toast.success("Gateway dihapus");
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal menghapus");
    }
  }

  async function handleToggle(row: GatewayListItem) {
    try {
      await toggle({ data: { id: row.id, is_active: !row.is_active } });
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal update status");
    }
  }

  async function handleTest(row: GatewayListItem) {
    setTestingId(row.id);
    try {
      const res = await test({ data: { id: row.id } });
      if (res.ok) toast.success(res.message);
      else toast.error(res.message);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal test koneksi");
    } finally {
      setTestingId(null);
    }
  }

  return (
    <Card>
      <div className="p-4 flex flex-wrap items-center justify-between gap-3 border-b border-border/60">
        <div>
          <div className="font-display text-lg flex items-center gap-2">
            <Plug className="h-4 w-4 text-primary" /> Payment Gateway
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Konfigurasi kredensial payment gateway (Midtrans, Xendit, DOKU, VA Bank, dll).
            Kredensial disimpan terenkripsi.
          </p>
        </div>
        <button
          onClick={() => setEditing({ mode: "new" })}
          className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold text-primary-foreground"
          style={{ background: "var(--gradient-neon)" }}
        >
          <Plus className="h-4 w-4" /> Tambah gateway
        </button>
      </div>

      {loading ? (
        <div className="p-8 grid place-items-center">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        </div>
      ) : items.length === 0 ? (
        <div className="p-8 text-center text-sm text-muted-foreground">
          Belum ada gateway. Klik "Tambah gateway" untuk mulai.
        </div>
      ) : (
        <div className="divide-y divide-border/60">
          {items.map((row) => {
            const def = getProviderDef(row.provider);
            return (
              <div key={row.id} className="p-4 flex flex-wrap items-start gap-4">
                <div className="flex-1 min-w-64">
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="font-display text-base">{row.label}</div>
                    <span className="text-[10px] font-mono uppercase tracking-widest px-2 py-0.5 rounded-full border border-border text-muted-foreground">
                      {def?.name ?? row.provider}
                    </span>
                    <span
                      className={[
                        "text-[10px] font-mono uppercase tracking-widest px-2 py-0.5 rounded-full border",
                        row.environment === "production"
                          ? "border-emerald-400/50 text-emerald-300 bg-emerald-400/10"
                          : "border-amber-300/50 text-amber-200 bg-amber-400/10",
                      ].join(" ")}
                    >
                      {row.environment}
                    </span>
                    <button
                      onClick={() => handleToggle(row)}
                      className={[
                        "text-[10px] font-mono uppercase tracking-widest px-2 py-0.5 rounded-full border inline-flex items-center gap-1",
                        row.is_active
                          ? "border-emerald-400/50 text-emerald-300 bg-emerald-400/10"
                          : "border-rose-400/50 text-rose-300 bg-rose-400/10",
                      ].join(" ")}
                    >
                      <Power className="h-3 w-3" />
                      {row.is_active ? "aktif" : "nonaktif"}
                    </button>
                  </div>
                  {Object.keys(row.masked_hint ?? {}).length > 0 && (
                    <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-xs font-mono text-muted-foreground">
                      {Object.entries(row.masked_hint).map(([k, v]) => (
                        <div key={k} className="truncate">
                          <span className="text-foreground/70">{k}</span>: {v}
                        </div>
                      ))}
                    </div>
                  )}
                  {row.last_test_at && (
                    <div
                      className={[
                        "mt-2 text-xs inline-flex items-center gap-1.5",
                        row.last_test_status === "ok" ? "text-emerald-300" : "text-rose-300",
                      ].join(" ")}
                    >
                      {row.last_test_status === "ok" ? (
                        <CheckCircle2 className="h-3.5 w-3.5" />
                      ) : (
                        <AlertCircle className="h-3.5 w-3.5" />
                      )}
                      <span className="truncate max-w-md">
                        {row.last_test_message ?? row.last_test_status}
                      </span>
                      <span className="text-muted-foreground">
                        · {new Date(row.last_test_at).toLocaleString("id-ID")}
                      </span>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleTest(row)}
                    disabled={testingId === row.id}
                    className="inline-flex items-center gap-1.5 rounded-full border border-primary/40 text-primary px-3 py-1.5 text-xs hover:bg-primary/10 disabled:opacity-60"
                  >
                    {testingId === row.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Plug className="h-3.5 w-3.5" />
                    )}
                    Test koneksi
                  </button>
                  <button
                    onClick={() => setEditing({ mode: "edit", row })}
                    className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card/50 px-3 py-1.5 text-xs hover:bg-card"
                  >
                    <Save className="h-3.5 w-3.5" /> Edit
                  </button>
                  <button
                    onClick={() => handleDelete(row)}
                    className="inline-flex items-center gap-1.5 rounded-full border border-rose-400/40 text-rose-300 px-3 py-1.5 text-xs hover:bg-rose-500/10"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {editing && (
        <GatewayModal
          initial={editing.row ?? null}
          onClose={() => setEditing(null)}
          onSave={async (payload) => {
            try {
              await upsert({ data: payload });
              toast.success(editing.row ? "Perubahan tersimpan" : "Gateway ditambahkan");
              setEditing(null);
              load();
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "Gagal menyimpan");
            }
          }}
        />
      )}
    </Card>
  );
}

type UpsertPayload = {
  id?: string;
  provider: string;
  label: string;
  environment: "sandbox" | "production";
  is_active: boolean;
  config: Record<string, string>;
};

function GatewayModal({
  initial,
  onClose,
  onSave,
}: {
  initial: GatewayListItem | null;
  onClose: () => void;
  onSave: (payload: UpsertPayload) => Promise<void>;
}) {
  const [provider, setProvider] = useState<string>(initial?.provider ?? PAYMENT_PROVIDERS[0].id);
  const [label, setLabel] = useState(initial?.label ?? "");
  const [environment, setEnvironment] = useState<"sandbox" | "production">(initial?.environment ?? "sandbox");
  const [isActive, setIsActive] = useState(initial?.is_active ?? true);
  const [config, setConfig] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const def: ProviderDef | undefined = useMemo(() => getProviderDef(provider), [provider]);
  const isEdit = !!initial;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!def) return;
    setSaving(true);
    try {
      await onSave({
        id: initial?.id,
        provider,
        label: label.trim() || def.name,
        environment,
        is_active: isActive,
        config,
      });
    } finally {
      setSaving(false);
    }
  }

  const modalNode = (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-background/70 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="w-full max-w-2xl my-auto max-h-[92vh] overflow-y-auto rounded-2xl border border-border bg-card shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border/60">
          <div className="font-display text-lg">
            {isEdit ? "Edit Payment Gateway" : "Tambah Payment Gateway"}
          </div>
          <button
            onClick={onClose}
            className="h-8 w-8 grid place-items-center rounded-full border border-border"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <form onSubmit={submit} className="p-5 flex flex-col gap-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                Provider
              </span>
              <select
                value={provider}
                onChange={(e) => {
                  setProvider(e.target.value);
                  setConfig({});
                }}
                disabled={isEdit}
                className="w-full rounded-2xl border border-border bg-card/50 px-3 py-2.5 text-sm outline-none disabled:opacity-60"
              >
                {PAYMENT_PROVIDERS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                    {p.category === "bank_va" ? " (VA Bank)" : ""}
                    {p.category === "ewallet" ? " (E-wallet)" : ""}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                Label
              </span>
              <input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder={def?.name ?? "Nama tampilan"}
                className="w-full rounded-2xl border border-border bg-card/50 px-3 py-2.5 text-sm outline-none focus:border-primary/60"
              />
            </label>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                Environment
              </span>
              <div className="grid grid-cols-2 gap-2">
                {(["sandbox", "production"] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setEnvironment(v)}
                    className={[
                      "rounded-2xl border px-3 py-2 text-sm capitalize transition",
                      environment === v
                        ? "border-primary/60 bg-primary/10"
                        : "border-border bg-card/40 hover:bg-card/70",
                    ].join(" ")}
                  >
                    {v}
                  </button>
                ))}
              </div>
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                Status
              </span>
              <button
                type="button"
                onClick={() => setIsActive((v) => !v)}
                className={[
                  "rounded-2xl border px-3 py-2 text-sm inline-flex items-center gap-2 justify-center",
                  isActive
                    ? "border-emerald-400/60 text-emerald-300 bg-emerald-400/10"
                    : "border-rose-400/60 text-rose-300 bg-rose-400/10",
                ].join(" ")}
              >
                <Power className="h-4 w-4" /> {isActive ? "Aktif" : "Nonaktif"}
              </button>
            </label>
          </div>

          {def?.description && (
            <div className="text-xs text-muted-foreground">{def.description}</div>
          )}
          {def?.docsUrl && (
            <a
              href={def.docsUrl}
              target="_blank"
              rel="noreferrer"
              className="text-xs inline-flex items-center gap-1 text-primary hover:underline w-fit"
            >
              Dokumentasi {def.name} <ExternalLink className="h-3 w-3" />
            </a>
          )}

          <div className="flex flex-col gap-3 rounded-2xl border border-border/60 p-4 bg-card/30">
            <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
              Parameter kredensial
            </div>
            {isEdit && (
              <div className="text-[11px] text-muted-foreground">
                Kosongkan field rahasia jika tidak ingin diubah.
              </div>
            )}
            {def?.fields.map((f) => (
              <label key={f.key} className="flex flex-col gap-1.5">
                <span className="text-xs text-foreground/80">
                  {f.label}
                  {f.required && !isEdit ? <span className="text-rose-300 ml-1">*</span> : null}
                </span>
                {f.type === "textarea" ? (
                  <textarea
                    value={config[f.key] ?? ""}
                    onChange={(e) => setConfig((c) => ({ ...c, [f.key]: e.target.value }))}
                    placeholder={f.placeholder}
                    rows={3}
                    className="w-full rounded-2xl border border-border bg-card/50 px-3 py-2 text-sm outline-none focus:border-primary/60"
                  />
                ) : (
                  <input
                    type={f.secret ? "password" : "text"}
                    value={config[f.key] ?? ""}
                    onChange={(e) => setConfig((c) => ({ ...c, [f.key]: e.target.value }))}
                    placeholder={f.placeholder ?? (f.secret && isEdit ? "(tidak berubah)" : "")}
                    autoComplete="off"
                    className="w-full rounded-2xl border border-border bg-card/50 px-3 py-2.5 text-sm outline-none focus:border-primary/60 font-mono"
                  />
                )}
                {f.help && (
                  <span className="text-[10px] text-muted-foreground">{f.help}</span>
                )}
              </label>
            ))}
          </div>

          <div className="text-[11px] text-muted-foreground">
            {def?.liveTestSupported
              ? "Provider ini mendukung test koneksi live ke API mereka."
              : "Test koneksi untuk provider ini hanya memvalidasi field yang wajib diisi (live charge belum diimplementasikan)."}
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-border px-4 py-2 text-sm hover:bg-card"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-full px-5 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
              style={{ background: "var(--gradient-neon)" }}
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Simpan
            </button>
          </div>
        </form>
      </div>
    </div>
  );
  if (typeof document === "undefined") return modalNode;
  return createPortal(modalNode, document.body);
}