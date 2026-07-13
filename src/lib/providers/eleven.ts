// ElevenLabs provider client — subscription endpoint returns character quota.

export type ElevenSubscription = {
  ok: boolean;
  characterCount: number;
  characterLimit: number;
  remaining: number | null;
  tier?: string;
  method?: "subscription" | "tts-probe";
  note?: string;
};

export async function checkElevenKey(apiKey: string): Promise<ElevenSubscription> {
  const empty: ElevenSubscription = { ok: false, characterCount: 0, characterLimit: 0, remaining: null };
  try {
    const r = await fetch("/api/public/elevenlabs-validate", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Eleven-Key": apiKey },
      body: JSON.stringify({ text: "ok" }),
    });
    if (!r.ok) return empty;
    const d = (await r.json()) as Partial<ElevenSubscription>;
    const characterCount = Number(d.characterCount ?? 0);
    const characterLimit = Number(d.characterLimit ?? 0);
    const remaining = typeof d.remaining === "number"
      ? d.remaining
      : characterLimit > 0
        ? Math.max(0, characterLimit - characterCount)
        : null;
    return {
      ok: !!d.ok,
      characterCount,
      characterLimit,
      remaining,
      tier: typeof d.tier === "string" ? d.tier : undefined,
      method: d.method,
      note: typeof d.note === "string" ? d.note : undefined,
    };
  } catch {
    return empty;
  }
}

// ---- Client-side Speech-To-Text (direct to ElevenLabs, with key rotation) ----
// Called from the browser so we never hit the worker proxy (which was returning
// 502 Bad Gateway when re-uploading audio). ElevenLabs allows CORS with xi-api-key.

export type ElevenSttSegment = { start: number; end: number; text: string };
export type ElevenSttResult = {
  ok: boolean;
  language: string;
  fullText: string;
  segments: ElevenSttSegment[];
  keyIndex?: number;
  error?: string;
  attempts?: string[];
};

function rotatable(status: number): boolean {
  return status === 401 || status === 402 || status === 403 || status === 429 || status >= 500;
}

async function callElevenStt(
  key: string,
  file: Blob,
  filename: string,
  language: string | null,
): Promise<
  | { ok: true; language: string; fullText: string; segments: ElevenSttSegment[] }
  | { ok: false; status: number; body: string }
> {
  const fd = new FormData();
  fd.append("file", file, filename);
  fd.append("model_id", "scribe_v1");
  if (language) fd.append("language_code", language);
  let res: Response;
  try {
    res = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
      method: "POST",
      headers: { "xi-api-key": key },
      body: fd,
    });
  } catch (e) {
    return { ok: false, status: 0, body: `network: ${(e as Error).message}` };
  }
  if (!res.ok) {
    return { ok: false, status: res.status, body: (await res.text().catch(() => "")).slice(0, 300) };
  }
  const data = (await res.json()) as {
    text?: string;
    language_code?: string;
    words?: Array<{ start: number; end: number; text: string }>;
  };
  const segments = (data.words ?? []).reduce<ElevenSttSegment[]>((acc, w) => {
    const last = acc[acc.length - 1];
    if (last && w.start - last.end < 0.8 && last.text.length < 120) {
      last.end = w.end;
      last.text = `${last.text} ${w.text}`.trim();
    } else {
      acc.push({ start: w.start, end: w.end, text: w.text });
    }
    return acc;
  }, []);
  return {
    ok: true,
    language: data.language_code || language || "en",
    fullText: data.text || segments.map((s) => s.text).join(" "),
    segments: segments.length ? segments : [{ start: 0, end: 0, text: data.text || "" }],
  };
}

/**
 * Transcribe an audio blob directly against ElevenLabs, rotating through the
 * provided keys. On a rotatable error (quota/limit/rate/server) it moves to the
 * next key; a non-rotatable error (e.g. bad request) stops early.
 * onLog lets the caller stream progress to the run log.
 */
export async function transcribeElevenClient(
  keys: string[],
  file: Blob,
  filename: string,
  language: string | null,
  onLog?: (msg: string) => void,
): Promise<ElevenSttResult> {
  const attempts: string[] = [];
  if (keys.length === 0) {
    return { ok: false, language: "en", fullText: "", segments: [], error: "No ElevenLabs keys configured." };
  }
  for (let i = 0; i < keys.length; i++) {
    onLog?.(`STT key #${i + 1}/${keys.length} → ElevenLabs (direct)…`);
    const r = await callElevenStt(keys[i], file, filename, language);
    if (r.ok) {
      onLog?.(`STT OK on key #${i + 1} — ${r.segments.length} segments · lang=${r.language}`);
      return {
        ok: true,
        language: r.language,
        fullText: r.fullText,
        segments: r.segments,
        keyIndex: i,
        attempts,
      };
    }
    const reason =
      r.status === 401 ? "invalid/expired key"
      : r.status === 402 ? "quota habis / limit"
      : r.status === 403 ? "forbidden / limit"
      : r.status === 413 ? "file terlalu besar"
      : r.status === 415 ? "format audio tidak didukung"
      : r.status === 429 ? "rate-limited"
      : r.status === 0 ? "network error"
      : r.status >= 500 ? "server error" : "gagal";
    attempts.push(`key#${i + 1}:${r.status} ${reason}`);
    onLog?.(`STT key #${i + 1} gagal (${r.status} ${reason}) — rotasi ke key berikutnya…`);
    if (!rotatable(r.status)) {
      // Non-rotatable (e.g. 400 bad audio/params): retrying other keys won't help.
      return {
        ok: false,
        language: "en",
        fullText: "",
        segments: [],
        error: `ElevenLabs STT ${r.status} (${reason}): ${r.body || "no body"}`,
        attempts,
      };
    }
  }
  return {
    ok: false,
    language: "en",
    fullText: "",
    segments: [],
    error: `Semua ${keys.length} key ElevenLabs gagal STT. ${attempts.join(" | ")}`,
    attempts,
  };
}
