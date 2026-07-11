// AI Brain untuk AI Influencer — reuse backend router /api/router/chat
// (OpenAI → Gemini fallback). Kembalikan prompt + caption sesuai persona.

import { getCreativeKeys, headersFor } from "@/lib/creative/keys";
import { PERSONALITY_DIMS, type PersonalitySliders } from "./scenes";
import type { Character } from "./service";

export type BrainScenarioResult = {
  prompt: string;
  caption: string;
  raw: string;
};

function personalityLine(p: PersonalitySliders): string {
  return PERSONALITY_DIMS.map((d) => `${d.label}:${p[d.key]}`).join(", ");
}

function characterCard(c: Character): string {
  const rows: string[] = [];
  const push = (k: string, v?: string | number | null) => {
    if (v !== null && v !== undefined && String(v).trim() !== "") rows.push(`- ${k}: ${v}`);
  };
  push("Name", c.name);
  push("Gender", c.gender);
  push("Age", c.age ?? undefined);
  push("Nationality", c.nationality);
  push("Language", c.language);
  push("Occupation", c.occupation);
  push("Niche", c.niche);
  push("Style", c.style);
  push("Personality", c.personality_text);
  push("Background", c.background_story);
  push("Hobby", c.hobby);
  push("Fashion Style", c.fashion_style);
  push("Hair", c.hair_style);
  push("Body", c.body_type);
  push("Voice", c.voice);
  push("Fav Color", c.favorite_color);
  push("Description", c.description);
  return rows.join("\n");
}

export async function generateScenario(
  character: Character,
  personality: PersonalitySliders,
  scene: string,
  memory: { scene_key: string; count: number }[],
  extra?: string,
): Promise<BrainScenarioResult> {
  const memoryLine = memory.length
    ? memory.map((m) => `${m.scene_key}(${m.count}x)`).join(", ")
    : "belum ada history";

  const system = [
    "You are the AI brain for an AI Influencer studio.",
    "You craft SCENE-SPECIFIC prompt + caption for a virtual persona.",
    "Rules:",
    "- Never clone real people from reference URLs; treat references only as style guidance.",
    "- Return STRICT JSON: {\"prompt\": string, \"caption\": string}. No markdown, no prose.",
    "- Prompt is for an image/video generator: describe subject, wardrobe, setting, lighting, camera, mood.",
    "- Caption is social-ready, uses the persona's language, matches personality sliders, includes 3-5 hashtags at the end.",
  ].join("\n");

  const user = [
    "## Character",
    characterCard(character),
    "",
    "## Personality sliders (0-100)",
    personalityLine(personality),
    "",
    "## Scene",
    scene,
    "",
    "## Memory (scenes already produced, avoid repeating same angle)",
    memoryLine,
    extra ? `\n## Extra direction\n${extra}` : "",
    "",
    "Return JSON only.",
  ].join("\n");

  const keys = getCreativeKeys();
  const res = await fetch("/api/router/chat", {
    method: "POST",
    headers: headersFor(keys),
    body: JSON.stringify({ system, user, json: true, temperature: 0.8 }),
  });
  const data = (await res.json()) as { text?: string; error?: string };
  if (!res.ok) throw new Error(data.error || "AI brain gagal");
  const raw = data.text || "";
  try {
    const parsed = JSON.parse(raw) as { prompt?: string; caption?: string };
    return {
      prompt: parsed.prompt || "",
      caption: parsed.caption || "",
      raw,
    };
  } catch {
    return { prompt: raw, caption: "", raw };
  }
}

export async function generateStrategy(
  character: Character,
  personality: PersonalitySliders,
  goals: string[],
): Promise<string> {
  const system = "You produce weekly social content strategy in Bahasa Indonesia. Output markdown.";
  const user = [
    "## Character",
    characterCard(character),
    "",
    "## Personality",
    personalityLine(personality),
    "",
    "## Goals",
    goals.join(", ") || "lifestyle",
    "",
    "Susun rencana konten 7 hari (Senin-Minggu) dengan format:\n- Hari: tipe konten - ide singkat - target audience.",
    "Selipkan komposisi (mis. 70% lifestyle / 20% affiliate / 10% edukasi) sesuai goals.",
  ].join("\n");

  const keys = getCreativeKeys();
  const res = await fetch("/api/router/chat", {
    method: "POST",
    headers: headersFor(keys),
    body: JSON.stringify({ system, user, temperature: 0.7 }),
  });
  const data = (await res.json()) as { text?: string; error?: string };
  if (!res.ok) throw new Error(data.error || "AI brain gagal");
  return data.text || "";
}
