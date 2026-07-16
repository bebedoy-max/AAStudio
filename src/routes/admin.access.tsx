import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, ALL_ROUTE_KEYS, type FeatureAccessMode } from "@/lib/auth-context";
import { DashboardShell, PageHero } from "@/components/dashboard/shell";
import { Card } from "@/components/dashboard/ui";
import { Loader2, ShieldCheck, Save, Globe, Lock, Clock, LifeBuoy } from "lucide-react";
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
        desc="Tentukan menu mana yang terbuka untuk umum, wajib berlangganan, atau trial sampai tanggal tertentu. User baru tetap melihat semua menu — hanya status enabled/disabled yang berbeda."
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
  return <AccessBody />;
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
    ((access ?? []) as { route_key: string; access_mode: FeatureAccessMode; trial_until: string | null }[]).forEach(
      (r) => {
        settings[r.route_key] = { mode: r.access_mode, trialUntil: r.trial_until };
      },
    );
    // default any unconfigured feature to "subscription"
    const full: Record<string, Draft> = {};
    ALL_ROUTE_KEYS.forEach((f) => {
      full[f.key] = settings[f.key] ?? { mode: "subscription", trialUntil: null };
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
    const byGroup: Record<string, typeof ALL_ROUTE_KEYS> = {};
    ALL_ROUTE_KEYS.forEach((f) => {
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
    const label = ALL_ROUTE_KEYS.find((f) => f.key === key)?.label ?? key;
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

  const MODES: { value: FeatureAccessMode; label: string; icon: typeof Globe; hint: string }[] = [
    { value: "public", label: "Umum", icon: Globe, hint: "Terbuka gratis untuk semua user" },
    { value: "subscription", label: "Langganan", icon: Lock, hint: "Wajib berlangganan / beli" },
    { value: "trial", label: "Trial", icon: Clock, hint: "Terbuka sampai tanggal tertentu" },
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
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{f.label}</div>
                      <div className="text-[10px] font-mono text-muted-foreground">
                        {f.key}
                        {price != null ? ` · ${formatRupiah(price)} / 30 hari` : " · harga belum diatur"}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <div className="inline-flex rounded-full border border-border bg-background/60 p-0.5">
                        {MODES.map((m) => {
                          const MIcon = m.icon;
                          const active = draft.mode === m.value;
                          return (
                            <button
                              key={m.value}
                              onClick={() => setMode(f.key, m.value)}
                              title={m.hint}
                              className={[
                                "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all",
                                active
                                  ? "text-primary-foreground"
                                  : "text-muted-foreground hover:text-foreground",
                              ].join(" ")}
                              style={active ? { background: "var(--gradient-neon)" } : undefined}
                            >
                              <MIcon className="h-3.5 w-3.5" />
                              {m.label}
                            </button>
                          );
                        })}
                      </div>

                      {draft.mode === "trial" && (
                        <input
                          type="datetime-local"
                          value={toLocalInput(draft.trialUntil)}
                          onChange={(e) => setTrial(f.key, e.target.value)}
                          className="rounded-lg border border-border bg-background/60 px-2 py-1.5 text-xs outline-none focus:border-primary/60"
                        />
                      )}

                      <button
                        onClick={() => save(f.key)}
                        disabled={!dirty || saving === f.key}
                        className="inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-40"
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

      <ContactSection />
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
