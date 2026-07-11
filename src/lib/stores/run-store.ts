// Module-level persistent store so long-running generate jobs (storyboard,
// motion, naratif) survive route unmount. Uses useSyncExternalStore.
import { useSyncExternalStore } from "react";

export type RunStore<T> = {
  get: () => T;
  set: (next: T | ((prev: T) => T)) => void;
  patch: (patch: Partial<T>) => void;
  use: () => T;
};

export function createRunStore<T extends object>(initial: T): RunStore<T> {
  let value = initial;
  const listeners = new Set<() => void>();
  const subscribe = (l: () => void) => {
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  };
  const getSnap = () => value;
  const set: RunStore<T>["set"] = (next) => {
    value = typeof next === "function" ? (next as (p: T) => T)(value) : next;
    listeners.forEach((l) => l());
  };
  const patch: RunStore<T>["patch"] = (p) => set((v) => ({ ...v, ...p }));
  return {
    get: getSnap,
    set,
    patch,
    use: () => useSyncExternalStore(subscribe, getSnap, getSnap),
  };
}
