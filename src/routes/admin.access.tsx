import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, type FeatureAccessMode, normalizeFeatureAccessMode as normalizeMode } from "@/lib/auth-context";
import { MENU_CATALOG } from "@/lib/menu-catalog";
import { DashboardShell, PageHero } from "@/components/dashboard/shell";
import { Card } from "@/components/dashboard/ui";
import { Loader2, ShieldCheck, Save, LifeBuoy, Brain, Plug, LayoutList } from "lucide-react";
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
// Global Brain — fallback API Brain milik platform
// =============================================================================
function GlobalBrainSection() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [gemini, setGemini] = useState("");
  const [openai, setOpenai] = useState("");

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
        setGemini((row.gemini_keys ?? []).join("\n"));
        setOpenai((row.openai_keys ?? []).join("\n"));
      }
      setLoading(false);
    })();
  }, []);

  const split = (v: string) =>
    v.split(/[\n,]/g).map((s) => s.trim()).filter(Boolean);

  async function save() {
    setSaving(true);
    const { error } = await supabase.from("global_brain" as never).upsert(
      {
        id: 1,
        enabled,
        gemini_keys: split(gemini),
        openai_keys: split(openai),
        updated_at: new Date().toISOString(),
      } as never,
      { onConflict: "id" },
    );
    setSaving(false);
    if (error) return toast.error(error.message);
    void refreshPlatformFlags();
    toast.success("Global Brain tersimpan");
  }

  const inputCls =
    "w-full rounded-2xl border border-border bg-card/50 px-3 py-2.5 text-sm font-mono outline-none focus:border-primary/60";

  return (
    <Card>
      <div className="p-4 border-b border-border/60 flex items-center gap-3">
        <div
          className="h-9 w-9 rounded-xl grid place-items-center text-primary-foreground shrink-0"
          style={{ background: "var(--gradient-neon)" }}
        >
          <Brain className="h-4 w-4" />
        </div>
        <div>
          <div className="font-display text-lg">Global Brain</div>
          <div className="text-xs text-muted-foreground">
            Key Brain milik platform. Dipakai otomatis untuk user yang belum punya API Brain di Token
            Manager, atau saat key milik user kena limit. Key user tetap jadi prioritas pertama dan
            key global tidak pernah dikirim ke browser user.
          </div>
        </div>
      </div>
      {loading ? (
        <div className="p-8 grid place-items-center">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        </div>
      ) : (
        <div className="p-4 space-y-4 max-w-2xl">
          <button
            onClick={() => setEnabled((v) => !v)}
            className={[
              "inline-flex items-center gap-2 rounded-full border px-4 py-2 text-xs font-semibold transition",
              enabled
                ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-300"
                : "border-border text-muted-foreground",
            ].join(" ")}
          >
            {enabled ? "Global Brain: Aktif" : "Global Brain: Nonaktif"}
          </button>

          <label className="block">
            <div className="text-[11px] uppercase tracking-widest text-muted-foreground mb-1.5">
              Gemini Keys (satu per baris)
            </div>
            <textarea
              rows={4}
              value={gemini}
              onChange={(e) => setGemini(e.target.value)}
              placeholder={"AIza...\nAIza..."}
              className={inputCls}
            />
          </label>
          <label className="block">
            <div className="text-[11px] uppercase tracking-widest text-muted-foreground mb-1.5">
              OpenAI Keys (satu per baris)
            </div>
            <textarea
              rows={3}
              value={openai}
              onChange={(e) => setOpenai(e.target.value)}
              placeholder={"sk-...\nsk-..."}
              className={inputCls}
            />
          </label>

          <button
            onClick={save}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
            style={{ background: "var(--gradient-neon)" }}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Simpan Global Brain
          </button>
        </div>
      )}
    </Card>
  );
}
