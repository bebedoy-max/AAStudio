import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Rocket, Trash2, Plus, RefreshCw, X, Square } from "lucide-react";
import { logGenerate } from "@/lib/activity/log";
import { DashboardShell, PageHero } from "@/components/dashboard/shell";
import { Field, Select, Textarea, Input, Card, PrimaryButton, GhostButton, GalleryEmpty } from "@/components/dashboard/ui";
import { useSticky } from "@/lib/stores/use-sticky";
import { consumeHandoff } from "@/lib/creative/handoff";


export const Route = createFileRoute("/generate/bulk-fashion")({
  head: () => ({
    meta: [
      { title: "Bulk Fashion Generator — AA Creative Studio" },
      { name: "description", content: "1 karakter + banyak outfit → generate parallel → download ZIP." },
    ],
  }),
  component: BulkFashion,
});

const PRODUCT_TYPES = ["Atasan", "Blouse", "Cardigan", "Kemeja", "Jaket", "Croptop"];
const RATIOS = ["1:1", "4:5", "3:4", "9:16", "16:9"];

type QualityOpt = { v: string; label: string; cr: number; default?: boolean };
type ModelOpt = { key: string; label: string; qualities: QualityOpt[] };
const MODEL_CATALOG: Record<string, ModelOpt[]> = {
  weavy: [
    { key: "nanobanana2", label: "Gemini Nano Banana 2 (Weavy)", qualities: [
      { v: "0.5K", label: "0.5K (4.5 cr)", cr: 4.5 },
      { v: "1K", label: "1K (6 cr)", cr: 6, default: true },
      { v: "2K", label: "2K (9 cr)", cr: 9 },
      { v: "4K", label: "4K (12 cr)", cr: 12 },
    ] },
    { key: "gptimage2", label: "Image GPT 2 (Weavy)", qualities: [
      { v: "low", label: "Low (~15 cr)", cr: 15 },
      { v: "medium", label: "Medium (~36 cr)", cr: 36, default: true },
      { v: "high", label: "High (~60 cr)", cr: 60 },
    ] },
  ],
  wavespeed: [
    { key: "ws:google/nano-banana-2/edit", label: "Nano Banana 2 Edit", qualities: [
      { v: "1K", label: "1K (7 cr)", cr: 7, default: true },
      { v: "2K", label: "2K (7 cr)", cr: 7 },
    ] },
    { key: "ws:google/nano-banana-2/edit-fast", label: "Nano Banana 2 Fast", qualities: [
      { v: "default", label: "Standard (4.5 cr)", cr: 4.5, default: true },
    ] },
    { key: "ws:google/nano-banana-pro/edit", label: "Nano Banana Pro", qualities: [
      { v: "default", label: "Standard (14 cr)", cr: 14, default: true },
    ] },
    { key: "ws:google/nano-banana-pro/edit-ultra", label: "Nano Banana Pro Ultra", qualities: [
      { v: "default", label: "Ultra (24 cr)", cr: 24, default: true },
    ] },
    { key: "ws:openai/gpt-image-2/edit", label: "GPT-Image-2 Edit", qualities: [
      { v: "low", label: "Low (6 cr)", cr: 6 },
      { v: "medium", label: "Medium (6 cr)", cr: 6, default: true },
      { v: "high", label: "High (6 cr)", cr: 6 },
    ] },
    { key: "ws:bytedance/seedream-v4/edit", label: "Seedream V4 Edit", qualities: [
      { v: "default", label: "Standard (2.7 cr)", cr: 2.7, default: true },
    ] },
    { key: "ws:alibaba/wan-2.7/image-edit", label: "Wan 2.7 Edit", qualities: [
      { v: "default", label: "Standard (3 cr)", cr: 3, default: true },
    ] },
    { key: "ws:kwaivgi/kling-image-v3/edit", label: "Kling Image V3 Edit", qualities: [
      { v: "default", label: "Standard (2.8 cr)", cr: 2.8, default: true },
    ] },
  ],
  magnific: [
    { key: "magnific-fashion", label: "Magnific Fashion", qualities: [
      { v: "default", label: "Standard (12 cr)", cr: 12, default: true },
    ] },
  ],
};

type Template = { name: string; body: string };
const DEFAULT_TPL: Template[] = [
  { name: "Hanya Outfit", body: "Hanya outfit saja, untuk frame, pose dan background tetap sama" },
  { name: "Style Wanita Berhijab", body: "Hanya outfit saja dan sesuaikan untuk style wanita berhijab, untuk frame, pose dan background tetap sama" },
  { name: "Detail Atasan", body: "Hanya atasan saja ikuti detail, ukuran, kerah leher, kerah tangan, kancing baju atasan image reference 2. Untuk frame, pose dan background tetap sama" },
];

function ratioToAspectClass(r: string): string {
  switch (r) {
    case "9:16": return "aspect-[9/16]";
    case "16:9": return "aspect-[16/9]";
    case "4:5": return "aspect-[4/5]";
    case "3:4": return "aspect-[3/4]";
    case "1:1": return "aspect-square";
    default: return "aspect-[3/4]";
  }
}

function BulkFashion() {
  const [char, setChar] = useSticky<string | null>("bf.char", null);
  const [charFile, setCharFile] = useSticky<File | null>("bf.charFile", null);
  const [outfits, setOutfits] = useSticky<string[]>("bf.outfits", []);
  const [outfitFiles, setOutfitFiles] = useSticky<File[]>("bf.outfitFiles", []);
  const [results, setResults] = useSticky<{ url: string; status: "done" | "error"; error?: string }[]>("bf.results", []);
  const [productType, setProductType] = useSticky<string>("bf.productType", PRODUCT_TYPES[0]);
  const [ratio, setRatio] = useSticky<string>("bf.ratio", "9:16");
  const [provider, setProvider] = useSticky<string>("bf.provider", "weavy");
  const [model, setModel] = useSticky<string>("bf.model", "");
  const [quality, setQuality] = useSticky<string>("bf.quality", "standard");
  const [templates, setTemplates] = useState<Template[]>(DEFAULT_TPL);
  const [tplIdx, setTplIdx] = useSticky<number>("bf.tplIdx", 0);
  const [showTplModal, setShowTplModal] = useState(false);
  const [status, setStatus] = useSticky<{ show: boolean; text: string; pct: number; time: string }>("bf.status", { show: false, text: "", pct: 0, time: "0:00" });
  const [running, setRunning] = useState(false);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const charInput = useRef<HTMLInputElement>(null);
  const outfitInput = useRef<HTMLInputElement>(null);


  const bfBootstrapped = useRef(false);
  useEffect(() => {
    if (bfBootstrapped.current) return;
    bfBootstrapped.current = true;
    const p = (typeof window !== "undefined" && localStorage.getItem("aatools.activeProvider")) || provider || "weavy";
    if (!MODEL_CATALOG[provider]) setProvider(p);
    const list = MODEL_CATALOG[p] || MODEL_CATALOG.weavy;
    if (!list.find((m) => m.key === model)) {
      const first = list[0];
      setModel(first?.key || "");
      const def = first?.qualities.find((q) => q.default) || first?.qualities[0];
      setQuality(def?.v || "");
    }
    // Template version — bump to force reset of any stale defaults in user's browser
    const TPL_VERSION = "3";
    const savedVer = localStorage.getItem("aatools.bf.templates.v");
    const tpl = localStorage.getItem("aatools.bf.templates");
    if (savedVer !== TPL_VERSION) {
      // Detect user-added custom templates (not part of any legacy default)
      let userCustom: Template[] = [];
      if (tpl) {
        try {
          const parsed = JSON.parse(tpl) as Template[];
          userCustom = (Array.isArray(parsed) ? parsed : []).filter(
            (t) => !/Ganti Outfit Saja|Hanya Outfit|Style Wanita Berhijab|Detail Atasan/.test(t?.name || ""),
          );
        } catch {}
      }
      const next = [...DEFAULT_TPL, ...userCustom];
      setTemplates(next);
      localStorage.setItem("aatools.bf.templates", JSON.stringify(next));
      localStorage.setItem("aatools.bf.templates.v", TPL_VERSION);
      setTplIdx(0);
    } else if (tpl) {
      try { setTemplates(JSON.parse(tpl) as Template[]); } catch {}
    }
    // Consume handoff dari Creative Dashboard → prefill char image dari thumbnail
    const h = consumeHandoff();
    if (h && h.workflow === "bulk-fashion" && h.thumbnail_data_url && !char) {
      (async () => {
        try {
          const res = await fetch(h.thumbnail_data_url!);
          const blob = await res.blob();
          const file = new File([blob], "handoff-thumb.jpg", { type: blob.type || "image/jpeg" });
          setChar(URL.createObjectURL(file));
          setCharFile(file);
        } catch {}
      })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  const models = MODEL_CATALOG[provider] || MODEL_CATALOG.weavy;
  const currentModel = models.find((m) => m.key === model) || models[0];
  const qualities = currentModel?.qualities || [];
  const modelCr = qualities.find((q) => q.v === quality)?.cr ?? qualities.find((q) => q.default)?.cr ?? 0;
  const totalCost = Math.round(modelCr * outfits.length);

  const promptPreview = useMemo(() => {
    const t = templates[tplIdx]?.body || "";
    return t.replaceAll("{product_type}", productType).replaceAll("{outfit_index}", "N");
  }, [templates, tplIdx, productType]);

  const onFiles = (files: FileList | null, target: "char" | "outfit") => {
    if (!files) return;
    if (target === "char") {
      const f = files[0];
      if (f) {
        setChar(URL.createObjectURL(f));
        setCharFile(f);
      }
    } else {
      const arr = Array.from(files).slice(0, 50 - outfits.length);
      const urls = arr.map((f) => URL.createObjectURL(f));
      setOutfits((prev) => [...prev, ...urls]);
      setOutfitFiles((prev) => [...prev, ...arr]);
    }
  };

  const removeOutfit = (i: number) => {
    setOutfits((prev) => prev.filter((_, idx) => idx !== i));
    setOutfitFiles((prev) => prev.filter((_, idx) => idx !== i));
  };

  const stopGenerate = () => {
    abortRef.current?.abort();
    setRunning(false);
    setStatus((s) => ({ ...s, text: "⏹️ Dihentikan oleh user", pct: 100 }));
  };

  const generate = async () => {
    if (!charFile || outfitFiles.length === 0) return;
    logGenerate("bulk_fashion", { provider, modelKey: model, status: "started", outfits: outfitFiles.length });
    try {
      const { trackGeneration } = await import("@/lib/dashboard/projects");
      trackGeneration({ kind: "bulk-fashion", title: `Bulk Fashion · ${outfitFiles.length} outfit`, counts: { images: outfitFiles.length } });
    } catch { /* ignore */ }
    const ac = new AbortController();
    abortRef.current = ac;
    setRunning(true);
    const start = Date.now();
    setStatus({ show: true, text: `Memproses ${outfitFiles.length} outfit…`, pct: 5, time: "0:00" });
    setResults([]);
    const tick = setInterval(() => {
      const el = Math.floor((Date.now() - start) / 1000);
      setStatus((s) => ({ ...s, time: `${Math.floor(el / 60)}:${String(el % 60).padStart(2, "0")}` }));
    }, 1000);
    try {
      const { generateBulkFashion } = await import("@/lib/providers/generate-bulk-fashion");
      const doneCount = { n: 0 };
      const urls = await generateBulkFashion({
        provider: provider as "weavy" | "wavespeed" | "magnific",
        modelKey: model,
        quality,
        ratio,
        charFile,
        outfitFiles,
        promptTemplate: templates[tplIdx]?.body || "",
        productType,
        signal: ac.signal,
        onProgress: (i, msg, url, err) => {
          if (ac.signal.aborted) return;
          if (msg === "done" && url) {
            doneCount.n += 1;
            setResults((r) => [...r, { url, status: "done" }]);
          } else if (msg === "error") {
            setResults((r) => [...r, { url: "", status: "error", error: err }]);
          }
          setStatus((s) => ({ ...s, text: `#${i + 1}: ${msg}`, pct: Math.min(95, (doneCount.n / outfitFiles.length) * 100) }));
        },
      });
      if (!ac.signal.aborted) {
        setStatus((s) => ({ ...s, pct: 100, text: `✅ Selesai — ${urls.length}/${outfitFiles.length} sukses` }));
        const failed = outfitFiles.length - urls.length;
        logGenerate("bulk_fashion", {
          provider, modelKey: model,
          status: failed === 0 ? "success" : urls.length === 0 ? "error" : "partial",
          success: urls.length, failed,
        });
      }
    } catch (e) {
      if (!ac.signal.aborted) {
        const msg = (e as Error).message || String(e);
        setStatus((s) => ({ ...s, pct: 100, text: "❌ " + msg }));
        logGenerate("bulk_fashion", { provider, modelKey: model, status: "error", error: msg });
      }
    } finally {
      clearInterval(tick);
      setRunning(false);
      if (abortRef.current === ac) abortRef.current = null;
    }
  };

  const saveTemplate = (name: string, body: string) => {
    const next = [...templates, { name, body }];
    setTemplates(next);
    localStorage.setItem("aatools.bf.templates", JSON.stringify(next));
    setTplIdx(next.length - 1);
  };
  const deleteTemplate = () => {
    if (templates.length <= 1) return;
    const next = templates.filter((_, i) => i !== tplIdx);
    setTemplates(next);
    setTplIdx(0);
    localStorage.setItem("aatools.bf.templates", JSON.stringify(next));
  };

  return (
    <DashboardShell>
      <PageHero eyebrow="Generate" title="Bulk Fashion" highlight="Generator" desc="1 karakter + banyak outfit → generate parallel → download ZIP." />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <Card title="🧍 Foto Karakter" sub="1 file (JPG/PNG/WEBP/HEIC)">
          <input ref={charInput} type="file" accept="image/*" hidden onChange={(e) => onFiles(e.target.files, "char")} />
          {!char ? (
            <button onClick={() => charInput.current?.click()} className="w-full aspect-[9/16] rounded-2xl border border-dashed border-border/80 bg-card/30 grid place-items-center hover:border-primary/60 transition text-center px-4">
              <div>
                <div className="text-3xl">🧍</div>
                <div className="text-sm mt-1">Tap atau tarik <b>foto karakter</b></div>
                <div className="text-[11px] text-muted-foreground">JPG / PNG / WEBP / HEIC</div>
              </div>
            </button>
          ) : (
            <div className="relative aspect-[9/16] rounded-2xl overflow-hidden border border-border">
              <img src={char} alt="karakter" className="w-full h-full object-cover" />
              <button onClick={() => charInput.current?.click()} className="absolute top-2 right-2 rounded-full px-2 md:px-2.5 py-1 text-xs bg-black/60 text-white flex items-center gap-1">
                <RefreshCw className="h-3 w-3" /> <span className="hidden md:inline">Ganti</span>
              </button>
            </div>
          )}
        </Card>

        <div className="lg:col-span-2">
          <Card
            title={`👚 Outfit Produk ${outfits.length ? `(${outfits.length}/50)` : ""}`}
            sub="max 50 — multi file"
            right={
              outfits.length > 0 ? (
                <GhostButton onClick={() => outfitInput.current?.click()}><Plus className="h-3.5 w-3.5" /> Tambah</GhostButton>
              ) : null
            }
          >
            <input ref={outfitInput} type="file" accept="image/*" multiple hidden onChange={(e) => onFiles(e.target.files, "outfit")} />
            {outfits.length === 0 ? (
              <button onClick={() => outfitInput.current?.click()} className="w-full aspect-[4/3] rounded-2xl border border-dashed border-border/80 bg-card/30 grid place-items-center hover:border-primary/60 transition text-center px-4">
                <div>
                  <div className="text-3xl">👚</div>
                  <div className="text-sm mt-1">Tap atau tarik <b>foto outfit</b> (max 50)</div>
                  <div className="text-[11px] text-muted-foreground">JPG / PNG / WEBP / HEIC — multi-file</div>
                </div>
              </button>
            ) : (
              <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                {outfits.map((u, i) => (
                  <div key={i} className="relative aspect-square rounded-lg overflow-hidden border border-border group">
                    <img src={u} alt="" className="w-full h-full object-cover" />
                    <button
                      onClick={() => removeOutfit(i)}
                      title="Hapus outfit"
                      className="absolute top-1 right-1 inline-flex items-center gap-1 rounded-full bg-black/70 text-white px-1.5 py-0.5 text-[10px] opacity-0 group-hover:opacity-100"
                    >
                      <X className="h-3 w-3" /> Hapus
                    </button>
                    <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[10px] px-1">#{i + 1}</div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>

      <Card title="⚙️ Pengaturan">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Field label="Jenis Produk">
            <Select value={productType} onChange={(e) => setProductType(e.target.value)} options={PRODUCT_TYPES.map((p) => ({ value: p, label: p }))} />
          </Field>
          <Field label="Aspek Rasio">
            <Select value={ratio} onChange={(e) => setRatio(e.target.value)} options={RATIOS.map((r) => ({ value: r, label: r }))} />
          </Field>
          <Field label={`Model AI (provider: ${provider})`}>
            <Select
              value={model}
              onChange={(e) => {
                const newKey = e.target.value;
                setModel(newKey);
                const m = models.find((x) => x.key === newKey);
                const def = m?.qualities.find((q) => q.default) || m?.qualities[0];
                setQuality(def?.v || "");
              }}
              options={models.map((m) => ({ value: m.key, label: m.label }))}
            />
          </Field>
          <Field label="Kualitas">
            <Select value={quality} onChange={(e) => setQuality(e.target.value)} options={qualities.map((q) => ({ value: q.v, label: q.label }))} />
          </Field>
          <Field label="Template Prompt">
            <div className="flex gap-2">
              <Select
                value={String(tplIdx)}
                onChange={(e) => setTplIdx(Number(e.target.value))}
                options={templates.map((t, i) => ({ value: String(i), label: t.name }))}
                className="flex-1"
              />
              <GhostButton onClick={() => setShowTplModal(true)}><Plus className="h-3.5 w-3.5" /> Template</GhostButton>
              <GhostButton onClick={deleteTemplate} className="text-destructive hover:text-destructive" title="Hapus template"><Trash2 className="h-3.5 w-3.5" /> Hapus</GhostButton>
            </div>
          </Field>
          <Field label="Preview Prompt" hint="Placeholder: {product_type}, {outfit_index}">
            <Textarea rows={3} readOnly value={promptPreview} className="opacity-85" />
          </Field>
        </div>
        <div className="flex items-center gap-3 mt-5 flex-wrap">
          {running ? (
            <button
              onClick={stopGenerate}
              className="inline-flex items-center gap-2 rounded-xl bg-destructive/90 hover:bg-destructive text-destructive-foreground px-4 py-2 text-sm font-medium shadow"
            >
              <Square className="h-4 w-4 fill-current" /> Stop Generate
            </button>
          ) : (
            <PrimaryButton onClick={generate} disabled={!char || outfits.length === 0}>
              <Rocket className="h-4 w-4" /> Generate
            </PrimaryButton>
          )}
          <div className="text-xs text-muted-foreground">
            Cost: <b className="text-foreground font-mono">{totalCost}</b> credits ({outfits.length} × {modelCr})
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
      </Card>

      <Card
        title="👗 Hasil Bulk Fashion"
        sub={`(${results.filter((r) => r.status === "done").length})`}
        right={
          <div className="flex gap-2">
            <GhostButton
              onClick={async () => {
                const done = results.filter((r) => r.status === "done" && r.url);
                if (done.length === 0) return;
                const { downloadFilesAsZip } = await import("@/lib/utils/download-zip");
                const ext = (u: string) => (u.match(/\.(png|jpe?g|webp)(\?|$)/i)?.[1] || "jpg").toLowerCase();
                await downloadFilesAsZip(
                  done.map((r, i) => ({ url: r.url, filename: `outfit_${String(i + 1).padStart(3, "0")}.${ext(r.url)}` })),
                  `bulk-fashion-${Date.now()}.zip`,
                );
              }}
              disabled={results.filter((r) => r.status === "done").length === 0}
              title="Download semua hasil sebagai ZIP"
            >
              ⬇ <span className="hidden sm:inline">Download ZIP</span>
            </GhostButton>
            <GhostButton className="text-destructive hover:text-destructive" onClick={() => setResults([])} title="Hapus All">
              <Trash2 className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Hapus All</span>
            </GhostButton>

          </div>

        }
      >
        {results.length === 0 ? (
          <GalleryEmpty />
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {results.map((r, i) => (
              <div key={i} className="rounded-xl overflow-hidden border border-border bg-black/40">
                {r.status === "done" ? (
                  <>
                    <button
                      type="button"
                      onClick={() => setLightbox(r.url)}
                      className={`block w-full ${ratioToAspectClass(ratio)} overflow-hidden cursor-zoom-in`}
                      title="Klik untuk lihat full screen"
                    >
                      <img src={r.url} alt="" className="w-full h-full object-cover" />
                    </button>
                    <div className="p-2 flex justify-between">
                      <a href={r.url} download className="text-[11px] text-primary hover:underline" title="Download">Download</a>
                      <button onClick={() => setResults((rs) => rs.filter((_, idx) => idx !== i))} className="text-[11px] text-destructive hover:underline" title="Hapus">Hapus</button>
                    </div>
                  </>
                ) : (
                  <div className="p-3 text-[11px] text-destructive">❌ {r.error}</div>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      {showTplModal && <TemplateModal onClose={() => setShowTplModal(false)} onSave={saveTemplate} />}
      {lightbox && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/95 backdrop-blur-sm cursor-zoom-out"
          onClick={() => setLightbox(null)}
        >
          <button
            onClick={(e) => { e.stopPropagation(); setLightbox(null); }}
            className="absolute top-4 right-4 z-10 inline-flex items-center gap-1 rounded-full bg-white/10 hover:bg-white/20 text-white px-3 py-1.5 text-xs"
          >
            <X className="h-4 w-4" /> Tutup
          </button>
          <img
            src={lightbox}
            alt="Preview full"
            className="w-screen h-screen object-contain"
            onClick={(e) => e.stopPropagation()}
          />
          <a
            href={lightbox}
            download
            onClick={(e) => e.stopPropagation()}
            className="absolute bottom-6 left-1/2 -translate-x-1/2 inline-flex items-center gap-2 rounded-full bg-primary text-primary-foreground px-4 py-2 text-sm font-medium shadow"
          >
            Download
          </a>
        </div>
      )}
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
        <Field label="Nama Template"><Input placeholder="Mis. Studio Katalog" value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <div className="h-3" />
        <Field label="Isi Prompt"><Textarea rows={5} placeholder="Placeholder: {product_type}, {outfit_index}" value={body} onChange={(e) => setBody(e.target.value)} /></Field>
        <div className="flex gap-2 justify-end mt-4">
          <GhostButton onClick={onClose}>Batal</GhostButton>
          <PrimaryButton onClick={() => { if (name && body) { onSave(name, body); onClose(); } }} disabled={!name || !body}>💾 Simpan</PrimaryButton>
        </div>
      </div>
    </div>
  );
}
