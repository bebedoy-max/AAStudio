// =============================================================================
// Provider flags & Global Brain — pengaturan platform yang dikelola admin di
// Admin → Pengaturan Halaman → tab "Provider" / "Global Brain".
//
// • provider_settings : provider mana yang sementara dinonaktifkan. Provider
//   yang disabled hilang dari Token Manager & Routing Provider.
// • global_brain      : API Brain milik platform yang dipakai sebagai fallback
//   ketika user belum punya key Brain sendiri (atau key-nya kena limit).
//   Key-nya TIDAK pernah dikirim ke browser — hanya dibaca server.
// =============================================================================

import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type ProviderFlagId =
  | "gemini"
  | "openai"
  | "claude"
  | "perplexity"
  | "weavy"
  | "wavespeed"
  | "magnific"
  | "roboneo"
  | "framia"
  | "leonardo"
  | "firefly"
  | "elevenlabs"
  | "render";

export const PROVIDER_FLAGS: { id: ProviderFlagId; label: string; group: string }[] = [
  { id: "gemini", label: "Google Gemini", group: "Brain / Image" },
  { id: "openai", label: "OpenAI", group: "Brain / Image" },
  { id: "claude", label: "Anthropic Claude", group: "Brain / Image" },
  { id: "perplexity", label: "Perplexity", group: "Brain / Image" },
  { id: "weavy", label: "Weavy", group: "Image / Video / Motion" },
  { id: "wavespeed", label: "Wavespeed", group: "Image / Video / Motion" },
  { id: "magnific", label: "Magnific", group: "Image / Video / Motion" },
  { id: "roboneo", label: "Roboneo", group: "Image / Video / Motion" },
  { id: "framia", label: "Framia", group: "Image / Video / Motion" },
  { id: "leonardo", label: "Leonardo.ai", group: "Image / Video / Motion" },
  { id: "firefly", label: "Adobe Firefly", group: "Image / Video / Motion" },
  { id: "elevenlabs", label: "ElevenLabs", group: "Voice" },
  { id: "render", label: "Cloud Render (Shotstack / Creatomate)", group: "Render" },
];

export const LS_PROVIDER_FLAGS = "aatools.platform.providerFlags";
export const LS_GLOBAL_BRAIN = "aatools.platform.globalBrain";
export const PLATFORM_FLAGS_EVENT = "aatools:platform-flags-changed";

export type ProviderFlagMap = Record<string, boolean>;

function readCache<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function readProviderFlags(): ProviderFlagMap {
  return readCache<ProviderFlagMap>(LS_PROVIDER_FLAGS, {});
}

export function isProviderEnabled(id: string, flags?: ProviderFlagMap): boolean {
  const map = flags ?? readProviderFlags();
  return map[id] !== false;
}

export function globalBrainEnabled(): boolean {
  return readCache<boolean>(LS_GLOBAL_BRAIN, false) === true;
}

let inflight: Promise<void> | null = null;

/** Ambil flags terbaru dari server + simpan cache lokal. */
export async function refreshPlatformFlags(): Promise<void> {
  if (typeof window === "undefined") return;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const [{ data: rows }, { data: gb }] = await Promise.all([
        supabase.from("provider_settings" as never).select("id, enabled"),
        supabase.rpc("global_brain_enabled" as never),
      ]);
      const map: ProviderFlagMap = {};
      ((rows ?? []) as unknown as { id: string; enabled: boolean }[]).forEach((r) => {
        map[r.id] = r.enabled !== false;
      });
      localStorage.setItem(LS_PROVIDER_FLAGS, JSON.stringify(map));
      localStorage.setItem(LS_GLOBAL_BRAIN, JSON.stringify(gb === true));
      window.dispatchEvent(new CustomEvent(PLATFORM_FLAGS_EVENT));
    } catch {
      /* offline / tabel belum dibuat → pakai default semua aktif */
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

/** Hook: daftar provider yang aktif untuk user. */
export function useProviderFlags() {
  const [flags, setFlags] = useState<ProviderFlagMap>(() => readProviderFlags());

  useEffect(() => {
    const sync = () => setFlags(readProviderFlags());
    window.addEventListener(PLATFORM_FLAGS_EVENT, sync as EventListener);
    window.addEventListener("storage", sync);
    void refreshPlatformFlags();
    return () => {
      window.removeEventListener(PLATFORM_FLAGS_EVENT, sync as EventListener);
      window.removeEventListener("storage", sync);
    };
  }, []);

  return {
    flags,
    isEnabled: (id: string) => isProviderEnabled(id, flags),
  };
}

/** Token Manager pakai key sendiri — petakan ke flag id. */
export function tokenTabFlagIds(tabKey: string): ProviderFlagId[] {
  if (tabKey === "brain") return ["gemini", "openai"];
  if (tabKey === "eleven") return ["elevenlabs"];
  return [tabKey as ProviderFlagId];
}
