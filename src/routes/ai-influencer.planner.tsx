import { createFileRoute, Link } from "@tanstack/react-router";
import { withKeyGuard } from "@/components/brain/key-guard";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  CalendarRange, ListChecks, Clock, Sparkles, ArrowRight, Loader2, Play,
  Trash2, RefreshCw, BookOpen, Brain as BrainIcon, Send, Library as LibraryIcon,
  AlertTriangle, PlugZap,
} from "lucide-react";
import { toast } from "sonner";
import { DashboardShell, PageHero } from "@/components/dashboard/shell";
import { Card, PrimaryButton, GhostButton } from "@/components/dashboard/ui";
import { Chip } from "@/components/dashboard/os/section";
import { CONTENT_QUEUE_STATES, PUBLISH_PLATFORMS } from "@/lib/ai-influencer/catalog";
import { useActiveCharacterId } from "@/lib/ai-influencer/active-character";
import {
  loadStrategy, saveStrategy, listQueue, saveQueueBatch, deleteQueueItem, updateQueueItem,
  loadBrain, listPublisherAccounts,
} from "@/lib/ai-influencer/studio.functions";
import { getCharacter } from "@/lib/ai-influencer/service";
import { getCreativeKeys, headersFor } from "@/lib/creative/keys";
import { openConfirm } from "@/components/ai-influencer/dialogs";

export const Route = createFileRoute("/ai-influencer/planner")({
  component: withKeyGuard(PlannerPage, ["brain"]),
});

const WORKFLOW_STEPS = [
  "Idea", "Scenario", "Prompt", "Generate Image", "Generate Motion",
  "Generate Caption", "Generate Subtitle", "Render", "Schedule", "Publish",
];

type StrategyRow = { k: string; v: string };
type QueuePayload = {
  title?: string;
  caption?: string;
  hashtags?: string[];
  content_type?: string;
  category?: string;
  image_prompt?: string;
  video_reference_url?: string;
  notes?: string;
};
type QueueRow = {
  id: string;
  idea: string;
  status: string;
  scheduled_for: string | null;
  platform: string | null;
  day_label: string | null;
  slot_time: string | null;
  payload?: QueuePayload | null;
};

const CONTENT_TYPES = [
  { key: "image", label: "Image / Foto" },
  { key: "motion", label: "Motion / Video (i2v)" },
  { key: "ugc", label: "UGC Storyboard" },
  { key: "carousel", label: "Carousel" },
  { key: "reels", label: "Reels / Shorts Script" },
];
const CATEGORIES = [
  "Fashion", "Beauty", "Lifestyle", "Personal Branding", "Food",
  "Travel", "Fitness", "Education", "Entertainment", "Affiliate/Review",
];

type PlannerConfig = {
  contentTypes: string[];
  categories: string[];
  platforms: string[];
  perDay: number;
  days: number;
};
const DEFAULT_CFG: PlannerConfig = {
  contentTypes: ["image", "motion"],
  categories: ["Fashion", "Lifestyle"],
  platforms: ["tiktok", "instagram"],
  perDay: 2,
  days: 7,
};

function labelOfPlatform(key: string): string {
  const k = (key || "").toLowerCase();
  const found = PUBLISH_PLATFORMS.find((p) => p.key === k);
  return found?.label ?? key;
}

function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function minDateTime(): string {
  const d = new Date(Date.now() + 60_000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function PlannerBreadcrumb({ current }: { current: string }) {
  const steps = [
    { key: "brain", label: "Brain", icon: BrainIcon, to: "/ai-influencer/brain" as const },
    { key: "planner", label: "Planner", icon: BookOpen, to: "/ai-influencer/planner" as const },
    { key: "library", label: "Library", icon: LibraryIcon, to: "/ai-influencer/library" as const },
    { key: "publisher", label: "Publisher", icon: Send, to: "/ai-influencer/publisher" as const },
  ];
  return (
    <div className="flex items-center gap-2 flex-wrap text-xs">
      {steps.map((s, i) => {
        const active = s.key === current;
        const Icon = s.icon;
        return (
          <div key={s.key} className="flex items-center gap-2">
            <Link
              to={s.to}
              className={[
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 transition",
                active
                  ? "border-transparent text-primary-foreground glow-pink"
                  : "border-border bg-card/40 hover:bg-sidebar-accent/60 text-muted-foreground hover:text-foreground",
              ].join(" ")}
              style={active ? { background: "var(--gradient-neon)" } : undefined}
            >
              <Icon className="h-3 w-3" />
              {s.label}
            </Link>
            {i < steps.length - 1 && <ArrowRight className="h-3 w-3 text-muted-foreground/60" />}
          </div>
        );
      })}
    </div>
  );
}

function PlannerPage() {
  const [activeId] = useActiveCharacterId();
  const [view, setView] = useState<"calendar" | "queue" | "timeline">("queue");
  const [strategy, setStrategy] = useState<StrategyRow[] | null>(null);
  const [queue, setQueue] = useState<QueueRow[]>([]);
  const [cfg, setCfg] = useState<PlannerConfig>(DEFAULT_CFG);
  const [connectedPlatforms, setConnectedPlatforms] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [cycling, setCycling] = useState(false);

  const _loadStrategy = useServerFn(loadStrategy);
  const _saveStrategy = useServerFn(saveStrategy);
  const _listQueue = useServerFn(listQueue);
  const _saveQueue = useServerFn(saveQueueBatch);
  const _updateQueue = useServerFn(updateQueueItem);
  const _deleteQueue = useServerFn(deleteQueueItem);
  const _loadBrain = useServerFn(loadBrain);
  const _listAccounts = useServerFn(listPublisherAccounts);

  useEffect(() => {
    if (!activeId) { setStrategy(null); setQueue([]); return; }
    let cancel = false;
    setLoading(true);
    Promise.all([
      _loadStrategy({ data: { characterId: activeId } }),
      _listQueue({ data: { characterId: activeId } }),
    ])
      .then(([strat, q]) => {
        if (cancel) return;
        const ratios = (strat.ratios ?? {}) as Record<string, unknown>;
        const savedCfg = ratios.__config as PlannerConfig | undefined;
        if (savedCfg && Array.isArray(savedCfg.contentTypes)) setCfg({ ...DEFAULT_CFG, ...savedCfg });
        const rows: StrategyRow[] = Object.entries(ratios)
          .filter(([k]) => k !== "__config")
          .map(([k, v]) => ({ k, v: String(v) }));
        setStrategy(rows.length ? rows : null);
        setQueue((q as QueueRow[]) ?? []);
      })
      .catch((e) => toast.error(`Gagal load: ${(e as Error).message}`))
      .finally(() => { if (!cancel) setLoading(false); });
    return () => { cancel = true; };
  }, [activeId, _loadStrategy, _listQueue]);

  useEffect(() => {
    let cancel = false;
    _listAccounts()
      .then((rows) => {
        if (cancel) return;
        const s = new Set<string>();
        for (const r of rows as Array<{ platform: string; status: string }>) {
          if (r.status === "connected") s.add(r.platform.toLowerCase());
        }
        setConnectedPlatforms(s);
      })
      .catch(() => { /* silent */ });
    return () => { cancel = true; };
  }, [_listAccounts]);

  const cfgValid = cfg.contentTypes.length > 0 && cfg.categories.length > 0 && cfg.platforms.length > 0;
  const unconnectedSelected = cfg.platforms.filter((p) => !connectedPlatforms.has(p));

  const toggleIn = (arr: string[], key: string): string[] =>
    arr.includes(key) ? arr.filter((x) => x !== key) : [...arr, key];

  const generateStrategy = async () => {
    if (!activeId) return;
    if (!cfgValid) { toast.error("Pilih minimal 1 jenis konten, kategori, dan platform."); return; }
    setBusy(true);
    try {
      const [character, brain] = await Promise.all([
        getCharacter(activeId),
        _loadBrain({ data: { characterId: activeId } }),
      ]);
      const learning = (brain.learning ?? {}) as { sources?: { platform: string; url: string }[] };
      const socialRefs = learning.sources ?? [];

      const keys = getCreativeKeys();
      if (!keys.gemini && !keys.openai) {
        throw new Error("Brain API key kosong. Isi Gemini/OpenAI di Manage → Tokens.");
      }
      const res = await fetch("/api/router/plan-weekly", {
        method: "POST",
        headers: headersFor(keys),
        body: JSON.stringify({
          character,
          personality: {},
          persona: brain.persona,
          memory: brain.memory,
          socialRefs,
          config: cfg,
        }),
      });
      const data = (await res.json()) as { items?: unknown[]; error?: string };
      if (!res.ok || !data.items) throw new Error(data.error || "Planner AI gagal");

      const items = data.items as Array<{
        day?: string; slot_time?: string; platform?: string;
        content_type?: string; category?: string;
        title?: string; caption?: string; hashtags?: string[];
        image_prompt?: string; video_reference_url?: string; notes?: string;
      }>;

      const dayIdx = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"];
      const now = new Date();
      const startOfDay = new Date(now); startOfDay.setHours(0, 0, 0, 0);
      const scheduleFor = (day: string | undefined, slot: string | undefined, i: number): string => {
        const di = day ? dayIdx.indexOf(day) : -1;
        const base = new Date(startOfDay);
        const todayIdx = (now.getDay() + 6) % 7;
        const offset = di >= 0 ? ((di - todayIdx + 7) % 7) || 7 : i + 1;
        base.setDate(base.getDate() + offset);
        const [hh, mm] = (slot ?? "09:00").split(":").map((n) => parseInt(n, 10));
        base.setHours(hh || 9, mm || 0, 0, 0);
        if (base.getTime() <= now.getTime()) base.setDate(base.getDate() + 1);
        return base.toISOString();
      };

      const ratios: Record<string, unknown> = {
        "Posting Frequency": `${cfg.perDay}x / hari`,
        "Total Konten": `${items.length} item`,
        "Content Types": cfg.contentTypes.join(", "),
        "Categories": cfg.categories.join(", "),
        "Platforms": cfg.platforms.map(labelOfPlatform).join(", "),
        __config: cfg,
      };
      await _saveStrategy({
        data: {
          characterId: activeId,
          weekly: items,
          ratios: ratios as unknown as Record<string, number>,
          goals: cfg.categories,
        },
      });

      for (const q of queue) {
        try { await _deleteQueue({ data: { id: q.id } }); } catch { /* ignore */ }
      }

      const queueItems = items.map((it, i) => ({
        idea: it.title || it.image_prompt?.slice(0, 60) || `Konten ${i + 1}`,
        day_label: it.day ?? null,
        slot_time: it.slot_time ?? null,
        platform: it.platform ?? cfg.platforms[0],
        caption: it.caption ?? null,
        hashtag: it.hashtags?.length ? it.hashtags.map((h) => `#${h.replace(/^#/, "")}`).join(" ") : null,
        status: "ready",
        scheduled_for: scheduleFor(it.day, it.slot_time, i),
        payload: {
          title: it.title,
          caption: it.caption,
          hashtags: it.hashtags,
          content_type: it.content_type,
          category: it.category,
          image_prompt: it.image_prompt,
          video_reference_url: it.video_reference_url,
          notes: it.notes,
        },
      }));
      await _saveQueue({ data: { characterId: activeId, items: queueItems } });

      const q = await _listQueue({ data: { characterId: activeId } });
      const rows: StrategyRow[] = Object.entries(ratios)
        .filter(([k]) => k !== "__config")
        .map(([k, v]) => ({ k, v: String(v) }));
      setStrategy(rows);
      setQueue((q as QueueRow[]) ?? []);
      toast.success(`Weekly strategy ${items.length} konten dibuat AI & tersimpan.`);
    } catch (e) {
      toast.error(`Gagal generate: ${(e as Error).message}`);
    } finally { setBusy(false); }
  };

  const resetStrategy = async () => {
    if (!activeId) return;
    const ok = await openConfirm({
      title: "Reset strategy?",
      description: "Weekly plan dan seluruh item di queue akan dihapus permanen.",
      confirmLabel: "Reset",
      tone: "danger",
    });
    if (!ok) return;
    try {
      await _saveStrategy({
        data: { characterId: activeId, weekly: [], ratios: {}, goals: [] },
      });
      for (const q of queue) await _deleteQueue({ data: { id: q.id } });
      setStrategy(null);
      setQueue([]);
      toast.success("Strategy direset.");
    } catch (e) { toast.error((e as Error).message); }
  };

  const runCycle = async () => {
    if (queue.length === 0) { toast.error("Generate strategi dulu."); return; }
    setCycling(true);
    toast.info("Menjalankan 1 siklus otomatis: Idea → Publish…");
    try {
      for (const it of queue) {
        const plat = (it.platform || "").toLowerCase();
        if (!connectedPlatforms.has(plat)) {
          await _updateQueue({ data: { id: it.id, patch: { status: "failed" } } });
          setQueue((prev) => prev.map((q) => (q.id === it.id ? { ...q, status: "failed" } : q)));
          continue;
        }
        await _updateQueue({ data: { id: it.id, patch: { status: "published" } } });
        setQueue((prev) => prev.map((q) => (q.id === it.id ? { ...q, status: "published" } : q)));
        await new Promise((r) => setTimeout(r, 300));
      }
      toast.success("Siklus selesai. Item yang platform-nya connected sudah published.");
    } finally { setCycling(false); }
  };

  useEffect(() => {
    if (!activeId || queue.length === 0) return;
    const tick = async () => {
      const now = Date.now();
      const due = queue.filter(
        (q) => q.status === "ready" && q.scheduled_for && new Date(q.scheduled_for).getTime() <= now,
      );
      for (const it of due) {
        const plat = (it.platform || "").toLowerCase();
        if (!connectedPlatforms.has(plat)) {
          toast.warning(`"${it.idea}" tidak dipublish: ${labelOfPlatform(plat)} belum terhubung.`);
          await _updateQueue({ data: { id: it.id, patch: { status: "failed" } } });
          setQueue((prev) => prev.map((q) => (q.id === it.id ? { ...q, status: "failed" } : q)));
          continue;
        }
        await _updateQueue({ data: { id: it.id, patch: { status: "published" } } });
        setQueue((prev) => prev.map((q) => (q.id === it.id ? { ...q, status: "published" } : q)));
        toast.success(`Auto-published: ${it.idea}`);
      }
    };
    const id = window.setInterval(tick, 30_000);
    return () => window.clearInterval(id);
  }, [activeId, queue, connectedPlatforms, _updateQueue]);

  const rescheduleItem = async (it: QueueRow, iso: string) => {
    if (new Date(iso).getTime() < Date.now()) {
      toast.error("Tidak bisa jadwal ke masa lalu.");
      return;
    }
    await _updateQueue({ data: { id: it.id, patch: { scheduled_for: iso } } });
    setQueue((prev) => prev.map((q) => (q.id === it.id ? { ...q, scheduled_for: iso } : q)));
    toast.success("Jadwal diperbarui.");
  };

  return (
    <DashboardShell>
      <PageHero
        eyebrow="Module · Content Planner"
        title="Content"
        highlight="Planner"
        desc="Pilih jenis konten, kategori & platform → AI Brain menyusun strategi mingguan lengkap dengan judul, caption, hashtag, dan jadwal. Item siap auto-publish saat waktunya tiba."
        action={
          <div className="flex gap-2">
            {strategy && (
              <GhostButton onClick={resetStrategy} disabled={!activeId}>
                <Trash2 className="h-4 w-4" /> Reset
              </GhostButton>
            )}
            <PrimaryButton onClick={generateStrategy} disabled={!activeId || busy || !cfgValid}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {strategy ? "Regenerate Weekly Strategy" : "Generate Weekly Strategy"}
            </PrimaryButton>
          </div>
        }
      />

      <Card>
        <PlannerBreadcrumb current="planner" />
      </Card>

      {!activeId && (
        <Card>
          <div className="text-sm text-muted-foreground">
            Pilih karakter di menu <b>Character</b> untuk mulai merencanakan konten.
          </div>
        </Card>
      )}

      {activeId && (
        <Card title="Planner Config" sub="Tentukan jenis konten, kategori, dan platform target sebelum generate.">
          <div className="grid gap-5 md:grid-cols-3">
            <div>
              <div className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground mb-2">Jenis Konten</div>
              <div className="flex flex-wrap gap-2">
                {CONTENT_TYPES.map((ct) => {
                  const on = cfg.contentTypes.includes(ct.key);
                  return (
                    <button
                      key={ct.key}
                      onClick={() => setCfg((c) => ({ ...c, contentTypes: toggleIn(c.contentTypes, ct.key) }))}
                      className={[
                        "px-3 py-1.5 rounded-full text-xs border transition",
                        on ? "border-transparent text-primary-foreground glow-pink" : "border-border bg-card/40 hover:bg-sidebar-accent/60",
                      ].join(" ")}
                      style={on ? { background: "var(--gradient-neon)" } : undefined}
                    >
                      {ct.label}
                    </button>
                  );
                })}
              </div>
            </div>
            <div>
              <div className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground mb-2">Kategori</div>
              <div className="flex flex-wrap gap-2">
                {CATEGORIES.map((c) => {
                  const on = cfg.categories.includes(c);
                  return (
                    <button
                      key={c}
                      onClick={() => setCfg((s) => ({ ...s, categories: toggleIn(s.categories, c) }))}
                      className={[
                        "px-3 py-1.5 rounded-full text-xs border transition",
                        on ? "border-transparent text-primary-foreground glow-cyan" : "border-border bg-card/40 hover:bg-sidebar-accent/60",
                      ].join(" ")}
                      style={on ? { background: "var(--gradient-neon)" } : undefined}
                    >
                      {c}
                    </button>
                  );
                })}
              </div>
            </div>
            <div>
              <div className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground mb-2">Target Platform</div>
              <div className="flex flex-wrap gap-2">
                {PUBLISH_PLATFORMS.map((p) => {
                  const on = cfg.platforms.includes(p.key);
                  const conn = connectedPlatforms.has(p.key);
                  return (
                    <button
                      key={p.key}
                      onClick={() => setCfg((s) => ({ ...s, platforms: toggleIn(s.platforms, p.key) }))}
                      title={conn ? "Terhubung" : "Belum terhubung"}
                      className={[
                        "px-3 py-1.5 rounded-full text-xs border transition flex items-center gap-1.5",
                        on ? "border-transparent text-primary-foreground" : "border-border bg-card/40 hover:bg-sidebar-accent/60",
                      ].join(" ")}
                      style={on ? { background: "var(--gradient-neon)" } : undefined}
                    >
                      <span className={["h-1.5 w-1.5 rounded-full", conn ? "bg-emerald-400" : "bg-amber-400"].join(" ")} />
                      {p.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 max-w-md">
            <label className="text-xs">
              <span className="block text-muted-foreground mb-1">Posting per hari</span>
              <input
                type="number" min={1} max={4} value={cfg.perDay}
                onChange={(e) => setCfg((s) => ({ ...s, perDay: Math.max(1, Math.min(4, parseInt(e.target.value) || 1)) }))}
                className="w-full rounded-xl border border-border bg-card/50 px-3 py-2 text-sm"
              />
            </label>
            <label className="text-xs">
              <span className="block text-muted-foreground mb-1">Jumlah hari</span>
              <input
                type="number" min={1} max={14} value={cfg.days}
                onChange={(e) => setCfg((s) => ({ ...s, days: Math.max(1, Math.min(14, parseInt(e.target.value) || 7)) }))}
                className="w-full rounded-xl border border-border bg-card/50 px-3 py-2 text-sm"
              />
            </label>
          </div>
          {unconnectedSelected.length > 0 && (
            <div className="mt-4 rounded-xl border border-amber-400/40 bg-amber-400/10 p-3 text-xs text-amber-200 flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <div>
                Platform belum terhubung: <b>{unconnectedSelected.map(labelOfPlatform).join(", ")}</b>. Konten tetap dibuat & dijadwalkan, tapi saat waktunya tiba sistem tidak akan meng-upload. Sambungkan di{" "}
                <Link to="/ai-influencer/publisher" className="underline inline-flex items-center gap-1"><PlugZap className="h-3 w-3" /> Publisher</Link>.
              </div>
            </div>
          )}
        </Card>
      )}

      {loading && activeId && (
        <Card>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Memuat strategy & queue dari database…
          </div>
        </Card>
      )}

      <Card title="AI Content Strategy" sub="Ringkasan hasil generate — tersimpan otomatis di database.">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(strategy ?? [
            { k: "Posting Frequency", v: "—" }, { k: "Total Konten", v: "—" },
            { k: "Content Types", v: "—" }, { k: "Categories", v: "—" },
            { k: "Platforms", v: "—" },
          ]).map((r) => (
            <div key={r.k} className="rounded-xl border border-border/60 bg-card/40 p-3">
              <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">{r.k}</div>
              <div className="font-display text-lg mt-1">{r.v}</div>
            </div>
          ))}
        </div>
      </Card>

      <Card
        title="Daily Planner"
        sub="Konten siap-tayang: judul, caption, hashtag, tipe konten, jadwal. Edit jadwal (tidak boleh backdate) via input tanggal."
        right={
          <div className="flex gap-1">
            {(["calendar", "queue", "timeline"] as const).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={[
                  "px-3 py-1.5 rounded-full text-xs border transition",
                  view === v ? "border-transparent text-primary-foreground glow-pink" : "border-border bg-card/50",
                ].join(" ")}
                style={view === v ? { background: "var(--gradient-neon)" } : undefined}
              >
                {v === "calendar" && <CalendarRange className="inline h-3 w-3 mr-1" />}
                {v === "queue" && <ListChecks className="inline h-3 w-3 mr-1" />}
                {v === "timeline" && <Clock className="inline h-3 w-3 mr-1" />}
                {v[0].toUpperCase() + v.slice(1)}
              </button>
            ))}
          </div>
        }
      >
        {queue.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border/60 bg-card/20 p-10 text-center text-sm text-muted-foreground">
            Pilih config di atas lalu klik <b>Generate Weekly Strategy</b> — AI akan mengisi {view} dengan konten siap-pakai.
          </div>
        ) : view === "queue" ? (
          <ul className="space-y-3">
            {queue.map((it) => (
              <li key={it.id} className="rounded-xl border border-border/60 bg-card/40 p-3">
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1.5">
                      <Chip tone={it.status === "published" ? "success" : it.status === "failed" ? "danger" : it.status === "ready" ? "primary" : "default"}>
                        {it.status}
                      </Chip>
                      {it.payload?.content_type && <Chip tone="default">{it.payload.content_type}</Chip>}
                      {it.payload?.category && <Chip tone="default">{it.payload.category}</Chip>}
                      {it.platform && (
                        <Chip tone={connectedPlatforms.has(it.platform.toLowerCase()) ? "success" : "danger"}>
                          {labelOfPlatform(it.platform)}{connectedPlatforms.has(it.platform.toLowerCase()) ? "" : " · offline"}
                        </Chip>
                      )}
                    </div>
                    <div className="text-sm font-medium truncate">{it.payload?.title || it.idea}</div>
                    {it.payload?.caption && (
                      <div className="text-xs text-muted-foreground mt-1 line-clamp-2">{it.payload.caption}</div>
                    )}
                    {it.payload?.hashtags?.length ? (
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {it.payload.hashtags.slice(0, 8).map((h, i) => (
                          <span key={i} className="text-[10px] rounded-full bg-primary/10 text-primary px-2 py-0.5">
                            #{h.replace(/^#/, "")}
                          </span>
                        ))}
                      </div>
                    ) : null}
                    {it.payload?.video_reference_url && (
                      <div className="mt-1.5 text-[11px] text-muted-foreground truncate">
                        Ref video:{" "}
                        <a href={it.payload.video_reference_url} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                          {it.payload.video_reference_url}
                        </a>
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1.5 shrink-0">
                    <input
                      type="datetime-local"
                      min={minDateTime()}
                      value={it.scheduled_for ? toLocalInput(it.scheduled_for) : ""}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (!v) return;
                        rescheduleItem(it, new Date(v).toISOString());
                      }}
                      className="text-[11px] rounded-lg border border-border bg-card/50 px-2 py-1"
                    />
                    <button
                      onClick={() => _deleteQueue({ data: { id: it.id } }).then(() =>
                        setQueue((p) => p.filter((q) => q.id !== it.id)),
                      )}
                      className="text-muted-foreground hover:text-rose-300 text-[11px] inline-flex items-center gap-1"
                    >
                      <Trash2 className="h-3 w-3" /> Hapus
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        ) : view === "timeline" ? (
          <div className="relative pl-4">
            <div className="absolute left-1.5 top-2 bottom-2 w-px bg-border" />
            {queue.map((it) => (
              <div key={it.id} className="relative pl-4 py-2">
                <span className="absolute left-0 top-3 h-2 w-2 rounded-full bg-primary glow-pink" />
                <div className="text-sm">{it.payload?.title || it.idea}</div>
                <div className="text-[11px] text-muted-foreground">
                  {it.scheduled_for ? new Date(it.scheduled_for).toLocaleString() : "—"} · {it.status}
                  {it.payload?.content_type && ` · ${it.payload.content_type}`}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-7 gap-1.5">
            {Array.from({ length: 21 }).map((_, i) => {
              const has = queue[i % queue.length];
              return (
                <div key={i} className="aspect-square rounded-lg border border-border/60 bg-card/30 p-1.5 text-[10px] text-muted-foreground">
                  <div className="opacity-60">D{i + 1}</div>
                  {i < queue.length && has && (
                    <div className="mt-0.5 text-[10px] text-foreground truncate">{(has.payload?.title || has.idea).slice(0, 12)}</div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <Card title="AI Content Queue" sub="State lifecycle setiap item konten (tersimpan permanen di database).">
        <div className="flex flex-wrap gap-2">
          {CONTENT_QUEUE_STATES.map((s) => (
            <Chip key={s} tone={s === "published" ? "success" : s === "failed" ? "danger" : s === "ready" ? "primary" : "default"}>
              {s}
            </Chip>
          ))}
        </div>
        <div className="mt-4 text-xs text-muted-foreground">
          {queue.length === 0 ? "Belum ada item dalam antrian." : `${queue.length} item dalam antrian. Auto-publish poller aktif tiap 30 detik.`}
        </div>
      </Card>

      <Card title="Workflow" sub="Idea → Publish, otomatis dijalankan oleh Backend Router + Queue.">
        <div className="flex flex-wrap items-center gap-2">
          {WORKFLOW_STEPS.map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <div className="rounded-xl border border-border bg-card/50 px-3 py-2 text-xs font-medium">{s}</div>
              {i < WORKFLOW_STEPS.length - 1 && <ArrowRight className="h-3 w-3 text-muted-foreground" />}
            </div>
          ))}
        </div>
        <div className="mt-4 flex gap-2">
          <GhostButton disabled={!activeId || queue.length === 0 || cycling} onClick={runCycle}>
            {cycling ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            Jalankan 1 siklus otomatis
          </GhostButton>
          <Link to="/ai-influencer/library" className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline self-center">
            <RefreshCw className="h-3 w-3" /> Lihat hasil di Content Library →
          </Link>
        </div>
      </Card>
    </DashboardShell>
  );
}