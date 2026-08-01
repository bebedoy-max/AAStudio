// Katalog model & opsi kualitas video per provider — dipakai bersama oleh
// menu Image to Video dan Text to Video supaya daftar model/parameter selalu
// sama untuk provider yang sedang aktif.
import { leonardoVideoQualityOptions } from "@/lib/providers/leonardo-video";

export type ModelOpt = { value: string; label: string; cr: number };
export const I2V_CATALOG: Record<string, ModelOpt[]> = {
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
  dola: [
    // Dola (www.dola.com) — skill video (ability_type 17) pada sesi chat.
    { value: "dola:seedance_v2.0", label: "Dreamina Seedance 2 Fast (Dola)", cr: 0 },
    { value: "dola:seedance_v1.0", label: "Dreamina Seedance 1 (Dola)", cr: 0 },
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
export function readRoutedVideoProvider(): string | null {
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
export const RATIOS = ["16:9", "9:16", "1:1", "4:5", "3:4"];

export type QualityOpt = {
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
const DOLA_QUALITY: QualityOpt[] = [
  { value: "720p-5s", label: "720p · 5s", mult: 1, duration: 5, resolution: "720p", cr: 0 },
  { value: "720p-10s", label: "720p · 10s", mult: 1, duration: 10, resolution: "720p", cr: 0 },
  { value: "1080p-5s", label: "1080p · 5s", mult: 1, duration: 5, resolution: "1080p", cr: 0 },
];

export function qualityOptsFor(model: string, aspect: string): QualityOpt[] {
  if (model.startsWith("dola:")) return DOLA_QUALITY;
  if (model.startsWith("leo-vid:")) {
    const opts = leonardoQualityOpts(model, aspect);
    if (opts.length) return opts;
  }
  return FRAMIA_QUALITY[model] || ROBONEO_QUALITY[model] || DEFAULT_QUALITY;
}
