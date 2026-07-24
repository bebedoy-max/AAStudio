// Global notification store for long-running generate jobs.
// Uses useSyncExternalStore so components across routes share state.
import { useSyncExternalStore } from "react";

export type NotificationStatus = "running" | "done" | "failed";

export type AppNotification = {
  id: string;
  label: string;
  detail?: string;
  route?: string;
  status: NotificationStatus;
  read: boolean;
  startedAt: number;
  endedAt?: number;
};

type State = { items: AppNotification[] };

let state: State = { items: [] };
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}
function setState(updater: (prev: State) => State) {
  state = updater(state);
  emit();
}
function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}
function getSnapshot(): State {
  return state;
}

export function useNotifications(): State {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function hasRunningTasks(): boolean {
  return state.items.some((n) => n.status === "running");
}

export type StartOptions = {
  label: string;
  detail?: string;
  route?: string;
};

export function startNotification(id: string, opts: StartOptions): void {
  const now = Date.now();
  setState((prev) => {
    const existing = prev.items.find((n) => n.id === id);
    const next: AppNotification = existing
      ? { ...existing, ...opts, status: "running", read: false, startedAt: now, endedAt: undefined }
      : {
          id,
          label: opts.label,
          detail: opts.detail,
          route: opts.route,
          status: "running",
          read: false,
          startedAt: now,
        };
    const others = prev.items.filter((n) => n.id !== id);
    return { items: [next, ...others] };
  });
}

export type FinishOptions = { detail?: string; route?: string };

export function finishNotification(id: string, opts: FinishOptions = {}): void {
  const now = Date.now();
  setState((prev) => ({
    items: prev.items.map((n) =>
      n.id === id
        ? {
            ...n,
            status: "done",
            detail: opts.detail ?? n.detail,
            route: opts.route ?? n.route,
            read: false,
            endedAt: now,
          }
        : n,
    ),
  }));
}

export function failNotification(id: string, detail?: string): void {
  const now = Date.now();
  setState((prev) => ({
    items: prev.items.map((n) =>
      n.id === id
        ? { ...n, status: "failed", detail: detail ?? n.detail, read: false, endedAt: now }
        : n,
    ),
  }));
}

export function markAllRead(): void {
  setState((prev) => ({ items: prev.items.map((n) => ({ ...n, read: true })) }));
}

export function removeNotification(id: string): void {
  setState((prev) => ({ items: prev.items.filter((n) => n.id !== id) }));
}

export function clearFinished(): void {
  setState((prev) => ({ items: prev.items.filter((n) => n.status === "running") }));
}
