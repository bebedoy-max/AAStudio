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

export function setHandoff(payload: Omit<CreativeHandoff, "createdAt">) {
  if (typeof window === "undefined") return;
  const value: CreativeHandoff = { ...payload, createdAt: Date.now() };
  sessionStorage.setItem(KEY, JSON.stringify(value));
}

export function consumeHandoff(): CreativeHandoff | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    sessionStorage.removeItem(KEY);
    return JSON.parse(raw) as CreativeHandoff;
  } catch {
    return null;
  }
}

export function peekHandoff(): CreativeHandoff | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as CreativeHandoff) : null;
  } catch {
    return null;
  }
}

export const WORKFLOW_ROUTES: Record<CreativeHandoff["workflow"], string> = {
  "narrative-video": "/generate/naratif",
  motion: "/generate/motion",
  storyboard: "/generate/storyboard",
  "bulk-fashion": "/generate/bulk-fashion",
  "image-to-video": "/generate/image-to-video",
};
