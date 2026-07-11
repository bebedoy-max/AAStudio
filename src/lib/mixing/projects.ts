// Project Workspace for Mixing modules — localStorage-backed per browser.
// (No DB migration; the existing ai_content_plan / ai_influencer_memory tables
// belong to AI Influencer and have unrelated schemas.)

import type { ClipperProject, DubbingProject } from "./types";

type Kind = "clipper" | "dubbing";

const KEY = (kind: Kind) => `aatools.mixing.${kind}.projects`;

export type ProjectSummary = {
  id: string;
  name: string;
  kind: Kind;
  updatedAt: number;
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

export function listProjects(kind: Kind): ProjectSummary[] {
  const all = readAll<ClipperProject | DubbingProject>(kind);
  return Object.values(all)
    .map((p) => ({ id: p.id, name: p.name, kind, updatedAt: p.updatedAt }))
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export function saveClipper(p: ClipperProject): void {
  const all = readAll<ClipperProject>("clipper");
  all[p.id] = stripBlobs({ ...p, updatedAt: Date.now() });
  writeAll("clipper", all);
}

export function loadClipper(id: string): ClipperProject | null {
  const all = readAll<ClipperProject>("clipper");
  return all[id] ?? null;
}

export function saveDubbing(p: DubbingProject): void {
  const all = readAll<DubbingProject>("dubbing");
  all[p.id] = stripBlobs({ ...p, updatedAt: Date.now() });
  writeAll("dubbing", all);
}

export function loadDubbing(id: string): DubbingProject | null {
  const all = readAll<DubbingProject>("dubbing");
  return all[id] ?? null;
}

export function deleteProject(kind: Kind, id: string): void {
  const all = readAll(kind);
  delete all[id];
  writeAll(kind, all);
}
