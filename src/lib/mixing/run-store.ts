// Persistent per-module state for Mixing (Clipper + Dubbing).
// Survives route unmount so long-running analyze/render jobs don't lose UI state.
import { createRunStore } from "@/lib/stores/run-store";
import type { ClipperProject, DubbingProject, MixingStage, MixingProgress } from "./types";

export type ClipperState = {
  project: ClipperProject | null;
  progress: MixingProgress;
  busy: boolean;
  log: string[];
};

export type DubbingState = {
  project: DubbingProject | null;
  progress: MixingProgress;
  busy: boolean;
  log: string[];
};

const emptyProgress = (): MixingProgress => ({ stage: "idle", pct: 0, message: "" });

export const clipperStore = createRunStore<ClipperState>({
  project: null,
  progress: emptyProgress(),
  busy: false,
  log: [],
});

export const dubbingStore = createRunStore<DubbingState>({
  project: null,
  progress: emptyProgress(),
  busy: false,
  log: [],
});

export function pushLog(store: typeof clipperStore | typeof dubbingStore, msg: string) {
  const ts = new Date().toLocaleTimeString();
  store.patch({ log: [...store.get().log.slice(-99), `[${ts}] ${msg}`] } as never);
}

export function setStage(
  store: typeof clipperStore | typeof dubbingStore,
  stage: MixingStage,
  pct: number,
  message: string,
) {
  store.patch({ progress: { stage, pct, message } } as never);
}
