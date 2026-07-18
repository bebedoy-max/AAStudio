// Post-generation credit refresh & auto-prune.
// Called at the end of every successful generate flow so the Token Manager
// always shows up-to-date balances and drops keys that fell below the minimum
// credits threshold used when saving.

import { checkWeavyToken } from "@/lib/providers/weavy";
import { checkWavespeedBalance } from "@/lib/providers/wavespeed";
import { checkElevenKey } from "@/lib/providers/eleven";
import { pushTokenAsync, deleteTokenAsync, ALLOWED_TOKEN_KEYS } from "./sync";

export type RefreshableProvider = "weavy" | "wavespeed" | "magnific" | "eleven" | "brain";

export const MIN_CREDITS = {
  weavy: 5,
  wavespeed: 0.01, // USD — token dianggap habis kalau <= $0.01
  eleven: 50,
} as const;

const LS_KEYS = {
  brain: "aatools.brain.geminiKeys",
  brainChecks: "aatools.brain.checks",
  weavy: "aatools.weavy.tokens",
  weavyActive: "aatools.weavy.activeId",
  wavespeed: "aatools.wavespeed.keys",
  magnific: "aatools.magnific.keys",
  eleven: "aatools.eleven",
  elevenChecks: "aatools.eleven.checks",
} as const;

type BrainKeyStatus = {
  key: string;
  state: "unknown" | "checking" | "active" | "invalid" | "limited" | "failed";
  detail?: string;
};

async function checkGeminiKey(key: string): Promise<BrainKeyStatus> {
  try {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}&pageSize=1`,
    );
    if (r.ok) return { key, state: "active", detail: "OK" };
    if (r.status === 429) return { key, state: "limited", detail: "429 · quota / rate-limit" };
    if (r.status === 401 || r.status === 403 || r.status === 400)
      return { key, state: "invalid", detail: `${r.status} · key ditolak` };
    return { key, state: "failed", detail: `${r.status}` };
  } catch (e) {
    return { key, state: "failed", detail: (e as Error).message };
  }
}

async function refreshBrain(): Promise<void> {
  const keys = readJSON<string[]>(LS_KEYS.brain, []);
  if (keys.length === 0) return;
  const kept: string[] = [];
  const statuses: BrainKeyStatus[] = [];
  for (const k of keys) {
    const r = await checkGeminiKey(k);
    // Drop only definitively invalid keys; keep rate-limited/failed for retry.
    if (r.state === "invalid") continue;
    kept.push(k);
    statuses.push(r);
  }
  if (kept.length !== keys.length) writeJSON(LS_KEYS.brain, kept);
  writeJSON(LS_KEYS.brainChecks, statuses);
}

function readJSON<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJSON(key: string, value: unknown) {
  if (typeof window === "undefined") return;
  const s = JSON.stringify(value);
  localStorage.setItem(key, s);
  if ((ALLOWED_TOKEN_KEYS as readonly string[]).includes(key)) pushTokenAsync(key, s);
}

function notifyPanes() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("aatools:tokens-synced"));
  window.dispatchEvent(new Event("storage"));
}

type WeavyTok = {
  id: string;
  token: string;
  email?: string;
  credits: number | null;
  status: "active" | "empty" | "pending" | "failed";
};
type SimpleKey = { id: string; key: string; balance: number | null; status: string; note?: string };
type ElevenCfg = { keys: string[]; voice: string; customVoice: string };
type ElevenKeyStatus = { key: string; ok: boolean; remaining: number | null; limit: number; tier?: string; method?: string; note?: string; reason?: string };

async function refreshWeavy(): Promise<void> {
  const list = readJSON<WeavyTok[]>(LS_KEYS.weavy, []);
  if (list.length === 0) return;
  const kept: WeavyTok[] = [];
  for (const t of list) {
    const r = await checkWeavyToken(t.token);
    if (!r.ok) continue; // invalid → drop
    const credits = r.credits;
    if (credits !== null && credits < MIN_CREDITS.weavy) continue; // habis → drop
    kept.push({
      ...t,
      email: r.email ?? t.email,
      credits,
      status: credits === null ? "pending" : "active",
    });
  }
  if (kept.length !== list.length || kept.some((k, i) => k.credits !== list[i]?.credits)) {
    writeJSON(LS_KEYS.weavy, kept);
    const activeId = readJSON<string | null>(LS_KEYS.weavyActive, null);
    if (activeId && !kept.some((t) => t.id === activeId)) {
      const nid = kept[0]?.id ?? null;
      if (nid) writeJSON(LS_KEYS.weavyActive, nid);
      else {
        localStorage.removeItem(LS_KEYS.weavyActive);
        deleteTokenAsync(LS_KEYS.weavyActive);
      }
    }
  }
}

async function refreshWavespeed(): Promise<void> {
  const list = readJSON<SimpleKey[]>(LS_KEYS.wavespeed, []);
  if (list.length === 0) return;
  const kept: SimpleKey[] = [];
  for (const x of list) {
    const r = await checkWavespeedBalance(x.key);
    if (!r.ok) continue;
    const bal = r.balance;
    if (bal !== null && bal < MIN_CREDITS.wavespeed) continue;
    kept.push({ ...x, balance: bal, status: bal && bal > 0 ? "active" : "empty" });
  }
  if (kept.length !== list.length || kept.some((k, i) => k.balance !== list[i]?.balance)) {
    writeJSON(LS_KEYS.wavespeed, kept);
  }
}

async function refreshEleven(): Promise<void> {
  const cfg = readJSON<ElevenCfg>(LS_KEYS.eleven, { keys: [], voice: "", customVoice: "" });
  if (!cfg.keys || cfg.keys.length === 0) return;
  const keptKeys: string[] = [];
  const statuses: ElevenKeyStatus[] = [];
  for (const k of cfg.keys) {
    const r = await checkElevenKey(k);
    const canUse = r.ok && (r.remaining === null || r.remaining >= MIN_CREDITS.eleven);
    if (!canUse) continue;
    keptKeys.push(k);
    statuses.push({
      key: k,
      ok: true,
      remaining: r.remaining,
      limit: r.characterLimit,
      tier: r.tier,
      method: r.method,
      note: r.note,
    });
  }
  if (keptKeys.length !== cfg.keys.length) {
    writeJSON(LS_KEYS.eleven, { ...cfg, keys: keptKeys });
  }
  writeJSON(LS_KEYS.elevenChecks, statuses);
}

let inFlight: Partial<Record<RefreshableProvider, Promise<void>>> = {};

export function refreshAndPruneProvider(provider: RefreshableProvider): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (provider === "magnific") return Promise.resolve(); // no balance endpoint
  const existing = inFlight[provider];
  if (existing) return existing;
  const p = (async () => {
    try {
      if (provider === "weavy") await refreshWeavy();
      else if (provider === "wavespeed") await refreshWavespeed();
      else if (provider === "eleven") await refreshEleven();
      else if (provider === "brain") await refreshBrain();
      notifyPanes();
    } catch (e) {
      console.warn("[tokens/refresh] failed", provider, e);
    } finally {
      inFlight[provider] = undefined;
    }
  })();
  inFlight[provider] = p;
  return p;
}

/** Fire-and-forget notifier used at the end of a successful generation. */
export function notifyGenerationDone(provider: RefreshableProvider): void {
  void refreshAndPruneProvider(provider);
}

/** Refresh all auto-refreshable providers (brain/weavy/wavespeed) sequentially. */
export async function refreshAllProviders(): Promise<void> {
  await refreshAndPruneProvider("brain");
  await refreshAndPruneProvider("weavy");
  await refreshAndPruneProvider("wavespeed");
  // magnific has no balance endpoint — skip
}

const GLOBAL_REFRESH_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
const LAST_RUN_KEY = "aatools.tokens.lastGlobalRefresh";
let globalTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Start a global 1-hour refresh loop for brain/weavy/wavespeed tokens.
 * Persists last-run timestamp so page reloads don't reset the schedule.
 * Safe to call multiple times — subsequent calls are no-ops.
 */
export function startGlobalTokenRefresh(): void {
  if (typeof window === "undefined" || globalTimer !== null) return;
  const runIfDue = () => {
    try {
      const last = Number(localStorage.getItem(LAST_RUN_KEY) ?? 0);
      if (Date.now() - last < GLOBAL_REFRESH_INTERVAL_MS) return;
      localStorage.setItem(LAST_RUN_KEY, String(Date.now()));
      void refreshAllProviders();
    } catch (e) {
      console.warn("[tokens/refresh] global refresh failed", e);
    }
  };
  // First run 30s after mount to avoid competing with initial page load.
  window.setTimeout(runIfDue, 30_000);
  globalTimer = setInterval(runIfDue, 5 * 60 * 1000); // check every 5 min, run every hour
}
