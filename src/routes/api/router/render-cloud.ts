import { createFileRoute } from "@tanstack/react-router";

// Cloud Render Router — forwards a render job to Shotstack or Creatomate.
// Keys come from client headers (populated by Token Manager → Render tab):
//   • x-user-shotstack-keys
//   • x-user-creatomate-keys
//
// This route only submits the job and returns { jobId, status }. Client polls
// the provider directly (or a future status endpoint) for the final URL.

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function parseKeys(header: string | null): string[] {
  if (!header) return [];
  return header.split(/[\s,;\n]+/).map((s) => s.trim()).filter(Boolean);
}

type CloudRenderBody = {
  provider?: "shotstack" | "creatomate";
  kind?: "clipper" | "dubbing";
  timeline?: { totalSec?: number; tracks?: unknown[] };
  sources?: { url?: string; name?: string }[];
  subtitle?: { enabled?: boolean; srt?: string };
  audio?: { voiceUrl?: string; music?: string };
  aspectRatio?: string;
  blueprint?: {
    id?: string;
    name?: string;
    from?: number;
    to?: number;
    apply?: string[];
    sourceIdx?: number;
  }[];
  dna?: Record<string, string | undefined>;
};

function aspectDim(ar: string | undefined) {
  switch (ar) {
    case "16:9": return { width: 1920, height: 1080 };
    case "1:1": return { width: 1080, height: 1080 };
    case "4:5": return { width: 1080, height: 1350 };
    case "9:16":
    default: return { width: 1080, height: 1920 };
  }
}

// Map DNA colorGrading / mood keywords → a coarse Shotstack "filter" preset name.
// Shotstack supports: boost, contrast, muted, invert, negative, chrome, mono, sepia,
// crossProcess, hue, blur, greyscale, blueshift, etc. Pick the closest match.
function shotstackFilterFromText(txt: string): string | undefined {
  const t = (txt || "").toLowerCase();
  if (!t) return undefined;
  if (/(teal.*orange|hollywood|cinematic teal)/.test(t)) return "boost";
  if (/(warm|golden|sunset|amber|sunlit)/.test(t)) return "boost";
  if (/(cool|cold|moody|blue)/.test(t)) return "blueshift";
  if (/(noir|monochrome|black.*white|b&w|grayscale)/.test(t)) return "mono";
  if (/(vintage|retro|film|kodak)/.test(t)) return "sepia";
  if (/(pastel|soft|dreamy|hazy)/.test(t)) return "muted";
  if (/(vibrant|punchy|bold|saturated|pop)/.test(t)) return "boost";
  if (/(neon|cyberpunk|night city)/.test(t)) return "contrast";
  if (/(desaturat|muted|faded)/.test(t)) return "muted";
  return "boost";
}

// Detect transition-out keyword → Shotstack transition preset.
function shotstackTransitionFromApply(apply: string[]): string | undefined {
  const t = apply.join(" ").toLowerCase();
  if (t.includes("cross dissolve") || t.includes("dissolve") || t.includes("fade to black") || t.includes("cross fade")) return "fade";
  if (t.includes("wipe left")) return "wipeLeft";
  if (t.includes("wipe right")) return "wipeRight";
  if (t.includes("wipe")) return "wipeLeft";
  if (t.includes("whip")) return "slideLeft";
  if (t.includes("zoom")) return "zoom";
  return undefined;
}

// Detect speed keyword → shotstack clip.speed multiplier.
function shotstackSpeedFromApply(apply: string[]): number {
  const t = apply.join(" ").toLowerCase();
  if (t.includes("slow motion") || t.includes("slowmo")) return 0.5;
  if (t.includes("hyperlapse") || t.includes("2x")) return 2.0;
  if (t.includes("fast cut") || t.includes("1.5x")) return 1.5;
  return 1.0;
}

function buildShotstackClipsFromBlueprint(body: CloudRenderBody): Array<Record<string, unknown>> {
  const sources = body.sources || [];
  const blueprint = body.blueprint || [];
  const dnaText = [
    body.dna?.colorGrading,
    body.dna?.mood,
    body.dna?.cinematicStyle,
    body.dna?.colorPalette,
  ]
    .filter(Boolean)
    .join(" ");
  const clips: Array<Record<string, unknown>> = [];
  let cursor = 0;
  for (const s of blueprint) {
    const idx = Math.max(0, Math.min(sources.length - 1, s.sourceIdx ?? 0));
    const src = sources[idx]?.url;
    if (!src) continue;
    const trim = Math.max(0, Number(s.from) || 0);
    const rawLen = Math.max(0.1, (Number(s.to) || 0) - trim);
    const speed = shotstackSpeedFromApply(s.apply || []);
    const outLen = rawLen / speed;
    const filter = shotstackFilterFromText(`${dnaText} ${(s.apply || []).join(" ")}`);
    const transition = shotstackTransitionFromApply(s.apply || []);
    const clip: Record<string, unknown> = {
      asset: { type: "video", src, trim, volume: 0 },
      start: cursor,
      length: outLen,
      fit: "cover",
    };
    if (filter) clip.filter = filter;
    if (speed !== 1) (clip.asset as Record<string, unknown>).speed = speed;
    if (transition) clip.transition = { in: transition, out: transition };
    clips.push(clip);
    cursor += outLen;
  }
  return clips;
}

async function submitShotstack(key: string, body: CloudRenderBody) {
  const { width, height } = aspectDim(body.aspectRatio);
  let clips: Array<Record<string, unknown>>;
  if (body.blueprint && body.blueprint.length && (body.sources || []).some((s) => s.url)) {
    clips = buildShotstackClipsFromBlueprint(body);
    if (clips.length === 0) throw new Error("Blueprint tidak menghasilkan clip valid (cek sourceIdx/url).");
  } else {
    const src = body.sources?.[0]?.url;
    if (!src) throw new Error("Source video URL kosong");
    const totalSec = body.timeline?.totalSec ?? 0;
    clips = [{ asset: { type: "video", src }, start: 0, length: totalSec || "auto" }];
  }
  if (body.subtitle?.enabled && body.subtitle.srt && body.sources?.[0]?.url) {
    clips.push({
      asset: { type: "caption", src: body.sources[0].url, captionSource: "auto" },
      start: 0,
      length: "auto",
    });
  }
  const payload = {
    timeline: {
      background: "#000000",
      tracks: [{ clips }],
    },
    output: {
      format: "mp4",
      resolution: height >= 1920 ? "1080" : "720",
      aspectRatio: body.aspectRatio || "9:16",
    },
  };
  const r = await fetch("https://api.shotstack.io/edit/stage/render", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": key },
    body: JSON.stringify(payload),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Shotstack ${r.status}: ${JSON.stringify(data).slice(0, 200)}`);
  const id = (data as { response?: { id?: string } })?.response?.id;
  return { jobId: id || `shotstack_${Date.now()}`, raw: data };
}

async function submitCreatomate(key: string, body: CloudRenderBody) {
  const { width, height } = aspectDim(body.aspectRatio);
  const elements: Array<Record<string, unknown>> = [];
  if (body.blueprint && body.blueprint.length && (body.sources || []).some((s) => s.url)) {
    for (const s of body.blueprint) {
      const idx = Math.max(0, Math.min((body.sources || []).length - 1, s.sourceIdx ?? 0));
      const src = body.sources?.[idx]?.url;
      if (!src) continue;
      const trim = Math.max(0, Number(s.from) || 0);
      const rawLen = Math.max(0.1, (Number(s.to) || 0) - trim);
      elements.push({
        type: "video",
        source: src,
        fit: "cover",
        trim_start: trim,
        trim_duration: rawLen,
        volume: 0,
      });
    }
    if (elements.length === 0) throw new Error("Blueprint tidak menghasilkan element valid");
  } else {
    const src = body.sources?.[0]?.url;
    if (!src) throw new Error("Source video URL kosong");
    elements.push({ type: "video", source: src, fit: "cover" });
  }
  const payload = {
    output_format: "mp4",
    width,
    height,
    elements,
  };
  const r = await fetch("https://api.creatomate.com/v1/renders", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ source: payload }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Creatomate ${r.status}: ${JSON.stringify(data).slice(0, 200)}`);
  const arr = Array.isArray(data) ? data : [data];
  const first = arr[0] as { id?: string; url?: string; status?: string };
  return { jobId: first?.id || `creatomate_${Date.now()}`, url: first?.url, status: first?.status, raw: data };
}

export const Route = createFileRoute("/api/router/render-cloud")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = (await request.json().catch(() => ({}))) as CloudRenderBody;
          const provider = body.provider;
          if (provider !== "shotstack" && provider !== "creatomate") {
            return json({ ok: false, message: "provider harus 'shotstack' atau 'creatomate'" }, 400);
          }

          const shotstack = parseKeys(request.headers.get("x-user-shotstack-keys"));
          const creatomate = parseKeys(request.headers.get("x-user-creatomate-keys"));
          const key = provider === "shotstack" ? shotstack[0] : creatomate[0];
          if (!key) {
            return json({
              ok: false,
              provider,
              message: `Key ${provider} belum diisi di Token Manager → Render.`,
            }, 400);
          }

          if (provider === "shotstack") {
            const r = await submitShotstack(key, body);
            return json({
              ok: true, provider, jobId: r.jobId, status: "queued",
              message: `Shotstack render enqueued (${r.jobId}).`,
            });
          }
          const r = await submitCreatomate(key, body);
          return json({
            ok: true, provider, jobId: r.jobId, url: r.url,
            status: (r.status === "succeeded" ? "done" : "queued"),
            message: `Creatomate render ${r.status ?? "queued"} (${r.jobId}).`,
          });
        } catch (e) {
          return json({ ok: false, message: `render-cloud crash: ${(e as Error).message}` }, 500);
        }
      },
    },
  },
});
