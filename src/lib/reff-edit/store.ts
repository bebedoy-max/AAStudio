// Local storage for Reff EDIT: references library + edit history.
// MVP: localStorage-scoped, keyed by user id.

export type RefRole =
  | "style"
  | "camera"
  | "lighting"
  | "color"
  | "motion"
  | "composition";

export const REF_ROLES: { value: RefRole; label: string }[] = [
  { value: "style", label: "Style Reference" },
  { value: "camera", label: "Camera Reference" },
  { value: "lighting", label: "Lighting Reference" },
  { value: "color", label: "Color Reference" },
  { value: "motion", label: "Motion Reference" },
  { value: "composition", label: "Composition Reference" },
];

export const REF_CATEGORIES = [
  "Cinematic",
  "Fashion",
  "Product",
  "UGC",
  "Documentary",
  "Advertisement",
] as const;

export type ReferenceDNA = {
  visualStyle?: string;
  colorPalette?: string;
  lighting?: string;
  cameraAngle?: string;
  lens?: string;
  composition?: string;
  background?: string;
  mood?: string;
  texture?: string;
  // video-only
  cameraMovement?: string;
  motionStyle?: string;
  editingRhythm?: string;
  cutTiming?: string;
  transition?: string;
  speedRamp?: string;
  colorGrading?: string;
  cinematicStyle?: string;
  audioRhythm?: string;
  raw?: string;
};

export type BlueprintScene = {
  id: string;
  name: string;
  from: number;
  to: number;
  apply: string[];
  sourceIdx?: number; // index into the target sources array (default 0)
};

export type ReferenceItem = {
  id: string;
  name: string;
  type: "image" | "video";
  category: string;
  role: RefRole;
  weight: number;
  sourceUrl: string;
  thumbnailUrl?: string;
  dna?: ReferenceDNA;
  createdAt: string;
};

export type HistoryItem = {
  id: string;
  mode: "image" | "video";
  referenceIds: string[];
  dna?: ReferenceDNA;
  blueprint?: BlueprintScene[];
  targetUrl?: string;
  outputUrl?: string;
  thumbnailUrl?: string;
  providerUsed?: string;
  durationMs?: number;
  status: "success" | "error" | "pending";
  error?: string;
  createdAt: string;
};

const LS_REFS = "aatools.reff-edit.refs";
const LS_HIST = "aatools.reff-edit.history";

const keyOf = (base: string, uid: string | null) =>
  uid ? `${base}.${uid}` : `${base}.anon`;

export function loadRefs(uid: string | null): ReferenceItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(keyOf(LS_REFS, uid));
    return raw ? (JSON.parse(raw) as ReferenceItem[]) : [];
  } catch {
    return [];
  }
}
export function saveRefs(uid: string | null, items: ReferenceItem[]) {
  try {
    localStorage.setItem(keyOf(LS_REFS, uid), JSON.stringify(items));
  } catch {}
}
export function loadHistory(uid: string | null): HistoryItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(keyOf(LS_HIST, uid));
    return raw ? (JSON.parse(raw) as HistoryItem[]) : [];
  } catch {
    return [];
  }
}
export function saveHistory(uid: string | null, items: HistoryItem[]) {
  try {
    localStorage.setItem(keyOf(LS_HIST, uid), JSON.stringify(items));
  } catch {}
}

export function uid8() {
  return Math.random().toString(36).slice(2, 10);
}
