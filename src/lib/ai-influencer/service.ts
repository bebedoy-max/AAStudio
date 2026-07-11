// Repository layer untuk modul AI Influencer.
// Semua akses DB dilakukan lewat helper ini agar komponen tetap dumb.

import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { DEFAULT_PERSONALITY, type PersonalitySliders } from "./scenes";

export type Character = Database["public"]["Tables"]["ai_characters"]["Row"];
export type CharacterInsert = Database["public"]["Tables"]["ai_characters"]["Insert"];
export type CharacterUpdate = Database["public"]["Tables"]["ai_characters"]["Update"];
export type Personality = Database["public"]["Tables"]["ai_character_personality"]["Row"];
export type Scenario = Database["public"]["Tables"]["ai_character_scenarios"]["Row"];
export type Asset = Database["public"]["Tables"]["ai_character_assets"]["Row"];
export type Reference = Database["public"]["Tables"]["ai_character_references"]["Row"];
export type MemoryRow = Database["public"]["Tables"]["ai_influencer_memory"]["Row"];

async function requireUserId(): Promise<string> {
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new Error("Belum login");
  return data.user.id;
}

export async function listCharacters(): Promise<Character[]> {
  const { data, error } = await supabase
    .from("ai_characters")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function getCharacter(id: string): Promise<Character | null> {
  const { data, error } = await supabase.from("ai_characters").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data;
}

export async function createCharacter(input: Omit<CharacterInsert, "user_id" | "id">): Promise<Character> {
  const user_id = await requireUserId();
  const { data, error } = await supabase
    .from("ai_characters")
    .insert({ ...input, user_id })
    .select("*")
    .single();
  if (error) throw error;
  // seed personality row
  await supabase
    .from("ai_character_personality")
    .insert({ character_id: data.id, user_id, ...DEFAULT_PERSONALITY });
  return data;
}

export async function updateCharacter(id: string, patch: CharacterUpdate): Promise<void> {
  const { error } = await supabase.from("ai_characters").update(patch).eq("id", id);
  if (error) throw error;
}

export async function deleteCharacter(id: string): Promise<void> {
  const { error } = await supabase.from("ai_characters").delete().eq("id", id);
  if (error) throw error;
}

export async function getPersonality(characterId: string): Promise<PersonalitySliders> {
  const { data } = await supabase
    .from("ai_character_personality")
    .select("*")
    .eq("character_id", characterId)
    .maybeSingle();
  if (!data) return { ...DEFAULT_PERSONALITY };
  const { funny, elegant, luxury, cute, professional, energetic, luxury_lifestyle, minimalist, emotional, luxury_fashion } = data;
  return { funny, elegant, luxury, cute, professional, energetic, luxury_lifestyle, minimalist, emotional, luxury_fashion };
}

export async function savePersonality(characterId: string, values: PersonalitySliders): Promise<void> {
  const user_id = await requireUserId();
  const { error } = await supabase
    .from("ai_character_personality")
    .upsert({ character_id: characterId, user_id, ...values }, { onConflict: "character_id" });
  if (error) throw error;
}

export async function listReferences(characterId: string): Promise<Reference[]> {
  const { data, error } = await supabase
    .from("ai_character_references")
    .select("*")
    .eq("character_id", characterId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function addReference(characterId: string, platform: string, url: string): Promise<void> {
  const user_id = await requireUserId();
  const { error } = await supabase
    .from("ai_character_references")
    .insert({ character_id: characterId, user_id, platform, url });
  if (error) throw error;
}

export async function removeReference(id: string): Promise<void> {
  const { error } = await supabase.from("ai_character_references").delete().eq("id", id);
  if (error) throw error;
}

export async function listScenarios(characterId: string): Promise<Scenario[]> {
  const { data, error } = await supabase
    .from("ai_character_scenarios")
    .select("*")
    .eq("character_id", characterId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function createScenario(
  characterId: string,
  scene: string,
  prompt: string,
  caption: string,
  outputConfig: Record<string, boolean>,
): Promise<Scenario> {
  const user_id = await requireUserId();
  const { data, error } = await supabase
    .from("ai_character_scenarios")
    .insert({
      character_id: characterId,
      user_id,
      scene,
      prompt,
      caption,
      output_config: outputConfig as never,
    })
    .select("*")
    .single();
  if (error) throw error;
  await bumpMemory(characterId, scene);
  await supabase.from("ai_characters").update({ last_generated_at: new Date().toISOString() }).eq("id", characterId);
  return data;
}

export async function deleteScenario(id: string): Promise<void> {
  const { error } = await supabase.from("ai_character_scenarios").delete().eq("id", id);
  if (error) throw error;
}

export async function listAssets(characterId: string): Promise<Asset[]> {
  const { data, error } = await supabase
    .from("ai_character_assets")
    .select("*")
    .eq("character_id", characterId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function countAssets(characterId: string): Promise<number> {
  const { count } = await supabase
    .from("ai_character_assets")
    .select("id", { count: "exact", head: true })
    .eq("character_id", characterId);
  return count ?? 0;
}

export async function saveAsset(
  characterId: string,
  type: string,
  payload: { url?: string; content?: string; scenario_id?: string; metadata?: Record<string, unknown> },
): Promise<void> {
  const user_id = await requireUserId();
  const { error } = await supabase.from("ai_character_assets").insert({
    character_id: characterId,
    user_id,
    type,
    url: payload.url,
    content: payload.content,
    scenario_id: payload.scenario_id,
    metadata: (payload.metadata ?? {}) as never,
  });
  if (error) throw error;
}

export async function listMemory(characterId: string): Promise<MemoryRow[]> {
  const { data, error } = await supabase
    .from("ai_influencer_memory")
    .select("*")
    .eq("character_id", characterId)
    .order("count", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function bumpMemory(characterId: string, sceneKey: string): Promise<void> {
  const user_id = await requireUserId();
  const { data: existing } = await supabase
    .from("ai_influencer_memory")
    .select("id, count")
    .eq("character_id", characterId)
    .eq("scene_key", sceneKey)
    .maybeSingle();
  if (existing) {
    await supabase
      .from("ai_influencer_memory")
      .update({ count: (existing.count ?? 0) + 1, last_used_at: new Date().toISOString() })
      .eq("id", existing.id);
  } else {
    await supabase
      .from("ai_influencer_memory")
      .insert({ character_id: characterId, user_id, scene_key: sceneKey, count: 1, last_used_at: new Date().toISOString() });
  }
}
