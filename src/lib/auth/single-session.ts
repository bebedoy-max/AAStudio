import { supabase } from "@/integrations/supabase/client";

const SESSION_KEY_PREFIX = "aatools.auth.activeSessionId.";

type DbError = { message: string };
type ActiveSessionRow = { session_id: string };
type ActiveSessionTable = {
  upsert: (value: Record<string, unknown>, options: { onConflict: string }) => Promise<{ error: DbError | null }>;
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

export async function startExclusiveSession(userId: string): Promise<boolean> {
  if (typeof window === "undefined") return true;
  const sessionId = createSessionId();
  localStorage.setItem(storageKey(userId), sessionId);

  // Revoke refresh tokens for other browser/device sessions. Existing access
  // tokens may live briefly, so the app-level row below gives immediate logout.
  const { error: signOutOthersError } = await supabase.auth.signOut({ scope: "others" });
  if (signOutOthersError) console.warn("[auth] sign out other sessions failed", signOutOthersError.message);

  const { error } = await activeSessionsTable().upsert(
    { user_id: userId, session_id: sessionId, updated_at: new Date().toISOString() },
    { onConflict: "user_id" },
  );

  if (error) {
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