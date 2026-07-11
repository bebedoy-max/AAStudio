// useSticky — drop-in replacement for useState yang persist ke module-level
// store, sehingga state tetap hidup ketika komponen unmount karena user pindah
// route dan kembali lagi. API identik dengan useState (termasuk functional
// updater), jadi call-site tidak perlu berubah.
import { useCallback, type Dispatch, type SetStateAction } from "react";
import { createRunStore, type RunStore } from "./run-store";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const stickyStores = new Map<string, RunStore<{ value: any }>>();

export function useSticky<T>(key: string, initial: T | (() => T)): [T, Dispatch<SetStateAction<T>>] {
  let store = stickyStores.get(key) as RunStore<{ value: T }> | undefined;
  if (!store) {
    const initValue = typeof initial === "function" ? (initial as () => T)() : initial;
    store = createRunStore<{ value: T }>({ value: initValue });
    stickyStores.set(key, store);
  }
  const { value } = store.use();
  const localStore = store;
  const setValue = useCallback<Dispatch<SetStateAction<T>>>(
    (next) => {
      localStore.set((prev) => ({
        value:
          typeof next === "function"
            ? (next as (p: T) => T)(prev.value)
            : next,
      }));
    },
    [localStore],
  );
  return [value, setValue];
}

export function resetSticky(key: string) {
  stickyStores.delete(key);
}
