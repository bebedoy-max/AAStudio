// Admin-only server functions: gabungan data profil + auth (last_sign_in_at)
// + hitung token/API key aktif, plus assign/remove label VIP/VVIP.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type LooseClient = { from: (t: string) => any; rpc: (fn: string, args?: any) => Promise<any> };

async function assertAdmin(context: { supabase: unknown; userId: string }) {
  const db = context.supabase as LooseClient;
  const { data, error } = await db.rpc("has_role", { _user_id: context.userId, _role: "admin" });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden");
}

export type AdminUserStat = {
  id: string;
  last_sign_in_at: string | null;
  tokens_count: number;
  bank_keys_count: number;
  total_active_keys: number;
  tags: ("vip" | "vvip")[];
  is_paid: boolean;
};

/**
 * Kumpulkan info tambahan per user untuk halaman Manajemen User:
 * - last_sign_in_at dari auth.users (butuh service role)
 * - hitung API key aktif (user_tokens + token_bank_keys assigned)
 * - label VIP/VVIP
 */
export const listAdminUserStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AdminUserStat[]> => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as unknown as {
      auth: { admin: { listUsers: (opts: { page: number; perPage: number }) => Promise<any> } };
      from: (t: string) => any;
      rpc: (fn: string) => Promise<any>;
    };

    // 1. Semua user auth (paginated, max 1000 per page).
    const authUsers: { id: string; last_sign_in_at: string | null }[] = [];
    let page = 1;
    for (;;) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
      if (error) throw new Error(error.message);
      const list = (data?.users ?? []) as Array<{ id: string; last_sign_in_at: string | null }>;
      for (const u of list) authUsers.push({ id: u.id, last_sign_in_at: u.last_sign_in_at ?? null });
      if (list.length < 200) break;
      page += 1;
      if (page > 25) break;
    }

    // 2. Token counts (RPC existing).
    const { data: countsRaw } = await admin.rpc("admin_user_token_counts");
    const counts = new Map<string, { t: number; b: number }>();
    for (const row of (countsRaw ?? []) as Array<{ user_id: string; tokens_count: number; bank_keys_count: number }>) {
      counts.set(row.user_id, { t: row.tokens_count ?? 0, b: row.bank_keys_count ?? 0 });
    }

    // 3. Tags.
    const { data: tagsRaw } = await admin.from("user_tags").select("user_id, tag");
    const tagsByUser = new Map<string, ("vip" | "vvip")[]>();
    for (const row of (tagsRaw ?? []) as Array<{ user_id: string; tag: "vip" | "vvip" }>) {
      const arr = tagsByUser.get(row.user_id) ?? [];
      arr.push(row.tag);
      tagsByUser.set(row.user_id, arr);
    }

    // 4. Paid user detection: has any approved purchase + still has an
    //    active (unexpired) route_permission.
    const nowIso = new Date().toISOString();
    const { data: paidPurchases } = await admin
      .from("purchase_requests")
      .select("user_id")
      .eq("status", "approved");
    const paidPurchaseUsers = new Set<string>(
      ((paidPurchases ?? []) as Array<{ user_id: string }>).map((r) => r.user_id).filter(Boolean),
    );
    const { data: activePerms } = await admin
      .from("route_permissions")
      .select("user_id, expires_at")
      .or(`expires_at.is.null,expires_at.gt.${nowIso}`);
    const activePermUsers = new Set<string>(
      ((activePerms ?? []) as Array<{ user_id: string }>).map((r) => r.user_id).filter(Boolean),
    );

    return authUsers.map((u) => {
      const c = counts.get(u.id);
      const t = c?.t ?? 0;
      const b = c?.b ?? 0;
      return {
        id: u.id,
        last_sign_in_at: u.last_sign_in_at,
        tokens_count: t,
        bank_keys_count: b,
        total_active_keys: t + b,
        tags: tagsByUser.get(u.id) ?? [],
        is_paid: paidPurchaseUsers.has(u.id) && activePermUsers.has(u.id),
      };
    });
  });

export const setUserTags = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { userId: string; tags: ("vip" | "vvip")[] }) => {
    if (!data.userId) throw new Error("userId required");
    const valid = new Set(["vip", "vvip"]);
    if (!Array.isArray(data.tags) || data.tags.some((t) => !valid.has(t))) {
      throw new Error("Invalid tags");
    }
    return { userId: data.userId, tags: Array.from(new Set(data.tags)) as ("vip" | "vvip")[] };
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as unknown as { from: (t: string) => any };
    const del = await admin.from("user_tags").delete().eq("user_id", data.userId);
    if (del.error) throw new Error(del.error.message);
    if (data.tags.length > 0) {
      const rows = data.tags.map((tag) => ({
        user_id: data.userId,
        tag,
        assigned_by: context.userId,
      }));
      const ins = await admin.from("user_tags").insert(rows);
      if (ins.error) throw new Error(ins.error.message);
    }
    return { ok: true, tags: data.tags };
  });

/** Baca tag milik user yang sedang login (untuk tampil di halaman Profile). */
export const getMyUserTags = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<("vip" | "vvip")[]> => {
    const db = context.supabase as unknown as { from: (t: string) => any };
    const { data, error } = await db.from("user_tags").select("tag").eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return ((data ?? []) as Array<{ tag: "vip" | "vvip" }>).map((r) => r.tag);
  });