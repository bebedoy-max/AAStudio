import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Download, ExternalLink } from "lucide-react";
import { useSticky } from "@/lib/stores/use-sticky";
import { DashboardShell, PageHero } from "@/components/dashboard/shell";
import { Field, Textarea, Select, PrimaryButton, GhostButton } from "@/components/dashboard/ui";
import { ProviderActivePill } from "@/components/routing/quick-routing-dialog";
import { getAllLeonardoKeys } from "@/lib/providers/leonardo";
import {
  LEONARDO_VIDEO_MODELS,
  runLeonardoVideo,
  estimateLeonardoVideoCost,
  type LeonardoVideoAspect,
  type LeonardoVideoSizeTier,
} from "@/lib/providers/leonardo-video";
import {
  FIREFLY_VIDEO_MODELS,
  generateFireflyVideo,
  runFireflyWithRotation,
  getAllFireflyKeys,
} from "@/lib/providers/firefly";

const T2V_PROVIDERS = [
  { value: "leonardo", label: "Leonardo.ai" },
  { value: "firefly", label: "Adobe Firefly" },
] as const;
type T2VProvider = (typeof T2V_PROVIDERS)[number]["value"];
const FIREFLY_RATIOS = ["16:9", "9:16", "1:1"];

export const Route = createFileRoute("/generate/text-to-video")({
  head: () => ({
    meta: [
      { title: "Text to Video — Creative Studio" },
      {
        name: "description",
        content: "Generate video dari teks (T2V) atau gambar referensi (I2V) memakai model video Leonardo.",
      },
      { property: "og:title", content: "Text to Video — Creative Studio" },
      {
        property: "og:description",
        content: "Pilih model video Leonardo, aspect ratio, durasi, dan tier resolusi lalu generate video.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "Text to Video — Creative Studio" },
      {
        name: "twitter:description",
        content: "Pilih model video Leonardo, aspect ratio, durasi, dan tier resolusi lalu generate video.",
      },
    ],
  }),
  component: TextToVideoPage,
});

function TextToVideoPage() {
  const [prompt, setPrompt] = useSticky("t2v.prompt", "");
  const [busy, setBusy] = useSticky("t2v.busy", false);
  const [logs, setLogs] = useSticky<string[]>("t2v.logs", []);
  const [status, setStatus] = useSticky<{ show: boolean; text: string; pct: number; time: string }>("t2v.status", {
    show: false, text: "", pct: 0, time: "0:00",
  });
  const [runState, setRunState] = useSticky<"idle" | "processing" | "sukses" | "gagal">("t2v.runState", "idle");
  const [error, setError] = useSticky<string | null>("t2v.error", null);
  const [videos, setVideos] = useSticky<string[]>("t2v.videos", []);
  const [keyCount, setKeyCount] = useState(0);
  const [vidProvider, setVidProvider] = useSticky<T2VProvider>("t2v.provider", "leonardo");
  const [ffModelKey, setFfModelKey] = useSticky<string>("t2v.ffModel", FIREFLY_VIDEO_MODELS[0].key);
  const [ffRatio, setFfRatio] = useSticky<string>("t2v.ffRatio", "9:16");
  const [ffDuration, setFfDuration] = useSticky<number>("t2v.ffDuration", 8);
  const isFirefly = vidProvider === "firefly";
  const activeFfModel =
    FIREFLY_VIDEO_MODELS.find((m) => m.key === ffModelKey) ?? FIREFLY_VIDEO_MODELS[0];

  const [vidModelId, setVidModelId] = useSticky<string>("t2v.modelId", LEONARDO_VIDEO_MODELS[0].id);
  const [vidAspect, setVidAspect] = useSticky<LeonardoVideoAspect>("t2v.aspect", "9:16");
  const [vidDuration, setVidDuration] = useSticky<number>("t2v.duration", 5);
  const [vidTierId, setVidTierId] = useSticky<LeonardoVideoSizeTier["id"]>("t2v.tier", "hd");
  const [vidImageFile, setVidImageFile] = useState<File | null>(null);
  const [vidImagePreview, setVidImagePreview] = useState<string | null>(null);
  const vidInput = useRef<HTMLInputElement>(null);

  const activeVidModel =
    LEONARDO_VIDEO_MODELS.find((m) => m.id === vidModelId) ?? LEONARDO_VIDEO_MODELS[0];

  useEffect(() => {
    const count = () => (isFirefly ? getAllFireflyKeys().length : getAllLeonardoKeys().length);
    setKeyCount(count());
    const on = () => setKeyCount(count());
    window.addEventListener("aatools:keys-changed", on);
    window.addEventListener("storage", on);
    return () => {
      window.removeEventListener("aatools:keys-changed", on);
      window.removeEventListener("storage", on);
    };
  }, [isFirefly]);

  useEffect(() => {
    if (activeVidModel.durationMode === "buttons") {
      if (!activeVidModel.durations.includes(vidDuration)) setVidDuration(activeVidModel.durations[0]);
    } else {
      const mn = activeVidModel.durations[0];
      const mx = activeVidModel.durations[activeVidModel.durations.length - 1];
      if (vidDuration < mn || vidDuration > mx) setVidDuration(mx);
    }
    if (!activeVidModel.sizeTiers.some((t) => t.id === vidTierId)) {
      setVidTierId(activeVidModel.sizeTiers[0].id);
    }
    if (!activeVidModel.aspectRatios.includes(vidAspect)) {
      setVidAspect(activeVidModel.aspectRatios[0]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vidModelId]);

  useEffect(() => {
    const list = activeFfModel.durations ?? [8];
    if (!list.includes(ffDuration)) setFfDuration(list[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ffModelKey]);

  const vidCostEstimate = estimateLeonardoVideoCost(activeVidModel, vidTierId, vidDuration);

  const log = (m: string, pct?: number) => {
    setLogs((prev) => [`${new Date().toLocaleTimeString()} — ${m}`, ...prev].slice(0, 40));
    setStatus((s) => ({ ...s, text: m, pct: pct != null ? pct : s.pct }));
  };

  const startStatus = (text: string) => {
    const start = Date.now();
    setStatus({ show: true, text, pct: 5, time: "0:00" });
    const tick = setInterval(() => {
      const el = Math.floor((Date.now() - start) / 1000);
      setStatus((s) => ({ ...s, time: `${Math.floor(el / 60)}:${String(el % 60).padStart(2, "0")}` }));
    }, 1000);
    return () => clearInterval(tick);
  };

  const onPickVidImage = (files: FileList | null) => {
    const f = files?.[0];
    if (!f) return;
    setVidImageFile(f);
    setVidImagePreview(URL.createObjectURL(f));
  };

  const generateVideo = async () => {
    if (!prompt.trim()) return;
    setBusy(true);
    setError(null);
    setRunState("processing");
    const stopTick = startStatus(isFirefly ? "Firefly Video: submit…" : "Leonardo Video: submit…");
    try {
      if (isFirefly) {
        log(`Submit ${activeFfModel.label} (${ffDuration}s · ${ffRatio})`);
        const url = await runFireflyWithRotation(
          (token) =>
            generateFireflyVideo({
              token,
              modelKey: activeFfModel.key,
              prompt,
              ratio: ffRatio,
              duration: ffDuration,
              onProgress: (m, pct) => log(m, pct),
            }),
          (i, total, reason) => log(`↻ rotate token #${i}/${total}: ${reason}`),
        );
        setVideos((v) => [url, ...v]);
        log("✅ Video siap", 100);
        setRunState("sukses");
        setStatus((s) => ({ ...s, pct: 100, text: "✅ Selesai" }));
        stopTick();
        setBusy(false);
        return;
      }
      const tierLabel = activeVidModel.sizeTiers.find((t) => t.id === vidTierId)?.label ?? vidTierId;
      log(`Submit ${activeVidModel.label} (${tierLabel} · ${vidDuration}s · ${vidAspect})`);
      const url = await runLeonardoVideo({
        modelKey: activeVidModel.id,
        prompt,
        aspectRatio: vidAspect,
        sizeTier: vidTierId,
        duration: vidDuration,
        imageFile: vidImageFile ?? undefined,
        onProgress: (m) => log(m),
        onRotate: (i, total, reason) => log(`↻ rotate token #${i}/${total}: ${reason}`),
      });
      setVideos((v) => [url, ...v]);
      log(`✅ Video siap`, 100);
      setRunState("sukses");
      setStatus((s) => ({ ...s, pct: 100, text: "✅ Selesai" }));
    } catch (e) {
      const msg = (e as Error).message;
      setError(msg);
      log(`❌ ${msg}`, 100);
      setRunState("gagal");
      setStatus((s) => ({ ...s, pct: 100, text: "❌ " + msg }));
    } finally {
      stopTick();
      setBusy(false);
    }
  };

  const statusTone =
    runState === "sukses"
      ? "text-emerald-400"
      : runState === "gagal"
        ? "text-destructive"
        : runState === "processing"
          ? "text-amber-300"
          : "text-muted-foreground";

  return (
    <DashboardShell>
      <PageHero
        eyebrow="Generate"
        title="Text to"
        highlight="Video"
        desc="Generate video dari teks (T2V) atau tambahkan gambar referensi untuk I2V."
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px] mt-4">
        <div className="neumorph rounded-xl p-4 space-y-4">
          <Field label="Prompt (deskripsi motion / kamera / suasana)">
            <Textarea
              rows={4}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Cinematic slow pan, subject centered, natural lighting…"
            />
          </Field>

<<<<<<< HEAD
          <div className="flex flex-col gap-1.5">
            <div className="flex flex-wrap items-center gap-2 min-h-[20px]">
              <label className="text-[11px] font-mono uppercase tracking-[0.18em] text-muted-foreground">
                Model AI
              </label>
              <ProviderActivePill cap="video" />
            </div>
=======
          <Field label="Model AI" right={<ProviderActivePill cap="video" />}>
>>>>>>> 99c245e4c7b9b523e9afcfe27868494835570e1d
            {isFirefly ? (
              <Select
                value={ffModelKey}
                onChange={(e) => setFfModelKey(e.target.value)}
                options={FIREFLY_VIDEO_MODELS.map((m) => ({
                  value: m.key,
                  label: `${m.label} — ${m.cost}`,
                }))}
              />
            ) : (
              <Select
                value={vidModelId}
                onChange={(e) => setVidModelId(e.target.value)}
                options={LEONARDO_VIDEO_MODELS.map((m) => ({
                  value: m.id,
                  label: `${m.label} — ${m.group}`,
                }))}
              />
            )}
<<<<<<< HEAD
          </div>
=======
          </Field>
>>>>>>> 99c245e4c7b9b523e9afcfe27868494835570e1d

          <div className="grid grid-cols-2 gap-3">
            <Field label="Provider">
              <Select
                value={vidProvider}
                onChange={(e) => setVidProvider(e.target.value as T2VProvider)}
                options={T2V_PROVIDERS.map((p) => ({ value: p.value, label: p.label }))}
              />
            </Field>
            <Field label="Aspect Ratio">
              {isFirefly ? (
                <Select
                  value={ffRatio}
                  onChange={(e) => setFfRatio(e.target.value)}
                  options={FIREFLY_RATIOS.map((a) => ({ value: a, label: a }))}
                />
              ) : (
                <Select
                  value={vidAspect}
                  onChange={(e) => setVidAspect(e.target.value as LeonardoVideoAspect)}
                  options={activeVidModel.aspectRatios.map((a) => ({ value: a, label: a }))}
                />
              )}
            </Field>
            {isFirefly && (
              <Field label="Durasi">
                <Select
                  value={String(ffDuration)}
                  onChange={(e) => setFfDuration(Number(e.target.value))}
                  options={(activeFfModel.durations ?? [8]).map((d) => ({ value: String(d), label: `${d}s` }))}
                />
              </Field>
            )}
            {isFirefly && (
              <Field label="Estimasi biaya">
                <div className="rounded-lg border border-border bg-card/40 px-3 py-2 text-sm">
                  <span className="font-mono text-emerald-300">{activeFfModel.cost}</span>{" "}
                  <span className="text-muted-foreground text-xs">Firefly generative credits</span>
                </div>
              </Field>
            )}
            {!isFirefly && (
            <Field
              label={
                activeVidModel.durationMode === "slider"
                  ? `Durasi (${vidDuration}s · slider ${activeVidModel.durations[0]}–${activeVidModel.durations[activeVidModel.durations.length - 1]}s)`
                  : "Durasi"
              }
            >
              {activeVidModel.durationMode === "slider" ? (
                <input
                  type="range"
                  min={activeVidModel.durations[0]}
                  max={activeVidModel.durations[activeVidModel.durations.length - 1]}
                  step={1}
                  value={vidDuration}
                  onChange={(e) => setVidDuration(Number(e.target.value))}
                  className="w-full accent-primary"
                />
              ) : (
                <Select
                  value={String(vidDuration)}
                  onChange={(e) => setVidDuration(Number(e.target.value))}
                  options={activeVidModel.durations.map((d) => ({ value: String(d), label: `${d}s` }))}
                />
              )}
            </Field>
            )}
            {!isFirefly && (
            <Field label="Ukuran (tier)">
              <Select
                value={vidTierId}
                onChange={(e) => setVidTierId(e.target.value as LeonardoVideoSizeTier["id"])}
                options={activeVidModel.sizeTiers.map((t) => ({ value: t.id, label: t.label }))}
              />
            </Field>
            )}
            {!isFirefly && (
            <Field label="Estimasi biaya">
              <div className="rounded-lg border border-border bg-card/40 px-3 py-2 text-sm">
                <span className="font-mono text-emerald-300">{vidCostEstimate}</span>{" "}
                <span className="text-muted-foreground text-xs">Leonardo credits (≈ {activeVidModel.crPerSecond}/s)</span>
                {activeVidModel.audio && (
                  <span className="ml-2 text-[10px] uppercase tracking-widest px-1.5 py-0.5 rounded border border-primary/40 text-primary">
                    audio
                  </span>
                )}
              </div>
            </Field>
            )}
            {!isFirefly && activeVidModel.supportsI2V && (
              <Field label="Image reference (opsional — untuk I2V)">
                <div className="flex items-center gap-2">
                  <input
                    ref={vidInput}
                    type="file"
                    accept="image/*"
                    hidden
                    onChange={(e) => onPickVidImage(e.target.files)}
                  />
                  <GhostButton onClick={() => vidInput.current?.click()} disabled={busy}>
                    {vidImagePreview ? "Ganti" : "Upload"}
                  </GhostButton>
                  {vidImagePreview && (
                    <>
                      <img
                        src={vidImagePreview}
                        alt=""
                        className="h-10 w-10 rounded object-cover border border-border"
                      />
                      <button
                        onClick={() => {
                          setVidImageFile(null);
                          setVidImagePreview(null);
                        }}
                        className="text-[11px] text-destructive hover:underline"
                      >
                        hapus
                      </button>
                    </>
                  )}
                </div>
              </Field>
            )}
          </div>

          <div className="flex gap-2 items-center flex-wrap">
            <PrimaryButton onClick={generateVideo} disabled={busy || !prompt.trim() || keyCount === 0}>
              {busy ? "Generating…" : vidImageFile ? "Generate (I2V)" : "Generate (T2V)"}
            </PrimaryButton>
            <GhostButton
              onClick={() => {
                setPrompt("");
                setVideos([]);
                setLogs([]);
                setError(null);
                setRunState("idle");
                setVidImageFile(null);
                setVidImagePreview(null);
              }}
              disabled={busy}
            >
              Reset
            </GhostButton>
            <div className="text-xs text-muted-foreground">
              Token: <b className="text-fuchsia-300">{keyCount}</b>
              {" · "}Status: <b className={statusTone}>{runState}</b>
            </div>
          </div>

          {error && (
            <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {error}
            </div>
          )}
        </div>

        <div className="neumorph rounded-xl p-4 space-y-3">
          {status.show && (
            <div className="rounded-lg border border-border/70 bg-card/40 p-2">
              <div className="flex justify-between items-center text-[11px] mb-1">
                <span className="text-foreground">{status.text}</span>
                <span className="font-mono text-muted-foreground">{status.time}</span>
              </div>
              <div className="h-1 rounded-full bg-border overflow-hidden">
                <div
                  className="h-full transition-all"
                  style={{ width: `${status.pct}%`, background: "var(--gradient-neon, linear-gradient(90deg,#22d3ee,#a78bfa))" }}
                />
              </div>
            </div>
          )}
          <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
            Log Proses
          </div>
          <div className="rounded-lg border border-border bg-black/40 p-2 h-56 overflow-auto font-mono text-[11px] leading-relaxed">
            {logs.length === 0 ? (
              <div className="text-muted-foreground italic">Belum ada aktivitas.</div>
            ) : (
              logs.map((l, i) => (
                <div key={i} className="text-muted-foreground">
                  {l}
                </div>
              ))
            )}
          </div>
          <div className="text-[11px] text-muted-foreground">
            Token tersimpan: <b className="text-emerald-400">{keyCount}</b>
          </div>
        </div>
      </div>

      <div className="neumorph rounded-xl p-4 mt-4">
        <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-3">
          Hasil Video ({videos.length})
        </div>
        {videos.length === 0 ? (
          <div className="text-xs text-muted-foreground italic">Belum ada video.</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {videos.map((url, i) => (
              <div key={url + i} className="rounded-lg overflow-hidden border border-border bg-black/40">
                <video
                  src={url}
                  controls
                  preload="metadata"
                  playsInline
                  crossOrigin="anonymous"
                  className="w-full aspect-video object-contain bg-black"
                />
                <div className="p-2 flex justify-between text-[11px]">
                  <a href={url} target="_blank" rel="noreferrer" className="text-primary hover:underline inline-flex items-center gap-1">
                    <ExternalLink className="h-3 w-3" /> Buka
                  </a>
                  <a href={url} download className="text-primary hover:underline inline-flex items-center gap-1">
                    <Download className="h-3 w-3" /> Unduh
                  </a>
                  <button
                    onClick={() => setVideos((v) => v.filter((_, idx) => idx !== i))}
                    className="text-destructive hover:underline"
                  >
                    Hapus
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </DashboardShell>
  );
}
