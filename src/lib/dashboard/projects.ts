// Local project workspace store — localStorage-backed, useSyncExternalStore.
// Tracks project cards created from generate/research flows.
import { useSyncExternalStore } from "react";

export type ProjectKind = "narrative" | "storyboard" | "motion" | "bulk-fashion" | "image-to-video" | "research";

export type Project = {
  id: string;
  title: string;
  kind: ProjectKind;
  niche?: string;
  progress: number; // 0..100
  counts: { videos?: number; images?: number; storyboards?: number; ideas?: number };
  pinned?: boolean;
  favorite?: boolean;
  route?: string;
  createdAt: number;
  updatedAt: number;
};

const KEY = "aatools.dashboard.projects";

function load(): Project[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    // Clean out legacy demo rows shipped in earlier builds.
    const filtered = (arr as Project[]).filter((p) => !String(p.id).startsWith("seed-"));
    if (filtered.length !== arr.length) {
      try { localStorage.setItem(KEY, JSON.stringify(filtered)); } catch { /* ignore */ }
    }
    return filtered;
  } catch {
    return [];
  }
}

let state: Project[] = load();
const listeners = new Set<() => void>();
const emit = () => {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // ignore
  }
  listeners.forEach((l) => l());
};
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

export function useProjects(): Project[] {
  return useSyncExternalStore(subscribe, () => state, () => state);
}

export function pinProject(id: string, pinned: boolean): void {
  state = state.map((p) => (p.id === id ? { ...p, pinned, updatedAt: Date.now() } : p));
  emit();
}

export function favoriteProject(id: string, favorite: boolean): void {
  state = state.map((p) => (p.id === id ? { ...p, favorite, updatedAt: Date.now() } : p));
  emit();
}

export function upsertProject(input: Omit<Project, "createdAt" | "updatedAt" | "progress" | "counts"> & Partial<Pick<Project, "progress" | "counts">>): Project {
  const now = Date.now();
  const idx = state.findIndex((p) => p.id === input.id);
  if (idx >= 0) {
    const merged: Project = { ...state[idx], ...input, updatedAt: now };
    state = state.map((p, i) => (i === idx ? merged : p));
    emit();
    return merged;
  }
  const created: Project = {
    progress: 0,
    counts: {},
    ...input,
    createdAt: now,
    updatedAt: now,
  };
  state = [created, ...state];
  emit();
  return created;
}

export function removeProject(id: string): void {
  state = state.filter((p) => p.id !== id);
  emit();
}

const KIND_ROUTE: Record<ProjectKind, string> = {
  narrative: "/generate/naratif",
  storyboard: "/generate/storyboard",
  motion: "/generate/motion",
  "bulk-fashion": "/generate/bulk-fashion",
  "image-to-video": "/generate/image-to-video",
  research: "/",
};

function slug(s: string): string {
  return (s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
}

/**
 * Record a generation event → creates or updates a real project entry
 * on the dashboard workspace. Same (kind + title) merges into the same row
 * and increments the counters.
 */
export function trackGeneration(input: {
  kind: ProjectKind;
  title: string;
  niche?: string;
  counts?: Project["counts"];
  progress?: number;
}): Project {
  const now = Date.now();
  const id = `${input.kind}:${slug(input.title) || now.toString(36)}`;
  const idx = state.findIndex((p) => p.id === id);
  if (idx >= 0) {
    const prev = state[idx];
    const mergedCounts: Project["counts"] = { ...prev.counts };
    for (const [k, v] of Object.entries(input.counts || {})) {
      const key = k as keyof Project["counts"];
      mergedCounts[key] = (mergedCounts[key] || 0) + (v || 0);
    }
    const merged: Project = {
      ...prev,
      title: input.title || prev.title,
      niche: input.niche || prev.niche,
      counts: mergedCounts,
      progress: Math.max(prev.progress || 0, input.progress ?? Math.min(100, (prev.progress || 0) + 10)),
      updatedAt: now,
    };
    state = state.map((p, i) => (i === idx ? merged : p));
    emit();
    return merged;
  }
  const created: Project = {
    id,
    title: input.title || "(untitled)",
    kind: input.kind,
    niche: input.niche,
    route: KIND_ROUTE[input.kind],
    progress: input.progress ?? 10,
    counts: input.counts || {},
    createdAt: now,
    updatedAt: now,
  };
  state = [created, ...state];
  emit();
  return created;
}

