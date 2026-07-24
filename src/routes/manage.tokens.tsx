import { createFileRoute } from "@tanstack/react-router";
import { flushSync } from "react-dom";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { Plus, Trash2, RefreshCw, Upload, FileText, X, ExternalLink, CheckCircle2, Eye, EyeOff, ShoppingCart, ChevronDown } from "lucide-react";
import { DashboardShell, PageHero } from "@/components/dashboard/shell";
import { Card, Field, Input, Textarea, Select, PrimaryButton, GhostButton } from "@/components/dashboard/ui";
import { checkWeavyToken, rotateWeavyToken, getActiveWeavyAccessToken } from "@/lib/providers/weavy";
import { checkWavespeedBalance } from "@/lib/providers/wavespeed";
import { checkMagnificKey } from "@/lib/providers/magnific";
import { checkRoboneoToken, fetchRoboneoBalance } from "@/lib/providers/roboneo";
import { checkElevenKey } from "@/lib/providers/eleven";
import { pushTokenAsync, ALLOWED_TOKEN_KEYS, syncTokensForUser } from "@/lib/tokens/sync";
import { useAuth } from "@/lib/auth-context";
import { BuyTokenDialog } from "@/components/token-bank/buy-dialog";
import { confirmDialog } from "@/components/ui-confirm";

/* ============ Themed Summary Dialog (replaces browser alert) ============ */
export type SummaryRow = { label: string; value: string | number; tone?: "ok" | "warn" | "bad" | "muted" };
export type SummaryPayload = { title: string; rows: SummaryRow[]; footer?: string };
const SummaryCtx = createContext<(p: SummaryPayload) => void>(() => {});
const useSummaryDialog = () => useContext(SummaryCtx);

function SummaryDialog({ payload, onClose }: { payload: SummaryPayload; onClose: () => void }) {
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
  head: () => ({
    meta: [
      { title: "Token / API Manager — AA Creative Studio" },
      { name: "description", content: "Kelola API key semua provider AI — Brain, Weavy, Wavespeed, Magnific, ElevenLabs." },
    ],
  }),
  component: TokensPage,
});

type ProviderKey = "brain" | "weavy" | "wavespeed" | "magnific" | "roboneo" | "eleven" | "render";

const providers: { key: ProviderKey; label: string; desc: string }[] = [
  { key: "brain", label: "Brain (Gemini)", desc: "Dipakai Produk Storyboard & Naratif Video Maker. Multi-key auto-rotate saat kena limit/429." },
  { key: "weavy", label: "Weavy", desc: "Provider utama Kling Motion Control, Wan, Sora, Seedance." },
  { key: "wavespeed", label: "Wavespeed", desc: "Provider alternatif — cek balance via api.wavespeed.ai/api/v3/balance." },
  { key: "magnific", label: "Magnific", desc: "Hanya dipakai untuk Motion Control (Kling motion transfer)." },
  { key: "roboneo", label: "Roboneo", desc: "Motion Control via Roboneo (Meitu) — Kling 2.6 Standard." },
  { key: "eleven", label: "ElevenLabs", desc: "Voice-over untuk Naratif Video Maker." },
  { key: "render", label: "Render (Shotstack/Creatomate)", desc: "Fallback cloud render ketika video melebihi limit FFmpeg browser (≥ 400 MB)." },
];


// ---- localStorage helpers ----
type WeavyTok = { id: string; token: string; user?: string; email?: string; credits: number | null; status: "active" | "empty" | "pending" | "failed" };
type SimpleKey = { id: string; key: string; balance: number | null; status: "active" | "empty" | "pending" | "failed"; note?: string };
const MIN_WEAVY_CREDITS = 5;
const MIN_ELEVEN_CREDITS = 50;

const LS = {
  brain: "aatools.brain.geminiKeys",
  brainChecks: "aatools.brain.checks",
  weavy: "aatools.weavy.tokens",
  wavespeed: "aatools.wavespeed.keys",
  magnific: "aatools.magnific.keys",
  roboneo: "aatools.roboneo.keys",
  eleven: "aatools.eleven",
  elevenChecks: "aatools.eleven.checks",
  shotstack: "aatools.shotstack.keys",
  creatomate: "aatools.creatomate.keys",
  active: "aatools.weavy.activeId",
};

const uid = () => Math.random().toString(36).slice(2, 10);
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
  const [tab, setTab] = useState<ProviderKey>("brain");
  const [tabOpen, setTabOpen] = useState(false);
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
    const refreshRemoteTokens = window.setInterval(() => {
      void syncTokensForUser(user.id, { force: true });
    }, 20_000);
    return () => window.clearInterval(refreshRemoteTokens);
  }, [loading, user?.id]);

  // Do NOT include syncTick in the pane key — remounting the pane every time
  // remote sync fires (every 20s) wipes local input state, causing the user's
  // freshly pasted keys to "disappear". Panes already listen to storage/sync
  // events themselves to refresh the saved list.
  const paneKey = tab;

  return (
    <SummaryCtx.Provider value={setSummary}>
      <DashboardShell>
        <PageHero
          eyebrow="Manage"
          title="Token / API"
          highlight="Manager"
          desc="Pusat kelola semua API key & token. Tersimpan terenkripsi di akun kamu — auto sync di semua perangkat."
        />

        <Card>
          <div className="flex flex-wrap items-center gap-2 mb-4">
            {/* Mobile: custom dropdown provider picker — bigger & more prominent than Beli Token */}
            <div className="w-full md:hidden relative">
              <button
                type="button"
                onClick={() => setTabOpen((v) => !v)}
                className="w-full flex items-center justify-between gap-3 rounded-2xl border border-primary/50 bg-card/60 px-4 py-4 text-base font-extrabold shadow-[0_0_22px_rgba(236,72,153,0.28)] hover:shadow-[0_0_28px_rgba(236,72,153,0.45)] transition"
                aria-haspopup="listbox"
                aria-expanded={tabOpen}
              >
                <span
                  className="bg-clip-text text-transparent tracking-wide"
                  style={{ backgroundImage: "linear-gradient(90deg,#f8fafc 0%,#cbd5e1 45%,#94a3b8 100%)" }}
                >
                  {providers.find((p) => p.key === tab)?.label ?? "Pilih provider"}
                </span>
                <ChevronDown className={["h-5 w-5 text-muted-foreground transition-transform", tabOpen ? "rotate-180" : ""].join(" ")} />
              </button>
              {tabOpen && (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => setTabOpen(false)} aria-hidden="true" />
                  <ul
                    role="listbox"
                    className="absolute left-0 right-0 top-full mt-2 z-40 rounded-2xl border border-border bg-[oklch(0.19_0.055_275)] shadow-2xl overflow-hidden max-h-[60vh] overflow-y-auto divide-y divide-border/40"
                  >
                    {providers.map((p) => {
                      const active = p.key === tab;
                      return (
                        <li key={p.key}>
                          <button
                            type="button"
                            onClick={() => {
                              setTab(p.key);
                              setTabOpen(false);
                            }}
                            className={[
                              "w-full text-left px-4 py-3 text-sm font-semibold transition",
                              active ? "text-primary-foreground" : "text-foreground/85 hover:bg-sidebar-accent/40",
                            ].join(" ")}
                            style={active ? { background: "var(--gradient-neon)" } : undefined}
                          >
                            {active ? (
                              <span
                                className="bg-clip-text text-transparent"
                                style={{ backgroundImage: "linear-gradient(90deg,#f8fafc 0%,#cbd5e1 45%,#94a3b8 100%)" }}
                              >
                                {p.label}
                              </span>
                            ) : (
                              p.label
                            )}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </>
              )}
            </div>


            {/* Desktop: pill tabs */}
            <div className="hidden md:flex flex-wrap items-center gap-2">
              {providers.map((p) => (
                <button
                  key={p.key}
                  onClick={() => setTab(p.key)}
                  className={[
                    "px-4 py-2 rounded-full text-sm font-medium transition",
                    tab === p.key
                      ? "text-primary-foreground glow-pink"
                      : "border border-border bg-card/50 text-foreground/85 hover:text-foreground",
                  ].join(" ")}
                  style={tab === p.key ? { background: "var(--gradient-neon)" } : undefined}
                >
                  {p.label}
                </button>
              ))}
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
                      helper="Roboneo access-token diambil dari cookie/localStorage roboneo.com (key: access-token). Multi-token akan auto-rotate saat quota habis."
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

        {showImport && <ImportModal onClose={() => setShowImport(false)} />}
        {summary && <SummaryDialog payload={summary} onClose={() => setSummary(null)} />}
        {buyOpen && <BuyTokenDialog onClose={() => setBuyOpen(false)} />}
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
    url: "https://www.roboneo.com/ai_flow",
    urlLabel: "roboneo.com",
    prefix: "_v2… (access-token)",
    steps: [
      { text: "Login di roboneo.com (via Google / email)." },
      { text: "Buka DevTools (F12) → tab Application → Storage → Local Storage → https://www.roboneo.com." },
      { text: 'Cari key "access-token" — copy value (format _v2… panjang).' },
      { text: "Paste ke input di sebelah. Multi-token akan auto-rotate saat quota habis." },
      { text: "⚠️ Catatan: request ke gateway Roboneo mungkin diblok CORS di browser — kalau gagal, kita perlu proxy server." },
    ],
    tip: "Model yang didukung sekarang hanya Kling V2.6 Standard (video_bonbon_motioncontrol_v26 quality=std).",
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

function BrainPane() {
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
      <div className="text-xs text-muted-foreground leading-relaxed">
        Brain (Gemini) dipakai <b className="text-foreground/90">Produk Storyboard</b> & <b className="text-foreground/90">Naratif Video Maker</b> untuk menghasilkan naskah / prompt. Tambahkan beberapa key sekaligus — sistem <b>auto-rotate</b> jika salah satu kena limit.
      </div>
      <Field label="Gemini API Keys (AIza... / AQ... — satu per baris atau pisah koma)">
        <Textarea
          rows={6}
          value={bulk}
          onChange={(e) => setBulk(e.target.value)}
          placeholder={"AIzaXXXX...\nAQ.XXXX...\nAIzaYYYY..."}
          className="font-mono text-xs"
        />
      </Field>
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
function WeavyPane({ onOpenImport }: { onOpenImport: () => void }) {
  const [token, setToken] = useState("");
  const [bulkTokenText, setBulkTokenText] = useState("");
  const [mode, setMode] = useState<"single" | "bulk">("bulk");
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

  const connect = async () => {
    if (!token.trim()) return;
    await tambahTokens([token.trim()]);
    setToken("");
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
      <div className="flex gap-1 rounded-full bg-card/40 border border-border p-1 w-fit">
        {(["single", "bulk"] as const).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={[
              "px-3 py-1 rounded-full text-xs font-medium transition",
              mode === m ? "text-primary-foreground glow-pink" : "text-muted-foreground hover:text-foreground",
            ].join(" ")}
            style={mode === m ? { background: "var(--gradient-neon)" } : undefined}
          >
            {m === "single" ? "Single Token" : "Bulk Input"}
          </button>
        ))}
      </div>

      {mode === "single" ? (
        <div className="flex gap-2">
          <Input
            type="password"
            placeholder="Paste refresh token..."
            value={token}
            onChange={(e) => setToken(e.target.value)}
          />
          <PrimaryButton onClick={connect} disabled={!token.trim() || busy}>
            <Plus className="h-3.5 w-3.5" /> Tambah
          </PrimaryButton>
        </div>
      ) : (
        <Field label="Bulk Refresh Tokens (satu per baris atau pisah koma)">
          <Textarea
            rows={7}
            value={bulkTokenText}
            onChange={(e) => setBulkTokenText(e.target.value)}
            placeholder={"eyJhbGci...(token 1)\neyJhbGci...(token 2)\neyJhbGci...(token 3)"}
            className="font-mono text-xs"
          />
        </Field>
      )}

      <div className="flex gap-2 flex-wrap">
        {mode === "bulk" && (
          <PrimaryButton onClick={importBulkInline} disabled={!bulkTokenText.trim() || busy}>
            <Plus className="h-3.5 w-3.5" /> Tambah
          </PrimaryButton>
        )}
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
function ProviderKeyPane({
  lsKey,
  singlePlaceholder,
  bulkPlaceholder,
  helper,
  provider,
}: {
  lsKey: string;
  singlePlaceholder: string;
  bulkPlaceholder: string;
  helper: string;
  provider: "wavespeed" | "magnific" | "roboneo";
}) {
  const [k, setK] = useState("");
  const [bulk, setBulk] = useState("");
  const [mode, setMode] = useState<"single" | "bulk">("single");
  const [list, setList] = useState<SimpleKey[]>([]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [progress, setProgress] = useState<{ show: boolean; pct: number; text: string }>({ show: false, pct: 0, text: "" });
  const showSummary = useSummaryDialog();

  useEffect(() => {
    const initial = readJSON<SimpleKey[]>(lsKey, []);
    setList(initial);
    // Auto-probe key yang balance null / status pending (mis. baru saja
    // ditransfer oleh admin dari Token Bank) supaya sisa saldo langsung tampil.
    const pending = initial.filter((x) => x.balance === null || x.status === "pending");
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
            const chk = await checkRoboneoToken(x.key);
            if (!chk.ok) {
              updated = { ...x, balance: null, status: "failed", note: chk.message };
            } else {
              const bal = await fetchRoboneoBalance(x.key);
              updated = {
                ...x,
                balance: bal.balance,
                status: bal.ok ? (bal.balance != null && bal.balance <= 0 ? "empty" : "active") : "active",
                note: bal.ok ? undefined : bal.message,
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
    raw.split(/[\n,]/).map((s) => s.trim()).filter(Boolean);

  const isValidFormat = (key: string) =>
    provider === "wavespeed"
      ? /^wsk_[A-Za-z0-9_-]{8,}$/i.test(key) || /^ws_[A-Za-z0-9_-]{8,}$/i.test(key)
      : provider === "roboneo"
        ? /^_v2[A-Za-z0-9+/=_-]{20,}$/i.test(key)
        : /^FPSX[A-Za-z0-9_-]{8,}$/i.test(key) || /^FP[A-Za-z0-9_-]{8,}$/i.test(key);

  const probe = async (key: string): Promise<SimpleKey> => {
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
      const chk = await checkRoboneoToken(key);
      if (!chk.ok) return { id: uid(), key, balance: null, status: "failed", note: chk.message };
      const bal = await fetchRoboneoBalance(key);
      return {
        id: uid(),
        key,
        balance: bal.balance,
        status: bal.ok ? (bal.balance != null && bal.balance <= 0 ? "empty" : "active") : "active",
        note: bal.ok ? undefined : bal.message,
      };
    }

    const res = await checkMagnificKey(key);
    return { id: uid(), key, balance: null, status: res.ok ? "active" : "failed", note: res.balance };
  };

  const tambah = async () => {
    const raw = mode === "single" ? (k.trim() ? [k.trim()] : []) : parseBulk(bulk);
    if (raw.length === 0) return;
    setBusy(true);
    const existing = new Set(list.map((x) => x.key));
    const dedup = Array.from(new Set(raw)).filter((key) => !existing.has(key));
    if (dedup.length === 0) {
      setStatus("Semua key sudah tersimpan");
      setK(""); setBulk(""); setBusy(false);
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
    setK(""); setBulk("");
    const total = merged.reduce((a, x) => a + (x.balance ?? 0), 0);
    const summary = provider === "wavespeed"
      ? `Total saldo tersimpan: $${total.toFixed(2)} · ${merged.length} key`
      : `${merged.length} key tersimpan`;
    setStatus(`✅ ${added.length} ditambahkan · ❌ ${badFormat.length + failed} ditolak · ${summary}`);
    setBusy(false);
    const dup = raw.length - dedup.length;
    const label = provider === "wavespeed" ? "Wavespeed" : provider === "roboneo" ? "Roboneo" : "Magnific";
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
      footer: `Total key tersimpan sekarang: ${merged.length}`,
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
        const chk = await checkRoboneoToken(x.key);
        if (!chk.ok) {
          updated = { ...x, balance: null, status: "failed", note: chk.message };
        } else {
          const bal = await fetchRoboneoBalance(x.key);
          updated = {
            ...x,
            balance: bal.balance,
            status: bal.ok ? (bal.balance != null && bal.balance <= 0 ? "empty" : "active") : "active",
            note: bal.ok ? undefined : bal.message,
          };
        }

      } else {
        const res = await checkMagnificKey(x.key);
        updated = { ...x, balance: null, status: res.ok ? "active" : "failed", note: res.balance };
      }
      working = working.map((y) => (y.id === x.id ? updated : y));
      persist(working);
      flushSync(() => setProgress({ show: true, pct: Math.round(((i + 1) / working.length) * 100), text: `Checking ${i + 1}/${working.length}` }));
      await new Promise((r) => setTimeout(r, 120));
    }
    setBusy(false);
    setProgress({ show: false, pct: 0, text: "" });
    const active = working.filter((x) => x.status === "active").length;
    const emp = working.filter((x) => x.status === "empty").length;
    const failed = working.filter((x) => x.status === "failed").length;
    const totBal = working.reduce((a, x) => a + (x.balance ?? 0), 0);
    const label = provider === "wavespeed" ? "Wavespeed" : provider === "roboneo" ? "Roboneo" : "Magnific";
    showSummary({
      title: `Ringkasan Cek ${label} Key`,
      rows: [
        { label: "Total key dicek", value: working.length },
        {
          label: "Aktif",
          value:
            provider === "wavespeed"
              ? `${active}  ($${totBal.toFixed(2)})`
              : provider === "roboneo"
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
  const canAdd = (mode === "single" ? k.trim().length > 0 : bulk.trim().length > 0) && !busy;

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1 rounded-full bg-card/40 border border-border p-1 w-fit">
          {(["single", "bulk"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={[
                "px-3 py-1 rounded-full text-xs font-medium transition",
                mode === m ? "text-primary-foreground glow-pink" : "text-muted-foreground hover:text-foreground",
              ].join(" ")}
              style={mode === m ? { background: "var(--gradient-neon)" } : undefined}
            >
              {m === "single" ? "Single" : "Bulk"}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2 text-[11px] text-muted-foreground">
          <span>Active: <b className="text-emerald-400">{activeCount}</b>/{list.length}</span>
          {provider === "wavespeed" && (
            <span>Total: <b className="text-emerald-400">${total.toFixed(2)}</b></span>
          )}
        </div>
      </div>

      {mode === "single" ? (
        <div className="flex gap-2">
          <Input type="password" placeholder={singlePlaceholder} value={k} onChange={(e) => setK(e.target.value)} />
          <PrimaryButton onClick={tambah} disabled={!canAdd}>
            <Plus className="h-3.5 w-3.5" /> Tambah
          </PrimaryButton>
        </div>
      ) : (
        <>
          <Field label="Bulk API Keys (satu per baris atau pisah koma)">
            <Textarea
              rows={5}
              value={bulk}
              onChange={(e) => setBulk(e.target.value)}
              placeholder={bulkPlaceholder}
              className="font-mono text-xs"
            />
          </Field>
        </>
      )}

      <div className="flex gap-2 flex-wrap">
        {mode === "bulk" && (
          <PrimaryButton onClick={tambah} disabled={!canAdd}>
            <Plus className="h-3.5 w-3.5" /> Tambah
          </PrimaryButton>
        )}
        <GhostButton onClick={checkAll} disabled={!hasStored || busy}>
          <RefreshCw className={["h-3.5 w-3.5", busy ? "animate-spin" : ""].join(" ")} /> Cek Saldo
        </GhostButton>
        <GhostButton onClick={clearAll} disabled={!hasStored} className="text-destructive hover:text-destructive disabled:opacity-40">
          <Trash2 className="h-3.5 w-3.5" /> Hapus Semua
        </GhostButton>
      </div>

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
          <div key={x.id} className="flex items-center gap-2 rounded-xl border border-border bg-card/40 px-3 py-2 text-xs">
            <span
              className={[
                "h-2.5 w-2.5 rounded-full shrink-0",
                x.status === "active" ? "bg-emerald-400" : x.status === "empty" ? "bg-rose-400" : x.status === "failed" ? "bg-red-500" : "bg-amber-400",
              ].join(" ")}
              title={x.status}
            />
            <div className="font-mono truncate text-muted-foreground flex-1">{x.key.slice(0, 12)}…{x.key.slice(-4)}</div>
            <div className="text-emerald-400 font-semibold whitespace-nowrap">
              {provider === "wavespeed"
                ? x.balance == null ? "—" : `$${x.balance.toFixed(2)}`
                : x.status === "active" ? "OK" : x.status === "failed" ? "❌" : "…"}
            </div>
            <button onClick={() => remove(x.id)} className="inline-flex items-center gap-1 rounded-full border border-border bg-card/60 px-2 py-1 text-[10px] text-muted-foreground hover:text-destructive hover:border-destructive/50 transition">
              <Trash2 className="h-3.5 w-3.5" /> Hapus
            </button>
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

function ElevenPane() {
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
      <Field label="ElevenLabs API Keys (sk_... — satu per baris atau pisah koma. Multi-key auto-rotate saat limit)">
        <Textarea
          rows={5}
          value={bulk}
          onChange={(e) => setBulk(e.target.value)}
          placeholder={"sk_XXXXXXXX...\nsk_YYYYYYYY..."}
          className="font-mono text-xs"
        />
      </Field>
      <div className="flex flex-wrap gap-2">
        <PrimaryButton onClick={tambah} disabled={!canAdd}>
          <Plus className="h-3.5 w-3.5" /> Tambah
        </PrimaryButton>
        <GhostButton onClick={checkAllKeys} disabled={!hasStored || busy}>
          <RefreshCw className={["h-3.5 w-3.5", busy ? "animate-spin" : ""].join(" ")} /> Cek Saldo
        </GhostButton>
        <GhostButton onClick={clear} disabled={!hasStored} className="text-destructive hover:text-destructive disabled:opacity-40">
          <Trash2 className="h-3.5 w-3.5" /> Hapus Semua
        </GhostButton>
      </div>

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
function ImportModal({ onClose }: { onClose: () => void }) {
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
function RenderPane() {
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
