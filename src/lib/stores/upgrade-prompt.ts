// Global store to open the "Upgrade to premium" dialog from anywhere.
import { useSyncExternalStore } from "react";

type State = { open: boolean; featureKey?: string };
let state: State = { open: false };
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function openUpgradePrompt(featureKey?: string): void {
  state = { open: true, featureKey };
  emit();
}
export function closeUpgradePrompt(): void {
  state = { open: false };
  emit();
}

const getSnap = () => state;
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

export function useUpgradePrompt(): State {
  return useSyncExternalStore(subscribe, getSnap, getSnap);
}