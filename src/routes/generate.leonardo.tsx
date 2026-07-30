import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useSticky } from "@/lib/stores/use-sticky";
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
  readRoutedImageProvider,
  imageModelsFor,
  ratiosFor,
  generateImageWithProvider,
  IMAGE_PROVIDER_LABEL,
  type ImageProviderId,
} from "@/lib/providers/image-catalog";
import { ProviderActivePill } from "@/components/routing/quick-routing-dialog";


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

// Seedream 5.0 Pro on Leonardo caps at ~2048 per side (validation fails
// when long side exceeds 2048). Table mirrors app.leonardo.ai presets.
const SEEDREAM_DIMS: Record<string, Record<string, { w: number; h: number }>> = {
  "1:1":  { small: { w: 1024, h: 1024 }, medium: { w: 1536, h: 1536 }, large: { w: 2048, h: 2048 } },
  "16:9": { small: { w: 1360, h: 768 }, medium: { w: 1728, h: 976 },   large: { w: 2048, h: 1152 } },
  "9:16": { small: { w: 768, h: 1360 }, medium: { w: 976, h: 1728 },   large: { w: 1152, h: 2048 } },
  "2:3":  { small: { w: 848, h: 1280 }, medium: { w: 1088, h: 1632 },  large: { w: 1280, h: 1920 } },
  "3:2":  { small: { w: 1280, h: 848 }, medium: { w: 1632, h: 1088 },  large: { w: 1920, h: 1280 } },
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
      { value: "small", label: "Small", short: 768 },
      { value: "medium", label: "Medium", short: 976 },
      { value: "large", label: "Large", short: 1152 },
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
  if (modelId === "seedream-5.0-pro") {
    const table = SEEDREAM_DIMS[aspectValue];
    const hit = table?.[tierValue];
    if (hit) return hit;
  }
  const ceil16 = (n: number) => Math.ceil(n / 16) * 16;
  if (ratio >= 1) return { w: ceil16(short * ratio), h: short };
  return { w: short, h: ceil16(short / ratio) };
}


function LeonardoPage() {
  const [prompt, setPrompt] = useSticky("t2i.prompt", "");
  const [neg, setNeg] = useSticky("t2i.neg", "");
  const [modelId, setModelId] = useSticky<string>("t2i.modelId", LEONARDO_MODELS[0].id);
  const [aspect, setAspect] = useSticky<string>("t2i.aspect", "1:1");
  const [tier, setTier] = useSticky<string>("t2i.tier", "small");
  const [quality, setQuality] = useSticky<"low" | "medium" | "high">("t2i.quality", "medium");
  const [promptEnhance, setPromptEnhance] = useSticky<"OFF" | "AUTO">("t2i.promptEnhance", "OFF");
  const [num, setNum] = useSticky("t2i.num", "1");
  const [busy, setBusy] = useSticky("t2i.busy", false);
  const [logs, setLogs] = useSticky<string[]>("t2i.logs", []);
  const [status, setStatus] = useSticky<{ show: boolean; text: string; pct: number; time: string }>("t2i.status", {
    show: false, text: "", pct: 0, time: "0:00",
  });
  const [images, setImages] = useSticky<string[]>("t2i.images", []);
  const [error, setError] = useSticky<string | null>("t2i.error", null);
  const [keyCount, setKeyCount] = useState(0);
  const [remoteModels, setRemoteModels] = useState<LeonardoPlatformModel[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);



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

  const generateWithRoutedProvider = async () => {
    if (!prompt.trim() || !activeGenModel || imgProvider === "leonardo") return;
    setBusy(true);
    setError(null);
    const stopTick = startStatus("Memulai…");
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
        setImages((prev) => [url, ...prev]);
      }
      log(`✅ Selesai — ${out.length} gambar`, 100);
      setStatus((s) => ({ ...s, pct: 100, text: "✅ Selesai" }));
    } catch (e) {
      const msg = (e as Error).message;
      setError(msg);
      log(`❌ ${msg}`, 100);
      setStatus((s) => ({ ...s, pct: 100, text: "❌ " + msg }));
    } finally {
      stopTick();
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
    const stopTick = startStatus("Leonardo: submit…");
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
          onProgress: (m) => log(m),
          onRotate: (i, total, reason) => log(`↻ rotate token #${i}/${total}: ${reason}`),
        },
      );
      setImages((prev) => [...images, ...prev]);
      log(`✅ Selesai — ${images.length} gambar`, 100);
      setStatus((s) => ({ ...s, pct: 100, text: "✅ Selesai" }));
    } catch (e) {
      const msg = (e as Error).message;
      setError(msg);
      log(`❌ ${msg}`, 100);
      setStatus((s) => ({ ...s, pct: 100, text: "❌ " + msg }));
    } finally {
      stopTick();
      setBusy(false);
    }
  };

  return (
    <DashboardShell>
      <PageHero
        eyebrow="Generate"
        title="Text to"
        highlight="Image"
        desc="Generate gambar — model & parameter mengikuti routing provider aktif."
      />



      {imgProvider === "leonardo" && keyCount === 0 && (
        <div className="neumorph rounded-xl border border-amber-500/40 bg-amber-500/5 p-4 text-sm mt-4">
          ⚠️ Belum ada token Leonardo tersimpan. Buka{" "}
          <a href="/manage/tokens" className="underline text-primary">
            Manage → Tokens → Leonardo
          </a>{" "}
          dan paste Cognito Bearer JWT dari DevTools app.leonardo.ai.
        </div>
      )}


      {imgProvider !== "leonardo" ? (
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

            <div className="flex flex-col gap-1.5">
              <div className="flex flex-wrap items-center gap-2 min-h-[20px]">
                <label className="text-[11px] font-mono uppercase tracking-[0.18em] text-muted-foreground">
                  Model AI
                </label>
                <ProviderActivePill cap="image" />
              </div>
              <Select
                value={activeGenModel?.key ?? ""}
                onChange={(e) => setGenModelKey(e.target.value)}
                options={genModels.map((m) => ({ value: m.key, label: m.label }))}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
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
            {status.show && (
              <div className="rounded-lg border border-border/70 bg-card/40 p-2">
                <div className="flex justify-between items-center text-[11px] mb-1">
                  <span className="text-foreground">{status.text}</span>
                  <span className="font-mono text-muted-foreground">{status.time}</span>
                </div>
                <div className="h-1 rounded-full bg-border overflow-hidden">
                  <div className="h-full transition-all" style={{ width: `${status.pct}%`, background: "var(--gradient-neon, linear-gradient(90deg,#22d3ee,#a78bfa))" }} />
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

          <div className="flex flex-col gap-1.5">
            <div className="flex flex-wrap items-center gap-2 min-h-[20px]">
              <label className="text-[11px] font-mono uppercase tracking-[0.18em] text-muted-foreground">
                Model AI
              </label>
              <ProviderActivePill cap="image" />
            </div>
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
          </div>

          <div className="grid grid-cols-2 gap-3">



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
          {status.show && (
            <div className="rounded-lg border border-border/70 bg-card/40 p-2">
              <div className="flex justify-between items-center text-[11px] mb-1">
                <span className="text-foreground">{status.text}</span>
                <span className="font-mono text-muted-foreground">{status.time}</span>
              </div>
              <div className="h-1 rounded-full bg-border overflow-hidden">
                <div className="h-full transition-all" style={{ width: `${status.pct}%`, background: "var(--gradient-neon, linear-gradient(90deg,#22d3ee,#a78bfa))" }} />
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
      )}

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
    </DashboardShell>
  );
}
