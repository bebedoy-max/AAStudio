import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Rocket, Play, Search, Sparkles, Film, Mic, Image as ImageIcon, Merge, RefreshCw, Loader2 } from "lucide-react";
import { DashboardShell, PageHero } from "@/components/dashboard/shell";
import { Field, Select, Textarea, Input, Card, PrimaryButton, GhostButton } from "@/components/dashboard/ui";
import { useSticky } from "@/lib/stores/use-sticky";
import { consumeHandoff } from "@/lib/creative/handoff";

function ratioClass(r: string): string {
  if (r.startsWith("9:16")) return "aspect-[9/16]";
  if (r.startsWith("1:1")) return "aspect-square";
  return "aspect-video";
}

export const Route = createFileRoute("/generate/naratif")({
  head: () => ({
    meta: [
      { title: "Naratif Video Maker — AATools" },
      { name: "description", content: "Link artikel → scrape → Brain → gambar per scene → voice-over → gabung jadi video naratif." },
    ],
  }),
  component: NaratifPage,
});

// ============ Model Catalog (mirror legacy MODEL_CATALOG structure) ============
type Provider = "weavy" | "wavespeed" | "magnific";
type Quality = { v: string; label: string; cr: number; default?: boolean };
type ModelDef = { key: string; label: string; qualities: Quality[] };

// Image models: match storyboard/bulk-fashion legacy pricing.
const IMG_CATALOG: Record<Provider, ModelDef[]> = {
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
    { key: "ws:google/nano-banana-2/text-to-image", label: "Nano Banana 2", qualities: [
      { v: "1K", label: "1K (7 cr)", cr: 7, default: true },
      { v: "2K", label: "2K (7 cr)", cr: 7 },
    ] },
    { key: "ws:openai/gpt-image-2/text-to-image", label: "GPT-Image-2", qualities: [
      { v: "low", label: "Low (6 cr)", cr: 6 },
      { v: "medium", label: "Medium (6 cr)", cr: 6, default: true },
      { v: "high", label: "High (6 cr)", cr: 6 },
    ] },
    { key: "ws:google/nano-banana-pro/text-to-image", label: "Nano Banana Pro", qualities: [
      { v: "default", label: "Standard (14 cr)", cr: 14, default: true },
    ] },
    { key: "ws:bytedance/seedream-v4", label: "Seedream V4", qualities: [
      { v: "default", label: "Standard (2.7 cr)", cr: 2.7, default: true },
    ] },
    { key: "ws:alibaba/wan-2.7/text-to-image", label: "Wan 2.7", qualities: [
      { v: "default", label: "Standard (3 cr)", cr: 3, default: true },
    ] },
  ],
  magnific: [
    { key: "magnific-img", label: "Magnific Image", qualities: [
      { v: "2K", label: "2K (12 cr)", cr: 12 },
      { v: "4K", label: "4K (22 cr)", cr: 22, default: true },
    ] },
  ],
};

// Video models — pilihan kualitas = resolusi (durasi fix per model)
const VID_CATALOG: Record<Provider, ModelDef[]> = {
  weavy: [
    { key: "veo-3.1", label: "Veo 3.1 (durasi 8s)", qualities: [
      { v: "720p", label: "720p (60 cr)", cr: 60, default: true },
      { v: "1080p", label: "1080p (80 cr)", cr: 80 },
    ] },
    { key: "sora-2", label: "Sora 2 (durasi 10s)", qualities: [
      { v: "720p", label: "720p (40 cr)", cr: 40, default: true },
      { v: "1080p", label: "1080p (55 cr)", cr: 55 },
    ] },
    { key: "kling-2.1", label: "Kling V2.1 (durasi 5s)", qualities: [
      { v: "720p", label: "720p (26 cr)", cr: 26, default: true },
      { v: "1080p", label: "1080p (40 cr)", cr: 40 },
    ] },
    { key: "seedance", label: "Seedance (durasi 5s)", qualities: [
      { v: "480p", label: "480p (20 cr)", cr: 20 },
      { v: "720p", label: "720p (30 cr)", cr: 30, default: true },
      { v: "1080p", label: "1080p (45 cr)", cr: 45 },
    ] },
  ],
  wavespeed: [
    { key: "kling-2.1", label: "Kling V2.1 (durasi 5s)", qualities: [
      { v: "720p", label: "720p (26 cr)", cr: 26, default: true },
      { v: "1080p", label: "1080p (40 cr)", cr: 40 },
    ] },
    { key: "seedance", label: "Seedance (durasi 5s)", qualities: [
      { v: "480p", label: "480p (20 cr)", cr: 20 },
      { v: "720p", label: "720p (30 cr)", cr: 30, default: true },
      { v: "1080p", label: "1080p (45 cr)", cr: 45 },
    ] },
    { key: "wan-i2v", label: "Wan 2.1 I2V (durasi 5s)", qualities: [
      { v: "720p", label: "720p (24 cr)", cr: 24, default: true },
    ] },
  ],
  magnific: [
    { key: "kling-motion", label: "Kling Motion (durasi 5s)", qualities: [
      { v: "720p", label: "720p (45 cr)", cr: 45, default: true },
      { v: "1080p", label: "1080p (65 cr)", cr: 65 },
    ] },
  ],
};

const VOICES = [
  { value: "JBFqnCBsd6RMkjVDRZzb", label: "George (male, warm narrator)" },
  { value: "EXAVITQu4vr4xnSDxMaL", label: "Sarah (female, clear)" },
  { value: "FGY2WhTYpPnrIDTdsKH5", label: "Laura (female, energetic)" },
  { value: "cgSgspJ2msm6clMCkdW9", label: "Jessica (female, expressive)" },
  { value: "onwK4e9ZLuTAKqWW03F9", label: "Daniel (male, deep)" },
  { value: "TX3LPaxmHKxFdv7VOQHJ", label: "Liam (male, young)" },
  { value: "pFZP5JQG7iQjIQuC4Bku", label: "Lily (female, soft)" },
  { value: "nPczCjzI2devNBz1zQrb", label: "Brian (male, storyteller)" },
];

// Map image model → wavespeed text-to-image endpoint (executor is wavespeed for now)
function mapImgToWsEndpoint(modelKey: string): string {
  if (modelKey.startsWith("ws:")) return modelKey.slice(3);
  if (modelKey === "nanobanana2") return "google/nano-banana-2/text-to-image";
  if (modelKey === "gptimage2") return "openai/gpt-image-2/text-to-image";
  if (modelKey === "magnific-img") return "google/nano-banana-2/text-to-image"; // fallback
  return "wavespeed-ai/flux-schnell";
}

type Material = { title: string; desc: string; body: string; hero?: string; images?: string[] };
type Scene = { idx: number; prompt: string; videoPrompt: string; narration: string; imgUrl?: string; audioUrl?: string; videoUrl?: string; busy?: "img" | "vo" | "vid" | null };
type BulkKind = "img" | "vo" | "vid" | "merge";
type BulkBusy = Record<BulkKind, boolean>;
const EMPTY_BUSY: BulkBusy = { img: false, vo: false, vid: false, merge: false };

function NaratifPage() {
  const [url, setUrl] = useSticky<string>("naratif.url", "");
  const [scraping, setScraping] = useSticky<boolean>("naratif.scraping", false);
  const [scrapeStatus, setScrapeStatus] = useSticky<string>("naratif.scrapeStatus", "");
  const [material, setMaterial] = useSticky<Material | null>("naratif.material", null);

  const [provider, setProvider] = useSticky<Provider>("naratif.provider", "weavy");
  const [ratio, setRatio] = useSticky<string>("naratif.ratio", "9:16");
  const [maxScenes, setMaxScenes] = useSticky<string>("naratif.maxScenes", "10");

  const [imgModel, setImgModel] = useSticky<string>("naratif.imgModel", "");
  const [imgQuality, setImgQuality] = useSticky<string>("naratif.imgQuality", "");
  const [vidModel, setVidModel] = useSticky<string>("naratif.vidModel", "");
  const [vidQuality, setVidQuality] = useSticky<string>("naratif.vidQuality", "");

  const [voice, setVoice] = useSticky<string>("naratif.voice", VOICES[0].value);
  const [extra, setExtra] = useSticky<string>("naratif.extra", "");

  const [brainStatus, setBrainStatus] = useSticky<string>("naratif.brainStatus", "");
  const [scenes, setScenes] = useSticky<Scene[]>("naratif.scenes", []);
  const [mergeStatus, setMergeStatus] = useSticky<string>("naratif.mergeStatus", "");
  const [finalUrl, setFinalUrl] = useSticky<string | null>("naratif.finalUrl", null);
  const [testingVoice, setTestingVoice] = useSticky<boolean>("naratif.testingVoice", false);
  const [bulkBusy, setBulkBusy] = useState<BulkBusy>(EMPTY_BUSY);
  const anyBusy = bulkBusy.img || bulkBusy.vo || bulkBusy.vid || bulkBusy.merge;
  const setBusy = (k: BulkKind, v: boolean) => setBulkBusy((prev) => ({ ...prev, [k]: v }));
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const bootstrappedRef = useRef(false);

  const imgModels = IMG_CATALOG[provider] || IMG_CATALOG.weavy;
  const vidModels = VID_CATALOG[provider] || VID_CATALOG.weavy;
  const activeImgModel = useMemo(() => imgModels.find((m) => m.key === imgModel) || imgModels[0], [imgModels, imgModel]);
  const activeVidModel = useMemo(() => vidModels.find((m) => m.key === vidModel) || vidModels[0], [vidModels, vidModel]);

  // init provider & defaults — hanya sekali dan hanya jika belum diset
  useEffect(() => {
    if (bootstrappedRef.current) return;
    bootstrappedRef.current = true;
    if (!provider || !IMG_CATALOG[provider]) {
      const p = ((typeof window !== "undefined" && (localStorage.getItem("aatools.activeProvider") || localStorage.getItem("arkx_activeProvider"))) || "weavy") as Provider;
      setProvider(IMG_CATALOG[p] ? p : "weavy");
    }
    try {
      const eleven = localStorage.getItem("aatools.eleven");
      if (eleven) {
        const parsed = JSON.parse(eleven);
        if (parsed.voice && !voice) setVoice(parsed.voice);
      }
    } catch {}
    // consume handoff dari Creative Dashboard (mis. dari kartu berita / idea card)
    const h = consumeHandoff();
    if (h && h.workflow === "narrative-video") {
      if (h.sourceUrl) {
        const src = h.sourceUrl;
        setUrl(src);
        if (h.autoScrape) {
          setTimeout(() => { void scrapeRef.current?.(src); }, 0);
        }
      } else {
        const seed = [h.title, h.hook, h.description].filter(Boolean).join(" — ");
        if (seed) setExtra((prev) => (prev && prev.trim() ? prev : seed));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ketika provider berubah, reset pilihan model HANYA jika model saat ini tidak valid
  useEffect(() => {
    const list = IMG_CATALOG[provider] || [];
    if (!list.find((m) => m.key === imgModel)) setImgModel(list[0]?.key || "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider]);
  useEffect(() => {
    const list = VID_CATALOG[provider] || [];
    if (!list.find((m) => m.key === vidModel)) setVidModel(list[0]?.key || "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider]);

  // reset kualitas ke default model HANYA jika kualitas saat ini tidak valid
  useEffect(() => {
    if (!activeImgModel) return;
    if (!activeImgModel.qualities.find((q) => q.v === imgQuality)) {
      const def = activeImgModel.qualities.find((q) => q.default) ?? activeImgModel.qualities[0];
      setImgQuality(def?.v ?? "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeImgModel]);
  useEffect(() => {
    if (!activeVidModel) return;
    if (!activeVidModel.qualities.find((q) => q.v === vidQuality)) {
      const def = activeVidModel.qualities.find((q) => q.default) ?? activeVidModel.qualities[0];
      setVidQuality(def?.v ?? "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeVidModel]);

  // ref agar effect bootstrap bisa memanggil scrape yang dideklarasikan di bawah
  const scrapeRef = useRef<((overrideUrl?: string) => Promise<void>) | null>(null);

  const testVoice = async () => {
    // Create Audio element inside user-gesture tick, then fill src after fetch.
    // Some browsers (Safari/iOS/strict Chromium) block .play() if Audio is
    // constructed after `await` — the gesture context is gone by then.
    const audio = new Audio();
    audioRef.current = audio;
    try {
      setTestingVoice(true);
      const eleven = JSON.parse(localStorage.getItem("aatools.eleven") || "{}");
      const key = eleven?.keys?.[0];
      if (!key) throw new Error("Belum ada ElevenLabs API key di Kelola Token");
      const r = await fetch("/api/public/elevenlabs-tts", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Eleven-Key": key },
        body: JSON.stringify({ text: "Halo, ini contoh suara narator untuk video naratif kamu.", voiceId: voice }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j.error || `HTTP ${r.status}`);
      }
      const buf = await r.arrayBuffer();
      const audioUrl = URL.createObjectURL(new Blob([buf], { type: "audio/mpeg" }));
      audio.src = audioUrl;
      audio.volume = 1;
      await audio.play().catch((err) => {
        throw new Error("Browser memblokir autoplay: " + err.message);
      });
    } catch (e) {
      alert("Tes suara gagal: " + ((e as Error).message || String(e)));
    } finally {
      setTestingVoice(false);
    }
  };

  const scrape = async (overrideUrl?: string) => {
    const target = (overrideUrl ?? url).trim();
    if (!target) return;
    setScraping(true);
    setScrapeStatus("Mengambil materi…");
    try {
      const r = await fetch("/api/public/scrape-article", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: target }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      const images: string[] = Array.isArray(j.images) ? j.images : [];
      setMaterial({
        title: j.title || "",
        desc: j.description || "",
        body: j.body || "",
        hero: images[0],
        images,
      });
      setScrapeStatus(`✅ Materi terambil${images.length ? ` (${images.length} gambar)` : " (0 gambar — cek URL)"}`);
    } catch (e) {
      setScrapeStatus("❌ " + ((e as Error).message || String(e)));
    } finally {
      setScraping(false);
    }
  };
  scrapeRef.current = scrape;


  const runBrain = async () => {
    if (!material) return;
    const n = Number(maxScenes);
    setBrainStatus(`Brain menyusun ${n} scene…`);
    try {
      let geminiKeys = "";
      try {
        const raw = localStorage.getItem("aatools.brain.geminiKeys");
        if (raw) {
          const parsed = JSON.parse(raw);
          geminiKeys = Array.isArray(parsed) ? parsed.join(",") : (parsed.keys || []).join(",");
        }
      } catch {}
      const r = await fetch("/api/public/naratif-brain", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-user-gemini-keys": geminiKeys },
        body: JSON.stringify({ title: material.title, description: material.desc, body: material.body, aspectRatio: ratio, maxScenes: n, extraPrompt: extra }),
      });
      const j = await r.json();
      if (j.fallback || !j.result) throw new Error(j.error || "Brain gagal");
      const s: Scene[] = (j.result.scenes || []).map((sc: { n?: number; image_prompt?: string; motion_prompt?: string; narration?: string }, i: number) => ({
        idx: sc.n || i + 1,
        prompt: sc.image_prompt || "",
        videoPrompt: sc.motion_prompt || "",
        narration: sc.narration || "",
      }));
      setScenes(s);
      setBrainStatus(`✅ ${s.length} scene siap. Edit prompt & narasi bila perlu.`);
    } catch (e) {
      setBrainStatus("❌ " + ((e as Error).message || String(e)));
    }
  };

  const patchScene = (i: number, patch: Partial<Scene>) => {
    setScenes((prev) => prev.map((p, idx) => (idx === i ? { ...p, ...patch } : p)));
  };

  const genImageAt = async (i: number): Promise<void> => {
    const scene = scenes[i];
    if (!scene) return;
    patchScene(i, { busy: "img" });
    try {
      let imgUrl: string;
      if (provider === "weavy") {
        const { generateWeavyImage } = await import("@/lib/providers/weavy-image");
        imgUrl = await generateWeavyImage({ modelKey: imgModel, prompt: scene.prompt, quality: imgQuality, ratio });
      } else {
        const { getFirstWavespeedKey, wsPost, wsPoll, WAVESPEED_API } = await import("@/lib/providers/wavespeed");
        const key = getFirstWavespeedKey();
        if (!key) throw new Error(`Belum ada Wavespeed API key di Kelola Token (provider aktif: ${provider})`);
        const modelId = mapImgToWsEndpoint(imgModel);
        const payload: Record<string, unknown> = { prompt: scene.prompt, aspect_ratio: ratio };
        if (/gpt-image/.test(modelId)) payload.quality = imgQuality;
        else if (/nano-banana/.test(modelId)) payload.resolution = imgQuality;
        const data = await wsPost(modelId, payload, key);
        const getUrl = data.urls?.get || `${WAVESPEED_API}/predictions/${data.id}/result`;
        imgUrl = await wsPoll(getUrl, key, { timeoutMs: 300000 });
      }
      patchScene(i, { imgUrl, busy: null });
    } catch (e) {
      patchScene(i, { busy: null });
      throw e;
    }
  };

  const genVOAt = async (i: number): Promise<void> => {
    const scene = scenes[i];
    if (!scene) return;
    patchScene(i, { busy: "vo" });
    try {
      const eleven = JSON.parse(localStorage.getItem("aatools.eleven") || "{}");
      const key = eleven?.keys?.[0];
      if (!key) throw new Error("Belum ada ElevenLabs API key");
      const r = await fetch("/api/public/elevenlabs-tts", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Eleven-Key": key },
        body: JSON.stringify({ text: scene.narration, voiceId: voice }),
      });
      if (!r.ok) throw new Error(`VO gagal (${r.status})`);
      const buf = await r.arrayBuffer();
      if (buf.byteLength < 500) throw new Error(`VO kosong (${buf.byteLength}B) — cek ElevenLabs key/quota`);
      // Prefer blob URL (paling reliable untuk playback native <audio>).
      // Fallback ke data URL agar tetap survive reload (blob URL invalid setelah reload).
      const blob = new Blob([buf], { type: "audio/mpeg" });
      const blobUrl = URL.createObjectURL(blob);
      let audioUrl = blobUrl;
      try {
        // Simpan juga sebagai data URL supaya persist di useSticky (localStorage).
        // Encode chunked untuk hindari stack overflow di String.fromCharCode(...large).
        const bytes = new Uint8Array(buf);
        let bin = "";
        const CHUNK = 0x8000;
        for (let off = 0; off < bytes.length; off += CHUNK) {
          bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(off, off + CHUNK)) as number[]);
        }
        audioUrl = `data:audio/mpeg;base64,${btoa(bin)}`;
      } catch { /* fall back to blob URL */ }
      patchScene(i, { audioUrl, busy: null });
    } catch (e) {
      patchScene(i, { busy: null });
      throw e;
    }
  };

  const genVideoAt = async (i: number): Promise<void> => {
    const scene = scenes[i];
    if (!scene?.imgUrl) throw new Error(`Scene #${i + 1} belum ada gambar`);
    patchScene(i, { busy: "vid" });
    try {
      const { generateI2V } = await import("@/lib/providers/generate-i2v");
      const imgResp = await fetch(scene.imgUrl);
      const imgFile = new File([await imgResp.blob()], `scene_${i}.jpg`, { type: "image/jpeg" });
      const videoUrl = await generateI2V({
        provider,
        modelKey: vidModel,
        imageFile: imgFile,
        ratio,
        duration: 5,
        prompt: scene.videoPrompt || scene.prompt,
      });
      patchScene(i, { videoUrl, busy: null });
    } catch (e) {
      patchScene(i, { busy: null });
      throw e;
    }
  };

  const genAllImages = async () => {
    if (bulkBusy.img) return;
    setBusy("img", true);
    setBrainStatus("🖼️ Generate semua gambar…");
    try {
      for (let i = 0; i < scenes.length; i++) {
        setBrainStatus(`🖼️ Gambar #${i + 1}/${scenes.length}…`);
        await genImageAt(i);
      }
      setBrainStatus("✅ Semua gambar selesai");
    } catch (e) {
      setBrainStatus("❌ " + ((e as Error).message || String(e)));
    } finally {
      setBusy("img", false);
    }
  };

  const genAllVO = async () => {
    if (bulkBusy.vo) return;
    setBusy("vo", true);
    setBrainStatus("🎙️ Generate semua voice-over…");
    try {
      for (let i = 0; i < scenes.length; i++) {
        setBrainStatus(`🎙️ VO #${i + 1}/${scenes.length}…`);
        await genVOAt(i);
      }
      setBrainStatus("✅ Semua VO selesai");
    } catch (e) {
      setBrainStatus("❌ " + ((e as Error).message || String(e)));
    } finally {
      setBusy("vo", false);
    }
  };

  const genAllVideos = async () => {
    if (bulkBusy.vid) return;
    setBusy("vid", true);
    setBrainStatus("🎬 Generate semua image→video…");
    try {
      for (let i = 0; i < scenes.length; i++) {
        setBrainStatus(`🎬 Video #${i + 1}/${scenes.length}…`);
        await genVideoAt(i);
      }
      setBrainStatus("✅ Semua video selesai");
    } catch (e) {
      setBrainStatus("❌ " + ((e as Error).message || String(e)));
    } finally {
      setBusy("vid", false);
    }
  };

  const merge = async () => {
    if (bulkBusy.merge) return;
    setBusy("merge", true);
    try {
      setMergeStatus("ℹ️ Video final: gabung manual per-scene (client-side ffmpeg merge butuh koneksi cepat). Unduh semua video di atas & audio-nya, lalu gabung di editor. Auto-merge coming soon.");
      setFinalUrl("#");
    } finally {
      setBusy("merge", false);
    }
  };

  const allImagesReady = scenes.length > 0 && scenes.every((s) => !!s.imgUrl);
  const canMerge = scenes.length > 0 && scenes.every((s) => s.videoUrl && s.audioUrl);


  return (
    <DashboardShell>
      <PageHero eyebrow="Generate" title="Naratif Video" highlight="Maker" desc="Link artikel/berita/blog → scrape → Brain → gambar per scene → voice-over → gabung jadi video naratif." />

      <Card title="🔗 Sumber Artikel">
        <div className="flex gap-2">
          <Input type="url" placeholder="https://..." value={url} onChange={(e) => setUrl(e.target.value)} />
          <PrimaryButton onClick={() => { void scrape(); }} disabled={scraping || !url.trim()} className="whitespace-nowrap shrink-0">
            <Search className="h-4 w-4" /> Ambil Materi
          </PrimaryButton>
        </div>
        {scrapeStatus && <div className="mt-2 text-[11px] text-muted-foreground">{scrapeStatus}</div>}
      </Card>

      {material && (
        <Card title="📰 Materi">
          <div className="grid grid-cols-1 gap-4">
            <Field label="Judul"><Input value={material.title} onChange={(e) => setMaterial({ ...material, title: e.target.value })} /></Field>
            <Field label="Deskripsi Singkat"><Textarea rows={2} value={material.desc} onChange={(e) => setMaterial({ ...material, desc: e.target.value })} /></Field>
            <Field label="Isi Artikel"><Textarea rows={6} value={material.body} onChange={(e) => setMaterial({ ...material, body: e.target.value })} className="text-xs" /></Field>
            {material.images && material.images.length > 0 && (
              <Field label={`Gambar dari Artikel (${material.images.length}) — referensi untuk Brain`}>
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                  {material.images.slice(0, 12).map((src, i) => (
                    <a key={i} href={src} target="_blank" rel="noreferrer" className="block aspect-square rounded-lg overflow-hidden border border-border bg-black/30">
                      <img src={src} alt={`ref-${i}`} className="w-full h-full object-cover" loading="lazy" />
                    </a>
                  ))}
                </div>
              </Field>
            )}
          </div>
        </Card>
      )}

      {material && (
        <Card title="🧠 Brain — Naskah & Model">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Aspek Rasio">
              <Select value={ratio} onChange={(e) => setRatio(e.target.value)} options={[
                { value: "9:16", label: "9:16 Vertical" },
                { value: "16:9", label: "16:9 Landscape" },
                { value: "1:1", label: "1:1 Square" },
              ]} />
            </Field>
            <Field label="Jumlah Scene">
              <Select value={maxScenes} onChange={(e) => setMaxScenes(e.target.value)} options={["3","4","5","6","8","10","12"].map((n) => ({ value: n, label: `${n} scene` }))} />
            </Field>
            <Field label={`Model AI Gambar (provider: ${provider})`}>
              <Select value={imgModel} onChange={(e) => setImgModel(e.target.value)} options={imgModels.map((m) => ({ value: m.key, label: m.label }))} />
            </Field>
            <Field label="Kualitas Gambar">
              <Select value={imgQuality} onChange={(e) => setImgQuality(e.target.value)} options={(activeImgModel?.qualities || []).map((q) => ({ value: q.v, label: q.label }))} />
            </Field>
            <Field label="Model Video (Image→Video)">
              <Select value={vidModel} onChange={(e) => setVidModel(e.target.value)} options={vidModels.map((m) => ({ value: m.key, label: m.label }))} />
            </Field>
            <Field label="Kualitas Video">
              <Select value={vidQuality} onChange={(e) => setVidQuality(e.target.value)} options={(activeVidModel?.qualities || []).map((q) => ({ value: q.v, label: q.label }))} />
            </Field>
            <Field label="Voice-Over">
              <div className="flex gap-2">
                <Select value={voice} onChange={(e) => setVoice(e.target.value)} options={VOICES} className="flex-1" />
                <PrimaryButton onClick={testVoice} disabled={testingVoice} title="Tes suara" className="!px-3 whitespace-nowrap">
                  <Play className="h-3.5 w-3.5" /> {testingVoice ? "..." : "Tes"}
                </PrimaryButton>
              </div>
            </Field>
            <Field label="Extra Prompt (opsional)">
              <Textarea rows={2} placeholder="Gaya visual, mood, angle bercerita tertentu…" value={extra} onChange={(e) => setExtra(e.target.value)} />
            </Field>
          </div>
          <div className="mt-5 flex items-center gap-3 flex-wrap">
            <PrimaryButton onClick={runBrain}><Sparkles className="h-4 w-4" /> Analisa & Bikin Naskah</PrimaryButton>
            {brainStatus && <div className="text-[11px] text-muted-foreground">{brainStatus}</div>}
          </div>
        </Card>
      )}

      {scenes.length > 0 && (
        <Card title={`🎬 Scenes (${scenes.length})`}>
          {/* Susunan lama: vertical list, preview kiri + fields kanan */}
          <div className="flex flex-col gap-4">
            {scenes.map((s, i) => (
              <div key={s.idx} className="rounded-xl border border-border bg-card/40 p-4">
                <div className="flex flex-col md:flex-row gap-4">
                  <div className="md:w-56 shrink-0 flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <span className="rounded-full px-2 py-0.5 text-[10px] font-mono bg-primary/15 text-primary">Scene #{s.idx}</span>
                      <span className="text-xs text-muted-foreground">
                        {s.imgUrl ? "🖼️" : "◻️"} {s.audioUrl ? "🎙️" : "◻️"} {s.videoUrl ? "🎬" : "◻️"}
                      </span>
                    </div>
                    <div className={`${ratioClass(ratio)} rounded-lg overflow-hidden bg-black/40 border border-border grid place-items-center relative`}>
                      {s.videoUrl ? (
                        <video src={s.videoUrl} controls className="w-full h-full object-cover" />
                      ) : s.imgUrl ? (
                        <img src={s.imgUrl} alt={`Scene ${s.idx}`} className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-[11px] text-muted-foreground">Belum ada gambar</span>
                      )}
                      {s.busy && (
                        <div className="absolute inset-0 grid place-items-center bg-black/60 text-[11px] text-primary-foreground">
                          {s.busy === "img" ? "🖼️ generating…" : s.busy === "vo" ? "🎙️ generating…" : "🎬 generating…"}
                        </div>
                      )}
                    </div>
                    {s.audioUrl && (
                      <audio
                        src={s.audioUrl}
                        controls
                        preload="auto"
                        className="w-full h-8"
                        onLoadedMetadata={(e) => { (e.currentTarget as HTMLAudioElement).volume = 1; }}
                        onPlay={(e) => {
                          const a = e.currentTarget as HTMLAudioElement;
                          if (a.muted) a.muted = false;
                          if (a.volume < 0.05) a.volume = 1;
                        }}
                      />
                    )}
                    <div className="flex flex-wrap gap-1.5">
                      <GhostButton
                        onClick={() => genImageAt(i).catch((e) => setBrainStatus("❌ " + ((e as Error).message || String(e))))}
                        disabled={!!s.busy || anyBusy}
                        className="!px-2 !py-1 text-[11px]"
                        title="Generate ulang gambar"
                      >
                        {s.busy === "img" ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />} Img
                      </GhostButton>
                      <GhostButton
                        onClick={() => genVOAt(i).catch((e) => setBrainStatus("❌ " + ((e as Error).message || String(e))))}
                        disabled={!!s.busy || bulkBusy.vo}
                        className="!px-2 !py-1 text-[11px]"
                        title="Generate ulang voice-over"
                      >
                        {s.busy === "vo" ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />} VO
                      </GhostButton>
                      <GhostButton
                        onClick={() => genVideoAt(i).catch((e) => setBrainStatus("❌ " + ((e as Error).message || String(e))))}
                        disabled={!!s.busy || bulkBusy.vid || bulkBusy.img || bulkBusy.merge || !s.imgUrl}
                        className="!px-2 !py-1 text-[11px]"
                        title="Generate ulang video"
                      >
                        {s.busy === "vid" ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />} Vid
                      </GhostButton>
                    </div>
                  </div>
                  <div className="flex-1 flex flex-col gap-3 min-w-0">
                    <Field label="Prompt Gambar">
                      <Textarea rows={3} value={s.prompt} onChange={(e) => patchScene(i, { prompt: e.target.value })} />
                    </Field>
                    <Field label="Prompt Video (motion / kamera)">
                      <Textarea rows={2} placeholder="Slow zoom in, gentle parallax, cinematic push-forward…" value={s.videoPrompt} onChange={(e) => patchScene(i, { videoPrompt: e.target.value })} />
                    </Field>
                    <Field label="Narasi (VO)">
                      <Textarea rows={3} value={s.narration} onChange={(e) => patchScene(i, { narration: e.target.value })} />
                    </Field>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            <PrimaryButton onClick={genAllImages} disabled={bulkBusy.img || bulkBusy.vid || bulkBusy.merge}>
              {bulkBusy.img ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImageIcon className="h-4 w-4" />}
              {bulkBusy.img ? "Menggenerate Gambar…" : "Generate Semua Gambar"}
            </PrimaryButton>
            <PrimaryButton onClick={genAllVO} disabled={bulkBusy.vo}>
              {bulkBusy.vo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mic className="h-4 w-4" />}
              {bulkBusy.vo ? "Menggenerate VO…" : "Generate Semua Voice-Over"}
            </PrimaryButton>
            <PrimaryButton onClick={genAllVideos} disabled={!allImagesReady || bulkBusy.vid || bulkBusy.img || bulkBusy.merge}>
              {bulkBusy.vid ? <Loader2 className="h-4 w-4 animate-spin" /> : <Film className="h-4 w-4" />}
              {bulkBusy.vid ? "Menggenerate Video…" : "Generate Semua Image→Video"}
            </PrimaryButton>
            <PrimaryButton
              onClick={merge}
              disabled={!canMerge || anyBusy}
              className={canMerge && !anyBusy ? "relative overflow-hidden ring-2 ring-primary/70 animate-pulse" : ""}
            >
              {canMerge && !anyBusy && (
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-0 -translate-x-full animate-[shimmer_1.8s_linear_infinite] bg-gradient-to-r from-transparent via-white/40 to-transparent"
                />
              )}
              {bulkBusy.merge ? <Loader2 className="h-4 w-4 animate-spin" /> : <Merge className="h-4 w-4" />}
              {bulkBusy.merge ? "Menggabung…" : "Gabung jadi Video Naratif"}
            </PrimaryButton>
          </div>

          {mergeStatus && <div className="mt-3 text-[11px] text-muted-foreground">{mergeStatus}</div>}
          {finalUrl && (
            <div className="mt-4 rounded-xl border border-border bg-black/40 p-4 text-center text-sm text-muted-foreground">
              🎞️ Video final siap — sambungkan backend ffmpeg untuk file downloadable.
            </div>
          )}
        </Card>
      )}

      {!material && (
        <Card>
          <div className="py-10 text-center text-sm text-muted-foreground">
            <Rocket className="mx-auto h-8 w-8 opacity-50" />
            <div className="mt-2">Paste URL artikel di atas lalu klik <b>Ambil Materi</b> untuk memulai.</div>
          </div>
        </Card>
      )}
    </DashboardShell>
  );
}
