// Preflight token check — dijalankan tepat sebelum proses generate.
//
// Tujuan: menghilangkan error "Token X expired / habis credit" padahal di Token
// Manager masih ada token yang sehat. Sebelum job jalan, semua token provider
// aktif diverifikasi (format, expiry JWT, saldo). Token invalid/expired dibuang
// dari Token Manager, token habis credit ditandai + ditaruh paling belakang,
// dan token sehat dikembalikan paling depan supaya auto-rotate langsung
// memakai token yang benar-benar available.

export type PreflightProvider = "leonardo" | "framia" | "firefly";

type StoredKey = {
  id: string;
  key: string;
  balance: number | null;
  status: "active" | "empty" | "pending" | "failed";
  note?: string;
};

export type PreflightResult = {
  keys: string[]; // token sehat (saldo > 0 / saldo tak diketahui), urut prioritas
  emptyKeys: string[]; // token valid tapi credit habis (fallback terakhir)
  removed: number; // token invalid/expired yang dihapus dari Token Manager
  checked: number;
};

const LS_KEY: Record<PreflightProvider, string> = {
  leonardo: "aatools.leonardo.keys",
  framia: "aatools.framia.keys",
  firefly: "aatools.firefly.keys",
};

const LABEL: Record<PreflightProvider, string> = {
  leonardo: "Leonardo",
  framia: "Framia",
  firefly: "Firefly",
};

const TTL_MS = 45_000;
const cache = new Map<PreflightProvider, { at: number; promise: Promise<PreflightResult> }>();

function readList(provider: PreflightProvider): StoredKey[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(LS_KEY[provider]);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as StoredKey[]) : [];
  } catch {
    return [];
  }
}

function writeList(provider: PreflightProvider, list: StoredKey[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(LS_KEY[provider], JSON.stringify(list));
    // Beritahu tab/komponen lain (Token Manager) supaya UI ikut ter-update.
    window.dispatchEvent(new StorageEvent("storage", { key: LS_KEY[provider] }));
  } catch {
    /* ignore */
  }
}

type Verdict = {
  state: "ok" | "empty" | "invalid";
  balance: number | null;
  note?: string;
};

async function verify(provider: PreflightProvider, token: string): Promise<Verdict> {
  try {
    if (provider === "leonardo") {
      const { checkLeonardoToken, fetchLeonardoBalance } = await import("@/lib/providers/leonardo");
      const chk = await checkLeonardoToken(token);
      if (!chk.ok) return { state: "invalid", balance: null, note: chk.message };
      const bal = await fetchLeonardoBalance(token);
      if (!bal.ok) return { state: "ok", balance: null, note: bal.message };
      const empty = bal.balance != null && bal.balance <= 0;
      return { state: empty ? "empty" : "ok", balance: bal.balance };
    }
    if (provider === "framia") {
      const { checkFramiaToken, fetchFramiaBalance } = await import("@/lib/providers/framia");
      const chk = await checkFramiaToken(token);
      if (!chk.ok) return { state: "invalid", balance: null, note: chk.message };
      const bal = await fetchFramiaBalance(token);
      if (!bal.ok) return { state: "ok", balance: null, note: bal.message };
      const empty = bal.balance != null && bal.balance <= 0;
      return { state: empty ? "empty" : "ok", balance: bal.balance };
    }
    const { fetchFireflyBalance } = await import("@/lib/providers/firefly");
    const bal = await fetchFireflyBalance(token);
    if (!bal.ok) {
      const invalid = /invalid|expired|401|403|unauthor/i.test(bal.message || "");
      return { state: invalid ? "invalid" : "ok", balance: null, note: bal.message };
    }
    const empty = bal.balance != null && bal.balance <= 0;
    return { state: empty ? "empty" : "ok", balance: bal.balance };
  } catch (e) {
    // Kegagalan jaringan bukan bukti token rusak — jangan dibuang.
    return { state: "ok", balance: null, note: (e as Error).message };
  }
}

async function run(
  provider: PreflightProvider,
  onLog?: (msg: string) => void,
): Promise<PreflightResult> {
  const list = readList(provider);
  const label = LABEL[provider];
  if (list.length === 0) {
    return { keys: [], emptyKeys: [], removed: 0, checked: 0 };
  }

  onLog?.(`Cek token ${label} (${list.length}) sebelum generate…`);

  const healthy: StoredKey[] = [];
  const empty: StoredKey[] = [];
  const dropped: StoredKey[] = [];

  for (const item of list) {
    if (!item?.key) continue;
    const v = await verify(provider, item.key);
    if (v.state === "invalid") {
      dropped.push(item);
      continue;
    }
    const updated: StoredKey = {
      ...item,
      balance: v.balance,
      status: v.state === "empty" ? "empty" : "active",
      note: v.note ?? item.note,
    };
    (v.state === "empty" ? empty : healthy).push(updated);
  }

  // Token sehat naik ke depan, credit habis ke belakang, invalid dibuang.
  writeList(provider, [...healthy, ...empty]);

  if (dropped.length) {
    onLog?.(
      `🗑 ${dropped.length} token ${label} invalid/expired dihapus dari Token Manager` +
        (dropped[0].note ? ` (${dropped[0].note})` : ""),
    );
  }
  if (empty.length) onLog?.(`⚠️ ${empty.length} token ${label} habis credit — dilewati`);
  if (healthy.length) onLog?.(`✅ ${healthy.length} token ${label} available`);

  return {
    keys: healthy.map((x) => x.key),
    emptyKeys: empty.map((x) => x.key),
    removed: dropped.length,
    checked: list.length,
  };
}

/**
 * Verifikasi + bersihkan token provider sebelum generate.
 * Hasil di-cache singkat (45 detik) supaya batch job paralel tidak memicu
 * puluhan request cek yang sama.
 */
export function preflightTokens(
  provider: PreflightProvider,
  opts: { onLog?: (msg: string) => void; force?: boolean } = {},
): Promise<PreflightResult> {
  const hit = cache.get(provider);
  if (!opts.force && hit && Date.now() - hit.at < TTL_MS) return hit.promise;
  const promise = run(provider, opts.onLog).catch((e) => {
    cache.delete(provider);
    throw e;
  });
  cache.set(provider, { at: Date.now(), promise });
  return promise;
}

/** Buang cache preflight (mis. setelah user menambah / mengganti token). */
export function invalidatePreflight(provider?: PreflightProvider) {
  if (provider) cache.delete(provider);
  else cache.clear();
}
