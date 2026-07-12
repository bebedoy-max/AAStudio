// Project Workspace for Mixing modules — localStorage-backed per browser.
// (No DB migration; the existing ai_content_plan / ai_influencer_memory tables
// belong to AI Influencer and have unrelated schemas.)

import type { ClipperProject, DubbingProject, MixingProgress } from "./types";

type Kind = "clipper" | "dubbing";

const KEY = (kind: Kind) => `aatools.mixing.${kind}.projects`;

export type ProjectSummary = {
  id: string;
  name: string;
  kind: Kind;
  updatedAt: number;
  lastProgress?: MixingProgress;
};

function readAll<T>(kind: Kind): Record<string, T> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(KEY(kind)) || "{}") as Record<string, T>;
  } catch {
    return {};
  }
}

function writeAll<T>(kind: Kind, all: Record<string, T>) {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY(kind), JSON.stringify(all));
}

function stripBlobs<T>(v: T): T {
  return JSON.parse(
    JSON.stringify(v, (_k, val) => (typeof val === "string" && val.startsWith("blob:") ? "" : val)),
  ) as T;
}

// In-memory cache holds the FULL project (with blob: URLs intact) so switching
// between projects within one session keeps uploaded video previews alive.
// localStorage still gets a stripped copy (blob URLs die on reload anyway).
const memCache: Record<Kind, Map<string, unknown>> = {
  clipper: new Map(),
  dubbing: new Map(),
};

export function listProjects(kind: Kind): ProjectSummary[] {
  const all = readAll<ClipperProject | DubbingProject>(kind);
  return Object.values(all)
    .map((p) => ({ id: p.id, name: p.name, kind, updatedAt: p.updatedAt, lastProgress: p.lastProgress }))
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export function saveClipper(p: ClipperProject): void {
  const withTs = { ...p, updatedAt: Date.now() };
  memCache.clipper.set(p.id, withTs);
  const all = readAll<ClipperProject>("clipper");
  all[p.id] = stripBlobs(withTs);
  writeAll("clipper", all);
}

export function loadClipper(id: string): ClipperProject | null {
  const cached = memCache.clipper.get(id) as ClipperProject | undefined;
  if (cached) return cached;
  const all = readAll<ClipperProject>("clipper");
  return all[id] ?? null;
}

export function saveDubbing(p: DubbingProject): void {
  const withTs = { ...p, updatedAt: Date.now() };
  memCache.dubbing.set(p.id, withTs);
  const all = readAll<DubbingProject>("dubbing");
  all[p.id] = stripBlobs(withTs);
  writeAll("dubbing", all);
}

export function loadDubbing(id: string): DubbingProject | null {
  const cached = memCache.dubbing.get(id) as DubbingProject | undefined;
  if (cached) return cached;
  const all = readAll<DubbingProject>("dubbing");
  return all[id] ?? null;
}

export function deleteProject(kind: Kind, id: string): void {
  memCache[kind].delete(id);
  const all = readAll(kind);
  delete all[id];
  writeAll(kind, all);
}
