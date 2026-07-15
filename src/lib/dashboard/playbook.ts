// Curated playbook/news content rotating daily (deterministic by day-of-year).
export type PlaybookTip = { category: "Prompt" | "Editing" | "Affiliate" | "Algorithm" | "AI"; title: string; body: string };
export type NewsItem = { title: string; source: string; tag: "AI News" | "Platform" | "Model"; url?: string };

const TIPS: PlaybookTip[] = [
  { category: "Prompt", title: "Hook 3-detik pertama", body: "Mulai video dengan pertanyaan ekstrem: 'Apa jadinya jika...'. Algoritma TikTok/Reels reward retention 3 detik pertama." },
  { category: "Prompt", title: "Sinematik prompt formula", body: "Subject + action + camera + lighting + mood + style. Contoh: 'astronaut floating, slow orbit, low-key rim light, awe, Villeneuve style'." },
  { category: "Editing", title: "Cut on motion", body: "Potong tepat saat objek bergerak. Otak menutupi cut, feel-nya lebih smooth walau 12 shot dalam 15 detik." },
  { category: "Editing", title: "Sound design > visual", body: "Whoosh + impact di setiap transisi naikkan perceived quality 40%. Freesound gratis." },
  { category: "Affiliate", title: "Problem → agitasi → produk", body: "3 detik problem, 5 detik agitasi (kesal/rugi), 7 detik produk sebagai jalan keluar. CTA di caption, bukan di video." },
  { category: "Affiliate", title: "Bandingkan, jangan promosi", body: "Video 'A vs B' 3x lebih engaging dari review. Pastikan winner adalah affiliate link kamu." },
  { category: "Algorithm", title: "Post 2x sehari", body: "07.00 dan 19.00 waktu lokal audience. Konsistensi 21 hari kalahkan viralitas satu video." },
  { category: "Algorithm", title: "Reply comment dgn video", body: "Video reply dapat boost feed lebih tinggi dari post biasa. Manfaatkan komentar viral orang lain." },
  { category: "AI", title: "Layer AI voice + real B-roll", body: "AI voice untuk narasi, footage nyata untuk kredibilitas. 100% AI biasanya terasa fake." },
  { category: "AI", title: "Consistent character trick", body: "Gemini Image + reference seed + phrase 'same character as image'. Simpan output sebagai base semua scene." },
];

const NEWS: NewsItem[] = [
  { title: "Kling AI — model & update terbaru", source: "Kling AI", tag: "Model", url: "https://klingai.com/" },
  { title: "TikTok Newsroom — pengumuman produk & algoritma", source: "TikTok Newsroom", tag: "Platform", url: "https://newsroom.tiktok.com/" },
  { title: "OpenAI Sora — dokumentasi & pengumuman", source: "OpenAI", tag: "Model", url: "https://openai.com/sora" },
  { title: "YouTube Creator Blog — update Shorts & monetisasi", source: "YouTube Creator", tag: "Platform", url: "https://blog.youtube/inside-youtube/" },
  { title: "Google DeepMind — rilis Gemini terbaru", source: "Google DeepMind", tag: "AI News", url: "https://deepmind.google/discover/blog/" },
  { title: "Runway Research — Gen model & fitur baru", source: "Runway", tag: "Model", url: "https://runwayml.com/research" },
  { title: "Meta Newsroom — Instagram AI label & fitur creator", source: "Meta", tag: "Platform", url: "https://about.fb.com/news/" },
  { title: "Wavespeed — dokumentasi model & performa", source: "Wavespeed", tag: "Model", url: "https://wavespeed.ai/" },
];

function dayOfYear(): number {
  const d = new Date();
  const start = new Date(d.getFullYear(), 0, 0);
  return Math.floor((d.getTime() - start.getTime()) / 86400000);
}

export function todaysTips(count = 4): PlaybookTip[] {
  const start = dayOfYear() % TIPS.length;
  return Array.from({ length: count }, (_, i) => TIPS[(start + i) % TIPS.length]);
}

export function todaysNews(count = 4): NewsItem[] {
  const start = (dayOfYear() * 3) % NEWS.length;
  return Array.from({ length: count }, (_, i) => NEWS[(start + i) % NEWS.length]);
}

export const TRENDING = {
  TikTok: ["POV storytelling", "AI ASMR", "Silent vlog", "Duet green screen", "Sport highlights"],
  YouTube: ["What If science", "3-hour documentary", "AI reaction", "Faceless narration", "Tier list"],
  Affiliate: ["Kitchen gadgets", "Skincare routine", "Smart home", "Pet accessories", "Home workout"],
  AI: ["Runway Gen-4", "Kling 2.5", "Sora 2", "Suno v4", "Nano Banana 2"],
  News: ["AI election coverage", "Space launch replay", "Tech IPO", "Crypto rally", "Climate summit"],
} as const;

export type TrendCategory = keyof typeof TRENDING;
