// Katalog scene bawaan untuk Scenario Generator + Lifestyle.
// Modular — user bisa menambah scene custom lewat AI Brain (freeform).

export type SceneCategory = "daily" | "lifestyle" | "travel" | "work" | "social" | "seasonal";

export type Scene = {
  key: string;
  label: string;
  category: SceneCategory;
  hint: string;
};

export const SCENES: Scene[] = [
  { key: "cafe", label: "Cafe", category: "daily", hint: "aesthetic cafe, latte art, natural light" },
  { key: "airport", label: "Airport", category: "travel", hint: "airport lounge, luggage, travel outfit" },
  { key: "library", label: "Library", category: "daily", hint: "quiet library, bookshelves, warm reading light" },
  { key: "mall", label: "Mall", category: "lifestyle", hint: "shopping mall, boutique, retail therapy" },
  { key: "beach", label: "Beach", category: "travel", hint: "beach, golden hour, ocean breeze" },
  { key: "gym", label: "Gym", category: "lifestyle", hint: "modern gym, active wear, workout" },
  { key: "book-store", label: "Book Store", category: "daily", hint: "indie bookstore, browsing, cozy" },
  { key: "home", label: "Home", category: "daily", hint: "home interior, morning routine, cozy vibe" },
  { key: "office", label: "Office", category: "work", hint: "modern office, workspace, laptop" },
  { key: "vacation", label: "Vacation", category: "travel", hint: "vacation resort, poolside, relax" },
  { key: "street", label: "Street", category: "lifestyle", hint: "city street, editorial, candid" },
  { key: "museum", label: "Museum", category: "social", hint: "museum, art gallery, thoughtful" },
  { key: "restaurant", label: "Restaurant", category: "social", hint: "fine dining, table setup, plated food" },
  { key: "festival", label: "Festival", category: "seasonal", hint: "music festival, crowd, night lights" },
  { key: "coffee", label: "Coffee Break", category: "daily", hint: "morning coffee, kitchen bar, mug" },
  { key: "travel", label: "Travel", category: "travel", hint: "travel journey, on the road" },
  { key: "shopping", label: "Shopping", category: "lifestyle", hint: "boutique shopping, bags" },
  { key: "night-routine", label: "Night Routine", category: "daily", hint: "skincare, bedroom, warm lamp" },
  { key: "morning-routine", label: "Morning Routine", category: "daily", hint: "morning, natural light, freshness" },
  { key: "weekend", label: "Weekend", category: "lifestyle", hint: "weekend vibes, chill, brunch" },
  { key: "holiday", label: "Holiday", category: "seasonal", hint: "holiday season, decor, festive" },
  { key: "birthday", label: "Birthday", category: "social", hint: "birthday celebration, cake, candles" },
  { key: "random-daily", label: "Random Daily Life", category: "daily", hint: "spontaneous daily moment" },
];

export const CONTENT_STRATEGIES: { key: string; label: string; desc: string }[] = [
  { key: "branding", label: "Branding", desc: "Bangun identitas visual & tone" },
  { key: "affiliate", label: "Affiliate", desc: "Konten review & rekomendasi produk" },
  { key: "lifestyle", label: "Lifestyle", desc: "Kehidupan sehari-hari yang aspiratif" },
  { key: "fashion", label: "Fashion", desc: "OOTD, styling, editorial" },
  { key: "education", label: "Education", desc: "Tips & knowledge sharing" },
  { key: "entertainment", label: "Entertainment", desc: "Hiburan ringan & viral" },
  { key: "ugc", label: "UGC", desc: "User generated style content" },
  { key: "personal-branding", label: "Personal Branding", desc: "Story-driven personal narrative" },
];

export const PERSONALITY_DIMS: { key: keyof PersonalitySliders; label: string }[] = [
  { key: "funny", label: "Funny" },
  { key: "elegant", label: "Elegant" },
  { key: "luxury", label: "Luxury" },
  { key: "cute", label: "Cute" },
  { key: "professional", label: "Professional" },
  { key: "energetic", label: "Energetic" },
  { key: "luxury_lifestyle", label: "Luxury Lifestyle" },
  { key: "minimalist", label: "Minimalist" },
  { key: "emotional", label: "Emotional" },
  { key: "luxury_fashion", label: "Luxury Fashion" },
];

export type PersonalitySliders = {
  funny: number;
  elegant: number;
  luxury: number;
  cute: number;
  professional: number;
  energetic: number;
  luxury_lifestyle: number;
  minimalist: number;
  emotional: number;
  luxury_fashion: number;
};

export const DEFAULT_PERSONALITY: PersonalitySliders = {
  funny: 50, elegant: 50, luxury: 50, cute: 50, professional: 50,
  energetic: 50, luxury_lifestyle: 50, minimalist: 50, emotional: 50, luxury_fashion: 50,
};

export type OutputConfig = {
  image: boolean;
  motion: boolean;
  storyboard: boolean;
  caption: boolean;
  thumbnail: boolean;
  prompt_only: boolean;
  voice: boolean;
  subtitle: boolean;
  full_narrative: boolean;
};

export const DEFAULT_OUTPUT: OutputConfig = {
  image: true, motion: false, storyboard: false, caption: true,
  thumbnail: false, prompt_only: false, voice: false, subtitle: false, full_narrative: false,
};

export const OUTPUT_LABELS: { key: keyof OutputConfig; label: string; desc: string }[] = [
  { key: "image", label: "Image Only", desc: "Generate karakter image" },
  { key: "motion", label: "Image + Motion", desc: "Image lalu animasikan dengan Motion Control" },
  { key: "storyboard", label: "Storyboard", desc: "Kirim ke Produk Storyboard" },
  { key: "caption", label: "Caption", desc: "AI menulis caption sesuai personality" },
  { key: "thumbnail", label: "Thumbnail", desc: "Buat thumbnail terpisah" },
  { key: "prompt_only", label: "Prompt Only", desc: "Cukup prompt siap pakai" },
  { key: "voice", label: "Voice", desc: "TTS narrative pakai ElevenLabs" },
  { key: "subtitle", label: "Subtitle", desc: "SRT / caption text" },
  { key: "full_narrative", label: "Full Narrative Video", desc: "Kirim ke Naratif Video Maker" },
];
