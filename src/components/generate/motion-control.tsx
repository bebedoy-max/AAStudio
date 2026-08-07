import { GenMetaBar } from "@/components/generate/gen-meta-bar";
import { useFilePicker, toFileList } from "@/components/cloud/file-picker";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Rocket,
  Search,
  Download,
  Trash2,
  Plus,
  X,
  Upload,
  Video,
  Image as ImageIcon,
  Loader2,
} from "lucide-react";
import { DashboardShell, PageHero } from "@/components/dashboard/shell";
import {
  Field,
  Select,
  Textarea,
  Card,
  PrimaryButton,
  GhostButton,
  GalleryEmpty,
} from "@/components/dashboard/ui";
import { generateMotionAll, type MotionProvider } from "@/lib/providers/generate-motion";
import { logGenerate } from "@/lib/activity/log";
import { useSticky } from "@/lib/stores/use-sticky";
import { consumeHandoff } from "@/lib/creative/handoff";
import { ProviderActivePill } from "@/components/routing/quick-routing-dialog";

import { useAuth } from "@/lib/auth-context";
import { startNotification, finishNotification, failNotification } from "@/lib/stores/notifications";
import { confirmDialog } from "@/components/ui-confirm";
import { toast } from "sonner";
import { compressMediaFile, fmtMB, ROBONEO_MAX_BYTES } from "@/lib/media/compress";
import { useCloudGallery } from "@/lib/cloud/gallery";



// ---- Model catalog (kept in-sync with legacy MODELS.motion) ----
type Provider = MotionProvider;
type ModelOpt = { key: string; label: string; cr: number };

const MOTION_MODELS: Record<Provider, ModelOpt[]> = {
  weavy: [
    { key: "fal-ai/kling-video/v3/pro/motion-control", label: "Kling V3.0 Pro", cr: 240 },
    { key: "fal-ai/kling-video/v3/standard/motion-control", label: "Kling V3.0 Standard", cr: 150 },
    { key: "fal-ai/kling-video/v2.6/pro/motion-control", label: "Kling V2.6 Pro", cr: 80 },
    { key: "fal-ai/kling-video/v2.6/standard/motion-control", label: "Kling V2.6 Standard", cr: 50 },
  ],
  wavespeed: [
    { key: "ws:kwaivgi/kling-v3.0-pro/motion-control", label: "Kling V3.0 Pro", cr: 84 },
    { key: "ws:kwaivgi/kling-v3.0-std/motion-control", label: "Kling V3.0 Standard", cr: 63 },
    { key: "ws:kwaivgi/kling-v2.6-pro/motion-control", label: "Kling V2.6 Pro", cr: 56 },
    { key: "ws:kwaivgi/kling-v2.6-std/motion-control", label: "Kling V2.6 Standard", cr: 21 },
  ],
  magnific: [
    { key: "mag:kling-v3-motion-control-pro", label: "Kling V3.0 Pro (Magnific)", cr: 84 },
    { key: "mag:kling-v3-motion-control-std", label: "Kling V3.0 Standard (Magnific)", cr: 63 },
    { key: "mag:kling-v2-6-motion-control-pro", label: "Kling V2.6 Pro (Magnific)", cr: 56 },
    { key: "mag:kling-v2-6-motion-control-std", label: "Kling V2.6 Standard (Magnific)", cr: 21 },
  ],
  roboneo: [
    { key: "rn:video_bonbon_motioncontrol_v26:std", label: "Kling V2.6 Standard (Roboneo)", cr: 72 },
  ],
  framia: [
    { key: "framia:seedance-2.0-mini", label: "Seedance 2.0 mini (Framia)", cr: 60 },
  ],
};




const MAX_REFS = 12;

type SlotStatus = "idle" | "uploading img..." | "uploading vid..." | "processing" | "done" | "error";
type RefSlot = {
  id: string;
  image: File | null;
  imageUrl: string | null;
  video: File | null;
  videoUrl: string | null;
  status: SlotStatus;
  statusText?: string;
  resultUrl?: string;
  error?: string;
};

function newSlot(): RefSlot {
  return {
    id: Math.random().toString(36).slice(2),
    image: null,
    imageUrl: null,
    video: null,
    videoUrl: null,
    status: "idle",
  };
}

type ResultItem = { id: string; url: string; provider: Provider; modelKey: string; prompt: string; date: string };

const LS_ROUTING = "aatools.routing.v2";
const LOCAL_RESULTS_KEY = "aatools.motion.local-results";

function readRoutedMotionProvider(): Provider | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(LS_ROUTING);
    if (!raw) return null;
    const obj = JSON.parse(raw) as { motion?: string };
    const p = obj?.motion as Provider | undefined;
    return p && MOTION_MODELS[p] ? p : null;
  } catch {
    return null;
  }
}

export function MotionControl() {
  const { user } = useAuth();
  
  const uid = user?.id ?? null;

  // Provider aktif — SELALU ikut Routing Provider (manage/routing).
  // Fallback ke legacy key 'aatools:activeProvider' lalu 'weavy'.
  const [provider, setProvider] = useState<Provider>(() => {
    if (typeof window === "undefined") return "weavy";
    const routed = readRoutedMotionProvider();
    if (routed) return routed;
    try {
      const legacy = localStorage.getItem("aatools:activeProvider") as Provider | null;
      if (legacy && MOTION_MODELS[legacy]) return legacy;
    } catch {}
    return "weavy";
  });

  // Live-sync bila user mengubah routing di tab yg sama (custom event) atau
  // tab lain (storage event), juga saat window mendapat focus kembali.
  useEffect(() => {
    const sync = () => {
      const routed = readRoutedMotionProvider();
      if (routed && routed !== provider) setProvider(routed);
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key === LS_ROUTING || e.key === null) sync();
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener("focus", sync);
    window.addEventListener("aatools:routing-changed", sync as EventListener);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("focus", sync);
      window.removeEventListener("aatools:routing-changed", sync as EventListener);
    };
  }, [provider]);

  const models = MOTION_MODELS[provider];
  const [modelKey, setModelKey] = useSticky<string>("motion.modelKey", models[0].key);
  useEffect(() => {
    // reset model saat provider berubah HANYA jika model saat ini tidak valid
    const list = MOTION_MODELS[provider];
    if (!list.find((m) => m.key === modelKey)) setModelKey(list[0].key);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider]);

  const [orientation, setOrientation] = useSticky<string>("motion.orientation", "video");
  const [prompt, setPrompt] = useSticky<string>("motion.prompt", "");
  const [negativePrompt, setNegativePrompt] = useSticky<string>("motion.negativePrompt", "");
  const [keepSound, setKeepSound] = useSticky<boolean>("motion.keepSound", true);
  const [framiaResolution, setFramiaResolution] = useSticky<"480p" | "720p">("motion.framiaResolution", "480p");

  const [slots, setSlots] = useSticky<RefSlot[]>("motion.slots", [newSlot()]);

  const activeModel = models.find((m) => m.key === modelKey) ?? models[0];

  const readySlots = slots.filter((s) => s.image && s.video).length;
  const creditPerResult =
    provider === "framia"
      ? framiaResolution === "720p"
        ? 120
        : 60
      : activeModel.cr;
  const totalCredits = readySlots * creditPerResult;

  const [generating, setGenerating] = useSticky<boolean>("motion.generating", false);
  const [logs, setLogs] = useSticky<{ time: string; msg: string; level: string }[]>("motion.logs", []);
  const [elapsed, setElapsed] = useState("0:00");
  const startedAtRef = useRef<number | null>(null);
  const [search, setSearch] = useState("");

  // Global progress bar: rata-rata dari status semua slot yg sudah dimulai.
  const globalPct = useMemo(() => {
    const active = slots.filter((s) => s.image && s.video);
    if (active.length === 0) return 0;
    const scoreOf = (s: RefSlot) => {
      if (s.status === "done") return 100;
      if (s.status === "error") return 100;
      if (s.status === "processing") {
        const m = /(\d+)%/.exec(s.statusText || "");
        return m ? Math.max(60, Math.min(99, Number(m[1]))) : 70;
      }
      if (s.status === "uploading vid...") return 40;
      if (s.status === "uploading img...") return 20;
      return generating ? 5 : 0;
    };
    return Math.round(active.reduce((a, s) => a + scoreOf(s), 0) / active.length);
  }, [slots, generating]);
  const globalStatusText = useMemo(() => {
    const active = slots.filter((s) => s.image && s.video);
    if (active.length === 0) return "Idle";
    const done = active.filter((s) => s.status === "done").length;
    const err = active.filter((s) => s.status === "error").length;
    if (!generating && done + err === active.length && done + err > 0) {
      return err > 0 ? `Selesai — ${done} sukses · ${err} gagal` : `Selesai — ${done} video`;
    }
    if (generating) {
      const running = active.find((s) => s.status !== "done" && s.status !== "error" && s.status !== "idle");
      if (running) return `Slot #${active.indexOf(running) + 1}: ${running.statusText || running.status}`;
      return "Memproses…";
    }
    return "Idle";
  }, [slots, generating]);

  useEffect(() => {
    if (!generating) return;
    startedAtRef.current = Date.now();
    setElapsed("0:00");
    const iv = setInterval(() => {
      const el = Math.floor((Date.now() - (startedAtRef.current || Date.now())) / 1000);
      setElapsed(`${Math.floor(el / 60)}:${String(el % 60).padStart(2, "0")}`);
    }, 1000);
    return () => clearInterval(iv);
  }, [generating]);


  // Galeri hasil tersimpan di cloud (Google Drive), bukan localStorage.
  const gallery = useCloudGallery<{ provider?: string; modelKey?: string; prompt?: string }>("motion", "video");
  // Fallback lokal: kalau arsip ke cloud gagal (mis. URL provider tidak bisa
  // diunduh server), hasil generate tetap tampil di galeri sesi ini.
  const [localResults, setLocalResults] = useState<ResultItem[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const raw = localStorage.getItem(LOCAL_RESULTS_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? (parsed as ResultItem[]) : [];
    } catch {
      return [];
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(LOCAL_RESULTS_KEY, JSON.stringify(localResults.slice(0, 30)));
    } catch {
      /* ignore */
    }
  }, [localResults]);

  const results = useMemo<ResultItem[]>(() => {
    const cloud = gallery.items.map((it) => ({
      id: it.id,
      url: it.url,
      provider: (it.meta?.provider as Provider) || ("weavy" as Provider),
      modelKey: (it.meta?.modelKey as string) || "",
      prompt: (it.meta?.prompt as string) || "",
      date: it.createdAt,
    }));
    const archived = new Set(gallery.items.map((it) => it.sourceUrl).filter(Boolean) as string[]);
    const pending = localResults.filter((r) => !archived.has(r.url));
    return [...pending, ...cloud];
  }, [gallery.items, localResults]);


  useEffect(() => {
    // Consume handoff dari Creative Dashboard → prefill prompt (sekali saja)
    const h = consumeHandoff();
    if (h && h.workflow === "motion") {
      const seed = [h.title, h.hook, h.description].filter(Boolean).join(" — ");
      if (seed) setPrompt((p) => (p && p.trim() ? p : seed));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  const [exporting, setExporting] = useState(false);
  const [compressing, setCompressing] = useState<{ msg: string; pct?: number } | null>(null);
  const exportAll = async () => {
    const list = results.filter((r) => !search || r.prompt.toLowerCase().includes(search.toLowerCase()));
    if (list.length === 0 || exporting) return;
    setExporting(true);
    try {
      const { downloadFilesAsZip } = await import("@/lib/utils/download-zip");
      await downloadFilesAsZip(
        list.map((r, i) => ({ url: r.url, filename: `motion-${String(i + 1).padStart(2, "0")}-${r.id}.mp4` })),
        `motion-gallery-${new Date().toISOString().slice(0, 10)}.zip`,
      );
    } finally {
      setExporting(false);
    }
  };

  const downloadOne = async (r: ResultItem) => {
    try {
      const isRelative = !/^https?:\/\//i.test(r.url);
      let blob: Blob | null = null;
      try {
        const target = isRelative ? `${r.url}${r.url.includes("?") ? "&" : "?"}download=1&stream=1` : r.url;
        const res = await fetch(target, isRelative ? {} : { mode: "cors" });
        if (res.ok) blob = await res.blob();
      } catch {}
      if (!blob && !isRelative) {
        const res = await fetch(`/api/public/proxy-image?url=${encodeURIComponent(r.url)}`);
        if (res.ok) blob = await res.blob();
      }
      if (!blob) throw new Error("Download gagal");
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `motion-${r.id}.mp4`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    } catch (e) {
      pushLog(`Download error: ${(e as Error).message}`, "error");
    }
  };


  const clearAll = async () => {
    if (results.length === 0) return;
    const ok = await confirmDialog({
      title: `Hapus semua ${results.length} video dari gallery?`,
      description: "Video dihapus dari gallery aplikasi. File di Google Drive tetap tersimpan.",
      confirmLabel: "Ya, hapus semua",
      tone: "danger",
    });
    if (!ok) return;
    setLocalResults([]);
    await gallery.removeAll();

  };

  const canGenerate = readySlots > 0 && !generating;
  const pushLog = (msg: string, level: string = "info") =>
    setLogs((prev) => [...prev, { time: new Date().toLocaleTimeString(), msg, level }].slice(-200));

  const addSlot = () => {
    if (slots.length >= MAX_REFS) return;
    setSlots((prev) => [...prev, newSlot()]);
  };
  const removeSlot = (id: string) => {
    setSlots((prev) => (prev.length === 1 ? prev : prev.filter((s) => s.id !== id)));
  };
  const applySlotFile = (id: string, kind: "image" | "video", file: File | null) => {
    setSlots((prev) =>
      prev.map((s) => {
        if (s.id !== id) return s;
        if (kind === "image") {
          if (s.imageUrl) URL.revokeObjectURL(s.imageUrl);
          return { ...s, image: file, imageUrl: file ? URL.createObjectURL(file) : null };
        }
        if (s.videoUrl) URL.revokeObjectURL(s.videoUrl);
        return { ...s, video: file, videoUrl: file ? URL.createObjectURL(file) : null };
      }),
    );
  };

  // Khusus Roboneo: upload dibatasi 4MB → tawarkan kompresi otomatis.
  const setSlotFile = async (id: string, kind: "image" | "video", file: File | null) => {
    if (compressing) return;
    if (!file || provider !== "roboneo" || file.size <= ROBONEO_MAX_BYTES) {
      applySlotFile(id, kind, file);
      return;
    }
    const label = kind === "image" ? "Gambar" : "Video";
    const ok = await confirmDialog({
      title: `${label} lebih dari 4MB`,
      description: `File "${file.name}" berukuran ${fmtMB(file.size)}. Roboneo membatasi upload maksimal 4MB. Klik OK untuk mengompres file secara otomatis, atau tutup dialog untuk upload ulang file di bawah 4MB.`,
      confirmLabel: "OK, kompres file",
      cancelLabel: "Tutup",
      tone: "default",
    });
    if (!ok) return;

    setCompressing({ msg: `Mengompres ${label.toLowerCase()}…` });
    try {
      const out = await compressMediaFile(file, kind, ROBONEO_MAX_BYTES, (msg, pct) =>
        setCompressing({ msg, pct }),
      );
      applySlotFile(id, kind, out);
      toast.success(`${label} dikompres: ${fmtMB(file.size)} → ${fmtMB(out.size)}`);
    } catch (e) {
      toast.error((e as Error).message || "Kompresi gagal");
    } finally {
      setCompressing(null);
    }
  };

  const runGenerate = async () => {
    if (generating) return;
    const ready = slots
      .map((s, i) => ({ s, i }))
      .filter(({ s }) => s.image && s.video);
    if (ready.length === 0) return;
    logGenerate("motion", { provider, modelKey, status: "started", count: ready.length });
    try {
      const { trackGeneration } = await import("@/lib/dashboard/projects");
      trackGeneration({ kind: "motion", title: `Motion · ${ready.length} slot`, counts: { videos: ready.length } });
    } catch { /* ignore */ }
    setGenerating(true);
    setLogs([]);
    // Reset statuses on ready slots
    setSlots((prev) =>
      prev.map((s) =>
        s.image && s.video ? { ...s, status: "uploading img...", statusText: undefined, resultUrl: undefined, error: undefined } : s,
      ),
    );

    const notifId = `motion-${Date.now().toString(36)}`;
    startNotification(notifId, {
      label: `Generate Motion Control (${ready.length} slot)`,
      detail: prompt.trim() || `${provider} · ${modelKey}`,
      route: "/generate/motion",
    });

    const inputs = ready.map(({ s, i }) => ({ index: i, image: s.image!, video: s.video! }));
    let doneCount = 0;
    let errCount = 0;
    try {
      await generateMotionAll(inputs, {
        provider,
        modelKey,
        orientation: (orientation === "image" ? "image" : "video"),
        keepSound,
        prompt: prompt.trim() || undefined,
        resolution: provider === "framia" ? framiaResolution : undefined,
        onLog: (msg, level) => pushLog(msg, level || "info"),
        onStatus: ({ index, status, url, error }) => {
          setSlots((prev) =>
            prev.map((s, i) =>
              i === index
                ? {
                    ...s,
                    status: status.startsWith("upload")
                      ? (status as SlotStatus)
                      : status === "done"
                        ? "done"
                        : status === "error"
                          ? "error"
                          : "processing",
                    statusText: status,
                    resultUrl: url || s.resultUrl,
                    error: error || s.error,
                  }
                : s,
            ),
          );
          if (status === "done" && url) {
            doneCount += 1;
            const finishedUrl = url;
            // Tampilkan langsung di galeri (fallback lokal) supaya hasil tidak
            // hilang walau arsip ke cloud gagal / masih berjalan.
            setLocalResults((prev) =>
              prev.some((r) => r.url === finishedUrl)
                ? prev
                : [
                    {
                      id: `local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
                      url: finishedUrl,
                      provider,
                      modelKey,
                      prompt: prompt.trim(),
                      date: new Date().toISOString(),
                    },
                    ...prev,
                  ],
            );
            void gallery
              .add(finishedUrl, { provider, modelKey, prompt: prompt.trim() }, `motion-${Date.now()}.mp4`)
              .then((saved) => {
                if (!saved) {
                  pushLog("Gallery: gagal arsip ke cloud — hasil ditampilkan dari link provider.", "warn");
                }
              });
          } else if (status === "error") {
            errCount += 1;
          }

        },
      });
      if (errCount > 0 && doneCount === 0) {
        failNotification(notifId, `Semua slot gagal (${errCount})`);
        logGenerate("motion", { provider, modelKey, status: "error", success: doneCount, failed: errCount });
      } else if (errCount > 0) {
        finishNotification(notifId, { detail: `${doneCount} sukses · ${errCount} gagal`, route: "/generate/motion" });
        logGenerate("motion", { provider, modelKey, status: "partial", success: doneCount, failed: errCount });
      } else {
        finishNotification(notifId, { detail: `${doneCount} video siap`, route: "/generate/motion" });
        logGenerate("motion", { provider, modelKey, status: "success", success: doneCount });
      }
    } catch (e) {
      pushLog(`Fatal: ${(e as Error).message}`, "error");
      failNotification(notifId, (e as Error).message);
      logGenerate("motion", { provider, modelKey, status: "error", error: (e as Error).message });
    } finally {
      setGenerating(false);
    }
  };

  return (
    <DashboardShell>
      <PageHero
        eyebrow="Generate"
        title="Motion"
        highlight="Control"
        desc="Kling Motion Control — transfer gerakan karakter dari video / gambar referensi."
      />

      <div
        className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px] [grid-template-areas:'refs'_'settings'_'status'_'gallery'] lg:[grid-template-areas:'refs_settings'_'status_settings'_'gallery_settings']"
      >
        {/* References */}
        <div style={{ gridArea: "refs" }}>
          <div className="relative">
          <Card
            title={`Referensi (${slots.length}/${MAX_REFS})`}
            sub="Setiap pasang gambar + video menghasilkan 1 video"
            right={
              <GhostButton onClick={addSlot} disabled={slots.length >= MAX_REFS || !!compressing}>
                <Plus className="h-3.5 w-3.5" /> Tambah
              </GhostButton>
            }
          >
            <div
              aria-busy={!!compressing}
              className={
                "grid gap-3 grid-cols-1 " +
                (compressing ? "pointer-events-none opacity-60 " : "") +
                (slots.length === 1
                  ? "lg:grid-cols-1"
                  : slots.length === 2
                    ? "lg:grid-cols-2"
                    : "lg:grid-cols-3")
              }
            >

              {slots.map((s, idx) => (
                <RefCard
                  key={s.id}
                  index={idx}
                  slot={s}
                  onImage={(f) => setSlotFile(s.id, "image", f)}
                  onVideo={(f) => setSlotFile(s.id, "video", f)}
                  onRemove={() => removeSlot(s.id)}
                  canRemove={slots.length > 1}
                />
              ))}
            </div>
          </Card>
          {compressing ? (
            <div
              role="dialog"
              aria-modal="true"
              aria-live="polite"
              className="absolute inset-0 z-30 flex items-center justify-center rounded-2xl bg-background/70 backdrop-blur-sm"
            >
              <div className="w-[min(360px,90%)] rounded-2xl border border-primary/40 bg-card/95 p-5 shadow-2xl shadow-primary/20">
                <div className="flex items-center gap-3">
                  <Loader2 className="h-5 w-5 shrink-0 animate-spin text-primary" />
                  <div className="font-display text-sm text-foreground">Mengompres file…</div>
                </div>
                <div className="mt-3 text-xs text-muted-foreground break-words">{compressing.msg}</div>
                <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                  <div
                    className={
                      "h-full bg-primary transition-all " +
                      (typeof compressing.pct === "number" ? "" : "animate-pulse")
                    }
                    style={{
                      width:
                        typeof compressing.pct === "number"
                          ? `${Math.max(0, Math.min(100, compressing.pct))}%`
                          : "100%",
                    }}
                  />
                </div>
                <div className="mt-3 text-[10px] uppercase tracking-widest text-muted-foreground text-center">
                  Mohon tunggu sampai proses selesai
                </div>
              </div>
            </div>
          ) : null}
          </div>
        </div>



        {/* Right: settings (before gallery on mobile) */}
        <div className="flex flex-col gap-5" style={{ gridArea: "settings" }}>
          <Card title="Pengaturan">
            <div className="flex flex-col gap-4">


              <Field label="Model AI" right={<ProviderActivePill cap="motion" />}>
                <Select
                  value={modelKey}
                  onChange={(e) => setModelKey(e.target.value)}
                options={models.map((m) => ({
                  value: m.key,
                  label: m.label,
                }))}
                />
              </Field>


              {provider === "framia" ? (
                <Field label="Resolution" right={<span className="font-mono text-xs text-muted-foreground">15s · 9:16</span>}>
                  <Select
                    value={framiaResolution}
                    onChange={(e) => setFramiaResolution(e.target.value === "720p" ? "720p" : "480p")}
                    options={[
                      { value: "480p", label: "480P · 60 credits" },
                      { value: "720p", label: "720P · 120 credits" },
                    ]}
                  />
                </Field>
              ) : (
                <>
                  <Field label="Character Orientation">
                    <Select
                      value={orientation}
                      onChange={(e) => setOrientation(e.target.value)}
                      options={[
                        { value: "video", label: "Video (durasi mengikuti referensi)" },
                        { value: "image", label: "Image (output max 5–10 detik)" },
                      ]}
                    />
                  </Field>

                  <Field label="Prompt (opsional)">
                    <Textarea
                      value={prompt}
                      onChange={(e) => setPrompt(e.target.value)}
                      placeholder="Deskripsikan motion yang diinginkan…"
                    />
                  </Field>

                  <Field label="Negative Prompt (opsional)">
                    <Textarea
                      rows={2}
                      value={negativePrompt}
                      onChange={(e) => setNegativePrompt(e.target.value)}
                      placeholder="blurry, low quality, distorted…"
                    />
                  </Field>

                  <ControlledCheck
                    id="keepSoundCheck"
                    label="Keep Original Sound"
                    checked={keepSound}
                    onChange={setKeepSound}
                  />
                </>
              )}

              <PrimaryButton disabled={!canGenerate} onClick={runGenerate}>
                {generating ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Memproses…
                  </>
                ) : (
                  <>
                    <Rocket className="h-4 w-4" /> Generate Semua
                  </>
                )}
              </PrimaryButton>

              <GenMetaBar
                provider={provider}
                cost={totalCredits}
                status={generating ? "processing" : "idle"}
                stacked
              />

            </div>
          </Card>
        </div>

        {/* Status: progress + log — di atas gallery, selebar gallery */}
        {(generating || globalPct > 0 || logs.length > 0) && (
          <div style={{ gridArea: "status" }} className="flex flex-col gap-3">
            {(generating || globalPct > 0) && (
              <div className="rounded-xl border border-border/70 bg-card/40 p-3">
                <div className="flex justify-between items-center text-xs mb-1">
                  <span className="truncate pr-2">{globalStatusText}</span>
                  <span className="font-mono text-muted-foreground">{elapsed}</span>
                </div>
                <div className="h-1 rounded-full bg-border overflow-hidden">
                  <div
                    className="h-full transition-all"
                    style={{ width: `${globalPct}%`, background: "var(--gradient-neon)" }}
                  />
                </div>
              </div>
            )}

            {logs.length > 0 && (
              <div className="rounded-xl border border-border/70 bg-black/40 p-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-muted-foreground">
                    Log Proses {generating && <Loader2 className="inline h-3 w-3 animate-spin ml-1" />}
                  </div>
                  <button
                    onClick={() => setLogs([])}
                    className="text-[10px] text-muted-foreground hover:text-destructive"
                  >
                    Clear
                  </button>
                </div>
                <div className="max-h-40 overflow-y-auto overflow-x-hidden font-mono text-[10px] leading-relaxed min-w-0">
                  {logs.slice().reverse().map((l, i) => (
                    <div
                      key={i}
                      className={
                        "whitespace-pre-wrap break-all min-w-0 " +
                        (l.level === "error"
                          ? "text-red-400"
                          : l.level === "warn"
                            ? "text-amber-400"
                            : l.level === "success"
                              ? "text-emerald-400"
                              : "text-muted-foreground")
                      }
                    >
                      [{l.time}] {l.msg}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}



        {/* Gallery */}
        <div style={{ gridArea: "gallery" }}>

          <Card
            title="Gallery"
            sub="Video yang telah selesai dibuat"
            right={
              <div className="flex gap-2">
                <GhostButton onClick={exportAll} disabled={results.length === 0 || exporting} title="Export ZIP">
                  {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}{" "}
                  <span className="hidden sm:inline">{exporting ? "Zipping…" : "Export ZIP"}</span>
                </GhostButton>
                <GhostButton onClick={clearAll} disabled={results.length === 0} className="text-destructive hover:text-destructive" title="Hapus All">
                  <Trash2 className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Hapus All</span>
                </GhostButton>
              </div>
            }
          >
            <div className="flex items-center gap-2 rounded-full border border-border bg-card/50 px-3 py-2 mb-4">
              <Search className="h-4 w-4 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search prompt…"
                className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
            </div>
            {results.length === 0 ? (
              <GalleryEmpty />
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                {results
                  .filter((r) => !search || r.prompt.toLowerCase().includes(search.toLowerCase()))
                  .map((r) => (
                    <div key={r.id} className="rounded-xl overflow-hidden border border-border/60 bg-card/40 group">
                      <a href={r.url} target="_blank" rel="noreferrer" className="block relative">
                        <video src={r.url} controls preload="metadata" playsInline crossOrigin="anonymous" className="w-full aspect-video bg-black" />
                      </a>
                      <div className="p-2 text-[11px] text-muted-foreground flex items-center justify-between gap-2">
                        <span className="truncate flex-1" title={r.prompt}>{r.prompt || <span className="italic">(no prompt)</span>}</span>
                        <button
                          type="button"
                          onClick={() => downloadOne(r)}
                          className="inline-flex items-center gap-1 rounded-full border border-border bg-card/60 px-2 py-1 text-[11px] hover:text-foreground hover:border-primary/50 transition"
                          title="Download video"
                        >
                          <Download className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Download</span>
                        </button>
                        <button
                          onClick={() => {
                            if (r.id.startsWith("local-")) {
                              setLocalResults((prev) => prev.filter((x) => x.id !== r.id));
                              return;
                            }
                            void gallery.remove(r.id);
                          }}

                          className="inline-flex items-center gap-1 rounded-full border border-border bg-card/60 px-2 py-1 text-[11px] hover:text-destructive hover:border-destructive/50 transition"
                          title="Hapus dari gallery"
                        >
                          <Trash2 className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Hapus</span>
                        </button>

                      </div>
                    </div>
                  ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </DashboardShell>
  );
}

// Controlled variant of the shared Check component
function ControlledCheck({
  id,
  label,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label htmlFor={id} className="flex items-center gap-2.5 cursor-pointer select-none">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="peer sr-only"
      />
      <span className="h-5 w-5 rounded-md border border-border bg-card/50 grid place-items-center peer-checked:bg-[image:var(--gradient-neon)] peer-checked:border-transparent transition">
        <svg
          viewBox="0 0 24 24"
          className="h-3 w-3 text-primary-foreground opacity-0 peer-checked:opacity-100"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
        >
          <path d="M5 12l5 5L20 7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      <span className="text-sm text-foreground/90">{label}</span>
    </label>
  );
}

// ---- Reference slot card ----
function RefCard({
  index,
  slot,
  onImage,
  onVideo,
  onRemove,
  canRemove,
}: {
  index: number;
  slot: RefSlot;
  onImage: (f: File | null) => void;
  onVideo: (f: File | null) => void;
  onRemove: () => void;
  canRemove: boolean;
}) {
  const statusColor =
    slot.status === "done"
      ? "text-emerald-400 border-emerald-500/40"
      : slot.status === "error"
        ? "text-red-400 border-red-500/40"
        : slot.status === "idle"
          ? "text-muted-foreground border-border"
          : "text-amber-400 border-amber-500/40";
  return (
    <div className="rounded-2xl border border-border/70 bg-card/30 p-4">
      <div className="flex items-center justify-between mb-3 gap-2">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <div className="text-[11px] font-mono uppercase tracking-[0.2em] text-muted-foreground shrink-0">
            Referensi #{index + 1}
          </div>
          {slot.status !== "idle" && (
            <div className={`text-[10px] px-2 py-0.5 rounded-full border bg-black/30 truncate ${statusColor}`}>
              {slot.statusText || slot.status}
              {slot.error ? ` — ${slot.error}` : ""}
            </div>
          )}
        </div>
        {canRemove && (
          <button
            onClick={onRemove}
            className="inline-flex items-center gap-1 rounded-full border border-border bg-card/50 px-2.5 py-1 text-[11px] text-muted-foreground hover:text-destructive hover:border-destructive/50 transition"
            title="Hapus referensi"
          >
            <X className="h-3.5 w-3.5" /> Hapus
          </button>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <MediaUpload
          kind="image"
          label="Character Image"
          hint="PNG / JPG"
          accept="image/*"
          file={slot.image}
          previewUrl={slot.imageUrl}
          onChange={onImage}
        />
        <MediaUpload
          kind="video"
          label="Reference Video"
          hint="MP4 / MOV — sumber motion"
          accept="video/*"
          file={slot.video}
          previewUrl={slot.videoUrl}
          onChange={onVideo}
        />
      </div>
    </div>
  );
}

function MediaUpload({
  kind,
  label,
  hint,
  accept,
  file,
  previewUrl,
  onChange,
}: {
  kind: "image" | "video";
  label: string;
  hint: string;
  accept: string;
  file: File | null;
  previewUrl: string | null;
  onChange: (f: File | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const picker = useFilePicker();
  const pickFile = () =>
    void picker.pick({ accept, source: "motion-control", title: `Pilih ${label}` }).then((fs) => {
      if (fs[0]) onChange(fs[0]);
    });
  const Icon = kind === "image" ? ImageIcon : Video;
  const has = !!file && !!previewUrl;

  const sizeLabel = useMemo(() => {
    if (!file) return "";
    const mb = file.size / (1024 * 1024);
    return `${mb.toFixed(mb >= 10 ? 0 : 1)} MB`;
  }, [file]);

  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[11px] font-mono uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </label>
      <div
        onClick={pickFile}
        className={
          "relative overflow-hidden rounded-xl border border-dashed cursor-pointer group transition " +
          (has
            ? "border-primary/50 bg-card/50"
            : "border-border/80 bg-card/30 hover:border-primary/60")
        }
        style={{ aspectRatio: "16 / 10" }}
      >
        {has ? (
          <>
            {kind === "image" ? (
              <img src={previewUrl!} alt="" className="absolute inset-0 h-full w-full object-contain bg-black/40" />
            ) : (
              <video
                src={previewUrl!}
                className="absolute inset-0 h-full w-full object-contain bg-black/40"
                muted
                playsInline
              />
            )}

            <div className="absolute inset-x-0 bottom-0 bg-black/60 backdrop-blur-sm px-2.5 py-1.5 flex items-center justify-between text-[11px] opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 group-active:opacity-100 md:opacity-100 transition-opacity">
              <span className="truncate text-foreground/95 max-w-[70%]">{file!.name}</span>
              <span className="font-mono text-muted-foreground">{sizeLabel}</span>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onChange(null);
                if (inputRef.current) inputRef.current.value = "";
              }}
              className="absolute top-2 right-2 inline-flex items-center gap-1 rounded-full bg-black/70 backdrop-blur px-2 py-1 text-[11px] text-white hover:text-destructive transition md:px-2.5"
              title="Ganti file"
            >
              <X className="h-3.5 w-3.5" /> <span className="hidden md:inline">Ganti</span>
            </button>
          </>
        ) : (
          <div className="absolute inset-0 grid place-items-center text-center px-3">
            <div className="flex flex-col items-center gap-2">
              <div
                className="h-10 w-10 rounded-xl grid place-items-center text-primary-foreground"
                style={{ background: "var(--gradient-neon)" }}
              >
                <Icon className="h-5 w-5" />
              </div>
              <div className="flex items-center gap-1.5 text-sm text-foreground/90">
                <Upload className="h-3.5 w-3.5" /> Upload
              </div>

              <div className="text-[11px] text-muted-foreground">{hint}</div>
            </div>
          </div>
        )}
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          className="hidden"
          onChange={(e) => onChange(e.target.files?.[0] ?? null)}
        />
      </div>
      {picker.element}
    </div>

  );
}
