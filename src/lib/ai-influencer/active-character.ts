// Local persistence for the currently selected AI Influencer character.
// Every sub-module (Character, Brain, Planner, Library, Publisher, Analytics)
// reads / writes the same key so switching character stays in sync.

import { useEffect, useState } from "react";

const KEY = "aatools.ai-influencer.active-character";

export function getActiveCharacterId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function setActiveCharacterId(id: string | null) {
  if (typeof window === "undefined") return;
  try {
    if (id) localStorage.setItem(KEY, id);
    else localStorage.removeItem(KEY);
  } catch {}
  window.dispatchEvent(new CustomEvent("ai-influencer:active-changed", { detail: id }));
}

export function useActiveCharacterId(): [string | null, (id: string | null) => void] {
  const [id, setId] = useState<string | null>(() => getActiveCharacterId());
  useEffect(() => {
    const onChange = (e: Event) => {
      const detail = (e as CustomEvent).detail as string | null;
      setId(detail);
    };
    window.addEventListener("ai-influencer:active-changed", onChange as EventListener);
    return () => window.removeEventListener("ai-influencer:active-changed", onChange as EventListener);
  }, []);
  return [id, setActiveCharacterId];
}
