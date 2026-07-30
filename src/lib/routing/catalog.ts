// Shared routing catalog + helpers.
// Dulu tinggal di src/routes/manage.routing.tsx — sekarang dipisah supaya
// dialog quick-routing di setiap halaman generate bisa reuse.

import { Image as ImageIcon, Film, Mic, Move3d, Brain } from "lucide-react";
import type { ComponentType } from "react";
import { isProviderEnabled, type ProviderFlagMap } from "@/lib/platform/provider-flags";

export type CapKey = "brain" | "image" | "video" | "voice" | "motion";
export type ProviderOpt = {
  id: string;
  name: string;
  desc: string;
  models: { name: string; cost: string }[];
  note?: string;
};
export type Cap = {
  key: CapKey;
  label: string;
  icon: ComponentType<{ className?: string }>;
  desc: string;
  providers: ProviderOpt[];
};

export const CAPS: Cap[] = [
  {
    key: "brain",
    label: "Brain (Text AI)",
    icon: Brain,
    desc: "Otak generator naskah, prompt, caption, scenario — dipakai Storyboard, Naratif, AI Influencer.",
    providers: [
      { id: "gemini", name: "Google Gemini", desc: "Default. Multi-key auto-rotate saat kena 429. Isi API key AIza… atau AQ… di Token Manager → Brain.", models: [
        { name: "gemini-2.5-flash", cost: "Free tier: 15 rpm / 1M token/hari" },
        { name: "gemini-flash-latest", cost: "Auto fallback" },
        { name: "gemini-2.5-flash-lite", cost: "Auto fallback" },
      ] },
      { id: "openai", name: "OpenAI GPT", desc: "Fallback tier-2 bila semua Gemini kena limit. Butuh key sk-… di Token Manager.", models: [
        { name: "gpt-4o-mini", cost: "$0.15 / 1M input · $0.60 / 1M output" },
        { name: "gpt-4.1-mini", cost: "Auto fallback" },
      ] },
      { id: "claude", name: "Anthropic Claude", desc: "Belum aktif — coming soon.", models: [{ name: "claude-sonnet-4 (planned)", cost: "TBA" }], note: "coming-soon" },
      { id: "perplexity", name: "Perplexity", desc: "Belum aktif — coming soon.", models: [{ name: "sonar-pro (planned)", cost: "TBA" }], note: "coming-soon" },
    ],
  },
  {
    key: "image",
    label: "Image Generation",
    icon: ImageIcon,
    desc: "Provider untuk generate & edit gambar (Storyboard, Bulk Fashion, Thumbnail).",
    providers: [
      { id: "weavy", name: "Weavy", desc: "Akses multi-model image via 1 token Weavy. Cocok untuk workflow storyboard.", models: [
        { name: "Gemini 2.5 Flash Image (Nano Banana)", cost: "~4 cr / image" },
        { name: "Flux 1.1 Pro", cost: "~8 cr / image" },
        { name: "Seedream 4.0", cost: "~6 cr / image" },
      ] },
      { id: "gemini", name: "Gemini Direct", desc: "Langsung ke Google AI Studio pakai API key AIza… atau AQ… (paling murah bila key sendiri).", models: [
        { name: "gemini-2.5-flash-image", cost: "$0.039 / image" },
        { name: "gemini-3-pro-image", cost: "$0.134 / image" },
      ] },
      { id: "openai", name: "OpenAI Direct", desc: "Fallback bila Gemini limit. Butuh key sk-…", models: [
        { name: "gpt-image-1 (1024²)", cost: "$0.040 / image" },
        { name: "gpt-image-1 HD (1024²)", cost: "$0.167 / image" },
      ] },
      { id: "framia", name: "Framia (Converge AI)", desc: "Canvas workflow via Framia — Nano Banana, Flux, Seedream, dsb.", models: [
        { name: "Gemini 2.5 Flash Image (Nano Banana)", cost: "~4 cr (Framia)" },
        { name: "Flux 1.1 Pro", cost: "~8 cr (Framia)" },
        { name: "Seedream 4.0", cost: "~6 cr (Framia)" },
        { name: "Ideogram v3", cost: "~5 cr (Framia)" },
      ] },
      { id: "firefly", name: "Adobe Firefly", desc: "Adobe Firefly web session token (Bearer IMS) di Token Manager → Firefly.", models: [
        { name: "Firefly Image 4 Standard", cost: "~1 cr / image" },
        { name: "Firefly Image 4 Ultra", cost: "~4 cr / image" },
        { name: "Firefly Image 3", cost: "~1 cr / image" },
      ] },
      { id: "leonardo", name: "Leonardo.ai", desc: "Langsung ke app.leonardo.ai pakai Bearer JWT (Cognito) di Token Manager → Leonardo.", models: [
        { name: "GPT Image 2", cost: "~6–24 cr (Leonardo)" },
        { name: "Nano Banana 2", cost: "~8 cr" },
        { name: "Seedream 5.0 Pro", cost: "~8 cr" },
        { name: "Flux.2 Pro", cost: "~8 cr" },
      ] },
    ],
  },
  {
    key: "video",
    label: "Video Generation",
    icon: Film,
    desc: "Provider untuk Image-to-Video & Text-to-Video.",
    providers: [
      { id: "wavespeed", name: "Wavespeed", desc: "Termurah untuk Kling & Seedance i2v. Bayar per detik.", models: [
        { name: "Kling v2.1 Standard (i2v)", cost: "$0.05 / detik" },
        { name: "Kling v2.1 Pro (i2v)", cost: "$0.09 / detik" },
        { name: "Seedance Pro (i2v)", cost: "$0.06 / detik" },
        { name: "Wan 2.2 (i2v)", cost: "$0.04 / detik" },
      ] },
      { id: "weavy", name: "Weavy", desc: "Video via token pool Weavy.", models: [
        { name: "Kling v2.1", cost: "~30 cr / 5s" },
        { name: "Kling v1.6", cost: "~18 cr / 5s" },
        { name: "Sora / Seedance", cost: "~40 cr / 5s" },
      ] },
      { id: "roboneo", name: "Roboneo", desc: "Kling I2V via Roboneo (Meitu gateway).", models: [
        { name: "Kling V2.6 Standard (i2v)", cost: "Gratis (kuota Roboneo)" },
        { name: "Kling V2.6 Pro (i2v)", cost: "Gratis (kuota Roboneo)" },
        { name: "Kling V2.1 Standard (i2v)", cost: "Gratis (kuota Roboneo)" },
      ] },
      { id: "framia", name: "Framia (Converge AI)", desc: "Canvas workflow video di Framia.", models: [
        { name: "Kling v2.1 Master (i2v)", cost: "~45 cr / 5s" },
        { name: "Sora 2 (t2v/i2v)", cost: "~50 cr / 5s" },
        { name: "Seedance 1.0 Pro", cost: "~30 cr / 5s" },
        { name: "Hailuo 02 Pro", cost: "~28 cr / 5s" },
      ] },
      { id: "firefly", name: "Adobe Firefly", desc: "Firefly video (Veo via Adobe) — pakai Bearer token Firefly di Token Manager.", models: [
        { name: "Veo 3.1 Fast (Firefly)", cost: "~20 cr / 8s" },
        { name: "Veo 3.1 (Firefly)", cost: "~40 cr / 8s" },
        { name: "Firefly Video Model 1", cost: "~10 cr / 5s" },
      ] },
      { id: "leonardo", name: "Leonardo.ai", desc: "GraphQL /v1/graphql. Support I2V (image_reference) & T2V.", models: [
        { name: "Veo 3.1 Fast · up to 4K", cost: "~150 cr/s" },
        { name: "Kling 2.6 · 1080p", cost: "~140 cr/s" },
        { name: "Seedance 2.0", cost: "~140 cr/s" },
        { name: "Wan 2.6 · 1080p", cost: "~35 cr/s" },
      ] },
    ],
  },
  {
    key: "voice",
    label: "Voice Over",
    icon: Mic,
    desc: "Provider TTS untuk Naratif Video Maker.",
    providers: [
      { id: "elevenlabs", name: "ElevenLabs", desc: "Kualitas suara terbaik. Bayar per karakter.", models: [
        { name: "Multilingual v2", cost: "1 karakter = 1 credit" },
        { name: "Turbo v2.5 (low latency)", cost: "0.5 karakter = 1 credit" },
      ] },
    ],
  },
  {
    key: "motion",
    label: "Motion Control",
    icon: Move3d,
    desc: "Provider untuk Kling Motion Control (character + reference video).",
    providers: [
      { id: "weavy", name: "Weavy", desc: "Default. Motion Control via Kling melalui token Weavy.", models: [{ name: "Kling Motion Control", cost: "~35 cr / 5s" }] },
      { id: "wavespeed", name: "Wavespeed", desc: "Kling Motion Control via Wavespeed API.", models: [
        { name: "Kling V3.0 Pro / Std", cost: "84 / 63 cr per clip" },
        { name: "Kling V2.6 Pro / Std", cost: "56 / 21 cr per clip" },
      ] },
      { id: "roboneo", name: "Roboneo", desc: "Kling Motion Control via Roboneo (Meitu). Hanya Kling V2.6 Std.", models: [{ name: "Kling V2.6 Standard", cost: "Gratis (kuota Roboneo)" }] },
      { id: "magnific", name: "Magnific", desc: "Kling Motion Control via api.magnific.com. Butuh Freepik/Magnific API key.", models: [{ name: "Kling Motion Transfer", cost: "~50 Freepik cr / 5s" }] },
      { id: "framia", name: "Framia (Converge AI)", desc: "Motion Control via Framia canvas — Kling motion node.", models: [
        { name: "Kling V2.1 Motion Control", cost: "~40 cr / 5s" },
        { name: "Kling V2.6 Motion Control", cost: "~35 cr / 5s" },
      ] },
    ],
  },
];

export const LS_ROUTING = "aatools.routing.v2";
export type RoutingState = Record<CapKey, string>;
export const DEFAULT_ROUTING: RoutingState = {
  brain: "gemini",
  image: "weavy",
  video: "wavespeed",
  voice: "elevenlabs",
  motion: "weavy",
};

export function readRouting(): RoutingState {
  if (typeof window === "undefined") return DEFAULT_ROUTING;
  try {
    const raw = localStorage.getItem(LS_ROUTING);
    if (!raw) return DEFAULT_ROUTING;
    return { ...DEFAULT_ROUTING, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_ROUTING;
  }
}

export function writeRoutingCap(cap: CapKey, id: string) {
  if (typeof window === "undefined") return;
  const next = { ...readRouting(), [cap]: id };
  localStorage.setItem(LS_ROUTING, JSON.stringify(next));
  window.dispatchEvent(
    new CustomEvent("aatools:routing-changed", { detail: { cap, id, routing: next } }),
  );
}

export function getCap(cap: CapKey): Cap | undefined {
  return CAPS.find((c) => c.key === cap);
}

/** Provider yang sedang dinonaktifkan admin disembunyikan dari user. */
export function enabledProviders(cap: Cap, flags?: ProviderFlagMap): ProviderOpt[] {
  return cap.providers.filter((p) => isProviderEnabled(p.id, flags));
}
