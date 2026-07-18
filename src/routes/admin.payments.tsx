import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { DashboardShell, PageHero } from "@/components/dashboard/shell";
import { Card } from "@/components/dashboard/ui";
import {
  Loader2,
  ShieldCheck,
  Plus,
  Trash2,
  Save,
  Upload,
  X,
  Pencil,
  QrCode,
  Landmark,
  Wallet as WalletIcon,
  CircleDollarSign,
} from "lucide-react";
import { toast } from "sonner";
import { PaymentGatewaysSection } from "@/components/admin/payment-gateways-section";
import { confirmDialog } from "@/components/ui-confirm";

export const Route = createFileRoute("/admin/payments")({
  head: () => ({
    meta: [
      { title: "Pembayaran & Harga — Admin" },
      { name: "description", content: "Kelola harga fitur premium dan metode pembayaran." },
    ],
  }),
  component: AdminPaymentsPage,
});

function AdminPaymentsPage() {
  return (
    <DashboardShell>
      <PageHero
        eyebrow="Admin"
        title="Pembayaran"
        highlight="& Harga"
        desc="Atur harga tiap fitur premium dan metode pembayaran (QRIS, Bank, E-wallet)."
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
  return (
    <div className="flex flex-col gap-4">
      <PricesSection />
      <PaymentGatewaysSection />
    </div>
  );
}

// ============= Prices =============

type Price = { route_key: string; label: string; price_idr: number; is_active: boolean };

type AccessRow = { route_key: string; access_mode: "public" | "subscription" | "trial"; trial_until: string | null };

function PricesSection() {
  const [rows, setRows] = useState<Price[]>([]);
  const [access, setAccess] = useState<Record<string, AccessRow>>({});
  const [loading, setLoading] = useState(true);
  const [drafts, setDrafts] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState<string | null>(null);

  const DEFAULT_ROWS: { route_key: string; label: string; price_idr: number }[] = [
    { route_key: "ai-influencer", label: "AI Influencer Studio", price_idr: 50000 },
    { route_key: "mixing.clipper", label: "AI Clipper", price_idr: 50000 },
    { route_key: "mixing.dubbing", label: "AI Dubber", price_idr: 50000 },
  ];

  async function load() {
    setLoading(true);
    const [{ data }, { data: accessData }] = await Promise.all([
      supabase.from("feature_prices").select("*").order("label"),
      supabase.from("feature_access" as never).select("route_key, access_mode, trial_until"),
    ]);
    const existing = (data ?? []) as Price[];
    const existingKeys = new Set(existing.map((r) => r.route_key));
    const missing = DEFAULT_ROWS.filter((r) => !existingKeys.has(r.route_key));
    let finalRows = existing;
    if (missing.length > 0) {
      const { error: insErr } = await supabase
        .from("feature_prices")
        .insert(missing.map((m) => ({ ...m, is_active: true })));
      if (!insErr) {
        const { data: refetched } = await supabase.from("feature_prices").select("*").order("label");
        finalRows = (refetched ?? []) as Price[];
      }
    }
    const accessMap: Record<string, AccessRow> = {};
    ((accessData ?? []) as AccessRow[]).forEach((a) => {
      accessMap[a.route_key] = a;
    });
    setAccess(accessMap);
    setRows(finalRows);
    setLoading(false);
  }
  useEffect(() => {
    load();
  }, []);

  async function save(row: Price) {
    const newPrice = drafts[row.route_key];
    const isActive = row.is_active;
    setSaving(row.route_key);
    const { error } = await supabase
      .from("feature_prices")
      .update({ price_idr: newPrice ?? row.price_idr, is_active: isActive })
      .eq("route_key", row.route_key);
    setSaving(null);
    if (error) return toast.error(error.message);
    toast.success("Harga tersimpan");
    setDrafts((d) => {
      const c = { ...d };
      delete c[row.route_key];
      return c;
    });
    load();
  }

  async function toggleActive(row: Price) {
    const { error } = await supabase
      .from("feature_prices")
      .update({ is_active: !row.is_active })
      .eq("route_key", row.route_key);
    if (error) return toast.error(error.message);
    load();
  }

  const FULL_KEY = "__full_access__";
  const bundleRow = rows.find((r) => r.route_key === FULL_KEY) ?? null;
  const featureRows = rows.filter((r) => r.route_key !== FULL_KEY);

  // Default when there's no row: "subscription" (matches admin.access default).
  const modeOf = (key: string) => access[key]?.access_mode ?? "subscription";

  return (
    <Card>
      <div className="p-4 border-b border-border/60">
        <div className="font-display text-lg">Harga Fitur Premium</div>
        <div className="text-xs text-muted-foreground">Ubah harga per fitur (dalam Rupiah, per 30 hari).</div>
      </div>
      {loading ? (
        <div className="p-8 grid place-items-center">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        </div>
      ) : (
        <div className="p-4 flex flex-col gap-4">
          {bundleRow && (
            <div className="rounded-2xl border border-primary/40 bg-primary/[0.06] p-4">
              <div className="text-[10px] font-mono uppercase tracking-widest text-primary/90 mb-1">
                Bundle Diskon
              </div>
              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{bundleRow.label}</div>
                  <div className="text-[11px] text-muted-foreground">
                    Harga khusus untuk user yang beli semua fitur sekaligus (30 hari).
                  </div>
                </div>
                <BundleRow row={bundleRow} drafts={drafts} setDrafts={setDrafts} save={save} toggleActive={toggleActive} saving={saving} />
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {featureRows.map((r) => {
            const draft = drafts[r.route_key];
            const dirty = draft !== undefined && draft !== r.price_idr;
            const mode = modeOf(r.route_key);
            const locked = mode !== "subscription";
            const modeLabel = mode === "public" ? "Umum" : mode === "trial" ? "Trial" : "Langganan";
            return (
              <div
                key={r.route_key}
                className={`rounded-2xl border bg-card/40 p-3 flex flex-col sm:flex-row sm:items-center gap-3 ${
                  locked ? "border-dashed border-border/60 opacity-70" : "border-border"
                }`}
              >
                <div className="flex-1 min-w-0 w-full">
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="text-sm font-medium truncate">{r.label}</div>
                    <span
                      className={`text-[10px] font-mono uppercase tracking-widest px-2 py-0.5 rounded-full border ${
                        locked
                          ? "border-amber-400/40 text-amber-300 bg-amber-400/10"
                          : "border-primary/40 text-primary bg-primary/10"
                      }`}
                    >
                      {modeLabel}
                    </span>
                  </div>
                  <div className="text-[10px] font-mono text-muted-foreground">{r.route_key}</div>
                  {locked && (
                    <div className="text-[11px] text-muted-foreground mt-1">
                      Harga hanya bisa diatur ketika mode akses fitur ini <b>Langganan</b>. Ubah di bagian
                      pengaturan akses di atas.
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-wrap justify-end w-full sm:w-auto">
                  <div className="flex items-center gap-1.5">
                  <span className="text-xs text-muted-foreground">Rp</span>
                  <input
                    type="number"
                    min={0}
                    step={1000}
                    value={draft ?? r.price_idr}
                    disabled={locked}
                    onChange={(e) =>
                      setDrafts((d) => ({ ...d, [r.route_key]: Number(e.target.value) }))
                    }
                    className="w-28 rounded-lg border border-border bg-background/60 px-2 py-1.5 text-sm text-right font-mono outline-none focus:border-primary/60 disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                  </div>
                <button
                  onClick={() => toggleActive(r)}
                  disabled={locked}
                  className={`text-[10px] font-mono uppercase tracking-widest px-2 py-1 rounded-full border disabled:opacity-50 disabled:cursor-not-allowed ${
                    r.is_active
                      ? "border-emerald-400/50 text-emerald-300 bg-emerald-400/10"
                      : "border-rose-400/50 text-rose-300 bg-rose-400/10"
                  }`}
                >
                  {r.is_active ? "aktif" : "off"}
                </button>
                <button
                  onClick={() => save(r)}
                  disabled={!dirty || saving === r.route_key || locked}
                  className="inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-40"
                  style={{ background: "var(--gradient-neon)" }}
                >
                  {saving === r.route_key ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Save className="h-3 w-3" />
                  )}
                </button>
                </div>
              </div>
            );
          })}
          </div>
        </div>
      )}
    </Card>
  );
}

function BundleRow({
  row,
  drafts,
  setDrafts,
  save,
  toggleActive,
  saving,
}: {
  row: Price;
  drafts: Record<string, number>;
  setDrafts: React.Dispatch<React.SetStateAction<Record<string, number>>>;
  save: (row: Price) => void;
  toggleActive: (row: Price) => void;
  saving: string | null;
}) {
  const draft = drafts[row.route_key];
  const dirty = draft !== undefined && draft !== row.price_idr;
  return (
    <div className="flex items-center gap-2 flex-wrap justify-end">
      <div className="flex items-center gap-1.5">
        <span className="text-xs text-muted-foreground">Rp</span>
        <input
          type="number"
          min={0}
          step={1000}
          value={draft ?? row.price_idr}
          onChange={(e) => setDrafts((d) => ({ ...d, [row.route_key]: Number(e.target.value) }))}
          className="w-32 rounded-lg border border-border bg-background/60 px-2 py-1.5 text-sm text-right font-mono outline-none focus:border-primary/60"
        />
      </div>
      <button
        onClick={() => toggleActive(row)}
        className={`text-[10px] font-mono uppercase tracking-widest px-2 py-1 rounded-full border ${
          row.is_active
            ? "border-emerald-400/50 text-emerald-300 bg-emerald-400/10"
            : "border-rose-400/50 text-rose-300 bg-rose-400/10"
        }`}
      >
        {row.is_active ? "aktif" : "off"}
      </button>
      <button
        onClick={() => save(row)}
        disabled={!dirty || saving === row.route_key}
        className="inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-40"
        style={{ background: "var(--gradient-neon)" }}
      >
        {saving === row.route_key ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
      </button>
    </div>
  );
}

// ============= Methods =============

type Method = {
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

const typeMeta = {
  qris: { icon: QrCode, label: "QRIS" },
  bank: { icon: Landmark, label: "Transfer Bank" },
  ewallet: { icon: WalletIcon, label: "E-wallet" },
  custom: { icon: CircleDollarSign, label: "Custom" },
} as const;

function MethodsSection() {
  const [rows, setRows] = useState<Method[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Method | null>(null);
  const [creating, setCreating] = useState(false);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from("payment_methods")
      .select("*")
      .order("sort_order")
      .order("created_at");
    setRows((data ?? []) as Method[]);
    setLoading(false);
  }
  useEffect(() => {
    load();
  }, []);

  async function remove(m: Method) {
    const ok = await confirmDialog({
      title: `Hapus metode "${m.name}"?`,
      description: "Metode pembayaran ini akan dihapus permanen dari daftar.",
      confirmLabel: "Ya, hapus",
      tone: "danger",
    });
    if (!ok) return;
    const { error } = await supabase.from("payment_methods").delete().eq("id", m.id);
    if (error) return toast.error(error.message);
    toast.success("Metode dihapus");
    load();
  }

  async function toggle(m: Method) {
    const { error } = await supabase
      .from("payment_methods")
      .update({ is_active: !m.is_active })
      .eq("id", m.id);
    if (error) return toast.error(error.message);
    load();
  }

  return (
    <Card>
      <div className="p-4 border-b border-border/60 flex items-center justify-between gap-3">
        <div>
          <div className="font-display text-lg">Metode Pembayaran</div>
          <div className="text-xs text-muted-foreground">QRIS (upload gambar), Bank, E-wallet, atau custom.</div>
        </div>
        <button
          onClick={() => setCreating(true)}
          className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold text-primary-foreground"
          style={{ background: "var(--gradient-neon)" }}
        >
          <Plus className="h-4 w-4" /> Tambah
        </button>
      </div>

      {loading ? (
        <div className="p-8 grid place-items-center">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        </div>
      ) : rows.length === 0 ? (
        <div className="p-10 text-center text-sm text-muted-foreground">
          Belum ada metode. Tambahkan minimal 1 supaya user bisa checkout.
        </div>
      ) : (
        <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-3">
          {rows.map((m) => {
            const Icon = typeMeta[m.type].icon;
            return (
              <div key={m.id} className="rounded-2xl border border-border bg-card/40 p-4">
                <div className="flex items-start gap-3">
                  <span className="h-10 w-10 grid place-items-center rounded-xl bg-sidebar-accent/60 border border-sidebar-border shrink-0">
                    <Icon className="h-4 w-4 text-primary" />
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <div className="font-medium truncate">{m.name}</div>
                      <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                        {typeMeta[m.type].label}
                      </span>
                    </div>
                    {m.account_number && (
                      <div className="text-xs text-muted-foreground font-mono truncate">
                        {m.account_number}
                        {m.account_holder && ` — ${m.account_holder}`}
                      </div>
                    )}
                    {m.type === "qris" && m.image_url && (
                      <div className="text-[11px] text-muted-foreground mt-0.5">Gambar QRIS terupload</div>
                    )}
                  </div>
                  <button
                    onClick={() => toggle(m)}
                    className={`text-[10px] font-mono uppercase tracking-widest px-2 py-1 rounded-full border shrink-0 ${
                      m.is_active
                        ? "border-emerald-400/50 text-emerald-300 bg-emerald-400/10"
                        : "border-rose-400/50 text-rose-300 bg-rose-400/10"
                    }`}
                  >
                    {m.is_active ? "aktif" : "off"}
                  </button>
                </div>
                <div className="mt-3 flex items-center gap-1.5">
                  <button
                    onClick={() => setEditing(m)}
                    className="inline-flex items-center gap-1 rounded-full border border-border bg-card/50 px-3 py-1.5 text-xs hover:bg-card"
                  >
                    <Pencil className="h-3 w-3" /> Edit
                  </button>
                  <button
                    onClick={() => remove(m)}
                    className="inline-flex items-center gap-1 rounded-full border border-rose-400/40 text-rose-300 px-3 py-1.5 text-xs hover:bg-rose-500/10"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {(creating || editing) && (
        <MethodModal
          method={editing}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSaved={() => {
            setCreating(false);
            setEditing(null);
            load();
          }}
        />
      )}
    </Card>
  );
}

function MethodModal({
  method,
  onClose,
  onSaved,
}: {
  method: Method | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [type, setType] = useState<Method["type"]>(method?.type ?? "qris");
  const [name, setName] = useState(method?.name ?? "");
  const [instructions, setInstructions] = useState(method?.instructions ?? "");
  const [accountNumber, setAccountNumber] = useState(method?.account_number ?? "");
  const [accountHolder, setAccountHolder] = useState(method?.account_holder ?? "");
  const [imagePath, setImagePath] = useState<string | null>(method?.image_url ?? null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [signedPreview, setSignedPreview] = useState<string | null>(null);
  const [sortOrder, setSortOrder] = useState<number>(method?.sort_order ?? 0);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (imagePath && !imageFile) {
      supabase.storage
        .from("payment-assets")
        .createSignedUrl(imagePath, 3600)
        .then(({ data }: { data: { signedUrl: string } | null }) => setSignedPreview(data?.signedUrl ?? null));
    }
  }, [imagePath, imageFile]);

  function onImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 3 * 1024 * 1024) return toast.error("Gambar maksimal 3MB");
    setImageFile(f);
    setImagePreview(URL.createObjectURL(f));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return toast.error("Nama metode wajib diisi");
    setSaving(true);
    try {
      let finalImagePath = imagePath;
      if (imageFile) {
        const ext = imageFile.name.split(".").pop() || "png";
        const path = `${type}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("payment-assets")
          .upload(path, imageFile, { contentType: imageFile.type });
        if (upErr) throw upErr;
        finalImagePath = path;
      }

      const payload = {
        type,
        name: name.trim(),
        instructions: instructions.trim() || null,
        account_number: accountNumber.trim() || null,
        account_holder: accountHolder.trim() || null,
        image_url: finalImagePath,
        sort_order: sortOrder,
      };

      if (method) {
        const { error } = await supabase.from("payment_methods").update(payload).eq("id", method.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("payment_methods").insert(payload);
        if (error) throw error;
      }
      toast.success("Metode tersimpan");
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal menyimpan");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[70] grid place-items-center bg-background/70 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="neumorph w-full max-w-lg max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-border/60">
          <div className="font-display text-lg">{method ? "Edit metode" : "Tambah metode"}</div>
          <button onClick={onClose} className="h-8 w-8 grid place-items-center rounded-full border border-border">
            <X className="h-4 w-4" />
          </button>
        </div>
        <form onSubmit={submit} className="p-5 flex flex-col gap-3">
          <FieldLabel label="Tipe">
            <div className="grid grid-cols-4 gap-2">
              {(Object.keys(typeMeta) as (keyof typeof typeMeta)[]).map((t) => {
                const active = type === t;
                const Icon = typeMeta[t].icon;
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setType(t)}
                    className={[
                      "flex flex-col items-center gap-1 rounded-xl border py-2 text-xs transition",
                      active ? "border-primary/60 bg-primary/10" : "border-border bg-card/40 hover:bg-card/70",
                    ].join(" ")}
                  >
                    <Icon className="h-4 w-4" />
                    {typeMeta[t].label}
                  </button>
                );
              })}
            </div>
          </FieldLabel>

          <FieldLabel label="Nama tampilan">
            <input value={name} onChange={(e) => setName(e.target.value)} required className={inputCls} placeholder="cth: QRIS BCA, BCA 1234567890, DANA" />
          </FieldLabel>

          {type === "qris" ? (
            <FieldLabel label="Gambar QRIS">
              <label className="flex items-center gap-3 rounded-2xl border border-dashed border-border bg-card/30 px-4 py-4 cursor-pointer hover:bg-sidebar-accent/40">
                <Upload className="h-4 w-4 text-primary" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm truncate">
                    {imageFile ? imageFile.name : imagePath ? "Ganti gambar" : "Upload gambar QRIS (max 3MB)"}
                  </div>
                  <div className="text-[10px] text-muted-foreground">PNG / JPG</div>
                </div>
                {(imagePreview || signedPreview) && (
                  <img
                    src={imagePreview ?? signedPreview!}
                    alt="preview"
                    className="h-16 w-16 rounded-lg object-cover bg-white"
                  />
                )}
                <input type="file" accept="image/*" className="sr-only" onChange={onImageChange} />
              </label>
            </FieldLabel>
          ) : (
            <>
              <FieldLabel label="Nomor rekening / e-wallet">
                <input value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} className={inputCls} placeholder="1234567890" />
              </FieldLabel>
              <FieldLabel label="Atas nama">
                <input value={accountHolder} onChange={(e) => setAccountHolder(e.target.value)} className={inputCls} />
              </FieldLabel>
            </>
          )}

          <FieldLabel label="Instruksi (opsional)">
            <textarea
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              rows={3}
              className={inputCls}
              placeholder="Petunjuk pembayaran yang akan dilihat user"
            />
          </FieldLabel>

          <FieldLabel label="Urutan tampil">
            <input
              type="number"
              value={sortOrder}
              onChange={(e) => setSortOrder(Number(e.target.value))}
              className={inputCls + " max-w-[120px]"}
            />
          </FieldLabel>

          <button
            type="submit"
            disabled={saving}
            className="mt-2 inline-flex items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
            style={{ background: "var(--gradient-neon)" }}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Simpan
          </button>
        </form>
      </div>
    </div>
  );
}

const inputCls =
  "w-full rounded-2xl border border-border bg-card/50 px-3 py-2.5 text-sm outline-none placeholder:text-muted-foreground focus:border-primary/60";

function FieldLabel({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}