// Subtitle designer — font catalog, style presets, ASS builder & CSS preview.
// Dipakai oleh Naratif Video Maker untuk burn-in subtitle via ffmpeg.wasm (libass).

export type SubFont = {
  key: string;
  label: string;
  /** Nama family yang ditulis ke ASS Style (harus sama dengan nama internal font file). */
  family: string;
  /** URL TTF (dipakai ffmpeg.wasm; libass butuh file font nyata). */
  url: string;
  /** Nama file di FS ffmpeg. */
  file: string;
  /** CSS font-family untuk preview di browser. */
  css: string;
};

const GF = "https://cdn.jsdelivr.net/gh/google/fonts@main";

export const SUB_FONTS: SubFont[] = [
  {
    key: "dejavu",
    label: "DejaVu Sans (default)",
    family: "DejaVu Sans",
    url: "https://cdn.jsdelivr.net/npm/dejavu-fonts-ttf@2.37.3/ttf/DejaVuSans.ttf",
    file: "DejaVuSans.ttf",
    css: "'DejaVu Sans', system-ui, sans-serif",
  },
  { key: "poppins", label: "Poppins Bold", family: "Poppins", url: `${GF}/ofl/poppins/Poppins-Bold.ttf`, file: "Poppins-Bold.ttf", css: "Poppins, system-ui, sans-serif" },
  { key: "lato", label: "Lato Bold", family: "Lato", url: `${GF}/ofl/lato/Lato-Bold.ttf`, file: "Lato-Bold.ttf", css: "Lato, system-ui, sans-serif" },
  { key: "anton", label: "Anton (impact)", family: "Anton", url: `${GF}/ofl/anton/Anton-Regular.ttf`, file: "Anton-Regular.ttf", css: "Anton, Impact, sans-serif" },
  { key: "bebas", label: "Bebas Neue", family: "Bebas Neue", url: `${GF}/ofl/bebasneue/BebasNeue-Regular.ttf`, file: "BebasNeue-Regular.ttf", css: "'Bebas Neue', Impact, sans-serif" },
  { key: "oswald", label: "Oswald", family: "Oswald", url: `${GF}/ofl/oswald/Oswald%5Bwght%5D.ttf`, file: "Oswald.ttf", css: "Oswald, system-ui, sans-serif" },
  { key: "roboto", label: "Roboto", family: "Roboto", url: `${GF}/ofl/roboto/Roboto%5Bwdth,wght%5D.ttf`, file: "Roboto.ttf", css: "Roboto, system-ui, sans-serif" },
];

export function findSubFont(key: string): SubFont {
  return SUB_FONTS.find((f) => f.key === key) || SUB_FONTS[0];
}

export type SubEffect = "none" | "fade" | "pop" | "slide" | "glow" | "typewriter";
export const SUB_EFFECTS: Array<{ value: SubEffect; label: string }> = [
  { value: "none", label: "Tanpa efek" },
  { value: "fade", label: "Fade in / out" },
  { value: "pop", label: "Pop / scale-in" },
  { value: "slide", label: "Slide up" },
  { value: "glow", label: "Glow blur" },
  { value: "typewriter", label: "Typewriter (per kata)" },
];

export type SubPosition = "bottom" | "middle" | "top";
export const SUB_POSITIONS: Array<{ value: SubPosition; label: string }> = [
  { value: "bottom", label: "Bawah" },
  { value: "middle", label: "Tengah" },
  { value: "top", label: "Atas" },
];

export type SubtitleConfig = {
  preset: string;
  font: string;
  fontSize: number;
  primary: string; // hex #RRGGBB
  outlineColor: string;
  outlineWidth: number;
  shadow: number;
  box: boolean;
  boxOpacity: number; // 0..1
  bold: boolean;
  italic: boolean;
  uppercase: boolean;
  position: SubPosition;
  marginV: number;
  spacing: number;
  effect: SubEffect;
  maxChars: number;
};

export type SubPreset = { key: string; label: string; config: Omit<SubtitleConfig, "preset"> };

const base: Omit<SubtitleConfig, "preset"> = {
  font: "dejavu",
  fontSize: 42,
  primary: "#ffffff",
  outlineColor: "#000000",
  outlineWidth: 2,
  shadow: 0,
  box: false,
  boxOpacity: 0.55,
  bold: true,
  italic: false,
  uppercase: false,
  position: "bottom",
  marginV: 90,
  spacing: 0,
  effect: "fade",
  maxChars: 42,
};

export const SUB_PRESETS: SubPreset[] = [
  { key: "modern", label: "Modern", config: { ...base, box: true, outlineWidth: 1, font: "poppins", fontSize: 40 } },
  { key: "minimal", label: "Minimal", config: { ...base, bold: false, outlineWidth: 2, shadow: 1, font: "lato", fontSize: 38, effect: "none" } },
  { key: "tiktok", label: "TikTok", config: { ...base, box: true, boxOpacity: 1, uppercase: true, font: "anton", fontSize: 46, marginV: 120, effect: "pop" } },
  { key: "capcut", label: "CapCut", config: { ...base, primary: "#ffe600", outlineColor: "#000000", outlineWidth: 3, shadow: 1, font: "bebas", fontSize: 50, uppercase: true, effect: "pop" } },
  { key: "cinematic", label: "Sinematik", config: { ...base, italic: true, bold: false, outlineWidth: 1, shadow: 1, spacing: 1, font: "roboto", fontSize: 38, marginV: 70, effect: "fade" } },
  { key: "anime", label: "Anime Pop", config: { ...base, outlineColor: "#d946ef", outlineWidth: 3, shadow: 1, font: "oswald", fontSize: 46, effect: "glow" } },
  { key: "youtube", label: "YouTube Bold", config: { ...base, box: true, boxOpacity: 0.75, font: "roboto", fontSize: 40, outlineWidth: 0, effect: "none" } },
  { key: "karaoke", label: "Karaoke Word", config: { ...base, font: "poppins", fontSize: 44, outlineWidth: 2, effect: "typewriter", maxChars: 28 } },
];

export function findSubPreset(key: string): SubPreset {
  return SUB_PRESETS.find((p) => p.key === key) || SUB_PRESETS[0];
}

<<<<<<< HEAD
export const DEFAULT_SUB_CONFIG: SubtitleConfig = {
  ...findSubPreset("anime").config,
  preset: "anime",
  font: "oswald",
  fontSize: 90,
  effect: "glow",
  position: "bottom",
  outlineWidth: 6,
  shadow: 2,
  marginV: 225,
  maxChars: 22,
  primary: "#000000",
  outlineColor: "#08dd21",
  bold: true,
  italic: false,
  uppercase: true,
  box: false,
};
=======
export const DEFAULT_SUB_CONFIG: SubtitleConfig = { preset: "modern", ...SUB_PRESETS[0].config };
>>>>>>> 6b278d59eaf9dcbec5aca3bbc75b7115fca15548

export function presetConfig(key: string): SubtitleConfig {
  const p = findSubPreset(key);
  return { preset: p.key, ...p.config };
}

// ---------- Preview (CSS) ----------

export function subtitleCss(cfg: SubtitleConfig, scale = 0.42): React.CSSProperties {
  const f = findSubFont(cfg.font);
  const out = cfg.outlineWidth * scale;
  const shadows: string[] = [];
  if (out > 0) {
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      shadows.push(`${dx * out}px ${dy * out}px 0 ${cfg.outlineColor}`);
    }
  }
  if (cfg.shadow > 0) shadows.push(`${cfg.shadow * scale * 2}px ${cfg.shadow * scale * 2}px ${cfg.shadow * scale * 2}px rgba(0,0,0,.9)`);
<<<<<<< HEAD
  if (cfg.effect === "glow") shadows.push(`0 0 ${Math.max(2, cfg.fontSize * scale * 0.25)}px ${cfg.outlineColor}`);
  return {
    fontFamily: f.css,
    fontSize: Math.max(5, cfg.fontSize * scale),
=======
  if (cfg.effect === "glow") shadows.push(`0 0 ${8 * scale * 3}px ${cfg.outlineColor}`);
  return {
    fontFamily: f.css,
    fontSize: Math.max(9, Math.round(cfg.fontSize * scale)),
>>>>>>> 6b278d59eaf9dcbec5aca3bbc75b7115fca15548
    color: cfg.primary,
    fontWeight: cfg.bold ? 800 : 400,
    fontStyle: cfg.italic ? "italic" : "normal",
    textTransform: cfg.uppercase ? "uppercase" : "none",
    letterSpacing: `${cfg.spacing * scale}px`,
    textShadow: shadows.length ? shadows.join(", ") : undefined,
    background: cfg.box ? `rgba(0,0,0,${cfg.boxOpacity})` : "transparent",
<<<<<<< HEAD
    padding: cfg.box ? `${2 * scale * 4}px ${8 * scale * 4}px` : 0,
=======
    padding: cfg.box ? "2px 8px" : 0,
>>>>>>> 6b278d59eaf9dcbec5aca3bbc75b7115fca15548
    borderRadius: cfg.box ? 6 : 0,
    lineHeight: 1.25,
    textAlign: "center",
    maxWidth: "90%",
  };
}

// ---------- ASS output ----------

function assColor(hex: string, alpha = 0): string {
  const h = hex.replace("#", "");
  const r = h.slice(0, 2);
  const g = h.slice(2, 4);
  const b = h.slice(4, 6);
  const a = Math.round(Math.max(0, Math.min(1, alpha)) * 255)
    .toString(16)
    .padStart(2, "0");
  return `&H${a}${b}${g}${r}`.toUpperCase();
}

function assTime(sec: number): string {
  const s = Math.max(0, sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = Math.floor(s % 60);
  const cs = Math.floor((s - Math.floor(s)) * 100);
  return `${h}:${m.toString().padStart(2, "0")}:${ss.toString().padStart(2, "0")}.${cs.toString().padStart(2, "0")}`;
}

export type SubCue = { start: number; end: number; text: string };

/** Pecah narasi menjadi cue pendek yang enak dibaca. */
export function narrationToCues(text: string, totalDur: number, maxChars = 42): SubCue[] {
  const clean = (text || "").replace(/\s+/g, " ").trim();
  if (!clean || totalDur <= 0.3) return [];
  const words = clean.split(" ");
  const groups: string[] = [];
  let cur = "";
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (next.length > maxChars && cur) {
      groups.push(cur);
      cur = w;
    } else cur = next;
  }
  if (cur) groups.push(cur);
  if (!groups.length) return [];
  const per = totalDur / groups.length;
  return groups.map((g, i) => ({ start: i * per, end: Math.min(totalDur, (i + 1) * per), text: g }));
}

function alignment(pos: SubPosition): number {
  return pos === "top" ? 8 : pos === "middle" ? 5 : 2;
}

function effectTag(cfg: SubtitleConfig, dur: number): string {
  switch (cfg.effect) {
    case "fade":
      return "{\\fad(180,180)}";
    case "pop":
      return "{\\fscx70\\fscy70\\t(0,140,\\fscx100\\fscy100)\\fad(80,80)}";
    case "slide":
      return "{\\fad(120,120)\\fscy80\\t(0,220,\\fscy100)}";
    case "glow":
      return "{\\blur2\\fad(150,150)}";
    case "typewriter":
      return `{\\fad(60,60)\\k${Math.max(1, Math.round(dur * 100))}}`;
    default:
      return "";
  }
}

function escapeAss(t: string): string {
  return t.replace(/\\/g, "\\\\").replace(/\{/g, "(").replace(/\}/g, ")").replace(/\r?\n/g, "\\N");
}

export function buildAss(cues: SubCue[], cfg: SubtitleConfig, width: number, height: number): string {
  const f = findSubFont(cfg.font);
  const borderStyle = cfg.box ? 3 : 1;
  const styleLine = [
    "Default",
    f.family,
    Math.round(cfg.fontSize),
    assColor(cfg.primary),
    assColor(cfg.primary),
    assColor(cfg.outlineColor),
    assColor("#000000", 1 - cfg.boxOpacity),
    cfg.bold ? -1 : 0,
    cfg.italic ? -1 : 0,
    0,
    0,
    100,
    100,
    cfg.spacing,
    0,
    borderStyle,
    cfg.box ? Math.max(1, cfg.outlineWidth) : cfg.outlineWidth,
    cfg.shadow,
    alignment(cfg.position),
    40,
    40,
    Math.round(cfg.marginV),
    1,
  ].join(",");

  const events = cues
    .map((c) => {
      const dur = Math.max(0.2, c.end - c.start);
      const raw = cfg.uppercase ? c.text.toUpperCase() : c.text;
      return `Dialogue: 0,${assTime(c.start)},${assTime(c.end)},Default,,0,0,0,,${effectTag(cfg, dur)}${escapeAss(raw)}`;
    })
    .join("\n");

  return `[Script Info]
ScriptType: v4.00+
PlayResX: ${width}
PlayResY: ${height}
WrapStyle: 2
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: ${styleLine}

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
${events}
`;
}
