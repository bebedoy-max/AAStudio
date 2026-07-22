import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "@tanstack/react-router";
import { BookOpen, Newspaper, ArrowRight, ExternalLink, Loader2, Loader, X } from "lucide-react";
import { todaysTips } from "@/lib/dashboard/playbook";
import { Chip } from "./section";
import { setHandoff } from "@/lib/creative/handoff";
import { getCreativeKeys, headersFor } from "@/lib/creative/keys";

type LiveNews = { title: string; url: string; source: string; tag: string };

const NEWS_QUERIES = [
  { q: "Kling AI update", tag: "Model" },
  { q: "TikTok algorithm update creator", tag: "Platform" },
  { q: "OpenAI Sora update", tag: "Model" },
  { q: "YouTube Shorts monetization update", tag: "Platform" },
  { q: "Runway Gen model update", tag: "Model" },
];

type ReaderState =
  | { open: false }
  | { open: true; title: string; url: string; loading: boolean; body?: string; hero?: string; error?: string; refined?: string; refining?: boolean };

export function PlaybookNews({ onGenerate }: { onGenerate: (topic: string) => void }) {
  const [tab, setTab] = useState<"playbook" | "news">("playbook");
  const tips = todaysTips();
  const [news, setNews] = useState<LiveNews[]>([]);
  const [loadingNews, setLoadingNews] = useState(false);
  const [reader, setReader] = useState<ReaderState>({ open: false });
  const navigate = useNavigate();

  useEffect(() => {
    if (tab !== "news" || news.length > 0 || loadingNews) return;
    setLoadingNews(true);
    (async () => {
      try {
        const results = await Promise.all(
          NEWS_QUERIES.map(async ({ q, tag }) => {
            try {
              const r = await fetch(`/api/public/news-feed?limit=1&q=${encodeURIComponent(q)}`);
              const j = await r.json();
              const it = Array.isArray(j.items) ? j.items[0] : null;
              if (!it || !it.url || !it.title) return null;
              return { title: it.title, url: it.url, source: it.source || "Google News", tag } as LiveNews;
            } catch { return null; }
          }),
        );
        setNews(results.filter((x): x is LiveNews => !!x));
      } finally {
        setLoadingNews(false);
      }
    })();
  }, [tab, news.length, loadingNews]);


  const openReader = async (n: LiveNews) => {
    setReader({ open: true, title: n.title, url: n.url, loading: true });
    try {
      const r = await fetch("/api/public/scrape-article", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: n.url }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      const scrapedTitle = j.title || n.title;
      const scrapedBody = j.body || j.description || "(Isi berita tidak dapat diambil.)";
      setReader({
        open: true,
        title: scrapedTitle,
        url: n.url,
        loading: false,
        body: scrapedBody,
        hero: Array.isArray(j.images) ? j.images[0] : undefined,
        refining: true,
      });
      // AI-refine: bersihkan sisa junk, translate ke Indonesia, rangkum sesuai judul.
      void (async () => {
        try {
          const keys = getCreativeKeys();
          if (!keys.openai && !keys.gemini) {
            setReader((prev) => (prev.open ? { ...prev, refining: false } : prev));
            return;
          }
          const rawBody = String(scrapedBody).slice(0, 8000);
          if (!rawBody || rawBody.length < 200) {
            setReader((prev) => (prev.open ? { ...prev, refining: false } : prev));
            return;
          }
          const system =
            "Kamu editor berita berpengalaman. Bersihkan teks hasil scrape dari elemen sampah " +
            "(menu navigasi, daftar 'Terkini/Terpopuler/Pilihan', timestamp bullet, kategori ALL-CAPS, " +
            "nama reporter/editor, iklan, teks berulang, link sisa, tombol 'Copy Link', ukuran font, timer audio). " +
            "Sajikan HANYA isi berita/artikel yang RELEVAN dengan JUDUL. WAJIB terjemahkan ke Bahasa Indonesia " +
            "jika sumber berbahasa asing. Output rapi, mudah dibaca. Balas TEKS BIASA (tanpa markdown fence, " +
            "tanpa **, tanpa #). Format: paragraf pembuka 1-2 kalimat, lalu poin-poin utama (pakai '• ' di awal baris) " +
            "atau paragraf pendek. Maksimal ~500 kata.";
          const user = `JUDUL: ${scrapedTitle}\n\nTEKS MENTAH:\n${rawBody}\n\nTugas: rangkum, translate ke Indonesia bila perlu, & rapikan sesuai instruksi.`;
          const rr = await fetch("/api/router/chat", {
            method: "POST",
            headers: headersFor(keys),
            body: JSON.stringify({ system, user, temperature: 0.4 }),
          });
          const rj = await rr.json();
          const refined = (rj?.text || "").trim();
          setReader((prev) =>
            prev.open ? { ...prev, refining: false, refined: refined || undefined } : prev,
          );
        } catch {
          setReader((prev) => (prev.open ? { ...prev, refining: false } : prev));
        }
      })();
    } catch (e) {
      setReader({
        open: true,
        title: n.title,
        url: n.url,
        loading: false,
        error: (e as Error).message || String(e),
      });
    }
  };

  const handleGenerate = (n: { title: string; url?: string; body?: string }) => {
    if (n.url) {
      setHandoff({
        workflow: "narrative-video",
        title: n.title,
        hook: "",
        description: n.body?.slice(0, 400) || n.title,
        sourceUrl: n.url,
        autoScrape: true,
      });
      void navigate({ to: "/generate/naratif" });
      return;
    }
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
      ) : loadingNews && news.length === 0 ? (
        <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Mengambil berita terbaru…
        </div>
      ) : news.length === 0 ? (
        <div className="mt-3 text-xs text-muted-foreground">Berita tidak tersedia sekarang.</div>
      ) : (
        <ul className="mt-3 space-y-2">
          {news.map((n, i) => (
            <li key={i} className="rounded-xl border border-border bg-card/30 p-3 flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <Chip>{n.tag}</Chip>
                  <span className="text-[10px] text-muted-foreground truncate">{n.source}</span>
                </div>
                <button
                  onClick={() => openReader(n)}
                  className="text-left text-sm text-foreground/95 mt-1 inline-flex items-start gap-1 hover:text-primary"
                  title="Baca isi berita di aplikasi"
                >
                  <span className="line-clamp-2">{n.title}</span>
                </button>
              </div>
              <button
                onClick={() => handleGenerate(n)}
                className="shrink-0 inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
                title="Buka di Naratif Video Maker + scrape otomatis"
              >
                Generate <ArrowRight className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {reader.open && (
        <NewsReaderModal
          state={reader}
          onClose={() => setReader({ open: false })}
          onGenerate={() => {
            if (!reader.open) return;
            handleGenerate({ title: reader.title, url: reader.url, body: reader.refined || reader.body });
            setReader({ open: false });
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
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader className="h-3.5 w-3.5 animate-spin" /> Mengambil isi artikel…
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
              {state.refining && (
                <div className="mb-3 flex items-center gap-2 rounded-md border border-border/60 bg-card/60 px-2.5 py-1.5 text-[11px] text-muted-foreground">
                  <Loader className="h-3 w-3 animate-spin" /> AI Brain sedang merapikan & menerjemahkan isi berita…
                </div>
              )}
              {state.refined && !state.refining && (
                <div className="mb-2 text-[10px] font-mono uppercase tracking-widest text-primary/80">
                  ✧ Dirapikan & diterjemahkan oleh AI Brain
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
          <a
            href={state.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded-full border border-border bg-card/60 px-3 py-1 text-[11px] text-muted-foreground hover:text-foreground"
          >
            <ExternalLink className="h-3 w-3" /> Buka di web
          </a>
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
