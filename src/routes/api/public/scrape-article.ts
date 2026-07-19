import { createFileRoute } from "@tanstack/react-router";

// Article/news/blog scraper. Ambil title, description, hero image, dan
// body text bersih (limit ~6000 char) untuk dikirim ke naratif-brain.

function absolutize(url: string, base: string): string {
  try { return new URL(url, base).toString(); } catch { return url; }
}
function unique<T>(a: T[]): T[] { return Array.from(new Set(a)); }
function pickMeta(html: string, patterns: RegExp[]): string {
  for (const re of patterns) { const m = html.match(re); if (m && m[1]) return m[1].trim(); }
  return "";
}
function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)));
}
function stripHtmlToText(html: string): string {
  // remove script/style/nav/header/footer/aside blocks
  let s = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<(?:nav|header|footer|aside|form)[\s\S]*?<\/(?:nav|header|footer|aside|form)>/gi, " ");
  // try to isolate <article> if present
  const art = s.match(/<article[\s\S]*?<\/article>/i);
  if (art && art[0].length > 400) s = art[0];
  s = s.replace(/<[^>]+>/g, " ");
  s = decodeEntities(s).replace(/\s+/g, " ").trim();
  return s;
}
function titleFromUrl(v: string): string {
  try {
    const u = new URL(v);
    const parts = u.pathname.split("/").filter(Boolean);
    const slug = decodeURIComponent(parts[parts.length - 1] || parts[parts.length - 2] || "");
    return slug.replace(/[-_]+/g, " ").replace(/\.\w+$/, "").replace(/\b\w/g, (c) => c.toUpperCase()).trim();
  } catch { return ""; }
}

export const Route = createFileRoute("/api/public/scrape-article")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: { url?: string } = {};
        try { body = await request.json(); } catch { /* */ }
        const target = (body.url || "").trim();
        if (!target || !/^https?:\/\//i.test(target)) {
          return new Response(JSON.stringify({ error: "URL tidak valid" }), { status: 400, headers: { "Content-Type": "application/json" } });
        }

        let html = "";
        let directOk = false;
        let directErr = "";
        try {
          const res = await fetch(target, {
            headers: {
              "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
              "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
              "Accept-Language": "id-ID,id;q=0.9,en;q=0.8",
            },
            redirect: "follow",
          });
          if (res.ok) { html = await res.text(); directOk = html.length > 500; }
          else directErr = `direct ${res.status}`;
        } catch (e) { directErr = (e as Error).message; }

        // MSN-specific: articles render via SPA. Use MSN's public content API.
        // URL shape: /{locale}/.../ar-{cmsId}
        let msnTitle = "", msnDesc = "", msnBody = "", msnImages: string[] = [];
        try {
          const u = new URL(target);
          if (/(^|\.)msn\.com$/i.test(u.hostname)) {
            const seg = u.pathname.split("/").filter(Boolean);
            const locale = seg[0] || "id-id";
            const arSeg = seg.find((s) => /^ar-/i.test(s));
            const cmsId = arSeg ? arSeg.replace(/^ar-/i, "") : "";
            if (cmsId) {
              const api = `https://assets.msn.com/content/view/v2/Detail/${locale}/${cmsId}`;
              const r = await fetch(api, { headers: { "Accept": "application/json", "User-Agent": "Mozilla/5.0" } });
              if (r.ok) {
                const j = await r.json() as {
                  title?: string; abstract?: string; body?: string;
                  imageResources?: { url?: string }[];
                };
                msnTitle = j.title || "";
                msnDesc = j.abstract || "";
                msnBody = decodeEntities((j.body || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
                msnImages = (j.imageResources || []).map((x) => x.url).filter((x): x is string => !!x);
              }
            }
          }
        } catch { /* */ }

        // Detect JS-shell pages (MSN, Google News redirects, SPA news sites)
        // where direct HTML is nearly empty OR is a wrapper page for another URL.
        const quickText = directOk ? stripHtmlToText(html) : "";
        const quickTitle = directOk ? pickMeta(html, [/<title[^>]*>([^<]+)<\/title>/i]) : "";
        const isGoogleNewsWrapper = /(^|\.)news\.google\.com$/i.test(new URL(target).hostname);
        const looksEmpty = !directOk || quickText.length < 400 || /^(msn|home|loading|google\s*berita|google\s*news)\.?$/i.test(quickTitle.trim()) || isGoogleNewsWrapper;

        // Jina Reader fallback for clean article text (handles JS SPAs + Google News redirects)
        let jinaMd = "";
        if (looksEmpty && !msnBody) {
          try {
            const jr = await fetch("https://r.jina.ai/" + target, {
              headers: { "Accept": "text/plain", "X-Return-Format": "markdown", "User-Agent": "Mozilla/5.0" },
            });
            if (jr.ok) jinaMd = await jr.text();
          } catch { /* */ }
        }

        if (!directOk && !jinaMd && !msnBody) {
          return new Response(JSON.stringify({ error: `Gagal fetch (${directErr})` }), { status: 200, headers: { "Content-Type": "application/json" } });
        }


        const base = target;
        const ogTitle = pickMeta(html, [
          /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i,
          /<meta[^>]+name=["']twitter:title["'][^>]+content=["']([^"']+)["']/i,
        ]);
        const htmlTitle = pickMeta(html, [/<title[^>]*>([^<]+)<\/title>/i]);
        const ogDesc = pickMeta(html, [
          /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i,
          /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i,
        ]);

        const imgs: string[] = [];
        if (!isGoogleNewsWrapper) {
          const ogImgRe = /<meta[^>]+(?:property|name)=["'](?:og:image(?::secure_url)?|twitter:image)["'][^>]+content=["']([^"']+)["']/gi;
          let m: RegExpExecArray | null;
          while ((m = ogImgRe.exec(html))) imgs.push(absolutize(m[1], base));
          const artMatch = html.match(/<article[\s\S]*?<\/article>/i);
          const scope = artMatch ? artMatch[0] : html;
          const imgSrc = /<img[^>]+src=["']([^"']+)["']/gi;
          while ((m = imgSrc.exec(scope))) imgs.push(absolutize(m[1], base));
        }

        // Jina markdown → title/desc/body/images
        let jinaTitle = "", jinaDesc = "", jinaBody = "";
        if (jinaMd) {
          const t = jinaMd.match(/^Title:\s*(.+)$/mi); if (t) jinaTitle = t[1].trim();
          const d = jinaMd.match(/^Description:\s*(.+)$/mi); if (d) jinaDesc = d[1].trim();
          const bStart = jinaMd.indexOf("Markdown Content:");
          if (bStart >= 0) {
            jinaBody = jinaMd.slice(bStart + 17)
              .replace(/!\[[^\]]*\]\(([^)]+)\)/g, (_, u) => { imgs.push(u); return " "; })
              .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
              .replace(/^\s*[#>*_-]+\s*/gm, "")
              .replace(/\s+/g, " ")
              .trim();
          }
        }

        const htmlText = stripHtmlToText(html);
        // For Google News wrapper URLs, ignore direct HTML (Google shell) —
        // use only Jina's resolved-target markdown so we get the real article.
        const bodyText = isGoogleNewsWrapper
          ? (jinaBody || msnBody || "")
          : (msnBody || ((jinaBody && jinaBody.length > 200) ? jinaBody : (htmlText || jinaBody)));
        const brandOnly = (v: string) => /^(msn|home|loading|google\s*berita|google\s*news)\.?$/i.test((v || "").trim());
        const pickTitle = isGoogleNewsWrapper || brandOnly(ogTitle) ? "" : ogTitle;
        const pickHtmlTitle = isGoogleNewsWrapper || brandOnly(htmlTitle) ? "" : htmlTitle;
        const pickDesc = isGoogleNewsWrapper || brandOnly(ogDesc) ? "" : ogDesc;
        const finalTitle = decodeEntities(msnTitle || pickTitle || jinaTitle || pickHtmlTitle || titleFromUrl(target) || "");
        const finalDesc = decodeEntities(msnDesc || pickDesc || jinaDesc || bodyText.slice(0, 300));
        const finalBody = bodyText.slice(0, 6000);
        const finalImages = unique([...msnImages, ...imgs])
          .filter((u) => /^https?:\/\//i.test(u))
          .filter((u) => !/\.svg(\?|$)/i.test(u))
          .filter((u) => !/logo|favicon|icon-|sprite|placeholder|avatar|profile-picture|1x1|pixel|tracking/i.test(u))
          .slice(0, 12);

        return new Response(JSON.stringify({
          url: target,
          title: finalTitle,
          description: finalDesc,
          body: finalBody,
          images: finalImages,
        }), { headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });
      },
    },
  },
});
