// Admin dashboard statistics — angka nyata dari data aplikasi.
// Sumber kebenaran hasil generate adalah tabel `cloud_files` (setiap hasil
// generate & upload diarsipkan ke sana), bukan lagi tebakan dari action log.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type LooseClient = { from: (t: string) => any; rpc: (fn: string, args?: any) => Promise<any> };

async function assertAdmin(context: { supabase: unknown; userId: string }) {
  const db = context.supabase as LooseClient;
  const { data, error } = await db.rpc("has_role", { _user_id: context.userId, _role: "admin" });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden");
}

async function adminDb() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as LooseClient;
}

export type AdminCounts = {
  users: number;
  paidUsers: number;
  onlineUsers: number;
  totalAssets: number;
  totalVideos: number;
  totalImages: number;
  totalUploads: number;
  pendingRequests: number;
  approvedTx: number;
  activityToday: number;
  generateToday: number;
};

export type AdminStats = {
  counts: AdminCounts;
  byMenu: { kind: string; count: number }[];
  series: { day: string; count: number }[];
};

const ONLINE_WINDOW_MS = 2 * 60_000;

// Semua agregasi harian memakai zona Asia/Jakarta (UTC+7) supaya angka kartu
// dashboard identik dengan tampilan Log Aktivitas yang diformat di browser user.
const JKT_OFFSET_MS = 7 * 60 * 60 * 1000;

function jktDayKey(iso: string | number | Date): string {
  const t = new Date(iso).getTime();
  return new Date(t + JKT_OFFSET_MS).toISOString().slice(0, 10);
}

function jktStartOfTodayIso(now = Date.now()): string {
  const shifted = new Date(now + JKT_OFFSET_MS);
  shifted.setUTCHours(0, 0, 0, 0);
  return new Date(shifted.getTime() - JKT_OFFSET_MS).toISOString();
}

async function headCount(db: LooseClient, table: string, build?: (q: any) => any): Promise<number> {
  try {
    let q = db.from(table).select("id", { count: "exact", head: true });
    if (build) q = build(q);
    const { count, error } = await q;
    if (error) return 0;
    return count ?? 0;
  } catch {
    return 0;
  }
}

export const getAdminStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AdminStats> => {
    await assertAdmin(context);
    const db = await adminDb();

    const now = Date.now();
    const since30Iso = jktStartOfTodayIso(now - 29 * 86_400_000);
    const onlineSince = new Date(now - ONLINE_WINDOW_MS).toISOString();
    const startTodayIso = jktStartOfTodayIso(now);

    const isGen = (q: any) => q.eq("origin", "generate");

    const [
      users,
      paidRows,
      onlineRows,
      totalAssets,
      totalVideos,
      totalImages,
      totalUploads,
      pendingRequests,
      approvedTx,
      activityToday,
      generateToday,
      recentGen,
    ] = await Promise.all([
      headCount(db, "profiles"),
      db.from("user_tags").select("user_id").in("tag", ["vip", "vvip"]),
      db.from("user_active_sessions").select("user_id").gte("updated_at", onlineSince),
      headCount(db, "cloud_files"),
      headCount(db, "cloud_files", (q) => isGen(q).eq("kind", "video")),
      headCount(db, "cloud_files", (q) => isGen(q).eq("kind", "image")),
      headCount(db, "cloud_files", (q) => q.eq("origin", "upload")),
      headCount(db, "purchase_requests", (q) => q.eq("status", "pending")),
      headCount(db, "purchase_requests", (q) => q.eq("status", "approved")),
      headCount(db, "user_activity_logs", (q) => q.gte("created_at", startTodayIso)),
      headCount(db, "cloud_files", (q) => isGen(q).gte("created_at", startTodayIso)),
      db
        .from("cloud_files")
        .select("created_at, source, kind")
        .eq("origin", "generate")
        .gte("created_at", since30Iso)
        .order("created_at", { ascending: false })
        .limit(5000),
    ]);

    const paidUsers = new Set(
      ((paidRows?.data ?? []) as { user_id: string }[]).map((r) => r.user_id),
    ).size;
    const onlineUsers = new Set(
      ((onlineRows?.data ?? []) as { user_id: string }[]).map((r) => r.user_id),
    ).size;

    const rows = (recentGen?.data ?? []) as {
      created_at: string;
      source: string | null;
      kind: string;
    }[];

    const { menuFolderName } = await import("@/lib/cloud/drive.server");
    const menuMap = new Map<string, number>();
    for (const r of rows) {
      const label = menuFolderName(r.source);
      menuMap.set(label, (menuMap.get(label) ?? 0) + 1);
    }
    const byMenu = Array.from(menuMap.entries())
      .map(([kind, count]) => ({ kind, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);

    const buckets = new Map<string, number>();
    for (let i = 0; i < 30; i++) {
      buckets.set(jktDayKey(now - (29 - i) * 86_400_000), 0);
    }
    for (const r of rows) {
      if (!r.created_at) continue;
      const k = jktDayKey(r.created_at);
      if (buckets.has(k)) buckets.set(k, (buckets.get(k) ?? 0) + 1);
    }

    return {
      counts: {
        users,
        paidUsers,
        onlineUsers,
        totalAssets,
        totalVideos,
        totalImages,
        totalUploads,
        pendingRequests,
        approvedTx,
        activityToday,
        generateToday,
      },
      byMenu,
      series: Array.from(buckets.entries()).map(([day, count]) => ({ day, count })),
    };
  });

export type AdminDetailKey =
  | "users"
  | "onlineUsers"
  | "paidUsers"
  | "totalVideos"
  | "totalImages"
  | "totalAssets"
  | "totalUploads"
  | "pendingRequests"
  | "activityToday"
  | "generateToday";

export type AdminDetailRow = {
  id: string;
  primary: string;
  secondary?: string;
  meta?: string;
  badge?: string;
};

async function profileMap(db: LooseClient, ids: string[]) {
  const map = new Map<string, { email: string | null; display_name: string | null }>();
  if (ids.length === 0) return map;
  const { data } = await db.from("profiles").select("id, email, display_name").in("id", ids);
  for (const p of (data ?? []) as {
    id: string;
    email: string | null;
    display_name: string | null;
  }[]) {
    map.set(p.id, { email: p.email, display_name: p.display_name });
  }
  return map;
}

export const getAdminDetail = createServerFn({ method: "GET" })
  .inputValidator((d: { type: AdminDetailKey }) => d)
  .middleware([requireSupabaseAuth])
  .handler(async ({ context, data }): Promise<AdminDetailRow[]> => {
    await assertAdmin(context);
    const db = await adminDb();
    const type = data.type;
    // Kirim timestamp mentah (ISO) — formatting dilakukan di client agar
    // zona waktunya sama dengan halaman Log Aktivitas.
    const fmt = (t?: string | null) => (t ? new Date(t).toISOString() : "");
    const nameOf = (
      map: Map<string, { email: string | null; display_name: string | null }>,
      uid?: string | null,
    ) => {
      if (!uid) return "system";
      const p = map.get(uid);
      return p?.display_name || p?.email || uid;
    };

    if (type === "users") {
      const { data: d } = await db
        .from("profiles")
        .select("id, email, display_name, created_at")
        .order("created_at", { ascending: false })
        .limit(30);
      return ((d ?? []) as any[]).map((p) => ({
        id: p.id,
        primary: p.display_name || p.email || p.id,
        secondary: p.email ?? "",
        meta: fmt(p.created_at),
      }));
    }

    if (type === "onlineUsers") {
      const cutoff = new Date(Date.now() - ONLINE_WINDOW_MS).toISOString();
      const { data: d } = await db
        .from("user_active_sessions")
        .select("user_id, updated_at")
        .gte("updated_at", cutoff)
        .order("updated_at", { ascending: false })
        .limit(100);
      const rows = (d ?? []) as { user_id: string; updated_at: string }[];
      const ids = Array.from(new Set(rows.map((r) => r.user_id).filter(Boolean)));
      const map = await profileMap(db, ids);
      return ids.map((uid) => {
        const s = rows.find((x) => x.user_id === uid);
        return {
          id: uid,
          primary: nameOf(map, uid),
          secondary: map.get(uid)?.email ?? "",
          meta: fmt(s?.updated_at),
          badge: "online",
        };
      });
    }

    if (type === "paidUsers") {
      const { data: d } = await db
        .from("user_tags")
        .select("user_id, tag, updated_at")
        .in("tag", ["vip", "vvip"])
        .order("updated_at", { ascending: false })
        .limit(100);
      const rows = (d ?? []) as { user_id: string; tag: string; updated_at: string }[];
      const map = await profileMap(db, Array.from(new Set(rows.map((r) => r.user_id))));
      return rows.map((r) => ({
        id: `${r.user_id}-${r.tag}`,
        primary: nameOf(map, r.user_id),
        secondary: map.get(r.user_id)?.email ?? "",
        meta: fmt(r.updated_at),
        badge: r.tag,
      }));
    }

    if (type === "pendingRequests") {
      const { data: d } = await db
        .from("purchase_requests")
        .select("id, user_id, route_key, price_idr, created_at")
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(30);
      const rows = (d ?? []) as any[];
      const map = await profileMap(
        db,
        Array.from(new Set(rows.map((r) => r.user_id).filter(Boolean))),
      );
      return rows.map((r) => ({
        id: r.id,
        primary: r.route_key,
        secondary: nameOf(map, r.user_id),
        meta: fmt(r.created_at),
        badge: "Rp " + (r.price_idr ?? 0).toLocaleString("id-ID"),
      }));
    }

    if (type === "activityToday") {
      const since = jktStartOfTodayIso();
      const { data: d } = await db
        .from("user_activity_logs")
        .select("id, user_id, category, action, created_at")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(50);
      const rows = (d ?? []) as any[];
      const map = await profileMap(
        db,
        Array.from(new Set(rows.map((r) => r.user_id).filter(Boolean))),
      );
      return rows.map((r) => ({
        id: r.id,
        primary: r.action,
        secondary: nameOf(map, r.user_id),
        meta: fmt(r.created_at),
        badge: r.category,
      }));
    }

    // cloud_files-derived details
    let q = db
      .from("cloud_files")
      .select("id, user_id, name, kind, origin, source, created_at")
      .order("created_at", { ascending: false })
      .limit(30);
    if (type === "totalVideos") q = q.eq("origin", "generate").eq("kind", "video");
    else if (type === "totalImages") q = q.eq("origin", "generate").eq("kind", "image");
    else if (type === "totalUploads") q = q.eq("origin", "upload");
    else if (type === "generateToday") {
      q = q.eq("origin", "generate").gte("created_at", jktStartOfTodayIso());
    }
    const { data: d } = await q;
    const rows = (d ?? []) as any[];
    const map = await profileMap(
      db,
      Array.from(new Set(rows.map((r) => r.user_id).filter(Boolean))),
    );
    const { menuFolderName } = await import("@/lib/cloud/drive.server");
    return rows.map((r) => ({
      id: r.id,
      primary: r.name,
      secondary: `${nameOf(map, r.user_id)} · ${menuFolderName(r.source)}`,
      meta: fmt(r.created_at),
      badge: r.kind,
    }));
  });
