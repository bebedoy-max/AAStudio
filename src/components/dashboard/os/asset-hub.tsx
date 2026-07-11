import { useState } from "react";
import { Boxes, Image as ImageIcon, Video, Mic, FileText, Braces } from "lucide-react";
import { Chip } from "./section";

const TABS = [
  { id: "image", label: "Image", icon: ImageIcon, count: 145 },
  { id: "video", label: "Video", icon: Video, count: 32 },
  { id: "voice", label: "Voice", icon: Mic, count: 18 },
  { id: "prompt", label: "Prompt", icon: FileText, count: 87 },
  { id: "json", label: "JSON", icon: Braces, count: 24 },
] as const;

export function AssetHub() {
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("image");
  const active = TABS.find((t) => t.id === tab)!;

  return (
    <div className="neumorph p-5">
      <div className="flex items-center gap-2 flex-wrap">
        <Boxes className="h-4 w-4 text-primary" />
        <div className="font-display text-base">Asset Hub</div>
        <Chip>Semua hasil kamu tersimpan</Chip>
      </div>
      <div className="text-[11px] text-muted-foreground mt-0.5">
        Buka kembali image · video · voice · prompt · workflow JSON
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

      <div className="mt-4 grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2">
        {Array.from({ length: 16 }).map((_, i) => (
          <div
            key={i}
            className="aspect-square rounded-xl border border-border bg-gradient-to-br from-card/60 to-card/20 relative overflow-hidden group hover-scale"
          >
            <div
              className="absolute inset-0 opacity-20"
              style={{
                background: `radial-gradient(circle at ${20 + (i * 37) % 60}% ${30 + (i * 53) % 50}%, var(--primary), transparent 60%)`,
              }}
            />
            <div className="absolute bottom-1 left-1 right-1 text-[9px] font-mono text-muted-foreground truncate opacity-0 group-hover:opacity-100 transition">
              {active.label.toLowerCase()}_{String(i + 1).padStart(3, "0")}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-3 text-[10px] font-mono uppercase tracking-widest text-muted-foreground text-center">
        Placeholder preview · integrasi storage bucket akan otomatis mengisi grid
      </div>
    </div>
  );
}
