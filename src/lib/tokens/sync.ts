// Client-side token sync: mirrors encrypted per-user tokens between localStorage
// and Supabase so users don't have to re-enter API keys on new devices.
import { pullUserTokens, pushUserToken, deleteUserToken, ALLOWED_TOKEN_KEYS } from "./sync.functions";

const SYNC_FLAG = "aatools.tokens.syncedAt";
const OWNER_FLAG = "aatools.tokens.ownerUserId";
const LOCAL_MUTATIONS_KEY = "aatools.tokens.localMutations";

let pullPromise: Promise<void> | null = null;
let lastPulledUserId: string | null = null;
let pullInFlightUserId: string | null = null;

type LocalTokenMutation =
  | { op: "set"; value: string; updatedAt: number }
  | { op: "delete"; updatedAt: number };

function readLocalMutations(): Record<string, LocalTokenMutation> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(LOCAL_MUTATIONS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, LocalTokenMutation>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeLocalMutations(mutations: Record<string, LocalTokenMutation>) {
  if (typeof window === "undefined") return;
  const keys = Object.keys(mutations);
  if (keys.length === 0) localStorage.removeItem(LOCAL_MUTATIONS_KEY);
  else localStorage.setItem(LOCAL_MUTATIONS_KEY, JSON.stringify(mutations));
}

function markLocalMutation(storageKey: string, mutation: LocalTokenMutation) {
  const mutations = readLocalMutations();
  mutations[storageKey] = mutation;
  writeLocalMutations(mutations);
  return mutation.updatedAt;
}

function clearLocalMutation(storageKey: string, updatedAt: number) {
  const mutations = readLocalMutations();
  if (mutations[storageKey]?.updatedAt !== updatedAt) return;
  delete mutations[storageKey];
  writeLocalMutations(mutations);
}

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
    storageKey === "aatools.roboneo.keys" ||
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
  localStorage.removeItem(LOCAL_MUTATIONS_KEY);
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

      // Wait for any in-flight pushes (e.g. a delete that just happened) to
      // flush to the server BEFORE pulling. Otherwise the pull returns stale
      // remote state and a subsequent union-merge would resurrect just-deleted
      // items on the next `storage`/`tokens-synced` broadcast — the exact
      // "hapus perlu 2x klik" symptom.
      await flushPendingPushes();

      const remote = await pullUserTokens();
      const writes: Promise<void>[] = [];
      const localMutations = readLocalMutations();
      for (const key of ALLOWED_TOKEN_KEYS) {
        const localMutation = localMutations[key];
        if (localMutation) {
          // A local save/delete has not been confirmed by the encrypted cloud
          // copy yet. Keep the local browser as source of truth and retry the
          // write instead of letting a stale remote pull wipe the just-added key.
          if (localMutation.op === "set") {
            localStorage.setItem(key, localMutation.value);
            writes.push(
              pushUserToken({ data: { storageKey: key, value: localMutation.value } })
                .then(() => clearLocalMutation(key, localMutation.updatedAt))
                .then(() => undefined),
            );
          } else {
            localStorage.removeItem(key);
            writes.push(
              deleteUserToken({ data: { storageKey: key } })
                .then(() => clearLocalMutation(key, localMutation.updatedAt))
                .then(() => undefined),
            );
          }
          continue;
        }
        const remoteValue = remote[key];
        const localValue = localBeforePull[key];
        // Re-read current localStorage: the user may have saved a new key
        // AFTER we snapshotted `localBeforePull` but BEFORE this loop runs.
        // Without this check, a concurrent write is silently overwritten
        // (owner branch) or wiped (removeItem branch) — the "key disappears
        // a few seconds later" bug.
        const currentValue = localStorage.getItem(key) ?? undefined;
        const localChangedMidPull = currentValue !== localValue;
        if (canClaimLocalCache) {
          if (localChangedMidPull) {
            // User just wrote a new value — that's the source of truth now.
            // Push it up; do NOT overwrite with stale remote.
            if (typeof currentValue === "string" && currentValue.length > 0) {
              writes.push(pushUserToken({ data: { storageKey: key, value: currentValue } }).then(() => undefined));
            }
            continue;
          }
          // We already own this browser's cache for this user — treat remote
          // as authoritative (all local mutations have been flushed above).
          // No union-merge: unions cause deleted items to reappear.
          if (typeof remoteValue === "string" && remoteValue.length > 0) {
            if (remoteValue !== localValue) localStorage.setItem(key, remoteValue);
          } else if (localValue) {
            // Remote has no value but local does → local was cleared after
            // our push flushed; keep local removed on remote by deleting it.
            localStorage.removeItem(key);
          }
        } else if (typeof remoteValue === "string" && remoteValue.length > 0) {
          // First pull as this user in this browser — safe to union-merge with
          // any legacy local entries so nothing is silently dropped.
          const baseLocal = currentValue ?? localValue;
          const nextValue = baseLocal ? mergeStoredTokenValue(key, remoteValue, baseLocal) : remoteValue;
          localStorage.setItem(key, nextValue);
          if (nextValue !== remoteValue) {
            writes.push(pushUserToken({ data: { storageKey: key, value: nextValue } }).then(() => undefined));
          }
        } else if (currentValue || localBeforePull[key]) {
          // One-time migration for legacy local-only tokens: attach them to the
          // currently signed-in user, then they will appear on other devices.
          const value = currentValue ?? localBeforePull[key];
          localStorage.setItem(key, value);
          writes.push(pushUserToken({ data: { storageKey: key, value } }).then(() => undefined));
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

// Track in-flight push/delete promises per storage key so we can flush them
// before pulling. Only the LATEST write per key needs to win.
const pendingWrites = new Map<string, Promise<unknown>>();

async function flushPendingPushes(): Promise<void> {
  if (pendingWrites.size === 0) return;
  await Promise.allSettled(Array.from(pendingWrites.values()));
}

/** Fire-and-forget push. Silently no-ops when not signed in (401). */
export function pushTokenAsync(storageKey: string, value: string) {
  if (typeof window === "undefined") return;
  const updatedAt = markLocalMutation(storageKey, { op: "set", value, updatedAt: Date.now() });
  const p = pushUserToken({ data: { storageKey, value } })
    .then(() => clearLocalMutation(storageKey, updatedAt))
    .catch((e) => {
      // Not signed in yet or network hiccup — keep the local mutation marker so
      // the next sync retries instead of pulling stale remote data over it.
      console.debug("[tokens] push skipped", storageKey, e?.message ?? e);
    })
    .finally(() => {
      if (pendingWrites.get(storageKey) === p) pendingWrites.delete(storageKey);
    });
  pendingWrites.set(storageKey, p);
}

export function deleteTokenAsync(storageKey: string) {
  if (typeof window === "undefined") return;
  const updatedAt = markLocalMutation(storageKey, { op: "delete", updatedAt: Date.now() });
  const p = deleteUserToken({ data: { storageKey } })
    .then(() => clearLocalMutation(storageKey, updatedAt))
    .catch((e) => {
      console.debug("[tokens] delete skipped", storageKey, e?.message ?? e);
    })
    .finally(() => {
      if (pendingWrites.get(storageKey) === p) pendingWrites.delete(storageKey);
    });
  pendingWrites.set(storageKey, p);
}


export { ALLOWED_TOKEN_KEYS };
