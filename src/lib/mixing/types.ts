// Shared types for Mixing modules.

export type MixingStage =
  | "idle"
  | "upload"
  | "stt"
  | "brain"
  | "timeline"
  | "translate"
  | "voice"
  | "subtitle"
  | "render"
  | "export"
  | "done"
  | "error";

export type MixingProgress = { stage: MixingStage; pct: number; message: string };

export type VideoSource = {
  id: string;
  name: string;
  size: number;
  type: string;
  url: string; // object URL or remote
  durationSec?: number;
  thumbnail?: string;
};

export type TranscriptWord = { start: number; end: number; text: string; speaker?: string };
export type TranscriptSegment = {
  start: number;
  end: number;
  text: string;
  speaker?: string;
  words?: TranscriptWord[];
};

export type Transcript = {
  language: string;
  segments: TranscriptSegment[];
  fullText: string;
};

export type HookScore = {
  kind:
    | "best_hook"
    | "best_moment"
    | "most_emotional"
    | "most_viral"
    | "most_educational"
    | "most_funny"
    | "most_affiliate";
  score: number; // 0..100
  start: number;
  end: number;
  reason: string;
};

export type Scene = { start: number; end: number; label: string };
export type Speaker = { id: string; label: string; segments: Array<[number, number]> };

export type ClipperAnalysis = {
  scenes: Scene[];
  speakers: Speaker[];
  hooks: HookScore[];
  deadAir: Array<[number, number]>;
  fillers: Array<[number, number]>;
  keywords: string[];
  topics: string[];
  emotionCurve: Array<{ t: number; score: number }>;
  transcript: Transcript;
};

export type AspectRatio = "9:16" | "16:9" | "1:1" | "4:5" | "21:9";
export type SubtitleStyle = "Minimal" | "Modern" | "TikTok" | "CapCut" | "Cinematic" | "Anime";
export type TransitionKind =
  | "None"
  | "Fade"
  | "Cross Fade"
  | "Smooth"
  | "Slide"
  | "Zoom"
  | "Flash"
  | "Blur"
  | "Dip To Black"
  | "Random";
export type MusicPreset = "None" | "Cinematic" | "Vlog" | "Epic" | "Documentary" | "Relax" | "Corporate";
export type SfxKind = "Whoosh" | "Click" | "Pop" | "Impact" | "Typing" | "Notification";

export type ClipperSettings = {
  clipDurationSec: number; // 15/30/45/60/90/custom
  autoCutting: boolean;
  autoReframe: boolean;
  aspectRatio: AspectRatio;
  autoZoom: boolean;
  zoomKind: "punch" | "face" | "dynamic" | "reaction";
  subtitle: boolean;
  subtitleStyle: SubtitleStyle;
  subtitleFont: string;
  subtitleColor: string;
  subtitleAnimation: "none" | "typewriter" | "pop" | "bounce" | "karaoke";
  transition: TransitionKind;
  transitionDuration: number;
  music: MusicPreset;
  musicVolume: number;
  musicDuck: boolean;
  sfx: SfxKind[];
  generateDub: boolean;
  hookKinds: HookScore["kind"][];
};

export type TimelineTrack =
  | { kind: "clip"; start: number; end: number; sourceIn: number; sourceOut: number; sourceId: string }
  | { kind: "subtitle"; start: number; end: number; text: string; style: SubtitleStyle }
  | { kind: "zoom"; start: number; end: number; scale: number; anchorX: number; anchorY: number }
  | { kind: "reframe"; start: number; end: number; ratio: AspectRatio; anchorX: number; anchorY: number }
  | { kind: "transition"; start: number; end: number; transitionKind: TransitionKind }
  | { kind: "music"; start: number; end: number; preset: MusicPreset; volume: number; duck: boolean }
  | { kind: "sfx"; at: number; sfx: SfxKind };

export type Timeline = {
  totalSec: number;
  aspectRatio: AspectRatio;
  tracks: TimelineTrack[];
};

export type ClipperProject = {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  sources: VideoSource[];
  analysis: ClipperAnalysis | null;
  settings: ClipperSettings;
  timeline: Timeline | null;
  clips: Array<{ id: string; title: string; start: number; end: number; timeline: Timeline }>;
  renderResult?: { url?: string; provider?: string; status: "queued" | "rendering" | "done" | "error"; message?: string };
};

export type DubTranslationMode = "Literal" | "Natural" | "Localization" | "Affiliate Style" | "Formal" | "Casual";
export type DubVoicePreset =
  | "Original Voice Clone"
  | "AI Voice Male"
  | "AI Voice Female"
  | "Natural"
  | "Narrator"
  | "Professional"
  | "Friendly";

export type DubbingSettings = {
  sourceLanguage: string;
  targetLanguage: string;
  translationMode: DubTranslationMode;
  voice: DubVoicePreset;
  lipSync: boolean;
  subtitle: "off" | "original" | "translated" | "dual";
  aspectRatio: AspectRatio;
  preserveOriginalVideo: boolean;
  reframe: boolean;
  motionEnhancement: boolean;
  colorEnhancement: boolean;
  sharpen: boolean;
  upscale: boolean;
  noiseReduction: boolean;
};

export type DubbingProject = {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  sources: VideoSource[];
  transcript: Transcript | null;
  translated: Transcript | null;
  settings: DubbingSettings;
  voiceUrl?: string;
  subtitleSrt?: string;
  timeline: Timeline | null;
  renderResult?: { url?: string; provider?: string; status: "queued" | "rendering" | "done" | "error"; message?: string };
};

export const LANGUAGES: Array<{ code: string; label: string }> = [
  { code: "id", label: "Indonesia" },
  { code: "en", label: "English" },
  { code: "ja", label: "Japanese" },
  { code: "ko", label: "Korean" },
  { code: "zh", label: "Chinese" },
  { code: "ar", label: "Arabic" },
  { code: "es", label: "Spanish" },
  { code: "fr", label: "French" },
  { code: "de", label: "German" },
  { code: "pt", label: "Portuguese" },
  { code: "hi", label: "Hindi" },
  { code: "th", label: "Thai" },
  { code: "vi", label: "Vietnamese" },
  { code: "ru", label: "Russian" },
];
