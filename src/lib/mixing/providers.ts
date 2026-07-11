// Multi-provider registry for the Mixing modules.
// Reads the same localStorage keys used by Token/API Manager so users don't re-enter keys.
//
// Actual keys used by Mixing (all already present in Token Manager):
//   • Brain  → Gemini            (aatools.brain.geminiKeys)
//   • STT    → ElevenLabs STT    (aatools.eleven)
//   • Voice  → ElevenLabs TTS    (aatools.eleven)
//   • Video  → Wavespeed / Weavy / Magnific (optional, only for reframe/upscale/lip-sync)
//
// There is no separate "Render" key — final composition is a client-side
// bundle (timeline JSON + SRT + audio) that any NLE (CapCut/Premiere/DaVinci)
// can import. If Wavespeed/Weavy keys are present they are used to enqueue an
// optional server render pipeline.

export type ProviderKind = "brain" | "stt" | "voice" | "video";

export type ProviderEntry = {
  id: string;
  label: string;
  kind: ProviderKind;
  available: boolean;
  keys: string[];
  capabilities?: { lipSync?: boolean; reframe?: boolean; upscale?: boolean };
};

function readArray(key: string): string[] {
  if (typeof window === "undefined") return [];
  try {
    const v = localStorage.getItem(key);
    if (!v) return [];
    const parsed = JSON.parse(v);
    if (Array.isArray(parsed)) return parsed.filter((s): s is string => typeof s === "string" && s.trim().length > 0);
    if (typeof parsed === "string" && parsed.trim().length > 0) return [parsed];
    return [];
  } catch {
    return [];
  }
}

function readEleven(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const v = localStorage.getItem("aatools.eleven");
    if (!v) return [];
    const parsed = JSON.parse(v);
    if (Array.isArray(parsed)) return parsed.map((x) => (typeof x === "string" ? x : x?.key)).filter(Boolean);
    if (parsed?.keys && Array.isArray(parsed.keys)) return parsed.keys.filter((k: unknown): k is string => typeof k === "string");
    if (parsed?.key) return [parsed.key];
    return [];
  } catch {
    return [];
  }
}

function readWavespeed(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const v = localStorage.getItem("aatools.wavespeed.keys");
    if (!v) return [];
    const parsed = JSON.parse(v);
    if (Array.isArray(parsed)) return parsed.map((x) => (typeof x === "string" ? x : x?.key)).filter(Boolean);
    return [];
  } catch {
    return [];
  }
}

function readWeavy(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const v = localStorage.getItem("aatools.weavy.tokens");
    if (!v) return [];
    const parsed = JSON.parse(v);
    if (Array.isArray(parsed)) return parsed.map((x) => (typeof x === "string" ? x : x?.token)).filter(Boolean);
    return [];
  } catch {
    return [];
  }
}

export function listProviders(kind: ProviderKind): ProviderEntry[] {
  const gemini = readArray("aatools.brain.geminiKeys");
  const eleven = readEleven();
  const wavespeed = readWavespeed();
  const weavy = readWeavy();
  const magnific = readArray("aatools.magnific.keys");

  switch (kind) {
    case "brain":
      return [
        { id: "gemini", label: "Gemini (Brain)", kind, available: gemini.length > 0, keys: gemini },
      ];
    case "stt":
      return [
        { id: "eleven", label: "ElevenLabs STT", kind, available: eleven.length > 0, keys: eleven },
      ];
    case "voice":
      return [
        {
          id: "eleven",
          label: "ElevenLabs (Multilingual + Voice Clone)",
          kind,
          available: eleven.length > 0,
          keys: eleven,
        },
      ];
    case "video":
      return [
        {
          id: "wavespeed",
          label: "Wavespeed (I2V / Reframe / Upscale)",
          kind,
          available: wavespeed.length > 0,
          keys: wavespeed,
          capabilities: { reframe: true, upscale: true, lipSync: true },
        },
        {
          id: "weavy",
          label: "Weavy Recipes",
          kind,
          available: weavy.length > 0,
          keys: weavy,
          capabilities: { reframe: true },
        },
        {
          id: "magnific",
          label: "Magnific (Upscale / Enhance)",
          kind,
          available: magnific.length > 0,
          keys: magnific,
          capabilities: { upscale: true },
        },
      ];
  }
}

export type Health = "ok" | "no-key" | "unknown";

export function health(kind: ProviderKind): { status: Health; providers: ProviderEntry[] } {
  const providers = listProviders(kind);
  const status: Health = providers.some((p) => p.available) ? "ok" : "no-key";
  return { status, providers };
}

export function headersForBrain(): Record<string, string> {
  const gemini = readArray("aatools.brain.geminiKeys");
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (gemini.length) h["x-user-gemini-keys"] = gemini.join(",");
  return h;
}

export function headersForVoice(): Record<string, string> {
  const eleven = readEleven();
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (eleven.length) h["x-user-elevenlabs-keys"] = eleven.join(",");
  return h;
}

export function headersForStt(): Record<string, string> {
  const eleven = readEleven();
  const h: Record<string, string> = {};
  if (eleven.length) h["x-user-elevenlabs-keys"] = eleven.join(",");
  return h;
}

export function readShotstackKeys(): string[] {
  return readArray("aatools.shotstack.keys");
}

export function readCreatomateKeys(): string[] {
  return readArray("aatools.creatomate.keys");
}

export function headersForRender(): Record<string, string> {
  const wavespeed = readWavespeed();
  const weavy = readWeavy();
  const shotstack = readShotstackKeys();
  const creatomate = readCreatomateKeys();
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (wavespeed.length) h["x-user-wavespeed-keys"] = wavespeed.join(",");
  if (weavy.length) h["x-user-weavy-keys"] = weavy.join(",");
  if (shotstack.length) h["x-user-shotstack-keys"] = shotstack.join(",");
  if (creatomate.length) h["x-user-creatomate-keys"] = creatomate.join(",");
  return h;
}

export type CloudRenderProvider = "shotstack" | "creatomate";
export type CloudRenderStatus = {
  shotstack: { available: boolean; count: number };
  creatomate: { available: boolean; count: number };
};
export function cloudRenderStatus(): CloudRenderStatus {
  const s = readShotstackKeys();
  const c = readCreatomateKeys();
  return {
    shotstack: { available: s.length > 0, count: s.length },
    creatomate: { available: c.length > 0, count: c.length },
  };
}

