import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Rocket, Trash2, Plus, RefreshCw, X } from "lucide-react";
import { logGenerate } from "@/lib/activity/log";
import { DashboardShell, PageHero } from "@/components/dashboard/shell";
import { Field, Select, Textarea, Input, Card, PrimaryButton, GhostButton, GalleryEmpty } from "@/components/dashboard/ui";
import { useSticky } from "@/lib/stores/use-sticky";
import { consumeHandoff } from "@/lib/creative/handoff";
import { leonardoVideoQualityOptions } from "@/lib/providers/leonardo-video";
import { ProviderActivePill } from "@/components/routing/quick-routing-dialog";
import { useProviderCredit } from "@/lib/providers/credit-summary";





export const Route = createFileRoute("/generate/image-to-video")({
  head: () => ({
    meta: [
      { title: "Image To Video — AA Creative Studio" },
      { name: "description", content: "1 gambar → pilih model, aspek rasio, kualitas, prompt → generate video." },
    ],
  }),
  component: ImageToVideo,
});

type ModelOpt = { value: string; label: string; cr: number };
const I2V_CATALOG: Record<string, ModelOpt[]> = {
  weavy: [
    { value: "kling-2.1", label: "Kling V2.1", cr: 30 },
    { value: "kling-1.6-standard", label: "Kling V1.6 Standard", cr: 25 },
    { value: "kling-1.6-pro", label: "Kling V1.6 Pro", cr: 40 },
    { value: "kling-3-pro", label: "Kling V3 Pro", cr: 70 },
    { value: "sora-2", label: "Sora 2", cr: 50 },
    { value: "veo-3", label: "Veo 3 Fast", cr: 65 },
    { value: "veo-3.1", label: "Veo 3.1", cr: 90 },
    { value: "seedance", label: "Seedance V1 Pro", cr: 36 },
    { value: "seedance-2", label: "Seedance 2.0", cr: 45 },
    { value: "wan-i2v", label: "Wan 2.2 Turbo", cr: 20 },
    { value: "hailuo-02-pro", label: "Hailuo 02 Pro", cr: 40 },
  ],
  wavespeed: [
    { value: "kling-2.1", label: "Kling V2.1", cr: 26 },
    { value: "seedance", label: "Seedance", cr: 30 },
    { value: "wan-i2v", label: "Wan i2v", cr: 18 },
  ],
  magnific: [{ value: "kling-motion", label: "Kling Motion", cr: 45 }],
  roboneo: [
    // Cost = perkiraan Cyber Carrots per job (Roboneo return cost final setelah render).
    // Semua opsi dibatasi di bawah 150 credit per screenshot user (Nov 2026).
    { value: "rn:seedance-2.0", label: "Seedance 2.0 (Roboneo)", cr: 143 },
    { value: "rn:seedance-2.0-mini", label: "Seedance 2.0 Mini (Roboneo)", cr: 140 },
    { value: "rn:seedance-2.0-fast", label: "Seedance 2.0 Fast (Roboneo)", cr: 90 },
    { value: "rn:happyhorse-1.1", label: "Happy Horse 1.1 (Roboneo)", cr: 144 },
    { value: "rn:happyhorse-1.0", label: "Happy Horse 1.0 (Roboneo)", cr: 120 },
    { value: "rn:kling-v3", label: "Kling 3.0 (Roboneo)", cr: 130 },
    { value: "rn:kling-v3-turbo", label: "Kling 3.0 Turbo (Roboneo)", cr: 90 },
    { value: "rn:seedance-1.0", label: "Seedance 1.0 / Pro (Roboneo)", cr: 100 },
    { value: "rn:google-omni", label: "Google Omni Flash (Roboneo)", cr: 45 },
    { value: "rn:kling-v26:std", label: "Kling 2.6 (Roboneo)", cr: 80 },
    // legacy alias tetap ada supaya preferensi lama tidak putus
    { value: "rn:seedance-pro", label: "Seedance Pro — legacy alias", cr: 100 },
  ],
  firefly: [
    { value: "ff:veo:3.1-fast-generate", label: "Veo 3.1 Fast (Firefly)", cr: 20 },
    { value: "ff:veo:3.1-generate", label: "Veo 3.1 (Firefly)", cr: 40 },
    { value: "ff:firefly:video-1", label: "Firefly Video Model 1", cr: 10 },
  ],
  framia: [
    // Model list from Framia video node (share recipe 8b83c48b70).
    // Gemini Omni Flash = default (paling stabil & murah).
    { value: "framia:gemini-omni-flash", label: "Gemini Omni Flash (Framia)", cr: 20 },
    { value: "framia:seedance-2.0", label: "Seedance 2.0 (Framia)", cr: 45 },
    { value: "framia:seedance-2.0-fast", label: "Seedance 2.0 Fast (Framia)", cr: 30 },
    { value: "framia:kling-3.0-omni", label: "Kling 3.0 Omni (Framia)", cr: 60 },
    { value: "framia:kling-3.0", label: "Kling 3.0 (Framia)", cr: 50 },
    { value: "framia:veo-3.1", label: "Veo 3.1 (Framia)", cr: 90 },
    { value: "framia:veo-3.1-fast", label: "Veo 3.1 Fast (Framia)", cr: 65 },
    { value: "framia:wan-2.7", label: "Wan 2.7 (Framia)", cr: 25 },
    { value: "framia:happyhorse-1.1", label: "HappyHorse 1.1 (Framia)", cr: 28 },
    { value: "framia:kling-avatar", label: "Kling Avatar (Framia)", cr: 40 },
  ],
  leonardo: [
    // Featured (tab Video di app.leonardo.ai)
    { value: "leo-vid:gemini-omni-flash", label: "Gemini Omni Flash (Leonardo · ~100 cr/s @ HD 720x1280)", cr: 500 },
    { value: "leo-vid:seedance-2.0-mini", label: "Seedance 2.0 Mini (Leonardo · ~74 cr/s @ Standard 496x864)", cr: 372 },
    { value: "leo-vid:grok-imagine-1.5", label: "Grok Imagine 1.5 (Leonardo · ~53 cr/s @ Standard 400x736)", cr: 263 },
    { value: "leo-vid:wan-2.6", label: "Wan 2.6 (Leonardo · ~35 cr/s @ HD 720x1280)", cr: 175 },
    { value: "leo-vid:veo-3.1-lite", label: "Veo 3.1 Lite (Leonardo · ~50 cr/s @ Quality 720x1280)", cr: 400 },
    { value: "leo-vid:veo-3.1-fast", label: "Veo 3.1 Fast (Leonardo · ~150 cr/s @ HD 720x1280)", cr: 1200 },
    // Other Models
    { value: "leo-vid:seedance-2.0", label: "Seedance 2.0 (Leonardo · ~141 cr/s @ Standard 496x864)", cr: 2109 },
    { value: "leo-vid:seedance-2.0-fast", label: "Seedance 2.0 Fast (Leonardo · ~113 cr/s @ Standard 496x864)", cr: 1687 },
    { value: "leo-vid:kling-o3-omni", label: "Kling Video O3 Omni (Leonardo · ~224 cr/s @ HD 720x1280)", cr: 3360 },
    { value: "leo-vid:kling-2.6", label: "Kling 2.6 (Leonardo · ~140 cr/s @ Full HD 1080x1920)", cr: 1400 },
  ],
};

// Baca provider aktif dari Routing Provider (manage/routing) — cap "video".
const LS_ROUTING = "aatools.routing.v2";
function readRoutedVideoProvider(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(LS_ROUTING);
    if (!raw) return null;
    const obj = JSON.parse(raw) as { video?: string };
    const p = obj?.video;
    return p && I2V_CATALOG[p] ? p : null;
  } catch {
    return null;
  }
}
const RATIOS = ["16:9", "9:16", "1:1", "4:5", "3:4"];

type QualityOpt = {
  value: string;
  label: string;
  mult: number;         // multiplier untuk cr (biaya) — dipakai kalau `cr` option tidak diset
  duration: number;     // detik
  resolution?: string;  // seedance-pro
  sound?: "on" | "off"; // kling-v26
  cr?: number;          // override eksplisit sesuai harga real provider (Framia)
  sizeTier?: string;    // leonardo: id tier resolusi yang benar-benar dikirim
  dims?: string;        // leonardo: "720x1280"
};
// Default (weavy/wavespeed/magnific): pilih durasi saja.
const DEFAULT_QUALITY: QualityOpt[] = [
  { value: "std",  label: "Standard 5s", mult: 1, duration: 5 },
  { value: "long", label: "Long 10s",    mult: 2, duration: 10 },
];
// Per-model roboneo (parameter valid ikut recipe/flow_share).
// Cap credit/durasi mengikuti screenshot user (semua ≤ 150 Cyber Carrots).
const ROBONEO_QUALITY: Record<string, QualityOpt[]> = {
  // Seedance 2.0 — max 10s @ 480p @ 9:16 dengan audio = 143 cr (screenshot).
  "rn:seedance-2.0": [
    { value: "480p-10s-audio", label: "480p · 10s · audio", mult: 1, duration: 10, resolution: "480p", sound: "on", cr: 143 },
    { value: "480p-10s",       label: "480p · 10s",         mult: 1, duration: 10, resolution: "480p", sound: "off", cr: 120 },
    { value: "480p-5s-audio",  label: "480p · 5s · audio",  mult: 1, duration: 5,  resolution: "480p", sound: "on", cr: 75 },
    { value: "480p-5s",        label: "480p · 5s",          mult: 1, duration: 5,  resolution: "480p", sound: "off", cr: 60 },
  ],
  // Seedance 2.0 Mini — max 12s @ 480p @ 9:16 dengan audio = 140 cr.
  "rn:seedance-2.0-mini": [
    { value: "480p-12s-audio", label: "480p · 12s · audio", mult: 1, duration: 12, resolution: "480p", sound: "on", cr: 140 },
    { value: "480p-10s-audio", label: "480p · 10s · audio", mult: 1, duration: 10, resolution: "480p", sound: "on", cr: 118 },
    { value: "480p-5s-audio",  label: "480p · 5s · audio",  mult: 1, duration: 5,  resolution: "480p", sound: "on", cr: 60 },
    { value: "480p-5s",        label: "480p · 5s",          mult: 1, duration: 5,  resolution: "480p", sound: "off", cr: 48 },
  ],
  // Seedance 2.0 Fast — versi hemat, cap ~90 cr utk 10s.
  "rn:seedance-2.0-fast": [
    { value: "480p-10s",       label: "480p · 10s",         mult: 1, duration: 10, resolution: "480p", sound: "off", cr: 90 },
    { value: "480p-5s",        label: "480p · 5s",          mult: 1, duration: 5,  resolution: "480p", sound: "off", cr: 45 },
    { value: "720p-5s",        label: "720p · 5s",          mult: 1, duration: 5,  resolution: "720p", sound: "off", cr: 65 },
  ],
  // Happy Horse 1.1 — max 14s @ 720p @ 9:16 = 144 cr (screenshot).
  "rn:happyhorse-1.1": [
    { value: "720p-14s", label: "720p · 14s", mult: 1, duration: 14, resolution: "720p", cr: 144 },
    { value: "720p-10s", label: "720p · 10s", mult: 1, duration: 10, resolution: "720p", cr: 100 },
    { value: "720p-5s",  label: "720p · 5s",  mult: 1, duration: 5,  resolution: "720p", cr: 50 },
    { value: "480p-14s", label: "480p · 14s", mult: 1, duration: 14, resolution: "480p", cr: 100 },
  ],
  "rn:happyhorse-1.0": [
    { value: "720p-10s", label: "720p · 10s", mult: 1, duration: 10, resolution: "720p", cr: 120 },
    { value: "720p-5s",  label: "720p · 5s",  mult: 1, duration: 5,  resolution: "720p", cr: 60 },
  ],
  // Kling 3.0 — cap konservatif < 150 cr.
  "rn:kling-v3": [
    { value: "10s-off", label: "10s · No Sound", mult: 1, duration: 10, sound: "off", cr: 130 },
    { value: "5s-off",  label: "5s · No Sound",  mult: 1, duration: 5,  sound: "off", cr: 65 },
    { value: "5s-on",   label: "5s · Sound",     mult: 1, duration: 5,  sound: "on",  cr: 85 },
  ],
  "rn:kling-v3-turbo": [
    { value: "10s-off", label: "10s · No Sound", mult: 1, duration: 10, sound: "off", cr: 90 },
    { value: "5s-off",  label: "5s · No Sound",  mult: 1, duration: 5,  sound: "off", cr: 45 },
  ],
  // Seedance 1.0 / Pro (recipe lama).
  "rn:seedance-1.0": [
    { value: "720p-5s",  label: "720p · 5s",  mult: 1, duration: 5,  resolution: "720p", cr: 50 },
    { value: "720p-10s", label: "720p · 10s", mult: 1, duration: 10, resolution: "720p", cr: 100 },
    { value: "720p-12s", label: "720p · 12s", mult: 1, duration: 12, resolution: "720p", cr: 120 },
    { value: "480p-5s",  label: "480p · 5s",  mult: 1, duration: 5,  resolution: "480p", cr: 35 },
  ],
  "rn:seedance-pro": [
    { value: "720p-5s",  label: "720p · 5s",  mult: 1, duration: 5,  resolution: "720p", cr: 50 },
    { value: "720p-10s", label: "720p · 10s", mult: 1, duration: 10, resolution: "720p", cr: 100 },
    { value: "720p-12s", label: "720p · 12s", mult: 1, duration: 12, resolution: "720p", cr: 120 },
    { value: "480p-5s",  label: "480p · 5s",  mult: 1, duration: 5,  resolution: "480p", cr: 35 },
  ],
  "rn:google-omni": [
    { value: "5s",  label: "Durasi 5s",  mult: 1, duration: 5,  cr: 25 },
    { value: "10s", label: "Durasi 10s", mult: 1, duration: 10, cr: 45 },
  ],
  "rn:kling-v26:std": [
    { value: "5s-off",  label: "5s · No Sound",  mult: 1, duration: 5,  sound: "off", cr: 40 },
    { value: "5s-on",   label: "5s · Sound",     mult: 1, duration: 5,  sound: "on",  cr: 55 },
    { value: "10s-off", label: "10s · No Sound", mult: 1, duration: 10, sound: "off", cr: 80 },
    { value: "10s-on",  label: "10s · Sound",    mult: 1, duration: 10, sound: "on",  cr: 105 },
  ],
};
// Harga Framia diambil dari UI framia.converge.ai (720p, aspect 9:16).
// Nilai `cr` di sini adalah biaya asli yang ditagih Framia — override
// perhitungan modelCr × mult supaya cocok dengan node Framia di lapangan.
const FRAMIA_QUALITY: Record<string, QualityOpt[]> = {
  "framia:gemini-omni-flash": [
    { value: "720p-10s", label: "720p · 10s", mult: 2, duration: 10, resolution: "720p", cr: 45 },
    { value: "720p-5s",  label: "720p · 5s",  mult: 1, duration: 5,  resolution: "720p", cr: 25 },
  ],
  "framia:seedance-2.0": [
    { value: "720p-5s",  label: "720p · 5s",  mult: 1, duration: 5,  resolution: "720p", cr: 25 },
    { value: "720p-10s", label: "720p · 10s", mult: 2, duration: 10, resolution: "720p", cr: 45 },
  ],
  "framia:seedance-2.0-fast": [
    { value: "720p-5s",  label: "720p · 5s",  mult: 1, duration: 5,  resolution: "720p", cr: 15 },
    { value: "720p-10s", label: "720p · 10s", mult: 2, duration: 10, resolution: "720p", cr: 25 },
  ],
  "framia:kling-3.0-omni": [
    { value: "5s",  label: "Durasi 5s",  mult: 1, duration: 5,  cr: 40 },
    { value: "10s", label: "Durasi 10s", mult: 2, duration: 10, cr: 80 },
  ],
  "framia:kling-3.0": [
    { value: "5s",  label: "Durasi 5s",  mult: 1, duration: 5,  cr: 30 },
    { value: "10s", label: "Durasi 10s", mult: 2, duration: 10, cr: 60 },
  ],
  "framia:veo-3.1": [
    { value: "5s",  label: "Durasi 5s",  mult: 1, duration: 5,  cr: 90 },
    { value: "10s", label: "Durasi 10s", mult: 2, duration: 10, cr: 180 },
  ],
  "framia:veo-3.1-fast": [
    { value: "5s",  label: "Durasi 5s",  mult: 1, duration: 5,  cr: 65 },
    { value: "10s", label: "Durasi 10s", mult: 2, duration: 10, cr: 130 },
  ],
  "framia:wan-2.7": [
    { value: "5s",  label: "Durasi 5s",  mult: 1, duration: 5,  cr: 20 },
    { value: "10s", label: "Durasi 10s", mult: 2, duration: 10, cr: 40 },
  ],
  "framia:happyhorse-1.1": [
    { value: "5s",  label: "Durasi 5s",  mult: 1, duration: 5,  cr: 28 },
    { value: "10s", label: "Durasi 10s", mult: 2, duration: 10, cr: 56 },
  ],
  "framia:kling-avatar": [
    { value: "5s",  label: "Durasi 5s",  mult: 1, duration: 5,  cr: 40 },
    { value: "10s", label: "Durasi 10s", mult: 2, duration: 10, cr: 80 },
  ],
};
// Leonardo video — opsi kualitas dibangkitkan langsung dari katalog resmi
// (tier resolusi x durasi) sehingga label, dimensi yang dikirim, dan biaya
// credits selalu konsisten dengan app.leonardo.ai.
function leonardoQualityOpts(model: string, aspect: string): QualityOpt[] {
  const a = (["1:1", "16:9", "9:16", "3:4", "4:3"] as const).includes(aspect as never)
    ? (aspect as "1:1" | "16:9" | "9:16" | "3:4" | "4:3")
    : "9:16";
  return leonardoVideoQualityOptions(model, a).map((o) => ({
    value: o.value,
    label: `${o.label} — ${o.cr.toLocaleString("id-ID")} cr`,
    mult: 1,
    duration: o.seconds,
    sizeTier: o.tierId,
    dims: `${o.width}x${o.height}`,
    sound: o.audio ? ("on" as const) : ("off" as const),
    cr: o.cr,
  }));
}
function qualityOptsFor(model: string, aspect: string): QualityOpt[] {
  if (model.startsWith("leo-vid:")) {
    const opts = leonardoQualityOpts(model, aspect);
    if (opts.length) return opts;
  }
  return FRAMIA_QUALITY[model] || ROBONEO_QUALITY[model] || DEFAULT_QUALITY;
}


type Template = { name: string; body: string };
const DEFAULT_TPL: Template[] = [
  { name: "Cinematic Slow Pan", body: "Cinematic slow camera pan, natural lighting, subtle wind on hair, subject stays centered" },
  { name: "Dolly Zoom", body: "Slow dolly zoom in, subject sharp, background bokeh, moody" },
];

function ImageToVideo() {
  const [img, setImg] = useSticky<string | null>("i2v.img", null);
  
  const [provider, setProvider] = useSticky<string>("i2v.provider", "weavy");
  const [model, setModel] = useSticky<string>("i2v.model", "");
  const [ratio, setRatio] = useSticky<string>("i2v.ratio", "9:16");
  const [quality, setQuality] = useSticky<string>("i2v.quality", "std");
  const [templates, setTemplates] = useState<Template[]>(DEFAULT_TPL);
  const [tplIdx, setTplIdx] = useSticky<number>("i2v.tplIdx", 0);
  const [prompt, setPrompt] = useSticky<string>("i2v.prompt", "");
  const [showTpl, setShowTpl] = useState(false);
  const [status, setStatus] = useSticky<{ show: boolean; text: string; pct: number; time: string }>("i2v.status", { show: false, text: "", pct: 0, time: "0:00" });
  const [logs, setLogs] = useSticky<string[]>("i2v.logs", []);
  const pushLog = (s: string) =>
    setLogs((prev) => [`[${new Date().toLocaleTimeString()}] ${s}`, ...prev].slice(0, 200));
  const imgInput = useRef<HTMLInputElement>(null);

  // Real token/credit dari Token / API Manager (live)
  const { tokens, credits } = useProviderCredit(provider);
  // Status generate nyata: idle → processing → sukses / gagal
  const [runState, setRunState] = useSticky<"idle" | "processing" | "sukses" | "gagal">("i2v.runState", "idle");

  const i2vBootstrapped = useRef(false);
  useEffect(() => {
    const routed = readRoutedVideoProvider();
    const p = routed || (typeof window !== "undefined" && localStorage.getItem("aatools.activeProvider")) || provider || "weavy";
    if (!i2vBootstrapped.current) {
      i2vBootstrapped.current = true;
      if (routed || !I2V_CATALOG[provider]) setProvider(p);
      const list = I2V_CATALOG[p] || I2V_CATALOG.weavy;
      if (!list.find((m) => m.value === model)) setModel(list[0]?.value || "");
      const tpl = localStorage.getItem("aatools.i2v.templates");
      if (tpl) try { setTemplates(JSON.parse(tpl)); } catch {}
    }

    // Consume handoff dari Creative Dashboard → prefill prompt + image
    const h = consumeHandoff();
    if (h && h.workflow === "image-to-video") {
      const seed = [h.title, h.hook, h.description].filter(Boolean).join(" — ");
      if (seed) setPrompt((prev) => (prev && prev.trim() ? prev : seed));
      if (h.thumbnail_data_url) {
        (async () => {
          try {
            const res = await fetch(h.thumbnail_data_url!);
            const blob = await res.blob();
            const file = new File([blob], "handoff-thumb.jpg", { type: blob.type || "image/jpeg" });
            setImg(h.thumbnail_data_url!);
            setImgFile(file);
          } catch {}
        })();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sinkron dengan Routing Provider (menu Kelola Routing)
  useEffect(() => {
    const sync = () => {
      const routed = readRoutedVideoProvider();
      if (routed && routed !== provider) {
        setProvider(routed);
        const list = I2V_CATALOG[routed] || [];
        if (!list.find((m) => m.value === model)) setModel(list[0]?.value || "");
      }
    };
    window.addEventListener("storage", sync);
    window.addEventListener("focus", sync);
    window.addEventListener("aatools:routing-changed", sync as EventListener);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener("focus", sync);
      window.removeEventListener("aatools:routing-changed", sync as EventListener);
    };
  }, [provider, model, setProvider, setModel]);


  const models = I2V_CATALOG[provider] || I2V_CATALOG.weavy;
  const modelCr = models.find((m) => m.value === model)?.cr ?? 0;
  const currentQualityOpts = qualityOptsFor(model, ratio);
  const activeQuality =
    currentQualityOpts.find((q) => q.value === quality) || currentQualityOpts[0];
  const qMult = activeQuality?.mult ?? 1;
  const totalCost = activeQuality?.cr ?? Math.round(modelCr * qMult);


  const [imgFile, setImgFile] = useSticky<File | null>("i2v.imgFile", null);
  const [imgAspect, setImgAspect] = useState<number | null>(null);
  const [results, setResults] = useSticky<string[]>("i2v.results", []);


  const onFile = (files: FileList | null) => {
    const f = files?.[0];
    if (f) {
      const url = URL.createObjectURL(f);
      setImg(url);
      setImgFile(f);
      setImgAspect(null);
      const probe = new Image();
      probe.onload = () => {
        if (probe.naturalWidth && probe.naturalHeight) {
          setImgAspect(probe.naturalWidth / probe.naturalHeight);
        }
      };
      probe.src = url;
    }
  };

  const generate = async () => {
    if (!imgFile || !prompt.trim()) return;
    logGenerate("image_to_video", { provider, modelKey: model, status: "started" });
    try {
      const { trackGeneration } = await import("@/lib/dashboard/projects");
      trackGeneration({ kind: "image-to-video", title: prompt.slice(0, 60) || "Image → Video", counts: { videos: 1 } });
    } catch { /* ignore */ }
    const start = Date.now();
    setRunState("processing");
    setStatus({ show: true, text: "Memulai...", pct: 5, time: "0:00" });
    pushLog(`🚀 Mulai generate video · ${provider} · ${model} · ${ratio} · ${activeQuality?.duration ?? 5}s`);
    const tick = setInterval(() => {
      const el = Math.floor((Date.now() - start) / 1000);
      setStatus((s) => ({ ...s, time: `${Math.floor(el / 60)}:${String(el % 60).padStart(2, "0")}` }));
    }, 1000);
    try {
      const { generateI2V } = await import("@/lib/providers/generate-i2v");
      const url = await generateI2V({
        provider: provider as "weavy" | "wavespeed" | "magnific" | "roboneo" | "framia" | "leonardo" | "firefly",
        modelKey: model,
        imageFile: imgFile,
        ratio,
        duration: activeQuality?.duration ?? 5,
        resolution: activeQuality?.resolution,
        sizeTier: activeQuality?.sizeTier,
        sound: activeQuality?.sound,
        prompt,
        onProgress: (msg, pct) => {
          setStatus((s) => ({ ...s, text: msg, pct: pct ?? s.pct }));
          pushLog(`⏳ ${msg}${pct != null ? ` (${pct}%)` : ""}`);
        },
      });

      setResults((r) => [url, ...r]);
      setRunState("sukses");
      setStatus((s) => ({ ...s, pct: 100, text: "✅ Selesai" }));
      pushLog(`✅ Video selesai · ${url.slice(0, 60)}${url.length > 60 ? "…" : ""}`);
      logGenerate("image_to_video", { provider, modelKey: model, status: "success" });
    } catch (e) {
      const msg = (e as Error).message || String(e);
      setRunState("gagal");
      setStatus((s) => ({ ...s, pct: 100, text: "❌ " + msg }));
      pushLog(`❌ ${msg}`);
      logGenerate("image_to_video", { provider, modelKey: model, status: "error", error: msg });
    } finally {
      clearInterval(tick);
    }
  };

  const applyTpl = (i: number) => {
    setTplIdx(i);
    setPrompt(templates[i]?.body || "");
  };
  const saveTemplate = (n: string, b: string) => {
    const next = [...templates, { name: n, body: b }];
    setTemplates(next);
    localStorage.setItem("aatools.i2v.templates", JSON.stringify(next));
    setTplIdx(next.length - 1);
    setPrompt(b);
  };
  const deleteTpl = () => {
    if (templates.length <= 1) return;
    const next = templates.filter((_, i) => i !== tplIdx);
    setTemplates(next);
    setTplIdx(0);
    localStorage.setItem("aatools.i2v.templates", JSON.stringify(next));
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
      <PageHero eyebrow="Generate" title="Image To" highlight="Video" desc="1 gambar → pilih model, aspek rasio, kualitas, prompt → generate video." />




      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <Card title="🖼️ Gambar Input" sub="1 file (JPG / PNG / WEBP)">
          <input ref={imgInput} type="file" accept="image/*" hidden onChange={(e) => onFile(e.target.files)} />
          {!img ? (
            <button onClick={() => imgInput.current?.click()} className="w-full aspect-[9/16] rounded-2xl border border-dashed border-border/80 bg-card/30 grid place-items-center hover:border-primary/60 transition text-center px-4">
              <div>
                <div className="text-3xl">🖼️</div>
                <div className="text-sm mt-1">Tap atau tarik <b>gambar</b> (1 file)</div>
                <div className="text-[11px] text-muted-foreground">JPG / PNG / WEBP</div>
              </div>
            </button>
          ) : (
            <div
              className="relative rounded-2xl overflow-hidden border border-border bg-black/30 mx-auto max-w-full"
              style={{ aspectRatio: imgAspect ?? 9 / 16 }}
            >
              <img
                src={img}
                alt=""
                className="w-full h-full object-contain"
                onLoad={(e) => {
                  const t = e.currentTarget;
                  if (t.naturalWidth && t.naturalHeight) {
                    setImgAspect(t.naturalWidth / t.naturalHeight);
                  }
                }}
              />
              <button onClick={() => imgInput.current?.click()} className="absolute top-2 right-2 rounded-full px-2 md:px-2.5 py-1 text-xs bg-black/60 text-white flex items-center gap-1">
                <RefreshCw className="h-3 w-3" /> <span className="hidden md:inline">Ganti</span>
              </button>
            </div>
          )}
        </Card>

        <div className="lg:col-span-2">
          <Card title="⚙️ Pengaturan">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center gap-2 flex-wrap min-h-[20px]">
                  <label className="text-[11px] font-mono uppercase tracking-[0.18em] text-muted-foreground">Model AI</label>
                  <ProviderActivePill cap="video" />
                </div>
                <Select value={model} onChange={(e) => setModel(e.target.value)} options={models.map((m) => ({ value: m.value, label: `${m.label} — ${m.cr} cr` }))} />
              </div>
              <Field label="Aspek Rasio">
                <Select value={ratio} onChange={(e) => setRatio(e.target.value)} options={RATIOS.map((r) => ({ value: r, label: r }))} />
              </Field>
              <Field label="Kualitas">
                <Select value={activeQuality?.value || ""} onChange={(e) => setQuality(e.target.value)} options={currentQualityOpts.map((q) => ({ value: q.value, label: q.label }))} />
              </Field>
              <Field label="Template Prompt">
                <div className="flex gap-2">
                  <Select value={String(tplIdx)} onChange={(e) => applyTpl(Number(e.target.value))} options={templates.map((t, i) => ({ value: String(i), label: t.name }))} className="flex-1" />
                  <GhostButton onClick={() => setShowTpl(true)}><Plus className="h-3.5 w-3.5" /> Template</GhostButton>
                  <GhostButton onClick={deleteTpl} className="text-destructive hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /> Hapus</GhostButton>
                </div>
              </Field>
            </div>
            <div className="mt-4">
              <Field label="Prompt">
                <Textarea rows={4} placeholder="Deskripsikan motion / kamera / suasana video..." value={prompt} onChange={(e) => setPrompt(e.target.value)} />
              </Field>
            </div>
            <div className="flex items-center gap-3 mt-4 flex-wrap">
              <PrimaryButton onClick={generate} disabled={!img || !prompt.trim()}>
                <Rocket className="h-4 w-4" /> Generate Video
              </PrimaryButton>
              <div className="text-xs text-muted-foreground">Cost: <b className="text-foreground font-mono">{totalCost}</b> credits</div>
              <div className="text-xs text-muted-foreground">
                Token: <b className="text-fuchsia-300">{tokens}</b>
                {" · "}Sisa credit: <b className="text-emerald-400">{credits == null ? "—" : credits.toLocaleString()}</b>
                {" · "}Status: <b className={statusTone}>{runState}</b>
              </div>

            </div>
            {status.show && (
              <div className="mt-4 rounded-xl border border-border/70 bg-card/40 p-3">
                <div className="flex justify-between items-center text-xs mb-1">
                  <span>{status.text}</span>
                  <span className="font-mono text-muted-foreground">{status.time}</span>
                </div>
                <div className="h-1 rounded-full bg-border overflow-hidden">
                  <div className="h-full transition-all" style={{ width: `${status.pct}%`, background: "var(--gradient-neon)" }} />
                </div>
              </div>
            )}
            {logs.length > 0 && (
              <div className="mt-3 rounded-xl border border-border/70 bg-black/40 p-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-muted-foreground">Log Proses</div>
                  <button onClick={() => setLogs([])} className="text-[10px] text-muted-foreground hover:text-destructive">Clear</button>
                </div>
                <div className="max-h-40 overflow-y-auto overflow-x-hidden font-mono text-[10px] leading-relaxed text-muted-foreground min-w-0">
                  {logs.map((l, i) => (
                    <div key={i} className="whitespace-pre-wrap break-all min-w-0">{l}</div>
                  ))}
                </div>
              </div>
            )}
          </Card>
        </div>
      </div>

      <Card
        title="🎬 Hasil Image To Video"
        sub={`(${results.length})`}
        right={
          <GhostButton className="text-destructive hover:text-destructive" onClick={() => setResults([])} title="Clear">
            <Trash2 className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Clear</span>
          </GhostButton>

        }
      >
        {results.length === 0 ? (
          <GalleryEmpty />
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
            {results.map((u, i) => (
              <div key={i} className="rounded-xl overflow-hidden border border-border bg-black/40">
                <a href={u} target="_blank" rel="noreferrer" className="block">
                  <video src={u} controls preload="metadata" playsInline crossOrigin="anonymous" className="w-full aspect-[9/16] object-cover" />
                </a>
                <div className="p-2 flex justify-between">
                  <a href={u} target="_blank" rel="noreferrer" className="text-[11px] text-primary hover:underline">▶ Open</a>
                  <a href={u} download className="text-[11px] text-primary hover:underline">Download</a>
                  <button onClick={() => setResults((r) => r.filter((_, idx) => idx !== i))} className="text-[11px] text-destructive hover:underline">Hapus</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {showTpl && <TemplateModal onClose={() => setShowTpl(false)} onSave={saveTemplate} />}
    </DashboardShell>
  );
}

function TemplateModal({ onClose, onSave }: { onClose: () => void; onSave: (n: string, b: string) => void }) {
  const [name, setName] = useState("");
  const [body, setBody] = useState("");
  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-black/70 backdrop-blur-sm p-4">
      <div className="neumorph w-full max-w-lg p-5 relative">
        <button onClick={onClose} className="absolute top-3 right-3 inline-flex items-center gap-1 rounded-full border border-border bg-card/60 px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground">
          <X className="h-3.5 w-3.5" /> Tutup
        </button>
        <div className="font-display text-lg mb-3">+ Tambah Template Prompt</div>
        <Field label="Nama Template"><Input placeholder="Mis. Cinematic slow pan" value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <div className="h-3" />
        <Field label="Isi Prompt"><Textarea rows={5} placeholder="Cinematic slow camera pan, natural lighting..." value={body} onChange={(e) => setBody(e.target.value)} /></Field>
        <div className="flex gap-2 justify-end mt-4">
          <GhostButton onClick={onClose}>Batal</GhostButton>
          <PrimaryButton onClick={() => { if (name && body) { onSave(name, body); onClose(); } }} disabled={!name || !body}>💾 Simpan</PrimaryButton>
        </div>
      </div>
    </div>
  );
}
