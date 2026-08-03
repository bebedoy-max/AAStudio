import { createFileRoute } from "@tanstack/react-router";
import { useFilePicker, toFileList } from "@/components/cloud/file-picker";
import { useEffect, useRef, useState } from "react";
import { Rocket, Trash2, Plus, RefreshCw, X } from "lucide-react";
import { logGenerate } from "@/lib/activity/log";
import { DashboardShell, PageHero } from "@/components/dashboard/shell";
import {
  Field,
  Select,
  Textarea,
  Input,
  Card,
  PrimaryButton,
  GhostButton,
  GalleryEmpty,
} from "@/components/dashboard/ui";
import { useSticky } from "@/lib/stores/use-sticky";
import { consumeHandoff } from "@/lib/creative/handoff";
import { ProviderActivePill } from "@/components/routing/quick-routing-dialog";
import { useProviderCredit } from "@/lib/providers/credit-summary";
import { useCloudGallery } from "@/lib/cloud/gallery";

export const Route = createFileRoute("/generate/image-to-video")({
  head: () => ({
    meta: [
      { title: "Image To Video — AA Creative Studio" },
      {
        name: "description",
        content: "1 gambar → pilih model, aspek rasio, kualitas, prompt → generate video.",
      },
    ],
  }),
  component: ImageToVideo,
});

import {
  I2V_CATALOG,
  RATIOS,
  qualityOptsFor,
  readRoutedVideoProvider,
} from "@/lib/providers/video-catalog";

type Template = { name: string; body: string };
const DEFAULT_TPL: Template[] = [
  {
    name: "Cinematic Slow Pan",
    body: "Cinematic slow camera pan, natural lighting, subtle wind on hair, subject stays centered",
  },
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
  const [status, setStatus] = useSticky<{ show: boolean; text: string; pct: number; time: string }>(
    "i2v.status",
    { show: false, text: "", pct: 0, time: "0:00" },
  );
  const [logs, setLogs] = useSticky<string[]>("i2v.logs", []);
  const pushLog = (s: string) =>
    setLogs((prev) => [`[${new Date().toLocaleTimeString()}] ${s}`, ...prev].slice(0, 200));
  const imgInput = useRef<HTMLInputElement>(null);
  const picker = useFilePicker();
  const pickImage = () =>
    void picker
      .pick({ accept: "image/*", source: "image-to-video", title: "Pilih gambar input" })
      .then((fs) => {
        if (fs.length) onFile(toFileList(fs));
      });

  // Real token/credit dari Token / API Manager (live)
  const { tokens, credits } = useProviderCredit(provider);
  // Status generate nyata: idle → processing → sukses / gagal
  const [runState, setRunState] = useSticky<"idle" | "processing" | "sukses" | "gagal">(
    "i2v.runState",
    "idle",
  );

  const i2vBootstrapped = useRef(false);
  useEffect(() => {
    const routed = readRoutedVideoProvider();
    const p =
      routed ||
      (typeof window !== "undefined" && localStorage.getItem("aatools.activeProvider")) ||
      provider ||
      "weavy";
    if (!i2vBootstrapped.current) {
      i2vBootstrapped.current = true;
      if (routed || !I2V_CATALOG[provider]) setProvider(p);
      const list = I2V_CATALOG[p] || I2V_CATALOG.weavy;
      if (!list.find((m) => m.value === model)) setModel(list[0]?.value || "");
      const tpl = localStorage.getItem("aatools.i2v.templates");
      if (tpl)
        try {
          setTemplates(JSON.parse(tpl));
        } catch {}
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
  // Galeri hasil tersimpan di cloud (Google Drive) — konsisten di semua perangkat.
  const gallery = useCloudGallery<{ prompt?: string }>("image-to-video", "video");
  const results = gallery.items;

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
      trackGeneration({
        kind: "image-to-video",
        title: prompt.slice(0, 60) || "Image → Video",
        counts: { videos: 1 },
      });
    } catch {
      /* ignore */
    }
    const start = Date.now();
    setRunState("processing");
    setStatus({ show: true, text: "Memulai...", pct: 5, time: "0:00" });
    pushLog(
      `🚀 Mulai generate video · ${provider} · ${model} · ${ratio} · ${activeQuality?.duration ?? 5}s`,
    );
    const tick = setInterval(() => {
      const el = Math.floor((Date.now() - start) / 1000);
      setStatus((s) => ({
        ...s,
        time: `${Math.floor(el / 60)}:${String(el % 60).padStart(2, "0")}`,
      }));
    }, 1000);
    try {
      const { generateI2V } = await import("@/lib/providers/generate-i2v");
      const url = await generateI2V({
        provider: provider as
          | "weavy"
          | "wavespeed"
          | "magnific"
          | "roboneo"
          | "framia"
          | "leonardo"
          | "firefly"
          | "dola",
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

      void gallery.add(url, { prompt: prompt.trim() });
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
      <PageHero
        eyebrow="Generate"
        title="Image To"
        highlight="Video"
        desc="1 gambar → pilih model, aspek rasio, kualitas, prompt → generate video."
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <Card title="🖼️ Gambar Input" sub="1 file (JPG / PNG / WEBP)">
          <input
            ref={imgInput}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => onFile(e.target.files)}
          />
          {picker.element}
          {!img ? (
            <button
              onClick={pickImage}
              className="w-full aspect-[9/16] rounded-2xl border border-dashed border-border/80 bg-card/30 grid place-items-center hover:border-primary/60 transition text-center px-4"
            >
              <div>
                <div className="text-3xl">🖼️</div>
                <div className="text-sm mt-1">
                  Tap atau tarik <b>gambar</b> (1 file)
                </div>
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
              <button
                onClick={pickImage}
                className="absolute top-2 right-2 rounded-full px-2 md:px-2.5 py-1 text-xs bg-black/60 text-white flex items-center gap-1"
              >
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
                  <label className="text-[11px] font-mono uppercase tracking-[0.18em] text-muted-foreground">
                    Model AI
                  </label>
                  <ProviderActivePill cap="video" />
                </div>
                <Select
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  options={models.map((m) => ({
                    value: m.value,
                    label: `${m.label} — ${m.cr} cr`,
                  }))}
                />
              </div>
              <Field label="Aspek Rasio">
                <Select
                  value={ratio}
                  onChange={(e) => setRatio(e.target.value)}
                  options={RATIOS.map((r) => ({ value: r, label: r }))}
                />
              </Field>
              <Field label="Kualitas">
                <Select
                  value={activeQuality?.value || ""}
                  onChange={(e) => setQuality(e.target.value)}
                  options={currentQualityOpts.map((q) => ({ value: q.value, label: q.label }))}
                />
              </Field>
              <Field label="Template Prompt">
                <div className="flex gap-2">
                  <Select
                    value={String(tplIdx)}
                    onChange={(e) => applyTpl(Number(e.target.value))}
                    options={templates.map((t, i) => ({ value: String(i), label: t.name }))}
                    className="flex-1"
                  />
                  <GhostButton onClick={() => setShowTpl(true)}>
                    <Plus className="h-3.5 w-3.5" /> Template
                  </GhostButton>
                  <GhostButton
                    onClick={deleteTpl}
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Hapus
                  </GhostButton>
                </div>
              </Field>
            </div>
            <div className="mt-4">
              <Field label="Prompt">
                <Textarea
                  rows={4}
                  placeholder="Deskripsikan motion / kamera / suasana video..."
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                />
              </Field>
            </div>
            <div className="flex items-center gap-3 mt-4 flex-wrap">
              <PrimaryButton onClick={generate} disabled={!img || !prompt.trim()}>
                <Rocket className="h-4 w-4" /> Generate Video
              </PrimaryButton>
              <div className="text-xs text-muted-foreground">
                Cost: <b className="text-foreground font-mono">{totalCost}</b> credits
              </div>
              <div className="text-xs text-muted-foreground">
                Token: <b className="text-fuchsia-300">{tokens}</b>
                {" · "}Sisa credit:{" "}
                <b className="text-emerald-400">
                  {credits == null ? "—" : credits.toLocaleString()}
                </b>
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
                  <div
                    className="h-full transition-all"
                    style={{ width: `${status.pct}%`, background: "var(--gradient-neon)" }}
                  />
                </div>
              </div>
            )}
            {logs.length > 0 && (
              <div className="mt-3 rounded-xl border border-border/70 bg-black/40 p-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-muted-foreground">
                    Log Proses
                  </div>
                  <button
                    onClick={() => setLogs([])}
                    className="text-[10px] text-muted-foreground hover:text-destructive"
                  >
                    Clear
                  </button>
                </div>
                <div className="max-h-40 overflow-y-auto overflow-x-hidden font-mono text-[10px] leading-relaxed text-muted-foreground min-w-0">
                  {logs.map((l, i) => (
                    <div key={i} className="whitespace-pre-wrap break-all min-w-0">
                      {l}
                    </div>
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
          <GhostButton
            className="text-destructive hover:text-destructive"
            onClick={() => void gallery.removeAll()}
            title="Clear"
          >
            <Trash2 className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Clear</span>
          </GhostButton>
        }
      >
        {results.length === 0 ? (
          <GalleryEmpty />
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
            {results.map((item) => (
              <div
                key={item.id}
                className="rounded-xl overflow-hidden border border-border bg-black/40"
              >
                <a href={item.url} target="_blank" rel="noreferrer" className="block">
                  <video
                    src={item.url}
                    controls
                    preload="metadata"
                    playsInline
                    crossOrigin="anonymous"
                    className="w-full aspect-[9/16] object-cover"
                  />
                </a>
                <div className="p-2 flex justify-between">
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[11px] text-primary hover:underline"
                  >
                    ▶ Open
                  </a>
                  <a href={item.url} download className="text-[11px] text-primary hover:underline">
                    Download
                  </a>
                  <button
                    onClick={() => void gallery.remove(item.id)}
                    className="text-[11px] text-destructive hover:underline"
                  >
                    Hapus
                  </button>
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

function TemplateModal({
  onClose,
  onSave,
}: {
  onClose: () => void;
  onSave: (n: string, b: string) => void;
}) {
  const [name, setName] = useState("");
  const [body, setBody] = useState("");
  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-black/70 backdrop-blur-sm p-4">
      <div className="neumorph w-full max-w-lg p-5 relative">
        <button
          onClick={onClose}
          className="absolute top-3 right-3 inline-flex items-center gap-1 rounded-full border border-border bg-card/60 px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" /> Tutup
        </button>
        <div className="font-display text-lg mb-3">+ Tambah Template Prompt</div>
        <Field label="Nama Template">
          <Input
            placeholder="Mis. Cinematic slow pan"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <div className="h-3" />
        <Field label="Isi Prompt">
          <Textarea
            rows={5}
            placeholder="Cinematic slow camera pan, natural lighting..."
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
        </Field>
        <div className="flex gap-2 justify-end mt-4">
          <GhostButton onClick={onClose}>Batal</GhostButton>
          <PrimaryButton
            onClick={() => {
              if (name && body) {
                onSave(name, body);
                onClose();
              }
            }}
            disabled={!name || !body}
          >
            💾 Simpan
          </PrimaryButton>
        </div>
      </div>
    </div>
  );
}
