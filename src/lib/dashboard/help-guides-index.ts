// Lightweight index of help guides used by global search.
// Keep in sync with GUIDES in src/routes/system.help.tsx.

export type HelpGuideMeta = {
  id: string;
  title: string;
  summary: string;
  category: string;
  tags: string[];
};

export const HELP_GUIDES_META: HelpGuideMeta[] = [
  { id: "quickstart", category: "start", title: "Panduan Cepat 5 Menit", summary: "Dari login sampai render pertama.", tags: ["mulai", "onboarding", "workflow"] },
  { id: "keys-overview", category: "keys", title: "Cara Menambahkan Token / API Key", summary: "BYOK — pakai key Anda sendiri.", tags: ["api", "key", "token", "byok"] },
  { id: "keys-gemini", category: "keys", title: "Mendapatkan Gemini API Key (Google AI Studio)", summary: "Brain default (analisa, storyboard, naratif, planner).", tags: ["gemini", "google", "brain"] },
  { id: "keys-openai", category: "keys", title: "Mendapatkan OpenAI API Key", summary: "Opsional — fallback Brain / GPT-4o.", tags: ["openai", "gpt", "brain"] },
  { id: "keys-eleven", category: "keys", title: "Mendapatkan ElevenLabs API Key (TTS & STT)", summary: "Wajib untuk Dubbing, Clipper, Naratif Voice Over.", tags: ["elevenlabs", "voice", "tts", "stt"] },
  { id: "keys-video", category: "keys", title: "Wavespeed, Weavy & Magnific (Video/Image Providers)", summary: "Provider render video & image high-end.", tags: ["wavespeed", "weavy", "magnific", "video"] },
  { id: "routing-what", category: "routing", title: "Apa itu Routing Provider?", summary: "Aturan siapa yang menjalankan setiap tugas AI.", tags: ["routing", "provider", "fallback"] },
  { id: "routing-rotation", category: "routing", title: "Rotasi Key & Anti Rate-Limit", summary: "Bagaimana sistem memilih key dari pool Anda.", tags: ["rate-limit", "quota", "rotation"] },
  { id: "gen-motion", category: "generate", title: "Motion Control (Generate → Motion)", summary: "Kontrol pergerakan karakter/objek.", tags: ["motion", "magnific", "wavespeed", "video"] },
  { id: "gen-i2v", category: "generate", title: "Image to Video (I2V)", summary: "Ubah gambar diam menjadi video pendek.", tags: ["i2v", "video", "wavespeed", "weavy"] },
  { id: "gen-storyboard", category: "generate", title: "Product Storyboard", summary: "AI otomatis menyusun 6–12 scene iklan produk.", tags: ["storyboard", "product", "ads"] },
  { id: "gen-naratif", category: "generate", title: "Video Naratif", summary: "Video story/edukasi dari artikel/URL/teks.", tags: ["naratif", "story", "voiceover"] },
  { id: "gen-bulk-fashion", category: "generate", title: "Bulk Fashion Generator", summary: "Ratusan variasi outfit/pose untuk katalog fashion.", tags: ["fashion", "bulk", "weavy"] },
  { id: "mix-clipper", category: "mixing", title: "Clipper — Long Video → Short Clips", summary: "Auto-transcribe, highlight, potong ke short/reels.", tags: ["clipper", "shorts", "reels", "subtitle"] },
  { id: "mix-dubbing", category: "mixing", title: "Dubbing / Voice Over Multi-Bahasa", summary: "Ganti suara video dengan ElevenLabs 30+ bahasa.", tags: ["dubbing", "voice", "translation"] },
  { id: "inf-character", category: "influencer", title: "AI Influencer — Bikin Karakter Konsisten", summary: "Artis virtual dengan wajah & gaya konsisten.", tags: ["influencer", "character", "consistency"] },
  { id: "inf-planner", category: "influencer", title: "Weekly Content Planner", summary: "Brain merencanakan 7–30 hari konten.", tags: ["planner", "content", "calendar"] },
  { id: "inf-publisher", category: "influencer", title: "Publisher — Auto Kaption & Export", summary: "Caption per platform + export bundle.", tags: ["publisher", "caption"] },
  { id: "acc-billing", category: "account", title: "Paket & Pembayaran", summary: "Perbedaan mode akses: Public, Subscription, Trial.", tags: ["billing", "subscription", "trial"] },
  { id: "acc-security", category: "account", title: "Keamanan Akun & Single Session", summary: "Satu akun aktif di 1 device pada satu waktu.", tags: ["security", "session"] },
  { id: "acc-settings", category: "account", title: "Pengaturan Aplikasi", summary: "Tema, bahasa, notifikasi, default render, cache.", tags: ["settings", "preferences"] },
  { id: "tr-429", category: "trouble", title: "Error 429 / Rate Limit / Quota Habis", summary: "Semua key kena rate-limit.", tags: ["error", "429", "quota"] },
  { id: "tr-401", category: "trouble", title: "Error 401 / Invalid Key", summary: "Key ditolak provider.", tags: ["error", "401"] },
  { id: "tr-render", category: "trouble", title: "Video Tidak Muncul / Timeout Render", summary: "Render tidak selesai / URL output kosong.", tags: ["render", "timeout"] },
];

export const APP_VERSION = "1.2.0";
export const APP_NAME = "AA Creative Studio";
export const SUPPORT = {
  email: "support@aacreativestudio.app",
  whatsapp: "+62 812-3456-7890",
  whatsappUrl: "https://wa.me/6281234567890",
};
