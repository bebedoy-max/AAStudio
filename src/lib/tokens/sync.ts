// Client-side token sync: mirrors encrypted per-user tokens between localStorage
// and Supabase so users don't have to re-enter API keys on new devices.
import { pullUserTokens, pushUserToken, deleteUserToken, ALLOWED_TOKEN_KEYS } from "./sync.functions";

const SYNC_FLAG = "aatools.tokens.syncedAt";

let pullPromise: Promise<void> | null = null;
let lastPulledUserId: string | null = null;

/**
 * Pull encrypted tokens for the signed-in user and hydrate localStorage.
 * Called once per session after login. Idempotent per user.
 */
export function syncTokensForUser(userId: string): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (lastPulledUserId === userId && pullPromise) return pullPromise;
  lastPulledUserId = userId;
  pullPromise = (async () => {
    try {
      const remote = await pullUserTokens();
      for (const key of ALLOWED_TOKEN_KEYS) {
        const value = remote[key];
        if (typeof value === "string" && value.length > 0) {
          localStorage.setItem(key, value);
        }
      }
      localStorage.setItem(SYNC_FLAG, new Date().toISOString());
      // Let listeners (dashboards, token page state) know remote data landed.
      window.dispatchEvent(new CustomEvent("aatools:tokens-synced"));
    } catch (e) {
      console.warn("[tokens] pull failed", e);
    }
  })();
  return pullPromise;
}

export function resetTokenSync() {
  lastPulledUserId = null;
  pullPromise = null;
  if (typeof window !== "undefined") localStorage.removeItem(SYNC_FLAG);
}

/** Fire-and-forget push. Silently no-ops when not signed in (401). */
export function pushTokenAsync(storageKey: string, value: string) {
  if (typeof window === "undefined") return;
  void pushUserToken({ data: { storageKey, value } }).catch((e) => {
    // Not signed in yet or network hiccup — localStorage still has the value.
    console.debug("[tokens] push skipped", storageKey, e?.message ?? e);
  });
}

export function deleteTokenAsync(storageKey: string) {
  if (typeof window === "undefined") return;
  void deleteUserToken({ data: { storageKey } }).catch((e) => {
    console.debug("[tokens] delete skipped", storageKey, e?.message ?? e);
  });
}

export { ALLOWED_TOKEN_KEYS };
