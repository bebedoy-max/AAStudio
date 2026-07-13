// Reference slot catalog + AI Influencer helper data.
// Kept static (no DB) so UI can render slots reliably before any upload exists.

export type ReferenceSlot = {
  key: string;
  label: string;
  required: boolean;
  group: "core" | "expression" | "pose" | "detail" | "optional";
};

export const REFERENCE_SLOTS: ReferenceSlot[] = [
  { key: "full_body_front", label: "Full Body Front", required: true, group: "core" },
  { key: "full_body_back", label: "Full Body Back", required: true, group: "core" },
  { key: "left_side", label: "Left Side", required: true, group: "core" },
  { key: "right_side", label: "Right Side", required: true, group: "core" },
  { key: "face_close_up", label: "Face Close Up", required: true, group: "core" },
  { key: "smile", label: "Smile", required: true, group: "expression" },
  { key: "neutral", label: "Neutral Expression", required: true, group: "expression" },
  { key: "sitting", label: "Sitting", required: true, group: "pose" },
  { key: "standing", label: "Standing", required: true, group: "pose" },
  { key: "walking", label: "Walking", required: true, group: "pose" },
  { key: "hand_detail", label: "Hand Detail", required: true, group: "detail" },
  { key: "outfit", label: "Outfit Library", required: false, group: "optional" },
  { key: "hair", label: "Hair Style", required: false, group: "optional" },
  { key: "accessory", label: "Accessories", required: false, group: "optional" },
  { key: "pose_library", label: "Pose Library", required: false, group: "optional" },
];

export const SOCIAL_PLATFORMS = [
  { key: "instagram", label: "Instagram" },
  { key: "tiktok", label: "TikTok" },
  { key: "facebook", label: "Facebook" },
  { key: "threads", label: "Threads" },
  { key: "x", label: "X" },
  { key: "youtube", label: "YouTube" },
  { key: "pinterest", label: "Pinterest" },
] as const;

export const PUBLISH_PLATFORMS = [
  { key: "tiktok", label: "TikTok" },
  { key: "instagram", label: "Instagram" },
  { key: "facebook", label: "Facebook" },
  { key: "threads", label: "Threads" },
  { key: "x", label: "X" },
  { key: "youtube", label: "YouTube Shorts" },
] as const;

export const CONTENT_QUEUE_STATES = [
  "waiting",
  "generating",
  "rendering",
  "ready",
  "scheduled",
  "published",
  "failed",
] as const;
export type ContentQueueState = (typeof CONTENT_QUEUE_STATES)[number];

// AI Analysis dimensions (results from analyzing social refs → seeds Brain).
export const ANALYSIS_DIMENSIONS = [
  "Visual Style",
  "Camera Angle",
  "Lighting",
  "Color Palette",
  "Caption Style",
  "Emoji Style",
  "Posting Pattern",
  "Content Style",
  "Editing Style",
  "Hook Style",
  "Background Style",
  "Fashion Style",
  "Personality",
  "Voice Tone",
  "Lifestyle",
] as const;

// Parameter presets (user can still pick Custom to type freely).
export const NATIONALITY_PRESETS = [
  "Indonesian", "American", "British", "Japanese", "Korean", "Chinese", "Thai",
  "Vietnamese", "Filipino", "Malaysian", "Singaporean", "Indian", "Arab",
  "French", "German", "Italian", "Spanish", "Brazilian", "Mexican", "Russian",
  "Australian", "Canadian",
];

export const LANGUAGE_PRESETS = [
  "Bahasa Indonesia", "English", "Japanese", "Korean", "Mandarin", "Thai",
  "Vietnamese", "Tagalog", "Malay", "Hindi", "Arabic", "French", "German",
  "Italian", "Spanish", "Portuguese", "Russian",
];

export const NICHE_PRESETS = [
  "Fashion", "Beauty", "Travel", "Food & Culinary", "Fitness & Wellness",
  "Lifestyle", "Tech & Gadgets", "Finance", "Business", "Education",
  "Gaming", "Music", "Photography", "Home & Interior", "Automotive",
  "Parenting", "Health", "Book & Reading", "Comedy & Entertainment",
  "Motivation & Self-Improvement",
];

