// Provider status derived from configured keys.
// No live pings (would burn subrequests) — deterministic derived state.
import { useSyncExternalStore } from "react";
import { getCreativeKeys } from "@/lib/creative/keys";

export type ProviderStatus = "healthy" | "fallback" | "no-key" | "degraded";
export type Provider = {
  id: string;
  name: string;
  category: "text" | "image" | "video" | "voice";
  status: ProviderStatus;
  queue: number;
  note?: string;
};

function compute(): Provider[] {
  const { openai, gemini } = typeof window === "undefined" ? { openai: "", gemini: "" } : getCreativeKeys();
  const openaiOk = !!openai;
  const geminiOk = !!gemini;
  return [
    { id: "openai", name: "OpenAI GPT", category: "text", status: openaiOk ? "healthy" : "no-key", queue: openaiOk ? 2 : 0 },
    { id: "gemini", name: "Gemini 2.5", category: "text", status: geminiOk ? "healthy" : "no-key", queue: geminiOk ? 1 : 0 },
    { id: "claude", name: "Claude 4", category: "text", status: "degraded", queue: 0, note: "planned" },
    { id: "gemini-image", name: "Gemini Image", category: "image", status: geminiOk ? "healthy" : "no-key", queue: geminiOk ? 3 : 0 },
    { id: "openai-image", name: "GPT-Image", category: "image", status: openaiOk ? "fallback" : "no-key", queue: 0, note: openaiOk ? "backup" : undefined },
    { id: "flux", name: "Flux Pro", category: "image", status: "degraded", queue: 0, note: "planned" },
    { id: "kling", name: "Kling 2.5", category: "video", status: "degraded", queue: 0, note: "planned" },
    { id: "runway", name: "Runway", category: "video", status: "degraded", queue: 0, note: "planned" },
    { id: "wavespeed", name: "Wavespeed", category: "video", status: "degraded", queue: 0, note: "planned" },
    { id: "eleven", name: "ElevenLabs", category: "voice", status: "degraded", queue: 0, note: "planned" },
  ];
}

let state: Provider[] = compute();
const listeners = new Set<() => void>();
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

if (typeof window !== "undefined") {
  const refresh = () => {
    state = compute();
    listeners.forEach((l) => l());
  };
  window.addEventListener("storage", (e) => {
    if (e.key && e.key.startsWith("aatools.brain.")) refresh();
  });
  window.addEventListener("aatools:keys-changed", refresh);
  // Refresh every 60s (cheap, all-local)
  setInterval(refresh, 60000);
}

export function useProviders(): Provider[] {
  return useSyncExternalStore(subscribe, () => state, () => state);
}

export function providerBadge(s: ProviderStatus): { label: string; className: string } {
  switch (s) {
    case "healthy":
      return { label: "Healthy", className: "text-emerald-300 bg-emerald-500/10 border-emerald-500/30" };
    case "fallback":
      return { label: "Fallback", className: "text-amber-300 bg-amber-500/10 border-amber-500/30" };
    case "no-key":
      return { label: "No Key", className: "text-muted-foreground bg-muted/30 border-border" };
    case "degraded":
      return { label: "Planned", className: "text-sky-300 bg-sky-500/10 border-sky-500/30" };
  }
}
