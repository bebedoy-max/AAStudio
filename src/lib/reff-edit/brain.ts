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
}): Promise<BlueprintScene[]> {
  const system =
    "You are an AI Creative Director. Turn the Reference DNA into a concrete Edit Blueprint. Respond ONLY as strict JSON.";
  const duration = opts.totalDuration ?? (opts.mode === "video" ? 15 : 1);
  const user =
    `Mode: ${opts.mode}\n` +
    `Reference DNA: ${JSON.stringify(opts.dna)}\n` +
    `Target: ${opts.targetHint || "user's target content"}\n` +
    `Total duration (s): ${duration}\n\n` +
    `Return JSON: { "scenes": [ { "id": string, "name": string, "from": number, "to": number, "apply": string[] } ] }.\n` +
    `For image mode, produce 1-3 scenes describing sequential apply steps (from=0,to=1). For video mode, cover the whole duration with 3-6 scenes. "apply" is a short list of concrete editing directives derived from the DNA.`;
  const text = await callChat(system, user);
  const parsed = safeJson<{ scenes?: BlueprintScene[] }>(text, {});
  const scenes = (parsed.scenes || []).map((s, i) => ({
    id: s.id || `s${i + 1}`,
    name: s.name || `Scene ${i + 1}`,
    from: Number(s.from) || 0,
    to: Number(s.to) || duration,
    apply: Array.isArray(s.apply) ? s.apply : [],
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
  }));
}
