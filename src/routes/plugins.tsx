import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { DashboardShell, PageHero } from "@/components/dashboard/shell";
import { Card } from "@/components/dashboard/ui";
import {
  PLUGIN_CATALOG,
  pluginEnabled,
  pluginVersion,
  pluginName,
  pluginLogo,
  type PluginConfig,
  type PluginEntry,
} from "@/lib/plugins/catalog";
import { Download, Puzzle, ExternalLink, CheckCircle2, Loader2, Chrome } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/plugins")({
  head: () => ({
    meta: [
      { title: "AA Plug-IN — Companion App & Browser Extension" },
      {
        name: "description",
        content:
          "Pusat companion app, browser extension, dan plugin AA Creative Studio. Unduh extension per provider dan sinkronkan token otomatis ke akun kamu.",
      },
      { property: "og:title", content: "AA Plug-IN — Companion App & Browser Extension" },
      {
        property: "og:description",
        content: "Unduh browser extension AA Creative Studio per provider dan sinkronkan token otomatis.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PluginsPage,
});

function PluginsPage() {
  const [cfg, setCfg] = useState<PluginConfig>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await (supabase as any)
        .from("app_settings")
        .select("plugin_app_url, plugin_config")
        .eq("id", 1)
        .maybeSingle();
      if (data?.plugin_config) setCfg(data.plugin_config as PluginConfig);
      setLoading(false);
    })();
  }, []);

  const items = useMemo(() => PLUGIN_CATALOG.filter((p) => pluginEnabled(p, cfg)), [cfg]);

  return (
    <DashboardShell>
      <PageHero
        eyebrow="Ekosistem"
        title="AA"
        highlight="Plug-IN"
        desc="Companion app, browser extension, dan plugin resmi AA Creative Studio. Semua plug-in terikat ke akun kamu dan mengirim data langsung ke Token Manager."
      />

      {loading ? (
        <Card>
          <div className="p-10 grid place-items-center">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          </div>
        </Card>
      ) : items.length === 0 ? (
        <Card>
          <div className="p-10 text-center text-sm text-muted-foreground">
            Belum ada plug-in aktif. Hubungi admin.
          </div>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {items.map((p) => (
            <PluginCard key={p.id} entry={p} cfg={cfg} />
          ))}
          <ComingSoonCard />
        </div>
      )}
    </DashboardShell>
  );
}

function PluginCard({ entry, cfg }: { entry: PluginEntry; cfg: PluginConfig }) {
  const [busy, setBusy] = useState(false);
  const [logoBroken, setLogoBroken] = useState(false);
  const note = cfg?.[entry.id]?.note?.trim();
  const name = pluginName(entry, cfg);
  const logo = pluginLogo(entry, cfg);

  async function download() {
    setBusy(true);
    try {
      const res = await fetch(entry.file);
      if (!res.ok) throw new Error(`Gagal mengunduh (${res.status})`);
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = entry.file.split("/").pop() || "plugin.zip";
      a.click();
      URL.revokeObjectURL(a.href);
      toast.success("Paket extension terunduh — lanjut ke langkah instalasi.");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="group overflow-hidden">
      <div className="h-1.5 w-full" style={{ background: entry.accent }} />
      <div className="p-4 flex flex-col gap-3 h-full">
        <div className="flex items-start gap-3">
          <div
            className="h-11 w-11 rounded-2xl grid place-items-center text-white shrink-0 transition-transform duration-300 group-hover:scale-105"
            style={{ background: entry.accent }}
          >
            {logo && !logoBroken ? (
              <img
                src={logo}
                alt={name}
                className="h-full w-full rounded-2xl object-cover"
                loading="lazy"
                referrerPolicy="no-referrer"
                onError={() => setLogoBroken(true)}
              />
            ) : (
              <Puzzle className="h-5 w-5" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-display text-base leading-tight truncate">{name}</div>
            <div className="text-[11px] text-muted-foreground truncate">{entry.tagline}</div>
          </div>
          <span className="rounded-full border border-border bg-card/60 px-2 py-0.5 text-[10px] text-muted-foreground shrink-0">
            v{pluginVersion(entry, cfg)}
          </span>
        </div>

        <div className="flex flex-wrap gap-1.5">
          <Badge icon={Chrome}>Chrome / Edge / Brave</Badge>
          <Badge>{entry.provider}</Badge>
        </div>

        <p className="text-xs leading-relaxed text-muted-foreground">{entry.desc}</p>

        <ul className="flex flex-col gap-1.5">
          {entry.features.map((f) => (
            <li key={f} className="flex items-start gap-2 text-xs text-muted-foreground">
              <CheckCircle2 className="h-3.5 w-3.5 mt-[1px] text-primary shrink-0" />
              <span>{f}</span>
            </li>
          ))}
        </ul>

        {note && (
          <div className="rounded-xl border border-primary/30 bg-primary/5 px-3 py-2 text-[11px] text-muted-foreground">
            {note}
          </div>
        )}

        <details className="rounded-xl border border-border bg-card/40 px-3 py-2 text-[11px] text-muted-foreground">
          <summary className="cursor-pointer text-foreground/80">Cara pasang</summary>
          <ol className="mt-2 list-decimal pl-4 space-y-1">
            <li>Unduh lalu ekstrak file ZIP.</li>
            <li>
              Buka <span className="text-foreground">chrome://extensions</span>.
            </li>
            <li>Aktifkan Developer mode.</li>
            <li>Klik Load unpacked lalu pilih folder hasil ekstrak.</li>
            <li>Buka popup extension → tab Akun → login dengan akun AA Creative Studio kamu.</li>
          </ol>
        </details>

        <div className="mt-auto flex gap-2 pt-1">
          <a
            href={entry.site}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center justify-center gap-1.5 rounded-2xl border border-border bg-card/50 px-3 py-2 text-xs hover:border-primary/50 transition"
          >
            <ExternalLink className="h-3.5 w-3.5" /> Situs provider
          </a>
          <button
            onClick={download}
            disabled={busy}
            className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-2xl px-3 py-2 text-xs font-medium text-primary-foreground disabled:opacity-60 transition hover:brightness-110"
            style={{ background: "var(--gradient-neon)" }}
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
            Unduh Extension
          </button>
        </div>
      </div>
    </Card>
  );
}

function Badge({ children, icon: Icon }: { children: React.ReactNode; icon?: React.ElementType }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-border bg-card/60 px-2 py-0.5 text-[10px] text-muted-foreground">
      {Icon ? <Icon className="h-3 w-3" /> : null}
      {children}
    </span>
  );
}

function ComingSoonCard() {
  return (
    <Card className="border-dashed">
      <div className="p-6 h-full flex flex-col items-center justify-center text-center gap-2">
        <div className="h-11 w-11 rounded-2xl grid place-items-center border border-dashed border-border text-muted-foreground">
          <Puzzle className="h-5 w-5" />
        </div>
        <div className="font-display text-base">Plug-in berikutnya</div>
        <p className="text-xs text-muted-foreground max-w-[220px]">
          Companion desktop app dan extension provider lain sedang disiapkan. Menu ini akan otomatis terisi.
        </p>
      </div>
    </Card>
  );
}
