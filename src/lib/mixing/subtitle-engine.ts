// Subtitle engine — build SRT / VTT from transcript segments.
import type { Transcript, SubtitleStyle } from "./types";

function pad(n: number, w = 2): string {
  return n.toString().padStart(w, "0");
}

function fmtTime(sec: number, comma = true): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  const ms = Math.floor((sec - Math.floor(sec)) * 1000);
  return `${pad(h)}:${pad(m)}:${pad(s)}${comma ? "," : "."}${pad(ms, 3)}`;
}

export function toSrt(t: Transcript): string {
  return t.segments
    .map(
      (seg, i) =>
        `${i + 1}\n${fmtTime(seg.start)} --> ${fmtTime(seg.end)}\n${seg.text.trim()}\n`,
    )
    .join("\n");
}

export function toVtt(t: Transcript): string {
  const body = t.segments
    .map(
      (seg) =>
        `${fmtTime(seg.start, false)} --> ${fmtTime(seg.end, false)}\n${seg.text.trim()}\n`,
    )
    .join("\n");
  return `WEBVTT\n\n${body}`;
}

export function stylePreview(style: SubtitleStyle): { className: string; style: React.CSSProperties } {
  switch (style) {
    case "Minimal":
      return { className: "text-white", style: { textShadow: "0 1px 2px rgba(0,0,0,.7)" } };
    case "Modern":
      return {
        className: "text-white font-semibold px-3 py-1 rounded-md",
        style: { background: "rgba(0,0,0,.55)" },
      };
    case "TikTok":
      return {
        className: "text-white font-black uppercase px-2 py-1 rounded",
        style: { background: "#000", WebkitTextStroke: "1px black" },
      };
    case "CapCut":
      return {
        className: "font-bold",
        style: { color: "#ffe600", WebkitTextStroke: "2px black", textShadow: "0 0 6px rgba(0,0,0,.8)" },
      };
    case "Cinematic":
      return { className: "text-white font-light tracking-wide italic", style: { letterSpacing: "0.03em" } };
    case "Anime":
      return {
        className: "font-black",
        style: {
          color: "#fff",
          WebkitTextStroke: "3px #d946ef",
          textShadow: "0 0 12px rgba(217,70,239,.6)",
        },
      };
  }
}
