import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Boxes, Image as ImageIcon, Video, Film, Layers, Sparkles, ArrowRight } from "lucide-react";
import { useProjects } from "@/lib/dashboard/projects";
import { Chip } from "./section";

// Real Asset Hub — counts derived from actual generation history stored via
// `trackGeneration()`. No gimmick counters. Empty grid shows a call to action.

type TabId = "image" | "video" | "storyboard" | "motion" | "all";

export function AssetHub() {
  const projects = useProjects();
  const [tab, setTab] = useState<TabId>("all");

  const counts = useMemo(() => {
    let images = 0, videos = 0, storyboards = 0, motion = 0;
    for (const p of projects) {
      images += p.counts.images || 0;
      videos += p.counts.videos || 0;
      storyboards += p.counts.storyboards || 0;
      if (p.kind === "motion") motion += (p.counts.videos || 0) + (p.counts.images || 0);
    }
    return { images, videos, storyboards, motion, all: images + videos + storyboards };
  }, [projects]);

  const TABS: { id: TabId; label: string; icon: typeof ImageIcon; count: number }[] = [
    { id: "all", label: "Semua", icon: Layers, count: counts.all },
    { id: "image", label: "Image", icon: ImageIcon, count: counts.images },
    { id: "video", label: "Video", icon: Video, count: counts.videos },
    { id: "storyboard", label: "Storyboard", icon: Film, count: counts.storyboards },
    { id: "motion", label: "Motion", icon: Sparkles, count: counts.motion },
  ];

  // Filter projects for the selected tab
  const filtered = useMemo(() => {
    if (tab === "all") return projects;
    if (tab === "image") return projects.filter((p) => (p.counts.images || 0) > 0);
    if (tab === "video") return projects.filter((p) => (p.counts.videos || 0) > 0);
    if (tab === "storyboard") return projects.filter((p) => p.kind === "storyboard" || (p.counts.storyboards || 0) > 0);
    if (tab === "motion") return projects.filter((p) => p.kind === "motion");
    return projects;
  }, [projects, tab]);

  const hasAny = counts.all > 0 || projects.length > 0;

  return (
    <div className="neumorph p-5">
      <div className="flex items-center gap-2 flex-wrap">
        <Boxes className="h-4 w-4 text-primary" />
        <div className="font-display text-base">Asset Hub</div>
        <Chip>{hasAny ? `${projects.length} project` : "Belum ada asset"}</Chip>
      </div>
      <div className="text-[11px] text-muted-foreground mt-0.5">
        Ringkasan hasil generate kamu — image · video · storyboard · motion
      </div>

      <div className="mt-3 flex flex-wrap gap-1">
        {TABS.map((t) => {
          const Icon = t.icon;
          const on = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={
                "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-mono uppercase tracking-widest transition " +
                (on ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground border border-border bg-card/40")
              }
              style={on ? { background: "var(--gradient-neon)" } : undefined}
            >
              <Icon className="h-3 w-3" /> {t.label}
              <span className={"ml-1 " + (on ? "opacity-90" : "opacity-70")}>{t.count}</span>
            </button>
          );
        })}
      </div>

      {!hasAny ? (
        <div className="mt-4 rounded-xl border border-dashed border-border/60 bg-card/20 p-8 text-center">
          <div className="text-sm text-foreground/80">Belum ada asset tersimpan.</div>
          <div className="text-[11px] text-muted-foreground mt-1">
            Jalankan satu generate (Naratif, Storyboard, Motion, Bulk Fashion, atau Image-to-Video) untuk mengisi hub.
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="mt-4 rounded-xl border border-dashed border-border/60 bg-card/20 p-6 text-center text-xs text-muted-foreground">
          Tidak ada asset untuk kategori ini.
        </div>
      ) : (
        <ul className="mt-4 grid gap-2 sm:grid-cols-2 md:grid-cols-3">
          {filtered.slice(0, 12).map((p) => {
            const summary: string[] = [];
            if (p.counts.images) summary.push(`${p.counts.images} img`);
            if (p.counts.videos) summary.push(`${p.counts.videos} vid`);
            if (p.counts.storyboards) summary.push(`${p.counts.storyboards} sb`);
            return (
              <li key={p.id} className="rounded-xl border border-border bg-card/30 p-3 hover:border-primary/40 transition">
                <div className="flex items-center gap-2">
                  <Chip tone="primary">{p.kind}</Chip>
                  <span className="text-[10px] text-muted-foreground ml-auto">
                    {new Date(p.updatedAt).toLocaleDateString("id-ID", { day: "numeric", month: "short" })}
                  </span>
                </div>
                <div className="mt-1 text-sm text-foreground/95 line-clamp-2">{p.title}</div>
                <div className="mt-2 flex items-center gap-2 flex-wrap">
                  {summary.map((s, i) => <Chip key={i}>{s}</Chip>)}
                  {p.route && (
                    <Link
                      to={p.route}
                      className="ml-auto inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
                    >
                      Buka <ArrowRight className="h-3 w-3" />
                    </Link>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
