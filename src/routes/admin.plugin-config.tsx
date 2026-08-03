import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { DashboardShell, PageHero } from "@/components/dashboard/shell";
import { Card } from "@/components/dashboard/ui";
import {
  PLUGIN_CATALOG,
  DEFAULT_STUDIO_URL,
  normalizePluginLogoUrl,
  pluginAccess,
  type PluginAccessMode,
  type PluginConfig,
} from "@/lib/plugins/catalog";
import { Loader2, ShieldCheck, Save, Puzzle, Link2 } from "lucide-react";
import { toast } from "sonner";
import { useDirty } from "@/lib/hooks/use-dirty";

export const Route = createFileRoute("/admin/plugin-config")({
  head: () => ({
    meta: [
      { title: "Plug-IN Config — Admin" },
      {
        name: "description",
        content:
          "Atur URL AA Creative Studio yang dipakai plug-in, status aktif, versi, dan catatan tiap extension.",
      },
    ],
  }),
  component: AdminPluginConfigPage,
});

const inputCls =
  "w-full rounded-2xl border border-border bg-card/50 px-3 py-2.5 text-sm outline-none focus:border-primary/60";

function AdminPluginConfigPage() {
  return (
    <DashboardShell>
      <PageHero
        eyebrow="Admin"
        title="Plug-IN"
        highlight="Config"
        desc="Konfigurasi companion app, browser extension, dan plugin. URL studio di sini dikunci untuk semua user — user tidak bisa mengubahnya dari extension."
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
  return <PluginConfigForm />;
}

function PluginConfigForm() {
  return <PluginConfigFormInner />;
}

function LogoPreview({ raw }: { raw: string }) {
  const url = normalizePluginLogoUrl(raw);
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [url]);
  if (!url) return null;
  return (
    <div className="mt-2 flex items-center gap-2">
      <div className="h-9 w-9 rounded-xl overflow-hidden border border-border bg-card/50 grid place-items-center">
        {broken ? (
          <Puzzle className="h-4 w-4 text-muted-foreground" />
        ) : (
          <img
            src={url}
            alt="Preview logo"
            className="h-full w-full object-cover"
            referrerPolicy="no-referrer"
            onError={() => setBroken(true)}
          />
        )}
      </div>
      <p className="text-[11px] text-muted-foreground">
        {broken
          ? 'Gambar tidak bisa dimuat. Pastikan file Google Drive di-share ke "Anyone with the link", atau pakai URL gambar langsung (.png/.jpg).'
          : "Preview logo OK."}
      </p>
    </div>
  );
}

function PluginConfigFormInner() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [studioUrl, setStudioUrl] = useState(DEFAULT_STUDIO_URL);
  const [cfg, setCfg] = useState<PluginConfig>({});
  const { dirty, markSaved } = useDirty({ studioUrl, cfg }, !loading);

  useEffect(() => {
    (async () => {
      const { data } = await (supabase as any)
        .from("app_settings")
        .select("plugin_app_url, plugin_config")
        .eq("id", 1)
        .maybeSingle();
      if (data?.plugin_app_url) setStudioUrl(data.plugin_app_url as string);
      if (data?.plugin_config) setCfg(data.plugin_config as PluginConfig);
      setLoading(false);
    })();
  }, []);

  function patch(id: string, next: Partial<PluginConfig[string]>) {
    setCfg((prev) => ({ ...prev, [id]: { ...prev[id], ...next } }));
  }

  async function save() {
    setSaving(true);
    const { error } = await (supabase as any).from("app_settings").upsert({
      id: 1,
      plugin_app_url: studioUrl.trim() || DEFAULT_STUDIO_URL,
      plugin_config: cfg,
      updated_at: new Date().toISOString(),
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    markSaved();
    toast.success("Konfigurasi Plug-IN tersimpan");
  }

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
      <Card>
        <div className="p-4 border-b border-border/60 flex items-center gap-3">
          <div
            className="h-9 w-9 rounded-xl grid place-items-center text-primary-foreground shrink-0"
            style={{ background: "var(--gradient-neon)" }}
          >
            <Link2 className="h-4 w-4" />
          </div>
          <div>
            <div className="font-display text-lg">URL AA Creative Studio</div>
            <div className="text-xs text-muted-foreground">
              Dipakai semua plug-in untuk login &amp; push token. User tidak bisa mengubah nilai
              ini.
            </div>
          </div>
        </div>
        <div className="p-4">
          <input
            className={inputCls}
            value={studioUrl}
            onChange={(e) => setStudioUrl(e.target.value)}
            placeholder={DEFAULT_STUDIO_URL}
          />
          <p className="mt-2 text-[11px] text-muted-foreground">
            Extension yang sudah ter-install ikut ter-update otomatis (auto-sync tiap ±30 menit atau
            saat browser dibuka). Untuk paket unduhan baru, build ulang:{" "}
            <span className="text-foreground">
              bun scripts/build-plugin-extensions.mjs {studioUrl || DEFAULT_STUDIO_URL}
            </span>
          </p>
        </div>
      </Card>

      {PLUGIN_CATALOG.map((p) => {
        const c = cfg[p.id] ?? {};
        const access = pluginAccess(p, cfg);
        return (
          <Card key={p.id}>
            <div className="p-4 flex flex-wrap items-center gap-3 border-b border-border/60">
              <div
                className="h-9 w-9 rounded-xl grid place-items-center text-white shrink-0"
                style={{ background: p.accent }}
              >
                <Puzzle className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-display text-base">{p.name}</div>
                <div className="text-[11px] text-muted-foreground truncate">{p.provider}</div>
              </div>
              <label className="inline-flex items-center gap-2 text-xs">
                <span className="text-muted-foreground">Status</span>
                <select
                  className="rounded-2xl border border-border bg-card/50 px-3 py-2 text-xs outline-none focus:border-primary/60"
                  value={access}
                  onChange={(e) =>
                    patch(p.id, { access: e.target.value as PluginAccessMode, enabled: true })
                  }
                >
                  <option value="open">Open — gratis untuk semua user</option>
                  <option value="premium">Premium — berbayar</option>
                  <option value="hide">Hide — disembunyikan</option>
                </select>
              </label>
            </div>
            <div className="p-4 grid gap-3 md:grid-cols-2">
              <div>
                <label className="text-[11px] text-muted-foreground">Nama extension</label>
                <input
                  className={inputCls}
                  value={c.name ?? ""}
                  onChange={(e) => patch(p.id, { name: e.target.value })}
                  placeholder={p.name}
                />
              </div>
              <div>
                <label className="text-[11px] text-muted-foreground">
                  URL logo extension (https / png)
                </label>
                <input
                  className={inputCls}
                  value={c.logoUrl ?? ""}
                  onChange={(e) => patch(p.id, { logoUrl: e.target.value })}
                  placeholder="https://.../logo.png"
                />
                <LogoPreview raw={c.logoUrl ?? ""} />
              </div>
              <div>
                <label className="text-[11px] text-muted-foreground">Versi tampil</label>
                <input
                  className={inputCls}
                  value={c.version ?? ""}
                  onChange={(e) => patch(p.id, { version: e.target.value })}
                  placeholder={p.version}
                />
              </div>
              {access === "premium" && (
                <div>
                  <label className="text-[11px] text-muted-foreground">
                    Harga premium (IDR) — atur juga di Pembayaran &amp; Harga → Plug-IN
                  </label>
                  <input
                    className={inputCls}
                    type="number"
                    min={0}
                    step={1000}
                    value={c.priceIdr ?? 0}
                    onChange={(e) => patch(p.id, { priceIdr: Number(e.target.value) })}
                  />
                </div>
              )}
              <div>
                <label className="text-[11px] text-muted-foreground">Catatan untuk user</label>
                <input
                  className={inputCls}
                  value={c.note ?? ""}
                  onChange={(e) => patch(p.id, { note: e.target.value })}
                  placeholder="Mis. wajib login Leonardo dulu"
                />
              </div>
            </div>
          </Card>
        );
      })}

      <div className="flex justify-end">
        <button
          onClick={save}
          disabled={saving || !dirty}
          className="inline-flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-60"
          style={{ background: "var(--gradient-neon)" }}
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Simpan Konfigurasi
        </button>
      </div>
    </div>
  );
}
