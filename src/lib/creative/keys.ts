// Client-side helper: read AI keys from localStorage (set via Token/API Manager).
// Returns comma-joined key strings ready to pass in headers to backend router.

export type CreativeKeys = { gemini: string; openai: string };

function read(key: string): string[] {
  if (typeof window === "undefined") return [];
  try {
    const v = localStorage.getItem(key);
    if (!v) return [];
    const parsed = JSON.parse(v);
    if (Array.isArray(parsed)) {
      return parsed.filter((k): k is string => typeof k === "string" && k.trim().length > 0);
    }
    return [];
  } catch {
    return [];
  }
}

export function getCreativeKeys(): CreativeKeys {
  return {
    gemini: read("aatools.brain.geminiKeys").join(","),
    openai: read("aatools.brain.openaiKeys").join(","),
  };
}

export function headersFor(keys: CreativeKeys): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (keys.gemini) h["x-user-gemini-keys"] = keys.gemini;
  if (keys.openai) h["x-user-openai-keys"] = keys.openai;
  return h;
}
