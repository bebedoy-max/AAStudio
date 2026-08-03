// Admin server fns: pantau perangkat Companion (Android GoPay listener) & log event.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type LooseClient = { from: (t: string) => any; rpc: (fn: string, args?: any) => Promise<any> };

async function assertAdmin(context: { supabase: unknown; userId: string }) {
  const db = context.supabase as LooseClient;
  const { data, error } = await db.rpc("has_role", { _user_id: context.userId, _role: "admin" });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden");
}

async function adminDb(): Promise<LooseClient> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as LooseClient;
}

export type CompanionDeviceRow = {
  id: string;
  device_id: string;
  device_name: string | null;
  android_version: string | null;
  active: boolean;
  last_seen_at: string | null;
  created_at: string;
};

export type CompanionEventRow = {
  id: string;
  device_id: string;
  amount: number;
  notification_title: string | null;
  notification_text: string | null;
  received_at: string | null;
  status: string;
  detail: string | null;
  matched_purchase_id: string | null;
  created_at: string;
};

export const listCompanionDevices = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<CompanionDeviceRow[]> => {
    await assertAdmin(context);
    const db = await adminDb();
    const { data } = await db
      .from("companion_devices")
      .select("id, device_id, device_name, android_version, active, last_seen_at, created_at")
      .order("created_at", { ascending: false })
      .limit(100);
    return (data as CompanionDeviceRow[] | null) ?? [];
  });

export const listCompanionEvents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<CompanionEventRow[]> => {
    await assertAdmin(context);
    const db = await adminDb();
    const cols =
      "id, device_id, amount, notification_title, notification_text, received_at, status, detail, matched_purchase_id, created_at";
    const base = () =>
      db.from("companion_events").select(cols).order("created_at", { ascending: false }).limit(50);
    const { data, error } = await base().is("archived_at", null);
    // Kolom arsip belum dibuat (migrasi manual belum dijalankan) → fallback.
    if (error) {
      const { data: all } = await base();
      return (all as CompanionEventRow[] | null) ?? [];
    }
    return (data as CompanionEventRow[] | null) ?? [];
  });

export const setCompanionDeviceActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; active: boolean }) => ({
    id: String(input?.id ?? "").trim(),
    active: Boolean(input?.active),
  }))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    await assertAdmin(context);
    if (!data.id) throw new Error("id wajib");
    const db = await adminDb();
    const { error } = await db
      .from("companion_devices")
      .update({ active: data.active })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Hapus (revoke) perangkat — token-nya jadi tidak berlaku. */
export const deleteCompanionDevice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => ({ id: String(input?.id ?? "").trim() }))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    await assertAdmin(context);
    if (!data.id) throw new Error("id wajib");
    const db = await adminDb();
    const { error } = await db.from("companion_devices").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Tandai semua event aktif sebagai tersimpan (arsip) → tabel di UI dikosongkan. */
export const archiveCompanionEvents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ ok: true; archived: number }> => {
    await assertAdmin(context);
    const db = await adminDb();
    const { data, error } = await db
      .from("companion_events")
      .update({ archived_at: new Date().toISOString() })
      .is("archived_at", null)
      .select("id");
    if (error) throw new Error(error.message);
    return { ok: true, archived: ((data as { id: string }[] | null) ?? []).length };
  });

/** Cari histori transaksi Companion yang tersimpan di database. */
export const searchCompanionEvents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      q?: string | null;
      status?: string | null;
      dateFrom?: string | null;
      dateTo?: string | null;
      scope?: "all" | "archived" | "active";
    }) => ({
      q: String(input?.q ?? "")
        .trim()
        .slice(0, 120),
      status: input?.status ? String(input.status) : null,
      dateFrom: input?.dateFrom ?? null,
      dateTo: input?.dateTo ?? null,
      scope: input?.scope ?? "all",
    }),
  )
  .handler(async ({ data, context }): Promise<CompanionEventRow[]> => {
    await assertAdmin(context);
    const db = await adminDb();
    let q = db
      .from("companion_events")
      .select(
        "id, device_id, amount, notification_title, notification_text, received_at, status, detail, matched_purchase_id, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(500);
    if (data.scope === "archived") q = q.not("archived_at", "is", null);
    if (data.scope === "active") q = q.is("archived_at", null);
    if (data.status) q = q.eq("status", data.status);
    if (data.dateFrom) q = q.gte("created_at", data.dateFrom);
    if (data.dateTo) q = q.lte("created_at", data.dateTo);
    if (data.q) {
      const n = Number(data.q.replace(/[^0-9]/g, ""));
      const like = `%${data.q}%`;
      const parts = [
        `notification_title.ilike.${like}`,
        `notification_text.ilike.${like}`,
        `device_id.ilike.${like}`,
      ];
      if (Number.isFinite(n) && n > 0) parts.push(`amount.eq.${n}`);
      q = q.or(parts.join(","));
    }
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return (rows as CompanionEventRow[] | null) ?? [];
  });
