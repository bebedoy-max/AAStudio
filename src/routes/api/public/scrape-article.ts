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
  // Preserve paragraph structure: turn block-level closers into newlines.
  s = s
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(?:p|div|section|article|li|h[1-6]|blockquote|tr)>/gi, "\n\n")
    .replace(/<li[^>]*>/gi, "\n• ");
  s = s.replace(/<[^>]+>/g, " ");
  s = decodeEntities(s);
  // Normalize spaces within lines, keep newlines
  s = s.split("\n").map((l) => l.replace(/[ \t\u00A0]+/g, " ").trim()).join("\n");
  s = s.replace(/\n{3,}/g, "\n\n").trim();
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

// Resolve Google News wrapper URL (news.google.com/rss/articles/{id}?...)
// to the underlying publisher URL using Google's internal batchexecute RPC.
async function resolveGoogleNewsUrl(wrapperUrl: string): Promise<string | null> {
  try {
    const res = await fetch(wrapperUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      redirect: "follow",
    });
    if (!res.ok) return null;
    const shell = await res.text();
    const idMatch = shell.match(/data-n-a-id="([^"]+)"/);
    const sgMatch = shell.match(/data-n-a-sg="([^"]+)"/);
    const tsMatch = shell.match(/data-n-a-ts="([^"]+)"/);
    if (!idMatch || !sgMatch || !tsMatch) return null;
    const id = idMatch[1], sg = sgMatch[1], ts = tsMatch[1];
    const inner = JSON.stringify([
      "garturlreq",
      [["X","X",["X","X"],null,null,1,1,"US:en",null,1,null,null,null,null,null,0,1],
       "X","X",1,[1,1,1],1,1,null,0,0,null,0],
      id, Number(ts), sg,
    ]);
    const outer = JSON.stringify([[["Fbv4je", inner, null, "generic"]]]);
    const body = "f.req=" + encodeURIComponent(outer);
    const r = await fetch(
      "https://news.google.com/_/DotsSplashUi/data/batchexecute?rpcids=Fbv4je&hl=en-US&gl=US&soc-app=139&soc-platform=1&soc-device=1&rt=c",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8", "User-Agent": "Mozilla/5.0" },
        body,
      },
    );
    if (!r.ok) return null;
    const txt = await r.text();
    // Response is )]}' prefixed, then chunked lines. Find garturlres payload.
    const m = txt.match(/"garturlres\\?",\\?"(https?:\\?\/\\?\/[^"\\]+)/);
    if (m) return m[1].replace(/\\\//g, "/");
    // Fallback: parse each JSON chunk defensively.
    const lines = txt.split("\n");
    for (const line of lines) {
      const t = line.trim();
      if (!t.startsWith("[")) continue;
      try {
        const arr = JSON.parse(t) as unknown[];
        for (const row of arr as unknown[][]) {
          if (Array.isArray(row) && row[0] === "wrb.fr" && typeof row[2] === "string") {
            const inner2 = JSON.parse(row[2] as string) as unknown[];
            if (Array.isArray(inner2) && typeof inner2[1] === "string" && /^https?:\/\//.test(inner2[1] as string)) {
              return inner2[1] as string;
            }
          }
        }
      } catch { /* */ }
    }
    return null;
  } catch { return null; }
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

        // Google News wrapper URLs (news.google.com/rss/articles/{id})
        // never render the article inline — they need to be resolved to the
        // publisher URL first via Google's internal batchexecute RPC.
        const isGoogleNewsWrapper = /(^|\.)news\.google\.com$/i.test(new URL(target).hostname);
        let resolvedTarget = target;
        if (isGoogleNewsWrapper) {
          const real = await resolveGoogleNewsUrl(target);
          if (real) resolvedTarget = real;
        }

        let html = "";
        let directOk = false;
        let directErr = "";
        try {
          const res = await fetch(resolvedTarget, {
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
          const u = new URL(resolvedTarget);
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
                msnBody = stripHtmlToText(j.body || "");
                msnImages = (j.imageResources || []).map((x) => x.url).filter((x): x is string => !!x);
              }
            }
          }
        } catch { /* */ }

        // Detect JS-shell pages where direct HTML is empty / a shell.
        const quickText = directOk ? stripHtmlToText(html) : "";
        const quickTitle = directOk ? pickMeta(html, [/<title[^>]*>([^<]+)<\/title>/i]) : "";
        const stillWrapper = /(^|\.)news\.google\.com$/i.test(new URL(resolvedTarget).hostname);
        const looksEmpty = !directOk || quickText.length < 400 || /^(msn|home|loading|google\s*berita|google\s*news)\.?$/i.test(quickTitle.trim()) || stillWrapper;

        // Detect bot-block / captcha / "sorry" interstitials returned by
        // Google, Cloudflare, etc. These pages *look* successful (HTTP 200
        // with real HTML) but contain no article content.
        const isBlockPage = (t: string): boolean => {
          if (!t) return false;
          const s = t.toLowerCase().replace(/\s+/g, " ");
          return (
            /we['\u2019]?re sorry.{0,40}your computer or network may be sending automated queries/.test(s) ||
            /unusual traffic from your computer network/.test(s) ||
            /to protect our users,? we can['\u2019]?t process your request/.test(s) ||
            /enable javascript and cookies to continue/.test(s) ||
            /attention required.{0,10}cloudflare/.test(s) ||
            /access to this page has been denied|akamai reference/.test(s) ||
            /verifying you are human/.test(s) ||
            /\bg o o g l e\b.{0,80}sorry/.test(s)
          );
        };
        const directBlocked = isBlockPage(quickText) || isBlockPage(quickTitle);


        // Jina Reader fallback for clean article text (handles JS SPAs,
        // Google News redirects, and origins that bot-block direct fetches).
        let jinaMd = "";
        if ((looksEmpty || directBlocked) && !msnBody) {
          try {
            const jr = await fetch("https://r.jina.ai/" + resolvedTarget, {
              headers: { "Accept": "text/plain", "X-Return-Format": "markdown", "User-Agent": "Mozilla/5.0" },
            });
            if (jr.ok) {
              const md = await jr.text();
              if (!isBlockPage(md)) jinaMd = md;
            }
          } catch { /* */ }
          // Retry via Jina against the original target if the resolved one was empty
          if (!jinaMd && resolvedTarget !== target) {
            try {
              const jr2 = await fetch("https://r.jina.ai/" + target, {
                headers: { "Accept": "text/plain", "X-Return-Format": "markdown", "User-Agent": "Mozilla/5.0" },
              });
              if (jr2.ok) {
                const md = await jr2.text();
                if (!isBlockPage(md)) jinaMd = md;
              }
            } catch { /* */ }
          }
        }

        // If direct HTML was a block page, discard it so its "Sorry..."
        // text doesn't leak into the final article body.
        if (directBlocked) { html = ""; directOk = false; }

        if (!directOk && !jinaMd && !msnBody) {
          const reason = directBlocked ? "diblokir sumber (anti-bot)" : (directErr || "konten tidak tersedia");
          return new Response(JSON.stringify({ error: `Gagal fetch (${reason})` }), { status: 200, headers: { "Content-Type": "application/json" } });
        }


        const base = resolvedTarget;
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
        if (!stillWrapper) {
          const ogImgRe = /<meta[^>]+(?:property|name)=["'](?:og:image(?::secure_url)?|twitter:image)["'][^>]+content=["']([^"']+)["']/gi;
          let m: RegExpExecArray | null;
          while ((m = ogImgRe.exec(html))) imgs.push(absolutize(m[1], base));
          const artMatch = html.match(/<article[\s\S]*?<\/article>/i);
          const scope = artMatch ? artMatch[0] : html;
          const imgSrc = /<img[^>]+src=["']([^"']+)["']/gi;
          while ((m = imgSrc.exec(scope))) imgs.push(absolutize(m[1], base));
        }

        // Clean markdown/HTML residue while preserving paragraph structure
        // so the reader (whitespace-pre-wrap) shows readable prose with
        // proper line breaks between paragraphs and list items.
        const cleanArticleText = (raw: string): string => {
          let s = raw;
          // Normalize line endings
          s = s.replace(/\r\n?/g, "\n");
          // Markdown images → drop
          s = s.replace(/!\[[^\]]*\]\([^)]*\)/g, " ");
          // Empty markdown links [](url) → drop
          s = s.replace(/\[\s*\]\([^)]*\)/g, " ");
          // Markdown links [text](url) → keep text only
          s = s.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1");
          // Bare URLs (in parens and standalone)
          s = s.replace(/\((?:https?:\/\/|www\.)[^\s)]+\)/gi, " ");
          s = s.replace(/https?:\/\/\S+/gi, " ");
          // Leftover HTML tags
          s = s.replace(/<[^>]+>/g, " ");
          // Strip markdown heading/quote/list markers at line start (keep text)
          s = s.replace(/^\s*#{1,6}\s+/gm, "");
          s = s.replace(/^\s*>\s?/gm, "");
          s = s.replace(/^\s*[*_\-•]\s+/gm, "• ");
          // Strip bold/italic asterisks & underscores around words
          s = s.replace(/\*\*([^*]+)\*\*/g, "$1").replace(/\*([^*]+)\*/g, "$1");
          s = s.replace(/__([^_]+)__/g, "$1").replace(/_([^_]+)_/g, "$1");
          // HTML entities
          s = decodeEntities(s);
          // Zero-width + non-breaking whitespace
          s = s.replace(/[\u200B-\u200D\uFEFF\u00A0]/g, " ");
          // Force line break before numbered list items ("1. ", "2. ") when
          // they appear mid-paragraph — most listicles come in as one blob.
          s = s.replace(/([.!?:])\s+(\d{1,2}\.\s+[A-Z])/g, "$1\n\n$2");
          s = s.replace(/\s(\d{1,2}\.\s+[A-Z][a-zA-Z0-9 ]{2,60}?)(?=[\s:])/g, "\n\n$1");
          // Force break before "Baca Juga:" callouts
          s = s.replace(/\s*(Baca Juga\s*:)/gi, "\n\n$1");
          // Deduplicate immediate word/phrase repetition ("Share ini Share ini")
          s = s.replace(/\b(\w{3,}(?:\s+\w+){0,4})(?:\s+\1\b)+/gi, "$1");
          // Normalize whitespace per line, keep newlines
          s = s.split("\n").map((l) => l.replace(/[ \t]+/g, " ").trim()).join("\n");
          // Drop sidebar/nav junk lines that leak from listicle sites:
          // "• • • • •", timestamps ("1 jam", "22 Jul 2026"), ALL-CAPS
          // category tags, section headers ("Terkini", "Terpopuler").
          const isJunkLine = (line: string): boolean => {
            const t = line.replace(/^[•\-*\s]+/, "").trim();
            if (!t) return false;
            if (/^[•\-*\s]+$/.test(line)) return true;
            if (/^\d{1,2}\s*(jam|menit|detik|hari|minggu|bulan)(\s+yang\s+lalu)?\.?$/i.test(t)) return true;
            if (/^\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4}$/.test(t)) return true;
            if (/^(terkini|terpopuler|pilihan|network|home|trending|kategori|tags?|share|advertisement|iklan|related|baca lainnya|next|prev|sebelumnya|selanjutnya|reporter|editor)\s*:?$/i.test(t)) return true;
            if (t.length <= 40 && /^[A-Z][A-Z\s]{2,}$/.test(t)) return true;
            if (/^\d{1,2}$/.test(t)) return true;
            return false;
          };
          s = s.split("\n").filter((l) => !isJunkLine(l)).join("\n");
          // Collapse many blank lines
          s = s.replace(/\n{3,}/g, "\n\n");
          // Normalize listicle items: when a "N. Title" line is just a short
          // title (no sentence terminator), merge with the next paragraph so
          // every item follows the same "N. Title description..." shape.
          {
            const paras = s.split(/\n{2,}/);
            const out: string[] = [];
            for (let i = 0; i < paras.length; i++) {
              const p = paras[i].trim();
              const isShortTitle = /^\d{1,2}\.\s+.{2,60}$/.test(p) && !/[.!?]$/.test(p);
              if (isShortTitle && i + 1 < paras.length) {
                const next = paras[i + 1].trim();
                if (next && !/^\d{1,2}\.\s/.test(next) && !/^Baca Juga/i.test(next)) {
                  out.push(`${p}. ${next}`);
                  i++;
                  continue;
                }
              }
              out.push(p);
            }
            s = out.filter(Boolean).join("\n\n");
          }
          // Split single-line blobs into sentence-paragraphs if there are
          // effectively no line breaks (common for stripped HTML fallback).
          if (!s.includes("\n\n") && s.length > 800) {
            // Break every ~2 sentences into a paragraph
            const sentences = s.split(/(?<=[.!?])\s+(?=[A-Z"“'])/);
            const paras: string[] = [];
            for (let i = 0; i < sentences.length; i += 2) {
              paras.push(sentences.slice(i, i + 2).join(" ").trim());
            }
            s = paras.filter(Boolean).join("\n\n");
          }
          return s.trim();
        };

        // Single-line variant for description/preview snippets.
        const flatten = (s: string): string => s.replace(/\s+/g, " ").trim();


        // Jina markdown → title/desc/body/images
        let jinaTitle = "", jinaDesc = "", jinaBody = "";
        if (jinaMd) {
          const t = jinaMd.match(/^Title:\s*(.+)$/mi); if (t) jinaTitle = t[1].trim();
          const d = jinaMd.match(/^Description:\s*(.+)$/mi); if (d) jinaDesc = d[1].trim();
          const bStart = jinaMd.indexOf("Markdown Content:");
          if (bStart >= 0) {
            const rawBody = jinaMd.slice(bStart + 17)
              .replace(/!\[[^\]]*\]\(([^)]+)\)/g, (_, u) => { imgs.push(u); return " "; });
            jinaBody = cleanArticleText(rawBody);
          }
        }

        const htmlText = stripHtmlToText(html);
        // If we still have a Google News shell (resolution failed), ignore
        // direct HTML and use only Jina's markdown.
        const bodyText = stillWrapper
          ? (jinaBody || msnBody || "")
          : (msnBody || ((jinaBody && jinaBody.length > 200) ? jinaBody : (htmlText || jinaBody)));
        const brandOnly = (v: string) => /^(msn|home|loading|google\s*berita|google\s*news)\.?$/i.test((v || "").trim());
        const pickTitle = stillWrapper || brandOnly(ogTitle) ? "" : ogTitle;
        const pickHtmlTitle = stillWrapper || brandOnly(htmlTitle) ? "" : htmlTitle;
        const pickDesc = stillWrapper || brandOnly(ogDesc) ? "" : ogDesc;
        const finalTitle = decodeEntities(msnTitle || pickTitle || jinaTitle || pickHtmlTitle || titleFromUrl(resolvedTarget) || titleFromUrl(target) || "");
        const cleanedBody = cleanArticleText(bodyText);
        const finalDesc = decodeEntities(msnDesc || pickDesc || jinaDesc || flatten(cleanedBody).slice(0, 300));
        // Trim to ~6000 chars but avoid cutting in the middle of a paragraph.
        let finalBody = cleanedBody.slice(0, 6000);
        if (cleanedBody.length > 6000) {
          const lastBreak = finalBody.lastIndexOf("\n\n");
          if (lastBreak > 3000) finalBody = finalBody.slice(0, lastBreak).trim();
        }

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
