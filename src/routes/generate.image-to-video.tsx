import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Rocket, Trash2, Plus, RefreshCw, X } from "lucide-react";
import { logGenerate } from "@/lib/activity/log";
import { DashboardShell, PageHero } from "@/components/dashboard/shell";
import { Field, Select, Textarea, Input, Card, PrimaryButton, GhostButton, GalleryEmpty } from "@/components/dashboard/ui";
import { useSticky } from "@/lib/stores/use-sticky";
import { consumeHandoff } from "@/lib/creative/handoff";


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
    { value: "rn:seedance-pro", label: "Seedance Pro (Roboneo)", cr: 0 },
    { value: "rn:google-omni", label: "Google Omni (Roboneo)", cr: 0 },
    { value: "rn:kling-v26:std", label: "Kling 2.6 (Roboneo)", cr: 0 },
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
  mult: number;         // multiplier untuk cr (biaya)
  duration: number;     // detik
  resolution?: string;  // seedance-pro
  sound?: "on" | "off"; // kling-v26
};
// Default (weavy/wavespeed/magnific): pilih durasi saja.
const DEFAULT_QUALITY: QualityOpt[] = [
  { value: "std",  label: "Standard 5s", mult: 1, duration: 5 },
  { value: "long", label: "Long 10s",    mult: 2, duration: 10 },
];
// Per-model roboneo (parameter valid ikut recipe flow_share).
const ROBONEO_QUALITY: Record<string, QualityOpt[]> = {
  "rn:seedance-pro": [
    { value: "720p-5s",  label: "720p · 5s",  mult: 1,   duration: 5,  resolution: "720p" },
    { value: "720p-10s", label: "720p · 10s", mult: 2,   duration: 10, resolution: "720p" },
    { value: "720p-12s", label: "720p · 12s", mult: 2.4, duration: 12, resolution: "720p" },
    { value: "480p-5s",  label: "480p · 5s",  mult: 0.7, duration: 5,  resolution: "480p" },
    { value: "1080p-5s", label: "1080p · 5s", mult: 1.5, duration: 5,  resolution: "1080p" },
  ],
  "rn:google-omni": [
    { value: "5s",  label: "Durasi 5s",  mult: 1, duration: 5 },
    { value: "10s", label: "Durasi 10s", mult: 2, duration: 10 },
  ],
  "rn:kling-v26:std": [
    { value: "5s-off",  label: "5s · No Sound",  mult: 1,   duration: 5,  sound: "off" },
    { value: "5s-on",   label: "5s · Sound",     mult: 1.3, duration: 5,  sound: "on"  },
    { value: "10s-off", label: "10s · No Sound", mult: 2,   duration: 10, sound: "off" },
    { value: "10s-on",  label: "10s · Sound",    mult: 2.6, duration: 10, sound: "on"  },
  ],
};
function qualityOptsFor(model: string): QualityOpt[] {
  return ROBONEO_QUALITY[model] || DEFAULT_QUALITY;
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
  const imgInput = useRef<HTMLInputElement>(null);

  // provider info counters
  const [tokens, setTokens] = useState(0);
  const [credits, setCredits] = useState(0);

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
    try {
      if (p === "weavy") {
        const arr = JSON.parse(localStorage.getItem("aatools.weavy.tokens") || "[]");
        setTokens(arr.length);
        setCredits(arr.reduce((a: number, t: { credits?: number }) => a + (t.credits || 0), 0));
      } else {
        const arr = JSON.parse(localStorage.getItem(`aatools.${p}.keys`) || "[]");
        setTokens(arr.length);
        setCredits(0);
      }
    } catch {}
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
  const currentQualityOpts = qualityOptsFor(model);
  const activeQuality =
    currentQualityOpts.find((q) => q.value === quality) || currentQualityOpts[0];
  const qMult = activeQuality?.mult ?? 1;
  const totalCost = Math.round(modelCr * qMult);


  const [imgFile, setImgFile] = useSticky<File | null>("i2v.imgFile", null);
  const [results, setResults] = useSticky<string[]>("i2v.results", []);


  const onFile = (files: FileList | null) => {
    const f = files?.[0];
    if (f) {
      setImg(URL.createObjectURL(f));
      setImgFile(f);
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
    setStatus({ show: true, text: "Memulai...", pct: 5, time: "0:00" });
    const tick = setInterval(() => {
      const el = Math.floor((Date.now() - start) / 1000);
      setStatus((s) => ({ ...s, time: `${Math.floor(el / 60)}:${String(el % 60).padStart(2, "0")}` }));
    }, 1000);
    try {
      const { generateI2V } = await import("@/lib/providers/generate-i2v");
      const url = await generateI2V({
        provider: provider as "weavy" | "wavespeed" | "magnific" | "roboneo",
        modelKey: model,
        imageFile: imgFile,
        ratio,
        duration: activeQuality?.duration ?? 5,
        resolution: activeQuality?.resolution,
        sound: activeQuality?.sound,
        prompt,
        onProgress: (msg, pct) => setStatus((s) => ({ ...s, text: msg, pct: pct ?? s.pct })),
      });

      setResults((r) => [url, ...r]);
      setStatus((s) => ({ ...s, pct: 100, text: "✅ Selesai" }));
      logGenerate("image_to_video", { provider, modelKey: model, status: "success" });
    } catch (e) {
      const msg = (e as Error).message || String(e);
      setStatus((s) => ({ ...s, pct: 100, text: "❌ " + msg }));
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

  const infoStatus = useMemo(() => (status.show ? "processing" : "idle"), [status.show]);

  return (
    <DashboardShell>
      <PageHero eyebrow="Generate" title="Image To" highlight="Video" desc="1 gambar → pilih model, aspek rasio, kualitas, prompt → generate video." />

      <Card title="📡 Info Provider">
        <div className="flex flex-wrap gap-x-6 gap-y-2 text-xs">
          <div>Provider aktif: <b className="text-primary">{provider}</b></div>
          <div>API Key/Token: <b className="text-fuchsia-300">{tokens}</b> tersedia</div>
          <div>Sisa credit: <b className="text-emerald-400">{credits}</b></div>
          <div>Status: <b className={infoStatus === "idle" ? "text-muted-foreground" : "text-amber-300"}>{infoStatus}</b></div>
        </div>
      </Card>

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
            <div className="relative aspect-[9/16] rounded-2xl overflow-hidden border border-border">
              <img src={img} alt="" className="w-full h-full object-cover" />
              <button onClick={() => imgInput.current?.click()} className="absolute top-2 right-2 rounded-full px-2 md:px-2.5 py-1 text-xs bg-black/60 text-white flex items-center gap-1">
                <RefreshCw className="h-3 w-3" /> <span className="hidden md:inline">Ganti</span>
              </button>
            </div>
          )}
        </Card>

        <div className="lg:col-span-2">
          <Card title="⚙️ Pengaturan">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Field label="Model AI">
                <Select value={model} onChange={(e) => setModel(e.target.value)} options={models.map((m) => ({ value: m.value, label: `${m.label} — ${m.cr} cr` }))} />
              </Field>
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
