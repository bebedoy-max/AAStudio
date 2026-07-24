// Cross-route handoff for Creative Dashboard → generate modules.
// Payload persisted in sessionStorage; target route consumes once on mount.

export type CreativeHandoff = {
  workflow: "narrative-video" | "motion" | "storyboard" | "bulk-fashion" | "image-to-video";
  title: string;
  hook: string;
  description: string;
  creative_angle?: string;
  thumbnail_prompt?: string;
  thumbnail_data_url?: string;
  keyword?: string;
  platform?: string;
  tone?: string;
  duration?: string;
  sourceUrl?: string;
  autoScrape?: boolean;
  createdAt: number;
};

const KEY = "creative:handoff";

// Large fields (data URLs) are kept in-memory to avoid sessionStorage quota.
// SPA navigation preserves module state, so this survives route transitions.
let memoryLarge: { thumbnail_data_url?: string } | null = null;

function stripLarge(payload: CreativeHandoff): CreativeHandoff {
  const { thumbnail_data_url, ...rest } = payload;
  void thumbnail_data_url;
  return rest as CreativeHandoff;
}

function safeSet(value: CreativeHandoff) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(value));
  } catch {
    // Quota exceeded — retry without large fields (already stored in memory).
    try {
      sessionStorage.setItem(KEY, JSON.stringify(stripLarge(value)));
    } catch {
      /* ignore */
    }
  }
}

export function setHandoff(payload: Omit<CreativeHandoff, "createdAt">) {
  if (typeof window === "undefined") return;
  const value: CreativeHandoff = { ...payload, createdAt: Date.now() };
  memoryLarge = payload.thumbnail_data_url ? { thumbnail_data_url: payload.thumbnail_data_url } : null;
  safeSet(value);
}

function hydrate(raw: string): CreativeHandoff | null {
  try {
    const parsed = JSON.parse(raw) as CreativeHandoff;
    if (!parsed.thumbnail_data_url && memoryLarge?.thumbnail_data_url) {
      parsed.thumbnail_data_url = memoryLarge.thumbnail_data_url;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function consumeHandoff(): CreativeHandoff | null {
  if (typeof window === "undefined") return null;
  const raw = sessionStorage.getItem(KEY);
  if (!raw) {
    memoryLarge = null;
    return null;
  }
  sessionStorage.removeItem(KEY);
  const out = hydrate(raw);
  memoryLarge = null;
  return out;
}

export function peekHandoff(): CreativeHandoff | null {
  if (typeof window === "undefined") return null;
  const raw = sessionStorage.getItem(KEY);
  return raw ? hydrate(raw) : null;
}


export const WORKFLOW_ROUTES: Record<CreativeHandoff["workflow"], string> = {
  "narrative-video": "/generate/naratif",
  motion: "/generate/motion",
  storyboard: "/generate/storyboard",
  "bulk-fashion": "/generate/bulk-fashion",
  "image-to-video": "/generate/image-to-video",
};
