import { createFileRoute } from "@tanstack/react-router";

// Google News RSS-based briefing. Returns real articles with real URLs
// so the in-app reader can scrape actual content.

type Item = { title: string; url: string; description: string; source: string; pubDate: string };

const DEFAULT_QUERIES = [
  "AI content creator",
  "faceless youtube channel",
  "creator economy monetisasi",
  "AI video generator tool",
  "affiliate marketing tiktok",
];

function decode(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)));
}

function stripTags(s: string): string {
  return decode(s).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function parseRss(xml: string, fallbackSource: string): Item[] {
  const items: Item[] = [];
  const re = /<item[\s\S]*?<\/item>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    const chunk = m[0];
    const title = stripTags((chunk.match(/<title>([\s\S]*?)<\/title>/i)?.[1] || "").trim());
    const url = decode((chunk.match(/<link>([\s\S]*?)<\/link>/i)?.[1] || "").trim());
    const description = stripTags((chunk.match(/<description>([\s\S]*?)<\/description>/i)?.[1] || "").trim()).slice(0, 320);
    const pubDate = (chunk.match(/<pubDate>([\s\S]*?)<\/pubDate>/i)?.[1] || "").trim();
    const source = stripTags((chunk.match(/<source[^>]*>([\s\S]*?)<\/source>/i)?.[1] || fallbackSource).trim());
    if (title && url) items.push({ title, url, description, source, pubDate });
  }
  return items;
}

type Cached = { at: number; items: Item[] };
const CACHE = new Map<string, Cached>();
const TTL = 60 * 60 * 1000; // 1h

export const Route = createFileRoute("/api/public/news-feed")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const q = (url.searchParams.get("q") || "").trim();
        const limit = Math.min(20, Math.max(1, parseInt(url.searchParams.get("limit") || "6", 10)));
        const nocache = url.searchParams.get("nocache") === "1";
        const shuffle = nocache || url.searchParams.get("shuffle") === "1";
        const queries = q ? [q] : DEFAULT_QUERIES;

        const cacheKey = queries.join("|") + ":" + limit;
        const hit = CACHE.get(cacheKey);
        if (!nocache && hit && Date.now() - hit.at < TTL) {
          const items = shuffle ? [...hit.items].sort(() => Math.random() - 0.5) : hit.items;
          return new Response(JSON.stringify({ cached: true, items }), {
            headers: { "Content-Type": "application/json" },
          });
        }

        const all: Item[] = [];
        for (const query of queries) {
          try {
            const feed = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=id&gl=ID&ceid=ID:id`;
            const r = await fetch(feed, {
              headers: {
                "User-Agent": "Mozilla/5.0 (compatible; NewsBriefingBot/1.0)",
                "Accept": "application/rss+xml,application/xml,text/xml",
              },
            });
            if (!r.ok) continue;
            const xml = await r.text();
            all.push(...parseRss(xml, "Google News"));
          } catch {
            /* ignore per-query failure */
          }
        }

        // De-dup by title, sort newest, cap
        const seen = new Set<string>();
        const uniq = all.filter((it) => {
          const key = it.title.toLowerCase();
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
        uniq.sort((a, b) => {
          const ta = Date.parse(a.pubDate) || 0;
          const tb = Date.parse(b.pubDate) || 0;
          return tb - ta;
        });
        // Broaden pool then shuffle if requested — user gets fresh rotation
        // every Refresh click even within TTL.
        const pool = uniq.slice(0, Math.max(limit * 3, limit));
        CACHE.set(cacheKey, { at: Date.now(), items: pool });
        const items = shuffle ? [...pool].sort(() => Math.random() - 0.5).slice(0, limit) : pool.slice(0, limit);
        return new Response(JSON.stringify({ cached: false, items }), {
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
