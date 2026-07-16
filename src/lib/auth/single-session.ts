import { supabase } from "@/integrations/supabase/client";

const SESSION_KEY_PREFIX = "aatools.auth.activeSessionId.";

// Sesi dianggap "aktif" bila updated_at masih dalam jendela ini.
// Jika tidak ada aktivitas selama durasi ini, sesi lama otomatis kadaluarsa
// dan user boleh login dari perangkat lain.
export const INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000; // 30 menit

export type ClaimResult = "claimed" | "blocked" | "error";

type DbError = { message: string };
type ActiveSessionRow = { session_id: string; updated_at: string | null };
type ActiveSessionTable = {
  upsert: (value: Record<string, unknown>, options: { onConflict: string }) => Promise<{ error: DbError | null }>;
  update: (value: Record<string, unknown>) => {
    eq: (column: string, value: string) => {
      eq: (column: string, value: string) => Promise<{ error: DbError | null }>;
    };
  };
  select: (columns: string) => {
    eq: (column: string, value: string) => {
      maybeSingle: () => Promise<{ data: ActiveSessionRow | null; error: DbError | null }>;
    };
  };
  delete: () => {
    eq: (
      column: string,
      value: string,
    ) => {
      eq: (column: string, value: string) => Promise<{ error: DbError | null }>;
    };
  };
};

function activeSessionsTable(): ActiveSessionTable {
  return (supabase as unknown as { from: (table: string) => ActiveSessionTable }).from("user_active_sessions");
}

function storageKey(userId: string) {
  return `${SESSION_KEY_PREFIX}${userId}`;
}

function isMissingTable(error: (DbError & { code?: string; details?: string }) | null) {
  if (!error) return false;
  const msg = `${error.message ?? ""} ${error.details ?? ""}`.toLowerCase();
  // Cover Postgres ("relation ... does not exist"), PostgREST schema-cache
  // ("could not find the table"), and PostgREST error codes for missing
  // relations (PGRST205) or missing table (42P01).
  if (error.code === "PGRST205" || error.code === "42P01") return true;
  if (msg.includes("user_active_sessions")) {
    if (msg.includes("does not exist")) return true;
    if (msg.includes("could not find the table")) return true;
    if (msg.includes("schema cache")) return true;
  }
  return false;
}

function createSessionId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function isFresh(updatedAt: string | null | undefined) {
  if (!updatedAt) return false;
  const ts = new Date(updatedAt).getTime();
  if (Number.isNaN(ts)) return false;
  return Date.now() - ts < INACTIVITY_TIMEOUT_MS;
}

export function clearLocalExclusiveSession(userId?: string) {
  if (typeof window === "undefined") return;
  if (userId) {
    localStorage.removeItem(storageKey(userId));
    return;
  }
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const key = localStorage.key(i);
    if (key?.startsWith(SESSION_KEY_PREFIX)) localStorage.removeItem(key);
  }
}

/**
 * Klaim slot sesi tunggal untuk user. Jika sudah ada sesi aktif lain yang
 * belum kadaluarsa (aktivitas terakhir < 30 menit), tolak login baru.
 */
export async function claimExclusiveSession(userId: string): Promise<ClaimResult> {
  if (typeof window === "undefined") return "claimed";

  const { data: existing, error: readError } = await activeSessionsTable()
    .select("session_id, updated_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (readError) {
    if (isMissingTable(readError)) {
      console.warn("[auth] user_active_sessions table is missing; single-session enforcement is disabled.");
      return "claimed";
    }
    // Jangan blokir login karena masalah infrastruktur single-session
    // (RLS, network, dsb). Cukup log dan izinkan sesi berjalan.
    console.warn("[auth] failed to read active session, allowing login", readError.message);
    return "claimed";
  }

  const localSessionId = localStorage.getItem(storageKey(userId));
  const existingIsMine = existing?.session_id && localSessionId && existing.session_id === localSessionId;

  if (existing && !existingIsMine && isFresh(existing.updated_at)) {
    // Sesi lain masih aktif — jangan ganggu, tolak login di perangkat ini.
    return "blocked";
  }

  const sessionId = existingIsMine ? (localSessionId as string) : createSessionId();
  localStorage.setItem(storageKey(userId), sessionId);

  const { error } = await activeSessionsTable().upsert(
    { user_id: userId, session_id: sessionId, updated_at: new Date().toISOString() },
    { onConflict: "user_id" },
  );

  if (error) {
    if (isMissingTable(error)) return "claimed";
    console.warn("[auth] failed to claim active session, allowing login", error.message);
    return "claimed";
  }

  return "claimed";
}

/**
 * Verifikasi sesi aktif untuk user. Sekaligus memperbarui heartbeat
 * (updated_at = now) supaya sesi tidak dianggap idle.
 */
export async function verifyExclusiveSession(userId: string): Promise<boolean> {
  if (typeof window === "undefined") return true;
  const localSessionId = localStorage.getItem(storageKey(userId));

  const { data, error } = await activeSessionsTable()
    .select("session_id, updated_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    if (isMissingTable(error)) return true;
    // Fail-open on transient read errors — jangan logout user karena
    // masalah jaringan/RLS sementara.
    console.warn("[auth] failed to verify active session, allowing", error.message);
    return true;
  }

  // Tabel ada tapi belum ada baris untuk user ini (mis. claim gagal senyap
  // atau baris ke-hapus). Jangan langsung logout — anggap sesi ini valid
  // dan biarkan heartbeat berikutnya menulis ulang slot.
  if (!data?.session_id) return true;
  // Kalau localStorage kosong (mis. karena claim awal skip write), adopsi
  // session_id yang ada supaya user tidak ke-logout saat balik ke tab.
  if (!localSessionId) {
    localStorage.setItem(storageKey(userId), data.session_id);
    return true;
  }
  if (data.session_id !== localSessionId) return false;

  // Heartbeat — perbarui updated_at supaya slot tetap milik user ini.
  const { error: hbError } = await activeSessionsTable()
    .update({ updated_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("session_id", localSessionId);
  if (hbError && !isMissingTable(hbError)) {
    console.warn("[auth] heartbeat failed", hbError.message);
  }

  return true;
}

export async function endExclusiveSession(userId: string): Promise<void> {
  if (typeof window === "undefined") return;
  const localSessionId = localStorage.getItem(storageKey(userId));
  clearLocalExclusiveSession(userId);
  if (!localSessionId) return;
  const { error } = await activeSessionsTable().delete().eq("user_id", userId).eq("session_id", localSessionId);
  if (error && !isMissingTable(error)) {
    console.warn("[auth] failed to release active session", error.message);
  }
}

// Backwards-compat: nama lama tetap ada, tapi sekarang mengembalikan boolean
// berdasarkan claim result.
export async function startExclusiveSession(userId: string): Promise<boolean> {
  const result = await claimExclusiveSession(userId);
  return result === "claimed";
}
