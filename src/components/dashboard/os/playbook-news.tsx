import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { BookOpen, Newspaper, ArrowRight, ExternalLink } from "lucide-react";
import { todaysTips, todaysNews } from "@/lib/dashboard/playbook";
import { Chip } from "./section";
import { setHandoff } from "@/lib/creative/handoff";

export function PlaybookNews({ onGenerate }: { onGenerate: (topic: string) => void }) {
  const [tab, setTab] = useState<"playbook" | "news">("playbook");
  const tips = todaysTips();
  const news = todaysNews();
  const navigate = useNavigate();

  const handleGenerate = (n: { title: string; url?: string }) => {
    // Kalau berita punya URL, langsung setHandoff dgn autoScrape ke Naratif
    // Video Maker. Halaman naratif akan otomatis mengisi field URL dan
    // menjalankan scraping tanpa perlu paste manual.
    if (n.url) {
      setHandoff({
        workflow: "narrative-video",
        title: n.title,
        hook: "",
        description: n.title,
        sourceUrl: n.url,
        autoScrape: true,
      });
      void navigate({ to: "/generate/naratif" });
      return;
    }
    // Tidak ada URL — fallback ke behavior lama: research keyword.
    onGenerate(n.title);
  };

  return (
    <div className="neumorph p-5 h-full">
      <div className="flex items-center gap-2">
        {tab === "playbook" ? (
          <BookOpen className="h-4 w-4 text-primary" />
        ) : (
          <Newspaper className="h-4 w-4 text-primary" />
        )}
        <div className="font-display text-base">Playbook & News</div>
        <Chip>Update harian</Chip>
      </div>

      <div className="mt-3 inline-flex rounded-full border border-border p-0.5 bg-card/40">
        {(["playbook", "news"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={
              "rounded-full px-3 py-1 text-[11px] font-mono uppercase tracking-widest transition " +
              (tab === t ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground")
            }
            style={tab === t ? { background: "var(--gradient-neon)" } : undefined}
          >
            {t === "playbook" ? "Playbook" : "News"}
          </button>
        ))}
      </div>

      {tab === "playbook" ? (
        <ul className="mt-3 space-y-2">
          {tips.map((t, i) => (
            <li key={i} className="rounded-xl border border-border bg-card/30 p-3">
              <div className="flex items-center gap-2">
                <Chip tone="primary">{t.category}</Chip>
                <span className="text-sm text-foreground/95">{t.title}</span>
              </div>
              <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">{t.body}</p>
            </li>
          ))}
        </ul>
      ) : (
        <ul className="mt-3 space-y-2">
          {news.map((n, i) => (
            <li key={i} className="rounded-xl border border-border bg-card/30 p-3 flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <Chip>{n.tag}</Chip>
                  <span className="text-[10px] text-muted-foreground">{n.source}</span>
                </div>
                {n.url ? (
                  <a
                    href={n.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-foreground/95 mt-1 inline-flex items-center gap-1 hover:text-primary hover:underline"
                  >
                    <span className="truncate">{n.title}</span>
                    <ExternalLink className="h-3 w-3 shrink-0 opacity-70" />
                  </a>
                ) : (
                  <div className="text-sm text-foreground/95 mt-1">{n.title}</div>
                )}
              </div>
              <button
                onClick={() => handleGenerate(n)}
                className="shrink-0 inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
                title={n.url ? "Buka di Naratif Video Maker + scrape otomatis" : "Riset topik"}
              >
                Generate <ArrowRight className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
