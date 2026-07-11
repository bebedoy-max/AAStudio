import { createFileRoute } from "@tanstack/react-router";

// Simple product scraper for e-commerce URLs (Tokopedia, Shopee, Lazada, Blibli, generic OG).
// Extracts title, description, and images from meta tags + JSON-LD.

function absolutize(url: string, base: string): string {
  try { return new URL(url, base).toString(); } catch { return url; }
}

function unique<T>(arr: T[]): T[] { return Array.from(new Set(arr)); }

function pickMeta(html: string, patterns: RegExp[]): string {
  for (const re of patterns) {
    const m = html.match(re);
    if (m && m[1]) return m[1].trim();
  }
  return "";
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)));
}

function extractJsonLd(html: string): unknown[] {
  const out: unknown[] = [];
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    try { out.push(JSON.parse(m[1].trim())); } catch { /* ignore */ }
  }
  return out;
}

function walkForProduct(node: unknown, base: string, acc: { title: string; description: string; images: string[] }) {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) { for (const it of node) walkForProduct(it, base, acc); return; }
  const obj = node as Record<string, unknown>;
  const type = obj["@type"];
  const isProduct = type === "Product" || (Array.isArray(type) && type.includes("Product"));
  if (isProduct) {
    if (!acc.title && typeof obj.name === "string") acc.title = obj.name;
    if (!acc.description && typeof obj.description === "string") acc.description = obj.description;
    const img = obj.image;
    if (typeof img === "string") acc.images.push(absolutize(img, base));
    else if (Array.isArray(img)) img.forEach((u) => { if (typeof u === "string") acc.images.push(absolutize(u, base)); });
  }
  for (const v of Object.values(obj)) walkForProduct(v, base, acc);
}

function looksBlocked(content: string): boolean {
  const s = content.slice(0, 3000).toLowerCase();
  return /access\s*denied|akses\s*ditolak|forbidden|captcha|robot check|unusual traffic|cloudflare|akamai|request blocked|you don't have permission/.test(s);
}

function titleFromUrl(value: string): string {
  try {
    const u = new URL(value);
    const parts = u.pathname.split("/").filter(Boolean);
    const slug = decodeURIComponent(parts[parts.length - 1] || parts[parts.length - 2] || "");
    return slug
      .replace(/[-_]+/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase())
      .trim();
  } catch {
    return "";
  }
}

export const Route = createFileRoute("/api/public/scrape-product")({
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
        let directStatus = 0;
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
          directStatus = res.status;
          if (res.ok) {
            html = await res.text();
            directOk = html.length > 500 && !looksBlocked(html);
            if (!directOk && looksBlocked(html)) directErr = "access denied";
          }
        } catch (e) {
          directErr = (e as Error).message;
        }

        // Jina Reader markdown (used as fallback OR always merged for image discovery)
        let jinaMd = "";
        let jinaErr = "";
        const jinaEndpoints = [
          "https://r.jina.ai/" + target,
          "https://r.jina.ai/http://" + target.replace(/^https?:\/\//, ""),
        ];
        for (const ep of jinaEndpoints) {
          try {
            const jr = await fetch(ep, {
              headers: {
                "Accept": "text/plain",
                "X-Return-Format": "markdown",
                "X-With-Images-Summary": "true",
                "User-Agent": "Mozilla/5.0",
              },
            });
            if (jr.ok) { jinaMd = await jr.text(); break; }
            jinaErr = `jina ${jr.status}`;
            if (jr.status !== 429) break;
          } catch (e) { jinaErr = (e as Error).message; }
        }

        // Extra proxy fallbacks if still nothing usable
        if (!directOk && !jinaMd) {
          const proxies = [
            `https://api.allorigins.win/raw?url=${encodeURIComponent(target)}`,
            `https://corsproxy.io/?${encodeURIComponent(target)}`,
            `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(target)}`,
          ];
          for (const p of proxies) {
            try {
              const pr = await fetch(p, { headers: { "User-Agent": "Mozilla/5.0" } });
              if (pr.ok) {
                const txt = await pr.text();
                if (txt && txt.length > 500 && !looksBlocked(txt)) { html = txt; directOk = true; break; }
              }
            } catch { /* try next */ }
          }
        }

        if (!directOk && !jinaMd) {
          return new Response(JSON.stringify({
            error: `Gagal fetch (direct: ${directStatus || directErr || "n/a"}, jina: ${jinaErr || "n/a"}, semua proxy gagal)`,
          }), { status: 200, headers: { "Content-Type": "application/json" } });
        }

        const baseUrl = target;

        const ogTitle = pickMeta(html, [
          /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i,
          /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i,
          /<meta[^>]+name=["']twitter:title["'][^>]+content=["']([^"']+)["']/i,
        ]);
        const htmlTitle = pickMeta(html, [/<title[^>]*>([^<]+)<\/title>/i]);
        const ogDesc = pickMeta(html, [
          /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i,
          /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:description["']/i,
          /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i,
          /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i,
        ]);

        const imgs: string[] = [];
        const ogImgRe = /<meta[^>]+(?:property|name)=["'](?:og:image(?::secure_url)?|twitter:image)["'][^>]+content=["']([^"']+)["']/gi;
        let m: RegExpExecArray | null;
        while ((m = ogImgRe.exec(html))) imgs.push(absolutize(m[1], baseUrl));
        const ogImgRe2 = /<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["'](?:og:image(?::secure_url)?|twitter:image)["']/gi;
        while ((m = ogImgRe2.exec(html))) imgs.push(absolutize(m[1], baseUrl));

        // JSON-LD product
        const acc = { title: "", description: "", images: [] as string[] };
        for (const j of extractJsonLd(html)) walkForProduct(j, baseUrl, acc);
        acc.images.forEach((u) => imgs.push(u));

        // Fallback: scan common product image URL patterns (cdn images, tokopedia, shopee, lazada)
        const cdnRe = /https?:\/\/[^\s"'<>()]+?\.(?:jpg|jpeg|png|webp)(?:\?[^"'<>\s]*)?/gi;
        const cdnMatches = html.match(cdnRe) || [];
        for (const u of cdnMatches) {
          if (/(images\.tokopedia|s\d+\.static\-tokopedia|cf\.shopee|susercontent|slatic|lzd|blibli|akamai|cloudinary|imgix|cdn\.|assets\.)/i.test(u)) {
            imgs.push(u);
          }
        }

        // Parse Jina markdown for title/desc/images (fallback + augment)
        let jinaTitle = "", jinaDesc = "", jinaFirstText = "";
        if (jinaMd) {
          const tMatch = jinaMd.match(/^Title:\s*(.+)$/mi);
          if (tMatch) jinaTitle = tMatch[1].trim();
          const dMatch = jinaMd.match(/^Description:\s*(.+)$/mi);
          if (dMatch) jinaDesc = dMatch[1].trim();
          // Markdown image ![alt](url)
          const mdImg = /!\[[^\]]*\]\((https?:\/\/[^\s)]+)\)/g;
          let im: RegExpExecArray | null;
          while ((im = mdImg.exec(jinaMd))) imgs.push(im[1]);
          // Raw urls in jina content
          const rawImg = jinaMd.match(/https?:\/\/[^\s"'<>()]+?\.(?:jpg|jpeg|png|webp)(?:\?[^"'<>\s)]*)?/gi) || [];
          rawImg.forEach((u) => imgs.push(u));
          // Grab plain text body for description fallback
          const bodyStart = jinaMd.indexOf("Markdown Content:");
          if (bodyStart >= 0) {
            jinaFirstText = jinaMd.slice(bodyStart + 17)
              .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
              .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
              .replace(/[#*_>`-]+/g, " ")
              .replace(/\s+/g, " ")
              .trim()
              .slice(0, 600);
          }
        }

        const blockedHtmlTitle = /access\s*denied|forbidden|captcha|robot/i.test(ogTitle || acc.title || htmlTitle || "");
        const finalTitle = decodeEntities((blockedHtmlTitle ? "" : (ogTitle || acc.title || htmlTitle)) || jinaTitle || titleFromUrl(target) || "");
        const finalDesc = decodeEntities(ogDesc || acc.description || jinaDesc || jinaFirstText || "");
        const finalImages = unique(imgs)
          .filter((u) => !/\.svg(\?|$)/i.test(u))
          .filter((u) => !/logo|favicon|icon-|sprite|placeholder|avatar|profile-picture/i.test(u))
          .slice(0, 20);

        return new Response(JSON.stringify({
          url: target,
          title: finalTitle,
          description: finalDesc,
          images: finalImages,
        }), { headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });
      },
    },
  },
});
