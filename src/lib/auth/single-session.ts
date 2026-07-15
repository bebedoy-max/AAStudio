import { supabase } from "@/integrations/supabase/client";

const SESSION_KEY_PREFIX = "aatools.auth.activeSessionId.";

<<<<<<< HEAD
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
=======
type DbError = { message: string };
type ActiveSessionRow = { session_id: string };
type ActiveSessionTable = {
  upsert: (value: Record<string, unknown>, options: { onConflict: string }) => Promise<{ error: DbError | null }>;
>>>>>>> 2073706dba434f8f26c0f07e02ba87235882b3af
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

function isMissingTable(error: DbError | null) {
  return Boolean(error?.message?.includes("user_active_sessions") && error.message.includes("does not exist"));
}

function createSessionId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

<<<<<<< HEAD
function isFresh(updatedAt: string | null | undefined) {
  if (!updatedAt) return false;
  const ts = new Date(updatedAt).getTime();
  if (Number.isNaN(ts)) return false;
  return Date.now() - ts < INACTIVITY_TIMEOUT_MS;
}

=======
>>>>>>> 2073706dba434f8f26c0f07e02ba87235882b3af
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

<<<<<<< HEAD
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
    console.warn("[auth] failed to read active session", readError.message);
    return "error";
  }

  const localSessionId = localStorage.getItem(storageKey(userId));
  const existingIsMine = existing?.session_id && localSessionId && existing.session_id === localSessionId;

  if (existing && !existingIsMine && isFresh(existing.updated_at)) {
    // Sesi lain masih aktif — jangan ganggu, tolak login di perangkat ini.
    return "blocked";
  }

  const sessionId = existingIsMine ? (localSessionId as string) : createSessionId();
  localStorage.setItem(storageKey(userId), sessionId);

=======
export async function startExclusiveSession(userId: string): Promise<boolean> {
  if (typeof window === "undefined") return true;
  const sessionId = createSessionId();
  localStorage.setItem(storageKey(userId), sessionId);

  // Revoke refresh tokens for other browser/device sessions. Existing access
  // tokens may live briefly, so the app-level row below gives immediate logout.
  const { error: signOutOthersError } = await supabase.auth.signOut({ scope: "others" });
  if (signOutOthersError) console.warn("[auth] sign out other sessions failed", signOutOthersError.message);

>>>>>>> 2073706dba434f8f26c0f07e02ba87235882b3af
  const { error } = await activeSessionsTable().upsert(
    { user_id: userId, session_id: sessionId, updated_at: new Date().toISOString() },
    { onConflict: "user_id" },
  );

  if (error) {
<<<<<<< HEAD
    if (isMissingTable(error)) return "claimed";
    console.warn("[auth] failed to claim active session", error.message);
    return "error";
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
  if (!localSessionId) return false;

  const { data, error } = await activeSessionsTable()
    .select("session_id, updated_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    if (isMissingTable(error)) return true;
    console.warn("[auth] failed to verify active session", error.message);
    return false;
  }

  if (!data?.session_id) return false;
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
=======
    if (isMissingTable(error)) {
      console.warn("[auth] user_active_sessions table is missing; single-session enforcement is disabled.");
      return true;
    }
    console.warn("[auth] failed to claim active session", error.message);
    return false;
  }

  return true;
}

export async function verifyExclusiveSession(userId: string): Promise<boolean> {
  if (typeof window === "undefined") return true;
  const localSessionId = localStorage.getItem(storageKey(userId));
  const { data, error } = await activeSessionsTable().select("session_id").eq("user_id", userId).maybeSingle();

  if (error) {
    if (isMissingTable(error)) {
      console.warn("[auth] user_active_sessions table is missing; single-session enforcement is disabled.");
      return true;
    }
    console.warn("[auth] failed to verify active session", error.message);
    return false;
  }

  if (!data?.session_id) {
    // Existing users may already have a valid login before this feature ships.
    // Claim it once so refreshes on the same browser continue to work.
    return localSessionId ? startExclusiveSession(userId) : startExclusiveSession(userId);
  }

  return Boolean(localSessionId && data?.session_id && localSessionId === data.session_id);
}

export async function endExclusiveSession(userId: string): Promise<void> {
  if (typeof window === "undefined") return;
  clearLocalExclusiveSession(userId);
}
>>>>>>> 2073706dba434f8f26c0f07e02ba87235882b3af
