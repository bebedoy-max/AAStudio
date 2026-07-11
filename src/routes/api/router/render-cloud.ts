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

async function submitShotstack(key: string, body: CloudRenderBody) {
  const src = body.sources?.[0]?.url;
  if (!src) throw new Error("Source video URL kosong");
  const { width, height } = aspectDim(body.aspectRatio);
  const totalSec = body.timeline?.totalSec ?? 0;
  const output = width === height ? "square" : width > height ? "mp4" : "mp4";
  const clips: Array<Record<string, unknown>> = [
    {
      asset: { type: "video", src },
      start: 0,
      length: totalSec || "auto",
    },
  ];
  if (body.subtitle?.enabled && body.subtitle.srt) {
    clips.push({
      asset: { type: "caption", src, captionSource: "auto" },
      start: 0,
      length: totalSec || "auto",
    });
  }
  const payload = {
    timeline: {
      background: "#000000",
      tracks: [{ clips }],
    },
    output: {
      format: output,
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
  const src = body.sources?.[0]?.url;
  if (!src) throw new Error("Source video URL kosong");
  const { width, height } = aspectDim(body.aspectRatio);
  const elements: Array<Record<string, unknown>> = [
    { type: "video", source: src, fit: "cover" },
  ];
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
