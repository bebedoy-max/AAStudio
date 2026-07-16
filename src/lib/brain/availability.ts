// Utility to check if API keys required by AI-powered features are configured.
// Keys are stored client-side in localStorage by the Token Manager.

export type KeyRequirement = "brain" | "eleven";

function readArray(key: string): string[] {
  if (typeof window === "undefined") return [];
  try {
    const v = localStorage.getItem(key);
    if (!v) return [];
    const parsed = JSON.parse(v);
    if (Array.isArray(parsed)) {
      return parsed
        .map((x) => (typeof x === "string" ? x : (x?.key ?? x?.token)))
        .filter((s): s is string => typeof s === "string" && s.trim().length > 0);
    }
    if (parsed?.keys && Array.isArray(parsed.keys)) {
      return parsed.keys.filter((k: unknown): k is string => typeof k === "string" && k.trim().length > 0);
    }
    if (typeof parsed === "string" && parsed.trim().length > 0) return [parsed];
    if (typeof parsed?.key === "string" && parsed.key.trim().length > 0) return [parsed.key];
    return [];
  } catch {
    return [];
  }
}

export function hasBrainKey(): boolean {
  return readArray("aatools.brain.geminiKeys").length > 0 || readArray("aatools.brain.openaiKeys").length > 0;
}

export function hasElevenKey(): boolean {
  return readArray("aatools.eleven").length > 0;
}

export function checkKey(req: KeyRequirement): boolean {
  return req === "brain" ? hasBrainKey() : hasElevenKey();
}

export const KEY_LABELS: Record<KeyRequirement, string> = {
  brain: "AI Brain (Gemini / OpenAI)",
  eleven: "ElevenLabs Voice",
};

export const KEY_DESCRIPTIONS: Record<KeyRequirement, string> = {
  brain: "Diperlukan untuk mengolah dan mengenerate data & informasi menggunakan AI.",
  eleven: "Diperlukan untuk menghasilkan voice-over / dubbing suara.",
};

// Broadcast when Token Manager updates any aatools.* key so other tabs/components
// (dashboards, guards) can refresh without a page reload.
export function notifyKeysChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("aatools:keys-changed"));
}
