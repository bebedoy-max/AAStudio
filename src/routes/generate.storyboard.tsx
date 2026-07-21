import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { withKeyGuard } from "@/components/brain/key-guard";
import { logGenerate } from "@/lib/activity/log";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Rocket,
  Search,
  Download,
  Trash2,
  Plus,
  X,
  Loader2,
  Check as CheckIcon,
  AlertCircle,
  Video,
} from "lucide-react";
import { DashboardShell, PageHero } from "@/components/dashboard/shell";
import {
  Field,
  Input,
  Select,
  Textarea,
  Card,
  PrimaryButton,
  GhostButton,
  GalleryEmpty,
} from "@/components/dashboard/ui";
import { createRunStore } from "@/lib/stores/run-store";
import { useSticky } from "@/lib/stores/use-sticky";
import { consumeHandoff, setHandoff } from "@/lib/creative/handoff";
import { confirmDialog } from "@/components/ui-confirm";


export const Route = createFileRoute("/generate/storyboard")({
  head: () => ({
    meta: [
      { title: "Produk Storyboard — AA Creative Studio" },
      {
        name: "description",
        content:
          "Link produk → scrape info → ChatGPT brain → 1 gambar grid storyboard.",
      },
    ],
  }),
  component: withKeyGuard(StoryboardPage, ["brain"]),
});

// ---- Model catalog (mirror MODEL_CATALOG.storyboard from legacy) ----
type Provider = "weavy" | "wavespeed" | "magnific";
type Quality = { v: string; label: string; cr: number; default?: boolean };
type SbModel = { key: string; label: string; qualities: Quality[] };

const SB_MODELS: Record<Provider, SbModel[]> = {
  weavy: [
    {
      key: "nanobanana2",
      label: "Gemini Nano Banana 2 (Weavy)",
      qualities: [
        { v: "0.5K", label: "0.5K (4.5 cr)", cr: 4.5 },
        { v: "1K", label: "1K (6 cr)", cr: 6, default: true },
        { v: "2K", label: "2K (9 cr)", cr: 9 },
        { v: "4K", label: "4K (12 cr)", cr: 12 },
      ],
    },
    {
      key: "gptimage2",
      label: "Image GPT 2 Edit (Weavy)",
      qualities: [
        { v: "low", label: "Low (~15 cr)", cr: 15 },
        { v: "medium", label: "Medium (~36 cr)", cr: 36, default: true },
        { v: "high", label: "High (~60 cr)", cr: 60 },
      ],
    },
  ],
  wavespeed: [
    {
      key: "ws:openai/gpt-image-2/text-to-image",
      label: "GPT-Image-2",
      qualities: [
        { v: "low", label: "Low (6 cr)", cr: 6 },
        { v: "medium", label: "Medium (6 cr)", cr: 6, default: true },
        { v: "high", label: "High (6 cr)", cr: 6 },
      ],
    },
    {
      key: "ws:google/nano-banana-2/text-to-image",
      label: "Nano Banana 2",
      qualities: [
        { v: "1K", label: "1K (7 cr)", cr: 7, default: true },
        { v: "2K", label: "2K (7 cr)", cr: 7 },
      ],
    },
    {
      key: "ws:google/nano-banana-pro/text-to-image",
      label: "Nano Banana Pro",
      qualities: [{ v: "default", label: "Standard (14 cr)", cr: 14, default: true }],
    },
    {
      key: "ws:bytedance/seedream-v4",
      label: "Seedream V4",
      qualities: [{ v: "default", label: "Standard (2.7 cr)", cr: 2.7, default: true }],
    },
    {
      key: "ws:alibaba/wan-2.7/text-to-image",
      label: "Wan 2.7",
      qualities: [{ v: "default", label: "Standard (3 cr)", cr: 3, default: true }],
    },
  ],
  magnific: [],
};

const PROVIDER_LABEL: Record<Provider, string> = {
  weavy: "Weavy",
  wavespeed: "Wavespeed",
  magnific: "Magnific",
};

const SB_MAX_ROWS = 12;
const SB_DEFAULT_TYPES = [
  "Tas Wanita",
  "Sepatu",
  "Pakaian Pria",
  "Pakaian Wanita",
  "Aksesoris",
  "Kosmetik",
  "Skincare",
  "Elektronik",
  "Makanan & Minuman",
  "Perlengkapan Rumah",
];

type FramingOpt = { value: string; label: string; instruction: string };
const FRAMING_OPTS: FramingOpt[] = [
  {
    value: "normal",
    label: "Normal (full scene + model)",
    instruction: "",
  },
  {
    value: "no-head",
    label: "Tanpa kepala (crop leher ke bawah)",
    instruction:
      "WAJIB semua panel crop dari leher/dagu ke bawah — jangan tampilkan wajah, kepala, rambut, atau ekspresi model. Framing dari bahu/leher ke bawah (torso, tangan, badan) atau body-crop yang berinteraksi dengan produk. Jangan render wajah manusia sama sekali di panel manapun.",
  },
  {
    value: "product-only",
    label: "Zoom produk saja (no human)",
    instruction:
      "WAJIB semua panel adalah product-only shot — hanya produk dengan background, props, dan lifestyle context, tanpa manusia sama sekali. Jangan tampilkan orang, wajah, tangan, atau bagian tubuh apapun. Fokus pada produk sebagai hero, macro/detail/flat-lay/lifestyle still-life.",
  },
  {
    value: "hands-only",
    label: "Hanya tangan memegang produk",
    instruction:
      "WAJIB semua panel hanya menampilkan tangan / lengan / jari yang berinteraksi dengan produk. Jangan tampilkan wajah, kepala, atau tubuh bagian atas. Framing close-up hands-holding-product style.",
  },
  {
    value: "detail-macro",
    label: "Detail macro / close-up produk",
    instruction:
      "WAJIB semua panel adalah extreme close-up / macro shot produk — fokus pada tekstur, detail material, logo, packaging. Tidak boleh ada manusia, wajah, atau anggota tubuh terlihat.",
  },
];

type CtaOpt = { value: string; label: string };
const CTA_PRESETS: CtaOpt[] = [
  { value: "tiktok", label: "TikTok Shop (keranjang kuning)" },
  { value: "facebook-shopee", label: "Facebook Ads → Shopee" },
  { value: "facebook-tokopedia", label: "Facebook Ads → Tokopedia" },
  { value: "tokopedia", label: "Tokopedia" },
  { value: "shopee", label: "Shopee" },
  { value: "instagram", label: "Instagram (link in bio)" },
  { value: "whatsapp", label: "WhatsApp (chat admin)" },
  { value: "custom", label: "Custom (tulis sendiri)" },
];

type ScrapedInfo = {
  title?: string;
  description?: string;
  images?: string[];
  price?: string;
};

type ProductRow = {
  rowId: string;
  url: string;
  info: ScrapedInfo | null;
  selectedImages: string[];
  status: "idle" | "loading" | "ok" | "err";
  error: string;
};

function newRow(): ProductRow {
  return {
    rowId: "r" + Math.random().toString(36).slice(2, 8),
    url: "",
    info: null,
    selectedImages: [],
    status: "idle",
    error: "",
  };
}

// Module-level generation state — survives route navigation.
type GenResult = {
  resultId: string;
  rowId: string;
  title: string;
  prompt?: string;
  imgUrl?: string;
  error?: string;
  status: "pending" | "brain" | "image" | "done" | "err";
  ratio?: string;
};
type SbRun = { results: GenResult[]; logs: string[]; busy: boolean };
const sbRunStore = createRunStore<SbRun>({ results: [], logs: [], busy: false });

function ratioToAspect(r: string | undefined): string {
  if (!r) return "1 / 1";
  const [w, h] = r.split(":").map((n) => Number(n.trim()));
  if (!w || !h) return "1 / 1";
  return `${w} / ${h}`;
}

function StoryboardPage() {
  const navigate = useNavigate();
  // Provider — same localStorage key as legacy (arkx_activeProvider) so it stays in sync
  const [provider, setProvider] = useSticky<Provider>("sb.provider", "weavy");
  const sbBootstrapped = useRef(false);
  useEffect(() => {
    if (sbBootstrapped.current) return;
    sbBootstrapped.current = true;
    try {
      const p = (localStorage.getItem("arkx_activeProvider") ||
        localStorage.getItem("aatools:activeProvider")) as Provider | null;
      if (p && SB_MODELS[p] && !SB_MODELS[provider]) setProvider(p);
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const models = SB_MODELS[provider];
  const defaultModelKey =
    models.find((m) => /gpt.?image/i.test(m.key))?.key ?? models[0]?.key ?? "";
  const [modelKey, setModelKey] = useSticky<string>("sb.modelKey", defaultModelKey);
  useEffect(() => {
    const list = SB_MODELS[provider];
    if (!list.length) {
      setModelKey("");
      return;
    }
    if (!list.find((m) => m.key === modelKey)) {
      const preferred = list.find((m) => /gpt.?image/i.test(m.key)) ?? list[0];
      setModelKey(preferred.key);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider]);

  const activeModel = models.find((m) => m.key === modelKey) ?? models[0];

  const [qualityV, setQualityV] = useSticky<string>("sb.qualityV", "");
  useEffect(() => {
    if (!activeModel) {
      setQualityV("");
      return;
    }
    if (!activeModel.qualities.find((q) => q.v === qualityV)) {
      const def = activeModel.qualities.find((q) => q.default) ?? activeModel.qualities[0];
      setQualityV(def?.v ?? "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeModel]);

  const [sceneCount, setSceneCount] = useSticky<string>("sb.sceneCount", "6");
  const [ratio, setRatio] = useSticky<string>("sb.ratio", "9:16");
  const [framing, setFraming] = useSticky<string>("sb.framing", "normal");
  const [ctaTarget, setCtaTarget] = useSticky<string>("sb.ctaTarget", "tiktok");
  const [ctaCustom, setCtaCustom] = useSticky<string>("sb.ctaCustom", "");
  const [prompt, setPrompt] = useSticky<string>("sb.prompt", "");

  // Product types (persisted)
  const [types, setTypes] = useSticky<string[]>("sb.types", SB_DEFAULT_TYPES);
  const [selectedType, setSelectedType] = useSticky<string>("sb.selectedType", "");
  const [newType, setNewType] = useState("");
  const sbTypesBoot = useRef(false);
  useEffect(() => {
    if (sbTypesBoot.current) return;
    sbTypesBoot.current = true;
    try {
      const raw = localStorage.getItem("arkx_sb_types");
      if (raw) setTypes(JSON.parse(raw));
      const sel = localStorage.getItem("arkx_sb_type_sel");
      if (sel) setSelectedType(sel);
    } catch {}
    // Consume handoff dari Creative Dashboard → prefill prompt
    const h = consumeHandoff();
    if (h && h.workflow === "storyboard") {
      const seed = [h.title, h.hook, h.description].filter(Boolean).join(" — ");
      if (seed) setPrompt((p) => (p && p.trim() ? p : seed));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const persistTypes = (arr: string[], sel: string) => {
    try {
      localStorage.setItem("arkx_sb_types", JSON.stringify(arr));
      localStorage.setItem("arkx_sb_type_sel", sel);
    } catch {}
  };
  const addType = () => {
    const v = newType.trim();
    if (!v || types.includes(v)) return;
    const arr = [...types, v];
    setTypes(arr);
    setSelectedType(v);
    setNewType("");
    persistTypes(arr, v);
  };
  const removeSelectedType = () => {
    if (!selectedType) return;
    const arr = types.filter((t) => t !== selectedType);
    const nextSel = arr[0] ?? "";
    setTypes(arr);
    setSelectedType(nextSel);
    persistTypes(arr, nextSel);
  };

  // Product rows
  const [rows, setRows] = useSticky<ProductRow[]>("sb.rows", [newRow()]);
  const addRow = () => {
    if (rows.length >= SB_MAX_ROWS) return;
    setRows((prev) => [...prev, newRow()]);
  };
  const clearAllRows = async () => {
    if (rows.length === 0) return;
    const ok = await confirmDialog({
      title: `Hapus semua ${rows.length} link produk?`,
      description: "Semua baris akan direset ke satu baris kosong.",
      confirmLabel: "Ya, hapus semua",
      tone: "danger",
    });
    if (!ok) return;
    setRows([newRow()]);
  };

  const removeRow = (rowId: string) => {
    setRows((prev) => (prev.length === 1 ? prev : prev.filter((r) => r.rowId !== rowId)));
  };
  const patchRow = (rowId: string, patch: Partial<ProductRow>) => {
    setRows((prev) => prev.map((r) => (r.rowId === rowId ? { ...r, ...patch } : r)));
  };
  const toggleRowImage = (rowId: string, url: string) => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.rowId !== rowId) return r;
        const has = r.selectedImages.includes(url);
        if (has) return { ...r, selectedImages: r.selectedImages.filter((x) => x !== url) };
        if (r.selectedImages.length >= 6) return r;
        return { ...r, selectedImages: [...r.selectedImages, url] };
      }),
    );
  };
  const fetchRow = async (rowId: string) => {
    const row = rows.find((r) => r.rowId === rowId);
    if (!row) return;
    const url = row.url.trim();
    if (!/^https?:\/\//i.test(url)) {
      patchRow(rowId, { status: "err", error: "URL tidak valid" });
      return;
    }
    patchRow(rowId, { status: "loading", error: "" });
    try {
      const r = await fetch("/api/public/scrape-product", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await r.json();
      if (data.error) throw new Error(data.error);
      const imgs: string[] = (data.images || []).slice(0, 6);
      patchRow(rowId, { status: "ok", info: data, selectedImages: imgs, error: "" });
    } catch (e) {
      patchRow(rowId, {
        status: "err",
        error: e instanceof Error ? e.message : String(e),
      });
    }
  };

  const okCount = rows.filter((r) => r.status === "ok" && r.info).length;
  const perCost = activeModel?.qualities.find((q) => q.v === qualityV)?.cr ?? 0;
  const totalCredits = okCount * perCost;

  // ---- Generation state (module-level so it survives route unmount) ----
  const runState = sbRunStore.use();
  const { results, logs, busy } = runState;
  const setResults = (rs: GenResult[] | ((prev: GenResult[]) => GenResult[])) =>
    sbRunStore.set((s) => ({ ...s, results: typeof rs === "function" ? (rs as (p: GenResult[]) => GenResult[])(s.results) : rs }));
  const setLogs = (ls: string[] | ((prev: string[]) => string[])) =>
    sbRunStore.set((s) => ({ ...s, logs: typeof ls === "function" ? (ls as (p: string[]) => string[])(s.logs) : ls }));
  const setBusy = (b: boolean) => sbRunStore.set((s) => ({ ...s, busy: b }));
  const pushLog = (s: string) =>
    setLogs((prev) => [`[${new Date().toLocaleTimeString()}] ${s}`, ...prev].slice(0, 200));
  const patchResult = (resultId: string, patch: Partial<GenResult>) =>
    setResults((prev) => prev.map((r) => (r.resultId === resultId ? { ...r, ...patch } : r)));

  const canGenerate = okCount > 0 && !!modelKey && !busy;

  function ratioToImageSize(r: string): string {
    if (r.startsWith("9:16") || r.startsWith("3:4") || r.startsWith("4:5")) return "portrait";
    if (r.startsWith("16:9")) return "landscape";
    return "square";
  }
  function mapImgToWsEndpoint(mk: string): string {
    if (mk.startsWith("ws:")) return mk.slice(3);
    if (mk === "nanobanana2") return "google/nano-banana-2/text-to-image";
    if (mk === "gptimage2") return "openai/gpt-image-2/text-to-image";
    return "openai/gpt-image-2/text-to-image";
  }

  async function generateAll() {
    const ok = rows.filter((r) => r.status === "ok" && r.info);
    if (!ok.length) return;
    logGenerate("storyboard", { provider, modelKey, status: "started", rows: ok.length });
    try {
      const { trackGeneration } = await import("@/lib/dashboard/projects");
      const firstTitle = ok[0]?.info?.title || `Storyboard · ${ok.length} produk`;
      trackGeneration({ kind: "storyboard", title: firstTitle, counts: { storyboards: ok.length } });
    } catch { /* ignore */ }
    setBusy(true);
    // JANGAN clear logs & results lama — biar history di gallery tetap ada.
    const batchStamp = Date.now();
    const newResults: GenResult[] = ok.map((r, i) => ({
      resultId: `${r.rowId}_${batchStamp}_${i}`,
      rowId: r.rowId,
      title: r.info?.title || "(tanpa judul)",
      status: "pending" as const,
      ratio,
    }));
    setResults((prev) => [...newResults, ...prev]);
    pushLog(`🚀 Mulai generate ${ok.length} storyboard via ${PROVIDER_LABEL[provider]} · ${modelKey} · ${ratio}`);

    // Load gemini keys once
    let geminiKeys = "";
    try {
      const raw = localStorage.getItem("aatools.brain.geminiKeys");
      if (raw) {
        const parsed = JSON.parse(raw);
        geminiKeys = Array.isArray(parsed) ? parsed.join(",") : (parsed.keys || []).join(",");
      }
    } catch {}
    if (!geminiKeys) {
      pushLog("⚠️ Tidak ada Gemini API key di Kelola Token → tab Brain. Brain tidak akan jalan.");
    }

    let successCount = 0;
    let errorCount = 0;
    for (let idx = 0; idx < ok.length; idx++) {
      const row = ok[idx];
      const resultId = newResults[idx].resultId;
      const info = row.info!;
      const title = info.title || "(tanpa judul)";
      try {
        // --- 1. Brain ---
        patchResult(resultId, { status: "brain" });
        pushLog(`🧠 [${title.slice(0, 40)}] Brain menyusun prompt storyboard…`);
        const brainRes = await fetch("/api/public/storyboard-brain", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-user-gemini-keys": geminiKeys },
          body: JSON.stringify({
            title: info.title,
            description: info.description,
            productType: selectedType,
            productTypes: types,
            scenes: Number(sceneCount),
            aspectRatio: ratio,
            ctaTarget,
            ctaCustom: ctaTarget === "custom" ? ctaCustom : "",
            ctaLabel:
              ctaTarget === "custom"
                ? ctaCustom
                : (CTA_PRESETS.find((c) => c.value === ctaTarget)?.label ?? ctaTarget),
            extraPrompt: [FRAMING_OPTS.find((f) => f.value === framing)?.instruction, prompt]
              .filter(Boolean)
              .join("\n\n"),
          }),
        });
        const brainJson = await brainRes.json();
        if (brainJson.fallback || !brainJson.prompt) {
          throw new Error(brainJson.error || "Brain gagal — cek Gemini key di Kelola Token");
        }
        const finalPrompt = brainJson.prompt as string;
        patchResult(resultId, { prompt: finalPrompt });
        pushLog(`✅ [${title.slice(0, 40)}] Prompt siap (${finalPrompt.length} chars) via ${brainJson.provider || "gemini"}`);

        // --- 2. Image gen ---
        patchResult(resultId, { status: "image" });
        pushLog(`🎨 [${title.slice(0, 40)}] Generate gambar via ${PROVIDER_LABEL[provider]}…`);
        let imgUrl: string;
        const refUrls = (row.selectedImages || []).slice(0, 6);
        if (provider === "weavy") {
          if (refUrls.length > 0 && (modelKey === "nanobanana2" || modelKey === "gptimage2")) {
            const { generateWeavyStoryboard } = await import("@/lib/providers/weavy-storyboard");
            pushLog(`🖼️ [${title.slice(0, 40)}] Pakai ${refUrls.length} gambar produk sebagai referensi (Weavy NB2/GPT-Image-2 multi-ref)`);
            imgUrl = await generateWeavyStoryboard({
              modelKey,
              prompt: finalPrompt,
              quality: qualityV,
              ratio,
              referenceUrls: refUrls,
            });
          } else {
            const { generateWeavyImage } = await import("@/lib/providers/weavy-image");
            imgUrl = await generateWeavyImage({
              modelKey,
              prompt: finalPrompt,
              quality: qualityV,
              ratio,
            });
          }
        } else if (provider === "wavespeed") {
          const { getFirstWavespeedKey, wsPost, wsPoll, WAVESPEED_API } = await import(
            "@/lib/providers/wavespeed"
          );
          const key = getFirstWavespeedKey();
          if (!key) throw new Error("Belum ada Wavespeed API key di Kelola Token");
          const wsRefs = refUrls;
          const hasRef = wsRefs.length > 0;
          const modelId = hasRef
            ? mapImgToWsEndpoint(modelKey).replace(/\/text-to-image$/, "/edit")
            : mapImgToWsEndpoint(modelKey);
          const payload: Record<string, unknown> = { prompt: finalPrompt, aspect_ratio: ratio };
          if (hasRef) payload.images = wsRefs;
          if (/gpt-image/.test(modelId)) payload.quality = qualityV;
          else if (/nano-banana/.test(modelId)) payload.resolution = qualityV;
          if (hasRef) pushLog(`🖼️ [${title.slice(0, 40)}] Pakai ${wsRefs.length} gambar produk sebagai referensi (Wavespeed edit)`);
          const data = await wsPost(modelId, payload, key);
          const getUrl = data.urls?.get || `${WAVESPEED_API}/predictions/${data.id}/result`;
          imgUrl = await wsPoll(getUrl, key, { timeoutMs: 300000 });
        } else {
          throw new Error(`Provider ${provider} belum di-wire untuk storyboard`);
        }
        // Suppress unused ratioToImageSize warning
        void ratioToImageSize;
        patchResult(resultId, { status: "done", imgUrl });
        pushLog(`✅ [${title.slice(0, 40)}] Storyboard selesai`);
        successCount++;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        patchResult(resultId, { status: "err", error: msg });
        pushLog(`❌ [${title.slice(0, 40)}] ${msg}`);
        errorCount++;
      }
    }
    pushLog("🏁 Semua produk selesai diproses");
    logGenerate("storyboard", {
      provider, modelKey,
      status: errorCount === 0 ? "success" : successCount === 0 ? "error" : "partial",
      success: successCount, failed: errorCount,
    });
    setBusy(false);
  }

  const clearResults = () => {
    setResults([]);
    setLogs([]);
  };

  async function sendToImageToVideo(imgUrl: string, title: string) {
    try {
      // Fetch via server proxy to bypass CORS, convert to data URL for handoff.
      const proxied = `/api/public/proxy-image?url=${encodeURIComponent(imgUrl)}`;
      let blob: Blob;
      try {
        const r = await fetch(proxied);
        if (!r.ok) throw new Error(String(r.status));
        blob = await r.blob();
      } catch {
        const r2 = await fetch(imgUrl);
        blob = await r2.blob();
      }
      const dataUrl: string = await new Promise((resolve, reject) => {
        const fr = new FileReader();
        fr.onload = () => resolve(String(fr.result));
        fr.onerror = () => reject(fr.error);
        fr.readAsDataURL(blob);
      });
      setHandoff({
        workflow: "image-to-video",
        title: title || "Storyboard",
        hook: "",
        description: "",
        thumbnail_data_url: dataUrl,
      });
      navigate({ to: "/generate/image-to-video" });
    } catch (e) {
      pushLog(`❌ Gagal kirim ke Image→Video: ${(e as Error).message}`);
    }
  }


  return (
    <DashboardShell>
      <PageHero
        eyebrow="Generate"
        title="Produk"
        highlight="Storyboard"
        desc="Link produk → scrape info → ChatGPT brain → 1 gambar grid storyboard."
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Left top: product rows */}
        <div className="lg:col-span-2 order-1 lg:order-none">
          <Card
            title={`Link Produk (${rows.length}/${SB_MAX_ROWS})`}
            sub="Tempel URL e-commerce, klik scrape, pilih hingga 6 gambar per produk"
            right={
              <div className="flex gap-2">
                <GhostButton onClick={addRow} disabled={rows.length >= SB_MAX_ROWS}>
                  <Plus className="h-3.5 w-3.5" /> Tambah
                </GhostButton>
                <GhostButton
                  onClick={clearAllRows}
                  disabled={rows.length <= 1 && !rows[0]?.url}
                  className="text-destructive hover:text-destructive"
                  title="Hapus semua link produk"
                >
                  <Trash2 className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Hapus All</span>
                </GhostButton>
              </div>
            }
          >
            <div
              className="grid gap-3"
              style={{
                gridTemplateColumns: `repeat(${Math.min(Math.max(rows.length, 1), 3)}, minmax(0, 1fr))`,
              }}
            >
              {rows.map((r, idx) => (
                <ProductRowCard
                  key={r.rowId}
                  index={idx}
                  row={r}
                  canRemove={rows.length > 1}
                  onUrl={(v) => patchRow(r.rowId, { url: v })}
                  onFetch={() => fetchRow(r.rowId)}
                  onRemove={() => removeRow(r.rowId)}
                  onToggleImage={(u) => toggleRowImage(r.rowId, u)}
                />
              ))}
            </div>
          </Card>
        </div>

        {/* Right: settings (before gallery on mobile, spans 2 rows on desktop) */}
        <div className="flex flex-col gap-5 order-2 lg:order-none lg:row-span-2">
          <Card title="Pengaturan" sub={`Provider aktif: ${PROVIDER_LABEL[provider]}`}>
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Jumlah Panel">
                  <Select
                    value={sceneCount}
                    onChange={(e) => setSceneCount(e.target.value)}
                    options={Array.from({ length: 10 }, (_, i) => {
                      const n = String(i + 1);
                      return { value: n, label: `${n} panel` };
                    })}
                  />
                </Field>
                <Field label="Model AI">
                  {models.length ? (
                    <Select
                      value={modelKey}
                      onChange={(e) => setModelKey(e.target.value)}
                      options={models.map((m) => ({ value: m.key, label: m.label }))}
                    />
                  ) : (
                    <div className="text-[11px] text-muted-foreground py-2">
                      Tidak tersedia di provider ini
                    </div>
                  )}
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Aspek Rasio">
                  <Select
                    value={ratio}
                    onChange={(e) => setRatio(e.target.value)}
                    options={[
                      { value: "1:1", label: "1:1 (Square)" },
                      { value: "4:5", label: "4:5" },
                      { value: "3:4", label: "3:4" },
                      { value: "9:16", label: "9:16 (Vertical)" },
                      { value: "16:9", label: "16:9 (Horizontal)" },
                    ]}
                  />
                </Field>
                <Field label="Kualitas">
                  {activeModel && activeModel.qualities.length ? (
                    <Select
                      value={qualityV}
                      onChange={(e) => setQualityV(e.target.value)}
                      options={activeModel.qualities.map((q) => ({
                        value: q.v,
                        label: q.label,
                      }))}
                    />
                  ) : (
                    <div className="text-[11px] text-muted-foreground py-2">—</div>
                  )}
                </Field>
              </div>

              <Field label="Framing / Pengambilan Gambar">
                <Select
                  value={framing}
                  onChange={(e) => setFraming(e.target.value)}
                  options={FRAMING_OPTS.map((f) => ({ value: f.value, label: f.label }))}
                />
                <div className="text-[10px] text-muted-foreground mt-1 leading-relaxed">
                  Pilih "Tanpa kepala" / "Zoom produk" agar hasil aman untuk model Image-to-Video (Seedance, Kling, dll) yang sering menolak subjek manusia.
                </div>
              </Field>

              <Field label="CTA / Target Marketplace">
                <Select
                  value={ctaTarget}
                  onChange={(e) => setCtaTarget(e.target.value)}
                  options={CTA_PRESETS.map((c) => ({ value: c.value, label: c.label }))}
                />
                {ctaTarget === "custom" ? (
                  <Input
                    className="mt-2"
                    placeholder="Contoh: klik link Lazada di bio…"
                    value={ctaCustom}
                    onChange={(e) => setCtaCustom(e.target.value)}
                  />
                ) : (
                  <div className="text-[10px] text-muted-foreground mt-1 leading-relaxed">
                    Brain akan menulis CTA panel terakhir sesuai platform (mis. TikTok → "cek keranjang kuning", Facebook→Shopee → "klik link Shopee di bawah").
                  </div>
                )}
              </Field>



              <Field label="Jenis Produk">
                <div className="flex gap-2">

                  <Select
                    value={selectedType}
                    onChange={(e) => {
                      setSelectedType(e.target.value);
                      persistTypes(types, e.target.value);
                    }}
                    options={[
                      { value: "", label: "— pilih jenis produk —" },
                      ...types.map((t) => ({ value: t, label: t })),
                    ]}
                    className="flex-1"
                  />
                  <button
                    onClick={removeSelectedType}
                    disabled={!selectedType}
                    title="Hapus jenis terpilih"
                    className="inline-flex h-10 items-center gap-1 rounded-xl border border-border bg-card/50 px-3 text-xs text-muted-foreground hover:text-destructive hover:border-destructive/50 transition disabled:opacity-40"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Hapus
                  </button>
                </div>
                <div className="flex gap-2 mt-2">
                  <Input
                    placeholder="Tambah jenis baru…"
                    value={newType}
                    onChange={(e) => setNewType(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addType();
                      }
                    }}
                  />
                  <button
                    onClick={addType}
                    className="inline-flex h-10 items-center gap-1 rounded-xl px-3 text-xs text-primary-foreground"
                    style={{ background: "var(--gradient-neon)" }}
                    title="Tambah"
                  >
                    <Plus className="h-4 w-4" /> Tambah
                  </button>
                </div>
              </Field>

              <Field label="Prompt Tambahan (opsional)">
                <Textarea
                  rows={3}
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="Detail tambahan yang diinginkan (mood, latar, pose model, dsb.)…"
                />
              </Field>

              <PrimaryButton disabled={!canGenerate} onClick={generateAll}>
                {busy ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Sedang generate…
                  </>
                ) : (
                  <>
                    <Rocket className="h-4 w-4" /> Generate Storyboard
                  </>
                )}
              </PrimaryButton>

              <div className="text-center text-xs text-muted-foreground">
                Total:{" "}
                <span className="text-foreground font-mono font-semibold">
                  {totalCredits.toFixed(1)}
                </span>{" "}
                credits ({okCount} produk × {perCost} cr)
              </div>
            </div>
          </Card>
        </div>

        {/* Bottom: gallery (last on mobile) */}
        <div className="lg:col-span-2 order-3 lg:order-none">
          <Card
            title={`Hasil Storyboard${results.length ? ` (${results.filter((r) => r.status === "done").length}/${results.length})` : ""}`}
            right={
              <div className="flex gap-2">
                <GhostButton
                  onClick={async () => {
                    const list = results.filter((r) => r.imgUrl);
                    if (!list.length) return;
                    const { downloadFilesAsZip } = await import("@/lib/utils/download-zip");
                    await downloadFilesAsZip(
                      list.map((r, i) => ({
                        url: r.imgUrl!,
                        filename: `storyboard-${String(i + 1).padStart(2, "0")}.png`,
                      })),
                      `storyboard-${new Date().toISOString().slice(0, 10)}.zip`,
                    );
                  }}
                  disabled={!results.some((r) => r.imgUrl)}
                >
                  <Download className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Download ZIP</span>
                </GhostButton>
                <GhostButton
                  onClick={clearResults}
                  disabled={!results.length && !logs.length}
                  className="text-destructive hover:text-destructive"
                  title="Hapus All"
                >
                  <Trash2 className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Hapus All</span>
                </GhostButton>

              </div>
            }
          >
            {logs.length > 0 && (
              <div className="mb-4 rounded-xl border border-border/70 bg-black/40 p-3 max-h-40 overflow-y-auto font-mono text-[10px] leading-relaxed text-muted-foreground">
                {logs.map((l, i) => (
                  <div key={i} className="whitespace-pre-wrap">
                    {l}
                  </div>
                ))}
              </div>
            )}
            {results.length ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {results.map((r) => (
                  <div key={r.resultId} className="rounded-2xl border border-border/70 bg-card/30 p-2.5 flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-mono uppercase tracking-[0.18em] text-muted-foreground truncate flex-1">
                        {r.title}
                      </span>
                      {r.status === "brain" && (
                        <span className="inline-flex items-center gap-1 text-[10px] text-[oklch(0.75_0.15_60)]">
                          <Loader2 className="h-3 w-3 animate-spin" /> brain
                        </span>
                      )}
                      {r.status === "image" && (
                        <span className="inline-flex items-center gap-1 text-[10px] text-[oklch(0.75_0.15_60)]">
                          <Loader2 className="h-3 w-3 animate-spin" /> image
                        </span>
                      )}
                      {r.status === "done" && (
                        <span className="inline-flex items-center gap-1 text-[10px] text-[oklch(0.75_0.18_150)]">
                          <CheckIcon className="h-3 w-3" /> done
                        </span>
                      )}
                      {r.status === "err" && (
                        <span className="inline-flex items-center gap-1 text-[10px] text-destructive" title={r.error}>
                          <AlertCircle className="h-3 w-3" /> error
                        </span>
                      )}
                    </div>
                    <div
                      className="w-full overflow-hidden rounded-xl bg-black/40 grid place-items-center"
                      style={{ aspectRatio: ratioToAspect(r.ratio ?? ratio) }}
                    >
                      {r.imgUrl ? (
                        <img src={r.imgUrl} alt={r.title} className="h-full w-full object-cover" />
                      ) : r.status === "err" ? (
                        <div className="text-[11px] text-destructive p-3 text-center">{r.error}</div>
                      ) : (
                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                      )}
                    </div>
                    {r.imgUrl && r.status === "done" && (
                      <div className="flex gap-2">
                        <GhostButton
                          className="flex-1 justify-center text-primary hover:text-primary"
                          onClick={() => sendToImageToVideo(r.imgUrl!, r.title)}
                          title="Kirim gambar ini ke Image → Video"
                        >
                          <Video className="h-3.5 w-3.5" /> Generate Video
                        </GhostButton>
                        <a
                          href={r.imgUrl}
                          download={`storyboard-${r.resultId}.png`}
                          className="inline-flex items-center gap-1 rounded-xl border border-border bg-card/50 px-3 py-1.5 text-[11px] text-muted-foreground hover:text-foreground transition"
                          title="Download gambar"
                        >
                          <Download className="h-3.5 w-3.5" />
                        </a>
                      </div>
                    )}
                  </div>

                ))}
              </div>
            ) : (
              <GalleryEmpty />
            )}
          </Card>
        </div>

      </div>
    </DashboardShell>
  );
}

function ProductRowCard({
  index,
  row,
  canRemove,
  onUrl,
  onFetch,
  onRemove,
  onToggleImage,
}: {
  index: number;
  row: ProductRow;
  canRemove: boolean;
  onUrl: (v: string) => void;
  onFetch: () => void;
  onRemove: () => void;
  onToggleImage: (url: string) => void;
}) {
  const images = useMemo(() => (row.info?.images ?? []).slice(0, 6), [row.info]);

  return (
    <div className="rounded-2xl border border-border/70 bg-card/30 p-3 flex flex-col gap-2 min-w-0">
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-mono uppercase tracking-[0.18em] text-muted-foreground">
          #{index + 1}
        </span>
        <StatusBadge status={row.status} error={row.error} />
        <span className="flex-1" />
        <button
          onClick={onFetch}
          disabled={row.status === "loading"}
          className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] text-primary-foreground disabled:opacity-50"
          style={{ background: "var(--gradient-neon)" }}
          title="Scrape URL"
        >
          {row.status === "loading" ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Search className="h-3.5 w-3.5" />
          )}
          Scrape
        </button>
        <button
          onClick={onRemove}
          disabled={!canRemove}
          className="inline-flex items-center gap-1 rounded-full border border-border bg-card/50 px-2.5 py-1 text-[11px] text-muted-foreground hover:text-destructive hover:border-destructive/50 transition disabled:opacity-40"
          title="Hapus baris"
        >
          <X className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Hapus</span>

        </button>
      </div>

      <input
        type="url"
        value={row.url}
        onChange={(e) => onUrl(e.target.value)}
        placeholder="https://..."
        className="w-full rounded-xl border border-border bg-card/50 px-3 py-2 text-xs outline-none placeholder:text-muted-foreground/70 focus:border-primary/60 transition truncate"
      />

      {row.info ? (
        <div className="rounded-xl border border-border/70 bg-card/40 p-2.5">
          <div className="text-xs font-semibold text-foreground/95 line-clamp-2">
            {row.info.title || "(tanpa judul)"}
          </div>
          {row.info.description && (
            <div className="text-[11px] text-muted-foreground line-clamp-3 mt-1">
              {row.info.description}
            </div>
          )}
          {images.length > 0 ? (
            <div className="grid grid-cols-3 gap-1 mt-2">
              {images.map((u, i) => {
                const sel = row.selectedImages.includes(u);
                const px = `/api/public/proxy-image?url=${encodeURIComponent(u)}`;
                return (
                  <button
                    key={i}
                    onClick={() => onToggleImage(u)}
                    className={
                      "relative aspect-square overflow-hidden rounded-lg bg-black/40 transition border-2 " +
                      (sel ? "border-primary" : "border-transparent hover:border-border")
                    }
                  >
                    <img
                      src={px}
                      alt=""
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).src = u;
                      }}
                      className="h-full w-full object-cover"
                    />
                    {sel && (
                      <span className="absolute top-0.5 right-0.5 h-4 w-4 rounded-full grid place-items-center text-[8px] font-bold text-primary-foreground"
                        style={{ background: "var(--gradient-neon)" }}>
                        <CheckIcon className="h-2.5 w-2.5" />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="text-[11px] text-muted-foreground mt-1.5">
              (tidak ada gambar)
            </div>
          )}
        </div>
      ) : (
        <div className="text-[11px] text-muted-foreground text-center py-2">
          Belum di-scrape
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status, error }: { status: ProductRow["status"]; error: string }) {
  if (status === "ok")
    return (
      <span className="inline-flex items-center gap-1 text-[10px] text-[oklch(0.75_0.18_150)]">
        <CheckIcon className="h-3 w-3" /> OK
      </span>
    );
  if (status === "loading") return null;

  if (status === "err")
    return (
      <span
        className="inline-flex items-center gap-1 text-[10px] text-destructive"
        title={error}
      >
        <AlertCircle className="h-3 w-3" /> error
      </span>
    );
  return <span className="text-[10px] text-muted-foreground">idle</span>;
}
