// AI Digital Human Studio — server functions.
// Semua per-user via requireSupabaseAuth (RLS scoped ke auth.uid()).

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Json } from "@/integrations/supabase/types";

// -------------------- BRAIN --------------------

export const loadBrain = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { characterId: string }) => d)
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("ai_influencer_brain")
      .select("persona, memory, learning, updated_at")
      .eq("character_id", data.characterId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return row ?? { persona: {}, memory: {}, learning: {}, updated_at: null };
  });

export const saveBrain = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: {
      characterId: string;
      persona: Record<string, unknown>;
      memory: Record<string, unknown>;
      learning: Record<string, unknown>;
    }) => d,
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("ai_influencer_brain").upsert(
      {
        character_id: data.characterId,
        user_id: context.userId,
        persona: data.persona as Json,
        memory: data.memory as Json,
        learning: data.learning as Json,
      },
      { onConflict: "character_id" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// -------------------- STRATEGY --------------------

export const loadStrategy = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { characterId: string }) => d)
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("ai_influencer_strategy")
      .select("weekly, ratios, goals, updated_at")
      .eq("character_id", data.characterId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return row ?? { weekly: [], ratios: {}, goals: [], updated_at: null };
  });

export const saveStrategy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: {
      characterId: string;
      weekly: unknown[];
      ratios: Record<string, number>;
      goals?: string[];
    }) => d,
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("ai_influencer_strategy").upsert(
      {
        character_id: data.characterId,
        user_id: context.userId,
        weekly: data.weekly as unknown as Json,
        ratios: data.ratios as unknown as Json,
        goals: (data.goals ?? []) as unknown as Json,
      },
      { onConflict: "character_id" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// -------------------- QUEUE --------------------

export const listQueue = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { characterId: string }) => d)
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("ai_influencer_queue")
      .select("*")
      .eq("character_id", data.characterId)
      .order("scheduled_for", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

type QueueItemInput = {
  day_label?: string | null;
  slot_time?: string | null;
  platform?: string | null;
  idea: string;
  caption?: string | null;
  hashtag?: string | null;
  thumbnail_url?: string | null;
  status?: string;
  payload?: Record<string, unknown>;
  scheduled_for?: string | null;
};

export const saveQueueBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { characterId: string; items: QueueItemInput[] }) => d)
  .handler(async ({ data, context }) => {
    if (!data.items.length) return { ok: true, inserted: 0 };
    const rows = data.items.map((it) => ({
      ...it,
      character_id: data.characterId,
      user_id: context.userId,
      status: it.status ?? "waiting",
      payload: (it.payload ?? {}) as Json,
    }));
    const { error } = await context.supabase.from("ai_influencer_queue").insert(rows);
    if (error) throw new Error(error.message);
    return { ok: true, inserted: rows.length };
  });

export const updateQueueItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: { id: string; patch: Partial<QueueItemInput> & { status?: string } }) => d,
  )
  .handler(async ({ data, context }) => {
    const patch = { ...data.patch, payload: data.patch.payload as Json | undefined };
    const { error } = await context.supabase
      .from("ai_influencer_queue")
      .update(patch)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteQueueItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("ai_influencer_queue")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// -------------------- ASSETS --------------------

export const listAssets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { characterId: string; kind?: string | null }) => d)
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("ai_influencer_assets")
      .select("*")
      .eq("character_id", data.characterId)
      .order("created_at", { ascending: false })
      .limit(200);
    if (data.kind && data.kind !== "all") q = q.eq("kind", data.kind);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const insertAsset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: {
      characterId: string;
      kind: string;
      url?: string | null;
      content?: string | null;
      meta?: Record<string, unknown>;
      source?: string;
    }) => d,
  )
  .handler(async ({ data, context }) => {
    const { error, data: row } = await context.supabase
      .from("ai_influencer_assets")
      .insert({
        character_id: data.characterId,
        user_id: context.userId,
        kind: data.kind,
        url: data.url ?? null,
        content: data.content ?? null,
        meta: (data.meta ?? {}) as Json,
        source: data.source ?? "manual",
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const deleteAsset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("ai_influencer_assets")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// -------------------- PUBLISHER ACCOUNTS --------------------

export const listPublisherAccounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("ai_influencer_publisher_accounts")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const connectPublisherAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: {
      platform: string;
      handle: string;
      webhook_url?: string | null;
      access_token?: string | null;
      characterId?: string | null;
    }) => d,
  )
  .handler(async ({ data, context }) => {
    const { error, data: row } = await context.supabase
      .from("ai_influencer_publisher_accounts")
      .upsert(
        {
          user_id: context.userId,
          character_id: data.characterId ?? null,
          platform: data.platform,
          handle: data.handle,
          webhook_url: data.webhook_url ?? null,
          access_token: data.access_token ?? null,
          status: "connected",
        },
        { onConflict: "user_id,platform,handle" },
      )
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const disconnectPublisherAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("ai_influencer_publisher_accounts")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
