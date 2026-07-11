// Audio engine — resolves music preset & sfx metadata so render-engine
// can pass consistent hints to whichever provider does the final mix.

import type { MusicPreset, SfxKind } from "./types";

export function musicHint(preset: MusicPreset): { mood: string; bpm: number; description: string } {
  switch (preset) {
    case "None":
      return { mood: "none", bpm: 0, description: "" };
    case "Cinematic":
      return { mood: "cinematic", bpm: 90, description: "orchestral swell, epic strings, cinematic drums" };
    case "Vlog":
      return { mood: "upbeat", bpm: 110, description: "lofi vlog beat, warm keys, chill percussion" };
    case "Epic":
      return { mood: "epic", bpm: 128, description: "trailer hybrid, heavy hits, rising synth" };
    case "Documentary":
      return { mood: "reflective", bpm: 85, description: "ambient piano, subtle strings, contemplative" };
    case "Relax":
      return { mood: "calm", bpm: 70, description: "soft pad, lo-fi guitar, peaceful" };
    case "Corporate":
      return { mood: "corporate", bpm: 100, description: "clean pop, motivational, uplifting" };
  }
}

export function sfxHint(kind: SfxKind): { volumeDb: number; description: string } {
  switch (kind) {
    case "Whoosh":
      return { volumeDb: -6, description: "transition whoosh sweep" };
    case "Click":
      return { volumeDb: -12, description: "UI click" };
    case "Pop":
      return { volumeDb: -10, description: "bubble pop" };
    case "Impact":
      return { volumeDb: -3, description: "cinematic impact hit" };
    case "Typing":
      return { volumeDb: -14, description: "typewriter typing" };
    case "Notification":
      return { volumeDb: -8, description: "notification chime" };
  }
}
