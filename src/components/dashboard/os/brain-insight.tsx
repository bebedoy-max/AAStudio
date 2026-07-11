import { useEffect, useState } from "react";
import { Brain, Flame, Lightbulb, Newspaper, Target, RefreshCw, Loader2 } from "lucide-react";
import { getCreativeKeys, headersFor } from "@/lib/creative/keys";
import { Chip, Skeleton } from "./section";

type Insight = {
  greeting: string;
  viral_keywords: string[];
  news: string[];
  opportunities: string[];
  niche_ideas: string[];
};

const KEY = "aatools.dashboard.brainInsight";
const TTL_MS = 6 * 60 * 60 * 1000;

function loadCached(): { data: Insight; at: number } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.data || !parsed?.at) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function BrainInsight({ onKeyword }: { onKeyword: (kw: string) => void }) {
  const [insight, setInsight] = useState<Insight | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const cached = loadCached();
    if (cached && Date.now() - cached.at < TTL_MS) {
      setInsight(cached.data);
    } else {
      fetchInsight();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function fetchInsight() {
    const keys = getCreativeKeys();
    if (!keys.openai && !keys.gemini) return;
    setLoading(true);
    try {
      const system =
        "You are an AI daily briefing for a content creator. Reply pure JSON only, no fences.";
      const user = `Produce today's creator briefing in Indonesian. Return JSON:
{
  "greeting": "1 short line (e.g. 'Hari ini saya menemukan...')",
  "viral_keywords": string[5],
  "news": string[2],
  "opportunities": string[7] (affiliate niches worth trying today),
  "niche_ideas": string[3] (video ideas that fit AI/faceless/story/affiliate creators)
}`;
      const res = await fetch("/api/router/chat", {
        method: "POST",
        headers: headersFor(keys),
        body: JSON.stringify({ system, user, json: true, temperature: 0.9 }),
      });
      const data = await res.json();
      if (!res.ok) return;
      const parsed = JSON.parse(data.text) as Insight;
      setInsight(parsed);
      try {
        localStorage.setItem(KEY, JSON.stringify({ data: parsed, at: Date.now() }));
      } catch {
        // ignore
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="neumorph p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div
            className="h-9 w-9 grid place-items-center rounded-xl text-primary-foreground"
            style={{ background: "var(--gradient-neon)" }}
          >
            <Brain className="h-4 w-4" />
          </div>
          <div>
            <div className="font-display text-base">AI Brain — Briefing Harian</div>
            <div className="text-[11px] text-muted-foreground">Insight otomatis berdasarkan tren & niche kamu</div>
          </div>
        </div>
        <button
          onClick={fetchInsight}
          disabled={loading}
          className="inline-flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-widest text-muted-foreground hover:text-foreground disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
          Refresh
        </button>
      </div>

      {!insight && !loading && (
        <div className="mt-4 text-xs text-muted-foreground">
          Belum ada briefing. Klik <span className="text-foreground">Refresh</span> untuk mengaktifkan AI Brain.
        </div>
      )}

      {loading && !insight && (
        <div className="mt-4 grid gap-3 md:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      )}

      {insight && (
        <div className="mt-4">
          <div className="text-sm text-foreground/90 italic">"{insight.greeting}"</div>
          <div className="mt-4 grid gap-3 md:grid-cols-4">
            <Block
              icon={<Flame className="h-3.5 w-3.5" />}
              label="Keyword Viral"
              items={insight.viral_keywords}
              onClick={onKeyword}
            />
            <Block
              icon={<Newspaper className="h-3.5 w-3.5" />}
              label="Berita Penting"
              items={insight.news}
            />
            <Block
              icon={<Target className="h-3.5 w-3.5" />}
              label="Peluang Affiliate"
              items={insight.opportunities}
              onClick={onKeyword}
            />
            <Block
              icon={<Lightbulb className="h-3.5 w-3.5" />}
              label="Ide untuk Niche Kamu"
              items={insight.niche_ideas}
              onClick={onKeyword}
              highlight
            />
          </div>
        </div>
      )}
    </div>
  );
}

function Block({
  icon,
  label,
  items,
  onClick,
  highlight,
}: {
  icon: React.ReactNode;
  label: string;
  items: string[];
  onClick?: (v: string) => void;
  highlight?: boolean;
}) {
  return (
    <div
      className={
        "rounded-xl border p-3 " +
        (highlight ? "border-primary/40 bg-primary/5" : "border-border bg-card/40")
      }
    >
      <div className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
        {icon} {label}
        <Chip className="ml-auto" tone={highlight ? "primary" : "default"}>
          {items.length}
        </Chip>
      </div>
      <ul className="mt-2 space-y-1.5">
        {items.slice(0, 5).map((it, i) => (
          <li key={i}>
            <button
              onClick={onClick ? () => onClick(it) : undefined}
              disabled={!onClick}
              className={
                "text-xs text-left w-full line-clamp-2 " +
                (onClick ? "hover:text-primary text-foreground/85 cursor-pointer" : "text-foreground/75")
              }
            >
              • {it}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
