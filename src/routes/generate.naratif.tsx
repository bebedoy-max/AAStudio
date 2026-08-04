import { GenMetaTable } from "@/components/generate/gen-meta-bar";
import { createFileRoute } from "@tanstack/react-router";
import { withKeyGuard } from "@/components/brain/key-guard";
import { LEONARDO_MODEL_CATALOG } from "@/lib/providers/leonardo-router";
import { LEONARDO_VIDEO_MODELS, leonardoVideoQualityOptions } from "@/lib/providers/leonardo-video";
import { useEffect, useMemo, useRef, useState } from "react";
import { logGenerate } from "@/lib/activity/log";
import { Rocket, Play, Pause, ClipboardPaste, Sparkles, Film, Merge, RefreshCw, Loader2, Activity, Search, Star, X, Trash2, Download, ChevronRight } from "lucide-react";
import { DashboardShell, PageHero } from "@/components/dashboard/shell";
import { Field, Select, Textarea, Input, Card, PrimaryButton, GhostButton } from "@/components/dashboard/ui";
import { useSticky } from "@/lib/stores/use-sticky";
import { consumeHandoff } from "@/lib/creative/handoff";
import { ProviderActivePill } from "@/components/routing/quick-routing-dialog";
import { SubtitleDesigner } from "@/components/generate/subtitle-designer";
import { readProviderCredit } from "@/lib/providers/credit-summary";
import { useCloudGallery } from "@/lib/cloud/gallery";
import { uploadFileToCloud } from "@/lib/cloud/client";
import { downloadFilesAsZip } from "@/lib/utils/download-zip";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";

import {
  DEFAULT_SUB_CONFIG,
  buildAss,
  findSubFont,
  narrationToCues,
  type SubtitleConfig,
} from "@/lib/subtitle/styles";
import {
  BacksoundFavoritesDialog,
  FavoriteHeart,
  useBacksoundFavorites,
} from "@/components/generate/backsound-favorites";


function ratioClass(r: string): string {
  if (r.startsWith("9:16")) return "aspect-[9/16]";
  if (r.startsWith("1:1")) return "aspect-square";
  return "aspect-video";
}

function extractFirstUrl(text: string): string {
  const match = text.match(/https?:\/\/[^\s<>"]+/i);
  return (match?.[0] ?? text).trim();
}

const NO_TEXT_GUARD = "no text, no words, no captions, no typography, no logos, no watermarks, no subtitles anywhere in the image or during motion";
function withNoTextGuard(prompt: string): string {
  const p = (prompt || "").trim();
  if (/no\s+text/i.test(p)) return p;
  return `${p}${p.endsWith(".") ? "" : "."} ${NO_TEXT_GUARD}.`;
}

export const Route = createFileRoute("/generate/naratif")({
  head: () => ({
    meta: [
      { title: "Naratif Video Maker — AA Creative Studio" },
      { name: "description", content: "Link artikel → scrape → Brain → gambar per scene → voice-over → gabung jadi video naratif." },
    ],
  }),
  component: withKeyGuard(NaratifPage, ["brain", "eleven"]),
});

// ============ Model Catalog (mirror legacy MODEL_CATALOG structure) ============
type Provider = "weavy" | "wavespeed" | "magnific" | "roboneo" | "framia" | "leonardo";
type Quality = { v: string; label: string; cr: number; default?: boolean };
type ModelDef = { key: string; label: string; qualities: Quality[] };

// Image models: match storyboard/bulk-fashion legacy pricing.
const IMG_CATALOG: Record<Provider, ModelDef[]> = {
  weavy: [
    { key: "gptimage2", label: "Image GPT 2 (Weavy)", qualities: [
      { v: "low", label: "Low (~15 cr)", cr: 15 },
      { v: "medium", label: "Medium (~36 cr)", cr: 36, default: true },
      { v: "high", label: "High (~60 cr)", cr: 60 },
    ] },
    { key: "nanobanana2", label: "Gemini Nano Banana 2 (Weavy)", qualities: [
      { v: "0.5K", label: "0.5K (4.5 cr)", cr: 4.5 },
      { v: "1K", label: "1K (6 cr)", cr: 6, default: true },
      { v: "2K", label: "2K (9 cr)", cr: 9 },
      { v: "4K", label: "4K (12 cr)", cr: 12 },
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
  roboneo: [
    { key: "nanobanana2", label: "Gemini Nano Banana 2 (via Weavy fallback)", qualities: [
      { v: "1K", label: "1K (6 cr)", cr: 6, default: true },
    ] },
  ],
  framia: [
    { key: "framia:nano-banana-lite", label: "Nano Banana Lite (Framia)", qualities: [
      { v: "1K", label: "1K (~1 cr)", cr: 1, default: true },
      { v: "2K", label: "2K (~2 cr)", cr: 2 },
    ] },
    { key: "framia:nano-banana", label: "Nano Banana (Framia)", qualities: [
      { v: "1K", label: "1K (~2 cr)", cr: 2, default: true },
      { v: "2K", label: "2K (~3 cr)", cr: 3 },
    ] },
    { key: "framia:nano-banana-2", label: "Nano Banana 2 (Framia)", qualities: [
      { v: "1K", label: "1K (~3 cr)", cr: 3, default: true },
      { v: "2K", label: "2K (~4 cr)", cr: 4 },
    ] },
    { key: "framia:nano-banana-pro", label: "Nano Banana Pro (Framia)", qualities: [
      { v: "default", label: "Standard (~5 cr)", cr: 5, default: true },
    ] },
    { key: "framia:gpt-image-2", label: "GPT Image 2 (Framia)", qualities: [
      { v: "2K", label: "2K (~5 cr)", cr: 5, default: true },
      { v: "4K", label: "4K (~8 cr)", cr: 8 },
    ] },
    { key: "framia:seedream-4", label: "Seedream 4.0 (Framia)", qualities: [
      { v: "1K", label: "1K (~3 cr)", cr: 3, default: true },
      { v: "2K", label: "2K (~4 cr)", cr: 4 },
    ] },
    { key: "framia:seedream-4-5", label: "Seedream 4.5 (Framia)", qualities: [
      { v: "1K", label: "1K (~3 cr)", cr: 3, default: true },
      { v: "2K", label: "2K (~4 cr)", cr: 4 },
    ] },
    { key: "framia:seedream-5", label: "Seedream 5 (Framia)", qualities: [
      { v: "1K", label: "1K (~4 cr)", cr: 4, default: true },
      { v: "2K", label: "2K (~5 cr)", cr: 5 },
    ] },
    { key: "framia:seedream-5-pro", label: "Seedream 5 Pro (Framia)", qualities: [
      { v: "1K", label: "1K (~4 cr)", cr: 4, default: true },
      { v: "2K", label: "2K (~5 cr)", cr: 5 },
    ] },
    { key: "framia:flux-1.1-pro", label: "Flux 1.1 Pro (Framia)", qualities: [
      { v: "default", label: "Standard (~3 cr)", cr: 3, default: true },
    ] },
    { key: "framia:flux-max", label: "Flux Max (Framia)", qualities: [
      { v: "default", label: "Standard (~6 cr)", cr: 6, default: true },
    ] },
  ],
  leonardo: LEONARDO_MODEL_CATALOG.map((m) => ({ ...m, qualities: [...m.qualities] })),
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
  roboneo: [
    { key: "rn:seedance-pro", label: "Seedance Pro (Roboneo)", qualities: [
      { v: "720p-5s",  label: "720p · 5s (kuota)",  cr: 0, default: true },
      { v: "720p-10s", label: "720p · 10s (kuota)", cr: 0 },
      { v: "720p-12s", label: "720p · 12s (kuota)", cr: 0 },
      { v: "480p-5s",  label: "480p · 5s (kuota)",  cr: 0 },
      { v: "1080p-5s", label: "1080p · 5s (kuota)", cr: 0 },
    ] },
    { key: "rn:google-omni", label: "Google Omni (Roboneo)", qualities: [
      { v: "5s",  label: "Durasi 5s (kuota)",  cr: 0, default: true },
      { v: "10s", label: "Durasi 10s (kuota)", cr: 0 },
    ] },
    { key: "rn:kling-v26:std", label: "Kling 2.6 (Roboneo)", qualities: [
      { v: "5s-off",  label: "5s · No Sound (kuota)",  cr: 0, default: true },
      { v: "5s-on",   label: "5s · Sound (kuota)",     cr: 0 },
      { v: "10s-off", label: "10s · No Sound (kuota)", cr: 0 },
      { v: "10s-on",  label: "10s · Sound (kuota)",    cr: 0 },
    ] },
  ],
  framia: [
    // Model list from Framia video node (share recipe 8b83c48b70).
    { key: "framia:seedance-2.0", label: "Seedance 2.0 (Framia)", qualities: [
      { v: "720p-5s",  label: "720p · 5s (~45 cr)",  cr: 45, default: true },
      { v: "1080p-5s", label: "1080p · 5s (~65 cr)", cr: 65 },
      { v: "720p-10s", label: "720p · 10s (~90 cr)", cr: 90 },
    ] },
    { key: "framia:seedance-2.0-fast", label: "Seedance 2.0 Fast (Framia)", qualities: [
      { v: "720p-5s",  label: "720p · 5s (~30 cr)",  cr: 30, default: true },
      { v: "720p-10s", label: "720p · 10s (~60 cr)", cr: 60 },
    ] },
    { key: "framia:kling-3.0-omni", label: "Kling 3.0 Omni (Framia)", qualities: [
      { v: "720p-5s",  label: "720p · 5s (~60 cr)",  cr: 60, default: true },
      { v: "1080p-5s", label: "1080p · 5s (~90 cr)", cr: 90 },
    ] },
    { key: "framia:kling-3.0", label: "Kling 3.0 (Framia)", qualities: [
      { v: "720p-5s",  label: "720p · 5s (~50 cr)",  cr: 50, default: true },
      { v: "1080p-5s", label: "1080p · 5s (~75 cr)", cr: 75 },
    ] },
    { key: "framia:veo-3.1", label: "Veo 3.1 (Framia)", qualities: [
      { v: "720p-5s",  label: "720p · 5s (~90 cr)",  cr: 90, default: true },
    ] },
    { key: "framia:veo-3.1-fast", label: "Veo 3.1 Fast (Framia)", qualities: [
      { v: "720p-5s",  label: "720p · 5s (~65 cr)",  cr: 65, default: true },
    ] },
    { key: "framia:wan-2.7", label: "Wan 2.7 (Framia)", qualities: [
      { v: "720p-5s",  label: "720p · 5s (~25 cr)",  cr: 25, default: true },
    ] },
    { key: "framia:gemini-omni-flash", label: "Gemini Omni Flash (Framia)", qualities: [
      { v: "720p-5s",  label: "720p · 5s (~20 cr)",  cr: 20, default: true },
      { v: "720p-10s", label: "720p · 10s (~40 cr)", cr: 40 },
    ] },
    { key: "framia:happyhorse-1.1", label: "HappyHorse 1.1 (Framia)", qualities: [
      { v: "720p-5s",  label: "720p · 5s (~28 cr)",  cr: 28, default: true },
    ] },
    { key: "framia:kling-avatar", label: "Kling Avatar (Framia)", qualities: [
      { v: "720p-5s",  label: "720p · 5s (~40 cr)",  cr: 40, default: true },
    ] },
  ],
  leonardo: LEONARDO_VIDEO_MODELS.map((m) => {
    const opts = leonardoVideoQualityOptions(m.id, "9:16");
    return {
      key: m.id,
      label: `${m.label} (Leonardo${m.audio ? " · Audio" : ""})`,
      qualities: opts.map((o, idx) => ({
        v: o.value,
        label: `${o.label} (${o.cr.toLocaleString("id-ID")} cr)`,
        cr: o.cr,
        ...(idx === 0 ? { default: true as const } : {}),
      })),
    };
  }),
};

const LS_ROUTING = "aatools.routing.v2";
function readRoutedVideoProvider(): Provider | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(LS_ROUTING);
    if (!raw) return null;
    const obj = JSON.parse(raw) as { video?: string };
    const p = obj?.video as Provider | undefined;
    return p && VID_CATALOG[p] ? p : null;
  } catch {
    return null;
  }
}

// Baca provider gambar aktif dari Routing Provider (manage/routing) — cap "image".
function readRoutedImageProvider(): Provider | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(LS_ROUTING);
    if (!raw) return null;
    const obj = JSON.parse(raw) as { image?: string };
    const p = obj?.image as Provider | undefined;
    return p && IMG_CATALOG[p] ? p : null;
  } catch {
    return null;
  }
}

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
  const [imgProvider, setImgProvider] = useSticky<Provider>("naratif.imgProvider", "weavy");
  const [ratio, setRatio] = useSticky<string>("naratif.ratio", "9:16");
  

  const [imgModel, setImgModel] = useSticky<string>("naratif.imgModel", "");
  const [imgQuality, setImgQuality] = useSticky<string>("naratif.imgQuality", "");
  const [vidModel, setVidModel] = useSticky<string>("naratif.vidModel", "");
  const [vidQuality, setVidQuality] = useSticky<string>("naratif.vidQuality", "");

  const [voice, setVoice] = useSticky<string>("naratif.voice", VOICES[0].value);
  const [voicePreset, setVoicePreset] = useSticky<string>("naratif.voicePreset", "story");
  const [extra, setExtra] = useSticky<string>("naratif.extra", "");

  // Merge options (jeda + transisi antar scene)
  const [sceneGap, setSceneGap] = useSticky<number>("naratif.sceneGap", 0.7);
  const [xfadeDur, setXfadeDur] = useSticky<number>("naratif.xfadeDur", 0.5);
  const [leadOutDur, setLeadOutDur] = useSticky<number>("naratif.leadOutDur", 0.4);

  // Backsound (background music) options
  type BgTrack = { title: string; url: string; duration: number };
  const [bgMood, setBgMood] = useSticky<string>("naratif.bgMood", "cinematic");
  const [bgVol, setBgVol] = useSticky<number>("naratif.bgVol", 0.30);
  const [bgTrack, setBgTrack] = useSticky<BgTrack | null>("naratif.bgTrack", null);
  const [bgLibrary, setBgLibrary] = useState<BgTrack[]>([]);
  const [bgLoading, setBgLoading] = useState(false);
  const [bgUploadName, setBgUploadName] = useSticky<string>("naratif.bgUploadName", "");
  const bgAudioRef = useRef<HTMLAudioElement | null>(null);
  const [bgPlayingUrl, setBgPlayingUrl] = useState<string | null>(null);

  const [bgSource, setBgSource] = useSticky<"none" | "library" | "upload">("naratif.bgSource", "none");
  const [bgQuery, setBgQuery] = useSticky<string>("naratif.bgQuery", "");
  const [bgFavOpen, setBgFavOpen] = useState(false);
  const bgFav = useBacksoundFavorites();

  const BG_MOODS: Array<{ key: string; label: string }> = [
    { key: "cinematic", label: "🎬 Cinematic" },
    { key: "dark-cinematic", label: "🌑 Dark Cinematic" },
    { key: "horror", label: "👻 Horror" },
    { key: "inspiration", label: "✨ Inspirational" },
    { key: "comedy", label: "😄 Comedy / Fun" },
    { key: "upbeat", label: "⚡ Upbeat / Energetic" },
    { key: "documentary", label: "📽️ Documentary" },
    { key: "epic", label: "🥁 Epic Trailer" },
    { key: "lofi", label: "🎧 Lo-Fi Chill" },
    { key: "ambient", label: "🌫️ Ambient" },
    { key: "acoustic", label: "🎸 Acoustic" },
    { key: "electronic", label: "🛸 Electronic" },
    { key: "hiphop", label: "🎤 Hip-Hop Beat" },
    { key: "emotional", label: "💔 Emotional" },
    { key: "corporate", label: "💼 Corporate" },
    { key: "travel", label: "🌴 Travel / Vlog" },
  ];

  const loadBgLibrary = async (mood: string, query?: string): Promise<BgTrack[]> => {
    setBgLoading(true);
    try {
      const qs = query && query.trim()
        ? `q=${encodeURIComponent(query.trim())}`
        : `mood=${encodeURIComponent(mood)}`;
      const r = await fetch(`/api/public/backsound-search?${qs}`);
      const j = await r.json();
      const tracks: BgTrack[] = Array.isArray(j.tracks) ? j.tracks : [];
      setBgLibrary(tracks);
      return tracks;
    } catch {
      setBgLibrary([]);
      return [];
    } finally {
      setBgLoading(false);
    }
  };

  const stopPreview = () => {
    bgAudioRef.current?.pause();
    bgAudioRef.current = null;
    setBgPlayingUrl(null);
  };

  const playPreview = (url: string) => {
    if (bgPlayingUrl === url) { stopPreview(); return; }
    bgAudioRef.current?.pause();
    const a = new Audio(url);
    a.volume = 0.85;
    a.onended = () => { setBgPlayingUrl(null); };
    bgAudioRef.current = a;
    setBgPlayingUrl(url);
    void a.play().catch(() => { setBgPlayingUrl(null); });
  };

  const pickBgTrack = (t: BgTrack) => {
    setBgTrack(t);
    setBgSource("library");
    setBgUploadName("");
  };

  const shuffleBgTrack = async () => {
    let list = bgLibrary;
    if (!list.length) list = await loadBgLibrary(bgMood, bgQuery);
    if (!list.length) return;
    const t = list[Math.floor(Math.random() * list.length)];
    pickBgTrack(t);
    playPreview(t.url);
  };

  const onBgUpload = async (file: File | null) => {
    if (!file) return;
    const buf = await file.arrayBuffer();
    const blob = new Blob([buf], { type: file.type || "audio/mpeg" });
    const url = URL.createObjectURL(blob);
    setBgTrack({ title: file.name, url, duration: 0 });
    setBgSource("upload");
    setBgUploadName(file.name);
    stopPreview();
  };

  const clearBg = () => {
    stopPreview();
    setBgTrack(null);
    setBgSource("none");
    setBgUploadName("");
  };


  // Panel collapse (default tertutup)
  const [subOpen, setSubOpen] = useState(false);
  const [bgOpen, setBgOpen] = useState(false);
  const toggleBgPanel = async () => {
    if (bgOpen) { setBgOpen(false); stopPreview(); return; }
    setBgOpen(true);
    if (bgTrack) return;
    const favs = bgFav.items;
    if (favs.length) {
      const f = favs[Math.floor(Math.random() * favs.length)];
      pickBgTrack({ title: f.title, url: f.url, duration: f.duration || 0 });
      playPreview(f.url);
      return;
    }
    const list = await loadBgLibrary("cinematic");
    if (!list.length) return;
    const t = list[Math.floor(Math.random() * list.length)];
    pickBgTrack(t);
    playPreview(t.url);
  };

  // Subtitle burn-in options (default: aktif)
  const [subEnable, setSubEnable] = useSticky<boolean>("naratif.subEnable", true);
  const [subCfg, setSubCfg] = useSticky<SubtitleConfig>("naratif.subCfg", DEFAULT_SUB_CONFIG);

  const [brainStatus, setBrainStatus] = useSticky<string>("naratif.brainStatus", "");
  const [brainBusy, setBrainBusy] = useState(false);
  const [scenes, setScenes] = useSticky<Scene[]>("naratif.scenes", []);
  const [mergeStatus, setMergeStatus] = useSticky<string>("naratif.mergeStatus", "");
  const [bulkLogs, setBulkLogs] = useSticky<string[]>("naratif.bulkLogs", []);
  const [bulkPct, setBulkPct] = useSticky<number>("naratif.bulkPct", 0);
  const pushBulkLog = (s: string) =>
    setBulkLogs((prev) => [`[${new Date().toLocaleTimeString()}] ${s}`, ...prev].slice(0, 200));
  const setPct = (p: number) => setBulkPct(Math.max(0, Math.min(100, p)));
  const [finalUrl, setFinalUrl] = useSticky<string | null>("naratif.finalUrl", null);
  const [testingVoice, setTestingVoice] = useSticky<boolean>("naratif.testingVoice", false);

  // Voice intonation preset → ElevenLabs voice_settings
  const VOICE_PRESETS: Record<string, { label: string; stability: number; similarityBoost: number; style: number; speed: number }> = {
    story:     { label: "Bercerita (Natural)",   stability: 0.45, similarityBoost: 0.80, style: 0.55, speed: 0.95 },
    news:      { label: "Berita (Formal)",        stability: 0.65, similarityBoost: 0.80, style: 0.25, speed: 1.00 },
    casual:    { label: "Santai (Casual)",        stability: 0.40, similarityBoost: 0.75, style: 0.65, speed: 1.02 },
    cinematic: { label: "Dramatis (Sinematik)",   stability: 0.35, similarityBoost: 0.85, style: 0.80, speed: 0.92 },
  };
  const activeVoiceSettings = VOICE_PRESETS[voicePreset] || VOICE_PRESETS.story;
  // Enrich narration → tambahkan koma/titik ringan agar TTS punya jeda natural
  const enrichNarration = (text: string): string => {
    let t = (text || "").trim();
    if (!t) return t;
    if (!/[.!?…]$/.test(t)) t += ".";
    // sisipkan koma setelah konjungsi umum agar ada micro-pause
    t = t.replace(/\s+(namun|tetapi|karena|sehingga|meskipun|walaupun|kemudian|lalu|selain itu|padahal)\s+/gi, ", $1 ");
    return t;
  };
  const [bulkBusy, setBulkBusy] = useState<BulkBusy>(EMPTY_BUSY);
  const anyBusy = bulkBusy.img || bulkBusy.vo || bulkBusy.vid || bulkBusy.merge;
  const setBusy = (k: BulkKind, v: boolean) => setBulkBusy((prev) => ({ ...prev, [k]: v }));
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const bootstrappedRef = useRef(false);
  const scenesRef = useRef<Scene[]>(scenes);
  useEffect(() => {
    scenesRef.current = scenes;
  }, [scenes]);
  const [perSceneBusy, setPerSceneBusy] = useState(false);
  const allScenesReady =
    scenes.length > 0 && scenes.every((s) => !!s.imgUrl && !!s.videoUrl && !!s.audioUrl);
  const scenesSectionRef = useRef<HTMLDivElement | null>(null);
  const [tokenAlert, setTokenAlert] = useState<string[] | null>(null);
  const gallery = useCloudGallery<Record<string, unknown>>("naratif", "video");
  const [zipBusy, setZipBusy] = useState(false);
  const downloadGalleryZip = async () => {
    if (zipBusy || gallery.items.length === 0) return;
    setZipBusy(true);
    try {
      await downloadFilesAsZip(
        gallery.items.map((it, i) => ({ url: it.url, filename: it.name || `naratif-${i + 1}.mp4` })),
        `naratif-gallery-${Date.now()}.zip`,
      );
    } finally {
      setZipBusy(false);
    }
  };


  const imgModels = IMG_CATALOG[imgProvider] || IMG_CATALOG.weavy;
  const vidModels = VID_CATALOG[provider] || VID_CATALOG.weavy;
  const activeImgModel = useMemo(() => imgModels.find((m) => m.key === imgModel) || imgModels[0], [imgModels, imgModel]);
  const activeVidModel = useMemo(() => vidModels.find((m) => m.key === vidModel) || vidModels[0], [vidModels, vidModel]);

  // init provider & defaults — hanya sekali dan hanya jika belum diset
  useEffect(() => {
    if (bootstrappedRef.current) return;
    bootstrappedRef.current = true;
    const routed = readRoutedVideoProvider();
    if (routed) {
      setProvider(routed);
    } else if (!provider || !IMG_CATALOG[provider]) {
      const p = ((typeof window !== "undefined" && (localStorage.getItem("aatools.activeProvider") || localStorage.getItem("arkx_activeProvider"))) || "weavy") as Provider;
      setProvider(IMG_CATALOG[p] ? p : "weavy");
    }
    const routedImg = readRoutedImageProvider();
    if (routedImg) {
      setImgProvider(routedImg);
    } else if (!imgProvider || !IMG_CATALOG[imgProvider]) {
      setImgProvider("weavy");
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
      // Reset semua hasil analisa lama supaya materi/extra prompt/scenes tidak
      // bercampur dengan konten sebelumnya.
      setScenes([]);
      setBrainStatus("");
      setMergeStatus("");
      setFinalUrl(null);
      setExtra("");
      setMaterial(null);
      if (h.sourceUrl) {
        const src = h.sourceUrl;
        setUrl(src);
        if (h.autoScrape) {
          setTimeout(() => { void scrapeRef.current?.(src); }, 0);
        }
      } else {
        const body = [h.hook, h.description].filter(Boolean).join("\n\n");
        setMaterial({
          title: h.title || "",
          desc: h.description || h.hook || "",
          body: body || h.title || "",
        });
        const seed = [h.title, h.hook, h.description].filter(Boolean).join(" — ");
        if (seed) setExtra(seed);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sinkron dengan Routing Provider (menu Kelola Routing) untuk cap "video".
  useEffect(() => {
    const sync = () => {
      const routed = readRoutedVideoProvider();
      if (routed && routed !== provider) setProvider(routed);
      const routedImg = readRoutedImageProvider();
      if (routedImg && routedImg !== imgProvider) setImgProvider(routedImg);
    };
    window.addEventListener("storage", sync);
    window.addEventListener("focus", sync);
    window.addEventListener("aatools:routing-changed", sync as EventListener);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener("focus", sync);
      window.removeEventListener("aatools:routing-changed", sync as EventListener);
    };
  }, [provider, setProvider, imgProvider, setImgProvider]);

  // ketika provider berubah, reset pilihan model HANYA jika model saat ini tidak valid
  useEffect(() => {
    const list = IMG_CATALOG[imgProvider] || [];
    if (!list.find((m) => m.key === imgModel)) setImgModel(list[0]?.key || "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imgProvider]);
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
  }, [activeImgModel, imgQuality]);
  useEffect(() => {
    if (!activeVidModel) return;
    if (!activeVidModel.qualities.find((q) => q.v === vidQuality)) {
      const def = activeVidModel.qualities.find((q) => q.default) ?? activeVidModel.qualities[0];
      setVidQuality(def?.v ?? "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeVidModel, vidQuality]);

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
        body: JSON.stringify({ text: "Halo, ini contoh suara narator untuk video naratif kamu.", voiceId: voice, ...activeVoiceSettings }),
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
    // Materi baru → reset hasil analisa/scene/video final sebelumnya supaya
    // Extra Prompt & scene tidak tercampur dengan riset lama.
    setScenes([]);
    setBrainStatus("");
    setMergeStatus("");
    setFinalUrl(null);
    setExtra("");
    setMaterial(null);
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
      // Seed extra prompt dari materi baru — bukan sisa research lama.
      const seed = [j.title, j.description].filter(Boolean).join(" — ");
      if (seed) setExtra(seed);
      setScrapeStatus(`✅ Materi terambil${images.length ? ` (${images.length} gambar)` : " (0 gambar — cek URL)"}`);
    } catch (e) {
      setScrapeStatus("❌ " + ((e as Error).message || String(e)));
    } finally {
      setScraping(false);
    }
  };
  scrapeRef.current = scrape;

  const pasteAndScrape = async () => {
    try {
      const pasted = extractFirstUrl(await navigator.clipboard.readText());
      if (!/^https?:\/\//i.test(pasted)) {
        setScrapeStatus("❌ Clipboard tidak berisi URL valid");
        return;
      }
      setUrl(pasted);
      await scrape(pasted);
    } catch (e) {
      setScrapeStatus("❌ " + ((e as Error).message || "Browser menolak akses clipboard"));
    }
  };


  const runBrain = async () => {
    if (!material || brainBusy) return;
    setBrainBusy(true);
    setBrainStatus(`Brain menganalisa & menyusun scene…`);
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
        body: JSON.stringify({ title: material.title, description: material.desc, body: material.body, aspectRatio: ratio, extraPrompt: extra }),
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
      setTimeout(() => {
        scenesSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 250);

    } catch (e) {
      setBrainStatus("❌ " + ((e as Error).message || String(e)));
    } finally {
      setBrainBusy(false);
    }
  };

  const patchScene = (i: number, patch: Partial<Scene>) => {
    setScenes((prev) => prev.map((p, idx) => (idx === i ? { ...p, ...patch } : p)));
  };

  const genImageAt = async (i: number): Promise<void> => {
    const scene = scenesRef.current[i] ?? scenes[i];
    if (!scene) return;
    patchScene(i, { busy: "img" });
    try {
      let imgUrl: string;
      if (imgProvider === "weavy") {
        const { generateWeavyImage } = await import("@/lib/providers/weavy-image");
        imgUrl = await generateWeavyImage({ modelKey: imgModel, prompt: withNoTextGuard(scene.prompt), quality: imgQuality, ratio });
      } else if (imgProvider === "framia") {
        const { generateFramiaImage } = await import("@/lib/providers/framia-image");
        imgUrl = await generateFramiaImage({
          modelKey: imgModel,
          prompt: withNoTextGuard(scene.prompt),
          aspectRatio: ratio,
          resolution: imgQuality,
        });
      } else if (imgProvider === "leonardo") {
        const { generateLeonardoOne } = await import("@/lib/providers/leonardo-router");
        imgUrl = await generateLeonardoOne({
          modelKey: imgModel,
          prompt: withNoTextGuard(scene.prompt),
          ratio,
          quality: imgQuality,
        });
      } else {
        const { getFirstWavespeedKey, wsPost, wsPoll, WAVESPEED_API } = await import("@/lib/providers/wavespeed");
        const key = getFirstWavespeedKey();
        if (!key) throw new Error(`Belum ada Wavespeed API key di Kelola Token (provider aktif: ${imgProvider})`);
        const modelId = mapImgToWsEndpoint(imgModel);
        const payload: Record<string, unknown> = { prompt: withNoTextGuard(scene.prompt), aspect_ratio: ratio };
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
    const scene = scenesRef.current[i] ?? scenes[i];
    if (!scene) return;
    patchScene(i, { busy: "vo" });
    try {
      const eleven = JSON.parse(localStorage.getItem("aatools.eleven") || "{}");
      const key = eleven?.keys?.[0];
      if (!key) throw new Error("Belum ada ElevenLabs API key");
      const r = await fetch("/api/public/elevenlabs-tts", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Eleven-Key": key },
        body: JSON.stringify({ text: enrichNarration(scene.narration), voiceId: voice, ...activeVoiceSettings }),
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
      // Refresh saldo ElevenLabs & auto-prune key yang credit-nya sudah di bawah minimum.
      const { notifyGenerationDone } = await import("@/lib/tokens/refresh");
      notifyGenerationDone("eleven");
    } catch (e) {
      patchScene(i, { busy: null });
      throw e;
    }
  };

  // Parse encoded Roboneo quality string (e.g. "720p-10s", "5s-on") ke
  // duration + resolution + sound sesuai schema recipe.
  const parseVidQuality = (
    q: string,
  ): { duration: number; resolution?: string; sound?: "on" | "off" } => {
    const s = (q || "").toLowerCase();
    const durMatch = s.match(/(\d+)s/);
    const resMatch = s.match(/(\d{3,4}p)/);
    const soundMatch = s.match(/-(on|off)/);
    return {
      duration: durMatch ? Number(durMatch[1]) : 5,
      resolution: resMatch ? resMatch[1] : undefined,
      sound: soundMatch ? (soundMatch[1] as "on" | "off") : undefined,
    };
  };

  const genVideoAt = async (i: number): Promise<void> => {
    const scene = scenesRef.current[i] ?? scenes[i];
    if (!scene?.imgUrl) throw new Error(`Scene #${i + 1} belum ada gambar`);
    patchScene(i, { busy: "vid" });
    try {
      const { generateI2V } = await import("@/lib/providers/generate-i2v");
      const imgResp = await fetch(scene.imgUrl);
      const imgFile = new File([await imgResp.blob()], `scene_${i}.jpg`, { type: "image/jpeg" });
      const q = parseVidQuality(vidQuality);
      const leoTier =
        provider === "leonardo" ? (vidQuality || "").split("-")[0] || undefined : undefined;
      const videoUrl = await generateI2V({
        provider,
        modelKey: vidModel,
        imageFile: imgFile,
        ratio,
        duration: q.duration,
        resolution: q.resolution,
        sizeTier: leoTier,
        sound: q.sound,
        prompt: withNoTextGuard(scene.videoPrompt || scene.prompt),
      });
      patchScene(i, { videoUrl, busy: null });
    } catch (e) {
      patchScene(i, { busy: null });
      throw e;
    }
  };


  // ---- Pipeline "Generate Video Perscene": image → video → voice-over ----
  const FATAL_RE = /(token|credit|kredit|saldo|insufficient|habis|quota|unauthor|forbidden|401|402|403)/i;

  const runPhase = async (
    label: string,
    kind: BulkKind,
    pending: () => number[],
    fn: (i: number) => Promise<void>,
  ): Promise<void> => {
    const maxRounds = 4;
    setBusy(kind, true);
    try {
      for (let round = 1; round <= maxRounds; round++) {
        const idxs = pending();
        if (!idxs.length) return;
        setBrainStatus(`${label} — ronde ${round} (${idxs.length} scene)`);
        pushBulkLog(`🚀 ${label} · ronde ${round} · ${idxs.length} scene paralel`);
        const results = await Promise.allSettled(
          idxs.map((i) =>
            fn(i)
              .then(() => pushBulkLog(`✅ ${label} scene #${i + 1} selesai`))
              .catch((e) => {
                pushBulkLog(`❌ ${label} scene #${i + 1} gagal: ${(e as Error).message || e}`);
                throw e;
              }),
          ),
        );
        const failed = results.filter((r) => r.status === "rejected") as PromiseRejectedResult[];
        if (!failed.length) return;
        const firstMsg = (failed[0].reason as Error)?.message || String(failed[0].reason);
        if (FATAL_RE.test(firstMsg)) throw new Error(`${label} dihentikan · ${firstMsg}`);
        if (round === maxRounds) throw new Error(`${label} gagal setelah ${maxRounds} ronde · ${firstMsg}`);
        pushBulkLog(`🔁 ${failed.length} scene gagal — mengulang…`);
        await new Promise((r) => setTimeout(r, 1500));
      }
    } finally {
      setBusy(kind, false);
    }
  };

  const checkProviderTokens = (): string[] => {
    const targets: { label: string; provider: string }[] = [
      { label: `Image · ${imgProvider}`, provider: imgProvider },
      { label: `Video · ${provider}`, provider },
      { label: "Voice-Over · ElevenLabs", provider: "eleven" },
    ];
    const seen = new Set<string>();
    const problems: string[] = [];
    for (const t of targets) {
      if (seen.has(t.provider)) continue;
      seen.add(t.provider);
      const { tokens, credits } = readProviderCredit(t.provider);
      if (tokens <= 0) problems.push(`${t.label}: belum ada token di Token Manager`);
      else if (credits != null && credits <= 0) problems.push(`${t.label}: credit habis (${credits})`);
    }
    return problems;
  };

  const runPerScene = async () => {
    if (perSceneBusy || anyBusy) return;
    const problems = checkProviderTokens();
    if (problems.length) {
      setTokenAlert(problems);
      pushBulkLog(`⛔ Proses dibatalkan · ${problems.join(" | ")}`);
      return;
    }
    setPerSceneBusy(true);
    setPct(2);
    pushBulkLog(`🎬 Mulai Generate Video Perscene · ${scenes.length} scene`);
    try {

      await runPhase("🖼️ Gambar", "img", () =>
        scenesRef.current.map((s, i) => (s.imgUrl ? -1 : i)).filter((i) => i >= 0),
        genImageAt,
      );
      setPct(40);
      await runPhase("🎬 Image→Video", "vid", () =>
        scenesRef.current.map((s, i) => (s.videoUrl ? -1 : i)).filter((i) => i >= 0),
        genVideoAt,
      );
      setPct(75);
      await runPhase("🎙️ Voice-Over", "vo", () =>
        scenesRef.current.map((s, i) => (s.audioUrl ? -1 : i)).filter((i) => i >= 0),
        genVOAt,
      );
      setPct(100);
      setBrainStatus("✅ Semua scene siap (gambar, video, voice-over)");
      pushBulkLog("🏁 Semua scene selesai — gambar, video, dan voice-over lengkap");
    } catch (e) {
      const msg = (e as Error).message || String(e);
      setBrainStatus("❌ " + msg);
      pushBulkLog(`❌ ${msg}`);
    } finally {
      setPerSceneBusy(false);
    }
  };

  const getMediaDuration = (url: string, kind: "audio" | "video"): Promise<number> =>

    new Promise((resolve, reject) => {
      const el = document.createElement(kind);
      el.preload = "metadata";
      el.muted = true;
      el.src = url;
      const done = () => {
        const d = el.duration;
        if (!isFinite(d) || d <= 0) reject(new Error("Durasi media tidak valid"));
        else resolve(d);
      };
      el.onloadedmetadata = done;
      el.onerror = () => reject(new Error("Gagal load metadata media"));
      setTimeout(() => reject(new Error("Timeout baca durasi")), 15000);
    });

  const merge = async () => {
    if (bulkBusy.merge) return;
    setBusy("merge", true);
    setMergeStatus("⏳ Menyiapkan FFmpeg…");
    pushBulkLog(`🧵 Mulai gabung ${scenes.length} scene jadi video naratif`);
    setPct(2);
    setFinalUrl(null);
    try {
      const { getFfmpeg } = await import("@/lib/mixing/ffmpeg-render");
      const { fetchFile } = await import("@ffmpeg/util");
      const ff = await getFfmpeg((m) => { if (/error|failed/i.test(m)) console.warn("[ffmpeg]", m); });

      const targetW = ratio.startsWith("9:16") ? 720 : ratio.startsWith("1:1") ? 720 : 1280;
      const targetH = ratio.startsWith("9:16") ? 1280 : ratio.startsWith("1:1") ? 720 : 720;
      const scaleVf = `scale=${targetW}:${targetH}:force_original_aspect_ratio=increase,crop=${targetW}:${targetH},setsar=1,fps=30`;
      const XFADE = Math.max(0.1, Math.min(1.5, Number(xfadeDur) || 0.5));
      const GAP = Math.max(0, Math.min(4, Number(sceneGap) || 0));
      const TAIL_LAST = Math.max(0, Math.min(4, Number(leadOutDur) || 0));
      const burnSubs = !!subEnable;
      const subFont = findSubFont(subCfg.font);

      // Preload font TTF supaya libass punya font untuk render subtitle
      // (ffmpeg.wasm tidak ship font sistem; tanpa ini subtitle tidak muncul).
      if (burnSubs) {
        try {
          setMergeStatus("🔤 Memuat font untuk subtitle…");
          pushBulkLog(`🔤 Memuat font ${subFont.label} untuk subtitle…`);
          const fontResp = await fetch(subFont.url);
          if (fontResp.ok) {
            const buf = new Uint8Array(await fontResp.arrayBuffer());
            await ff.writeFile(subFont.file, buf);
            pushBulkLog(`✅ Font subtitle siap (${(buf.byteLength / 1024).toFixed(0)} KB)`);
          } else {
            pushBulkLog(`⚠️ Font gagal dimuat (HTTP ${fontResp.status}); subtitle mungkin tidak tampil`);
          }
        } catch (fe) {
          pushBulkLog(`⚠️ Font gagal dimuat: ${(fe as Error).message}; subtitle mungkin tidak tampil`);
        }
      }

      const parts: string[] = [];
      const durs: number[] = [];
      const subFilesToClean: string[] = [];
      for (let i = 0; i < scenes.length; i++) {
        const s = scenes[i];
        if (!s.videoUrl || !s.audioUrl) throw new Error(`Scene #${i + 1} belum lengkap`);
        setMergeStatus(`🎬 Mux scene ${i + 1}/${scenes.length}…`);
        pushBulkLog(`🎬 Mux scene ${i + 1}/${scenes.length}…`);
        setPct(5 + Math.round((i / scenes.length) * 70));

        const [aDur, vDur] = await Promise.all([
          getMediaDuration(s.audioUrl, "audio"),
          getMediaDuration(s.videoUrl, "video"),
        ]);
        // Target scene duration = audio (VO) duration
        const voDur = Math.max(0.5, aDur);
        // setpts factor: >1 slows video down (video shorter than VO), <1 speeds up (video longer)
        const ptsFactor = voDur / vDur;
        // Tail padding: jeda antar scene (freeze frame + silence) — last scene pakai leadOut
        const isLast = i === scenes.length - 1;
        const tailPad = isLast ? TAIL_LAST : GAP;
        // Untuk crossfade halus, video butuh material di area transisi.
        // Padding minimum >= XFADE agar xfade tidak nge-cut frame hitam.
        const vTail = Math.max(tailPad, isLast ? 0 : XFADE);
        const partDur = voDur + tailPad;
        const vClipDur = voDur + vTail;

        const vName = `v${i}.mp4`;
        const aName = `a${i}.mp3`;
        const outName = `p${i}.mp4`;
        await ff.writeFile(vName, await fetchFile(s.videoUrl));
        await ff.writeFile(aName, await fetchFile(s.audioUrl));

        let vFilter =
          `${scaleVf},setpts=${ptsFactor.toFixed(6)}*PTS` +
          (vTail > 0 ? `,tpad=stop_mode=clone:stop_duration=${vTail.toFixed(3)}` : "");

        if (burnSubs && s.narration && s.narration.trim()) {
          const cues = narrationToCues(s.narration, voDur, subCfg.maxChars);
          if (cues.length > 0) {
            const ass = buildAss(cues, subCfg, targetW, targetH);
            const subName = `s${i}.ass`;
            await ff.writeFile(subName, new TextEncoder().encode(ass));
            subFilesToClean.push(subName);
            vFilter += `,subtitles=${subName}:fontsdir=.`;
          }
        }

        const aFilter =
          tailPad > 0
            ? `apad=pad_dur=${tailPad.toFixed(3)},atrim=0:${partDur.toFixed(3)},asetpts=N/SR/TB`
            : `atrim=0:${partDur.toFixed(3)},asetpts=N/SR/TB`;

        const ret = await ff.exec([
          "-i", vName,
          "-i", aName,
          "-vf", vFilter,
          "-af", aFilter,
          "-map", "0:v:0",
          "-map", "1:a:0",
          "-t", vClipDur.toFixed(3),
          "-c:v", "libx264",
          "-preset", "ultrafast",
          "-crf", "26",
          "-pix_fmt", "yuv420p",
          "-c:a", "aac",
          "-b:a", "128k",
          "-ar", "44100",
          "-movflags", "+faststart",
          "-y", outName,
        ]);
        if (ret !== 0) throw new Error(`FFmpeg mux gagal di scene ${i + 1}`);
        try { await ff.deleteFile(vName); } catch { /* noop */ }
        try { await ff.deleteFile(aName); } catch { /* noop */ }
        parts.push(outName);
        durs.push(vClipDur);
      }

      // Cleanup subtitle files after mux (safe to remove; already burned in).
      for (const sf of subFilesToClean) { try { await ff.deleteFile(sf); } catch { /* noop */ } }


      setMergeStatus("🧵 Menggabung scene…");

      // Load backsound (jika ada) ke ffmpeg FS
      const HAS_BG = !!bgTrack?.url;
      const BG_NAME = "bg_music.mp3";
      const BG_VOL = Math.max(0, Math.min(1, Number(bgVol) || 0));
      if (HAS_BG) {
        try {
          setMergeStatus("🎵 Memuat backsound…");
          pushBulkLog(`🎵 Memuat backsound: ${bgTrack!.title}`);
          await ff.writeFile(BG_NAME, await fetchFile(bgTrack!.url));
        } catch (be) {
          pushBulkLog(`⚠️ Backsound gagal dimuat: ${(be as Error).message}. Lanjut tanpa backsound.`);
        }
      }
      const hasBgFile = HAS_BG; // simplified

      if (parts.length === 1) {
        // Single scene: langsung finalize (dengan opsi backsound loop+mix)
        if (!hasBgFile) {
          const data = (await ff.readFile(parts[0])) as Uint8Array;
          const blob = new Blob([data.buffer as ArrayBuffer], { type: "video/mp4" });
          const url = URL.createObjectURL(blob);
          setFinalUrl(url);
          setMergeStatus(`✅ Video naratif siap · ${(blob.size / (1024 * 1024)).toFixed(1)} MB`);
          try { await ff.deleteFile(parts[0]); } catch { /* noop */ }
          logGenerate("naratif_merge", { status: "success", scenes: 1, bytes: blob.size });
          return;
        }
        const t = durs[0];
        const filt =
          `[1:a]aloop=loop=-1:size=2147483647,atrim=0:${t.toFixed(3)},volume=${BG_VOL.toFixed(2)}[bg];` +
          `[0:a][bg]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[aout]`;
        const sret = await ff.exec([
          "-i", parts[0],
          "-i", BG_NAME,
          "-filter_complex", filt,
          "-map", "0:v", "-map", "[aout]",
          "-t", t.toFixed(3),
          "-c:v", "copy",
          "-c:a", "aac", "-b:a", "160k",
          "-movflags", "+faststart",
          "-y", "final.mp4",
        ]);
        if (sret !== 0) throw new Error("FFmpeg gagal mix backsound");
        const data = (await ff.readFile("final.mp4")) as Uint8Array;
        const blob = new Blob([data.buffer as ArrayBuffer], { type: "video/mp4" });
        const url = URL.createObjectURL(blob);
        setFinalUrl(url);
        setMergeStatus(`✅ Video naratif siap · ${(blob.size / (1024 * 1024)).toFixed(1)} MB`);
        try { await ff.deleteFile(parts[0]); } catch { /* noop */ }
        try { await ff.deleteFile("final.mp4"); } catch { /* noop */ }
        try { await ff.deleteFile(BG_NAME); } catch { /* noop */ }
        logGenerate("naratif_merge", { status: "success", scenes: 1, bytes: blob.size });
        return;
      }

      // Multi-scene: video crossfade + audio concat (tanpa crossfade — hindari volume dip).
      // Total durasi setelah xfade video = sum(durs) - (N-1)*XFADE.
      // Audio tiap part non-terakhir dipangkas XFADE agar total audio == total video.
      const totalDur = durs.reduce((a, b) => a + b, 0) - (parts.length - 1) * XFADE;
      const inputs: string[] = [];
      parts.forEach((p) => { inputs.push("-i", p); });
      if (hasBgFile) inputs.push("-i", BG_NAME);

      const filters: string[] = [];
      let vPrev = "[0:v]";
      let cumOffset = 0;
      for (let i = 1; i < parts.length; i++) {
        const prevDur = durs[i - 1];
        cumOffset += prevDur - XFADE;
        const vOut = `[v${i}]`;
        filters.push(
          `${vPrev}[${i}:v]xfade=transition=fade:duration=${XFADE}:offset=${cumOffset.toFixed(3)}${vOut}`,
        );
        vPrev = vOut;
      }

      // Trim audio per part (potong XFADE dari akhir setiap part non-terakhir) lalu concat.
      const aLabels: string[] = [];
      for (let i = 0; i < parts.length; i++) {
        const isLast = i === parts.length - 1;
        const cut = isLast ? durs[i] : Math.max(0.1, durs[i] - XFADE);
        const lbl = `[ac${i}]`;
        filters.push(`[${i}:a]atrim=0:${cut.toFixed(3)},asetpts=N/SR/TB${lbl}`);
        aLabels.push(lbl);
      }
      filters.push(`${aLabels.join("")}concat=n=${parts.length}:v=0:a=1[avo]`);

      let finalAudioLabel = "[avo]";
      if (hasBgFile) {
        const bgIdx = parts.length;
        filters.push(
          `[${bgIdx}:a]aloop=loop=-1:size=2147483647,atrim=0:${totalDur.toFixed(3)},volume=${BG_VOL.toFixed(2)}[bg]`,
        );
        filters.push(`[bg][avo]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[amixed]`);
        finalAudioLabel = "[amixed]";
      }

      const cret = await ff.exec([
        ...inputs,
        "-filter_complex", filters.join(";"),
        "-map", vPrev,
        "-map", finalAudioLabel,
        "-c:v", "libx264",
        "-preset", "ultrafast",
        "-crf", "26",
        "-pix_fmt", "yuv420p",
        "-c:a", "aac",
        "-b:a", "160k",
        "-movflags", "+faststart",
        "-y", "final.mp4",
      ]);
      if (cret !== 0) throw new Error("FFmpeg merge gagal");

      const data = (await ff.readFile("final.mp4")) as Uint8Array;
      const blob = new Blob([data.buffer as ArrayBuffer], { type: "video/mp4" });
      const url = URL.createObjectURL(blob);
      setFinalUrl(url);
      // Arsipkan ke cloud (Google Drive) supaya hasil tetap ada di galeri.
      void (async () => {
        try {
          const fname = `naratif-${Date.now()}.mp4`;
          await uploadFileToCloud(new File([blob], fname, { type: "video/mp4" }), {
            origin: "generate",
            source: "naratif",
            name: fname,
          });
          await gallery.reload();
        } catch (err) {
          console.warn("[naratif] arsip galeri gagal", err);
        }
      })();
      setMergeStatus(`✅ Video naratif siap · ${(blob.size / (1024 * 1024)).toFixed(1)} MB${hasBgFile ? " · + backsound" : ""}`);
      pushBulkLog(`🏁 Video naratif siap · ${(blob.size / (1024 * 1024)).toFixed(1)} MB`);
      setPct(100);

      for (const p of parts) { try { await ff.deleteFile(p); } catch { /* noop */ } }
      try { await ff.deleteFile("final.mp4"); } catch { /* noop */ }
      if (hasBgFile) { try { await ff.deleteFile(BG_NAME); } catch { /* noop */ } }


      logGenerate("naratif_merge", { status: "success", scenes: scenes.length, bytes: blob.size });
    } catch (e) {
      const msg = (e as Error).message || String(e);
      setMergeStatus("❌ " + msg);
      pushBulkLog(`❌ Merge gagal: ${msg}`);
      logGenerate("naratif_merge", { status: "error", error: msg });
    } finally {
      setBusy("merge", false);
    }
  };

  const canMerge = scenes.length > 0 && scenes.every((s) => s.videoUrl && s.audioUrl);


  return (
    <DashboardShell>
      <PageHero eyebrow="Generate" title="Naratif Video" highlight="Maker" desc="Link artikel/berita/blog → scrape → Brain → gambar per scene → voice-over → gabung jadi video naratif." />

      <Card title="🔗 Sumber Artikel">
        <div className="flex gap-2">
          <Input type="url" placeholder="https://..." value={url} onChange={(e) => setUrl(e.target.value)} />
          <PrimaryButton onClick={() => { void pasteAndScrape(); }} disabled={scraping} className="whitespace-nowrap shrink-0">
            {scraping ? <Loader2 className="h-4 w-4 animate-spin" /> : <ClipboardPaste className="h-4 w-4" />} Paste
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
                  {material.images.slice(0, 12).map((src, i) => {
                    const px = /^https?:\/\//i.test(src)
                      ? `/api/public/proxy-image?url=${encodeURIComponent(src)}`
                      : src;
                    return (
                      <div key={i} className="group relative aspect-square rounded-lg overflow-hidden border border-border bg-black/30">
                        <a href={src} target="_blank" rel="noreferrer" className="block h-full w-full">
                          <img
                            src={px}
                            alt={`ref-${i}`}
                            className="w-full h-full object-cover"
                            loading="lazy"
                            onError={(e) => {
                              const img = e.currentTarget as HTMLImageElement;
                              if (img.src !== src) img.src = src;
                            }}
                          />
                        </a>
                        <button
                          type="button"
                          title="Hapus gambar referensi ini"
                          onClick={() =>
                            setMaterial({
                              ...material,
                              images: (material.images ?? []).filter((u) => u !== src),
                            })
                          }
                          className="absolute right-1 top-1 grid h-6 w-6 place-items-center rounded-full bg-black/70 text-white opacity-0 transition group-hover:opacity-100 hover:bg-destructive"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>

              </Field>
            )}
          </div>
        </Card>
      )}

      {material && (
        <Card title="🧠 Brain — Naskah & Model">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Field label="Aspek Rasio">
              <Select value={ratio} onChange={(e) => setRatio(e.target.value)} options={[
                { value: "9:16", label: "9:16 Vertical" },
                { value: "16:9", label: "16:9 Landscape" },
                { value: "1:1", label: "1:1 Square" },
              ]} />
            </Field>
            <div className="flex flex-col gap-1.5">
              <div className="flex flex-wrap items-center gap-2 min-h-[20px]">
                <label className="text-[11px] font-mono uppercase tracking-[0.18em] text-muted-foreground">
                  Model AI Gambar
                </label>
                <ProviderActivePill cap="image" label="Image:" />
              </div>
              <Select value={imgModel} onChange={(e) => setImgModel(e.target.value)} options={imgModels.map((m) => ({ value: m.key, label: m.label }))} />
            </div>
            <Field label="Kualitas Gambar">
              <Select value={imgQuality} onChange={(e) => setImgQuality(e.target.value)} options={(activeImgModel?.qualities || []).map((q) => ({ value: q.v, label: q.label }))} />
            </Field>
            <div className="flex flex-col gap-1.5">
              <div className="flex flex-wrap items-center gap-2 min-h-[20px]">
                <label className="text-[11px] font-mono uppercase tracking-[0.18em] text-muted-foreground">
                  Model Video
                </label>
                <ProviderActivePill cap="video" label="Video:" />
              </div>
              <Select value={vidModel} onChange={(e) => setVidModel(e.target.value)} options={vidModels.map((m) => ({ value: m.key, label: m.label }))} />
            </div>
            <Field label="Kualitas Video">
              <Select value={vidQuality} onChange={(e) => setVidQuality(e.target.value)} options={(activeVidModel?.qualities || []).map((q) => ({ value: q.v, label: q.label }))} />
            </Field>
            <div className="flex flex-col gap-1.5">
              <div className="flex flex-wrap items-center gap-2 min-h-[20px]">
                <label className="text-[11px] font-mono uppercase tracking-[0.18em] text-muted-foreground">
                  Voice-Over
                </label>
                <ProviderActivePill cap="voice" label="Voice:" />
              </div>
              <div className="flex gap-2">
                <Select value={voice} onChange={(e) => setVoice(e.target.value)} options={VOICES} className="flex-1" />
                <PrimaryButton onClick={testVoice} disabled={testingVoice} title="Tes suara" className="!px-3 whitespace-nowrap">
                  <Play className="h-3.5 w-3.5" /> {testingVoice ? "..." : "Tes"}
                </PrimaryButton>
              </div>
            </div>

            <Field label="Intonasi Narasi (Voice Preset)">
              <Select
                value={voicePreset}
                onChange={(e) => setVoicePreset(e.target.value)}
                options={Object.entries(VOICE_PRESETS).map(([v, p]) => ({ value: v, label: p.label }))}
              />
            </Field>
            <Field label="Extra Prompt (opsional)">
              <Textarea rows={2} placeholder="Gaya visual, mood, angle bercerita tertentu…" value={extra} onChange={(e) => setExtra(e.target.value)} />
            </Field>
          </div>
          <div className="mt-5 flex items-center gap-3 flex-wrap">
            <PrimaryButton onClick={runBrain} disabled={brainBusy || perSceneBusy || anyBusy}>
              {brainBusy ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Memproses Data</>
              ) : (
                <><Sparkles className="h-4 w-4" /> Analisa & Bikin Naskah</>
              )}
            </PrimaryButton>
            <GenMetaTable
              items={[
                { slot: "Image", provider: imgProvider },
                { slot: "Video", provider },
                { slot: "Voice", provider: "eleven" },
              ]}
              status={anyBusy ? "processing" : "idle"}
              className="min-w-[320px] lg:min-w-0 lg:flex-1"
            />
          </div>
        </Card>
      )}

      <div ref={scenesSectionRef} className="scroll-mt-24" />

      {scenes.length > 0 && (
        <Card>
          <div className="flex flex-wrap items-center gap-3">
            <div className="font-display text-lg text-foreground">🎬 Scenes ({scenes.length})</div>
            <PrimaryButton onClick={runPerScene} disabled={perSceneBusy || anyBusy || allScenesReady}>
              {perSceneBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Film className="h-4 w-4" />}
              {perSceneBusy ? "Memproses Scene…" : allScenesReady ? "Semua Scene Lengkap" : "Generate Video Perscene"}
            </PrimaryButton>
          </div>

          {/* Progress ringkas di atas — biar terlihat tanpa scroll ke bawah */}
          <div className="mt-3 mb-4 rounded-xl border border-border/70 bg-card/40 px-3 py-2">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-primary" />
              <div className="text-xs font-semibold">Status &amp; Log Proses</div>
              {anyBusy && <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />}
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-mono ${anyBusy ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"}`}
              >
                {bulkBusy.img
                  ? "GENERATING IMAGE"
                  : bulkBusy.vo
                    ? "GENERATING VO"
                    : bulkBusy.vid
                      ? "GENERATING VIDEO"
                      : bulkBusy.merge
                        ? "MERGING"
                        : "IDLE"}
              </span>
              <span className="ml-auto font-mono text-[10px] text-muted-foreground">{bulkPct}%</span>
            </div>
            <div className="mt-2 h-1.5 rounded-full bg-border overflow-hidden">
              <div className="h-full transition-all" style={{ width: `${bulkPct}%`, background: "var(--gradient-neon)" }} />
            </div>
          </div>



          {/* Susunan lama: vertical list, preview kiri + fields kanan */}
          <div className="flex flex-col gap-4">
            {scenes.map((s, i) => (
              <div key={s.idx} className="rounded-xl border border-border bg-card/40 p-4">
                <div className="flex flex-col lg:flex-row gap-4">
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
                        <div className="absolute inset-0 z-10 grid place-items-center gap-2 bg-black/75 backdrop-blur-[2px]">
                          <div className="flex flex-col items-center gap-2 px-3 text-center">
                            <span className="relative flex h-9 w-9 items-center justify-center">
                              <span className="absolute inset-0 animate-ping rounded-full bg-primary/30" />
                              <Loader2 className="h-6 w-6 animate-spin text-primary" />
                            </span>
                            <span className="rounded-full border border-primary/40 bg-primary/15 px-2.5 py-0.5 text-[10px] font-semibold text-primary">
                              {s.busy === "img"
                                ? "🖼️ Generating Image…"
                                : s.busy === "vo"
                                  ? "🎙️ Generating Voice-Over…"
                                  : "🎬 Generating Video…"}
                            </span>
                            <span className="text-[9px] text-muted-foreground">Scene #{s.idx} sedang diproses</span>
                          </div>
                          <div className="absolute bottom-0 left-0 h-1 w-full overflow-hidden bg-black/50">
                            <div className="h-full w-1/3 animate-[shimmer_1.4s_linear_infinite] bg-gradient-to-r from-transparent via-primary to-transparent" />
                          </div>
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
          <div className="mt-4 rounded-xl border border-border bg-card/40 p-3">
            <div className="text-[11px] font-medium text-muted-foreground mb-2">⚙️ Opsi Gabung Video (jeda & transisi antar scene)</div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <label className="text-[11px] flex flex-col gap-1">
                <span>Jeda antar scene: <b>{sceneGap.toFixed(2)}s</b></span>
                <input type="range" min={0} max={2.5} step={0.1} value={sceneGap} onChange={(e) => setSceneGap(Number(e.target.value))} />
              </label>
              <label className="text-[11px] flex flex-col gap-1">
                <span>Durasi crossfade: <b>{xfadeDur.toFixed(2)}s</b></span>
                <input type="range" min={0.2} max={1.5} step={0.05} value={xfadeDur} onChange={(e) => setXfadeDur(Number(e.target.value))} />
              </label>
              <label className="text-[11px] flex flex-col gap-1">
                <span>Jeda akhir video: <b>{leadOutDur.toFixed(2)}s</b></span>
                <input type="range" min={0} max={3} step={0.1} value={leadOutDur} onChange={(e) => setLeadOutDur(Number(e.target.value))} />
              </label>
            </div>
          </div>
          <div className="mt-3 rounded-xl border border-border bg-card/40 p-3">
            <div className="flex items-center justify-between mb-2 gap-3 flex-wrap">
              <button
                type="button"
                onClick={() => setSubOpen((v) => !v)}
                className="inline-flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground hover:text-foreground"
              >
                <ChevronRight className={`h-3.5 w-3.5 transition-transform ${subOpen ? "rotate-90" : ""}`} />
                💬 Subtitle (burn-in ke video)
              </button>
              <label className="inline-flex items-center gap-2 text-[11px] cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={subEnable}
                  onChange={(e) => setSubEnable(e.target.checked)}
                  className="h-3.5 w-3.5 accent-primary"
                />
                <span>{subEnable ? "Aktif — subtitle akan dibakar ke video" : "Nonaktif — video tanpa subtitle"}</span>
              </label>
            </div>
            {subOpen && subEnable && <SubtitleDesigner value={subCfg} onChange={setSubCfg} ratio={ratio} />}
          </div>
          <div className="mt-3 rounded-xl border border-border bg-card/40 p-3">
            <div className="flex items-center justify-between mb-2 gap-3 flex-wrap">
              <button
                type="button"
                onClick={() => void toggleBgPanel()}
                className="inline-flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground hover:text-foreground"
              >
                <ChevronRight className={`h-3.5 w-3.5 transition-transform ${bgOpen ? "rotate-90" : ""}`} />
                🎵 Gunakan Backsound (musik latar) — auto-loop menyesuaikan durasi video
              </button>
              {bgOpen && bgTrack && (
                <button
                  type="button"
                  onClick={clearBg}
                  className="text-[10px] text-red-400 hover:text-red-300 underline"
                >
                  Hapus backsound
                </button>
              )}
            </div>
            <div className={`grid gap-3 lg:grid-cols-2 ${bgOpen ? "" : "hidden"}`}>
              {/* Kiri — pengaturan */}
              <div className="grid gap-2">
                <label className="text-[11px] flex flex-col gap-1">
                  <span>Mood (dari internet, gratis)</span>
                  <select
                    value={bgMood}
                    onChange={(e) => { setBgMood(e.target.value); setBgLibrary([]); }}
                    className="h-8 rounded-md border border-border bg-black/30 px-2 text-[12px]"
                  >
                    {BG_MOODS.map((m) => (
                      <option key={m.key} value={m.key}>{m.label}</option>
                    ))}
                  </select>
                </label>

                <label className="text-[11px] flex flex-col gap-1">
                  <span>Cari backsound (archive.org · CC / public domain)</span>
                  <div className="flex gap-1.5">
                    <div className="flex flex-1 items-center gap-1.5 rounded-md border border-border bg-black/30 px-2">
                      <Search className="h-3 w-3 text-muted-foreground" />
                      <input
                        value={bgQuery}
                        onChange={(e) => setBgQuery(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") void loadBgLibrary(bgMood, bgQuery); }}
                        placeholder="epic drums, lofi chill, piano sedih…"
                        className="h-8 w-full flex-1 bg-transparent text-[12px] outline-none"
                      />
                    </div>
                    <GhostButton onClick={() => loadBgLibrary(bgMood, bgQuery)} disabled={bgLoading} className="!px-2 !py-1 text-[11px]">
                      {bgLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Search className="h-3 w-3" />} Cari
                    </GhostButton>
                  </div>
                </label>

                <div className="flex flex-wrap gap-1.5">
                  <GhostButton
                    onClick={shuffleBgTrack}
                    disabled={bgLoading}
                    className="!px-2 !py-1 text-[11px]"
                    title="Acak lagu lalu langsung diputar"
                  >
                    {bgLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />} Shuffle & Play
                  </GhostButton>
                  <GhostButton onClick={() => setBgFavOpen(true)} className="!px-2 !py-1 text-[11px]" title="Backsound favorit tersimpan di cloud">
                    <Star className="h-3 w-3" /> Favorit{bgFav.items.length ? ` (${bgFav.items.length})` : ""}
                  </GhostButton>
                  <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-border bg-black/20 px-2 py-1 text-[11px] hover:border-primary/60">
                    <span>📁 Upload MP3/WAV</span>
                    <input
                      type="file"
                      accept="audio/*"
                      className="hidden"
                      onChange={(e) => { const f = e.currentTarget.files?.[0] || null; onBgUpload(f); e.currentTarget.value = ""; }}
                    />
                  </label>
                </div>

                <label className="text-[11px] flex flex-col gap-1">
                  <span>Volume backsound: <b>{Math.round(bgVol * 100)}%</b></span>
                  <input type="range" min={0} max={0.6} step={0.02} value={bgVol} onChange={(e) => setBgVol(Number(e.target.value))} />
                </label>

                <div className="text-[11px] flex flex-col gap-1">
                  <span>Backsound aktif</span>
                  <div className="flex items-center gap-2 rounded-md border border-border bg-black/20 px-2 py-1.5">
                    <span className="min-w-0 flex-1 truncate text-muted-foreground">
                      {bgTrack ? `🎶 ${bgSource === "upload" ? bgUploadName || bgTrack.title : bgTrack.title}` : "Belum dipilih — video hanya pakai voice-over."}
                    </span>
                    {bgTrack && bgSource === "library" && (
                      <FavoriteHeart
                        active={bgFav.isFav(bgTrack.url)}
                        onClick={() => bgFav.toggle({ title: bgTrack.title, url: bgTrack.url, duration: bgTrack.duration, mood: bgMood })}
                      />
                    )}
                  </div>
                </div>
              </div>

              {/* Kanan — daftar lagu */}
              <div className="flex max-h-72 min-h-40 flex-col overflow-hidden rounded-lg border border-border/60 bg-black/25">
                <div className="border-b border-border/60 px-2 py-1.5 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                  Daftar lagu {bgLibrary.length ? `(${bgLibrary.length})` : ""}
                </div>
                <div className="flex-1 space-y-1 overflow-y-auto p-2">
                  {!bgLibrary.length && (
                    <div className="p-6 text-center text-[11px] text-muted-foreground">
                      Cari mood/kata kunci lalu klik <b>Cari</b>, atau tekan <b>Shuffle &amp; Play</b>.
                    </div>
                  )}
                  {bgLibrary.map((t) => {
                    const active = bgTrack?.url === t.url;
                    const playing = bgPlayingUrl === t.url;
                    return (
                      <div
                        key={t.url}
                        className={`flex items-center gap-1.5 rounded-md px-2 py-1 ${active ? "bg-primary/10 ring-1 ring-primary/40" : "hover:bg-white/5"}`}
                      >
                        <button
                          type="button"
                          onClick={() => playPreview(t.url)}
                          className="rounded-full border border-border p-1 hover:bg-white/10"
                          aria-label={playing ? "Jeda" : "Putar"}
                        >
                          {playing ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
                        </button>
                        <FavoriteHeart
                          active={bgFav.isFav(t.url)}
                          onClick={() => bgFav.toggle({ title: t.title, url: t.url, duration: t.duration, mood: bgMood })}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-[11px]">{t.title}</div>
                          <div className="text-[10px] text-muted-foreground">
                            {Math.floor(t.duration / 60)}:{String(Math.floor(t.duration % 60)).padStart(2, "0")}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => pickBgTrack(t)}
                          className="shrink-0 rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-[10px] text-primary hover:bg-primary/20"
                        >
                          {active ? "Dipakai" : "Pakai"}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <BacksoundFavoritesDialog
              open={bgFavOpen}
              onClose={() => setBgFavOpen(false)}
              items={bgFav.items}
              loading={bgFav.loading}
              onRefresh={() => void bgFav.refresh()}
              onRemove={(url) => void bgFav.toggle({ title: "", url })}
              onPick={(t) => pickBgTrack({ title: t.title, url: t.url, duration: t.duration })}
            />

          </div>
          <div className="mt-4 flex flex-wrap gap-2">

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

          {/* Box khusus: status proses, progress bar, dan log — seperti di Motion Control */}
          <div className="mt-4 rounded-xl border border-border/70 bg-card/40 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-primary" />
              <div className="text-xs font-semibold">Status &amp; Log Proses</div>
              {anyBusy && <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />}
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-mono ${anyBusy ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"}`}
              >
                {bulkBusy.img
                  ? "GENERATING IMAGE"
                  : bulkBusy.vo
                    ? "GENERATING VO"
                    : bulkBusy.vid
                      ? "GENERATING VIDEO"
                      : bulkBusy.merge
                        ? "MERGING"
                        : "IDLE"}
              </span>
              <span className="ml-auto font-mono text-[10px] text-muted-foreground">{bulkPct}%</span>
            </div>

            <div className="h-1.5 rounded-full bg-border overflow-hidden">
              <div className="h-full transition-all" style={{ width: `${bulkPct}%`, background: "var(--gradient-neon)" }} />
            </div>

            <div className="grid gap-1 text-[11px] text-muted-foreground sm:grid-cols-2">
              <div className="truncate">🧠 Brain: {brainStatus || "—"}</div>
              <div className="truncate">🧵 Merge: {mergeStatus || "—"}</div>
            </div>

            <div className="rounded-lg border border-border/60 bg-black/40 p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-muted-foreground">Log Proses</div>
                <button onClick={() => { setBulkLogs([]); setPct(0); }} className="text-[10px] text-muted-foreground hover:text-destructive">Clear</button>
              </div>
              <div className="max-h-48 overflow-y-auto overflow-x-hidden font-mono text-[10px] leading-relaxed text-muted-foreground min-w-0">
                {bulkLogs.length === 0 && <div className="opacity-60">Belum ada aktivitas. Log akan muncul saat proses berjalan.</div>}
                {bulkLogs.map((l, i) => (
                  <div key={i} className="whitespace-pre-wrap break-all min-w-0">{l}</div>
                ))}
              </div>
            </div>
          </div>

          {finalUrl && finalUrl !== "#" && (
            <div className="mt-4 rounded-xl border border-border bg-black/40 p-4 space-y-3">
              <video src={finalUrl} controls className={`w-full rounded-lg ${ratioClass(ratio)} bg-black`} />
              <div className="flex justify-center">
                <a
                  href={finalUrl}
                  download={`naratif-${Date.now()}.mp4`}
                  className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
                >
                  ⬇️ Unduh Video Naratif
                </a>
              </div>
            </div>
          )}
        </Card>
      )}

      <Card
        title={`🗂️ Galeri Hasil (${gallery.items.length})`}
        sub="Tersimpan otomatis di Google Drive — tidak hilang sampai kamu hapus sendiri."
        right={
          <>
            <GhostButton onClick={downloadGalleryZip} disabled={zipBusy || gallery.items.length === 0}>
              {zipBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              Unduh All (ZIP)
            </GhostButton>
            <GhostButton onClick={() => void gallery.removeAll()} disabled={gallery.items.length === 0}>
              <Trash2 className="h-4 w-4" /> Hapus All
            </GhostButton>
          </>
        }
      >
        {gallery.loading ? (
          <div className="py-8 text-center text-sm text-muted-foreground">Memuat galeri…</div>
        ) : gallery.items.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            Belum ada hasil. Video naratif yang selesai digabung otomatis muncul di sini.
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {gallery.items.map((it) => (
              <div key={it.id} className="group relative overflow-hidden rounded-lg border border-border bg-black/40">
                <video src={it.url} controls preload="metadata" className="aspect-video w-full bg-black object-contain" />
                <div className="flex items-center gap-2 p-2">
                  <a
                    href={it.url}
                    download={it.name || "naratif.mp4"}
                    className="text-[11px] text-muted-foreground hover:text-primary"
                  >
                    ⬇️ Unduh
                  </a>
                  <button
                    onClick={() => void gallery.remove(it.id)}
                    className="ml-auto text-[11px] text-muted-foreground hover:text-destructive"
                  >
                    Hapus
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>


      {!material && (
        <Card>
          <div className="py-10 text-center text-sm text-muted-foreground">
            <Rocket className="mx-auto h-8 w-8 opacity-50" />
            <div className="mt-2">Paste URL artikel di atas untuk mengambil materi otomatis.</div>
          </div>
        </Card>
      )}

      <Dialog open={!!tokenAlert} onOpenChange={(o) => !o && setTokenAlert(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>⚠️ Token / Credit tidak mencukupi</DialogTitle>
            <DialogDescription>
              Proses Generate Video Perscene dihentikan. Lengkapi token atau isi credit provider berikut:
            </DialogDescription>
          </DialogHeader>
          <ul className="space-y-2 text-sm">
            {(tokenAlert ?? []).map((p) => (
              <li key={p} className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-foreground">
                {p}
              </li>
            ))}
          </ul>
          <DialogFooter>
            <PrimaryButton onClick={() => setTokenAlert(null)}>Mengerti</PrimaryButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardShell>
  );
}
