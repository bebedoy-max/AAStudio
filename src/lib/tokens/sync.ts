// Client-side token sync: mirrors encrypted per-user tokens between localStorage
// and Supabase so users don't have to re-enter API keys on new devices.
import { pullUserTokens, pushUserToken, deleteUserToken, ALLOWED_TOKEN_KEYS } from "./sync.functions";

const SYNC_FLAG = "aatools.tokens.syncedAt";
const OWNER_FLAG = "aatools.tokens.ownerUserId";

let pullPromise: Promise<void> | null = null;
let lastPulledUserId: string | null = null;
let pullInFlightUserId: string | null = null;

function dispatchTokenSyncEvent() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("aatools:tokens-synced"));
  // Some older panes listen to the generic storage event for same-tab refreshes.
  window.dispatchEvent(new Event("storage"));
}

function readLocalTokenSnapshot(): Record<string, string> {
  const snapshot: Record<string, string> = {};
  if (typeof window === "undefined") return snapshot;
  for (const key of ALLOWED_TOKEN_KEYS) {
    const value = localStorage.getItem(key);
    if (typeof value === "string" && value.length > 0) snapshot[key] = value;
  }
  return snapshot;
}

function parseJsonValue<T>(value: string | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function mergeByString(valuesA: string[], valuesB: string[]) {
  return Array.from(new Set([...valuesA, ...valuesB].filter(Boolean)));
}

function mergeByField<T extends Record<string, unknown>>(remote: T[], local: T[], field: "key" | "token") {
  const byValue = new Map<string, T>();
  for (const item of local) {
    const value = item[field];
    if (typeof value === "string" && value) byValue.set(value, item);
  }
  for (const item of remote) {
    const value = item[field];
    if (typeof value === "string" && value) {
      byValue.set(value, { ...item, ...(byValue.get(value) ?? {}) });
    }
  }
  return Array.from(byValue.values());
}

function mergeStoredTokenValue(storageKey: string, remoteValue: string, localValue: string): string {
  if (storageKey === "aatools.brain.geminiKeys") {
    return JSON.stringify(
      mergeByString(parseJsonValue<string[]>(remoteValue, []), parseJsonValue<string[]>(localValue, [])),
    );
  }

  if (storageKey === "aatools.eleven") {
    const remote = parseJsonValue<{ keys?: string[]; voice?: string; customVoice?: string }>(remoteValue, {});
    const local = parseJsonValue<{ keys?: string[]; voice?: string; customVoice?: string }>(localValue, {});
    return JSON.stringify({
      ...local,
      ...remote,
      keys: mergeByString(remote.keys ?? [], local.keys ?? []),
      voice: remote.voice ?? local.voice ?? "",
      customVoice: remote.customVoice ?? local.customVoice ?? "",
    });
  }

  if (storageKey === "aatools.weavy.tokens") {
    return JSON.stringify(
      mergeByField(
        parseJsonValue<Record<string, unknown>[]>(remoteValue, []),
        parseJsonValue<Record<string, unknown>[]>(localValue, []),
        "token",
      ),
    );
  }

  if (
    storageKey === "aatools.wavespeed.keys" ||
    storageKey === "aatools.magnific.keys" ||
    storageKey === "aatools.shotstack.keys" ||
    storageKey === "aatools.creatomate.keys"
  ) {
    return JSON.stringify(
      mergeByField(
        parseJsonValue<Record<string, unknown>[]>(remoteValue, []),
        parseJsonValue<Record<string, unknown>[]>(localValue, []),
        "key",
      ),
    );
  }

  if (storageKey === "aatools.brain.checks" || storageKey === "aatools.eleven.checks") {
    return JSON.stringify(
      mergeByField(
        parseJsonValue<Record<string, unknown>[]>(remoteValue, []),
        parseJsonValue<Record<string, unknown>[]>(localValue, []),
        "key",
      ),
    );
  }

  return remoteValue || localValue;
}

export function clearLocalTokenCache() {
  if (typeof window === "undefined") return;
  for (const key of ALLOWED_TOKEN_KEYS) localStorage.removeItem(key);
  localStorage.removeItem(SYNC_FLAG);
  localStorage.removeItem(OWNER_FLAG);
  dispatchTokenSyncEvent();
}

/**
 * Pull encrypted tokens for the signed-in user and hydrate localStorage.
 * Called once per session after login. Idempotent per user.
 */
export function syncTokensForUser(userId: string, options?: { force?: boolean }): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  const force = options?.force === true;
  if (!force && lastPulledUserId === userId && pullPromise) return pullPromise;
  if (force && pullInFlightUserId === userId && pullPromise) return pullPromise;
  lastPulledUserId = userId;
  pullInFlightUserId = userId;
  pullPromise = (async () => {
    try {
      const previousOwner = localStorage.getItem(OWNER_FLAG);
      const canClaimLocalCache = previousOwner === userId;
      const localBeforePull = canClaimLocalCache ? readLocalTokenSnapshot() : {};

      if (previousOwner && previousOwner !== userId) {
        // Same browser, different account: never expose user A's cached tokens
        // to user B while the per-user encrypted copy is being fetched.
        for (const key of ALLOWED_TOKEN_KEYS) localStorage.removeItem(key);
      }

      const remote = await pullUserTokens();
      const writes: Promise<void>[] = [];
      for (const key of ALLOWED_TOKEN_KEYS) {
        const remoteValue = remote[key];
        const localValue = localBeforePull[key];
        if (typeof remoteValue === "string" && remoteValue.length > 0) {
          const nextValue = localValue ? mergeStoredTokenValue(key, remoteValue, localValue) : remoteValue;
          localStorage.setItem(key, nextValue);
          if (nextValue !== remoteValue) {
            writes.push(pushUserToken({ data: { storageKey: key, value: nextValue } }).then(() => undefined));
          }
        } else if (localBeforePull[key]) {
          // One-time migration for legacy local-only tokens: attach them to the
          // currently signed-in user, then they will appear on other devices.
          localStorage.setItem(key, localBeforePull[key]);
          writes.push(pushUserToken({ data: { storageKey: key, value: localBeforePull[key] } }).then(() => undefined));
        } else {
          localStorage.removeItem(key);
        }
      }
      await Promise.allSettled(writes);
      localStorage.setItem(SYNC_FLAG, new Date().toISOString());
      localStorage.setItem(OWNER_FLAG, userId);
      // Let listeners (dashboards, token page state) know remote data landed.
      dispatchTokenSyncEvent();
    } catch (e) {
      console.warn("[tokens] pull failed", e);
    } finally {
      pullInFlightUserId = null;
    }
  })();
  return pullPromise;
}

export function resetTokenSync() {
  lastPulledUserId = null;
  pullPromise = null;
  pullInFlightUserId = null;
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
