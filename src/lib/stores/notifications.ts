// Global notification store — tracks running & completed generate processes.
// Any page can call startNotification/finishNotification/failNotification.
// The header bell reads this store and renders a live dropdown.
import { useSyncExternalStore } from "react";

export type NotificationStatus = "running" | "done" | "error";

export type AppNotification = {
  id: string;
  label: string;      // "Generate Storyboard"
  detail?: string;    // "Jaket kulit vintage"
  route?: string;     // where to navigate on click
  status: NotificationStatus;
  startedAt: number;
  endedAt?: number;
  read?: boolean;
};

type State = { items: AppNotification[] };

let state: State = { items: [] };
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

function upsert(n: AppNotification) {
  const idx = state.items.findIndex((x) => x.id === n.id);
  const items = state.items.slice();
  if (idx >= 0) items[idx] = { ...items[idx], ...n };
  else items.unshift(n);
  // Trim: keep 30 latest
  state = { items: items.slice(0, 30) };
  emit();
}

export function startNotification(id: string, opts: { label: string; detail?: string; route?: string }): void {
  upsert({
    id,
    label: opts.label,
    detail: opts.detail,
    route: opts.route,
    status: "running",
    startedAt: Date.now(),
    read: false,
  });
}

export function finishNotification(id: string, opts?: { detail?: string; route?: string }): void {
  const cur = state.items.find((x) => x.id === id);
  if (!cur) {
    upsert({
      id,
      label: opts?.detail || "Selesai",
      detail: opts?.detail,
      route: opts?.route,
      status: "done",
      startedAt: Date.now(),
      endedAt: Date.now(),
      read: false,
    });
    return;
  }
  upsert({
    ...cur,
    status: "done",
    endedAt: Date.now(),
    detail: opts?.detail ?? cur.detail,
    route: opts?.route ?? cur.route,
    read: false,
  });
}

export function failNotification(id: string, detail?: string): void {
  const cur = state.items.find((x) => x.id === id);
  const base: AppNotification = cur ?? {
    id,
    label: "Proses gagal",
    status: "error",
    startedAt: Date.now(),
  };
  upsert({ ...base, status: "error", detail: detail ?? base.detail, endedAt: Date.now(), read: false });
}

export function markAllRead(): void {
  state = { items: state.items.map((x) => ({ ...x, read: true })) };
  emit();
}

export function removeNotification(id: string): void {
  state = { items: state.items.filter((x) => x.id !== id) };
  emit();
}

export function clearFinished(): void {
  state = { items: state.items.filter((x) => x.status === "running") };
  emit();
}

const getSnap = () => state;
export function useNotifications(): State {
  return useSyncExternalStore(subscribe, getSnap, getSnap);
}
