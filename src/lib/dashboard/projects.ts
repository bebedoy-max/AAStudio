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
    if (!raw) return seed();
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? (arr as Project[]) : seed();
  } catch {
    return seed();
  }
}

function seed(): Project[] {
  const now = Date.now();
  const items: Project[] = [
    {
      id: "seed-science",
      title: "Science Channel",
      kind: "narrative",
      niche: "Science / What If",
      progress: 68,
      counts: { videos: 32, images: 145, storyboards: 12 },
      pinned: true,
      route: "/generate/naratif",
      createdAt: now - 86400000 * 6,
      updatedAt: now - 3600_000 * 4,
    },
    {
      id: "seed-fashion",
      title: "AI Fashion Lookbook",
      kind: "bulk-fashion",
      niche: "Apparel",
      progress: 42,
      counts: { images: 88, videos: 6 },
      favorite: true,
      route: "/generate/bulk-fashion",
      createdAt: now - 86400000 * 3,
      updatedAt: now - 3600_000 * 12,
    },
    {
      id: "seed-affiliate",
      title: "Affiliate Blender Series",
      kind: "storyboard",
      niche: "Product / Affiliate",
      progress: 24,
      counts: { storyboards: 4, images: 22 },
      route: "/generate/storyboard",
      createdAt: now - 86400000 * 1,
      updatedAt: now - 3600_000 * 2,
    },
  ];
  try {
    localStorage.setItem(KEY, JSON.stringify(items));
  } catch {
    // ignore
  }
  return items;
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
