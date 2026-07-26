import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { DashboardShell, PageHero } from "@/components/dashboard/shell";
import { Field, Input, Textarea, Select, PrimaryButton, GhostButton } from "@/components/dashboard/ui";
import { Download, ExternalLink, RefreshCw } from "lucide-react";
import {
  LEONARDO_MODELS,
  generateLeonardoImages,
  getAllLeonardoKeys,
  getFirstLeonardoKey,
  fetchLeonardoPlatformModels,
  type LeonardoPlatformModel,
} from "@/lib/providers/leonardo";
import {
  LEONARDO_VIDEO_MODELS,
  runLeonardoVideo,
  estimateLeonardoVideoCost,
  type LeonardoVideoAspect,
  type LeonardoVideoSizeTier,
} from "@/lib/providers/leonardo-video";

import {
  readRoutedImageProvider,
  imageModelsFor,
  ratiosFor,
  generateImageWithProvider,
  IMAGE_PROVIDER_LABEL,
  type ImageProviderId,
} from "@/lib/providers/image-catalog";

export const Route = createFileRoute("/generate/leonardo")({
  head: () => ({
    meta: [
      { title: "Text to Image — Creative Studio" },
      {
        name: "description",
        content:
          "Generate gambar dari teks memakai provider aktif di Routing — Weavy, Framia, Gemini, OpenAI, atau Leonardo.",
      },
      { property: "og:title", content: "Text to Image — Creative Studio" },
      {
        property: "og:description",
        content:
          "Satu halaman text-to-image multi-provider: model dan parameter otomatis mengikuti provider yang dirutekan.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "Text to Image — Creative Studio" },
      {
        name: "twitter:description",
        content:
          "Satu halaman text-to-image multi-provider: model dan parameter otomatis mengikuti provider yang dirutekan.",
      },
    ],
  }),
  component: LeonardoPage,
});


// Per-model preset table — sesuai app.leonardo.ai (screenshot).
type ModelPreset = {
  aspects: Array<{ value: string; label: string; ratio: number }>; // ratio = w/h
  tiers: Array<{ value: string; label: string; short: number }>; // short-side px
  quality?: Array<"low" | "medium" | "high">;
  promptEnhance?: boolean;
};

const ASPECTS_STD = [
  { value: "2:3", label: "2:3", ratio: 2 / 3 },
  { value: "1:1", label: "1:1", ratio: 1 },
  { value: "16:9", label: "16:9", ratio: 16 / 9 },
  { value: "9:16", label: "9:16", ratio: 9 / 16 },
];

// Exact dims table for gpt-image-2 (Leonardo only accepts these specific pairs).
const GPT_IMAGE_2_DIMS: Record<string, Record<string, { w: number; h: number }>> = {
  "2:3":  { small: { w: 768, h: 1376 }, medium: { w: 1136, h: 2048 }, large: { w: 2016, h: 3584 } },
  "9:16": { small: { w: 768, h: 1376 }, medium: { w: 1136, h: 2048 }, large: { w: 2016, h: 3584 } },
  "1:1":  { small: { w: 1024, h: 1024 }, medium: { w: 1536, h: 1536 }, large: { w: 2048, h: 2048 } },
  "16:9": { small: { w: 1376, h: 768 }, medium: { w: 2048, h: 1136 }, large: { w: 3584, h: 2016 } },
  "3:2":  { small: { w: 1376, h: 768 }, medium: { w: 2048, h: 1136 }, large: { w: 3584, h: 2016 } },
};

const MODEL_PRESETS: Record<string, ModelPreset> = {
  "gpt-image-2": {
    aspects: ASPECTS_STD,
    tiers: [
      { value: "small", label: "Small", short: 768 },
      { value: "medium", label: "Medium", short: 1136 },
      { value: "large", label: "Large", short: 2016 },
    ],
    quality: ["low", "medium", "high"],
  },
  "nano-banana-2": {
    aspects: ASPECTS_STD,
    tiers: [
      { value: "small", label: "Small", short: 768 },
      { value: "medium", label: "Medium", short: 1536 },
      { value: "large", label: "Large", short: 3072 },
    ],
    promptEnhance: true,
  },
  "seedream-5.0-pro": {
    aspects: ASPECTS_STD,
    tiers: [
      { value: "small", label: "Small", short: 1024 },
      { value: "medium", label: "Medium", short: 1536 },
      { value: "large", label: "Large", short: 2048 },
    ],
    promptEnhance: true,
  },
  "flux-pro-2.0": {
    aspects: ASPECTS_STD,
    tiers: [{ value: "std", label: "Standard", short: 816 }],
    promptEnhance: true,
  },
};

const DEFAULT_PRESET: ModelPreset = {
  aspects: ASPECTS_STD,
  tiers: [
    { value: "small", label: "Small", short: 768 },
    { value: "medium", label: "Medium", short: 1024 },
    { value: "large", label: "Large", short: 1536 },
  ],
};

function getPreset(modelId: string): ModelPreset {
  return MODEL_PRESETS[modelId] ?? DEFAULT_PRESET;
}

function computeDims(
  modelId: string,
  tierValue: string,
  aspectValue: string,
  short: number,
  ratio: number,
): { w: number; h: number } {
  if (modelId === "gpt-image-2") {
    const table = GPT_IMAGE_2_DIMS[aspectValue];
    const hit = table?.[tierValue];
    if (hit) return hit;
  }
  const ceil16 = (n: number) => Math.ceil(n / 16) * 16;
  if (ratio >= 1) return { w: ceil16(short * ratio), h: short };
  return { w: short, h: ceil16(short / ratio) };
}


function LeonardoPage() {
  const [mode, setMode] = useState<"image" | "video">("image");
  const [prompt, setPrompt] = useState("");
  const [neg, setNeg] = useState("");
  const [modelId, setModelId] = useState<string>(LEONARDO_MODELS[0].id);
  const [aspect, setAspect] = useState<string>("1:1");
  const [tier, setTier] = useState<string>("small");
  const [quality, setQuality] = useState<"low" | "medium" | "high">("medium");
  const [promptEnhance, setPromptEnhance] = useState<"OFF" | "AUTO">("OFF");
  const [num, setNum] = useState("1");
  const [busy, setBusy] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [images, setImages] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [keyCount, setKeyCount] = useState(0);
  const [remoteModels, setRemoteModels] = useState<LeonardoPlatformModel[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);

  // Video state
  const [vidModelId, setVidModelId] = useState<string>(LEONARDO_VIDEO_MODELS[0].id);
  const [vidAspect, setVidAspect] = useState<LeonardoVideoAspect>("9:16");
  const [vidDuration, setVidDuration] = useState<number>(5);
  const [vidTierId, setVidTierId] = useState<LeonardoVideoSizeTier["id"]>("hd");
  const [vidImageFile, setVidImageFile] = useState<File | null>(null);
  const [vidImagePreview, setVidImagePreview] = useState<string | null>(null);
  const [videos, setVideos] = useState<string[]>([]);
  const vidInput = useRef<HTMLInputElement>(null);
  const activeVidModel =
    LEONARDO_VIDEO_MODELS.find((m) => m.id === vidModelId) ?? LEONARDO_VIDEO_MODELS[0];

  // Sync video duration/tier/aspect saat ganti model
  useEffect(() => {
    if (activeVidModel.durationMode === "buttons") {
      if (!activeVidModel.durations.includes(vidDuration)) setVidDuration(activeVidModel.durations[0]);
    } else {
      const [mn, mx] = [activeVidModel.durations[0], activeVidModel.durations[activeVidModel.durations.length - 1]];
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

  const vidCostEstimate = estimateLeonardoVideoCost(activeVidModel, vidTierId, vidDuration);


  useEffect(() => {
    setKeyCount(getAllLeonardoKeys().length);
    const on = () => setKeyCount(getAllLeonardoKeys().length);
    window.addEventListener("aatools:keys-changed", on);
    window.addEventListener("storage", on);
    return () => {
      window.removeEventListener("aatools:keys-changed", on);
      window.removeEventListener("storage", on);
    };
  }, []);

  // ---- Provider routing (cap "image") ----
  const [imgProvider, setImgProvider] = useState<ImageProviderId>("leonardo");
  useEffect(() => {
    const sync = () => setImgProvider(readRoutedImageProvider());
    sync();
    window.addEventListener("aatools:routing-changed", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("aatools:routing-changed", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const genModels = imageModelsFor(imgProvider);
  const [genModelKey, setGenModelKey] = useState<string>("");
  const [genQuality, setGenQuality] = useState<string>("");
  const [genRatio, setGenRatio] = useState<string>("9:16");
  const activeGenModel = genModels.find((m) => m.key === genModelKey) ?? genModels[0];

  useEffect(() => {
    if (genModels.length === 0) return;
    if (!genModels.some((m) => m.key === genModelKey)) setGenModelKey(genModels[0].key);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imgProvider]);

  useEffect(() => {
    if (!activeGenModel) return;
    if (!activeGenModel.qualities.some((q) => q.v === genQuality)) {
      setGenQuality(activeGenModel.qualities[0].v);
    }
    const rs = ratiosFor(activeGenModel);
    if (!rs.includes(genRatio)) setGenRatio(rs[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [genModelKey, imgProvider]);

  const log = (m: string) =>
    setLogs((prev) => [`${new Date().toLocaleTimeString()} — ${m}`, ...prev].slice(0, 40));

  const generateWithRoutedProvider = async () => {
    if (!prompt.trim() || !activeGenModel || imgProvider === "leonardo") return;
    setBusy(true);
    setError(null);
    setImages([]);
    setLogs([]);
    try {
      const count = Number(num) || 1;
      const out: string[] = [];
      for (let i = 0; i < count; i++) {
        log(`(${i + 1}/${count}) ${activeGenModel.label}…`);
        const url = await generateImageWithProvider({
          provider: imgProvider,
          modelKey: activeGenModel.key,
          prompt,
          quality: genQuality,
          ratio: genRatio,
          onProgress: log,
          onRotate: (idx, total, reason) => log(`↻ rotate token #${idx}/${total}: ${reason}`),
        });
        out.push(url);
        setImages([...out]);
      }
      log(`✅ Selesai — ${out.length} gambar`);
    } catch (e) {
      const msg = (e as Error).message;
      setError(msg);
      log(`❌ ${msg}`);
    } finally {
      setBusy(false);
    }
  };


  const refreshModels = async () => {
    const token = getFirstLeonardoKey();
    if (!token) {
      setError("Belum ada token Leonardo tersimpan.");
      return;
    }
    setLoadingModels(true);
    setError(null);
    log("Mengambil daftar model dari Leonardo…");
    try {
      const list = await fetchLeonardoPlatformModels(token);
      setRemoteModels(list);
      log(`✅ ${list.length} model dimuat dari akun Leonardo`);
    } catch (e) {
      const msg = (e as Error).message;
      setError(msg);
      log(`❌ ${msg}`);
    } finally {
      setLoadingModels(false);
    }
  };

  const modelOptions =
    remoteModels.length > 0
      ? remoteModels.map((m) => ({ value: m.id, label: m.name || m.id }))
      : LEONARDO_MODELS.map((m) => ({ value: m.id, label: m.label }));


  const preset = getPreset(modelId);
  const activeAspect =
    preset.aspects.find((a) => a.value === aspect) ?? preset.aspects[0];
  const activeTier = preset.tiers.find((t) => t.value === tier) ?? preset.tiers[0];
  const dims = computeDims(modelId, activeTier.value, activeAspect.value, activeTier.short, activeAspect.ratio);

  // Reset aspect/tier when model changes if not compatible
  useEffect(() => {
    const p = getPreset(modelId);
    if (!p.aspects.some((a) => a.value === aspect)) setAspect(p.aspects[0].value);
    if (!p.tiers.some((t) => t.value === tier)) setTier(p.tiers[0].value);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modelId]);

  const generate = async () => {
    if (!prompt.trim()) return;
    setBusy(true);
    setError(null);
    setImages([]);
    setLogs([]);
    try {
      const { images } = await generateLeonardoImages(
        {
          prompt,
          negative_prompt: neg || undefined,
          modelId,
          width: dims.w,
          height: dims.h,
          num_images: Number(num) || 1,
          quality: preset.quality ? quality : undefined,
          promptEnhance,
        },
        {
          onProgress: log,
          onRotate: (i, total, reason) => log(`↻ rotate token #${i}/${total}: ${reason}`),
        },
      );
      setImages(images);
      log(`✅ Selesai — ${images.length} gambar`);
    } catch (e) {
      const msg = (e as Error).message;
      setError(msg);
      log(`❌ ${msg}`);
    } finally {
      setBusy(false);
    }
  };

  const generateVideo = async () => {
    if (!prompt.trim()) return;
    setBusy(true);
    setError(null);
    setLogs([]);
    try {
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
      log(`✅ Video siap`);
    } catch (e) {
      const msg = (e as Error).message;
      setError(msg);
      log(`❌ ${msg}`);
    } finally {
      setBusy(false);
    }
  };

  const onPickVidImage = (files: FileList | null) => {
    const f = files?.[0];
    if (!f) return;
    setVidImageFile(f);
    setVidImagePreview(URL.createObjectURL(f));
  };

  return (
    <DashboardShell>
      <PageHero
        eyebrow="Generate"
        title="Text to"
        highlight="Image"
        desc={`Provider aktif: ${IMAGE_PROVIDER_LABEL[imgProvider]} — model & parameter mengikuti routing di Manage → Routing.`}
      />

      {imgProvider === "leonardo" && (
        <div className="mt-4 inline-flex rounded-full border border-border bg-card/40 p-1 text-xs">
          <button
            onClick={() => setMode("image")}
            className={`px-4 py-1.5 rounded-full transition ${mode === "image" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >
            🖼️ Image
          </button>
          <button
            onClick={() => setMode("video")}
            className={`px-4 py-1.5 rounded-full transition ${mode === "video" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >
            🎬 Video
          </button>
        </div>
      )}

      {imgProvider === "leonardo" && keyCount === 0 && (
        <div className="neumorph rounded-xl border border-amber-500/40 bg-amber-500/5 p-4 text-sm mt-4">
          ⚠️ Belum ada token Leonardo tersimpan. Buka{" "}
          <a href="/manage/tokens" className="underline text-primary">
            Manage → Tokens → Leonardo
          </a>{" "}
          dan paste Cognito Bearer JWT dari DevTools app.leonardo.ai.
        </div>
      )}


      {mode === "video" ? (
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

            <div className="grid grid-cols-2 gap-3">
              <Field label="Model">
                <Select
                  value={vidModelId}
                  onChange={(e) => setVidModelId(e.target.value)}
                  options={LEONARDO_VIDEO_MODELS.map((m) => ({
                    value: m.id,
                    label: `${m.label} — ${m.group}`,
                  }))}
                />
              </Field>
              <Field label="Aspect Ratio">
                <Select
                  value={vidAspect}
                  onChange={(e) => setVidAspect(e.target.value as LeonardoVideoAspect)}
                  options={activeVidModel.aspectRatios.map((a) => ({ value: a, label: a }))}
                />
              </Field>
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
              <Field label="Ukuran (tier)">
                <Select
                  value={vidTierId}
                  onChange={(e) => setVidTierId(e.target.value as LeonardoVideoSizeTier["id"])}
                  options={activeVidModel.sizeTiers.map((t) => ({ value: t.id, label: t.label }))}
                />
              </Field>
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
              {activeVidModel.supportsI2V && (
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

            <div className="flex gap-2">
              <PrimaryButton
                onClick={generateVideo}
                disabled={busy || !prompt.trim() || keyCount === 0}
              >
                {busy ? "Generating…" : vidImageFile ? "Generate (I2V)" : "Generate (T2V)"}
              </PrimaryButton>
              <GhostButton
                onClick={() => {
                  setPrompt("");
                  setVideos([]);
                  setLogs([]);
                  setError(null);
                  setVidImageFile(null);
                  setVidImagePreview(null);
                }}
                disabled={busy}
              >
                Reset
              </GhostButton>
            </div>

            {error && (
              <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {error}
              </div>
            )}
          </div>

          <div className="neumorph rounded-xl p-4 space-y-3">
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
      ) : imgProvider !== "leonardo" ? (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px] mt-4">
          <div className="neumorph rounded-xl p-4 space-y-4">
            <Field label="Prompt">
              <Textarea
                rows={5}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Deskripsi visual yang kamu inginkan…"
              />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label={`Model (${IMAGE_PROVIDER_LABEL[imgProvider]})`}>
                <Select
                  value={activeGenModel?.key ?? ""}
                  onChange={(e) => setGenModelKey(e.target.value)}
                  options={genModels.map((m) => ({ value: m.key, label: m.label }))}
                />
              </Field>
              <Field label="Kualitas / Resolusi">
                <Select
                  value={genQuality}
                  onChange={(e) => setGenQuality(e.target.value)}
                  options={(activeGenModel?.qualities ?? []).map((q) => ({ value: q.v, label: q.label }))}
                />
              </Field>
              <Field label="Aspect ratio">
                <Select
                  value={genRatio}
                  onChange={(e) => setGenRatio(e.target.value)}
                  options={ratiosFor(activeGenModel).map((r) => ({ value: r, label: r }))}
                />
              </Field>
              <Field label="Jumlah gambar">
                <Select
                  value={num}
                  onChange={(e) => setNum(e.target.value)}
                  options={[1, 2, 3, 4].map((n) => ({ value: String(n), label: String(n) }))}
                />
              </Field>
            </div>

            <div className="flex gap-2">
              <PrimaryButton
                onClick={generateWithRoutedProvider}
                disabled={busy || !prompt.trim() || !activeGenModel}
              >
                {busy ? "Generating…" : "Generate"}
              </PrimaryButton>
              <GhostButton
                onClick={() => {
                  setPrompt("");
                  setImages([]);
                  setLogs([]);
                  setError(null);
                }}
                disabled={busy}
              >
                Reset
              </GhostButton>
            </div>

            {error && (
              <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {error}
              </div>
            )}

            <div className="text-[11px] text-muted-foreground">
              Ganti provider di{" "}
              <a href="/manage/routing" className="underline text-primary">
                Manage → Routing → Image
              </a>
              .
            </div>
          </div>

          <div className="neumorph rounded-xl p-4 space-y-3">
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
          </div>
        </div>
      ) : (

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px] mt-4">
        <div className="neumorph rounded-xl p-4 space-y-4">
          <Field label="Prompt">
            <Textarea
              rows={5}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Deskripsi visual yang kamu inginkan…"
            />
          </Field>
          <Field label="Negative prompt (opsional)">
            <Input
              value={neg}
              onChange={(e) => setNeg(e.target.value)}
              placeholder="blurry, low quality, watermark, text…"
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label={`Model${remoteModels.length > 0 ? ` (${remoteModels.length})` : ""}`}>
              <div className="flex gap-2">
                <div className="flex-1">
                  <Select
                    value={modelId}
                    onChange={(e) => setModelId(e.target.value)}
                    options={modelOptions}
                  />
                </div>
                <button
                  type="button"
                  onClick={refreshModels}
                  disabled={loadingModels || keyCount === 0}
                  className="inline-flex items-center gap-1 rounded-md border border-border px-2 text-[11px] text-primary hover:bg-primary/10 disabled:opacity-50"
                  title="Ambil daftar model dari akun Leonardo"
                >
                  <RefreshCw className={`h-3 w-3 ${loadingModels ? "animate-spin" : ""}`} />
                  {loadingModels ? "…" : "Refresh"}
                </button>
              </div>
            </Field>


            <Field label="Aspect ratio">
              <Select
                value={aspect}
                onChange={(e) => setAspect(e.target.value)}
                options={preset.aspects.map((a) => ({ value: a.value, label: a.label }))}
              />
            </Field>
            <Field label={`Size (${dims.w}×${dims.h})`}>
              <Select
                value={tier}
                onChange={(e) => setTier(e.target.value)}
                options={preset.tiers.map((t) => {
                  const d = computeDims(modelId, t.value, activeAspect.value, t.short, activeAspect.ratio);
                  return { value: t.value, label: `${t.label} (${d.w}×${d.h})` };
                })}

              />
            </Field>
            {preset.quality && (
              <Field label="Quality">
                <Select
                  value={quality}
                  onChange={(e) => setQuality(e.target.value as "low" | "medium" | "high")}
                  options={preset.quality.map((q) => ({
                    value: q,
                    label: q.charAt(0).toUpperCase() + q.slice(1),
                  }))}
                />
              </Field>
            )}
            {preset.promptEnhance && (
              <Field label="Prompt Enhance">
                <Select
                  value={promptEnhance}
                  onChange={(e) => setPromptEnhance(e.target.value as "OFF" | "AUTO")}
                  options={[
                    { value: "OFF", label: "Off" },
                    { value: "AUTO", label: "Auto" },
                  ]}
                />
              </Field>
            )}
            <Field label="Jumlah gambar">
              <Select
                value={num}
                onChange={(e) => setNum(e.target.value)}
                options={[1, 2, 3, 4].map((n) => ({ value: String(n), label: String(n) }))}
              />
            </Field>
          </div>

          <div className="flex gap-2">
            <PrimaryButton onClick={generate} disabled={busy || !prompt.trim() || keyCount === 0}>
              {busy ? "Generating…" : "Generate"}
            </PrimaryButton>
            <GhostButton
              onClick={() => {
                setPrompt("");
                setNeg("");
                setImages([]);
                setLogs([]);
                setError(null);
              }}
              disabled={busy}
            >
              Reset
            </GhostButton>
          </div>

          {error && (
            <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {error}
            </div>
          )}
        </div>

        <div className="neumorph rounded-xl p-4 space-y-3">
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
      )}

      {mode === "video" ? (
        <div className="neumorph rounded-xl p-4 mt-4">
          <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-3">
            Hasil Video ({videos.length})
          </div>
          {videos.length === 0 ? (
            <div className="text-xs text-muted-foreground italic">Belum ada video.</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {videos.map((url, i) => (
                <div
                  key={url + i}
                  className="rounded-lg overflow-hidden border border-border bg-black/40"
                >
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
      ) : (
        <div className="neumorph rounded-xl p-4 mt-4">
          <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-3">
            Hasil Generate
          </div>
          {images.length === 0 ? (
            <div className="text-xs text-muted-foreground italic">Belum ada gambar.</div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {images.map((url, i) => (
                <div
                  key={url + i}
                  className="group relative rounded-lg overflow-hidden border border-border bg-black/40"
                >
                  <img src={url} alt={`Leonardo ${i + 1}`} className="w-full h-auto block" />
                  <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 px-2 py-1.5 bg-black/60 opacity-0 group-hover:opacity-100 transition">
                    <a
                      href={url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-[10px] text-white hover:underline"
                    >
                      <ExternalLink className="h-3 w-3" /> Buka
                    </a>
                    <a
                      href={url}
                      download
                      className="inline-flex items-center gap-1 text-[10px] text-white hover:underline"
                    >
                      <Download className="h-3 w-3" /> Unduh
                    </a>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </DashboardShell>
  );
}
