import { createFileRoute } from "@tanstack/react-router";
import { flushSync } from "react-dom";
import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Plus, Trash2, RefreshCw, Upload, FileText, X, ExternalLink, CheckCircle2, Eye, EyeOff, ShoppingCart, ChevronDown } from "lucide-react";
import { DashboardShell, PageHero } from "@/components/dashboard/shell";
import { Card, Field, Input, Textarea, Select, PrimaryButton, GhostButton } from "@/components/dashboard/ui";
import { checkWeavyToken, rotateWeavyToken, getActiveWeavyAccessToken } from "@/lib/providers/weavy";
import { checkWavespeedBalance } from "@/lib/providers/wavespeed";
import { checkMagnificKey } from "@/lib/providers/magnific";
import { fetchRoboneoBalance } from "@/lib/providers/roboneo";
import { fetchFireflyBalance, checkFireflyToken } from "@/lib/providers/firefly";
import { checkFramiaToken, fetchFramiaBalance } from "@/lib/providers/framia";
import { checkLeonardoToken, fetchLeonardoBalance } from "@/lib/providers/leonardo";
import { checkElevenKey } from "@/lib/providers/eleven";
import { checkDolaCookie } from "@/lib/providers/dola";
import { pushTokenAsync, ALLOWED_TOKEN_KEYS, syncTokensForUser } from "@/lib/tokens/sync";
import { useProviderFlags, tokenTabFlagIds } from "@/lib/platform/provider-flags";
import { useAuth } from "@/lib/auth-context";
import { BuyTokenDialog } from "@/components/token-bank/buy-dialog";
import { confirmDialog } from "@/components/ui-confirm";

/* ============ Themed Summary Dialog (replaces browser alert) ============ */
export type SummaryRow = { label: string; value: string | number; tone?: "ok" | "warn" | "bad" | "muted" };
export type SummaryPayload = { title: string; rows: SummaryRow[]; footer?: string };
export const SummaryCtx = createContext<(p: SummaryPayload) => void>(() => {});
const useSummaryDialog = () => useContext(SummaryCtx);

export function SummaryDialog({ payload, onClose }: { payload: SummaryPayload; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-[80] grid place-items-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="neumorph w-full max-w-md p-6 relative animate-in zoom-in-95 duration-200"
        style={{ background: "var(--gradient-card, hsl(var(--card)))" }}
      >
        <div className="flex items-center gap-2.5 mb-4">
          <div
            className="h-9 w-9 rounded-full grid place-items-center shrink-0"
            style={{ background: "var(--gradient-neon)" }}
          >
            <CheckCircle2 className="h-5 w-5 text-primary-foreground" />
          </div>
          <div className="font-display text-lg text-foreground">{payload.title}</div>
        </div>
        <div className="rounded-xl border border-border/60 bg-card/40 divide-y divide-border/50">
          {payload.rows.map((r, i) => (
            <div key={i} className="flex items-center justify-between gap-3 px-3.5 py-2 text-[12.5px]">
              <span className="text-muted-foreground">{r.label}</span>
              <span
                className={[
                  "font-semibold font-mono tabular-nums",
                  r.tone === "ok"
                    ? "text-emerald-400"
                    : r.tone === "warn"
                      ? "text-amber-300"
                      : r.tone === "bad"
                        ? "text-rose-400"
                        : r.tone === "muted"
                          ? "text-muted-foreground"
                          : "text-foreground",
                ].join(" ")}
              >
                {r.value}
              </span>
            </div>
          ))}
        </div>
        {payload.footer && (
          <div className="mt-3 text-[11px] text-muted-foreground text-center leading-relaxed">{payload.footer}</div>
        )}
        <div className="mt-5 flex justify-center">
          <PrimaryButton onClick={onClose} className="min-w-[120px] justify-center">
            OK
          </PrimaryButton>
        </div>
      </div>
    </div>
  );
}

export const Route = createFileRoute("/manage/tokens")({
  validateSearch: (search: Record<string, unknown>): { provider?: string } =>
    typeof search["provider"] === "string" ? { provider: search["provider"] as string } : {},
  head: () => ({
    meta: [
      { title: "Token / API Manager — AA Creative Studio" },
      { name: "description", content: "Kelola API key semua provider AI — Brain, Weavy, Wavespeed, Magnific, ElevenLabs." },
    ],
  }),
  component: TokensPage,
});

type ProviderKey = "brain" | "weavy" | "wavespeed" | "magnific" | "roboneo" | "framia" | "leonardo" | "firefly" | "dola" | "eleven" | "render";

const PROVIDER_GLOW: Record<ProviderKey, string> = {
  brain: "oklch(0.72 0.18 355)",
  weavy: "oklch(0.78 0.14 80)",
  wavespeed: "oklch(0.78 0.16 210)",
  magnific: "oklch(0.72 0.16 300)",
  roboneo: "oklch(0.70 0.18 25)",
  framia: "oklch(0.72 0.16 160)",
  leonardo: "oklch(0.82 0.16 95)",
  firefly: "oklch(0.70 0.18 25)",
  dola: "oklch(0.78 0.16 190)",
  eleven: "oklch(0.72 0.16 265)",
  render: "oklch(0.70 0.05 275)",
};

const providers: { key: ProviderKey; label: string; desc: string }[] = [
  { key: "brain", label: "Brain (Gemini)", desc: "Dipakai Produk Storyboard & Naratif Video Maker. Multi-key auto-rotate saat kena limit/429." },
  { key: "weavy", label: "Weavy", desc: "Provider utama Kling Motion Control, Wan, Sora, Seedance." },
  { key: "wavespeed", label: "Wavespeed", desc: "Provider alternatif — cek balance via api.wavespeed.ai/api/v3/balance." },
  { key: "magnific", label: "Magnific", desc: "Hanya dipakai untuk Motion Control (Kling motion transfer)." },
  { key: "roboneo", label: "Roboneo", desc: "Motion Control via Roboneo (Meitu) — Kling 2.6 Standard." },
  { key: "framia", label: "Framia", desc: "Canvas workflow — semua node & recipe: image, video, avatar, garment, storyboard." },
  { key: "leonardo", label: "Leonardo.ai", desc: "app.leonardo.ai via Cognito Bearer JWT — Text-to-Image (Phoenix, Diffusion XL, Kino, Anime, Vision)." },
  { key: "firefly", label: "Adobe Firefly", desc: "Firefly image (Image 3/4) & video (Veo) via session token firefly.adobe.com." },
  { key: "dola", label: "Dola", desc: "Video (Text-to-Video & Image-to-Video) via sesi web dola.com — auth pakai cookie session." },
  { key: "eleven", label: "ElevenLabs", desc: "Voice-over untuk Naratif Video Maker." },
  { key: "render", label: "Render (Shotstack/Creatomate)", desc: "Fallback cloud render ketika video melebihi limit FFmpeg browser (≥ 400 MB)." },
];


// ---- localStorage helpers ----
type WeavyTok = { id: string; token: string; user?: string; email?: string; credits: number | null; status: "active" | "empty" | "pending" | "failed" };
type SimpleKey = { id: string; key: string; balance: number | null; status: "active" | "empty" | "pending" | "failed"; note?: string };
const MIN_WEAVY_CREDITS = 5;
const MIN_ELEVEN_CREDITS = 50;

export const LS = {
  brain: "aatools.brain.geminiKeys",
  brainChecks: "aatools.brain.checks",
  weavy: "aatools.weavy.tokens",
  wavespeed: "aatools.wavespeed.keys",
  magnific: "aatools.magnific.keys",
  roboneo: "aatools.roboneo.keys",
  framia: "aatools.framia.keys",
  leonardo: "aatools.leonardo.keys",
  firefly: "aatools.firefly.keys",
  dola: "aatools.dola.keys",
  eleven: "aatools.eleven",
  elevenChecks: "aatools.eleven.checks",
  shotstack: "aatools.shotstack.keys",
  creatomate: "aatools.creatomate.keys",
  active: "aatools.weavy.activeId",
};

const uid = () => Math.random().toString(36).slice(2, 10);

/** Gradient tiap card provider di dashboard Token Manager.
 *  Warna diselaraskan dengan tema gelap aplikasi (deep indigo/navy) namun
 *  tetap memiliki nuansa warna berbeda per provider. */
const PROVIDER_GRADIENT: Record<ProviderKey, string> = {
  brain: "linear-gradient(115deg, oklch(0.26 0.08 340 / 0.10), oklch(0.21 0.06 320 / 0.10))",
  weavy: "linear-gradient(115deg, oklch(0.27 0.08 75 / 0.10), oklch(0.21 0.06 60 / 0.10))",
  wavespeed: "linear-gradient(115deg, oklch(0.26 0.08 210 / 0.10), oklch(0.21 0.06 230 / 0.10))",
  roboneo: "linear-gradient(115deg, oklch(0.26 0.08 25 / 0.10), oklch(0.21 0.06 40 / 0.10))",
  leonardo: "linear-gradient(115deg, oklch(0.27 0.08 95 / 0.10), oklch(0.21 0.06 85 / 0.10))",
  framia: "linear-gradient(115deg, oklch(0.26 0.08 165 / 0.10), oklch(0.21 0.06 150 / 0.10))",
  magnific: "linear-gradient(115deg, oklch(0.26 0.08 55 / 0.10), oklch(0.21 0.06 45 / 0.10))",
  firefly: "linear-gradient(115deg, oklch(0.26 0.08 25 / 0.10), oklch(0.21 0.06 15 / 0.10))",
  eleven: "linear-gradient(115deg, oklch(0.26 0.08 255 / 0.10), oklch(0.21 0.06 270 / 0.10))",
  dola: "linear-gradient(115deg, oklch(0.26 0.08 185 / 0.10), oklch(0.21 0.06 200 / 0.10))",
  render: "linear-gradient(115deg, oklch(0.26 0.04 275 / 0.10), oklch(0.20 0.03 275 / 0.10))",
};

/** Hitung total token & total credit tersimpan untuk satu provider. */
function readProviderStats(provider: ProviderKey): { tokens: number; credits: number | null } {
  if (typeof window === "undefined") return { tokens: 0, credits: null };
  const storageKeys =
    provider === "render"
      ? [LS.shotstack, LS.creatomate]
      : [(LS as Record<string, string>)[provider]].filter(Boolean);
  let tokens = 0;
  let credits = 0;
  let known = false;
  for (const sk of storageKeys) {
    try {
      const raw = localStorage.getItem(sk);
      if (!raw) continue;
      const parsed = JSON.parse(raw) as unknown;
      const list: unknown[] = Array.isArray(parsed)
        ? parsed
        : Array.isArray((parsed as { keys?: unknown[] })?.keys)
          ? (parsed as { keys: unknown[] }).keys
          : [];
      tokens += list.length;
      for (const item of list) {
        if (!item || typeof item !== "object") continue;
        const e = item as { credits?: number | null; balance?: number | null };
        const v = e.credits ?? e.balance;
        if (typeof v === "number" && Number.isFinite(v)) {
          credits += v;
          known = true;
        }
      }
    } catch {
      /* ignore */
    }
  }
  return { tokens, credits: known ? credits : null };
}

function ProviderDashboardCard({
  provider,
  label,
  onOpen,
}: {
  provider: ProviderKey;
  label: string;
  onOpen: () => void;
}) {
  const [stats, setStats] = useState<{ tokens: number; credits: number | null }>({ tokens: 0, credits: null });
  useEffect(() => {
    const sync = () => setStats(readProviderStats(provider));
    sync();
    for (const ev of TOKEN_SYNC_EVENTS) window.addEventListener(ev, sync);
    window.addEventListener("focus", sync);
    return () => {
      for (const ev of TOKEN_SYNC_EVENTS) window.removeEventListener(ev, sync);
      window.removeEventListener("focus", sync);
    };
  }, [provider]);

  return (
    <button
      type="button"
      onClick={onOpen}
      className="group relative overflow-hidden rounded-3xl p-6 text-left transition-transform hover:scale-[1.02] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      style={{
        background: PROVIDER_GRADIENT[provider],
        boxShadow: `0 14px 34px -14px color-mix(in oklab, ${PROVIDER_GLOW[provider]}, transparent 55%)`,
      }}
    >
      <div
        className="font-display text-3xl md:text-4xl font-black uppercase tracking-wide"
        style={{
          color: "oklch(0.98 0.01 260)",
          textShadow: `0 3px 0 ${PROVIDER_GLOW[provider]}, 0 5px 12px oklch(0.12 0.04 275 / 0.45)`,
        }}
      >
        {label}
      </div>
      <div className="mt-6 inline-grid grid-cols-[auto_auto_1fr] items-center gap-x-2 gap-y-1 rounded-xl bg-background/60 px-3 py-2 font-mono text-[13px] md:text-sm font-bold uppercase backdrop-blur-[2px] border border-white/10">
        <span style={{ color: PROVIDER_GLOW[provider] }}>Total Token</span>
        <span style={{ color: PROVIDER_GLOW[provider] }}>:</span>
        <span className="tabular-nums text-emerald-300">{stats.tokens}</span>
        <span style={{ color: PROVIDER_GLOW[provider] }}>Total Credit</span>
        <span style={{ color: PROVIDER_GLOW[provider] }}>:</span>
        <span className="tabular-nums text-emerald-300">
          {stats.credits === null ? "—" : stats.credits.toLocaleString("id-ID")}
        </span>
      </div>
    </button>
  );
}

const readJSON = <T,>(k: string, fallback: T): T => {
  if (typeof window === "undefined") return fallback;
  try {
    const v = localStorage.getItem(k);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
};
const SYNCED_KEYS: ReadonlySet<string> = new Set(ALLOWED_TOKEN_KEYS);
const TOKEN_SYNC_EVENTS = ["aatools:tokens-synced", "aatools:keys-changed", "storage"] as const;

/** Ambil semua nilai key/token dari sebuah entry localStorage token manager. */
function extractKeyValues(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    const arr: unknown[] = Array.isArray(parsed)
      ? parsed
      : Array.isArray((parsed as { keys?: unknown[] })?.keys)
        ? ((parsed as { keys: unknown[] }).keys)
        : [];
    return arr
      .map((x) =>
        typeof x === "string"
          ? x
          : ((x as { key?: string; token?: string })?.key ??
             (x as { key?: string; token?: string })?.token ??
             ""),
      )
      .filter((v): v is string => typeof v === "string" && v.length > 0);
  } catch {
    return [];
  }
}

function snapshotStoredKeys(): Set<string> {
  const out = new Set<string>();
  if (typeof window === "undefined") return out;
  for (const k of ALLOWED_TOKEN_KEYS) {
    for (const v of extractKeyValues(localStorage.getItem(k))) out.add(v);
  }
  return out;
}

const writeJSON = (k: string, v: unknown) => {
  if (typeof window === "undefined") return;
  const serialized = JSON.stringify(v);
  localStorage.setItem(k, serialized);
  // Mirror to Supabase (encrypted server-side) so the user finds their keys
  // again on any other device / browser.
  if (SYNCED_KEYS.has(k)) pushTokenAsync(k, serialized);
  // Notify same-tab listeners (dashboard, key-guards) — the `storage` event
  // does not fire in the tab that made the change.
  if (k.startsWith("aatools.")) {
    window.dispatchEvent(new CustomEvent("aatools:keys-changed"));
  }
};

function TokensPage() {
  const { user, loading } = useAuth();
  const { isEnabled } = useProviderFlags();
  // Provider yang dinonaktifkan admin disembunyikan dari Token Manager.
  const visibleProviders = providers.filter((p) =>
    tokenTabFlagIds(p.key).some((id) => isEnabled(id)),
  );
  const [tab, setTab] = useState<ProviderKey>("brain");
  const [tabOpen, setTabOpen] = useState(false);
  // null = tampilkan dashboard card semua provider.
  const [selected, setSelected] = useState<ProviderKey | null>(null);
  const { provider: providerParam } = Route.useSearch();
  useEffect(() => {
    if (!providerParam) return;
    const match = providers.find((p) => p.key === providerParam);
    if (match) {
      setTab(match.key);
      setSelected(match.key);
    }
  }, [providerParam]);
  useEffect(() => {
    if (visibleProviders.length && !visibleProviders.some((p) => p.key === tab)) {
      setTab(visibleProviders[0].key);
    }
  }, [visibleProviders, tab]);
  const active = providers.find((p) => p.key === tab)!;
  const [showImport, setShowImport] = useState(false);
  const [summary, setSummary] = useState<SummaryPayload | null>(null);
  const [syncTick, setSyncTick] = useState(0);
  // Default: pane terbuka (user langsung bisa input & lihat sisa credit di
  // tabel). Auto-collapse hanya ketika user pertama kali buka sebuah tab yang
  // sudah punya >10 key — di kasus itu view dikecilkan agar tidak overwhelming
  // sampai user manual klik View.
  const [showKeys, setShowKeys] = useState(true);
  const [buyOpen, setBuyOpen] = useState(false);

  useEffect(() => {
    const onSynced = () => setSyncTick((n) => n + 1);
    for (const ev of TOKEN_SYNC_EVENTS) window.addEventListener(ev, onSynced);
    return () => {
      for (const ev of TOKEN_SYNC_EVENTS) window.removeEventListener(ev, onSynced);
    };
  }, []);

  // Deteksi key BARU yang masuk dari cloud (mis. hasil pembelian Token Bank).
  // Saat itu terjadi, pane aktif di-remount supaya key langsung muncul di
  // "Key tersimpan" dan info credit-nya otomatis dicek — tanpa pindah tab.
  const [keyEpoch, setKeyEpoch] = useState(0);
  const knownKeysRef = useRef<Set<string> | null>(null);
  useEffect(() => {
    const check = () => {
      const now = snapshotStoredKeys();
      const prev = knownKeysRef.current;
      knownKeysRef.current = now;
      if (!prev) return;
      for (const v of now) {
        if (!prev.has(v)) {
          setKeyEpoch((n) => n + 1);
          break;
        }
      }
    };
    check();
    for (const ev of TOKEN_SYNC_EVENTS) window.addEventListener(ev, check);
    return () => {
      for (const ev of TOKEN_SYNC_EVENTS) window.removeEventListener(ev, check);
    };
  }, []);


  // On tab change: collapse only when the current tab has more than 10 keys.
  useEffect(() => {
    let n = 0;
    try {
      const key =
        tab === "brain"
          ? LS.brain
          : tab === "weavy"
            ? LS.weavy
            : tab === "wavespeed"
              ? LS.wavespeed
              : tab === "magnific"
                ? LS.magnific
                : tab === "roboneo"
                  ? LS.roboneo
                  : tab === "framia"
                    ? LS.framia
                    : tab === "leonardo"
                      ? LS.leonardo
                      : tab === "firefly"
                      ? LS.firefly
                      : tab === "dola"
                      ? LS.dola
                      : tab === "eleven"
                        ? LS.eleven
                        : LS.shotstack;
      const raw = localStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) n = parsed.length;
        else if (parsed && Array.isArray(parsed.keys)) n = parsed.keys.length;
      }
      if (tab === "render") {
        const ss = JSON.parse(localStorage.getItem(LS.shotstack) ?? "[]");
        const cm = JSON.parse(localStorage.getItem(LS.creatomate) ?? "[]");
        n = (Array.isArray(ss) ? ss.length : 0) + (Array.isArray(cm) ? cm.length : 0);
      }
    } catch {
      /* ignore */
    }
    setShowKeys(n <= 10);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  useEffect(() => {
    if (loading || !user?.id) return;
    void syncTokensForUser(user.id, { force: true });
    // Egress: token set only changes when the user (or a purchase) writes it,
    // so re-pull every 5 minutes and on tab focus instead of every 20s.
    const refreshRemoteTokens = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      void syncTokensForUser(user.id, { force: true });
    }, 5 * 60_000);
    return () => window.clearInterval(refreshRemoteTokens);
  }, [loading, user?.id]);

  // Do NOT include syncTick in the pane key — remounting the pane every time
  // remote sync fires (every 20s) wipes local input state, causing the user's
  // freshly pasted keys to "disappear". `keyEpoch` hanya berubah ketika ada
  // key BARU dari cloud (mis. pembelian token), jadi remount-nya aman.
  const paneKey = `${tab}:${keyEpoch}`;


  return (
    <SummaryCtx.Provider value={setSummary}>
      <DashboardShell>
        <PageHero
          eyebrow="Manage"
          title="Token / API"
          highlight="Manager"
          desc="Pusat kelola semua API key & token. Tersimpan terenkripsi di akun kamu — auto sync di semua perangkat."
        />

        {selected === null ? (
          <>
            <div className="mb-4 flex justify-end">
              <button
                onClick={() => setBuyOpen(true)}
                className="relative inline-flex items-center gap-1.5 rounded-full border border-red-500/50 bg-gradient-to-r from-red-500/20 via-red-500/10 to-red-500/20 text-red-100 px-4 py-2 text-xs md:text-sm font-bold shadow-[0_0_20px_rgba(239,68,68,0.45)] hover:shadow-[0_0_28px_rgba(239,68,68,0.75)] hover:scale-[1.02] transition-all"
                title="Beli token dari Token Bank"
              >
                <ShoppingCart className="h-4 w-4" />
                Beli Token
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
              {visibleProviders.map((p) => (
                <ProviderDashboardCard
                  key={p.key}
                  provider={p.key}
                  label={p.label}
                  onOpen={() => {
                    setTab(p.key);
                    setSelected(p.key);
                  }}
                />
              ))}
            </div>
            {buyOpen && <BuyTokenDialog onClose={() => setBuyOpen(false)} />}
          </>
        ) : (
        <Card>
          <div className="mb-4">
            <button
              onClick={() => setSelected(null)}
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card/50 px-3.5 py-1.5 text-xs font-semibold hover:bg-sidebar-accent/40"
            >
              ← Semua Provider
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-2 mb-4">
            {/* Single big provider selector with rotating light border */}
            <div className="w-full lg:w-[calc(66.666%-0.5rem)] relative">
              <button
                type="button"
                onClick={() => setTabOpen((v) => !v)}
                className="group relative w-full overflow-hidden rounded-xl p-[2px] text-left"
                aria-haspopup="listbox"
                aria-expanded={tabOpen}
              >
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute left-1/2 top-1/2 h-[260%] w-[160%] -translate-x-1/2 -translate-y-1/2 animate-[spin_5s_linear_infinite] opacity-90"
                  style={{
                    background: `conic-gradient(from 0deg, transparent 0deg, transparent 200deg, ${PROVIDER_GLOW[tab]} 280deg, #ffffff 315deg, ${PROVIDER_GLOW[tab]} 340deg, transparent 360deg)`,
                  }}
                />
                <span
                  className="relative flex min-h-[84px] items-center justify-between gap-3 rounded-[10px] bg-[oklch(0.19_0.055_275)] px-5 py-4"
                  style={{ boxShadow: `inset 0 0 40px color-mix(in oklab, ${PROVIDER_GLOW[tab]}, transparent 85%)` }}
                >
                  <span className="min-w-0">
                    <span className="block truncate font-display text-2xl md:text-3xl font-black tracking-wide" style={{ color: PROVIDER_GLOW[tab], textShadow: `0 0 18px color-mix(in oklab, ${PROVIDER_GLOW[tab]}, transparent 55%)` }}>
                      {active.label}
                    </span>
                  </span>
                  <ChevronDown
                    className={["h-5 w-5 shrink-0 text-muted-foreground transition-transform", tabOpen ? "rotate-180" : ""].join(" ")}
                  />
                </span>
              </button>

              {tabOpen && (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => setTabOpen(false)} aria-hidden="true" />
                  <ul
                    role="listbox"
                    className="absolute left-0 right-0 top-full mt-2 z-40 grid grid-cols-1 md:grid-cols-2 gap-2 rounded-2xl border border-border bg-[oklch(0.19_0.055_275)] p-2 shadow-2xl max-h-[60vh] overflow-y-auto"
                  >
                    {visibleProviders.map((p) => {
                      const isActive = p.key === tab;
                      const glow = PROVIDER_GLOW[p.key];
                      return (
                        <li key={p.key}>
                          <button
                            type="button"
                            onClick={() => {
                              setTab(p.key);
                              setTabOpen(false);
                            }}
                            className="w-full text-left rounded-xl border px-4 py-3 transition hover:bg-sidebar-accent/30"
                            style={{
                              borderColor: isActive ? glow : "transparent",
                              boxShadow: isActive ? `0 0 18px ${glow}55` : `inset 0 0 0 1px ${glow}22`,
                            }}
                          >
                            <span className="flex items-center gap-2">
                              <span
                                className="h-2.5 w-2.5 rounded-full shrink-0"
                                style={{ background: glow, boxShadow: `0 0 10px ${glow}` }}
                              />
                              <span className="text-sm font-semibold">{p.label}</span>
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </>
              )}
            </div>


            <div className="ml-auto flex items-center gap-2 w-full md:w-auto justify-end">
              <button
                onClick={() => setBuyOpen(true)}
                className="relative inline-flex items-center gap-1.5 rounded-full border border-red-500/50 bg-gradient-to-r from-red-500/20 via-red-500/10 to-red-500/20 text-red-100 px-3.5 py-2 text-xs md:text-sm font-semibold md:font-bold md:px-5 md:py-2.5 shadow-[0_0_14px_rgba(239,68,68,0.35)] md:shadow-[0_0_20px_rgba(239,68,68,0.55)] hover:shadow-[0_0_28px_rgba(239,68,68,0.75)] hover:scale-[1.02] transition-all"
                title="Beli token dari Token Bank"
              >
                <ShoppingCart className="h-3.5 w-3.5 md:h-4 md:w-4" />
                Beli Token
              </button>

              <button
                onClick={() => setShowKeys((v) => !v)}
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card/50 px-3 py-1.5 text-xs font-medium hover:bg-sidebar-accent/40"
                title={showKeys ? "Sembunyikan daftar key" : "Tampilkan daftar key"}
              >
                {showKeys ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                {showKeys ? "Hide" : "View"}
              </button>
            </div>
          </div>


          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 flex flex-col gap-4">
              {!showKeys ? (
                <CompactSummary provider={tab} onView={() => setShowKeys(true)} tick={syncTick} />
              ) : (
                <>
                  {tab === "brain" && <BrainPane key={paneKey} />}
                  {tab === "weavy" && <WeavyPane key={paneKey} onOpenImport={() => setShowImport(true)} />}
                  {tab === "wavespeed" && (
                    <ProviderKeyPane
                      key={paneKey}
                      provider="wavespeed"
                      lsKey={LS.wavespeed}
                      singlePlaceholder="wsk_live_..."
                      bulkPlaceholder={"wsk_live_XXX...\nwsk_live_YYY..."}
                      helper="Balance dicek via api.wavespeed.ai/api/v3/balance. Dapatkan key di wavespeed.ai."
                    />
                  )}
                  {tab === "magnific" && (
                    <ProviderKeyPane
                      key={paneKey}
                      provider="magnific"
                      lsKey={LS.magnific}
                      singlePlaceholder="FPSX... (Magnific/Freepik API key)"
                      bulkPlaceholder={"FPSX-XXXX...\nFPSX-YYYY..."}
                      helper="Magnific dipakai untuk Motion Control (Kling motion transfer via api.magnific.com)."
                    />
                  )}
                  {tab === "roboneo" && (
                    <ProviderKeyPane
                      key={paneKey}
                      provider="roboneo"
                      lsKey={LS.roboneo}
                      singlePlaceholder="_v2NGMz... (Roboneo access-token)"
                      bulkPlaceholder={"_v2NGMzMThk...\n_v2ABCDEF..."}
                      helper="Roboneo access-token = login-session token (per docs roboneo.com/cli). Token tersimpan di akun kamu (localStorage + user_tokens server, sinkron antar device). Saat generate mendeteksi credit/quota habis atau token invalid, token itu otomatis dihapus dan flow lanjut rotate ke token berikutnya."
                    />
                  )}
                  {tab === "dola" && (
                    <ProviderKeyPane
                      key={paneKey}
                      provider="dola"
                      lsKey={LS.dola}
                      singlePlaceholder="i18next=en-GB; sessionid=...; sid_guard=...; msToken=... (cookie penuh dola.com)"
                      bulkPlaceholder={"sessionid=aaa...; sid_guard=...\nsessionid=bbb...; sid_guard=..."}
                      helper="Dola memakai cookie session (bukan API key). Cara termudah: pakai extension AA Creative — login di www.dola.com lalu klik Ambil Token, cookie tersinkron otomatis ke akunmu. Manual: DevTools → Network → request ke www.dola.com → copy seluruh header Cookie. Multi-cookie (multi akun) auto-rotate saat expired."
                    />
                  )}
                  {tab === "firefly" && (
                    <ProviderKeyPane
                      key={paneKey}
                      provider="firefly"
                      lsKey={LS.firefly}
                      singlePlaceholder="eyJhbGciOiJSUzI1NiIsIng1dSI6... (Adobe Firefly Bearer token)"
                      bulkPlaceholder={"eyJhbGciOiJS...\neyJhbGciOiJS..."}
                      helper="Firefly Bearer = IMS access token dari firefly.adobe.com (~24 jam). Token tersimpan di akunmu (localStorage + user_tokens server) dan TIDAK auto-terhapus — hanya ditandai saat gagal. Multi-token auto-rotate saat 401/credit habis."
                    />
                  )}
                  {tab === "framia" && (
                    <ProviderKeyPane
                      key={paneKey}
                      provider="framia"
                      lsKey={LS.framia}
                      singlePlaceholder="eyJhbGciOiJSUzI1NiIsInR5c... (Framia Bearer JWT)"
                      bulkPlaceholder={"eyJhbGciOiJS...\neyJhbGciOiJS..."}
                      helper="Framia Bearer JWT = auth0 session token (~24 jam). Sekali disimpan, tersimpan permanen di akunmu (localStorage + user_tokens server, sinkron antar device) dan TIDAK auto-terhapus meski expired — hanya ditandai. Multi-token akan auto-rotate. Semua node (skills) dan recipe (templates) tampil di halaman Generate → Framia begitu token aktif."
                    />
                  )}
                  {tab === "leonardo" && (
                    <ProviderKeyPane
                      key={paneKey}
                      provider="leonardo"
                      lsKey={LS.leonardo}
                      singlePlaceholder="eyJraWQiOi... (Leonardo Cognito Bearer JWT)"
                      bulkPlaceholder={"eyJraWQi...\neyJraWQi..."}
                      helper="Leonardo Cognito ID token (~1 jam). Sekali disimpan, tersimpan permanen di akunmu (localStorage + user_tokens server, sinkron antar device) dan TIDAK auto-terhapus meski expired — hanya ditandai. Multi-token akan auto-rotate. Halaman Generate → Leonardo akan aktif begitu token tersimpan."
                    />
                  )}
                  {tab === "eleven" && <ElevenPane key={paneKey} />}
                  {tab === "render" && <RenderPane key={paneKey} />}
                </>
              )}
            </div>

            <div className="neumorph p-4 h-fit">
              <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Info</div>
              <div className="mt-1 font-display text-base text-foreground">{active.label}</div>
              <p className="mt-2 text-xs text-muted-foreground leading-relaxed">{active.desc}</p>
              <div className="mt-4 rounded-lg border border-border/60 bg-card/40 p-3 text-[11px] leading-relaxed text-muted-foreground">
                🔒 Key dienkripsi (AES-GCM) di database akunmu & cache browser dipisahkan per akun. Otomatis tersinkron ketika kamu login di perangkat lain.
              </div>
              <HowToGet provider={tab} />
            </div>
          </div>
        </Card>
        )}

        {showImport && <ImportModal onClose={() => setShowImport(false)} />}
        {summary && <SummaryDialog payload={summary} onClose={() => setSummary(null)} />}
        {selected !== null && buyOpen && <BuyTokenDialog onClose={() => setBuyOpen(false)} />}
      </DashboardShell>
    </SummaryCtx.Provider>
  );
}

/** Compact per-provider summary shown when detail panel is hidden. */
function CompactSummary({
  provider,
  onView,
  tick,
}: {
  provider: ProviderKey;
  onView: () => void;
  tick: number;
}) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    // Read localStorage without mutating; support all shapes used by panes.
    let n = 0;
    try {
      const raw = localStorage.getItem(
        provider === "brain"
          ? LS.brain
          : provider === "weavy"
            ? LS.weavy
            : provider === "wavespeed"
              ? LS.wavespeed
              : provider === "magnific"
                ? LS.magnific
                : provider === "roboneo"
                  ? LS.roboneo
                  : provider === "framia"
                    ? LS.framia
                    : provider === "leonardo"
                      ? LS.leonardo
                      : provider === "firefly"
                      ? LS.firefly
                      : provider === "dola"
                      ? LS.dola
                      : provider === "eleven"
                        ? LS.eleven
                        : LS.shotstack,
      );
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) n = parsed.length;
        else if (parsed && Array.isArray(parsed.keys)) n = parsed.keys.length;
      }
      if (provider === "render") {
        // Sum shotstack + creatomate for Render tab.
        const ss = JSON.parse(localStorage.getItem(LS.shotstack) ?? "[]");
        const cm = JSON.parse(localStorage.getItem(LS.creatomate) ?? "[]");
        n = (Array.isArray(ss) ? ss.length : 0) + (Array.isArray(cm) ? cm.length : 0);
      }
    } catch {
      n = 0;
    }
    setCount(n);
  }, [provider, tick]);

  const label = providers.find((p) => p.key === provider)?.label ?? provider;

  return (
    <div className="neumorph p-6 flex flex-col items-center text-center gap-3">
      <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
        {label}
      </div>
      <div className="font-display text-3xl text-gradient">{count}</div>
      <div className="text-xs text-muted-foreground">
        key tersimpan (tersembunyi). Klik View untuk kelola / tambah key.
      </div>
      <button
        onClick={onView}
        className="inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold text-primary-foreground"
        style={{ background: "var(--gradient-neon)" }}
      >
        <Eye className="h-3.5 w-3.5" />
        View {count > 0 ? `(${count})` : ""}
      </button>
    </div>
  );
}



/* ============ How to get API keys — per provider ============ */
type GuideStep = { text: string; code?: string; link?: { url: string; label: string } };
type Guide = {
  url: string;
  urlLabel: string;
  prefix?: string;
  steps: GuideStep[];
  tip?: string;
};

const GUIDES: Record<ProviderKey, Guide> = {
  brain: {
    url: "https://aistudio.google.com/api-keys",
    urlLabel: "aistudio.google.com/api-keys",
    prefix: "AIza… / AQ…",
    steps: [
      { text: "Buka Google AI Studio dan login pakai akun Google." },
      { text: 'Klik tombol "Create API key" (pojok kanan atas).' },
      { text: 'Pilih project Google Cloud (atau "Create API key in new project").' },
      { text: "Copy key yang muncul — bisa diawali AIza… (legacy) atau AQ… (auth key baru)." },
      { text: "Paste ke textarea di sebelah. Boleh tambah banyak key sekaligus (1 per baris) untuk auto-rotate saat kena limit gratis." },
    ],
    tip: "Free tier Gemini: 15 request/menit, 1 juta token/hari untuk gemini-2.5-flash. Format AQ… adalah auth key baru Gemini dan tetap valid sebagai API key.",
  },
  weavy: {
    url: "https://drive.google.com/file/d/1xJEUv31VdzF8FVXPzfcpRcnq8ahV3_8w/view?usp=sharing",
    urlLabel: "Weavy Token Extractor",
    
    steps: [
      { text: "Download Weavy Token Extractor (klik link di atas)." },
      { text: "Ekstrak / unzip file yang sudah di-download." },
      { text: "Buka Manager Extension di browser (mis. chrome://extensions)." },
      { text: "Aktifkan Developer mode di pojok kanan atas Manager Extension." },
      { text: "Klik tombol Load unpacked." },
      { text: "Cari folder Weavy Token Extension yang sudah di-ekstrak tadi, lalu Select Folder." },
      { text: "Pin Weavy Token Extension agar muncul di taskbar atas browser." },
      { text: "Buka ", link: { url: "https://app.weavy.ai", label: "app.weavy.ai" }, code: undefined },
      { text: "Klik icon Weavy Token di taskbar → klik Extract Token, lalu klik Copy Token." },
      { text: "Paste token ke Bulk Input di sebelah dan simpan. Ulangi untuk tiap akun Weavy — makin banyak, makin besar credit pool." },
    ],
    tip: "Refresh token Weavy berumur panjang. Bila expired, ulangi langkah Extract Token dari extension.",
  },

  wavespeed: {
    url: "https://wavespeed.ai/accesskey",
    urlLabel: "wavespeed.ai/accesskey",
    prefix: "wsk_live_…",
    steps: [
      { text: "Register/login di wavespeed.ai." },
      { text: "Buka menu Dashboard → API Keys." },
      { text: 'Klik "Create API Key", beri nama (mis. "aatools"), copy key wsk_live_…' },
      { text: "Top-up saldo minimal $5 di menu Billing (bayar per detik video, mulai $0.04/s)." },
      { text: "Paste key ke input di sebelah, klik Cek Saldo untuk verifikasi balance USD." },
    ],
    tip: "1 klip 5 detik Kling v2.1 Standard ≈ $0.25. Saldo $5 = ±20 klip.",
  },
  roboneo: {
    url: "https://www.roboneo.com/cli/en",
    urlLabel: "roboneo.com/cli",
    prefix: "_v2… (ROBONEO_ACCESS_KEY dari CLI — long-lived)",
    steps: [
      { text: "REKOMENDASI: pakai access-key dari Roboneo CLI supaya token tetap hidup meski browser di-logout." },
      { text: "Install CLI di terminal: `npm install -g roboneo-cli` lalu jalankan `roboneo login` (browser akan terbuka untuk otorisasi)." },
      { text: "Setelah login sukses, CLI menampilkan `export ROBONEO_ACCESS_KEY=_v2…` — copy string setelah `=` (tanpa tanda kutip)." },
      { text: "Paste ke input di sebelah. Key ini long-lived (bulan+), tidak mati saat kamu logout dari roboneo.com di browser." },
      { text: "Simpan beberapa key sekaligus (multi-akun) → auto-rotate saat rate-limit / credit habis. Token tersimpan di akunmu, sinkron antar device, dan bisa di-transfer via Token Bank." },
      { text: "Alternatif (session token, cepat expired): DevTools → Application → Local Storage → https://www.roboneo.com → copy value `access-token`." },
    ],
    tip: "Model yang didukung: Kling 2.6 Std (motion control + i2v), Seedance Pro, Google Omni. Panduan resmi: roboneo.com/cli/en.",
  },
  dola: {
    url: "https://www.dola.com/chat/",
    urlLabel: "dola.com",
    prefix: "sessionid=…; sid_guard=… (cookie session penuh)",
    steps: [
      { text: "REKOMENDASI: install extension AA Creative, login di www.dola.com, lalu klik Ambil Token — cookie tersinkron otomatis." },
      { text: "Manual: login di www.dola.com, buka DevTools (F12) → tab Network." },
      { text: "Klik salah satu request ke www.dola.com → bagian Request Headers → copy seluruh nilai header 'Cookie'." },
      { text: "Paste ke input di sebelah (harus mengandung sessionid). Simpan beberapa cookie akun berbeda untuk auto-rotate." },
    ],
    tip: "Cookie Dola bisa expired saat kamu logout di browser — ambil ulang lewat extension bila generate gagal 401.",
  },
  firefly: {
    url: "https://firefly.adobe.com/",
    urlLabel: "firefly.adobe.com",
    prefix: "eyJhbGci... (Adobe IMS Bearer token)",
    steps: [
      { text: "Login di firefly.adobe.com dengan Adobe ID." },
      { text: "Buka DevTools (F12) → tab Network → filter 'firefly.adobe.io'." },
      { text: "Klik salah satu request (mis. credits/balance) → Headers → copy value header `authorization` TANPA kata 'Bearer '." },
      { text: "Paste ke input di sebelah lalu simpan — sisa credit langsung dicek via /v1/credits/balance." },
      { text: "Simpan beberapa token (multi-akun) → auto-rotate saat 401 / credit habis." },
    ],
    tip: "Firefly dipakai untuk Image (Firefly Image 3/4) dan Video (Veo 3.1 via Firefly). Token IMS berumur ±24 jam; kalau expired ulangi langkah copy token.",
  },
  framia: {
    url: "https://framia.converge.ai/",
    urlLabel: "framia.converge.ai",
    prefix: "eyJhbGci... (Auth0 Bearer JWT)",
    steps: [
      { text: "Login di framia.converge.ai (Google / email — akun Framia)." },
      { text: "Buka DevTools (F12) → tab Network → filter 'api.framia.pro'." },
      { text: "Klik salah satu request (mis. /video/api/v1/user/credits) → Headers → Request Headers." },
      { text: 'Copy value header "authorization" — HANYA bagian setelah "Bearer " (dimulai dengan eyJ...).' },
      { text: "Paste ke input di sebelah. Token JWT berumur ~24 jam; setelah expired, ambil ulang dari Network tab." },
      { text: "Multi-token akan auto-rotate saat quota / expiry habis. Token tersimpan permanen di akunmu dan sinkron antar device." },
    ],
    tip: "Framia = platform canvas. Semua node (skills) dan recipe (templates) muncul otomatis di halaman Generate → Framia begitu token tersimpan.",
  },
  leonardo: {
    url: "https://app.leonardo.ai/",
    urlLabel: "app.leonardo.ai",
    prefix: "eyJ... (Cognito Bearer JWT, ~1 jam)",
    steps: [
      { text: "Login di app.leonardo.ai (Google / email)." },
      { text: "Buka DevTools (F12) → tab Network → filter 'api.leonardo.ai'." },
      { text: "Klik salah satu request GraphQL → Headers → Request Headers." },
      { text: 'Copy value header "authorization" — HANYA bagian setelah "Bearer " (dimulai dengan eyJ...).' },
      { text: "Paste ke input di sebelah. Token Cognito berumur ~1 jam; setelah expired, ambil ulang dari Network tab (multi-token akan auto-rotate)." },
    ],
    tip: "Model default: Phoenix, Leonardo Diffusion XL, Kino XL, Anime XL, Vision XL — semua otomatis muncul di halaman Generate → Leonardo.",
  },
  magnific: {
    url: "https://www.magnific.com/api",
    urlLabel: "magnific.com/api",
    prefix: "FPSX…",
    steps: [
      { text: "Magnific sekarang bagian dari Freepik — daftar / login di freepik.com." },
      { text: "Buka Freepik API dashboard (link di samping)." },
      { text: 'Aktifkan API access, lalu klik "Generate API Key". Format key: FPSX-XXXX…' },
      { text: "Beli/aktifkan plan Freepik AI yang include Magnific credits (Motion Control butuh video credits)." },
      { text: "Paste key ke input di sebelah." },
    ],
    tip: "Motion Control (Kling motion transfer) ≈ 50 Freepik cr per klip 5 detik.",
  },
  eleven: {
    url: "https://elevenlabs.io/app/developers/api-keys",
    urlLabel: "elevenlabs.io/app/developers/api-keys",
    prefix: "sk_… (xi-api-key)",
    steps: [
      { text: "Register/login di elevenlabs.io (free tier: 10.000 karakter/bulan)." },
      { text: "Buka menu Profile → API Keys (atau klik link di samping)." },
      { text: 'Klik "Create API Key", beri nama, centang scope Text-to-Speech.' },
      { text: "Copy key sk_… — HANYA muncul sekali, simpan aman." },
      { text: "Paste ke textarea di sebelah. Multi-key akan auto-rotate saat quota habis." },
    ],
    tip: "Model Multilingual v2 = 1 karakter / 1 credit. Turbo v2.5 = 0.5 credit / karakter (setengah biaya, latency rendah).",
  },
  render: {
    url: "https://shotstack.io/dashboard/",
    urlLabel: "shotstack.io / creatomate.com",
    prefix: "shotstack: … | creatomate: …",
    steps: [
      { text: "Default render pakai FFmpeg WASM di browser (gratis, tanpa key). Cloud render hanya perlu bila video > 400 MB." },
      { text: "Shotstack: register di shotstack.io → Dashboard → API Keys. Free tier 20 menit/bulan." },
      { text: "Creatomate: register di creatomate.com → Project Settings → API. Free tier 50 render/bulan." },
      { text: "Paste key di panel Shotstack / Creatomate di sebelah. Bila kosong, dropdown Render engine akan disabled." },
    ],
    tip: "FFmpeg = default, gratis, di device kamu. Cloud = fallback untuk file besar / batch panjang.",
  },
};

function HowToGet({ provider }: { provider: ProviderKey }) {
  const g = GUIDES[provider];
  return (
    <div className="mt-4 rounded-lg border border-primary/30 bg-primary/5 p-3">
      <div className="text-[10px] font-mono uppercase tracking-widest text-primary/80">Cara Dapat Token</div>
      <a
        href={g.url}
        target="_blank"
        rel="noreferrer"
        className="mt-1 inline-flex items-center gap-1.5 text-sm text-primary hover:underline font-medium break-all"
      >
        <ExternalLink className="h-3.5 w-3.5 shrink-0" />
        {g.urlLabel}
      </a>
      {g.prefix && (
        <div className="mt-1 text-[10px] text-muted-foreground">
          Format key: <code className="text-foreground/85">{g.prefix}</code>
        </div>
      )}
      <ol className="mt-2.5 list-decimal pl-4 space-y-1.5 text-[11px] text-muted-foreground leading-relaxed">
        {g.steps.map((s, i) => (
          <li key={i}>
            {s.text}
            {s.link && (
              <a
                href={s.link.url}
                target="_blank"
                rel="noreferrer"
                className="text-primary underline hover:text-primary/80"
              >
                {s.link.label}
              </a>
            )}
            {s.link && " dan login akun Weavy kamu."}
            {s.code && (
              <pre className="mt-1 rounded-md bg-black/50 border border-border p-2 overflow-x-auto text-[9px] font-mono text-foreground/80 whitespace-pre-wrap break-all">
                {s.code}
              </pre>
            )}
          </li>
        ))}
      </ol>
      {g.tip && (
        <div className="mt-2.5 rounded-md bg-amber-500/10 border border-amber-500/30 p-2 text-[10.5px] text-amber-200/90 leading-relaxed">
          💡 {g.tip}
        </div>
      )}
    </div>
  );
}

/* ============ BRAIN (Gemini bulk) ============ */
type BrainKeyStatus = {
  key: string;
  state: "unknown" | "checking" | "active" | "invalid" | "limited" | "failed";
  detail?: string;
};

async function checkGeminiKey(key: string): Promise<BrainKeyStatus> {
  // Cheap probe: list models. 200 = valid; 400/401/403 = invalid; 429 = rate-limited.
  try {
    const r = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models?pageSize=1",
      { headers: { "x-goog-api-key": key } },
    );
    if (r.ok) {
      const data = (await r.json().catch(() => ({}))) as { models?: unknown[] };
      const n = Array.isArray(data.models) ? data.models.length : 0;
      return { key, state: "active", detail: n > 0 ? `OK · ${n}+ model tersedia` : "OK" };
    }
    const txt = (await r.text().catch(() => "")).slice(0, 160);
    if (r.status === 429) return { key, state: "limited", detail: "429 · quota / rate-limit" };
    if (r.status === 401 || r.status === 403 || r.status === 400)
      return { key, state: "invalid", detail: `${r.status} · key ditolak` };
    return { key, state: "failed", detail: `${r.status} · ${txt || "gagal"}` };
  } catch (e) {
    return { key, state: "failed", detail: (e as Error).message };
  }
}

export function BrainPane() {
  const [bulk, setBulk] = useState("");
  const [status, setStatus] = useState("");
  const [checks, setChecks] = useState<BrainKeyStatus[]>([]);
  const [stored, setStored] = useState<string[]>([]);
  const [progress, setProgress] = useState<{ show: boolean; pct: number; text: string }>({ show: false, pct: 0, text: "" });
  const [busy, setBusy] = useState(false);
  const showSummary = useSummaryDialog();

  useEffect(() => {
    const keys = readJSON<string[]>(LS.brain, []);
    setStored(keys);
    const savedChecks = readJSON<BrainKeyStatus[]>(LS.brainChecks, []).filter((c) => keys.includes(c.key));
    setChecks(savedChecks);
    setStatus(keys.length ? `${keys.length} key tersimpan` : "Belum ada key");
    // Auto-check key yang belum punya status (mis. baru saja ditransfer dari
    // admin) supaya info sisa credit langsung tampil di baris tabel — sama
    // seperti flow saat user manual input.
    const uncheckedKeys = keys.filter((k) => !savedChecks.some((c) => c.key === k));
    if (uncheckedKeys.length === 0) return;
    let cancelled = false;
    (async () => {
      const results: BrainKeyStatus[] = [...savedChecks];
      for (const k of uncheckedKeys) {
        if (cancelled) return;
        const r = await checkGeminiKey(k);
        results.push(r);
        if (!cancelled) {
          writeJSON(LS.brainChecks, results);
          setChecks([...results]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Persist checks so status survives tab switches / remounts.
  const saveChecks = (next: BrainKeyStatus[]) => {
    setChecks(next);
    writeJSON(LS.brainChecks, next);
  };

  const parse = (raw: string) =>
    raw
      .split(/[\n,]/)
      .map((s) => s.trim())
      .filter(Boolean);

  const isValidFormat = (k: string) => /^AIza[A-Za-z0-9_-]{20,}$/.test(k) || /^AQ[.A-Za-z0-9_-]{20,}$/.test(k);

  const tambah = async () => {
    const raw = parse(bulk);
    if (raw.length === 0) return;
    setBusy(true);
    const existing = new Set(stored);
    const toCheck = Array.from(new Set(raw)).filter((k) => !existing.has(k));
    if (toCheck.length === 0) {
      setStatus("Semua key sudah tersimpan");
      setBulk("");
      setBusy(false);
      return;
    }
    const badFormat = toCheck.filter((k) => !isValidFormat(k));
    const goodFormat = toCheck.filter(isValidFormat);
    setProgress({ show: true, pct: 5, text: `Validasi ${goodFormat.length} key…` });
    const results: BrainKeyStatus[] = [];
    const accepted: string[] = [];
    for (let i = 0; i < goodFormat.length; i++) {
      const r = await checkGeminiKey(goodFormat[i]);
      results.push(r);
      if (r.state === "active" || r.state === "limited") accepted.push(goodFormat[i]);
      flushSync(() => setProgress({ show: true, pct: Math.round(((i + 1) / goodFormat.length) * 100), text: `Cek ${i + 1}/${goodFormat.length}` }));
      await new Promise((res) => setTimeout(res, 15));
    }
    const merged = Array.from(new Set([...stored, ...accepted]));
    writeJSON(LS.brain, merged);
    setStored(merged);
    // Preserve prior statuses for keys not re-tested this round.
    const mergedChecks = [
      ...checks.filter((c) => merged.includes(c.key) && !results.some((r) => r.key === c.key)),
      ...results,
    ];
    saveChecks(mergedChecks);
    setProgress({ show: false, pct: 0, text: "" });
    setBulk("");
    const a = results.filter((r) => r.state === "active").length;
    const l = results.filter((r) => r.state === "limited").length;
    const invalid = results.filter((r) => r.state === "invalid").length;
    const failed = results.filter((r) => r.state === "failed").length;
    const dup = raw.length - toCheck.length;
    setStatus(`Total tersimpan: ${merged.length} · ✅ ${a} aktif · ⏳ ${l} limit · ❌ ${invalid + failed + badFormat.length} ditolak`);
    setBusy(false);
    showSummary({
      title: "Ringkasan Import Gemini Key",
      rows: [
        { label: "Total input", value: raw.length },
        { label: "Duplikat (sudah tersimpan)", value: dup, tone: "muted" },
        { label: "Format salah", value: badFormat.length, tone: badFormat.length ? "bad" : "muted" },
        { label: "Berhasil ditambahkan", value: accepted.length, tone: "ok" },
        { label: "  – Aktif", value: a, tone: "ok" },
        { label: "  – Rate-limited (tetap disimpan)", value: l, tone: "warn" },
        { label: "Invalid / ditolak", value: invalid, tone: invalid ? "bad" : "muted" },
        { label: "Gagal / error", value: failed, tone: failed ? "bad" : "muted" },
      ],
      footer: `Total key tersimpan sekarang: ${merged.length}`,
    });
  };

  const clear = () => {
    writeJSON(LS.brain, []);
    writeJSON(LS.brainChecks, []);
    setStored([]);
    setChecks([]);
    setStatus("🗑 Semua key dihapus");
  };

  const checkAll = async () => {
    if (stored.length === 0) return;
    setBusy(true);
    setChecks(stored.map((k) => ({ key: k, state: "checking" as const })));
    setProgress({ show: true, pct: 5, text: `Cek ${stored.length} key…` });
    const results: BrainKeyStatus[] = [];
    for (let i = 0; i < stored.length; i++) {
      const r = await checkGeminiKey(stored[i]);
      results.push(r);
      saveChecks([...results, ...stored.slice(i + 1).map((k) => ({ key: k, state: "checking" as const }))]);
      flushSync(() => setProgress({ show: true, pct: Math.round(((i + 1) / stored.length) * 100), text: `Cek ${i + 1}/${stored.length}` }));
      await new Promise((res) => setTimeout(res, 15));
    }
    saveChecks(results);
    setProgress({ show: false, pct: 0, text: "" });
    const a = results.filter((r) => r.state === "active").length;
    const l = results.filter((r) => r.state === "limited").length;
    const invalid = results.filter((r) => r.state === "invalid").length;
    const failed = results.filter((r) => r.state === "failed").length;
    setStatus(`✅ ${a} aktif · ⏳ ${l} limit · ❌ ${invalid + failed} bermasalah (dari ${stored.length})`);
    setBusy(false);
    showSummary({
      title: "Ringkasan Cek Gemini Key",
      rows: [
        { label: "Total key dicek", value: stored.length },
        { label: "Aktif", value: a, tone: "ok" },
        { label: "Rate-limited", value: l, tone: "warn" },
        { label: "Invalid / ditolak", value: invalid, tone: invalid ? "bad" : "muted" },
        { label: "Gagal / error", value: failed, tone: failed ? "bad" : "muted" },
      ],
    });
  };

  const mask = (k: string) => (k.length <= 12 ? k : `${k.slice(0, 6)}…${k.slice(-4)}`);
  const badge = (s: BrainKeyStatus["state"]) => {
    switch (s) {
      case "active": return "text-emerald-300 bg-emerald-500/10 border-emerald-500/30";
      case "limited": return "text-amber-300 bg-amber-500/10 border-amber-500/30";
      case "invalid":
      case "failed": return "text-rose-300 bg-rose-500/10 border-rose-500/30";
      case "checking": return "text-sky-300 bg-sky-500/10 border-sky-500/30";
      default: return "text-muted-foreground bg-muted/30 border-border";
    }
  };
  const label = (s: BrainKeyStatus["state"]) =>
    ({ active: "Active", limited: "Rate-limited", invalid: "Invalid", failed: "Failed", checking: "Checking…", unknown: "—" }[s]);

  const canAdd = bulk.trim().length > 0 && !busy;
  const hasStored = stored.length > 0;

  return (
    <>
      <Textarea
        rows={6}
        value={bulk}
        onChange={(e) => setBulk(e.target.value)}
        placeholder={"AIzaXXXX...\nAQ.XXXX...\nAIzaYYYY..."}
        className="font-mono text-xs"
      />

      <div className="flex flex-wrap gap-2">
        <PrimaryButton onClick={tambah} disabled={!canAdd}>
          <Plus className="h-3.5 w-3.5" /> Tambah
        </PrimaryButton>
        <GhostButton onClick={checkAll} disabled={!hasStored || busy}>
          <RefreshCw className={`h-3.5 w-3.5 ${busy ? "animate-spin" : ""}`} /> Cek Limit & Status
        </GhostButton>
        <GhostButton onClick={clear} disabled={!hasStored} className="text-destructive hover:text-destructive disabled:opacity-40">
          <Trash2 className="h-3.5 w-3.5" /> Hapus Semua
        </GhostButton>
      </div>
      {status && <div className="text-[11px] text-muted-foreground">{status}</div>}
      {progress.show && (
        <div className="rounded-md border border-border bg-card/40 p-2">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div className="h-full bg-primary transition-all" style={{ width: `${progress.pct}%` }} />
          </div>
          <div className="mt-1 text-[10px] text-muted-foreground">{progress.text}</div>
        </div>
      )}
      {stored.length > 0 && (
        <div className="mt-1 space-y-1.5">
          <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Key tersimpan ({stored.length})</div>
          {stored.map((k, i) => {
            const c = checks.find((x) => x.key === k);
            const state = c?.state ?? "unknown";
            return (
              <div key={i} className="flex items-center justify-between gap-2 rounded-md border border-border/60 bg-card/40 px-2.5 py-1.5">
                <code className="text-[11px] font-mono text-foreground/85 truncate">{mask(k)}</code>
                <div className="flex items-center gap-2 shrink-0">
                  {c?.detail && <span className="text-[10px] text-muted-foreground truncate max-w-[220px]">{c.detail}</span>}
                  <span className={`text-[10px] px-2 py-0.5 rounded-full border ${badge(state)}`}>{label(state)}</span>
                  <button
                    onClick={() => {
                      const next = stored.filter((x) => x !== k);
                      writeJSON(LS.brain, next);
                      setStored(next);
                      saveChecks(checks.filter((x) => x.key !== k));
                      setStatus(next.length ? `${next.length} key tersimpan` : "🗑 Semua key dihapus");
                    }}
                    className="inline-flex items-center gap-1 rounded-full border border-border bg-card/60 px-1.5 py-0.5 text-[10px] text-muted-foreground hover:text-destructive hover:border-destructive/50 transition"
                    title="Hapus key ini"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

/* ============ WEAVY (refresh token pool) ============ */
export function WeavyPane({ onOpenImport }: { onOpenImport: () => void }) {
  const [bulkTokenText, setBulkTokenText] = useState("");
  const [list, setList] = useState<WeavyTok[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ show: boolean; pct: number; text: string }>({ show: false, pct: 0, text: "" });
  const showSummary = useSummaryDialog();

  useEffect(() => {
    const initial = readJSON<WeavyTok[]>(LS.weavy, []);
    setList(initial);
    setActiveId(readJSON<string | null>(LS.active, null));
    const onStore = () => {
      setList(readJSON<WeavyTok[]>(LS.weavy, []));
      setActiveId(readJSON<string | null>(LS.active, null));
    };
    window.addEventListener("storage", onStore);
    // Auto-check token yang credits masih null / pending (mis. baru transfer
    // dari admin) supaya sisa credit langsung tampil.
    const pending = initial.filter((t) => t.credits === null || t.status === "pending");
    let cancelled = false;
    if (pending.length > 0) {
      (async () => {
        let working = [...initial];
        for (const t of pending) {
          if (cancelled) return;
          try {
            const res = await checkWeavyToken(t.token);
            const updated: WeavyTok = res.ok
              ? {
                  ...t,
                  email: res.email ?? t.email,
                  credits: res.credits,
                  status:
                    res.credits === null
                      ? "pending"
                      : res.credits >= MIN_WEAVY_CREDITS
                        ? "active"
                        : "empty",
                }
              : { ...t, status: "failed", credits: null };
            working = working.map((x) => (x.id === t.id ? updated : x));
            if (!cancelled) {
              writeJSON(LS.weavy, working);
              setList(working);
            }
          } catch {
            /* ignore */
          }
        }
      })();
    }
    return () => {
      cancelled = true;
      window.removeEventListener("storage", onStore);
    };
  }, []);

  // Silent auto-check every 30 minutes: refresh credits, rotate away from
  // any active token whose balance drops below MIN_WEAVY_CREDITS.
  useEffect(() => {
    const tick = async () => {
      const stored = readJSON<WeavyTok[]>(LS.weavy, []);
      if (stored.length === 0) return;
      let changed = false;
      const next = [...stored];
      for (let i = 0; i < next.length; i++) {
        const t = next[i];
        try {
          const res = await checkWeavyToken(t.token);
          const updated: WeavyTok = res.ok
            ? {
                ...t,
                email: res.email ?? t.email,
                credits: res.credits,
                status: res.credits === null ? "pending" : res.credits >= MIN_WEAVY_CREDITS ? "active" : "empty",
              }
            : { ...t, status: "failed", credits: null };
          if (JSON.stringify(updated) !== JSON.stringify(t)) {
            next[i] = updated;
            changed = true;
          }
        } catch {
          /* ignore transient */
        }
      }
      if (changed) {
        writeJSON(LS.weavy, next);
        setList(next);
      }
      const currentActive = readJSON<string | null>(LS.active, null);
      const active = next.find((x) => x.id === currentActive);
      if (!active || active.status !== "active" || (active.credits ?? 0) < MIN_WEAVY_CREDITS) {
        if (currentActive) {
          const rotated = await rotateWeavyToken(currentActive);
          if (rotated) setActiveId(rotated.id);
        } else {
          const got = await getActiveWeavyAccessToken();
          if (got) setActiveId(got.id);
        }
      }
    };
    const iv = setInterval(tick, 30 * 60 * 1000);
    return () => clearInterval(iv);
  }, []);


  const persist = (next: WeavyTok[]) => {
    setList(next);
    writeJSON(LS.weavy, next);
  };

  const totalCredits = useMemo(() => list.reduce((a, t) => a + (t.credits ?? 0), 0), [list]);
  const activeCount = list.filter((t) => t.status === "active").length;
  const emptyCount = list.filter((t) => t.status === "empty").length;
  const activeTok = list.find((t) => t.id === activeId);

  const parseBulkTokens = (raw: string) =>
    raw
      .split(/[\n,]/)
      .map((s) => s.trim())
      .filter(Boolean);

  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const isValidFormat = (t: string) => /^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(t) || /^[A-Za-z0-9_-]{40,}$/.test(t);

  const tambahTokens = async (rawList: string[]) => {
    if (rawList.length === 0) return;
    setBusy(true);
    const existing = new Set(list.map((t) => t.token));
    const dedup = Array.from(new Set(rawList)).filter((t) => !existing.has(t));
    if (dedup.length === 0) {
      setStatus("Semua token sudah tersimpan");
      setBusy(false);
      return;
    }
    const badFormat = dedup.filter((t) => !isValidFormat(t));
    const good = dedup.filter(isValidFormat);
    setProgress({ show: true, pct: 5, text: `Validasi ${good.length} token…` });
    const added: WeavyTok[] = [];
    let lowCredit = 0;
    let invalidToken = 0;
    for (let i = 0; i < good.length; i++) {
      const t = good[i];
      const res = await checkWeavyToken(t);
      if (res.ok && res.credits !== null && res.credits >= MIN_WEAVY_CREDITS) {
        added.push({
          id: uid(),
          token: t,
          email: res.email,
          credits: res.credits,
          status: "active",
        });
      } else if (res.ok) {
        lowCredit++;
      } else {
        invalidToken++;
      }
      flushSync(() => setProgress({ show: true, pct: Math.round(((i + 1) / good.length) * 100), text: `Cek ${i + 1}/${good.length}` }));
      await new Promise((r) => setTimeout(r, 150));
    }
    const merged = [...list, ...added];
    persist(merged);
    if (!activeId && added[0]) {
      setActiveId(added[0].id);
      writeJSON(LS.active, added[0].id);
    }
    setProgress({ show: false, pct: 0, text: "" });
    const totalCr = added.reduce((a, x) => a + (x.credits ?? 0), 0);
    const dup = rawList.length - dedup.length;
    setStatus(`✅ ${added.length} token ditambahkan · ❌ ${badFormat.length + lowCredit + invalidToken} ditolak · +${totalCr} cr`);
    setBusy(false);
    showSummary({
      title: "Ringkasan Import Weavy Token",
      rows: [
        { label: "Total input", value: rawList.length },
        { label: "Duplikat (sudah tersimpan)", value: dup, tone: "muted" },
        { label: "Format salah", value: badFormat.length, tone: badFormat.length ? "bad" : "muted" },
        { label: "Berhasil ditambahkan", value: `${added.length}  (+${totalCr} cr)`, tone: "ok" },
        { label: `Credit habis / < ${MIN_WEAVY_CREDITS}`, value: lowCredit, tone: lowCredit ? "warn" : "muted" },
        { label: "Token invalid / expired", value: invalidToken, tone: invalidToken ? "bad" : "muted" },
      ],
      footer: `Total token tersimpan sekarang: ${merged.length}`,
    });
  };

  const importBulkInline = async () => {
    const tokens = parseBulkTokens(bulkTokenText);
    if (!tokens.length) return;
    await tambahTokens(tokens);
    setBulkTokenText("");
  };


  const remove = (id: string) => {
    const next = list.filter((t) => t.id !== id);
    persist(next);
    if (activeId === id) {
      const nid = next[0]?.id ?? null;
      setActiveId(nid);
      writeJSON(LS.active, nid);
    }
  };
  const setActive = (id: string) => {
    setActiveId(id);
    writeJSON(LS.active, id);
  };
  const clearAll = () => {
    persist([]);
    setActiveId(null);
    writeJSON(LS.active, null);
    setStatus("Semua token dihapus");
  };
  const checkAll = async () => {
    if (list.length === 0) return;
    setBusy(true);

    setProgress({ show: true, pct: 5, text: `Refreshing ${list.length} token…` });
    let working = [...list];
    for (let i = 0; i < working.length; i++) {
      const t = working[i];
      const res = await checkWeavyToken(t.token);
      const updated: WeavyTok = res.ok
        ? {
            ...t,
            email: res.email ?? t.email,
            credits: res.credits,
            status: res.credits === null ? "pending" : res.credits >= MIN_WEAVY_CREDITS ? "active" : "empty",
          }
        : { ...t, status: "failed", credits: null };
      working = working.map((x) => (x.id === t.id ? updated : x));
      persist(working);
      flushSync(() => setProgress({
        show: true,
        pct: Math.round(((i + 1) / working.length) * 100),
        text: `Checking ${i + 1}/${working.length} — ${res.ok ? (res.credits ?? "?") + " cr" : "gagal"}`,
      }));
      // small delay to avoid hammering Firebase
      await new Promise((r) => setTimeout(r, 150));
    }
    const usable = working.filter((t) => t.status === "active" && t.credits !== null && t.credits >= MIN_WEAVY_CREDITS);
    const empty = working.filter((t) => t.status === "empty").length;
    const failed = working.filter((t) => t.status === "failed").length;
    if (usable.length !== working.length) {
      persist(usable);
      const nextActive = usable.some((t) => t.id === activeId) ? activeId : usable[0]?.id ?? null;
      setActiveId(nextActive);
      writeJSON(LS.active, nextActive);
      setStatus(`✅ ${usable.length} token valid tersimpan · 🧹 ${working.length - usable.length} token dibuang (gagal/credit < ${MIN_WEAVY_CREDITS})`);
    } else {
      setStatus(`✅ ${usable.length} token valid tersimpan`);
    }
    setProgress({ show: false, pct: 0, text: "" });
    setBusy(false);
    const totalCr = usable.reduce((a, x) => a + (x.credits ?? 0), 0);
    showSummary({
      title: "Ringkasan Cek Weavy Token",
      rows: [
        { label: "Total token dicek", value: working.length },
        { label: `Aktif (credit ≥ ${MIN_WEAVY_CREDITS})`, value: `${usable.length}  (${totalCr} cr)`, tone: "ok" },
        { label: `Credit habis / < ${MIN_WEAVY_CREDITS}`, value: empty, tone: empty ? "warn" : "muted" },
        { label: "Invalid / gagal refresh", value: failed, tone: failed ? "bad" : "muted" },
      ],
      footer: `Token tersimpan sekarang: ${usable.length}`,
    });
  };


  return (
    <>
      <Textarea
        rows={7}
        value={bulkTokenText}
        onChange={(e) => setBulkTokenText(e.target.value)}
        placeholder={"eyJhbGci...(token 1)\neyJhbGci...(token 2)\neyJhbGci...(token 3)"}
        className="font-mono text-xs"
      />


      <div className="flex gap-2 flex-wrap">
        <PrimaryButton onClick={importBulkInline} disabled={!bulkTokenText.trim() || busy}>
          <Plus className="h-3.5 w-3.5" /> Tambah
        </PrimaryButton>

        <GhostButton onClick={onOpenImport} className="w-full sm:w-auto"><Upload className="h-3.5 w-3.5" /> Import dari File</GhostButton>
        <GhostButton onClick={checkAll} disabled={list.length === 0 || busy}>
          <RefreshCw className={["h-3.5 w-3.5", busy ? "animate-spin" : ""].join(" ")} /> Cek Limit & Status
        </GhostButton>
        <GhostButton onClick={clearAll} disabled={list.length === 0} className="text-destructive hover:text-destructive disabled:opacity-40">
          <Trash2 className="h-3.5 w-3.5" /> Hapus Semua
        </GhostButton>
      </div>


      {progress.show && (
        <div>
          <div className="text-[10px] text-muted-foreground mb-1">{progress.text}</div>
          <div className="h-1 rounded-full bg-border overflow-hidden">
            <div className="h-full transition-all" style={{ width: `${progress.pct}%`, background: "var(--gradient-neon)" }} />
          </div>
        </div>
      )}

      {list.length > 0 && (
        <div className="rounded-xl border border-border/70 bg-card/40 p-3 flex flex-col gap-2">
          <div className="flex items-center gap-3 flex-wrap text-xs">
            <span className="text-muted-foreground">💰 Total: <b className="text-emerald-400">{totalCredits}</b> cr</span>
            <span className="text-muted-foreground">·</span>
            <span className="text-muted-foreground">👤 <b className="text-fuchsia-300">{activeTok?.user || activeTok?.token.slice(0, 8) || "-"}</b></span>
            <span className="text-muted-foreground">·</span>
            <span>
              <b className="text-emerald-400">{activeCount}</b> active <b className="text-rose-400 ml-1">{emptyCount}</b> empty
            </span>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2">
        {list.map((t) => (
          <div
            key={t.id}
            className={[
              "flex items-center gap-2 rounded-xl border px-3 py-2 text-xs",
              t.id === activeId ? "border-primary/60 bg-primary/5" : "border-border bg-card/40",
            ].join(" ")}
          >
            <span
              className={[
                "h-2.5 w-2.5 shrink-0 rounded-full",
                t.status === "active" ? "bg-emerald-400" : t.status === "empty" ? "bg-rose-400" : t.status === "failed" ? "bg-red-500" : "bg-amber-400",
              ].join(" ")}
              title={t.id === activeId ? "Aktif (auto)" : t.status}
            />
            <div className="font-mono truncate text-muted-foreground flex-1" title={t.email || t.token}>
              {t.email ? <span className="text-foreground/80">{t.email}</span> : `${t.token.slice(0, 32)}…`}
            </div>
            <div className="text-emerald-400 font-semibold whitespace-nowrap">{t.credits == null ? "— cr" : `${t.credits} cr`}</div>
            <button
              onClick={() => remove(t.id)}
              className="inline-flex items-center gap-1 rounded-full border border-border bg-card/60 px-2 py-1 text-[10px] text-muted-foreground hover:text-destructive hover:border-destructive/50 transition"
              title="Hapus token"
            >
              <Trash2 className="h-3.5 w-3.5" /> Hapus
            </button>
          </div>
        ))}
        {list.length === 0 && (
          <div className="text-[11px] text-muted-foreground italic px-1">Belum ada token. Paste bulk token di atas, import dari file, atau pakai Single Token.</div>
        )}
      </div>


    </>
  );
}

/* ============ Wavespeed / Magnific reusable ============ */
export function ProviderKeyPane({
  lsKey,
  bulkPlaceholder,
  helper,
  provider,
}: {
  lsKey: string;
  singlePlaceholder?: string;
  bulkPlaceholder: string;
  helper: string;
  provider: "wavespeed" | "magnific" | "roboneo" | "framia" | "leonardo" | "firefly" | "dola";
}) {
  const [bulk, setBulk] = useState("");
  const [list, setList] = useState<SimpleKey[]>([]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [progress, setProgress] = useState<{ show: boolean; pct: number; text: string }>({ show: false, pct: 0, text: "" });
  const showSummary = useSummaryDialog();

  useEffect(() => {
    const rawInitial = readJSON<SimpleKey[]>(lsKey, []);
    const initial = provider === "roboneo"
      ? rawInitial.map((x) =>
          x.note && /struktur|payload berisi uid|format resmi/i.test(x.note)
            ? { ...x, note: undefined }
            : x,
        )
      : rawInitial;
    setList(initial);
    if (provider === "roboneo" && JSON.stringify(initial) !== JSON.stringify(rawInitial)) {
      writeJSON(lsKey, initial);
    }
    // Auto-probe key yang balance null / status pending (mis. baru saja
    // ditransfer oleh admin dari Token Bank) supaya sisa saldo langsung tampil.
    const pending = initial.filter((x) => provider === "roboneo" || x.balance == null || x.status === "pending");
    if (pending.length === 0) return;
    let cancelled = false;
    (async () => {
      let working = [...initial];
      for (const x of pending) {
        if (cancelled) return;
        try {
          let updated: SimpleKey;
          if (provider === "wavespeed") {
            const res = await checkWavespeedBalance(x.key);
            updated = {
              ...x,
              balance: res.balance,
              status: res.ok ? (res.balance && res.balance > 0 ? "active" : "empty") : "failed",
            };
          } else if (provider === "roboneo") {
            const bal = await fetchRoboneoBalance(x.key);
            updated = {
              ...x,
              balance: bal.balance,
              status: bal.ok ? (bal.balance != null && bal.balance <= 0 ? "empty" : "active") : "failed",
              note: bal.ok ? undefined : bal.message,
            };
          } else if (provider === "framia") {
            const chk = await checkFramiaToken(x.key);
            if (!chk.ok) {
              updated = { ...x, balance: null, status: "failed", note: chk.message };
            } else {
              const bal = await fetchFramiaBalance(x.key);
              updated = {
                ...x,
                balance: bal.balance,
                status: bal.ok ? (bal.balance != null && bal.balance <= 0 ? "empty" : "active") : "active",
                note: bal.ok ? chk.email || chk.plan : bal.message,
              };
            }
          } else if (provider === "firefly") {
            const bal = await fetchFireflyBalance(x.key);
            updated = {
              ...x,
              balance: bal.balance,
              status: bal.ok ? (bal.balance != null && bal.balance <= 0 ? "empty" : "active") : "failed",
              note: bal.ok ? bal.plan : bal.message,
            };
          } else if (provider === "leonardo") {
            const chk = await checkLeonardoToken(x.key);
            if (!chk.ok) {
              updated = { ...x, balance: null, status: "failed", note: chk.message };
            } else {
              const bal = await fetchLeonardoBalance(x.key);
              const breakdown = bal.ok
                ? `Subscription ${bal.fastTokens ?? 0} · Rollover ${bal.rolloverTokens ?? 0} · GPT ${bal.gptTokens ?? 0} · Model ${bal.modelTokens ?? 0} · Paid ${bal.paidTokens ?? 0}${bal.apiCredit != null ? ` · API ${bal.apiCredit}` : ""}${chk.email || bal.email ? ` · ${chk.email || bal.email}` : ""}`
                : bal.message;
              updated = {
                ...x,
                balance: bal.balance,
                status: bal.ok ? (bal.balance != null && bal.balance <= 0 ? "empty" : "active") : "active",
                note: breakdown,
              };
            }
          } else {
            const res = await checkMagnificKey(x.key);
            updated = { ...x, balance: null, status: res.ok ? "active" : "failed", note: res.balance };
          }
          working = working.map((y) => (y.id === x.id ? updated : y));
          if (!cancelled) {
            writeJSON(lsKey, working);
            setList(working);
          }
        } catch {
          /* ignore */
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [lsKey, provider]);
  const persist = (next: SimpleKey[]) => {
    setList(next);
    writeJSON(lsKey, next);
  };
  const parseBulk = (raw: string) =>
    // Cookie Dola boleh mengandung koma (mis. Expires) → pisah per baris saja.
    raw.split(provider === "dola" ? /\n/ : /[\n,]/).map((s) => s.trim()).filter(Boolean);

  const isValidFormat = (key: string) =>
    provider === "wavespeed"
      ? /^wsk_[A-Za-z0-9_-]{8,}$/i.test(key) || /^ws_[A-Za-z0-9_-]{8,}$/i.test(key)
      : provider === "roboneo"
        ? /^_v2[A-Za-z0-9+/=_-]{20,}$/i.test(key)
        : provider === "framia" || provider === "leonardo" || provider === "firefly"
          ? /^eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(key)
          : provider === "dola"
            ? // Dola = cookie session penuh, bukan JWT. Cukup ada salah satu cookie sesi.
              /(?:^|;\s*)(sessionid|sessionid_ss|sid_tt|sid_guard|session_id|uid_tt|uid_tt_ss|passport_csrf_token|passport_auth_status)=/i.test(key)
            : /^FPSX[A-Za-z0-9_-]{8,}$/i.test(key) || /^FP[A-Za-z0-9_-]{8,}$/i.test(key);

  const probe = async (key: string): Promise<SimpleKey> => {
    if (provider === "dola") {
      const ok = await checkDolaCookie(key);
      return {
        id: uid(),
        key,
        balance: null,
        status: ok ? "active" : "failed",
        note: ok ? "cookie session aktif" : "cookie ditolak Dola (mungkin sudah expired)",
      };
    }
    if (provider === "wavespeed") {
      const res = await checkWavespeedBalance(key);
      return {
        id: uid(),
        key,
        balance: res.balance,
        status: res.ok ? (res.balance && res.balance > 0 ? "active" : "empty") : "failed",
      };
    }
    if (provider === "roboneo") {
      const bal = await fetchRoboneoBalance(key);
      return {
        id: uid(),
        key,
        balance: bal.balance,
        status: bal.ok ? (bal.balance != null && bal.balance <= 0 ? "empty" : "active") : "failed",
        note: bal.ok ? undefined : bal.message,
      };
    }
    if (provider === "framia") {
      const chk = await checkFramiaToken(key);
      if (!chk.ok) return { id: uid(), key, balance: null, status: "failed", note: chk.message };
      const bal = await fetchFramiaBalance(key);
      return {
        id: uid(),
        key,
        balance: bal.balance,
        status: bal.ok ? (bal.balance != null && bal.balance <= 0 ? "empty" : "active") : "active",
        note: chk.email || chk.plan || bal.message,
      };
    }
    if (provider === "firefly") {
      const chk = await checkFireflyToken(key);
      if (!chk.ok) return { id: uid(), key, balance: null, status: "failed", note: chk.message };
      const bal = await fetchFireflyBalance(key);
      return {
        id: uid(),
        key,
        balance: bal.balance,
        status: bal.ok ? (bal.balance != null && bal.balance <= 0 ? "empty" : "active") : "active",
        note: bal.plan || bal.message,
      };
    }
    if (provider === "leonardo") {
      const chk = await checkLeonardoToken(key);
      if (!chk.ok) return { id: uid(), key, balance: null, status: "failed", note: chk.message };
      const bal = await fetchLeonardoBalance(key);
      const breakdown = bal.ok
        ? `Subscription ${bal.fastTokens ?? 0} · Rollover ${bal.rolloverTokens ?? 0} · GPT ${bal.gptTokens ?? 0} · Model ${bal.modelTokens ?? 0} · Paid ${bal.paidTokens ?? 0}${bal.apiCredit != null ? ` · API ${bal.apiCredit}` : ""}${chk.email || bal.email ? ` · ${chk.email || bal.email}` : ""}`
        : bal.message;
      return {
        id: uid(),
        key,
        balance: bal.balance,
        status: bal.ok ? (bal.balance != null && bal.balance <= 0 ? "empty" : "active") : "active",
        note: breakdown,
      };
    }

    const res = await checkMagnificKey(key);
    return { id: uid(), key, balance: null, status: res.ok ? "active" : "failed", note: res.balance };
  };

  const tambah = async () => {
    const raw = parseBulk(bulk);
    if (raw.length === 0) return;
    setBusy(true);
    const existing = new Set(list.map((x) => x.key));
    const dedup = Array.from(new Set(raw)).filter((key) => !existing.has(key));
    if (dedup.length === 0) {
      setStatus("Semua key sudah tersimpan");
      setBulk(""); setBusy(false);
      return;
    }
    const badFormat = dedup.filter((key) => !isValidFormat(key));
    const good = dedup.filter(isValidFormat);
    setProgress({ show: true, pct: 5, text: `Validasi ${good.length} key…` });
    const added: SimpleKey[] = [];
    let empty = 0;
    let failed = 0;
    for (let i = 0; i < good.length; i++) {
      const item = await probe(good[i]);
      if (item.status === "active") added.push(item);
      else if (item.status === "empty") { empty++; added.push(item); }
      else failed++;
      flushSync(() => setProgress({ show: true, pct: Math.round(((i + 1) / good.length) * 100), text: `Cek ${i + 1}/${good.length}` }));
      await new Promise((r) => setTimeout(r, 120));
    }
    const merged = [...list, ...added];
    persist(merged);
    setProgress({ show: false, pct: 0, text: "" });
    setBulk("");
    const total = merged.reduce((a, x) => a + (x.balance ?? 0), 0);
    const summary = provider === "wavespeed"
      ? `Total saldo tersimpan: $${total.toFixed(2)} · ${merged.length} key`
      : provider === "roboneo" || provider === "framia" || provider === "leonardo" || provider === "firefly" || provider === "dola"
        ? `Total credit tersimpan: ${total.toLocaleString()} cr · ${merged.length} key`
      : `${merged.length} key tersimpan`;
    void summary;
    setBusy(false);
    const dup = raw.length - dedup.length;
    const label = provider === "wavespeed" ? "Wavespeed" : provider === "roboneo" ? "Roboneo" : provider === "framia" ? "Framia" : provider === "leonardo" ? "Leonardo" : provider === "firefly" ? "Adobe Firefly" : provider === "dola" ? "Dola" : "Magnific";
    showSummary({
      title: `Ringkasan Import ${label} Key`,
      rows: [
        { label: "Total input", value: raw.length },
        { label: "Duplikat (sudah tersimpan)", value: dup, tone: "muted" },
        { label: "Format salah", value: badFormat.length, tone: badFormat.length ? "bad" : "muted" },
        { label: "Berhasil ditambahkan", value: added.length, tone: "ok" },
        { label: "Aktif (saldo tersedia)", value: added.length - empty, tone: "ok" },
        { label: "Saldo kosong (tetap disimpan)", value: empty, tone: empty ? "warn" : "muted" },
        { label: "Ditolak (invalid / gagal)", value: failed, tone: failed ? "bad" : "muted" },
      ],
      footer:
        `Total key tersimpan sekarang: ${merged.length}` +
        (provider === "roboneo" || provider === "framia" || provider === "leonardo" || provider === "firefly" || provider === "dola"
          ? ` · Total credit: ${total.toLocaleString()} cr`
          : ""),
    });
  };

  const remove = (id: string) => persist(list.filter((x) => x.id !== id));
  const clearAll = () => {
    persist([]);
    setStatus("🗑 Semua key dihapus");
  };
  const checkAll = async () => {
    if (list.length === 0) return;
    setBusy(true);
    setProgress({ show: true, pct: 5, text: `Checking ${list.length} key…` });
    let working = [...list];
    for (let i = 0; i < working.length; i++) {
      const x = working[i];
      let updated: SimpleKey;
      if (provider === "wavespeed") {
        const res = await checkWavespeedBalance(x.key);
        updated = { ...x, balance: res.balance, status: res.ok ? (res.balance && res.balance > 0 ? "active" : "empty") : "failed" };
      } else if (provider === "roboneo") {
        const bal = await fetchRoboneoBalance(x.key);
        updated = {
          ...x,
          balance: bal.balance,
          status: bal.ok ? (bal.balance != null && bal.balance <= 0 ? "empty" : "active") : "failed",
          note: bal.ok ? undefined : bal.message,
        };
      } else if (provider === "framia") {
        const chk = await checkFramiaToken(x.key);
        if (!chk.ok) {
          updated = { ...x, balance: null, status: "failed", note: chk.message };
        } else {
          const bal = await fetchFramiaBalance(x.key);
          updated = {
            ...x,
            balance: bal.balance,
            status: bal.ok ? (bal.balance != null && bal.balance <= 0 ? "empty" : "active") : "active",
            note: chk.email || chk.plan || bal.message,
          };
        }
      } else if (provider === "firefly") {
        const bal = await fetchFireflyBalance(x.key);
        updated = {
          ...x,
          balance: bal.balance,
          status: bal.ok ? (bal.balance != null && bal.balance <= 0 ? "empty" : "active") : "failed",
          note: bal.ok ? bal.plan : bal.message,
        };
      } else if (provider === "leonardo") {
        const chk = await checkLeonardoToken(x.key);
        if (!chk.ok) {
          updated = { ...x, balance: null, status: "failed", note: chk.message };
        } else {
          const bal = await fetchLeonardoBalance(x.key);
          updated = {
            ...x,
            balance: bal.balance,
            status: bal.ok ? (bal.balance != null && bal.balance <= 0 ? "empty" : "active") : "active",
            note: bal.ok
              ? `Subscription ${bal.fastTokens ?? 0} · Rollover ${bal.rolloverTokens ?? 0} · GPT ${bal.gptTokens ?? 0} · Model ${bal.modelTokens ?? 0} · Paid ${bal.paidTokens ?? 0}${bal.apiCredit != null ? ` · API ${bal.apiCredit}` : ""}${chk.email || bal.email ? ` · ${chk.email || bal.email}` : ""}`
              : bal.message,
          };
        }
      } else {
        const res = await checkMagnificKey(x.key);
        updated = { ...x, balance: null, status: res.ok ? "active" : "failed", note: res.balance };
      }
      working = working.map((y) => (y.id === x.id ? updated : y));
      persist(working);
      flushSync(() =>
        setProgress({
          show: true,
          pct: Math.round(((i + 1) / working.length) * 100),
          text:
            provider === "roboneo" && updated.balance !== null
              ? `Cek ${i + 1}/${working.length} — ${updated.balance.toLocaleString()} cr`
              : `Checking ${i + 1}/${working.length}`,
        }),
      );
      await new Promise((r) => setTimeout(r, 120));
    }
    setBusy(false);
    setProgress({ show: false, pct: 0, text: "" });
    const active = working.filter((x) => x.status === "active").length;
    const emp = working.filter((x) => x.status === "empty").length;
    const failed = working.filter((x) => x.status === "failed").length;
    const totBal = working.reduce((a, x) => a + (x.balance ?? 0), 0);
    const label = provider === "wavespeed" ? "Wavespeed" : provider === "roboneo" ? "Roboneo" : provider === "framia" ? "Framia" : provider === "leonardo" ? "Leonardo" : provider === "firefly" ? "Adobe Firefly" : provider === "dola" ? "Dola" : "Magnific";
    showSummary({
      title: `Ringkasan Cek ${label} Key`,
      rows: [
        { label: "Total key dicek", value: working.length },
        {
          label: "Aktif",
          value:
            provider === "wavespeed"
              ? `${active}  ($${totBal.toFixed(2)})`
              : provider === "roboneo" || provider === "framia" || provider === "leonardo" || provider === "firefly" || provider === "dola"
                ? `${active}  (${totBal} credit)`
                : active,
          tone: "ok",
        },

        { label: "Saldo kosong", value: emp, tone: emp ? "warn" : "muted" },
        { label: "Invalid / gagal", value: failed, tone: failed ? "bad" : "muted" },
      ],
    });
  };

  const total = list.reduce((a, x) => a + (x.balance ?? 0), 0);
  const activeCount = list.filter((x) => x.status === "active").length;
  const hasStored = list.length > 0;
  const canAdd = bulk.trim().length > 0 && !busy;

  return (
    <>
      <Textarea
        rows={5}
        value={bulk}
        onChange={(e) => setBulk(e.target.value)}
        placeholder={bulkPlaceholder}
        className="font-mono text-xs"
      />


      <div className="flex gap-2 flex-wrap">
        <PrimaryButton onClick={tambah} disabled={!canAdd}>
          <Plus className="h-3.5 w-3.5" /> Tambah
        </PrimaryButton>

        <GhostButton onClick={checkAll} disabled={!hasStored || busy}>
          <RefreshCw className={["h-3.5 w-3.5", busy ? "animate-spin" : ""].join(" ")} /> Cek Limit & Status
        </GhostButton>
        <GhostButton onClick={clearAll} disabled={!hasStored} className="text-destructive hover:text-destructive disabled:opacity-40">
          <Trash2 className="h-3.5 w-3.5" /> Hapus Semua
        </GhostButton>
      </div>

      {list.length > 0 && (
        <div className="text-[11px] text-muted-foreground">
          {`Total tersimpan: ${list.length} · ✅ ${list.filter((x) => x.status === "active").length} aktif · ⏳ ${list.filter((x) => x.status === "empty").length} limit · ❌ ${list.filter((x) => x.status === "failed").length} ditolak`}
        </div>
      )}
      {status && <div className="text-[11px] text-muted-foreground">{status}</div>}


      {progress.show && (
        <div className="rounded-lg border border-border bg-card/40 p-2 text-[11px]">
          <div className="flex justify-between text-muted-foreground mb-1">
            <span>{progress.text}</span>
            <span>{progress.pct}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-black/40 overflow-hidden">
            <div className="h-full" style={{ width: `${progress.pct}%`, background: "var(--gradient-neon)" }} />
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2">
        {list.map((x) => (
            <div key={x.id} className="flex flex-col gap-1 rounded-xl border border-border bg-card/40 px-3 py-2 text-xs">
            <div className="flex items-center gap-2">
              <span
                className={[
                  "h-2.5 w-2.5 rounded-full shrink-0",
                  x.status === "active" ? "bg-emerald-400" : x.status === "empty" ? "bg-rose-400" : x.status === "failed" ? "bg-red-500" : "bg-amber-400",
                ].join(" ")}
                title={x.status}
              />
              <div className="font-mono truncate text-muted-foreground flex-1">{x.key.slice(0, 12)}…{x.key.slice(-4)}</div>
              <div className="text-emerald-400 font-semibold whitespace-nowrap tabular-nums">
                {provider === "wavespeed"
                  ? x.balance == null ? "—" : `$${x.balance.toFixed(2)}`
                  : provider === "roboneo"
                    ? x.balance == null
                      ? x.status === "failed" ? "❌" : "— cr"
                      : `${x.balance.toLocaleString()} cr`
                  : provider === "framia" || provider === "leonardo" || provider === "firefly"
                    ? x.balance == null
                      ? x.status === "failed" ? "❌" : x.status === "active" ? "OK" : "…"
                      : `${x.balance.toLocaleString()} cr`
                    : x.status === "active" ? "OK" : x.status === "failed" ? "❌" : "…"}
              </div>
              <button onClick={() => remove(x.id)} className="inline-flex items-center gap-1 rounded-full border border-border bg-card/60 px-2 py-1 text-[10px] text-muted-foreground hover:text-destructive hover:border-destructive/50 transition">
                <Trash2 className="h-3.5 w-3.5" /> Hapus
              </button>
            </div>
            {x.note && (provider !== "roboneo" || x.status === "failed") && (
              <div className="pl-4 text-[10px] text-muted-foreground/80 truncate" title={x.note}>
                {x.note}
              </div>
            )}
          </div>
        ))}
        {list.length === 0 && <div className="text-[11px] text-muted-foreground italic px-1">Belum ada key.</div>}
      </div>
      <div className="text-[11px] text-muted-foreground leading-relaxed">{helper}</div>
    </>
  );
}

/* ============ Eleven (bulk keys + voice) ============ */
type ElevenCfg = { keys: string[]; voice: string; customVoice: string };
const voices = [
  { value: "JBFqnCBsd6RMkjVDRZzb", label: "George (male, warm narrator)" },
  { value: "EXAVITQu4vr4xnSDxMaL", label: "Sarah (female, clear)" },
  { value: "FGY2WhTYpPnrIDTdsKH5", label: "Laura (female, energetic)" },
  { value: "cgSgspJ2msm6clMCkdW9", label: "Jessica (female, expressive)" },
  { value: "onwK4e9ZLuTAKqWW03F9", label: "Daniel (male, deep)" },
  { value: "TX3LPaxmHKxFdv7VOQHJ", label: "Liam (male, young)" },
  { value: "pFZP5JQG7iQjIQuC4Bku", label: "Lily (female, soft)" },
  { value: "nPczCjzI2devNBz1zQrb", label: "Brian (male, storyteller)" },
];
const emptyEleven: ElevenCfg = { keys: [], voice: voices[0].value, customVoice: "" };

type ElevenKeyStatus = { key: string; ok: boolean; remaining: number | null; limit: number; tier?: string; method?: string; note?: string; reason?: string };

export function ElevenPane() {
  const [cfg, setCfg] = useState<ElevenCfg>(emptyEleven);
  const [bulk, setBulk] = useState("");
  const [status, setStatus] = useState("");
  const [keyStatuses, setKeyStatuses] = useState<ElevenKeyStatus[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ show: boolean; pct: number; text: string }>({ show: false, pct: 0, text: "" });
  const showSummary = useSummaryDialog();

  useEffect(() => {
    const stored = readJSON<ElevenCfg | { apiKey?: string; voice?: string; customVoice?: string }>(LS.eleven, emptyEleven);
    const migrated: ElevenCfg =
      "keys" in stored && Array.isArray((stored as ElevenCfg).keys)
        ? (stored as ElevenCfg)
        : {
            keys: (stored as { apiKey?: string }).apiKey ? [(stored as { apiKey?: string }).apiKey!] : [],
            voice: (stored as { voice?: string }).voice || voices[0].value,
            customVoice: (stored as { customVoice?: string }).customVoice || "",
          };
    setCfg(migrated);
    const savedStatuses = readJSON<ElevenKeyStatus[]>(LS.elevenChecks, []).filter((s) => migrated.keys.includes(s.key));
    setKeyStatuses(savedStatuses);
    // Auto-check key yang belum punya status tersimpan (mis. baru dikirim
    // admin) — jalankan tes suara 1 kata via checkElevenKey.
    const unchecked = migrated.keys.filter((k) => !savedStatuses.some((s) => s.key === k));
    if (unchecked.length === 0) return;
    let cancelled = false;
    (async () => {
      const results: ElevenKeyStatus[] = [...savedStatuses];
      for (const k of unchecked) {
        if (cancelled) return;
        const r = await checkElevenKey(k);
        const canUse = r.ok && (r.remaining === null || r.remaining >= MIN_ELEVEN_CREDITS);
        results.push({
          key: k,
          ok: canUse,
          remaining: r.remaining,
          limit: r.characterLimit,
          tier: r.tier,
          method: r.method,
          note: r.note,
          reason: !r.ok ? "tes suara gagal" : !canUse ? `credit < ${MIN_ELEVEN_CREDITS}` : undefined,
        });
        if (!cancelled) {
          writeJSON(LS.elevenChecks, results);
          setKeyStatuses([...results]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Persist statuses so "Valid via tes suara" survives tab switch / remount.
  const saveStatuses = (next: ElevenKeyStatus[]) => {
    setKeyStatuses(next);
    writeJSON(LS.elevenChecks, next);
  };

  const parse = (raw: string) => raw.split(/[\n,]/).map((s) => s.trim()).filter(Boolean);
  const isValidFormat = (k: string) => /^sk_[A-Za-z0-9_-]{20,}$/.test(k) || /^xi-[A-Za-z0-9-]{20,}$/.test(k);

  const tambah = async () => {
    const raw = parse(bulk);
    if (raw.length === 0) return;
    setBusy(true);
    const existing = new Set(cfg.keys);
    const dedup = Array.from(new Set(raw)).filter((k) => !existing.has(k));
    if (dedup.length === 0) {
      setStatus("Semua key sudah tersimpan");
      setBulk(""); setBusy(false);
      return;
    }
    const badFormat = dedup.filter((k) => !isValidFormat(k));
    const good = dedup.filter(isValidFormat);
    const results: ElevenKeyStatus[] = [];
    const accepted: string[] = [];
    setProgress({ show: true, pct: 5, text: `Cek ${good.length} key…` });
    for (let i = 0; i < good.length; i++) {
      const k = good[i];
      const r = await checkElevenKey(k);
      const canSave = r.ok && (r.remaining === null || r.remaining >= MIN_ELEVEN_CREDITS);
      results.push({
        key: k,
        ok: canSave,
        remaining: r.remaining,
        limit: r.characterLimit,
        tier: r.tier,
        method: r.method,
        note: r.note,
        reason: !r.ok ? "tes suara gagal" : !canSave ? `credit < ${MIN_ELEVEN_CREDITS}` : undefined,
      });
      if (canSave) accepted.push(k);
      flushSync(() => setProgress({ show: true, pct: Math.round(((i + 1) / good.length) * 100), text: `Cek ${i + 1}/${good.length}` }));
      await new Promise((res) => setTimeout(res, 15));
    }
    const merged = Array.from(new Set([...cfg.keys, ...accepted]));
    const next = { ...cfg, keys: merged };
    setCfg(next);
    writeJSON(LS.eleven, next);
    // Merge status baru dengan status lama, buang yang tidak lagi tersimpan
    const combined = [
      ...keyStatuses.filter((s) => merged.includes(s.key) && !results.some((r) => r.key === s.key)),
      ...results,
    ];
    saveStatuses(combined);
    setProgress({ show: false, pct: 0, text: "" });
    setBulk("");
    const okResults = results.filter((r) => r.ok);
    const readableResults = okResults.filter((r) => r.remaining !== null);
    const totalRem = readableResults.reduce((a, r) => a + (r.remaining ?? 0), 0);
    const totalLim = okResults.reduce((a, r) => a + r.limit, 0);
    const info = readableResults.length > 0
      ? `Sisa credit ${totalRem.toLocaleString()}/${totalLim.toLocaleString()} chars`
      : okResults.length > 0
        ? "valid via tes suara 1 kata; saldo tidak terbaca"
        : "tidak ada key yang lolos tes suara/saldo";
    setStatus(`✅ ${accepted.length} tersimpan · ❌ ${badFormat.length + (good.length - accepted.length)} ditolak/credit < ${MIN_ELEVEN_CREDITS} · ${info}`);
    setBusy(false);
    const dup = raw.length - dedup.length;
    const lowCredit = results.filter((r) => !r.ok && r.reason?.startsWith("credit")).length;
    const testFailed = results.filter((r) => !r.ok && r.reason === "tes suara gagal").length;
    showSummary({
      title: "Ringkasan Import ElevenLabs Key",
      rows: [
        { label: "Total input", value: raw.length },
        { label: "Duplikat (sudah tersimpan)", value: dup, tone: "muted" },
        { label: "Format salah", value: badFormat.length, tone: badFormat.length ? "bad" : "muted" },
        { label: "Berhasil ditambahkan", value: accepted.length, tone: "ok" },
        { label: `Credit habis / < ${MIN_ELEVEN_CREDITS}`, value: lowCredit, tone: lowCredit ? "warn" : "muted" },
        { label: "Invalid / tes suara gagal", value: testFailed, tone: testFailed ? "bad" : "muted" },
      ],
      footer:
        `Total key tersimpan sekarang: ${merged.length}` +
        (totalLim > 0 ? ` · Saldo agregat: ${totalRem.toLocaleString()}/${totalLim.toLocaleString()} chars` : ""),
    });
  };

  const saveVoice = () => {
    writeJSON(LS.eleven, cfg);
    setStatus("💾 Voice tersimpan");
  };
  const test = async () => {
    if (!cfg.keys.length) { setStatus("❌ Paste API key dulu"); return; }
    setStatus("🔊 Generate sample voice...");
    try {
      const r = await fetch("/api/public/elevenlabs-tts", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Eleven-Key": cfg.keys[0] },
        body: JSON.stringify({ text: "Halo, ini adalah test suara dari AA Creative Studio.", voiceId: cfg.voice }),
      });
      if (!r.ok) { const j = await r.json().catch(() => ({} as { error?: string })); throw new Error(j.error || `HTTP ${r.status}`); }
      const buf = await r.arrayBuffer();
      const url = URL.createObjectURL(new Blob([buf], { type: "audio/mpeg" }));
      new Audio(url).play().catch(() => {});
      setStatus("✅ Sample voice diputar");
    } catch (e) {
      setStatus("❌ " + ((e as Error).message || String(e)));
    }
  };
  const clear = () => {
    const next = { ...emptyEleven, voice: cfg.voice, customVoice: cfg.customVoice };
    setCfg(next);
    saveStatuses([]);
    writeJSON(LS.eleven, next);
    setStatus("🗑 Semua key dihapus");
  };
  const checkAllKeys = async () => {
    if (cfg.keys.length === 0) return;
    setBusy(true);
    setStatus(`🔍 Cek ${cfg.keys.length} ElevenLabs key…`);
    setProgress({ show: true, pct: 5, text: `Cek ${cfg.keys.length} key…` });
    const results: ElevenKeyStatus[] = [];
    for (let i = 0; i < cfg.keys.length; i++) {
      const k = cfg.keys[i];
      const r = await checkElevenKey(k);
      const canUse = r.ok && (r.remaining === null || r.remaining >= MIN_ELEVEN_CREDITS);
      results.push({
        key: k,
        ok: canUse,
        remaining: r.remaining,
        limit: r.characterLimit,
        tier: r.tier,
        method: r.method,
        note: r.note,
        reason: !r.ok ? "tes suara gagal" : !canUse ? `credit < ${MIN_ELEVEN_CREDITS}` : undefined,
      });
      saveStatuses([...results]);
      flushSync(() => setProgress({ show: true, pct: Math.round(((i + 1) / cfg.keys.length) * 100), text: `Cek ${i + 1}/${cfg.keys.length}` }));
      await new Promise((r) => setTimeout(r, 120));
    }
    const okCount = results.filter((r) => r.ok).length;
    const totalRem = results.filter((r) => r.ok && r.remaining !== null).reduce((a, r) => a + (r.remaining ?? 0), 0);
    const totalLim = results.filter((r) => r.ok).reduce((a, r) => a + r.limit, 0);
    const usableKeys = results.filter((r) => r.ok).map((r) => r.key);
    const next = { ...cfg, keys: usableKeys };
    setCfg(next);
    writeJSON(LS.eleven, next);
    saveStatuses(results.filter((r) => r.ok));
    const removed = results.length - okCount;
    const saldoInfo = totalLim > 0
      ? `Sisa credit ${totalRem.toLocaleString()}/${totalLim.toLocaleString()} chars`
      : "valid via tes suara; saldo tidak terbaca";
    setStatus(`✅ ${okCount}/${results.length} key aktif tersimpan · 🧹 ${removed} dibuang · ${saldoInfo}`);
    setProgress({ show: false, pct: 0, text: "" });
    setBusy(false);
    const lowCredit = results.filter((r) => !r.ok && r.reason?.startsWith("credit")).length;
    const testFailed = results.filter((r) => !r.ok && r.reason === "tes suara gagal").length;
    showSummary({
      title: "Ringkasan Cek ElevenLabs Key",
      rows: [
        { label: "Total key dicek", value: results.length },
        { label: "Aktif & tersimpan", value: okCount, tone: "ok" },
        { label: `Credit habis / < ${MIN_ELEVEN_CREDITS}`, value: lowCredit, tone: lowCredit ? "warn" : "muted" },
        { label: "Invalid / tes suara gagal", value: testFailed, tone: testFailed ? "bad" : "muted" },
        { label: "Dibuang", value: removed, tone: removed ? "warn" : "muted" },
      ],
      footer:
        totalLim > 0
          ? `Saldo agregat aktif: ${totalRem.toLocaleString()}/${totalLim.toLocaleString()} chars`
          : "Saldo tidak terbaca dari API",
    });
  };

  const canAdd = bulk.trim().length > 0 && !busy;
  const hasStored = cfg.keys.length > 0;

  return (
    <>
      <Textarea
        rows={5}
        value={bulk}
        onChange={(e) => setBulk(e.target.value)}
        placeholder={"sk_XXXXXXXX...\nsk_YYYYYYYY..."}
        className="font-mono text-xs"
      />
      <div className="flex flex-wrap gap-2">
        <PrimaryButton onClick={tambah} disabled={!canAdd}>
          <Plus className="h-3.5 w-3.5" /> Tambah
        </PrimaryButton>
        <GhostButton onClick={checkAllKeys} disabled={!hasStored || busy}>
          <RefreshCw className={["h-3.5 w-3.5", busy ? "animate-spin" : ""].join(" ")} /> Cek Limit & Status
        </GhostButton>
        <GhostButton onClick={clear} disabled={!hasStored} className="text-destructive hover:text-destructive disabled:opacity-40">
          <Trash2 className="h-3.5 w-3.5" /> Hapus Semua
        </GhostButton>
      </div>
      {cfg.keys.length > 0 && (
        <div className="text-[11px] text-muted-foreground">
          {`Total tersimpan: ${cfg.keys.length} · ✅ ${keyStatuses.filter((s) => s.ok).length} aktif · ❌ ${keyStatuses.filter((s) => !s.ok).length} ditolak`}
        </div>
      )}


      {cfg.keys.length > 0 && (
        <div className="flex flex-col gap-1">
          {cfg.keys.map((k, i) => {
            const s = keyStatuses.find((x) => x.key === k);
            return (
              <div key={i} className="flex items-center gap-2 rounded-lg border border-border bg-card/40 px-3 py-1.5 text-[11px]">
                <span className={["h-2 w-2 rounded-full shrink-0", s?.ok ? "bg-emerald-400" : s ? "bg-red-500" : "bg-amber-400"].join(" ")} />
                <span className="font-mono truncate text-muted-foreground flex-1">{k.slice(0, 10)}…{k.slice(-4)}</span>
                {s?.ok ? (
                  <span className="text-emerald-400 font-semibold whitespace-nowrap">
                    {s.remaining === null ? "Valid via tes suara" : `${s.remaining.toLocaleString()} / ${s.limit.toLocaleString()} chars`}{s.tier ? ` · ${s.tier}` : ""}
                  </span>
                ) : s ? (
                  <span className="text-red-400 font-semibold">{s.reason || "Ditolak"}</span>
                ) : (
                  <span className="text-muted-foreground">belum dicek</span>
                )}
                <button
                  onClick={() => {
                    const next = { ...cfg, keys: cfg.keys.filter((x) => x !== k) };
                    setCfg(next);
                    writeJSON(LS.eleven, next);
                    saveStatuses(keyStatuses.filter((x) => x.key !== k));
                  }}
                  className="inline-flex items-center gap-1 rounded-full border border-border bg-card/60 px-2 py-0.5 text-[10px] text-muted-foreground hover:text-destructive hover:border-destructive/50 transition"
                  title="Hapus key ini"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      <Field label="Voice">
        <Select options={voices} value={cfg.voice} onChange={(e) => setCfg({ ...cfg, voice: e.target.value })} />
      </Field>
      <Field label="Custom Voice ID (opsional — override dropdown)">
        <Input
          placeholder="voice id dari ElevenLabs"
          value={cfg.customVoice}
          onChange={(e) => setCfg({ ...cfg, customVoice: e.target.value })}
        />
      </Field>
      <div className="flex gap-2">
        <GhostButton onClick={saveVoice} className="flex-1">💾 Simpan Voice</GhostButton>
        <GhostButton onClick={test} className="flex-1" disabled={!hasStored}>🔊 Test</GhostButton>
      </div>
      {progress.show && (
        <div className="rounded-md border border-border bg-card/40 p-2">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div className="h-full bg-primary transition-all" style={{ width: `${progress.pct}%` }} />
          </div>
          <div className="mt-1 text-[10px] text-muted-foreground">{progress.text}</div>
        </div>
      )}
      {status && <div className="text-[11px] text-muted-foreground">{status}</div>}
      <div className="text-[11px] text-muted-foreground leading-relaxed">
        {cfg.keys.length} key aktif · dienkripsi di database akun dan hanya di-cache sementara per akun pada browser ini.
      </div>
    </>
  );
}

/* ============ Bulk Import Modal (Weavy) ============ */
export function ImportModal({ onClose }: { onClose: () => void }) {
  const [text, setText] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  const parse = (raw: string) =>
    raw
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);

  const onFile = (f?: File) => {
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => setText(String(reader.result || ""));
    reader.readAsText(f);
  };

  const isValidFormat = (t: string) => /^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(t) || /^[A-Za-z0-9_-]{40,}$/.test(t);

  const doImport = async () => {
    const tokens = parse(text);
    if (!tokens.length) return;
    setBusy(true);
    const existing = readJSON<WeavyTok[]>(LS.weavy, []);
    const existingSet = new Set(existing.map((t) => t.token));
    const candidates = Array.from(new Set(tokens)).filter((t) => !existingSet.has(t));
    const badFormat = candidates.filter((t) => !isValidFormat(t));
    const good = candidates.filter(isValidFormat);
    const added: WeavyTok[] = [];
    for (const t of good) {
      const res = await checkWeavyToken(t);
      if (res.ok && res.credits !== null && res.credits >= MIN_WEAVY_CREDITS) {
        added.push({ id: uid(), token: t, email: res.email, credits: res.credits, status: "active" });
      }
      await new Promise((r) => setTimeout(r, 150));
    }
    const merged = [...existing, ...added];
    writeJSON(LS.weavy, merged);
    if (!readJSON<string | null>(LS.active, null) && added[0]) writeJSON(LS.active, added[0].id);
    window.dispatchEvent(new Event("storage"));
    setBusy(false);
    setStatus(`✅ ${added.length} token diimport · ❌ ${badFormat.length + (good.length - added.length)} ditolak/credit < ${MIN_WEAVY_CREDITS}`);
    if (added.length > 0) onClose();
  };

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-black/70 backdrop-blur-sm p-4">
      <div className="neumorph w-full max-w-lg p-5 relative">
        <button onClick={onClose} className="absolute top-3 right-3 inline-flex items-center gap-1 rounded-full border border-border bg-card/60 px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground">
          <X className="h-3.5 w-3.5" /> Tutup
        </button>
        <div className="font-display text-lg mb-1">📋 Import Tokens</div>
        <div className="text-xs text-muted-foreground mb-4">1 token per baris. Duplikat otomatis di-skip, credit wajib minimal {MIN_WEAVY_CREDITS}.</div>

        <label className="flex flex-col items-center justify-center gap-1 rounded-2xl border border-dashed border-border/80 bg-card/30 px-4 py-6 text-center cursor-pointer hover:border-primary/60 transition mb-3">
          <FileText className="h-5 w-5 text-muted-foreground" />
          <div className="text-sm font-medium">Klik atau drag file .txt</div>
          <div className="text-[11px] text-muted-foreground">1 token per baris</div>
          <input type="file" accept=".txt,.csv" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
        </label>

        <Textarea
          rows={7}
          placeholder={"eyJhbGci...(baris 1)\neyJhbGci...(baris 2)\n..."}
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="font-mono text-xs"
        />
        <div className="flex gap-2 justify-end mt-3">
          <GhostButton onClick={onClose}>Batal</GhostButton>
          <PrimaryButton onClick={doImport} disabled={!text.trim() || busy}>{busy ? "Checking…" : "Import"}</PrimaryButton>
        </div>
        {status && <div className="mt-2 text-[11px] text-muted-foreground">{status}</div>}
      </div>
    </div>
  );
}

/* ============ Render (Shotstack + Creatomate) ============ */
export function RenderPane() {
  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl border border-primary/30 bg-primary/5 p-3 text-[11.5px] text-muted-foreground leading-relaxed">
        🎬 <b className="text-foreground">Default render = FFmpeg WASM di browser</b> (gratis, tanpa key, ≤ 400 MB).
        Isi key di bawah <b>hanya bila</b> ingin fallback ke cloud render untuk file besar / batch panjang.
      </div>
      <MiniKeyPane
        title="Shotstack"
        lsKey={LS.shotstack}
        placeholder="shotstack-api-key…"
        docHref="https://shotstack.io/dashboard/"
        docLabel="shotstack.io/dashboard"
        note="Free tier 20 menit render/bulan. Cek balance manual di dashboard Shotstack."
      />
      <MiniKeyPane
        title="Creatomate"
        lsKey={LS.creatomate}
        placeholder="crea-api-key…"
        docHref="https://creatomate.com/docs/api/introduction"
        docLabel="creatomate.com/docs"
        note="Free tier 50 render/bulan. Bearer token dari Project Settings → API."
      />
    </div>
  );
}

function MiniKeyPane({
  title, lsKey, placeholder, docHref, docLabel, note,
}: {
  title: string; lsKey: string; placeholder: string; docHref: string; docLabel: string; note: string;
}) {
  const [k, setK] = useState("");
  const [list, setList] = useState<SimpleKey[]>([]);
  const [status, setStatus] = useState("");
  useEffect(() => setList(readJSON<SimpleKey[]>(lsKey, [])), [lsKey]);
  const persist = (next: SimpleKey[]) => { setList(next); writeJSON(lsKey, next); };
  const isValidFormat = (s: string) => /^[A-Za-z0-9._-]{16,}$/.test(s);
  const add = () => {
    const key = k.trim();
    if (!key) return;
    if (list.some((x) => x.key === key)) { setStatus("Key sudah tersimpan"); setK(""); return; }
    if (!isValidFormat(key)) { setStatus("❌ Format key tidak valid (min 16 karakter alfanumerik)"); return; }
    persist([...list, { id: uid(), key, balance: null, status: "active" }]);
    setStatus(`✅ Ditambahkan · ${list.length + 1} key tersimpan`);
    setK("");
  };
  const remove = (id: string) => {
    const next = list.filter((x) => x.id !== id);
    persist(next);
    setStatus(next.length === 0 ? "🗑 Semua key dihapus" : `${next.length} key tersimpan`);
  };
  const clearAll = async () => {
    const ok = await confirmDialog({
      title: `Hapus semua ${title} key?`,
      description: "Semua key pada slot ini akan dihapus.",
      confirmLabel: "Ya, hapus semua",
      tone: "danger",
    });
    if (!ok) return;
    persist([]);
    setStatus("🗑 Semua key dihapus");
  };
  const activeCount = list.length;
  const canAdd = k.trim().length > 0;
  const hasStored = activeCount > 0;
  return (
    <div className="neumorph p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="font-display text-base">{title}</div>
        <div className={[
          "text-[11px] font-medium px-2 py-0.5 rounded-full",
          activeCount > 0
            ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30"
            : "bg-amber-500/15 text-amber-300 border border-amber-500/30",
        ].join(" ")}>
          {activeCount > 0 ? `✅ ${activeCount} key aktif` : "⚠️ Belum ada key"}
        </div>
      </div>
      <div className="flex gap-2">
        <Input type="password" placeholder={placeholder} value={k} onChange={(e) => setK(e.target.value)} />
        <PrimaryButton onClick={add} disabled={!canAdd}>
          <Plus className="h-3.5 w-3.5" /> Tambah
        </PrimaryButton>
      </div>
      <div className="flex gap-2">
        <GhostButton onClick={clearAll} disabled={!hasStored} className="text-destructive hover:text-destructive disabled:opacity-40">
          <Trash2 className="h-3.5 w-3.5" /> Hapus Semua
        </GhostButton>
      </div>
      {status && <div className="text-[11px] text-muted-foreground">{status}</div>}

      <div className="flex flex-col gap-1.5">
        {list.map((x) => (
          <div key={x.id} className="flex items-center gap-2 rounded-xl border border-border bg-card/40 px-3 py-2 text-xs">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-400 shrink-0" />
            <div className="font-mono truncate text-muted-foreground flex-1">{x.key.slice(0, 10)}…{x.key.slice(-4)}</div>
            <button onClick={() => remove(x.id)} className="inline-flex items-center gap-1 rounded-full border border-border bg-card/60 px-2 py-1 text-[10px] text-muted-foreground hover:text-destructive hover:border-destructive/50">
              <Trash2 className="h-3.5 w-3.5" /> Hapus
            </button>
          </div>
        ))}
        {list.length === 0 && <div className="text-[11px] text-muted-foreground italic px-1">Belum ada key.</div>}
      </div>
      <a href={docHref} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-[11px] text-primary hover:underline w-fit">
        <ExternalLink className="h-3 w-3" /> {docLabel}
      </a>
      <div className="text-[11px] text-muted-foreground leading-relaxed">{note}</div>
    </div>
  );
}
