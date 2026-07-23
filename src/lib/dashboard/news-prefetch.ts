// Background prefetch cache for scraped + AI-refined news articles.
// Both "Berita Penting" (brain-insight) and "News" tab (playbook-news) share
// this cache so clicking a news item can render final content instantly.
import { getCreativeKeys, headersFor } from "@/lib/creative/keys";

export type PrefetchedArticle = {
  title: string;
  body?: string;
  refined?: string;
  hero?: string;
  error?: string;
};

type Entry = {
  status: "loading" | "done" | "error";
  data?: PrefetchedArticle;
  promise: Promise<PrefetchedArticle>;
};

const cache = new Map<string, Entry>();

const REFINE_SYSTEM =
  "Kamu editor berita berpengalaman. Bersihkan teks hasil scrape dari elemen sampah " +
  "(menu navigasi, daftar 'Terkini/Terpopuler/Pilihan', timestamp bullet, kategori ALL-CAPS, " +
  "nama reporter/editor, iklan, teks berulang, link sisa, tombol 'Copy Link', ukuran font, timer audio). " +
  "Sajikan HANYA isi berita/artikel yang RELEVAN dengan JUDUL. WAJIB terjemahkan ke Bahasa Indonesia " +
  "jika sumber berbahasa asing. Output rapi, mudah dibaca. Balas TEKS BIASA (tanpa markdown fence, " +
  "tanpa **, tanpa #). Format: paragraf pembuka 1-2 kalimat, lalu poin-poin utama (pakai '• ' di awal baris) " +
  "atau paragraf pendek. Maksimal ~500 kata.";

async function run(url: string, fallbackTitle: string): Promise<PrefetchedArticle> {
  try {
    const r = await fetch("/api/public/scrape-article", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
    const title = j.title || fallbackTitle;
    const body = j.body || j.description || "(Isi berita tidak dapat diambil.)";
    const hero = Array.isArray(j.images) ? j.images[0] : undefined;

    let refined: string | undefined;
    const keys = getCreativeKeys();
    const rawBody = String(body).slice(0, 8000);
    if ((keys.openai || keys.gemini) && rawBody.length >= 200) {
      try {
        const rr = await fetch("/api/router/chat", {
          method: "POST",
          headers: headersFor(keys),
          body: JSON.stringify({
            system: REFINE_SYSTEM,
            user: `JUDUL: ${title}\n\nTEKS MENTAH:\n${rawBody}\n\nTugas: rangkum, translate ke Indonesia bila perlu, & rapikan sesuai instruksi.`,
            temperature: 0.4,
          }),
        });
        const rj = await rr.json();
        refined = (rj?.text || "").trim() || undefined;
      } catch {
        // refine best-effort
      }
    }
    return { title, body, refined, hero };
  } catch (e) {
    return { title: fallbackTitle, error: (e as Error).message || String(e) };
  }
}

export function prefetchArticle(url: string, title: string): void {
  if (!url || !/^https?:\/\//i.test(url) || url.includes("google.com/search")) return;
  if (cache.has(url)) return;
  const promise = run(url, title).then((data) => {
    const entry = cache.get(url);
    if (entry) {
      entry.status = data.error ? "error" : "done";
      entry.data = data;
    }
    return data;
  });
  cache.set(url, { status: "loading", promise });
}

export function getArticle(url: string): PrefetchedArticle | null {
  const e = cache.get(url);
  return e && e.status !== "loading" ? e.data ?? null : null;
}

export async function ensureArticle(url: string, title: string): Promise<PrefetchedArticle> {
  prefetchArticle(url, title);
  const entry = cache.get(url);
  if (!entry) return run(url, title);
  return entry.promise;
}
