import { useState } from "react";
import { TrendingUp } from "lucide-react";
import { TRENDING, type TrendCategory } from "@/lib/dashboard/playbook";
import { Chip } from "./section";

const TABS: TrendCategory[] = ["TikTok", "YouTube", "Affiliate", "AI", "News"];

export function Trending({ onPick }: { onPick: (keyword: string) => void }) {
  const [tab, setTab] = useState<TrendCategory>("TikTok");
  const items = TRENDING[tab];
  return (
    <div className="neumorph p-5">
      <div className="flex items-center gap-2">
        <TrendingUp className="h-4 w-4 text-primary" />
        <div className="font-display text-base">Trending</div>
        <Chip>Klik → Riset</Chip>
      </div>
      <div className="mt-3 flex flex-wrap gap-1">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={
              "rounded-full px-3 py-1 text-[11px] font-mono uppercase tracking-widest transition " +
              (tab === t
                ? "text-primary-foreground"
                : "text-muted-foreground hover:text-foreground border border-border bg-card/40")
            }
            style={tab === t ? { background: "var(--gradient-neon)" } : undefined}
          >
            {t}
          </button>
        ))}
      </div>
      <ul className="mt-3 grid gap-1.5 sm:grid-cols-2">
        {items.map((k, i) => (
          <li key={k}>
            <button
              onClick={() => onPick(k)}
              className="group w-full text-left rounded-lg border border-border bg-card/30 hover:border-primary/50 hover:bg-primary/[0.04] px-3 py-2 transition flex items-center gap-2"
            >
              <span className="text-[10px] font-mono text-muted-foreground w-6">#{i + 1}</span>
              <span className="text-sm text-foreground/90 group-hover:text-primary truncate">{k}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
