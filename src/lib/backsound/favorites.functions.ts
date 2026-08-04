// Backsound favorites — tersimpan di cloud per user.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type FavoriteTrack = {
  id: string;
  title: string;
  url: string;
  duration: number;
  mood: string | null;
  created_at: string;
};

type Row = {
  id: string;
  title: string;
  url: string;
  duration: number | null;
  mood: string | null;
  created_at: string;
};

type Db = {
  from: (t: string) => {
    select: (c: string) => {
      eq: (col: string, v: string) => {
        order: (c: string, o: { ascending: boolean }) => Promise<{ data: Row[] | null; error: { message: string } | null }>;
      };
    };
    upsert: (v: Record<string, unknown>, o: { onConflict: string }) => Promise<{ error: { message: string } | null }>;
    delete: () => {
      eq: (c: string, v: string) => { eq: (c: string, v: string) => Promise<{ error: { message: string } | null }> };
    };
  };
};

export const listBacksoundFavorites = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = context.supabase as unknown as Db;
    const { data, error } = await db
      .from("user_backsound_favorites")
      .select("id, title, url, duration, mood, created_at")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []).map<FavoriteTrack>((r) => ({
      id: r.id,
      title: r.title,
      url: r.url,
      duration: Number(r.duration) || 0,
      mood: r.mood,
      created_at: r.created_at,
    }));
  });

export const addBacksoundFavorite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { title: string; url: string; duration?: number; mood?: string }) => {
    const url = String(data.url || "").trim();
    if (!/^https?:\/\//i.test(url)) throw new Error("URL backsound tidak valid");
    if (url.length > 2000) throw new Error("URL terlalu panjang");
    return {
      title: String(data.title || "Untitled").slice(0, 200),
      url,
      duration: Math.max(0, Math.min(3600, Number(data.duration) || 0)),
      mood: (data.mood || "").slice(0, 60) || null,
    };
  })
  .handler(async ({ data, context }) => {
    const db = context.supabase as unknown as Db;
    const { error } = await db.from("user_backsound_favorites").upsert(
      {
        user_id: context.userId,
        title: data.title,
        url: data.url,
        duration: data.duration,
        mood: data.mood,
      },
      { onConflict: "user_id,url" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const removeBacksoundFavorite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { url: string }) => ({ url: String(data.url || "").slice(0, 2000) }))
  .handler(async ({ data, context }) => {
    const db = context.supabase as unknown as Db;
    const { error } = await db
      .from("user_backsound_favorites")
      .delete()
      .eq("user_id", context.userId)
      .eq("url", data.url);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
