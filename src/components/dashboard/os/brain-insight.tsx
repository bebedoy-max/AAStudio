import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "@tanstack/react-router";
import { Brain, Flame, Lightbulb, Newspaper, Target, RefreshCw, Loader2, ExternalLink, X, Loader } from "lucide-react";
import { getCreativeKeys, headersFor } from "@/lib/creative/keys";
import { setHandoff } from "@/lib/creative/handoff";
import { Chip, Skeleton } from "./section";
import { ensureArticle, getArticle, prefetchArticle } from "@/lib/dashboard/news-prefetch";

type NewsItem = { title: string; url?: string };
type Insight = {
  greeting: string;
  viral_keywords: string[];
  news: (string | NewsItem)[];
  opportunities: string[];
  niche_ideas: string[];
};

const KEY = "aatools.dashboard.brainInsight";
const TTL_MS = 6 * 60 * 60 * 1000;
const SCHEDULED_HOURS = [6, 12, 18];

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

/** Returns timestamp (ms) of the most recent scheduled slot (6/12/18) that has already passed today. */
function lastScheduledSlot(now = new Date()): number {
  const h = now.getHours();
  const passed = SCHEDULED_HOURS.filter((x) => x <= h);
  const slotHour = passed.length ? passed[passed.length - 1] : SCHEDULED_HOURS[SCHEDULED_HOURS.length - 1];
  const d = new Date(now);
  if (!passed.length) d.setDate(d.getDate() - 1); // yesterday's 18:00
  d.setHours(slotHour, 0, 0, 0);
  return d.getTime();
}

type ReaderState =
  | { open: false }
  | { open: true; title: string; url?: string; loading: boolean; body?: string; hero?: string; error?: string; refined?: string };

export function BrainInsight({ onKeyword }: { onKeyword: (kw: string) => void }) {
  const [insight, setInsight] = useState<Insight | null>(null);
  const [loading, setLoading] = useState(false);
  const [reader, setReader] = useState<ReaderState>({ open: false });
  const navigate = useNavigate();

  useEffect(() => {
    const cached = loadCached();
    const slotTs = lastScheduledSlot();
    const stale =
      !cached ||
      Date.now() - cached.at > TTL_MS ||
      cached.at < slotTs; // cache older than most recent scheduled slot
    if (cached) setInsight(cached.data);
    if (stale) fetchInsight();

    // Poll every 5 min: if we've crossed into a new scheduled slot since last fetch, refresh
    const iv = window.setInterval(() => {
      const c = loadCached();
      const s = lastScheduledSlot();
      if (!c || c.at < s) fetchInsight();
    }, 5 * 60 * 1000);
    return () => window.clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function fetchInsight(opts?: { fresh?: boolean }) {
    const fresh = !!opts?.fresh;
    const keys = getCreativeKeys();
    if (!keys.openai && !keys.gemini) return;
    setLoading(true);
    try {
      // 1) News = real Google News RSS (has real URLs, real content to scrape)
      let realNews: NewsItem[] = [];
      try {
        // fresh=true → bypass server cache + shuffle rotasi berita agar setiap
        // klik Refresh menampilkan berita berbeda.
        const nr = await fetch(`/api/public/news-feed?limit=6${fresh ? "&nocache=1" : "&shuffle=1"}`);
        const nj = await nr.json();
        if (nr.ok && Array.isArray(nj.items)) {
          realNews = (nj.items as { title: string; url: string; description?: string }[])
            .filter((it) => it.title && it.url)
            .slice(0, 5)
            .map((it) => ({ title: it.title, url: it.url }));
        }
      } catch {
        /* fall through — AI will fill news as last resort */
      }

      // 2) AI = greeting + keywords + opportunities + niche ideas (news optional)
      const now = new Date();
      const todayStr = now.toLocaleDateString("id-ID", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      });
      const isoDate = now.toISOString().slice(0, 10);
      const system =
        `You are an AI daily briefing for a content creator. Today is ${todayStr} (${isoDate}). ` +
        `Only reference current, up-to-date trends/tools relevant to the last 30 days. ` +
        `Never mention years earlier than ${now.getFullYear()} unless historically relevant. ` +
        `Reply pure JSON only, no fences.`;
      const wantNews = realNews.length === 0;
      const user = `Produce today's creator briefing in Indonesian for ${todayStr}. Return JSON:
{
  "greeting": "1 short line yang menyebut tanggal hari ini secara natural",
  "viral_keywords": string[5] (keyword yang sedang viral MINGGU INI),
${wantNews ? '  "news": [{"title": string, "url": string}] x2 (berita AI/creator economy terbaru. url WAJIB link artikel asli),' : ""}
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
      const parsed = JSON.parse(data.text) as Partial<Insight>;
      const merged: Insight = {
        greeting: parsed.greeting || "Selamat datang kembali!",
        viral_keywords: parsed.viral_keywords || [],
        news: realNews.length > 0 ? realNews : (parsed.news || []),
        opportunities: parsed.opportunities || [],
        niche_ideas: parsed.niche_ideas || [],
      };
      setInsight(merged);
      // Background prefetch (scrape + refine) so clicks open instantly.
      merged.news.forEach((it) => {
        if (typeof it !== "string" && it.url) prefetchArticle(it.url, it.title);
      });
      try {
        localStorage.setItem(KEY, JSON.stringify({ data: merged, at: Date.now() }));
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
          onClick={() => fetchInsight({ fresh: true })}
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
            <NewsBlock
              icon={<Newspaper className="h-3.5 w-3.5" />}
              label="Berita Penting"
              items={insight.news}
              onOpen={async (item) => {
                const title = typeof item === "string" ? item : item.title;
                const rawUrl = typeof item === "string" ? undefined : item.url;
                const scrapable =
                  rawUrl && /^https?:\/\//i.test(rawUrl) && !rawUrl.includes("google.com/search");
                if (!scrapable) {
                  setReader({
                    open: true,
                    title,
                    url: rawUrl,
                    loading: false,
                    body:
                      "AI Brain tidak menyertakan URL artikel asli untuk berita ini. Coba refresh briefing, atau klik 'Buka di web' untuk mencari di Google.",
                  });
                  return;
                }
                const cached = getArticle(rawUrl);
                if (cached) {
                  setReader({
                    open: true,
                    title: cached.title,
                    url: rawUrl,
                    loading: false,
                    body: cached.body,
                    refined: cached.refined,
                    hero: cached.hero,
                    error: cached.error,
                  });
                  return;
                }
                setReader({ open: true, title, url: rawUrl, loading: true });
                const data = await ensureArticle(rawUrl, title);
                setReader({
                  open: true,
                  title: data.title,
                  url: rawUrl,
                  loading: false,
                  body: data.body,
                  refined: data.refined,
                  hero: data.hero,
                  error: data.error,
                });
              }}
              onGenerate={(item) => {
                const title = typeof item === "string" ? item : item.title;
                const url = typeof item === "string" ? undefined : item.url;
                const scrapable =
                  url && /^https?:\/\//i.test(url) && !url.includes("google.com/search");
                setHandoff({
                  workflow: "narrative-video",
                  title,
                  hook: "",
                  description: title,
                  sourceUrl: scrapable ? url : undefined,
                  autoScrape: !!scrapable,
                });
                void navigate({ to: "/generate/naratif" });
              }}
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
      {reader.open && (
        <NewsReaderModal
          state={reader}
          onClose={() => setReader({ open: false })}
          onGenerate={() => {
            if (!reader.open) return;
            const scrapable =
              reader.url && /^https?:\/\//i.test(reader.url) && !reader.url.includes("google.com/search");
            setHandoff({
              workflow: "narrative-video",
              title: reader.title,
              hook: "",
              description: (reader.refined || reader.body)?.slice(0, 400) || reader.title,
              sourceUrl: scrapable ? reader.url : undefined,
              autoScrape: !!scrapable,
            });
            setReader({ open: false });
            void navigate({ to: "/generate/naratif" });
          }}
        />
      )}
    </div>
  );
}

function NewsReaderModal({
  state,
  onClose,
  onGenerate,
}: {
  state: Extract<ReaderState, { open: true }>;
  onClose: () => void;
  onGenerate: () => void;
}) {
  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      className="fixed inset-0 z-[80] grid place-items-center bg-black/70 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="neumorph relative w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3 border-b border-border p-4 pr-12">
          <Newspaper className="h-4 w-4 text-primary shrink-0 mt-0.5" />
          <div className="font-display text-base flex-1 leading-snug">{state.title}</div>
          <button
            onClick={onClose}
            className="absolute top-3 right-3 inline-flex items-center gap-1 rounded-full border border-border bg-card/60 px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" /> Tutup
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {state.loading ? (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-xs text-muted-foreground">
              <Loader className="h-8 w-8 animate-spin text-primary" />
              <span>AI Brain sedang mengambil & merapikan isi berita…</span>
            </div>
          ) : state.error ? (
            <div className="text-xs text-destructive">Gagal ambil isi: {state.error}</div>
          ) : (
            <>
              {state.hero && (
                <img
                  src={state.hero}
                  alt={state.title}
                  className="w-full max-h-64 object-cover rounded-lg mb-3 border border-border"
                  loading="lazy"
                />
              )}
              {state.refined && (
                <div className="mb-2 text-[10px] font-mono uppercase tracking-widest text-primary/80">
                  ✧ Dirapikan oleh AI Brain
                </div>
              )}
              <div className="text-sm leading-relaxed text-foreground/90 whitespace-pre-wrap">
                {state.refined || state.body}
              </div>
              {state.refined && state.body && (
                <details className="mt-4 text-[11px] text-muted-foreground">
                  <summary className="cursor-pointer hover:text-foreground">Lihat teks mentah</summary>
                  <div className="mt-2 whitespace-pre-wrap text-foreground/60">{state.body}</div>
                </details>
              )}
            </>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border p-3">
          {state.url && (
            <a
              href={state.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded-full border border-border bg-card/60 px-3 py-1 text-[11px] text-muted-foreground hover:text-foreground"
            >
              <ExternalLink className="h-3 w-3" /> Buka di web
            </a>
          )}
          <button
            onClick={onGenerate}
            className="inline-flex items-center gap-1 rounded-full px-3 py-1 text-[11px] font-medium text-primary-foreground"
            style={{ background: "var(--gradient-neon)" }}
          >
            Generate Naratif
          </button>
        </div>
      </div>
    </div>,
    document.body,
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

function NewsBlock({
  icon,
  label,
  items,
  onOpen,
  onGenerate,
}: {
  icon: React.ReactNode;
  label: string;
  items: (string | NewsItem)[];
  onOpen: (item: string | NewsItem) => void;
  onGenerate: (item: string | NewsItem) => void;
}) {
  return (
    <div className="rounded-xl border border-border bg-card/40 p-3">
      <div className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
        {icon} {label}
        <Chip className="ml-auto">{items.length}</Chip>
      </div>
      <ul className="mt-2 space-y-1.5">
        {items.slice(0, 5).map((it, i) => {
          const title = typeof it === "string" ? it : it.title;
          const hasUrl =
            typeof it !== "string" && !!it.url && /^https?:\/\//i.test(it.url || "");
          return (
            <li key={i} className="group">
              <div className="flex items-start gap-1.5">
                <button
                  onClick={() => onOpen(it)}
                  className="flex-1 text-left text-xs text-foreground/85 hover:text-primary line-clamp-2 inline-flex items-start gap-1"
                  title={hasUrl ? "Buka artikel di tab baru" : "Cari di Google"}
                >
                  <span>• {title}</span>
                  <ExternalLink className="h-3 w-3 opacity-60 shrink-0 mt-0.5" />
                </button>
                <button
                  onClick={() => onGenerate(it)}
                  className="shrink-0 text-[10px] text-primary hover:underline opacity-70 group-hover:opacity-100 transition"
                  title={hasUrl ? "Generate naratif dari artikel ini" : "Riset topik"}
                >
                  Gen
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
