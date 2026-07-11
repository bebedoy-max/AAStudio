// Timeline engine — turn ClipperAnalysis + settings into a Timeline object.
// Pure functions, no side effects. Consumed by render-engine + preview UI.

import type {
  ClipperAnalysis,
  ClipperSettings,
  Timeline,
  TimelineTrack,
  VideoSource,
  HookScore,
} from "./types";

function pickTopHooks(analysis: ClipperAnalysis, want: HookScore["kind"][]): HookScore[] {
  let wanted = analysis.hooks.filter((h) => want.includes(h.kind));
  // Fallback: if Brain returned hooks but none match user's selected kinds,
  // don't give up — take every hook it did return, sorted by score.
  if (wanted.length === 0) wanted = [...analysis.hooks];
  wanted.sort((a, b) => b.score - a.score);
  // Deduplicate overlapping picks (keep highest score)
  const picked: HookScore[] = [];
  for (const h of wanted) {
    if (picked.some((p) => !(p.end <= h.start || p.start >= h.end))) continue;
    picked.push(h);
  }
  return picked;
}

function withinDeadAir(t: number, ranges: Array<[number, number]>): boolean {
  return ranges.some(([s, e]) => t >= s && t <= e);
}

export function buildTimelineForClip(
  source: VideoSource,
  analysis: ClipperAnalysis,
  settings: ClipperSettings,
  hook: HookScore,
): Timeline {
  const target = Math.max(5, settings.clipDurationSec);
  const centre = (hook.start + hook.end) / 2;
  const half = target / 2;
  const rawStart = Math.max(0, centre - half);
  const rawEnd = Math.min(source.durationSec ?? centre + half, rawStart + target);
  const tracks: TimelineTrack[] = [];

  // Cutting: split source range into kept sub-ranges, skipping dead-air & fillers.
  const skip = settings.autoCutting ? [...analysis.deadAir, ...analysis.fillers] : [];
  const kept: Array<[number, number]> = [];
  let cursor = rawStart;
  const sorted = [...skip].filter(([s, e]) => e > rawStart && s < rawEnd).sort((a, b) => a[0] - b[0]);
  for (const [s, e] of sorted) {
    const cs = Math.max(s, rawStart);
    const ce = Math.min(e, rawEnd);
    if (cs > cursor) kept.push([cursor, cs]);
    cursor = Math.max(cursor, ce);
  }
  if (cursor < rawEnd) kept.push([cursor, rawEnd]);

  let outCursor = 0;
  for (let i = 0; i < kept.length; i++) {
    const [s, e] = kept[i];
    const dur = e - s;
    tracks.push({
      kind: "clip",
      start: outCursor,
      end: outCursor + dur,
      sourceId: source.id,
      sourceIn: s,
      sourceOut: e,
    });
    if (i > 0 && settings.transition !== "None") {
      tracks.push({
        kind: "transition",
        start: outCursor - settings.transitionDuration / 2,
        end: outCursor + settings.transitionDuration / 2,
        transitionKind: settings.transition,
      });
    }
    outCursor += dur;
  }
  const totalSec = outCursor || rawEnd - rawStart;

  // Subtitle track from transcript segments intersecting kept ranges
  if (settings.subtitle) {
    let ptr = 0;
    for (const [s, e] of kept) {
      const overlap = analysis.transcript.segments.filter((seg) => seg.end > s && seg.start < e);
      for (const seg of overlap) {
        const ss = Math.max(seg.start, s);
        const ee = Math.min(seg.end, e);
        tracks.push({
          kind: "subtitle",
          start: ptr + (ss - s),
          end: ptr + (ee - s),
          text: seg.text.trim(),
          style: settings.subtitleStyle,
        });
      }
      ptr += e - s;
    }
  }

  // Reframe / auto-crop
  if (settings.autoReframe) {
    tracks.push({
      kind: "reframe",
      start: 0,
      end: totalSec,
      ratio: settings.aspectRatio,
      anchorX: 0.5,
      anchorY: 0.5,
    });
  }

  // Auto zoom every ~6s within kept ranges (skip dead-air points)
  if (settings.autoZoom) {
    for (let t = 0; t < totalSec; t += 6) {
      if (withinDeadAir(t, kept.map(([s, e]) => [s, e]))) continue;
      tracks.push({
        kind: "zoom",
        start: t,
        end: Math.min(t + 1.2, totalSec),
        scale: settings.zoomKind === "punch" ? 1.15 : 1.08,
        anchorX: 0.5,
        anchorY: 0.45,
      });
    }
  }

  // Music
  if (settings.music !== "None") {
    tracks.push({
      kind: "music",
      start: 0,
      end: totalSec,
      preset: settings.music,
      volume: settings.musicVolume,
      duck: settings.musicDuck,
    });
  }

  // SFX at the very start (whoosh-in) if user picked any
  settings.sfx.forEach((sfx, i) => tracks.push({ kind: "sfx", at: 0.1 + i * 0.15, sfx }));

  return { totalSec, aspectRatio: settings.aspectRatio, tracks };
}

export function autoBuildClips(
  sources: VideoSource[],
  analysis: ClipperAnalysis,
  settings: ClipperSettings,
): Array<{ id: string; title: string; start: number; end: number; timeline: Timeline; hook: HookScore }> {
  if (sources.length === 0) return [];
  const primary = sources[0];
  let picks = pickTopHooks(analysis, settings.hookKinds).slice(0, 6);
  // Last-resort fallback: Brain returned zero hooks at all. Don't ship an empty
  // result — slice the source into evenly spaced windows so the user still gets clips.
  if (picks.length === 0) {
    const dur = primary.durationSec ?? 0;
    const clipLen = Math.max(5, settings.clipDurationSec);
    if (dur >= clipLen) {
      const count = Math.min(6, Math.max(1, Math.floor(dur / clipLen)));
      const step = (dur - clipLen) / Math.max(1, count);
      picks = Array.from({ length: count }, (_, i) => {
        const start = Math.min(dur - clipLen, i * step);
        return {
          kind: "best_moment" as HookScore["kind"],
          score: 50,
          start,
          end: start + clipLen,
          reason: "fallback: no hooks returned by Brain",
        };
      });
    }
  }
  if (picks.length === 0) return [];
  return picks.map((hook, i) => {
    const tl = buildTimelineForClip(primary, analysis, settings, hook);
    return {
      id: `clip_${i + 1}_${Math.random().toString(36).slice(2, 7)}`,
      title: `${hook.kind.replace(/_/g, " ")} — ${Math.round(hook.score)}`,
      start: hook.start,
      end: hook.end,
      timeline: tl,
      hook,
    };
  });
}
