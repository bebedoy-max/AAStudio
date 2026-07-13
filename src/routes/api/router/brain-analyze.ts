import { createFileRoute } from "@tanstack/react-router";
import { routeChat } from "./chat";

// Real progress pipeline untuk analisa Brain.
// - Streaming SSE (text/event-stream).
// - Step: init → fetch_refs → scrape_social (per link) → extract_persona → extract_memory → done.
// - Kalau x-user-openai-keys / x-user-gemini-keys ada, extract_persona memanggil
//   AI router secara langsung (tanpa HTTP loopback yang dapat gagal di server runtime).

type Body = {
  characterId?: string;
  socialLinks?: string[];
  references?: string[];
  name?: string | null;
  niche?: string | null;
};

type Step =
  | { step: string; status: "start" | "running" | "done" | "error"; label: string; progress: number; detail?: string | null };

function sseEvent(data: unknown): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

function parseKeys(header: string): string[] {
  return header
    .split(/[\n,]/g)
    .map((key) => key.trim())
    .filter(Boolean);
}

// Model kadang balikin JSON dibungkus ```json ... ``` atau ada trailing comma
// / control character. Parser bawaan langsung meledak. Bersihkan dulu.
function extractJson(raw: string): Record<string, string> {
  let s = (raw || "")
    .replace(/```json\s*/gi, "")
    .replace(/```\s*/g, "")
    .trim();
  const start = s.search(/[\{\[]/);
  const end = s.lastIndexOf(s[start] === "[" ? "]" : "}");
  if (start === -1 || end === -1) {
    const sample = (raw || "").trim().slice(0, 160).replace(/\s+/g, " ");
    throw new Error(
      sample ? `AI tidak mengembalikan JSON. Cuplikan: "${sample}"` : "AI mengembalikan respon kosong",
    );
  }
  s = s.substring(start, end + 1);
  try {
    return JSON.parse(s);
  } catch {
    const repaired = s
      .replace(/,\s*}/g, "}")
      .replace(/,\s*]/g, "]")
      // escape unescaped newlines inside string values
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
      .replace(/(?<="(?:[^"\\]|\\.)*)\n/g, "\\n");
    return JSON.parse(repaired);
  }
}

// Panggil routeChat + parse JSON. Retry sekali dengan instruksi lebih tegas
// kalau model balikin teks non-JSON (kadang model narasi meski sudah diminta JSON).
async function callJsonAI(
  openaiKeys: string[],
  geminiKeys: string[],
  system: string,
  user: string,
): Promise<{ data: Record<string, string>; provider: "openai" | "gemini" }> {
  const attempts: Array<{ sys: string; usr: string }> = [
    { sys: system, usr: user },
    {
      sys:
        system +
        " PENTING: OUTPUT WAJIB VALID JSON, mulai dengan '{' dan diakhiri '}'. Tidak ada prosa, tidak ada markdown, tidak ada penjelasan.",
      usr: user + "\n\nBalas HANYA satu objek JSON valid.",
    },
  ];
  let lastErr = "";
  for (const { sys, usr } of attempts) {
    const result = await routeChat({
      openaiKeys,
      geminiKeys,
      system: sys,
      user: usr,
      json: true,
      temperature: 0.4,
    });
    if (!result.ok) {
      lastErr = result.error;
      continue;
    }
    try {
      return { data: extractJson(result.text || ""), provider: result.provider };
    } catch (e) {
      lastErr = (e as Error).message;
    }
  }
  throw new Error(lastErr || "AI response invalid");
}

async function fetchTitle(url: string, signal: AbortSignal): Promise<string> {
  try {
    const res = await fetch(url, {
      signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
      },
    });
    if (!res.ok) return "";
    const html = (await res.text()).slice(0, 30000);
    const m =
      html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i) ||
      html.match(/<meta[^>]+name=["']twitter:title["'][^>]+content=["']([^"']+)["']/i) ||
      html.match(/<title>([^<]+)<\/title>/i);
    return (m?.[1] || "").trim();
  } catch {
    return "";
  }
}

async function fetchDesc(url: string, signal: AbortSignal): Promise<string> {
  try {
    const res = await fetch(url, { signal });
    if (!res.ok) return "";
    const html = (await res.text()).slice(0, 30000);
    const m =
      html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i) ||
      html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i);
    return (m?.[1] || "").trim();
  } catch {
    return "";
  }
}

function guessPlatform(url: string): string {
  try {
    const h = new URL(url).hostname.replace(/^www\./, "");
    if (h.includes("instagram")) return "Instagram";
    if (h.includes("tiktok")) return "TikTok";
    if (h.includes("youtube") || h.includes("youtu.be")) return "YouTube";
    if (h.includes("facebook")) return "Facebook";
    if (h.includes("threads")) return "Threads";
    if (h.includes("x.com") || h.includes("twitter")) return "X";
    if (h.includes("pinterest")) return "Pinterest";
    return h;
  } catch {
    return "web";
  }
}

// TikTok-specific scraper. Profile URL default (fetchTitle) hanya balik
// "TikTok - Make Your Day" karena TikTok serve shell HTML tanpa OG untuk
// browser desktop biasa. Kita coba 2 jalur:
//   1) Mobile UA + parse <script id="__UNIVERSAL_DATA_FOR_REHYDRATION__">
//      → ambil user.nickname + user.signature (bio) + stats.
//   2) Fallback oEmbed (https://www.tiktok.com/oembed?url=...) — hanya
//      bekerja untuk URL video, bukan profile, tapi ikut dicoba.
async function scrapeTikTok(
  url: string,
  signal: AbortSignal,
): Promise<{ title: string; desc: string }> {
  const MOBILE_UA =
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1";
  try {
    const res = await fetch(url, {
      signal,
      redirect: "follow",
      headers: {
        "User-Agent": MOBILE_UA,
        "Accept-Language": "id-ID,id;q=0.9,en;q=0.8",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      },
    });
    if (res.ok) {
      const html = await res.text();
      const m = html.match(
        /<script[^>]+id=["']__UNIVERSAL_DATA_FOR_REHYDRATION__["'][^>]*>([\s\S]*?)<\/script>/,
      );
      if (m?.[1]) {
        try {
          const data = JSON.parse(m[1]);
          const scope = data?.__DEFAULT_SCOPE__ || {};
          const userDetail = scope["webapp.user-detail"]?.userInfo;
          if (userDetail?.user) {
            const u = userDetail.user;
            const s = userDetail.stats || {};
            const nick = u.nickname || u.uniqueId || "";
            const bio = u.signature || "";
            const followers = s.followerCount ? `${s.followerCount} followers` : "";
            const hearts = s.heartCount ? `${s.heartCount} likes` : "";
            return {
              title: nick ? `${nick} (@${u.uniqueId})` : "",
              desc: [bio, followers, hearts].filter(Boolean).join(" · "),
            };
          }
          const videoDetail = scope["webapp.video-detail"]?.itemInfo?.itemStruct;
          if (videoDetail) {
            return {
              title: videoDetail.author?.nickname || "",
              desc: videoDetail.desc || "",
            };
          }
        } catch {
          // fall through
        }
      }
      // Try OG meta as secondary (mobile UA sometimes serves OG)
      const og =
        html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)?.[1] || "";
      const ogd =
        html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i)?.[1] || "";
      const usable = /Make Your Day/i.test(og) ? "" : og;
      if (usable || ogd) return { title: usable, desc: ogd };
    }
  } catch {
    // ignore, try oembed
  }
  try {
    const oe = await fetch(
      `https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`,
      { signal, headers: { "User-Agent": MOBILE_UA } },
    );
    if (oe.ok) {
      const j = (await oe.json()) as { title?: string; author_name?: string };
      if (j.title || j.author_name) {
        return {
          title: j.author_name ? `${j.author_name}` : "",
          desc: j.title || "",
        };
      }
    }
  } catch {
    // ignore
  }
  return { title: "", desc: "" };
}

export const Route = createFileRoute("/api/router/brain-analyze")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: Body = {};
        try {
          body = (await request.json()) as Body;
        } catch {
          return new Response("Invalid JSON", { status: 400 });
        }
        const socialLinks = (body.socialLinks ?? []).filter((s) => /^https?:\/\//.test(s));
        const references = body.references ?? [];

        const geminiKeys = (request.headers.get("x-user-gemini-keys") || "").trim();
        const openaiKeys = (request.headers.get("x-user-openai-keys") || "").trim();
        const hasBrainKey = Boolean(geminiKeys || openaiKeys);

        const encoder = new TextEncoder();
        const stream = new ReadableStream({
          async start(controller) {
            const ac = new AbortController();
            const send = (s: Step) => controller.enqueue(encoder.encode(sseEvent(s)));
            const timeout = setTimeout(() => ac.abort(), 45000);
            try {
              send({ step: "init", status: "done", label: "Persiapan pipeline", progress: 5 });

              // Guard: tanpa Brain API key (Gemini/OpenAI) pipeline TIDAK BOLEH
              // menghasilkan persona/memory palsu. Hentikan segera dengan pesan jelas.
              if (!hasBrainKey) {
                send({
                  step: "auth",
                  status: "error",
                  label: "Brain API key kosong",
                  progress: 5,
                  detail:
                    "Tambahkan Gemini atau OpenAI key di menu Manage → Tokens dulu. Tanpa key, brain tidak bisa menganalisa apa pun (tidak ada hasil random).",
                });
                return;
              }

              // Step 1: fetch_refs (count)
              send({
                step: "fetch_refs",
                status: "running",
                label: `Mendaftarkan ${references.length} reference image`,
                progress: 10,
              });
              await new Promise((r) => setTimeout(r, 300));
              send({
                step: "fetch_refs",
                status: "done",
                label: `${references.length} URL reference siap`,
                progress: 20,
              });

              // Step 2: scrape_social per link
              const scraped: { url: string; platform: string; title: string; desc: string }[] = [];
              if (socialLinks.length === 0) {
                send({
                  step: "scrape_social",
                  status: "done",
                  label: "Tidak ada link sosmed — lewati",
                  progress: 45,
                });
              } else {
                for (let i = 0; i < socialLinks.length; i++) {
                  const url = socialLinks[i];
                  const platform = guessPlatform(url);
                  const base = 20;
                  const span = 35;
                  const p = base + Math.round((span * (i + 0.2)) / socialLinks.length);
                  send({
                    step: "scrape_social",
                    status: "running",
                    label: `Scraping ${platform}`,
                    progress: p,
                    detail: url,
                  });
                  let title = "";
                  let desc = "";
                  if (platform === "TikTok") {
                    const t = await scrapeTikTok(url, ac.signal);
                    title = t.title;
                    desc = t.desc;
                  } else {
                    const [tt, dd] = await Promise.all([
                      fetchTitle(url, ac.signal),
                      fetchDesc(url, ac.signal),
                    ]);
                    title = tt;
                    desc = dd;
                  }
                  scraped.push({ url, platform, title, desc });
                  const usableTitle = title;
                  send({
                    step: "scrape_social",
                    status: usableTitle || desc ? "done" : "error",
                    label: usableTitle
                      ? `${platform}: "${usableTitle.slice(0, 60)}"`
                      : `${platform}: profil membatasi metadata publik`,
                    progress: base + Math.round((span * (i + 1)) / socialLinks.length),
                    detail: url,
                  });
                }
              }

              // Step 3: extract_persona — panggil AI router langsung. Melakukan
              // fetch ke origin sendiri dari server runtime menyebabkan `fetch failed`.
              send({
                step: "extract_persona",
                status: "running",
                label: "AI menganalisa persona dari referensi",
                progress: 60,
              });
              const sysPersona =
                "Anda adalah analis brand influencer. Kembalikan JSON persis dengan key: " +
                "Personality, \"Writing Style\", \"Speaking Style\", \"Visual Style\", " +
                "\"Audience Target\", Tone, \"Brand Identity\". Nilai string singkat 1 kalimat. " +
                "Jawab HANYA JSON, tanpa prosa.";
              const userPersona = JSON.stringify({
                name: body.name, niche: body.niche,
                sources: scraped.map((s) => ({ platform: s.platform, url: s.url, title: s.title, desc: s.desc })),
                reference_image_count: references.length,
              });
              const validOpenaiKeys = parseKeys(openaiKeys).filter((key) => key.startsWith("sk-"));
              const validGeminiKeys = parseKeys(geminiKeys).filter(
                (key) => key.startsWith("AIza") || key.startsWith("AQ."),
              );

              let persona: Record<string, string> = {};
              let aiProvider: "openai" | "gemini" | null = null;
              try {
                const r = await callJsonAI(validOpenaiKeys, validGeminiKeys, sysPersona, userPersona);
                persona = r.data;
                aiProvider = r.provider;
              } catch (err) {
                send({
                  step: "extract_persona", status: "error", progress: 60,
                  label: `Persona gagal: ${(err as Error).message}`,
                });
                return;
              }
              send({
                step: "extract_persona", status: "done", progress: 78,
                label: `Persona ${Object.keys(persona).length} dimensi siap (AI)`,
              });

              // Step 4: extract_memory via AI.
              send({ step: "extract_memory", status: "running", progress: 82, label: "AI menyusun Memory" });
              const sysMem =
                "Kembalikan JSON dengan key: \"Scene yang sudah dibuat\", \"Outfit yang sering dipakai\", " +
                "\"Background favorit\", \"Jam posting terbaik\", \"Caption terbaik\", \"Hook terbaik\", " +
                "\"Prompt terbaik\", \"Affiliate berhasil\", \"Affiliate gagal\". Nilai string singkat. Jawab HANYA JSON.";
              let memory: Record<string, string> = {};
              try {
                const r = await callJsonAI(validOpenaiKeys, validGeminiKeys, sysMem, userPersona);
                memory = r.data;
                aiProvider = r.provider;
              } catch (err) {
                send({
                  step: "extract_memory", status: "error", progress: 82,
                  label: `Memory gagal: ${(err as Error).message}`,
                });
                return;
              }
              send({ step: "extract_memory", status: "done", progress: 92, label: "Memory siap (AI)" });

              // Step 5: return final payload
              send({
                step: "done",
                status: "done",
                label: "Selesai — hasil siap disimpan",
                progress: 100,
                detail: JSON.stringify({
                  persona,
                  memory,
                  learning: {
                    scraped_count: scraped.length,
                    sources: scraped.map((s) => ({ platform: s.platform, url: s.url })),
                    ai_provider: aiProvider,
                  },
                }),
              });
            } catch (e) {
              send({
                step: "error",
                status: "error",
                label: `Pipeline gagal: ${(e as Error).message}`,
                progress: 0,
              });
            } finally {
              clearTimeout(timeout);
              controller.close();
            }
          },
        });

        return new Response(stream, {
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
          },
        });
      },
    },
  },
});
