// Reff EDIT brain client — reuses /api/router/chat with user AI keys.

import { getCreativeKeys, headersFor } from "@/lib/creative/keys";
import type { BlueprintScene, ReferenceDNA } from "./store";

async function callChat(system: string, user: string): Promise<string> {
  const headers = headersFor(getCreativeKeys());
  const res = await fetch("/api/router/chat", {
    method: "POST",
    headers,
    body: JSON.stringify({ system, user, json: true, temperature: 0.4 }),
  });
  const data = (await res.json().catch(() => ({}))) as {
    text?: string;
    error?: string;
  };
  if (!res.ok || !data.text) {
    throw new Error(data.error || `AI router error ${res.status}`);
  }
  return data.text;
}

function safeJson<T>(text: string, fallback: T): T {
  try {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    const slice = start >= 0 && end > start ? text.slice(start, end + 1) : text;
    return JSON.parse(slice) as T;
  } catch {
    return fallback;
  }
}

export async function analyzeReferenceDNA(opts: {
  mode: "image" | "video";
  descriptions: string[]; // short text description per reference (name+role+weight+url)
}): Promise<ReferenceDNA> {
  const system =
    "You are an elite AI Creative Director. Extract a compact 'Reference DNA' from the described visual references. Respond ONLY as strict JSON.";
  const schemaHint =
    opts.mode === "image"
      ? "Keys: visualStyle, colorPalette, lighting, cameraAngle, lens, composition, background, mood, texture."
      : "Keys: visualStyle, colorPalette, lighting, cameraMovement, cameraAngle, motionStyle, editingRhythm, cutTiming, transition, speedRamp, colorGrading, cinematicStyle, mood, audioRhythm.";
  const user =
    `Mode: ${opts.mode}\n` +
    `References:\n- ${opts.descriptions.join("\n- ")}\n\n` +
    `Return a single JSON object. ${schemaHint} Values must be short phrases (max ~12 words). No prose outside JSON.`;
  const text = await callChat(system, user);
  const dna = safeJson<ReferenceDNA>(text, { raw: text });
  dna.raw = text;
  return dna;
}

export async function generateBlueprint(opts: {
  mode: "image" | "video";
  dna: ReferenceDNA;
  targetHint?: string;
  totalDuration?: number;
  targets?: { name: string; durationSec: number }[];
}): Promise<BlueprintScene[]> {
  const system =
    "You are an elite AI Creative Director / video editor. Turn the Reference DNA into a concrete, CINEMATIC Edit Blueprint that matches the reference in feel — not just color grading. You must think in cuts, pacing, motion, and transitions like a professional editor. Respond ONLY as strict JSON.";
  const duration = opts.totalDuration ?? (opts.mode === "video" ? 15 : 1);
  const videoVocab =
    `You MUST vary editing techniques across scenes. Draw from this vocabulary (use the EXACT keywords so the render engine can parse them):\n` +
    `- SPEED: "slow motion" (0.5x), "speed ramp up", "speed ramp down", "hyperlapse" (2x), "freeze frame", "hold frame"\n` +
    `- DIRECTION: "reverse playback", "backward", "boomerang" (forward+reverse)\n` +
    `- CAMERA MOVE: "zoom in", "zoom out", "push in", "pull back", "whip pan", "handheld shake", "static locked"\n` +
    `- CUT STYLE: "hard cut", "j-cut", "match cut", "jump cut", "flash cut"\n` +
    `- TRANSITION OUT: "cross dissolve", "fade to black", "whip transition", "wipe left", "glitch transition", "hard cut" (default)\n` +
    `- FX: "rgb split", "chromatic aberration", "vignette", "film grain", "light leak", "lens flare", "motion blur"\n` +
    `- COLOR: use DNA colorGrading verbatim (teal & orange, warm golden, cool moody, noir, vintage film, neon cyberpunk, pastel dreamy, vibrant punchy, desaturated muted)\n`;
  const sourcesBlock =
    opts.targets && opts.targets.length
      ? `\nAvailable TARGET SOURCES (index → duration):\n` +
        opts.targets
          .map((t, i) => `  [${i}] "${t.name}" (${t.durationSec.toFixed(1)}s)`)
          .join("\n") +
        `\nPick the STRONGEST moments (hooks, action beats, expressive faces, key gestures, punch-ins) from ACROSS the sources. Distribute scenes among sources so most sources contribute at least one clip. Each scene MUST include "sourceIdx": <index>. "from"/"to" are timestamps IN THAT specific source.\n`
      : "";
  const user =
    `Mode: ${opts.mode}\n` +
    `Reference DNA: ${JSON.stringify(opts.dna)}\n` +
    `Target: ${opts.targetHint || "user's target content"}\n` +
    `Total duration (s): ${duration}\n\n` +
    sourcesBlock +
    (opts.mode === "video" ? videoVocab + "\n" : "") +
    `Return JSON: { "scenes": [ { "id": string, "name": string, "sourceIdx": number, "from": number, "to": number, "apply": string[] } ] }.\n` +
    (opts.mode === "image"
      ? `For image mode, produce 1-3 scenes describing sequential apply steps (from=0,to=1). "apply" is a short list of concrete style/lighting/color directives derived from the DNA.`
      : `For video mode: produce 4-10 scenes with VARIED lengths (mix punchy 0.4-1.2s beats with 2-4s dramatic holds). "from"/"to" are timestamps within the source referenced by "sourceIdx". DO NOT walk linearly — pick the strongest moments and REORDER them for rhythm. Each scene's "apply" MUST contain 3-6 items combining: one COLOR directive, one CAMERA MOVE or SPEED directive, optionally one FX, and one TRANSITION OUT keyword.`);
  const text = await callChat(system, user);
  const parsed = safeJson<{ scenes?: BlueprintScene[] }>(text, {});
  const scenes = (parsed.scenes || []).map((s, i) => ({
    id: s.id || `s${i + 1}`,
    name: s.name || `Scene ${i + 1}`,
    from: Number(s.from) || 0,
    to: Number(s.to) || duration,
    apply: Array.isArray(s.apply) ? s.apply : [],
    sourceIdx: Number.isFinite(Number(s.sourceIdx)) ? Number(s.sourceIdx) : 0,
  }));
  return scenes;
}

export async function adjustBlueprint(opts: {
  dna: ReferenceDNA;
  blueprint: BlueprintScene[];
  revision: string;
}): Promise<BlueprintScene[]> {
  const system =
    "You are the AI Creative Director revising an Edit Blueprint per the user's instruction. Respond ONLY as strict JSON.";
  const user =
    `Reference DNA: ${JSON.stringify(opts.dna)}\n` +
    `Current blueprint: ${JSON.stringify(opts.blueprint)}\n` +
    `User revision: ${opts.revision}\n\n` +
    `Return JSON: { "scenes": [...] } with the same shape.`;
  const text = await callChat(system, user);
  const parsed = safeJson<{ scenes?: BlueprintScene[] }>(text, {});
  return (parsed.scenes || opts.blueprint).map((s, i) => ({
    id: s.id || `s${i + 1}`,
    name: s.name || `Scene ${i + 1}`,
    from: Number(s.from) || 0,
    to: Number(s.to) || 0,
    apply: Array.isArray(s.apply) ? s.apply : [],
    sourceIdx: Number.isFinite(Number(s.sourceIdx)) ? Number(s.sourceIdx) : 0,
  }));
}
