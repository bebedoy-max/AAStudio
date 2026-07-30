import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Info } from "lucide-react";
import { DashboardShell, PageHero } from "@/components/dashboard/shell";
import { Card } from "@/components/dashboard/ui";
import { useProviderFlags } from "@/lib/platform/provider-flags";
import {
  CAPS,
  enabledProviders,
  DEFAULT_ROUTING,
  LS_ROUTING,
  type CapKey,
  type RoutingState,
} from "@/lib/routing/catalog";

export const Route = createFileRoute("/manage/routing")({
  head: () => ({ meta: [{ title: "Routing Provider — AA Creative Studio" }, { name: "description", content: "Pilih provider per kapabilitas: Image, Video, Voice Over, Motion Control." }] }),
  component: RoutingPage,
});


function RoutingPage() {
  const { flags } = useProviderFlags();
  const [routing, setRouting] = useState<RoutingState>(DEFAULT_ROUTING);
  const [savedAt, setSavedAt] = useState<string>("");

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = localStorage.getItem(LS_ROUTING);
      if (raw) setRouting({ ...DEFAULT_ROUTING, ...JSON.parse(raw) });
    } catch {
      /* ignore */
    }
  }, []);

  const setCap = (cap: CapKey, id: string) => {
    const next = { ...routing, [cap]: id };
    setRouting(next);
    if (typeof window !== "undefined") {
      localStorage.setItem(LS_ROUTING, JSON.stringify(next));
      // Notify halaman lain (mis. /generate/motion) supaya provider aktif
      // segera menyesuaikan tanpa perlu reload.
      window.dispatchEvent(
        new CustomEvent("aatools:routing-changed", { detail: { cap, id, routing: next } }),
      );
    }
    setSavedAt(new Date().toLocaleTimeString());
  };

  return (
    <DashboardShell>
      <PageHero
        eyebrow="Manage"
        title="Routing"
        highlight="Provider"
        desc="Pilih provider per kapabilitas — Image, Video, Voice Over, Motion Control. Tersimpan lokal di browser."
      />

      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
        <Info className="h-3.5 w-3.5" />
        <span>
          Info model & biaya di bawah adalah harga acuan resmi provider per Juli 2026. Harga aktual mengikuti dashboard masing-masing.
        </span>
        {savedAt && <span className="ml-auto text-emerald-400">Tersimpan {savedAt}</span>}
      </div>

      {/* Mobile: compact dropdown per capability */}
      <div className="md:hidden flex flex-col gap-3">
        {CAPS.map((cap) => {
          const Icon = cap.icon;
          const capProviders = enabledProviders(cap, flags);
          const activeProv = capProviders.find((p) => p.id === routing[cap.key]);
          return (
            <div key={cap.key} className="neumorph p-3">
              <div className="flex items-center gap-2 mb-2">
                <Icon className="h-4 w-4 text-primary" />
                <div className="text-sm font-display text-foreground">{cap.label}</div>
              </div>
              <select
                value={routing[cap.key]}
                onChange={(e) => setCap(cap.key, e.target.value)}
                className="w-full rounded-xl border border-border bg-card/50 px-3 py-2.5 text-sm font-medium outline-none focus:border-primary/60"
              >
                {capProviders.map((p) => (
                  <option
                    key={p.id}
                    value={p.id}
                    disabled={p.note === "coming-soon"}
                    className="bg-[oklch(0.19_0.055_275)]"
                  >
                    {p.name}
                    {p.note === "coming-soon" ? " (coming soon)" : ""}
                  </option>
                ))}
              </select>
              {activeProv && (
                <div className="mt-1.5 text-[10px] font-mono text-muted-foreground">
                  Aktif: <span className="text-primary">{activeProv.name}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Desktop: horizontal row per capability — logo | title+select+desc | models */}
      <div className="hidden md:flex flex-col gap-4">
        {CAPS.map((cap) => {
          const Icon = cap.icon;
          const capProviders = enabledProviders(cap, flags);
          const activeProv = capProviders.find((p) => p.id === routing[cap.key]);
          return (
            <Card key={cap.key}>
              <div className="grid grid-cols-[140px_minmax(0,1fr)_minmax(0,1.4fr)] gap-5 items-stretch">
                {/* Left: icon block */}
                <div
                  className="rounded-2xl grid place-items-center border border-primary/30"
                  style={{ background: "var(--gradient-neon)", minHeight: 140 }}
                >
                  <Icon className="h-12 w-12 text-primary-foreground" />
                </div>

                {/* Middle: title + select + description */}
                <div className="flex flex-col gap-2 min-w-0">
                  <div className="font-display text-lg text-foreground uppercase tracking-wide">
                    {cap.label}
                  </div>
                  <div className="relative">
                    <select
                      value={routing[cap.key]}
                      onChange={(e) => setCap(cap.key, e.target.value)}
                      className="w-full appearance-none rounded-xl border border-primary/40 bg-card/60 px-3 py-2.5 pr-9 text-sm font-medium text-foreground outline-none focus:border-primary hover:border-primary/70 transition cursor-pointer"
                    >
                      {capProviders.map((p) => (
                        <option
                          key={p.id}
                          value={p.id}
                          disabled={p.note === "coming-soon"}
                          className="bg-[oklch(0.19_0.055_275)]"
                        >
                          {p.name}
                          {p.note === "coming-soon" ? " (coming soon)" : ""}
                        </option>
                      ))}
                    </select>
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-primary text-xs">▼</span>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {activeProv?.desc ?? cap.desc}
                  </p>
                </div>

                {/* Right: models & cost as bullet list */}
                <div className="flex flex-col gap-1.5 min-w-0">
                  <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-0.5">
                    Model & Cost
                  </div>
                  {(activeProv?.models ?? []).map((m) => (
                    <div key={m.name} className="flex items-start gap-2 text-xs">
                      <span className="mt-1 h-2 w-2 rounded-full border border-primary/60 shrink-0" />
                      <span className="text-foreground/85 truncate flex-1">{m.name}</span>
                      <span className="font-mono text-emerald-300 text-[10px] whitespace-nowrap">{m.cost}</span>
                    </div>
                  ))}
                  {activeProv?.note === "coming-soon" && (
                    <span className="mt-1 self-start text-[9px] font-mono uppercase tracking-widest px-2 py-0.5 rounded-full border border-amber-500/40 text-amber-300 bg-amber-500/10">
                      Coming Soon
                    </span>
                  )}
                </div>
              </div>
            </Card>
          );
        })}
      </div>

    </DashboardShell>
  );
}
