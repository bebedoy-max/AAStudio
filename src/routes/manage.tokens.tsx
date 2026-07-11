import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2, RefreshCw, Upload, FileText, X, ExternalLink } from "lucide-react";
import { DashboardShell, PageHero } from "@/components/dashboard/shell";
import { Card, Field, Input, Textarea, Select, PrimaryButton, GhostButton } from "@/components/dashboard/ui";
import { checkWeavyToken } from "@/lib/providers/weavy";
import { checkWavespeedBalance } from "@/lib/providers/wavespeed";
import { checkMagnificKey } from "@/lib/providers/magnific";
import { checkElevenKey } from "@/lib/providers/eleven";

export const Route = createFileRoute("/manage/tokens")({
  head: () => ({
    meta: [
      { title: "Token / API Manager — AATools" },
      { name: "description", content: "Kelola API key semua provider AI — Brain, Weavy, Wavespeed, Magnific, ElevenLabs." },
    ],
  }),
  component: TokensPage,
});

type ProviderKey = "brain" | "weavy" | "wavespeed" | "magnific" | "eleven" | "render";

const providers: { key: ProviderKey; label: string; desc: string }[] = [
  { key: "brain", label: "🧠 Brain (Gemini)", desc: "Dipakai Produk Storyboard & Naratif Video Maker. Multi-key auto-rotate saat kena limit/429." },
  { key: "weavy", label: "Weavy", desc: "Provider utama Kling Motion Control, Wan, Sora, Seedance." },
  { key: "wavespeed", label: "Wavespeed", desc: "Provider alternatif — cek balance via api.wavespeed.ai/api/v3/balance." },
  { key: "magnific", label: "Magnific", desc: "Hanya dipakai untuk Motion Control (Kling motion transfer)." },
  { key: "eleven", label: "🎙️ ElevenLabs", desc: "Voice-over untuk Naratif Video Maker." },
  { key: "render", label: "🎬 Render (Shotstack/Creatomate)", desc: "Fallback cloud render ketika video melebihi limit FFmpeg browser (≥ 400 MB)." },
];

// ---- localStorage helpers ----
type WeavyTok = { id: string; token: string; user?: string; email?: string; credits: number | null; status: "active" | "empty" | "pending" | "failed" };
type SimpleKey = { id: string; key: string; balance: number | null; status: "active" | "empty" | "pending" | "failed"; note?: string };

const LS = {
  brain: "aatools.brain.geminiKeys",
  weavy: "aatools.weavy.tokens",
  wavespeed: "aatools.wavespeed.keys",
  magnific: "aatools.magnific.keys",
  eleven: "aatools.eleven",
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
const writeJSON = (k: string, v: unknown) => {
  if (typeof window !== "undefined") localStorage.setItem(k, JSON.stringify(v));
};

function TokensPage() {
  const [tab, setTab] = useState<ProviderKey>("brain");
  const active = providers.find((p) => p.key === tab)!;
  const [showImport, setShowImport] = useState(false);

  return (
    <DashboardShell>
      <PageHero
        eyebrow="Manage"
        title="Token / API"
        highlight="Manager"
        desc="Pusat kelola semua API key & token. Semua tersimpan lokal di browser."
      />

      <Card>
        <div className="flex flex-wrap gap-2 mb-6">
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

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 flex flex-col gap-4">
            {tab === "brain" && <BrainPane />}
            {tab === "weavy" && <WeavyPane onOpenImport={() => setShowImport(true)} />}
            {tab === "wavespeed" && (
              <ProviderKeyPane
                provider="wavespeed"
                lsKey={LS.wavespeed}
                singlePlaceholder="wsk_live_..."
                bulkPlaceholder={"wsk_live_XXX...\nwsk_live_YYY..."}
                helper="Balance dicek via api.wavespeed.ai/api/v3/balance. Dapatkan key di wavespeed.ai."
              />
            )}
            {tab === "magnific" && (
              <ProviderKeyPane
                provider="magnific"
                lsKey={LS.magnific}
                singlePlaceholder="FPSX... (Magnific/Freepik API key)"
                bulkPlaceholder={"FPSX-XXXX...\nFPSX-YYYY..."}
                helper="Magnific dipakai untuk Motion Control (Kling motion transfer via api.magnific.com)."
              />
            )}
            {tab === "eleven" && <ElevenPane />}
            {tab === "render" && <RenderPane />}
          </div>

          <div className="neumorph p-4 h-fit">
            <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Info</div>
            <div className="mt-1 font-display text-base text-foreground">{active.label}</div>
            <p className="mt-2 text-xs text-muted-foreground leading-relaxed">{active.desc}</p>
            <div className="mt-4 rounded-lg border border-border/60 bg-card/40 p-3 text-[11px] leading-relaxed text-muted-foreground">
              🔒 Key disimpan HANYA di <code className="text-foreground/80">localStorage</code> browser. Tidak pernah dikirim/di-log ke server selain saat request generate.
            </div>
            <HowToGet provider={tab} />
          </div>
        </div>
      </Card>

      {showImport && <ImportModal onClose={() => setShowImport(false)} />}
    </DashboardShell>
  );
}

/* ============ How to get API keys — per provider ============ */
type GuideStep = { text: string; code?: string };
type Guide = {
  url: string;
  urlLabel: string;
  prefix?: string;
  steps: GuideStep[];
  tip?: string;
};

const GUIDES: Record<ProviderKey, Guide> = {
  brain: {
    url: "https://aistudio.google.com/apikey",
    urlLabel: "aistudio.google.com/apikey",
    prefix: "AIza…",
    steps: [
      { text: "Buka Google AI Studio dan login pakai akun Google." },
      { text: 'Klik tombol "Create API key" (pojok kanan atas).' },
      { text: 'Pilih project Google Cloud (atau "Create API key in new project").' },
      { text: "Copy key yang muncul — WAJIB dimulai dengan AIza… (39 karakter)." },
      { text: "Paste ke textarea di sebelah. Boleh tambah banyak key sekaligus (1 per baris) untuk auto-rotate saat kena limit gratis." },
    ],
    tip: "Free tier Gemini: 15 request/menit, 1 juta token/hari untuk gemini-2.5-flash. Key yang dimulai selain AIza (mis. AQ.Ab8…) BUKAN API key — itu OAuth token dan akan ditolak.",
  },
  weavy: {
    url: "https://app.weavy.ai",
    urlLabel: "app.weavy.ai",
    prefix: "eyJhbGci… (JWT refresh token)",
    steps: [
      { text: "Buka app.weavy.ai dan login dengan akun Weavy kamu." },
      { text: "Tekan F12 di browser → pilih tab Console." },
      {
        text: "Paste script berikut lalu Enter — token otomatis ter-copy ke clipboard:",
        code: `indexedDB.open('firebaseLocalStorageDb').onsuccess=e=>{let t=e.target.result.transaction('firebaseLocalStorage').objectStore('firebaseLocalStorage').getAll();t.onsuccess=e=>{let r=e.target.result.find(i=>i.value?.stsTokenManager?.refreshToken);r?copy(r.value.stsTokenManager.refreshToken).then(()=>alert('Token copied!')):alert('Not found.')}}`,
      },
      { text: "Paste ke Bulk Input di sebelah. Ulangi untuk tiap akun Weavy — makin banyak, makin besar credit pool." },
    ],
    tip: "Refresh token Weavy berumur panjang. Bila expired, ulangi F12 → paste script.",
  },
  wavespeed: {
    url: "https://wavespeed.ai/dashboard/api-keys",
    urlLabel: "wavespeed.ai/dashboard",
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
  magnific: {
    url: "https://www.freepik.com/api/dashboard",
    urlLabel: "freepik.com/api/dashboard",
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
    url: "https://elevenlabs.io/app/settings/api-keys",
    urlLabel: "elevenlabs.io/app/settings/api-keys",
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
      `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}&pageSize=1`,
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
  const [progress, setProgress] = useState<{ show: boolean; pct: number; text: string }>({ show: false, pct: 0, text: "" });

  useEffect(() => {
    const keys = readJSON<string[]>(LS.brain, []);
    setBulk(keys.join("\n"));
    setStatus(keys.length ? `${keys.length} key tersimpan` : "Belum ada key");
  }, []);

  const parse = (raw: string) =>
    raw
      .split(/[\n,]/)
      .map((s) => s.trim())
      .filter(Boolean);

  const save = () => {
    const keys = parse(bulk);
    writeJSON(LS.brain, keys);
    setStatus(`✅ ${keys.length} key tersimpan`);
  };
  const append = () => {
    const existing = readJSON<string[]>(LS.brain, []);
    const merged = Array.from(new Set([...existing, ...parse(bulk)]));
    writeJSON(LS.brain, merged);
    setBulk(merged.join("\n"));
    setStatus(`➕ Sekarang total ${merged.length} key`);
  };
  const clear = () => {
    writeJSON(LS.brain, []);
    setBulk("");
    setChecks([]);
    setStatus("🗑 Semua key dihapus");
  };

  const checkAll = async () => {
    const keys = parse(bulk);
    if (keys.length === 0) {
      setStatus("Tidak ada key untuk dicek");
      return;
    }
    writeJSON(LS.brain, keys);
    setChecks(keys.map((k) => ({ key: k, state: "checking" as const })));
    setProgress({ show: true, pct: 5, text: `Cek ${keys.length} key…` });
    const results: BrainKeyStatus[] = [];
    for (let i = 0; i < keys.length; i++) {
      const r = await checkGeminiKey(keys[i]);
      results.push(r);
      setChecks([...results, ...keys.slice(i + 1).map((k) => ({ key: k, state: "checking" as const }))]);
      setProgress({ show: true, pct: Math.round(((i + 1) / keys.length) * 100), text: `Cek ${i + 1}/${keys.length}` });
      await new Promise((res) => setTimeout(res, 120));
    }
    setProgress({ show: false, pct: 0, text: "" });
    const a = results.filter((r) => r.state === "active").length;
    const l = results.filter((r) => r.state === "limited").length;
    const bad = results.filter((r) => r.state === "invalid" || r.state === "failed").length;
    setStatus(`✅ ${a} aktif · ⏳ ${l} limit · ❌ ${bad} bermasalah (dari ${keys.length})`);
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
        <PrimaryButton onClick={save}>💾 Save Semua</PrimaryButton>
        <GhostButton onClick={append}><Plus className="h-3.5 w-3.5" /> Tambah (append)</GhostButton>
        <GhostButton onClick={checkAll} disabled={progress.show}>
          <RefreshCw className={`h-3.5 w-3.5 ${progress.show ? "animate-spin" : ""}`} /> Cek Limit & Status
        </GhostButton>
        <GhostButton onClick={clear} className="text-destructive hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /> Hapus Semua</GhostButton>
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
      {checks.length > 0 && (
        <div className="mt-1 space-y-1.5">
          <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Status per key</div>
          {checks.map((c, i) => (
            <div key={i} className="flex items-center justify-between gap-2 rounded-md border border-border/60 bg-card/40 px-2.5 py-1.5">
              <code className="text-[11px] font-mono text-foreground/85 truncate">{mask(c.key)}</code>
              <div className="flex items-center gap-2 shrink-0">
                {c.detail && <span className="text-[10px] text-muted-foreground truncate max-w-[220px]">{c.detail}</span>}
                <span className={`text-[10px] px-2 py-0.5 rounded-full border ${badge(c.state)}`}>{label(c.state)}</span>
              </div>
            </div>
          ))}
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

  useEffect(() => {
    setList(readJSON<WeavyTok[]>(LS.weavy, []));
    setActiveId(readJSON<string | null>(LS.active, null));
    const onStore = () => setList(readJSON<WeavyTok[]>(LS.weavy, []));
    window.addEventListener("storage", onStore);
    return () => window.removeEventListener("storage", onStore);
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

  const connect = () => {
    if (!token.trim()) return;
    const next: WeavyTok = { id: uid(), token: token.trim(), credits: 0, status: "pending" };
    const merged = [...list, next];
    persist(merged);
    if (!activeId) {
      setActiveId(next.id);
      writeJSON(LS.active, next.id);
    }
    setToken("");
  };
  const importBulkInline = () => {
    const tokens = parseBulkTokens(bulkTokenText);
    if (!tokens.length) return;
    const existing = new Set(list.map((t) => t.token));
    const added: WeavyTok[] = tokens
      .filter((t) => !existing.has(t))
      .map((t) => ({ id: uid(), token: t, credits: 0, status: "pending" }));
    const merged = [...list, ...added];
    persist(merged);
    if (!activeId && added[0]) {
      setActiveId(added[0].id);
      writeJSON(LS.active, added[0].id);
    }
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
    if (!confirm("Hapus semua token Weavy?")) return;
    persist([]);
    setActiveId(null);
    writeJSON(LS.active, null);
  };
  const checkAll = async () => {
    if (list.length === 0) return;
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
            status: res.credits === null ? "pending" : res.credits > 0 ? "active" : "empty",
          }
        : { ...t, status: "failed", credits: null };
      working = working.map((x) => (x.id === t.id ? updated : x));
      persist(working);
      setProgress({
        show: true,
        pct: Math.round(((i + 1) / working.length) * 100),
        text: `Checking ${i + 1}/${working.length} — ${res.ok ? (res.credits ?? "?") + " cr" : "gagal"}`,
      });
      // small delay to avoid hammering Firebase
      await new Promise((r) => setTimeout(r, 150));
    }
    setProgress({ show: false, pct: 0, text: "" });
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
          <PrimaryButton onClick={connect} disabled={!token.trim()}>Connect</PrimaryButton>
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
          <PrimaryButton onClick={importBulkInline} disabled={!bulkTokenText.trim()}>
            <Upload className="h-3.5 w-3.5" /> Import Bulk
          </PrimaryButton>
        )}
        <GhostButton onClick={onOpenImport} className="w-full sm:w-auto"><Upload className="h-3.5 w-3.5" /> Import dari File</GhostButton>
        <GhostButton onClick={clearAll} disabled={list.length === 0} className="text-destructive hover:text-destructive disabled:opacity-40">
          <Trash2 className="h-3.5 w-3.5" /> Hapus Semua
        </GhostButton>
      </div>

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
            <PrimaryButton onClick={checkAll} className="ml-auto !py-1.5 !px-3 text-xs"><RefreshCw className="h-3 w-3" /> Check All</PrimaryButton>
          </div>
          {progress.show && (
            <div>
              <div className="text-[10px] text-muted-foreground mb-1">{progress.text}</div>
              <div className="h-1 rounded-full bg-border overflow-hidden">
                <div className="h-full transition-all" style={{ width: `${progress.pct}%`, background: "var(--gradient-neon)" }} />
              </div>
            </div>
          )}
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
            <button
              onClick={() => setActive(t.id)}
              className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border bg-card/60 px-2 py-1 text-[10px] text-muted-foreground hover:text-foreground hover:border-primary/50 transition"
              title="Pilih token aktif"
            >
              <span
                className={[
                  "h-2.5 w-2.5 rounded-full",
                  t.status === "active" ? "bg-emerald-400" : t.status === "empty" ? "bg-rose-400" : t.status === "failed" ? "bg-red-500" : "bg-amber-400",
                ].join(" ")}
              />
              {t.id === activeId ? "Aktif" : "Pilih"}
            </button>
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

      <details className="rounded-xl border border-border/60 bg-card/30 p-3 text-xs text-muted-foreground">
        <summary className="cursor-pointer text-foreground/90">Cara mendapatkan Refresh Token</summary>
        <ol className="list-decimal pl-5 mt-2 space-y-1">
          <li>Buka <a className="text-primary underline" href="https://app.weavy.ai" target="_blank" rel="noreferrer">app.weavy.ai</a> & login</li>
          <li>Tekan F12 → tab <b>Console</b></li>
          <li>Paste script berikut lalu Enter, token otomatis ter-copy:</li>
        </ol>
        <pre className="mt-2 rounded-lg bg-black/50 border border-border p-2 overflow-x-auto text-[10px] font-mono">
{`indexedDB.open('firebaseLocalStorageDb').onsuccess=e=>{let t=e.target.result.transaction('firebaseLocalStorage').objectStore('firebaseLocalStorage').getAll();t.onsuccess=e=>{let r=e.target.result.find(i=>i.value?.stsTokenManager?.refreshToken);r?copy(r.value.stsTokenManager.refreshToken).then(()=>alert('Token copied!')):alert('Not found.')}}`}
        </pre>
      </details>
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
  provider: "wavespeed" | "magnific";
}) {
  const [k, setK] = useState("");
  const [bulk, setBulk] = useState("");
  const [mode, setMode] = useState<"single" | "bulk">("single");
  const [list, setList] = useState<SimpleKey[]>([]);
  const [checking, setChecking] = useState(false);
  const [progress, setProgress] = useState<{ show: boolean; pct: number; text: string }>({ show: false, pct: 0, text: "" });

  useEffect(() => setList(readJSON<SimpleKey[]>(lsKey, [])), [lsKey]);
  const persist = (next: SimpleKey[]) => {
    setList(next);
    writeJSON(lsKey, next);
  };
  const add = () => {
    if (!k.trim()) return;
    persist([...list, { id: uid(), key: k.trim(), balance: null, status: "pending" }]);
    setK("");
  };
  const parseBulk = (raw: string) =>
    raw.split(/[\n,]/).map((s) => s.trim()).filter(Boolean);
  const importBulk = () => {
    const keys = parseBulk(bulk);
    if (!keys.length) return;
    const existing = new Set(list.map((x) => x.key));
    const added = keys
      .filter((k) => !existing.has(k))
      .map<SimpleKey>((k) => ({ id: uid(), key: k, balance: null, status: "pending" }));
    persist([...list, ...added]);
    setBulk("");
  };
  const remove = (id: string) => persist(list.filter((x) => x.id !== id));
  const clearAll = () => {
    if (!confirm("Hapus semua key?")) return;
    persist([]);
  };
  const checkAll = async () => {
    if (list.length === 0) return;
    setChecking(true);
    setProgress({ show: true, pct: 5, text: `Checking ${list.length} key…` });
    let working = [...list];
    for (let i = 0; i < working.length; i++) {
      const x = working[i];
      let updated: SimpleKey;
      if (provider === "wavespeed") {
        const res = await checkWavespeedBalance(x.key);
        updated = {
          ...x,
          balance: res.balance,
          status: res.ok ? (res.balance && res.balance > 0 ? "active" : "empty") : "failed",
        };
      } else {
        const res = await checkMagnificKey(x.key);
        // legacy: no probe — mark active
        updated = { ...x, balance: null, status: res.ok ? "active" : "failed", note: res.balance };
      }
      working = working.map((y) => (y.id === x.id ? updated : y));
      persist(working);
      setProgress({
        show: true,
        pct: Math.round(((i + 1) / working.length) * 100),
        text: `Checking ${i + 1}/${working.length}`,
      });
      await new Promise((r) => setTimeout(r, 120));
    }
    setChecking(false);
    setProgress({ show: false, pct: 0, text: "" });
  };

  const total = list.reduce((a, x) => a + (x.balance ?? 0), 0);
  const activeCount = list.filter((x) => x.status === "active").length;

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
          <PrimaryButton onClick={checkAll} disabled={checking || list.length === 0}>
            <RefreshCw className={["h-3.5 w-3.5", checking ? "animate-spin" : ""].join(" ")} /> Cek Saldo
          </PrimaryButton>
        </div>
      </div>

      {mode === "single" ? (
        <div className="flex gap-2">
          <Input type="password" placeholder={singlePlaceholder} value={k} onChange={(e) => setK(e.target.value)} />
          <PrimaryButton onClick={add} disabled={!k.trim()}>Add</PrimaryButton>
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
          <div className="flex gap-2">
            <PrimaryButton onClick={importBulk} disabled={!bulk.trim()}>📥 Import Bulk</PrimaryButton>
            {list.length > 0 && (
              <GhostButton onClick={clearAll} className="text-destructive hover:text-destructive">
                <Trash2 className="h-3.5 w-3.5" /> Hapus Semua
              </GhostButton>
            )}
          </div>
        </>
      )}

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

type ElevenKeyStatus = { key: string; ok: boolean; remaining: number; limit: number; tier?: string };

function ElevenPane() {
  const [cfg, setCfg] = useState<ElevenCfg>(emptyEleven);
  const [bulk, setBulk] = useState("");
  const [status, setStatus] = useState("");
  const [keyStatuses, setKeyStatuses] = useState<ElevenKeyStatus[]>([]);
  const [checking, setChecking] = useState(false);

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
    setBulk(migrated.keys.join("\n"));
  }, []);

  const parse = (raw: string) => raw.split(/[\n,]/).map((s) => s.trim()).filter(Boolean);

  const saveKeys = () => {
    const keys = parse(bulk);
    const next = { ...cfg, keys };
    setCfg(next);
    writeJSON(LS.eleven, next);
    setStatus(`✅ ${keys.length} key tersimpan`);
  };
  const appendKeys = () => {
    const merged = Array.from(new Set([...cfg.keys, ...parse(bulk)]));
    const next = { ...cfg, keys: merged };
    setCfg(next);
    setBulk(merged.join("\n"));
    writeJSON(LS.eleven, next);
    setStatus(`➕ Total ${merged.length} key`);
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
        body: JSON.stringify({
          text: "Halo, ini adalah test suara dari AATools.",
          voiceId: cfg.voice,
        }),
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
    setCfg(emptyEleven);
    setBulk("");
    setKeyStatuses([]);
    writeJSON(LS.eleven, emptyEleven);
    setStatus("🗑 Semua key & voice direset");
  };
  const checkAllKeys = async () => {
    if (cfg.keys.length === 0) return;
    setChecking(true);
    setStatus(`🔍 Cek ${cfg.keys.length} ElevenLabs key…`);
    const results: ElevenKeyStatus[] = [];
    for (const k of cfg.keys) {
      const r = await checkElevenKey(k);
      results.push({ key: k, ok: r.ok, remaining: r.remaining, limit: r.characterLimit, tier: r.tier });
      setKeyStatuses([...results]);
      await new Promise((r) => setTimeout(r, 120));
    }
    const okCount = results.filter((r) => r.ok).length;
    setStatus(`✅ Cek selesai — ${okCount}/${results.length} key aktif`);
    setChecking(false);
  };

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
        <PrimaryButton onClick={saveKeys}>💾 Save Semua</PrimaryButton>
        <GhostButton onClick={appendKeys}><Plus className="h-3.5 w-3.5" /> Tambah (append)</GhostButton>
        <PrimaryButton onClick={checkAllKeys} disabled={checking || cfg.keys.length === 0}>
          <RefreshCw className={["h-3.5 w-3.5", checking ? "animate-spin" : ""].join(" ")} /> Cek Saldo
        </PrimaryButton>
        <GhostButton onClick={clear} className="text-destructive hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /> Hapus Semua</GhostButton>
      </div>

      {keyStatuses.length > 0 && (
        <div className="flex flex-col gap-1">
          {keyStatuses.map((s, i) => (
            <div key={i} className="flex items-center gap-2 rounded-lg border border-border bg-card/40 px-3 py-1.5 text-[11px]">
              <span className={["h-2 w-2 rounded-full shrink-0", s.ok ? "bg-emerald-400" : "bg-red-500"].join(" ")} />
              <span className="font-mono truncate text-muted-foreground flex-1">{s.key.slice(0, 10)}…{s.key.slice(-4)}</span>
              {s.ok ? (
                <span className="text-emerald-400 font-semibold whitespace-nowrap">
                  {s.remaining.toLocaleString()} / {s.limit.toLocaleString()} chars{s.tier ? ` · ${s.tier}` : ""}
                </span>
              ) : (
                <span className="text-red-400 font-semibold">Invalid</span>
              )}
            </div>
          ))}
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
        <GhostButton onClick={test} className="flex-1">🔊 Test</GhostButton>
      </div>
      {status && <div className="text-[11px] text-muted-foreground">{status}</div>}
      <div className="text-[11px] text-muted-foreground leading-relaxed">
        {cfg.keys.length} key aktif · disimpan lokal di browser (localStorage), tidak pernah dikirim/di-log ke server selain saat generate voice-over.
      </div>
    </>
  );
}

/* ============ Bulk Import Modal (Weavy) ============ */
function ImportModal({ onClose }: { onClose: () => void }) {
  const [text, setText] = useState("");

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

  const doImport = () => {
    const tokens = parse(text);
    if (!tokens.length) return;
    const existing = readJSON<WeavyTok[]>(LS.weavy, []);
    const existingSet = new Set(existing.map((t) => t.token));
    const added: WeavyTok[] = tokens
      .filter((t) => !existingSet.has(t))
      .map((t) => ({ id: uid(), token: t, credits: 0, status: "pending" }));
    const merged = [...existing, ...added];
    writeJSON(LS.weavy, merged);
    window.dispatchEvent(new Event("storage"));
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-black/70 backdrop-blur-sm p-4">
      <div className="neumorph w-full max-w-lg p-5 relative">
        <button onClick={onClose} className="absolute top-3 right-3 inline-flex items-center gap-1 rounded-full border border-border bg-card/60 px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground">
          <X className="h-3.5 w-3.5" /> Tutup
        </button>
        <div className="font-display text-lg mb-1">📋 Import Tokens</div>
        <div className="text-xs text-muted-foreground mb-4">1 token per baris. Duplikat otomatis di-skip.</div>

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
          <PrimaryButton onClick={doImport} disabled={!text.trim()}>Import</PrimaryButton>
        </div>
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
  useEffect(() => setList(readJSON<SimpleKey[]>(lsKey, [])), [lsKey]);
  const persist = (next: SimpleKey[]) => { setList(next); writeJSON(lsKey, next); };
  const add = () => {
    if (!k.trim()) return;
    if (list.some((x) => x.key === k.trim())) { setK(""); return; }
    persist([...list, { id: uid(), key: k.trim(), balance: null, status: "active" }]);
    setK("");
  };
  const remove = (id: string) => persist(list.filter((x) => x.id !== id));
  const activeCount = list.length;
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
        <PrimaryButton onClick={add} disabled={!k.trim()}>Add</PrimaryButton>
      </div>
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
