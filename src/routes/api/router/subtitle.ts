import { createFileRoute } from "@tanstack/react-router";

// Backend Router — Subtitle formatting (server-side text only).
// Body: { segments: [{start, end, text}], format: "srt" | "vtt" }

type Body = {
  segments?: Array<{ start: number; end: number; text: string }>;
  format?: "srt" | "vtt";
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const pad = (n: number, w = 2) => n.toString().padStart(w, "0");
function fmt(sec: number, comma = true) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  const ms = Math.floor((sec - Math.floor(sec)) * 1000);
  return `${pad(h)}:${pad(m)}:${pad(s)}${comma ? "," : "."}${pad(ms, 3)}`;
}

export const Route = createFileRoute("/api/router/subtitle")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = (await request.json()) as Body;
          const segs = body.segments ?? [];
          if (!segs.length) return json({ error: "segments required" }, 400);
          const fmt2 = body.format === "vtt" ? "vtt" : "srt";
          if (fmt2 === "srt") {
            const text = segs
              .map((s, i) => `${i + 1}\n${fmt(s.start)} --> ${fmt(s.end)}\n${s.text.trim()}\n`)
              .join("\n");
            return json({ ok: true, format: "srt", text });
          }
          const text =
            "WEBVTT\n\n" +
            segs.map((s) => `${fmt(s.start, false)} --> ${fmt(s.end, false)}\n${s.text.trim()}\n`).join("\n");
          return json({ ok: true, format: "vtt", text });
        } catch (e) {
          return json({ error: `subtitle crash: ${(e as Error).message}` }, 500);
        }
      },
    },
  },
});
