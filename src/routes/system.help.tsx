import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { DashboardShell, PageHero } from "@/components/dashboard/shell";
import {
  Search, BookOpen, KeyRound, Route as RouteIcon, Wand2, Film, Image as ImageIcon,
  Mic2, Scissors, Users, Sparkles, ShieldCheck, CreditCard, Settings2, LifeBuoy,
  ExternalLink, ChevronRight, Zap, Server, Mail, MessageCircle, Info,
} from "lucide-react";
import { APP_NAME, APP_VERSION } from "@/lib/dashboard/help-guides-index";
import { supabase } from "@/integrations/supabase/client";

type Guide = {
  id: string;
  title: string;
  summary: string;
  category: string;
  icon: React.ComponentType<{ className?: string }>;
  tags: string[];
  steps?: string[];
  tips?: string[];
  links?: { label: string; to?: string; href?: string }[];
};

const CATEGORIES = [
  { id: "start", label: "Mulai Cepat" },
  { id: "keys", label: "Token & API" },
  { id: "routing", label: "Routing Provider" },
  { id: "generate", label: "Generate" },
  { id: "mixing", label: "Mixing" },
  { id: "influencer", label: "AI Influencer" },
  { id: "account", label: "Akun & Billing" },
  { id: "trouble", label: "Troubleshooting" },
] as const;

const GUIDES: Guide[] = [
  {
    id: "quickstart",
    category: "start",
    icon: Sparkles,
    title: "Panduan Cepat 5 Menit",
    summary: "Dari login sampai render pertama — jalur tercepat menggunakan AA Creative Studio.",
    tags: ["mulai", "onboarding", "workflow"],
    steps: [
      "Login memakai Google atau email (fitur akan terkunci sebelum login).",
      "Buka Manage → Token/API Manager, tempel minimal 1 key Gemini + 1 key ElevenLabs.",
      "Buka Manage → Routing Provider untuk memilih provider default per fitur (Video/Voice/Brain).",
      "Pilih tool dari sidebar (Motion, Storyboard, Naratif, dll) dan mulai generate.",
      "Semua output masuk ke Library / Asset Hub di dashboard.",
    ],
    tips: [
      "Semua key disimpan terenkripsi di akun Anda — aman lintas device.",
      "Anda bisa menambahkan banyak key per provider; sistem otomatis rotasi saat rate-limit.",
    ],
    links: [
      { label: "Buka Token Manager", to: "/manage/tokens" },
      { label: "Buka Routing Provider", to: "/manage/routing" },
    ],
  },

  {
    id: "keys-overview",
    category: "keys",
    icon: KeyRound,
    title: "Cara Menambahkan Token / API Key",
    summary: "Semua provider AI eksternal memakai key milik Anda sendiri (BYOK) — kredit tidak dipotong dari AA Creative Studio.",
    tags: ["api", "key", "token", "byok"],
    steps: [
      "Buka menu Manage → Token/API Manager.",
      "Pilih tab provider (Gemini, OpenAI, ElevenLabs, Wavespeed, Weavy, Magnific).",
      "Klik + Add Key lalu tempel API key. Beri label opsional (mis. 'Akun kantor').",
      "Klik Test — tombol hijau berarti valid, merah berarti invalid/limit.",
      "Simpan. Key otomatis tersinkron ke semua fitur AA Creative Studio.",
    ],
    tips: [
      "Tambahkan minimal 2 key per provider agar sistem bisa rotasi otomatis saat 429/quota.",
      "Key tidak pernah dikirim ke browser lain — dienkripsi AES-GCM sebelum disimpan.",
    ],
    links: [{ label: "Token/API Manager", to: "/manage/tokens" }],
  },
  {
    id: "keys-gemini",
    category: "keys",
    icon: KeyRound,
    title: "Mendapatkan Gemini API Key (Google AI Studio)",
    summary: "Key Gemini dipakai sebagai Brain default (analisa, storyboard, naratif, planner).",
    tags: ["gemini", "google", "brain"],
    steps: [
      "Kunjungi aistudio.google.com dan login dengan akun Google.",
      "Klik 'Get API Key' → 'Create API key in new project'.",
      "Copy key yang diawali 'AIza...' — inilah yang ditempel di Token Manager tab Gemini.",
      "Untuk kuota lebih besar, aktifkan billing project di Google Cloud Console.",
    ],
    tips: ["Gratis-tier Gemini sudah cukup untuk pemakaian ringan; batas kuota reset harian."],
    links: [{ label: "Google AI Studio", href: "https://aistudio.google.com/apikey" }],
  },
  {
    id: "keys-openai",
    category: "keys",
    icon: KeyRound,
    title: "Mendapatkan OpenAI API Key",
    summary: "Opsional — dipakai sebagai fallback Brain (prioritas 1) sebelum Gemini bila Anda ingin GPT-4o.",
    tags: ["openai", "gpt", "brain"],
    steps: [
      "Buka platform.openai.com/api-keys dan login.",
      "Klik 'Create new secret key' → beri nama → copy (diawali 'sk-...').",
      "Pastikan billing/credits terisi minimal $5.",
      "Tempel di Token Manager tab OpenAI.",
    ],
    links: [{ label: "OpenAI Platform", href: "https://platform.openai.com/api-keys" }],
  },
  {
    id: "keys-eleven",
    category: "keys",
    icon: Mic2,
    title: "Mendapatkan ElevenLabs API Key (TTS & STT)",
    summary: "Wajib untuk Dubbing, Clipper (transcribe), dan Naratif Voice Over.",
    tags: ["elevenlabs", "voice", "tts", "stt"],
    steps: [
      "Buka elevenlabs.io → Profile → API Keys → Create.",
      "Copy key dan tempel di Token Manager tab ElevenLabs.",
      "Untuk Voice Clone, upload sample suara langsung di dashboard ElevenLabs — AA Creative Studio akan otomatis membaca voice list Anda.",
    ],
    tips: ["Plan Starter sudah cukup untuk 30rb karakter/bulan."],
    links: [{ label: "ElevenLabs API", href: "https://elevenlabs.io/app/settings/api-keys" }],
  },
  {
    id: "keys-video",
    category: "keys",
    icon: Film,
    title: "Wavespeed, Weavy & Magnific (Video/Image Providers)",
    summary: "Provider render video & image high-end. Cukup salah satu — tapi punya semua = flexibility maksimum.",
    tags: ["wavespeed", "weavy", "magnific", "video"],
    steps: [
      "Wavespeed: wavespeed.ai → Dashboard → API Keys. Cocok untuk I2V, Reframe, Upscale, Lip-Sync.",
      "Weavy: weavy.ai → Settings → Access Tokens. Cocok untuk Recipes & Bulk Fashion.",
      "Magnific: magnific.ai → Account → API. Cocok untuk Upscale/Enhance + Motion Control premium.",
      "Tempel masing-masing di tab yang sesuai pada Token Manager.",
    ],
  },

  {
    id: "routing-what",
    category: "routing",
    icon: RouteIcon,
    title: "Apa itu Routing Provider?",
    summary: "Routing adalah aturan siapa yang menjalankan setiap tugas AI — Brain, Voice, STT, Video, Image.",
    tags: ["routing", "provider", "fallback"],
    steps: [
      "Setiap fitur AA Creative Studio punya kategori: Brain (analisa/tulis), Voice (TTS), STT (transcribe), Video (render), Image (generate).",
      "Di Manage → Routing Provider Anda memilih provider utama + urutan fallback per kategori.",
      "Contoh: Brain → OpenAI (utama) → Gemini (fallback). Video → Wavespeed → Weavy → Magnific.",
      "Saat request gagal (401/429/5xx), sistem otomatis pindah ke provider berikutnya dengan key berikutnya.",
    ],
    tips: [
      "Semakin banyak provider aktif = semakin tinggi uptime.",
      "Anda bisa nonaktifkan provider tertentu (mis. matikan OpenAI untuk hemat biaya).",
    ],
    links: [{ label: "Routing Provider", to: "/manage/routing" }],
  },
  {
    id: "routing-rotation",
    category: "routing",
    icon: Zap,
    title: "Rotasi Key & Anti Rate-Limit",
    summary: "Bagaimana AA Creative Studio memilih key mana yang dipakai dari pool Anda.",
    tags: ["rate-limit", "quota", "rotation"],
    steps: [
      "Untuk tiap request, backend membaca semua key aktif provider terkait.",
      "Coba key #1 → jika 401/403/429/5xx → coba key #2 → dst.",
      "Setelah semua key provider utama habis, pindah ke provider fallback berikutnya.",
      "Semua kegagalan diringkas di response ('tried openai:2 keys, gemini:3 keys...').",
    ],
    tips: ["Tambah key gratis dari akun berbeda untuk memperbesar pool tanpa biaya."],
  },

  {
    id: "gen-motion",
    category: "generate",
    icon: Wand2,
    title: "Motion Control (Generate → Motion)",
    summary: "Kontrol pergerakan karakter/objek dengan referensi video motion + gambar asli.",
    tags: ["motion", "magnific", "wavespeed", "video"],
    steps: [
      "Buka Generate → Motion Control.",
      "Upload Image (karakter/produk yang ingin digerakkan).",
      "Upload Reference Video (motion yang ingin ditiru — dance, walk, kamera dolly, dll).",
      "Pilih orientasi (Image atau Video sebagai acuan komposisi).",
      "Tambahkan prompt opsional (mis. 'kamera slow zoom in').",
      "Klik Generate — proses 3–8 menit tergantung durasi. Hasil masuk Library.",
    ],
    tips: [
      "Gunakan reference video pendek (5–10 detik) untuk hasil lebih presisi.",
      "Untuk lip-sync khusus, pakai Wavespeed I2V lalu Magnific untuk polish.",
    ],
    links: [{ label: "Buka Motion", to: "/generate/motion" }],
  },
  {
    id: "gen-i2v",
    category: "generate",
    icon: Film,
    title: "Image to Video (I2V)",
    summary: "Ubah gambar diam menjadi video pendek dengan gerakan natural.",
    tags: ["i2v", "video", "wavespeed", "weavy"],
    steps: [
      "Generate → Image to Video.",
      "Upload gambar (ratio 9:16, 1:1, atau 16:9).",
      "Tulis prompt gerakan ('kamera dolly in, rambut tertiup angin').",
      "Pilih model (Kling 2.5 = paling stabil, Wavespeed = paling cepat).",
      "Klik Generate. Preview & download dari Library.",
    ],
    links: [{ label: "Buka I2V", to: "/generate/image-to-video" }],
  },
  {
    id: "gen-storyboard",
    category: "generate",
    icon: ImageIcon,
    title: "Product Storyboard",
    summary: "AI otomatis menyusun 6–12 scene iklan produk dari 1 foto + deskripsi.",
    tags: ["storyboard", "product", "ads"],
    steps: [
      "Generate → Storyboard.",
      "Upload foto produk (background bersih paling ideal).",
      "Isi nama produk, USP, target audience, durasi ads.",
      "Brain akan menghasilkan naskah scene-by-scene + prompt gambar tiap scene.",
      "Klik Generate All Scenes → hasil bisa langsung Handoff ke Motion/I2V untuk animasi.",
    ],
    tips: ["Tekan tombol Regenerate per scene bila hasil belum pas — tidak perlu ulang semuanya."],
    links: [{ label: "Buka Storyboard", to: "/generate/storyboard" }],
  },
  {
    id: "gen-naratif",
    category: "generate",
    icon: BookOpen,
    title: "Video Naratif",
    summary: "Buat video story/edukasi dari artikel/URL/teks — otomatis naskah + voice over + gambar.",
    tags: ["naratif", "story", "voiceover"],
    steps: [
      "Generate → Naratif.",
      "Pilih sumber: paste URL artikel, teks bebas, atau prompt topik.",
      "Brain merangkum, memecah menjadi paragraf naratif, dan menyarankan gambar per paragraf.",
      "Pilih voice (ElevenLabs) dan bahasa.",
      "Generate — hasilkan bundle: SRT + audio + storyboard gambar → siap diedit di CapCut/Premiere.",
    ],
    links: [{ label: "Buka Naratif", to: "/generate/naratif" }],
  },
  {
    id: "gen-bulk-fashion",
    category: "generate",
    icon: Users,
    title: "Bulk Fashion Generator",
    summary: "Generate ratusan variasi outfit/pose untuk katalog fashion sekali klik.",
    tags: ["fashion", "bulk", "weavy"],
    steps: [
      "Generate → Bulk Fashion.",
      "Upload model (foto orang) dan referensi outfit.",
      "Pilih preset pose & jumlah variasi.",
      "Sistem antri di Weavy — progress terlihat di Running Tasks (dashboard).",
    ],
    links: [{ label: "Buka Bulk Fashion", to: "/generate/bulk-fashion" }],
  },

  {
    id: "mix-clipper",
    category: "mixing",
    icon: Scissors,
    title: "Clipper — Long Video → Short Clips",
    summary: "Auto-transcribe video panjang, deteksi highlight, potong menjadi short/reels dengan subtitle.",
    tags: ["clipper", "shorts", "reels", "subtitle"],
    steps: [
      "Mixing → Clipper.",
      "Upload atau tempel URL video.",
      "ElevenLabs STT transcribe otomatis (butuh key ElevenLabs).",
      "Brain menandai bagian menarik → Anda pilih klip yang ingin diambil.",
      "Export bundle: mp4 + srt + timeline JSON (bisa import ke CapCut/DaVinci).",
    ],
    links: [{ label: "Buka Clipper", to: "/mixing/clipper" }],
  },
  {
    id: "mix-dubbing",
    category: "mixing",
    icon: Mic2,
    title: "Dubbing / Voice Over Multi-Bahasa",
    summary: "Ganti suara video dengan voice ElevenLabs (termasuk voice clone Anda) dalam 30+ bahasa.",
    tags: ["dubbing", "voice", "translation"],
    steps: [
      "Mixing → Dubbing.",
      "Upload video / audio sumber.",
      "Sistem transcribe → translate ke bahasa target → generate voice baru.",
      "Preview per segment; edit teks bila perlu → Render Final.",
    ],
    tips: ["Gunakan Voice Clone di ElevenLabs untuk konsistensi karakter."],
    links: [{ label: "Buka Dubbing", to: "/mixing/dubbing" }],
  },

  {
    id: "inf-character",
    category: "influencer",
    icon: Users,
    title: "AI Influencer — Bikin Karakter Konsisten",
    summary: "Buat 'artis virtual' dengan wajah & gaya konsisten di semua konten Anda.",
    tags: ["influencer", "character", "consistency"],
    steps: [
      "AI Influencer → Character.",
      "Upload 3–5 foto referensi wajah (angle berbeda).",
      "Isi kepribadian, gaya bicara, niche konten.",
      "Simpan sebagai Active Character — dipakai otomatis di Planner, Publisher, Storyboard.",
    ],
    links: [{ label: "Buka Character", to: "/ai-influencer/character" }],
  },
  {
    id: "inf-planner",
    category: "influencer",
    icon: BookOpen,
    title: "Weekly Content Planner",
    summary: "Brain merencanakan 7–30 hari konten (topik, hook, caption, hashtag) berdasarkan niche karakter.",
    tags: ["planner", "content", "calendar"],
    links: [{ label: "Buka Planner", to: "/ai-influencer/planner" }],
  },
  {
    id: "inf-publisher",
    category: "influencer",
    icon: Sparkles,
    title: "Publisher — Auto Kaption & Export",
    summary: "Susun caption per platform (IG/TikTok/YT) + export bundle siap upload.",
    tags: ["publisher", "caption"],
    links: [{ label: "Buka Publisher", to: "/ai-influencer/publisher" }],
  },

  {
    id: "acc-billing",
    category: "account",
    icon: CreditCard,
    title: "Paket & Pembayaran",
    summary: "Perbedaan mode akses fitur: Public, Subscription, Trial.",
    tags: ["billing", "subscription", "trial"],
    steps: [
      "Public: fitur bisa dipakai siapa saja tanpa langganan.",
      "Subscription: hanya subscriber aktif.",
      "Trial: akses terbatas sampai tanggal tertentu (untuk promo).",
      "Admin bisa mengatur mode tiap fitur di Admin → Access.",
    ],
  },
  {
    id: "acc-security",
    category: "account",
    icon: ShieldCheck,
    title: "Keamanan Akun & Single Session",
    summary: "Satu akun hanya bisa aktif di 1 device pada waktu bersamaan.",
    tags: ["security", "session"],
    steps: [
      "Login di device baru akan otomatis logout device lama.",
      "Cek session aktif di Settings → Keamanan.",
      "Tombol 'Sign out everywhere' untuk paksa logout semua.",
    ],
    links: [{ label: "Settings", to: "/system/settings" }],
  },
  {
    id: "acc-settings",
    category: "account",
    icon: Settings2,
    title: "Pengaturan Aplikasi",
    summary: "Tema, bahasa, notifikasi, default render, cache lokal.",
    tags: ["settings", "preferences"],
    links: [{ label: "Buka Settings", to: "/system/settings" }],
  },

  {
    id: "tr-429",
    category: "trouble",
    icon: Server,
    title: "Error 429 / Rate Limit / Quota Habis",
    summary: "Semua key kena rate-limit di response.",
    tags: ["error", "429", "quota"],
    steps: [
      "Tambahkan key baru (akun Google/OpenAI berbeda) di Token Manager.",
      "Untuk Gemini, aktifkan billing di Google Cloud untuk naik ke tier berbayar.",
      "Cek status quota di dashboard provider masing-masing.",
    ],
  },
  {
    id: "tr-401",
    category: "trouble",
    icon: ShieldCheck,
    title: "Error 401 / Invalid Key",
    summary: "Key ditolak provider.",
    tags: ["error", "401"],
    steps: [
      "Kembali ke Token Manager, klik Test pada key merah.",
      "Bila tetap merah, hapus dan generate key baru dari dashboard provider.",
      "Pastikan Anda copy full string (tanpa spasi di awal/akhir).",
    ],
  },
  {
    id: "tr-render",
    category: "trouble",
    icon: Film,
    title: "Video Tidak Muncul / Timeout Render",
    summary: "Task render tidak selesai atau URL output kosong.",
    tags: ["render", "timeout"],
    steps: [
      "Cek Running Tasks di dashboard — status 'processing' berarti masih diproses.",
      "Timeout default 15 menit. Video panjang/kompleks bisa gagal.",
      "Coba ulang dengan durasi lebih pendek atau provider lain (ubah di Routing).",
    ],
  },
];

const CAT_LABEL = Object.fromEntries(CATEGORIES.map((c) => [c.id, c.label]));

export const Route = createFileRoute("/system/help")({
  head: () => ({
    meta: [
      { title: "Pusat Bantuan — AA Creative Studio" },
      { name: "description", content: "Perpustakaan lengkap panduan AA Creative Studio: token/API, routing provider, motion, storyboard, naratif, dubbing, dan lainnya." },
    ],
  }),
  component: HelpPage,
});

function HelpPage() {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<string>("all");
  const [openId, setOpenId] = useState<string | null>("quickstart");
  const [support, setSupport] = useState<{ email: string; phone: string; whatsapp: string }>({ email: "", phone: "", whatsapp: "" });

  useEffect(() => {
    if (typeof window === "undefined") return;
    const h = window.location.hash.replace(/^#/, "");
    if (h && GUIDES.some((g) => g.id === h)) {
      setOpenId(h);
      requestAnimationFrame(() => {
        document.getElementById(`guide-${h}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
  }, []);

  useEffect(() => {
    (async () => {
      const { data } = await (supabase as any)
        .from("app_settings")
        .select("support_email, support_phone, support_whatsapp")
        .eq("id", 1)
        .maybeSingle();
      if (data) {
        setSupport({
          email: data.support_email ?? "",
          phone: data.support_phone ?? "",
          whatsapp: data.support_whatsapp ?? "",
        });
      }
    })();
  }, []);



  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return GUIDES.filter((g) => {
      if (cat !== "all" && g.category !== cat) return false;
      if (!query) return true;
      const hay = `${g.title} ${g.summary} ${g.tags.join(" ")} ${(g.steps || []).join(" ")}`.toLowerCase();
      return hay.includes(query);
    });
  }, [q, cat]);

  return (
    <DashboardShell>
      <PageHero
        eyebrow="Pusat Bantuan"
        title="Perpustakaan"
        highlight="AA Creative Studio"
        desc="Semua yang perlu Anda tahu — cara isi token/API, routing provider, sampai panduan detail tiap tool."
      />

      {/* Search + Category */}
      <div className="neumorph p-4 md:p-5 mb-6">
        <div className="relative">
          <Search className="h-4 w-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Cari panduan… (mis. 'gemini key', 'motion', 'dubbing', '429')"
            className="w-full bg-card/60 border border-border/60 rounded-xl pl-10 pr-4 py-3 text-sm outline-none focus:border-primary/60"
          />
        </div>
        <div className="flex flex-wrap gap-2 mt-4">
          <CatChip active={cat === "all"} onClick={() => setCat("all")} label={`Semua (${GUIDES.length})`} />
          {CATEGORIES.map((c) => {
            const n = GUIDES.filter((g) => g.category === c.id).length;
            return (
              <CatChip key={c.id} active={cat === c.id} onClick={() => setCat(c.id)} label={`${c.label} (${n})`} />
            );
          })}
        </div>
      </div>

      {/* Guides list */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {filtered.map((g) => {
          const open = openId === g.id;
          const Icon = g.icon;
          return (
            <article key={g.id} id={`guide-${g.id}`} className="neumorph overflow-hidden scroll-mt-24">
              <button
                onClick={() => setOpenId(open ? null : g.id)}
                className="w-full text-left p-5 flex items-start gap-4 hover:bg-card/40 transition"
              >
                <div className="h-11 w-11 rounded-xl grid place-items-center text-primary-foreground shrink-0" style={{ background: "var(--gradient-neon)" }}>
                  <Icon className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground border border-border/60 rounded px-1.5 py-0.5">
                      {CAT_LABEL[g.category]}
                    </span>
                  </div>
                  <div className="font-display text-base text-foreground mt-1.5">{g.title}</div>
                  <div className="text-xs text-muted-foreground mt-1">{g.summary}</div>
                </div>
                <ChevronRight className={`h-4 w-4 text-muted-foreground mt-3 shrink-0 transition ${open ? "rotate-90" : ""}`} />
              </button>

              {open && (
                <div className="px-5 pb-5 -mt-1 space-y-4 text-sm">
                  {g.steps && (
                    <div>
                      <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2">Langkah</div>
                      <ol className="space-y-1.5 list-decimal list-inside text-foreground/90">
                        {g.steps.map((s, i) => <li key={i}>{s}</li>)}
                      </ol>
                    </div>
                  )}
                  {g.tips && (
                    <div>
                      <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2">Tips</div>
                      <ul className="space-y-1.5 list-disc list-inside text-foreground/80">
                        {g.tips.map((s, i) => <li key={i}>{s}</li>)}
                      </ul>
                    </div>
                  )}
                  {g.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {g.tags.map((t) => (
                        <span key={t} className="text-[10px] rounded-full border border-border/60 px-2 py-0.5 text-muted-foreground">
                          #{t}
                        </span>
                      ))}
                    </div>
                  )}
                  {g.links && g.links.length > 0 && (
                    <div className="flex flex-wrap gap-2 pt-1">
                      {g.links.map((l) =>
                        l.to ? (
                          <Link key={l.label} to={l.to} className="text-xs inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 border border-border/60 hover:border-primary/60 hover:bg-primary/5">
                            {l.label} <ChevronRight className="h-3 w-3" />
                          </Link>
                        ) : (
                          <a key={l.label} href={l.href} target="_blank" rel="noreferrer" className="text-xs inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 border border-border/60 hover:border-primary/60 hover:bg-primary/5">
                            {l.label} <ExternalLink className="h-3 w-3" />
                          </a>
                        ),
                      )}
                    </div>
                  )}
                </div>
              )}
            </article>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <div className="neumorph p-10 text-center text-sm text-muted-foreground mt-4">
          Tidak ada panduan cocok dengan "{q}". Coba kata kunci lain atau reset filter.
        </div>
      )}

      {/* Contact + Version + Agreement */}
      <div className="mt-8 grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Kontak Support */}
        <div className="neumorph p-5">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl grid place-items-center text-primary-foreground shrink-0" style={{ background: "var(--gradient-neon)" }}>
              <LifeBuoy className="h-5 w-5" />
            </div>
            <div>
              <div className="font-display text-sm">Kontak Support</div>
              <div className="text-[11px] text-muted-foreground">Hubungi kami melalui kanal berikut.</div>
            </div>
          </div>
          <div className="mt-4 space-y-2">
            {support.email && (
              <a href={`mailto:${support.email}`} className="flex items-center gap-2.5 rounded-lg px-3 py-2 border border-border/60 hover:border-primary/60 hover:bg-primary/5 text-xs">
                <Mail className="h-3.5 w-3.5 text-primary" />
                <span className="text-foreground/90">{support.email}</span>
              </a>
            )}
            {support.phone && (
              <a href={`tel:${support.phone.replace(/\s+/g, "")}`} className="flex items-center gap-2.5 rounded-lg px-3 py-2 border border-border/60 hover:border-primary/60 hover:bg-primary/5 text-xs">
                <MessageCircle className="h-3.5 w-3.5 text-primary" />
                <span className="text-foreground/90">Telp {support.phone}</span>
              </a>
            )}
            {support.whatsapp && (
              <a
                href={`https://wa.me/${support.whatsapp.replace(/[^\d]/g, "")}`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-2.5 rounded-lg px-3 py-2 border border-border/60 hover:border-primary/60 hover:bg-primary/5 text-xs"
              >
                <MessageCircle className="h-3.5 w-3.5 text-primary" />
                <span className="text-foreground/90">WhatsApp {support.whatsapp}</span>
                <ExternalLink className="h-3 w-3 ml-auto text-muted-foreground" />
              </a>
            )}
            {!support.email && !support.phone && !support.whatsapp && (
              <div className="text-xs text-muted-foreground italic px-1">
                Informasi kontak belum diatur oleh admin.
              </div>
            )}
          </div>
        </div>

        {/* Versi Aplikasi */}
        <div className="neumorph p-5">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl grid place-items-center text-primary-foreground shrink-0" style={{ background: "var(--gradient-neon)" }}>
              <Info className="h-5 w-5" />
            </div>
            <div>
              <div className="font-display text-sm">Info Aplikasi</div>
              <div className="text-[11px] text-muted-foreground">Detail rilis saat ini</div>
            </div>
          </div>
          <dl className="mt-4 text-xs space-y-2">
            <div className="flex justify-between border-b border-border/40 pb-1.5">
              <dt className="text-muted-foreground">Nama</dt>
              <dd className="text-foreground/90">{APP_NAME}</dd>
            </div>
            <div className="flex justify-between border-b border-border/40 pb-1.5">
              <dt className="text-muted-foreground">Versi</dt>
              <dd className="text-foreground/90 font-mono">v{APP_VERSION}</dd>
            </div>
            <div className="flex justify-between border-b border-border/40 pb-1.5">
              <dt className="text-muted-foreground">Build</dt>
              <dd className="text-foreground/90 font-mono">stable · 2026</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Runtime</dt>
              <dd className="text-foreground/90">Web · SSR Edge</dd>
            </div>
          </dl>
        </div>

        {/* Perjanjian Umum */}
        <div className="neumorph p-5">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl grid place-items-center text-primary-foreground shrink-0" style={{ background: "var(--gradient-neon)" }}>
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <div className="font-display text-sm">Perjanjian Umum</div>
              <div className="text-[11px] text-muted-foreground">Ringkasan syarat pemakaian</div>
            </div>
          </div>
          <ul className="mt-4 text-xs text-foreground/85 space-y-2.5">
            <li className="flex gap-2">
              <span className="text-primary mt-0.5">•</span>
              <span><b className="text-foreground">Bring Your Own Key (BYOK).</b> Semua API key & token yang Anda tempel adalah milik pribadi, disimpan terenkripsi, dan tidak dibagikan ke pengguna lain.</span>
            </li>
            <li className="flex gap-2">
              <span className="text-primary mt-0.5">•</span>
              <span><b className="text-foreground">Tanggung jawab konten.</b> Seluruh hasil generate menjadi tanggung jawab pembuat. Dilarang untuk konten ilegal, kekerasan, pornografi, atau melanggar hak cipta.</span>
            </li>
            <li className="flex gap-2">
              <span className="text-primary mt-0.5">•</span>
              <span><b className="text-foreground">Satu akun, satu pengguna.</b> Sharing akun akan menonaktifkan sesi lama secara otomatis (single-session).</span>
            </li>
            <li className="flex gap-2">
              <span className="text-primary mt-0.5">•</span>
              <span><b className="text-foreground">Provider pihak ketiga.</b> Kami tidak menjamin uptime, harga, atau kebijakan Gemini, OpenAI, ElevenLabs, Wavespeed, Weavy, Magnific, maupun provider lain.</span>
            </li>
            <li className="flex gap-2">
              <span className="text-primary mt-0.5">•</span>
              <span><b className="text-foreground">Data & privasi.</b> Hanya data yang diperlukan untuk menjalankan fitur (profil, project, key terenkripsi) yang disimpan. Anda dapat menghapus akun kapan saja.</span>
            </li>
            <li className="flex gap-2">
              <span className="text-primary mt-0.5">•</span>
              <span><b className="text-foreground">Perubahan layanan.</b> Fitur dapat berubah, ditambah, atau dihentikan sewaktu-waktu untuk perbaikan kualitas.</span>
            </li>
            <li className="flex gap-2">
              <span className="text-primary mt-0.5">•</span>
              <span><b className="text-foreground">Persetujuan.</b> Dengan menggunakan {APP_NAME}, Anda dianggap menyetujui seluruh ketentuan di atas.</span>
            </li>
          </ul>
        </div>
      </div>

    </DashboardShell>
  );
}

function CatChip({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className={[
        "text-[11px] rounded-full px-3 py-1.5 border transition",
        active
          ? "border-primary/70 bg-primary/10 text-foreground"
          : "border-border/60 text-muted-foreground hover:text-foreground hover:border-border",
      ].join(" ")}
    >
      {label}
    </button>
  );
}
