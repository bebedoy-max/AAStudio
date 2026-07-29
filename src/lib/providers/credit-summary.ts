// Real token/credit summary per provider, read from Token / API Manager storage.
// Weavy tokens store `credits`, other providers store `balance` (may be null
// when the provider does not expose a balance).
import { useEffect, useState } from "react";

export type ProviderCredit = { tokens: number; credits: number | null };

const STORAGE_KEY: Record<string, string> = {
  weavy: "aatools.weavy.tokens",
  wavespeed: "aatools.wavespeed.keys",
  magnific: "aatools.magnific.keys",
  roboneo: "aatools.roboneo.keys",
  framia: "aatools.framia.keys",
  firefly: "aatools.firefly.keys",
  leonardo: "aatools.leonardo.keys",
  eleven: "aatools.eleven",
  gemini: "aatools.brain.geminiKeys",
  openai: "aatools.brain.openaiKeys",
};

type Entry = { credits?: number | null; balance?: number | null };

export function readProviderCredit(provider: string): ProviderCredit {
  if (typeof window === "undefined") return { tokens: 0, credits: null };
  const key = STORAGE_KEY[provider] ?? `aatools.${provider}.keys`;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return { tokens: 0, credits: null };
    const parsed = JSON.parse(raw);
    const list: unknown[] = Array.isArray(parsed)
      ? parsed
      : Array.isArray(parsed?.keys)
        ? parsed.keys
        : [];
    let sum = 0;
    let known = false;
    for (const item of list) {
      if (!item || typeof item !== "object") continue;
      const e = item as Entry;
      const v = e.credits ?? e.balance;
      if (typeof v === "number" && Number.isFinite(v)) {
        sum += v;
        known = true;
      }
    }
    return { tokens: list.length, credits: known ? sum : null };
  } catch {
    return { tokens: 0, credits: null };
  }
}

export function useProviderCredit(provider: string): ProviderCredit {
  const [state, setState] = useState<ProviderCredit>({ tokens: 0, credits: null });
  useEffect(() => {
    const sync = () => setState(readProviderCredit(provider));
    sync();
    window.addEventListener("aatools:keys-changed", sync);
    window.addEventListener("aatools:tokens-synced", sync);
    window.addEventListener("storage", sync);
    window.addEventListener("focus", sync);
    return () => {
      window.removeEventListener("aatools:keys-changed", sync);
      window.removeEventListener("aatools:tokens-synced", sync);
      window.removeEventListener("storage", sync);
      window.removeEventListener("focus", sync);
    };
  }, [provider]);
  return state;
}
