// ElevenLabs provider client — subscription endpoint returns character quota.

export type ElevenSubscription = {
  ok: boolean;
  characterCount: number;
  characterLimit: number;
  remaining: number;
  tier?: string;
};

export async function checkElevenKey(apiKey: string): Promise<ElevenSubscription> {
  const empty: ElevenSubscription = { ok: false, characterCount: 0, characterLimit: 0, remaining: 0 };
  try {
    const r = await fetch("https://api.elevenlabs.io/v1/user/subscription", {
      headers: { "xi-api-key": apiKey },
    });
    if (!r.ok) return empty;
    const d = await r.json();
    const characterCount = Number(d.character_count ?? 0);
    const characterLimit = Number(d.character_limit ?? 0);
    return {
      ok: true,
      characterCount,
      characterLimit,
      remaining: Math.max(0, characterLimit - characterCount),
      tier: d.tier,
    };
  } catch {
    return empty;
  }
}
