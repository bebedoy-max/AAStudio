// AI Memory for Mixing preferences — localStorage-backed per browser.

export type MixingMemory = {
  clipper?: {
    subtitleStyle?: string;
    transition?: string;
    aspectRatio?: string;
    zoomKind?: string;
    lastClipDuration?: number;
  };
  dubbing?: {
    targetLanguage?: string;
    voice?: string;
    translationMode?: string;
    aspectRatio?: string;
  };
};

const KEY = "aatools.mixing.memory";

export function loadMemory(): MixingMemory {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(KEY) || "{}") as MixingMemory;
  } catch {
    return {};
  }
}

export function saveMemory(patch: MixingMemory): void {
  if (typeof window === "undefined") return;
  const current = loadMemory();
  const next: MixingMemory = {
    clipper: { ...(current.clipper ?? {}), ...(patch.clipper ?? {}) },
    dubbing: { ...(current.dubbing ?? {}), ...(patch.dubbing ?? {}) },
  };
  localStorage.setItem(KEY, JSON.stringify(next));
}
