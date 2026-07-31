import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, type FeatureAccessMode, normalizeFeatureAccessMode as normalizeMode } from "@/lib/auth-context";
import { MENU_CATALOG } from "@/lib/menu-catalog";
import { DashboardShell, PageHero } from "@/components/dashboard/shell";
import { Card } from "@/components/dashboard/ui";
import { Loader2, ShieldCheck, Save, LifeBuoy, Brain, Plug, LayoutList, Plus, Trash2, RefreshCw, Cloud } from "lucide-react";
import { GlobalCloudSection } from "@/components/admin/global-cloud-section";
import { PROVIDER_FLAGS, refreshPlatformFlags } from "@/lib/platform/provider-flags";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/access")({
  head: () => ({
    meta: [
      { title: "Pengaturan Halaman — Admin" },
      {
        name: "description",
        content: "Atur menu mana yang terbuka untuk umum, berlangganan, atau trial.",
      },
    ],
  }),
  component: AdminAccessPage,
});

function AdminAccessPage() {
  return (
    <DashboardShell>
      <PageHero
        eyebrow="Admin"
        title="Pengaturan"
        highlight="Halaman"
        desc="Atur status tiap menu aplikasi: Open (umum), Premium (berbayar), Trial (uji coba), Lock (nonaktif), atau Hide (sembunyi). Menu baru otomatis muncul di sini dengan default Hide."
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
  return <AdminSettingsTabs />;
}

const TABS = [
  { key: "pages", label: "Halaman", icon: LayoutList },
  { key: "providers", label: "Provider", icon: Plug },
  { key: "brain", label: "Global Brain", icon: Brain },
  { key: "cloud", label: "Global Cloud", icon: Cloud },
  { key: "contact", label: "Kontak", icon: LifeBuoy },
] as const;

function AdminSettingsTabs() {
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("pages");
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={[
                "inline-flex items-center gap-2 rounded-full border px-4 py-2 text-xs font-semibold transition",
                active
                  ? "border-transparent text-primary-foreground"
                  : "border-border text-muted-foreground hover:text-foreground",
              ].join(" ")}
              style={active ? { background: "var(--gradient-neon)" } : undefined}
            >
              <Icon className="h-3.5 w-3.5" />
              {t.label}
            </button>
          );
        })}
      </div>
      {tab === "pages" && <AccessBody />}
      {tab === "providers" && <ProviderSection />}
      {tab === "brain" && <GlobalBrainSection />}
      {tab === "cloud" && <GlobalCloudSection />}
      {tab === "contact" && <ContactSection />}
    </div>
  );
}

type Draft = { mode: FeatureAccessMode; trialUntil: string | null };

function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const off = d.getTimezoneOffset();
  const local = new Date(d.getTime() - off * 60000);
  return local.toISOString().slice(0, 16);
}

function formatRupiah(n: number) {
  return "Rp " + n.toLocaleString("id-ID");
}

function AccessBody() {
  const [loading, setLoading] = useState(true);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [saved, setSaved] = useState<Record<string, Draft>>({});
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const [{ data: access }, { data: priceRows }] = await Promise.all([
      supabase.from("feature_access" as never).select("route_key, access_mode, trial_until"),
      supabase.from("feature_prices").select("route_key, price_idr, is_active"),
    ]);

    const settings: Record<string, Draft> = {};
    ((access ?? []) as { route_key: string; access_mode: string; trial_until: string | null }[]).forEach(
      (r) => {
        settings[r.route_key] = { mode: normalizeMode(r.access_mode), trialUntil: r.trial_until };
      },
    );
    // default menu yang belum di-set = "hide"
    const full: Record<string, Draft> = {};
    MENU_CATALOG.forEach((f) => {
      full[f.key] = settings[f.key] ?? { mode: "hide", trialUntil: null };
    });

    const priceMap: Record<string, number> = {};
    ((priceRows ?? []) as { route_key: string; price_idr: number; is_active: boolean }[]).forEach((p) => {
      priceMap[p.route_key] = p.price_idr;
    });

    setDrafts(full);
    setSaved(JSON.parse(JSON.stringify(full)));
    setPrices(priceMap);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  const groups = useMemo(() => {
    const byGroup: Record<string, typeof MENU_CATALOG> = {};
    MENU_CATALOG.forEach((f) => {
      (byGroup[f.group] ||= []).push(f);
    });
    return byGroup;
  }, []);

  function setMode(key: string, mode: FeatureAccessMode) {
    setDrafts((d) => ({ ...d, [key]: { ...d[key], mode } }));
  }
  function setTrial(key: string, value: string) {
    const iso = value ? new Date(value).toISOString() : null;
    setDrafts((d) => ({ ...d, [key]: { ...d[key], trialUntil: iso } }));
  }

  function isDirty(key: string) {
    const a = drafts[key];
    const b = saved[key];
    if (!a || !b) return false;
    return a.mode !== b.mode || a.trialUntil !== b.trialUntil;
  }

  async function save(key: string) {
    const label = MENU_CATALOG.find((f) => f.key === key)?.label ?? key;
    const draft = drafts[key];
    setSaving(key);
    const { error } = await supabase.from("feature_access" as never).upsert(
      {
        route_key: key,
        access_mode: draft.mode,
        trial_until: draft.mode === "trial" ? draft.trialUntil : null,
        updated_at: new Date().toISOString(),
      } as never,
      { onConflict: "route_key" },
    );
    setSaving(null);
    if (error) return toast.error(error.message);
    toast.success(`Pengaturan "${label}" tersimpan`);
    setSaved((s) => ({ ...s, [key]: JSON.parse(JSON.stringify(draft)) }));
  }

  const MODES: { value: FeatureAccessMode; label: string; hint: string }[] = [
    { value: "open", label: "Open", hint: "gratis untuk semua user" },
    { value: "premium", label: "Premium", hint: "berbayar / langganan" },
    { value: "trial", label: "Trial", hint: "uji coba sampai tanggal tertentu" },
    { value: "lock", label: "Lock", hint: "tampil tapi dinonaktifkan" },
    { value: "hide", label: "Hide", hint: "disembunyikan dari user" },
  ];

  if (loading)
    return (
      <Card>
        <div className="p-8 grid place-items-center">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        </div>
      </Card>
    );

  return (
    <div className="flex flex-col gap-4">
      {Object.entries(groups).map(([groupName, features]) => (
        <Card key={groupName}>
          <div className="p-4 border-b border-border/60">
            <div className="font-display text-lg">{groupName}</div>
            <div className="text-xs text-muted-foreground">
              Atur akses tiap menu di grup ini untuk user umum.
            </div>
          </div>
          <div className="p-4 flex flex-col gap-3">
            {features.map((f) => {
              const draft = drafts[f.key];
              const dirty = isDirty(f.key);
              const price = prices[f.key];
              return (
                <div key={f.key} className="rounded-2xl border border-border bg-card/40 p-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{f.label}</div>
                      <div className="text-[10px] font-mono text-muted-foreground break-all">
                        {f.key}
                        {price != null ? ` · ${formatRupiah(price)} / 30 hari` : " · harga belum diatur"}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <select
                        value={draft.mode}
                        onChange={(e) => setMode(f.key, e.target.value as FeatureAccessMode)}
                        className="w-40 rounded-xl border border-border bg-background/60 px-3 py-2 text-xs font-medium outline-none focus:border-primary/60"
                      >
                        {MODES.map((m) => (
                          <option key={m.value} value={m.value} className="bg-[oklch(0.19_0.055_275)]">
                            {m.label} — {m.hint}
                          </option>
                        ))}
                      </select>

                      {draft.mode === "trial" && (
                        <input
                          type="datetime-local"
                          value={toLocalInput(draft.trialUntil)}
                          onChange={(e) => setTrial(f.key, e.target.value)}
                          className="rounded-xl border border-border bg-background/60 px-2 py-2 text-xs outline-none focus:border-primary/60"
                        />
                      )}

                      <button
                        onClick={() => save(f.key)}
                        disabled={!dirty || saving === f.key}
                        className="inline-flex items-center justify-center gap-1 rounded-full px-3 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-40"
                        style={{ background: "var(--gradient-neon)" }}
                      >
                        {saving === f.key ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Save className="h-3 w-3" />
                        )}
                        Simpan
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      ))}

    </div>
  );
}

function ContactSection() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [whatsapp, setWhatsapp] = useState("");

  useEffect(() => {
    (async () => {
      const { data, error } = await (supabase as any)
        .from("app_settings")
        .select("support_email, support_phone, support_whatsapp")
        .eq("id", 1)
        .maybeSingle();
      if (!error && data) {
        setEmail(data.support_email ?? "");
        setPhone(data.support_phone ?? "");
        setWhatsapp(data.support_whatsapp ?? "");
      }
      setLoading(false);
    })();
  }, []);

  async function save() {
    setSaving(true);
    const { error } = await (supabase as any).from("app_settings").upsert({
      id: 1,
      support_email: email.trim() || null,
      support_phone: phone.trim() || null,
      support_whatsapp: whatsapp.trim() || null,
      updated_at: new Date().toISOString(),
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Kontak support tersimpan");
  }

  const inputCls =
    "w-full rounded-2xl border border-border bg-card/50 px-3 py-2.5 text-sm outline-none focus:border-primary/60";

  return (
    <Card>
      <div className="p-4 border-b border-border/60 flex items-center gap-3">
        <div
          className="h-9 w-9 rounded-xl grid place-items-center text-primary-foreground shrink-0"
          style={{ background: "var(--gradient-neon)" }}
        >
          <LifeBuoy className="h-4 w-4" />
        </div>
        <div>
          <div className="font-display text-lg">Kontak Support</div>
          <div className="text-xs text-muted-foreground">
            Informasi ini akan tampil di halaman Pusat Bantuan. Kosongkan field yang tidak ingin ditampilkan.
          </div>
        </div>
      </div>
      {loading ? (
        <div className="p-8 grid place-items-center">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        </div>
      ) : (
        <div className="p-4 space-y-4 max-w-xl">
          <label className="block">
            <div className="text-[11px] uppercase tracking-widest text-muted-foreground mb-1.5">Email</div>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="support@domain.com" className={inputCls} />
          </label>
          <label className="block">
            <div className="text-[11px] uppercase tracking-widest text-muted-foreground mb-1.5">Nomor Telepon</div>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+62 ..." className={inputCls} />
          </label>
          <label className="block">
            <div className="text-[11px] uppercase tracking-widest text-muted-foreground mb-1.5">Nomor WhatsApp</div>
            <input value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} placeholder="+62812xxxx (tanpa spasi untuk link wa.me)" className={inputCls} />
          </label>
          <button
            onClick={save}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
            style={{ background: "var(--gradient-neon)" }}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Simpan Kontak
          </button>
        </div>
      )}
    </Card>
  );
}


// =============================================================================
// Provider on/off — provider yang dimatikan hilang dari Token Manager & Routing
// =============================================================================
function ProviderSection() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [state, setState] = useState<Record<string, boolean>>({});

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("provider_settings" as never).select("id, enabled");
      const map: Record<string, boolean> = {};
      PROVIDER_FLAGS.forEach((p) => (map[p.id] = true));
      ((data ?? []) as unknown as { id: string; enabled: boolean }[]).forEach((r) => {
        map[r.id] = r.enabled !== false;
      });
      setState(map);
      setLoading(false);
    })();
  }, []);

  async function toggle(id: string, label: string) {
    const next = !state[id];
    setSaving(id);
    const { error } = await supabase.from("provider_settings" as never).upsert(
      { id, enabled: next, updated_at: new Date().toISOString() } as never,
      { onConflict: "id" },
    );
    setSaving(null);
    if (error) return toast.error(error.message);
    setState((s) => ({ ...s, [id]: next }));
    void refreshPlatformFlags();
    toast.success(`${label} ${next ? "diaktifkan" : "dinonaktifkan sementara"}`);
  }

  const groups = useMemo(() => {
    const by: Record<string, typeof PROVIDER_FLAGS> = {};
    PROVIDER_FLAGS.forEach((p) => (by[p.group] ||= []).push(p));
    return by;
  }, []);

  if (loading)
    return (
      <Card>
        <div className="p-8 grid place-items-center">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        </div>
      </Card>
    );

  return (
    <Card>
      <div className="p-4 border-b border-border/60">
        <div className="font-display text-lg">Opsi Provider</div>
        <div className="text-xs text-muted-foreground">
          Provider yang dinonaktifkan otomatis hilang dari Token / API Manager dan Routing Provider
          milik user. Aktifkan lagi kapan saja untuk memunculkannya kembali.
        </div>
      </div>
      <div className="p-4 flex flex-col gap-4">
        {Object.entries(groups).map(([group, list]) => (
          <div key={group}>
            <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-2">
              {group}
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {list.map((p) => {
                const on = state[p.id] !== false;
                return (
                  <div
                    key={p.id}
                    className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-card/40 px-3 py-2.5"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">{p.label}</div>
                      <div className="text-[10px] font-mono text-muted-foreground">{p.id}</div>
                    </div>
                    <button
                      onClick={() => toggle(p.id, p.label)}
                      disabled={saving === p.id}
                      className={[
                        "shrink-0 inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition",
                        on
                          ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-300"
                          : "border-red-500/50 bg-red-500/10 text-red-300",
                      ].join(" ")}
                    >
                      {saving === p.id ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                      {on ? "Aktif" : "Nonaktif"}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

// =============================================================================
// Global Brain — fallback API Brain milik platform.
// UI: tab per provider brain, box input hanya untuk paste token, tombol Tambah
// menjalankan pengecekan (format → duplikat → validasi live) lalu key valid
// masuk ke list token aktif dan langsung tersimpan ke DB.
// =============================================================================

type BrainProviderId = "gemini" | "openai";

type BrainKeyCheck = {
  key: string;
  state: "checking" | "active" | "limited" | "invalid" | "failed";
  detail?: string;
};

const BRAIN_PROVIDERS: {
  id: BrainProviderId;
  label: string;
  placeholder: string;
  column: "gemini_keys" | "openai_keys";
  validFormat: (k: string) => boolean;
  hint: string;
}[] = [
  {
    id: "gemini",
    label: "Google Gemini",
    placeholder: "AIzaXXXX...\nAQ.XXXX...",
    column: "gemini_keys",
    validFormat: (k) => /^AIza[A-Za-z0-9_-]{20,}$/.test(k) || /^AQ[.A-Za-z0-9_-]{20,}$/.test(k),
    hint: "Format AIza… atau AQ… (auth key Gemini baru).",
  },
  {
    id: "openai",
    label: "OpenAI",
    placeholder: "sk-XXXX...\nsk-YYYY...",
    column: "openai_keys",
    validFormat: (k) => /^sk-[A-Za-z0-9_-]{20,}$/.test(k),
    hint: "Format sk-… (API key OpenAI).",
  },
];

async function checkGlobalBrainKey(provider: BrainProviderId, key: string): Promise<BrainKeyCheck> {
  try {
    if (provider === "gemini") {
      const r = await fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=1", {
        headers: { "x-goog-api-key": key },
      });
      if (r.ok) {
        const data = (await r.json().catch(() => ({}))) as { models?: unknown[] };
        const n = Array.isArray(data.models) ? data.models.length : 0;
        return { key, state: "active", detail: n > 0 ? `OK · ${n}+ model tersedia` : "OK" };
      }
      if (r.status === 429) return { key, state: "limited", detail: "429 · quota / rate-limit" };
      if (r.status === 400 || r.status === 401 || r.status === 403)
        return { key, state: "invalid", detail: `${r.status} · key ditolak` };
      return { key, state: "failed", detail: `${r.status} · gagal` };
    }
    const r = await fetch("https://api.openai.com/v1/models", {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (r.ok) {
      const data = (await r.json().catch(() => ({}))) as { data?: unknown[] };
      const n = Array.isArray(data.data) ? data.data.length : 0;
      return { key, state: "active", detail: n > 0 ? `OK · ${n} model` : "OK" };
    }
    if (r.status === 429) return { key, state: "limited", detail: "429 · quota / credit habis" };
    if (r.status === 401 || r.status === 403) return { key, state: "invalid", detail: `${r.status} · key ditolak` };
    return { key, state: "failed", detail: `${r.status} · gagal` };
  } catch (e) {
    return { key, state: "failed", detail: (e as Error).message };
  }
}

function GlobalBrainSection() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [tab, setTab] = useState<BrainProviderId>("gemini");
  const [input, setInput] = useState("");
  const [keys, setKeys] = useState<Record<BrainProviderId, string[]>>({ gemini: [], openai: [] });
  const [checks, setChecks] = useState<Record<BrainProviderId, BrainKeyCheck[]>>({ gemini: [], openai: [] });
  const [progress, setProgress] = useState<{ show: boolean; pct: number; text: string }>({
    show: false,
    pct: 0,
    text: "",
  });
  const [report, setReport] = useState<null | { title: string; ok: BrainKeyCheck[]; bad: { key: string; reason: string }[] }>(null);

  const provider = BRAIN_PROVIDERS.find((p) => p.id === tab)!;

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("global_brain" as never)
        .select("enabled, gemini_keys, openai_keys")
        .eq("id", 1)
        .maybeSingle();
      const row = data as unknown as
        | { enabled: boolean; gemini_keys: string[] | null; openai_keys: string[] | null }
        | null;
      if (row) {
        setEnabled(!!row.enabled);
        setKeys({ gemini: row.gemini_keys ?? [], openai: row.openai_keys ?? [] });
      }
      setLoading(false);
    })();
  }, []);

  async function persist(next: Record<BrainProviderId, string[]>, nextEnabled = enabled) {
    setSaving(true);
    const { error } = await supabase.from("global_brain" as never).upsert(
      {
        id: 1,
        enabled: nextEnabled,
        gemini_keys: next.gemini,
        openai_keys: next.openai,
        updated_at: new Date().toISOString(),
      } as never,
      { onConflict: "id" },
    );
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return false;
    }
    void refreshPlatformFlags();
    return true;
  }

  async function toggleEnabled() {
    const next = !enabled;
    setEnabled(next);
    if (await persist(keys, next)) {
      toast.success(next ? "Global Brain diaktifkan" : "Global Brain dinonaktifkan");
    } else {
      setEnabled(!next);
    }
  }

  async function tambah() {
    const raw = input
      .split(/[\n,;\s]+/g)
      .map((s) => s.trim())
      .filter(Boolean);
    if (raw.length === 0) return;
    setBusy(true);

    const bad: { key: string; reason: string }[] = [];
    const seen = new Set<string>();
    const candidates: string[] = [];
    for (const k of raw) {
      if (seen.has(k)) {
        bad.push({ key: k, reason: "Duplikat di input" });
        continue;
      }
      seen.add(k);
      if (keys[tab].includes(k)) {
        bad.push({ key: k, reason: "Sudah ada di list aktif" });
        continue;
      }
      if (!provider.validFormat(k)) {
        bad.push({ key: k, reason: "Format salah" });
        continue;
      }
      candidates.push(k);
    }

    const ok: BrainKeyCheck[] = [];
    for (let i = 0; i < candidates.length; i++) {
      setProgress({
        show: true,
        pct: Math.round((i / Math.max(1, candidates.length)) * 100),
        text: `Cek key ${i + 1}/${candidates.length}…`,
      });
      const r = await checkGlobalBrainKey(tab, candidates[i]);
      if (r.state === "active" || r.state === "limited") ok.push(r);
      else bad.push({ key: candidates[i], reason: r.detail || r.state });
    }
    setProgress({ show: false, pct: 0, text: "" });

    const next = { ...keys, [tab]: [...keys[tab], ...ok.map((r) => r.key)] };
    if (ok.length > 0) {
      const saved = await persist(next);
      if (saved) {
        setKeys(next);
        setChecks((c) => ({ ...c, [tab]: [...c[tab].filter((x) => !ok.some((o) => o.key === x.key)), ...ok] }));
      }
    }
    setInput("");
    setBusy(false);
    setReport({ title: `Hasil pengecekan ${provider.label}`, ok, bad });
  }

  async function removeKey(k: string) {
    const next = { ...keys, [tab]: keys[tab].filter((x) => x !== k) };
    if (await persist(next)) {
      setKeys(next);
      setChecks((c) => ({ ...c, [tab]: c[tab].filter((x) => x.key !== k) }));
      toast.success("Token dihapus");
    }
  }

  async function checkAll() {
    const list = keys[tab];
    if (list.length === 0) return;
    setBusy(true);
    const results: BrainKeyCheck[] = [];
    for (let i = 0; i < list.length; i++) {
      setProgress({ show: true, pct: Math.round((i / list.length) * 100), text: `Cek ${i + 1}/${list.length}…` });
      results.push(await checkGlobalBrainKey(tab, list[i]));
      setChecks((c) => ({ ...c, [tab]: [...results] }));
    }
    setProgress({ show: false, pct: 0, text: "" });
    setBusy(false);
    setReport({
      title: `Status token ${provider.label}`,
      ok: results.filter((r) => r.state === "active" || r.state === "limited"),
      bad: results
        .filter((r) => r.state === "invalid" || r.state === "failed")
        .map((r) => ({ key: r.key, reason: r.detail || r.state })),
    });
  }

  const mask = (k: string) => (k.length <= 14 ? k : `${k.slice(0, 8)}…${k.slice(-4)}`);
  const badgeCls = (s: BrainKeyCheck["state"] | "unknown") =>
    s === "active"
      ? "text-emerald-300 bg-emerald-500/10 border-emerald-500/30"
      : s === "limited"
        ? "text-amber-300 bg-amber-500/10 border-amber-500/30"
        : s === "invalid" || s === "failed"
          ? "text-rose-300 bg-rose-500/10 border-rose-500/30"
          : "text-muted-foreground bg-muted/30 border-border";
  const badgeLabel = (s: BrainKeyCheck["state"] | "unknown") =>
    ({ active: "Active", limited: "Rate-limited", invalid: "Invalid", failed: "Failed", checking: "Checking…", unknown: "—" })[s];

  return (
    <Card>
      <div className="p-4 border-b border-border/60 flex items-center gap-3">
        <div
          className="h-9 w-9 rounded-xl grid place-items-center text-primary-foreground shrink-0"
          style={{ background: "var(--gradient-neon)" }}
        >
          <Brain className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <div className="font-display text-lg">Global Brain</div>
          <div className="text-xs text-muted-foreground">
            Key Brain milik platform. Dipakai otomatis untuk user yang belum punya API Brain sendiri,
            atau saat key user kena limit. Key global tidak pernah dikirim ke browser user.
          </div>
        </div>
      </div>

      {loading ? (
        <div className="p-8 grid place-items-center">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        </div>
      ) : (
        <div className="p-4 space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={toggleEnabled}
              disabled={saving}
              className={[
                "inline-flex items-center gap-2 rounded-full border px-4 py-2 text-xs font-semibold transition disabled:opacity-60",
                enabled
                  ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-300"
                  : "border-border text-muted-foreground",
              ].join(" ")}
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              {enabled ? "Global Brain: Aktif" : "Global Brain: Nonaktif"}
            </button>
            <span className="text-[11px] text-muted-foreground">
              Total token aktif: {keys.gemini.length + keys.openai.length}
            </span>
          </div>

          {/* Tab per provider brain */}
          <div className="flex flex-wrap gap-2 border-b border-border/60 pb-3">
            {BRAIN_PROVIDERS.map((p) => {
              const active = tab === p.id;
              return (
                <button
                  key={p.id}
                  onClick={() => {
                    setTab(p.id);
                    setInput("");
                  }}
                  className={[
                    "inline-flex items-center gap-2 rounded-full border px-4 py-2 text-xs font-semibold transition",
                    active
                      ? "border-transparent text-primary-foreground"
                      : "border-border text-muted-foreground hover:text-foreground",
                  ].join(" ")}
                  style={active ? { background: "var(--gradient-neon)" } : undefined}
                >
                  {p.label}
                  <span className="rounded-full bg-black/20 px-1.5 py-0.5 text-[10px]">{keys[p.id].length}</span>
                </button>
              );
            })}
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            {/* Kolom input */}
            <div className="space-y-2">
              <div className="text-[11px] uppercase tracking-widest text-muted-foreground">
                Input token {provider.label} (satu per baris)
              </div>
              <textarea
                rows={5}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={provider.placeholder}
                className="w-full rounded-2xl border border-border bg-card/50 px-3 py-2.5 text-xs font-mono outline-none focus:border-primary/60"
              />
              <div className="text-[10px] text-muted-foreground">{provider.hint}</div>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={tambah}
                  disabled={busy || input.trim().length === 0}
                  className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-60"
                  style={{ background: "var(--gradient-neon)" }}
                >
                  {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                  Tambah & Cek
                </button>
                <button
                  onClick={checkAll}
                  disabled={busy || keys[tab].length === 0}
                  className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 text-xs font-semibold text-muted-foreground hover:text-foreground disabled:opacity-50"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${busy ? "animate-spin" : ""}`} /> Cek Ulang Status
                </button>
              </div>
              {progress.show && (
                <div className="rounded-md border border-border bg-card/40 p-2">
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div className="h-full bg-primary transition-all" style={{ width: `${progress.pct}%` }} />
                  </div>
                  <div className="mt-1 text-[10px] text-muted-foreground">{progress.text}</div>
                </div>
              )}
            </div>

            {/* Kolom list token aktif */}
            <div className="space-y-2">
              <div className="text-[11px] uppercase tracking-widest text-muted-foreground">
                Token aktif {provider.label} ({keys[tab].length})
              </div>
              {keys[tab].length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border/70 p-6 text-center text-xs text-muted-foreground">
                  Belum ada token tersimpan.
                </div>
              ) : (
                <div className="space-y-1.5">
                  {keys[tab].map((k) => {
                    const c = checks[tab].find((x) => x.key === k);
                    const state = c?.state ?? "unknown";
                    return (
                      <div
                        key={k}
                        className="flex items-center justify-between gap-2 rounded-xl border border-border/60 bg-card/40 px-3 py-2"
                      >
                        <code className="text-[11px] font-mono text-foreground/85 truncate">{mask(k)}</code>
                        <div className="flex items-center gap-2 shrink-0">
                          {c?.detail && (
                            <span className="text-[10px] text-muted-foreground truncate max-w-[160px]">{c.detail}</span>
                          )}
                          <span className={`text-[10px] px-2 py-0.5 rounded-full border ${badgeCls(state)}`}>
                            {badgeLabel(state)}
                          </span>
                          <button
                            onClick={() => removeKey(k)}
                            className="rounded-full border border-border bg-card/60 p-1 text-muted-foreground transition hover:border-destructive/50 hover:text-destructive"
                            title="Hapus token"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Popup ringkasan hasil pengecekan */}
      {report && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-background/80 p-4 backdrop-blur-sm"
          onClick={() => setReport(null)}
        >
          <div
            className="w-full max-w-lg rounded-2xl border border-border bg-card p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="font-display text-lg">{report.title}</div>
            <div className="mt-1 text-xs text-muted-foreground">
              {report.ok.length} token valid · {report.bad.length} ditolak
            </div>
            <div className="mt-4 max-h-[50vh] space-y-1.5 overflow-y-auto">
              {report.ok.map((r) => (
                <div
                  key={`ok-${r.key}`}
                  className="flex items-center justify-between gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-3 py-2"
                >
                  <code className="text-[11px] font-mono truncate">{mask(r.key)}</code>
                  <span className="text-[10px] text-emerald-300 shrink-0">{r.detail || "Valid"}</span>
                </div>
              ))}
              {report.bad.map((r, i) => (
                <div
                  key={`bad-${i}-${r.key}`}
                  className="flex items-center justify-between gap-2 rounded-lg border border-rose-500/30 bg-rose-500/5 px-3 py-2"
                >
                  <code className="text-[11px] font-mono truncate">{mask(r.key)}</code>
                  <span className="text-[10px] text-rose-300 shrink-0 truncate max-w-[200px]">{r.reason}</span>
                </div>
              ))}
              {report.ok.length === 0 && report.bad.length === 0 && (
                <div className="text-xs text-muted-foreground">Tidak ada token diproses.</div>
              )}
            </div>
            <button
              onClick={() => setReport(null)}
              className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full px-4 py-2 text-sm font-semibold text-primary-foreground"
              style={{ background: "var(--gradient-neon)" }}
            >
              <Save className="h-4 w-4" /> Tutup
            </button>
          </div>
        </div>
      )}
    </Card>
  );
}
