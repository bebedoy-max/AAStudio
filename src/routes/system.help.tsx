import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { DashboardShell, PageHero } from "@/components/dashboard/shell";
import {
  Search,
  KeyRound,
  Route as RouteIcon,
  Brain,
  Mic2,
  Sparkles,
  ShieldCheck,
  ExternalLink,
  ChevronRight,
  Zap,
  LifeBuoy,
  Mail,
  MessageCircle,
  Info,
  Wallet,
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
  { id: "start", label: "Mulai" },
  { id: "keys", label: "Token & API" },
  { id: "routing", label: "Routing Provider" },
  { id: "tips", label: "Tips & Shortcut" },
] as const;

const GUIDES: Guide[] = [
  {
    id: "quickstart",
    category: "start",
    icon: Sparkles,
    title: "Mulai dari Nol (3 Langkah)",
    summary: "Urutan paling singkat sebelum bisa generate apa pun.",
    tags: ["mulai", "onboarding"],
    steps: [
      "Isi token: Manage → Token/API Manager. Minimal 1 key Brain (Gemini/OpenAI).",
      "Pilih provider: Manage → Routing Provider, tentukan provider default untuk Brain, Image, Video, dan Voice.",
      "Buka menu generate yang diinginkan dari sidebar, lalu jalankan.",
    ],
    tips: [
      "Menu yang butuh Brain akan mengunci diri sampai key Brain terisi (atau admin mengaktifkan Global Brain).",
      "Token disimpan terenkripsi di akun Anda, jadi otomatis ikut saat pindah perangkat.",
    ],
    links: [
      { label: "Token Manager", to: "/manage/tokens" },
      { label: "Routing Provider", to: "/manage/routing" },
    ],
  },
  {
    id: "brain",
    category: "start",
    icon: Brain,
    title: "Menu yang Butuh Brain API",
    summary: "Storyboard, Naratif, AI Influencer, Clipper, dan Dubbing memakai Brain (text AI).",
    tags: ["brain", "gemini", "openai"],
    steps: [
      "Ambil API key Gemini gratis di aistudio.google.com/apikey (formatnya diawali AIza… atau AQ…).",
      "Atau pakai OpenAI: platform.openai.com/api-keys (format sk-…).",
      "Tempel di Token Manager → tab Brain, klik Tambah & Cek — hanya key valid yang tersimpan.",
      "Setelah tersimpan, menu yang tadinya terkunci langsung bisa dipakai (refresh bila perlu).",
    ],
    tips: [
      "Tambahkan beberapa key sekaligus: sistem otomatis rotasi saat satu key kena limit 429.",
      "Kalau Anda belum punya key, admin bisa mengaktifkan Global Brain sebagai brain sementara.",
    ],
    links: [
      { label: "Isi key Brain", to: "/manage/tokens" },
      { label: "Ambil key Gemini", href: "https://aistudio.google.com/apikey" },
    ],
  },
  {
    id: "voice",
    category: "start",
    icon: Mic2,
    title: "Menu yang Butuh Voice Over API",
    summary: "Naratif Video Maker & Dubbing butuh key ElevenLabs untuk suara.",
    tags: ["voice", "tts", "elevenlabs"],
    steps: [
      "Daftar di elevenlabs.io, buka Profile → API Keys, salin key-nya.",
      "Tempel di Token Manager → tab Voice, klik Tambah & Cek (sisa credit langsung terlihat).",
      "Di menu Naratif/Dubbing pilih voice, lalu generate voice over.",
    ],
    tips: [
      "Key dengan credit 0 tidak akan disimpan — isi ulang dulu atau pakai key lain.",
      "Beberapa key ElevenLabs boleh ditambahkan agar kuota gabungan lebih besar.",
    ],
    links: [
      { label: "Isi key Voice", to: "/manage/tokens" },
      { label: "Ambil key ElevenLabs", href: "https://elevenlabs.io/app/settings/api-keys" },
    ],
  },
  {
    id: "isi-token",
    category: "keys",
    icon: KeyRound,
    title: "Cara Isi Token / API Key",
    summary: "Alur yang sama untuk semua provider: tempel → cek → tersimpan.",
    tags: ["token", "api key", "manage"],
    steps: [
      "Buka Manage → Token/API Manager, pilih tab provider.",
      "Tempel key di kotak input (boleh banyak sekaligus, satu key per baris).",
      "Klik Tambah & Cek. Sistem memeriksa format, duplikat, validitas, dan sisa credit.",
      "Popup ringkasan muncul: mana yang valid (beserta credit) dan mana yang ditolak.",
      "Hanya key valid yang masuk ke daftar token aktif.",
    ],
    tips: [
      "Key ditolak biasanya karena salah format, expired, duplikat, atau credit habis.",
      "Anda bisa menghapus/menonaktifkan key kapan saja dari daftar token aktif.",
    ],
    links: [{ label: "Buka Token Manager", to: "/manage/tokens" }],
  },
  {
    id: "ambil-token",
    category: "keys",
    icon: Wallet,
    title: "Cara Ambil Token dari Provider",
    summary: "Tempat mengambil key untuk tiap provider yang didukung.",
    tags: ["gemini", "openai", "elevenlabs", "wavespeed", "weavy"],
    steps: [
      "Gemini: aistudio.google.com/apikey → Create API key.",
      "OpenAI: platform.openai.com/api-keys → Create new secret key.",
      "ElevenLabs: elevenlabs.io → Settings → API Keys.",
      "Wavespeed / Weavy / Magnific: login ke dashboard masing-masing, buka menu API/Token, salin key.",
      "Leonardo / Firefly / Framia: pakai token sesi (Bearer) dari browser, lihat panduan di tab provider terkait.",
    ],
    tips: [
      "Jangan bagikan key ke orang lain — semua pemakaian dihitung ke akun provider Anda.",
      "Bila tidak ingin pakai key sendiri, cek Token Bank untuk token yang disediakan platform.",
    ],
    links: [{ label: "Token Manager", to: "/manage/tokens" }],
  },
  {
    id: "routing",
    category: "routing",
    icon: RouteIcon,
    title: "Cara Route Provider",
    summary: "Menentukan provider mana yang dipakai untuk Brain, Image, Video, Voice, dan Motion.",
    tags: ["routing", "provider"],
    steps: [
      "Buka Manage → Routing Provider.",
      "Pilih kapabilitas (Brain / Image / Video / Voice / Motion).",
      "Klik kartu provider yang diinginkan — pilihan langsung tersimpan.",
      "Semua menu generate otomatis memakai provider tersebut.",
    ],
    tips: [
      "Setiap kartu provider menampilkan model dan perkiraan biayanya.",
      "Provider yang dinonaktifkan admin tidak akan muncul di daftar.",
    ],
    links: [{ label: "Buka Routing Provider", to: "/manage/routing" }],
  },
  {
    id: "shortcut",
    category: "tips",
    icon: Zap,
    title: "Tips & Shortcut Cepat",
    summary: "Trik kecil yang menghemat banyak klik.",
    tags: ["shortcut", "tips"],
    steps: [
      'Ganti provider tanpa pindah menu: klik label "Provider aktif: …" di halaman generate — ikon switch berputar menandakan tombol itu bisa diklik.',
      "Tempel banyak key sekaligus di Token Manager (satu per baris) — pengecekan berjalan otomatis.",
      "Klik ikon gembok pada menu = fitur dikunci admin; ikon keranjang = fitur premium yang bisa dibeli.",
      "Semua hasil generate tersimpan di Library / Asset Hub, tidak perlu download satu per satu saat itu juga.",
    ],
    tips: [
      "Kena error 429? Tambah key cadangan; rotasi otomatis akan memakainya.",
      "Error 401/403 biasanya token expired — ambil ulang token dari provider dan cek lagi.",
    ],
    links: [{ label: "Routing Provider", to: "/manage/routing" }],
  },
];

const CAT_LABEL = Object.fromEntries(CATEGORIES.map((c) => [c.id, c.label]));

export const Route = createFileRoute("/system/help")({
  head: () => ({
    meta: [
      { title: "Pusat Bantuan — AA Creative Studio" },
      {
        name: "description",
        content:
          "Panduan singkat AA Creative Studio: cara isi token/API, mengambil token provider, routing provider, serta tips dan shortcut pemakaian.",
      },
      { property: "og:title", content: "Pusat Bantuan — AA Creative Studio" },
      {
        property: "og:description",
        content:
          "Panduan singkat: token/API, routing provider, dan shortcut pemakaian AA Creative Studio.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: HelpPage,
});

function HelpPage() {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<string>("all");
  const [openId, setOpenId] = useState<string | null>("quickstart");
  const [support, setSupport] = useState<{ email: string; phone: string; whatsapp: string }>({
    email: "",
    phone: "",
    whatsapp: "",
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    const h = window.location.hash.replace(/^#/, "");
    if (h && GUIDES.some((g) => g.id === h)) {
      setOpenId(h);
      requestAnimationFrame(() => {
        document
          .getElementById(`guide-${h}`)
          ?.scrollIntoView({ behavior: "smooth", block: "start" });
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
      const hay =
        `${g.title} ${g.summary} ${g.tags.join(" ")} ${(g.steps || []).join(" ")}`.toLowerCase();
      return hay.includes(query);
    });
  }, [q, cat]);

  return (
    <DashboardShell>
      <PageHero
        eyebrow="Pusat Bantuan"
        title="Panduan Singkat"
        highlight="AA Creative Studio"
        desc="Fokus pada yang penting: isi token, ambil token, atur routing provider, dan shortcut harian."
      />

      {/* Search + Category */}
      <div className="neumorph p-4 md:p-5 mb-6">
        <div className="relative">
          <Search className="h-4 w-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Cari panduan… (mis. 'token', 'brain', 'voice', 'routing')"
            className="w-full bg-card/60 border border-border/60 rounded-xl pl-10 pr-4 py-3 text-sm outline-none focus:border-primary/60"
          />
        </div>
        <div className="flex flex-wrap gap-2 mt-4">
          <CatChip
            active={cat === "all"}
            onClick={() => setCat("all")}
            label={`Semua (${GUIDES.length})`}
          />
          {CATEGORIES.map((c) => {
            const n = GUIDES.filter((g) => g.category === c.id).length;
            return (
              <CatChip
                key={c.id}
                active={cat === c.id}
                onClick={() => setCat(c.id)}
                label={`${c.label} (${n})`}
              />
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
            <article
              key={g.id}
              id={`guide-${g.id}`}
              className="neumorph overflow-hidden scroll-mt-24"
            >
              <button
                onClick={() => setOpenId(open ? null : g.id)}
                className="w-full text-left p-5 flex items-start gap-4 hover:bg-card/40 transition"
              >
                <div
                  className="h-11 w-11 rounded-xl grid place-items-center text-primary-foreground shrink-0"
                  style={{ background: "var(--gradient-neon)" }}
                >
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
                <ChevronRight
                  className={`h-4 w-4 text-muted-foreground mt-3 shrink-0 transition ${open ? "rotate-90" : ""}`}
                />
              </button>

              {open && (
                <div className="px-5 pb-5 -mt-1 space-y-4 text-sm">
                  {g.steps && (
                    <div>
                      <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2">
                        Langkah
                      </div>
                      <ol className="space-y-1.5 list-decimal list-inside text-foreground/90">
                        {g.steps.map((s, i) => (
                          <li key={i}>{s}</li>
                        ))}
                      </ol>
                    </div>
                  )}
                  {g.tips && (
                    <div>
                      <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2">
                        Tips
                      </div>
                      <ul className="space-y-1.5 list-disc list-inside text-foreground/80">
                        {g.tips.map((s, i) => (
                          <li key={i}>{s}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {g.links && g.links.length > 0 && (
                    <div className="flex flex-wrap gap-2 pt-1">
                      {g.links.map((l) =>
                        l.to ? (
                          <Link
                            key={l.label}
                            to={l.to}
                            className="text-xs inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 border border-border/60 hover:border-primary/60 hover:bg-primary/5"
                          >
                            {l.label} <ChevronRight className="h-3 w-3" />
                          </Link>
                        ) : (
                          <a
                            key={l.label}
                            href={l.href}
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 border border-border/60 hover:border-primary/60 hover:bg-primary/5"
                          >
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
        <div className="neumorph p-5">
          <div className="flex items-center gap-3">
            <div
              className="h-10 w-10 rounded-xl grid place-items-center text-primary-foreground shrink-0"
              style={{ background: "var(--gradient-neon)" }}
            >
              <LifeBuoy className="h-5 w-5" />
            </div>
            <div>
              <div className="font-display text-sm">Kontak Support</div>
              <div className="text-[11px] text-muted-foreground">
                Hubungi kami melalui kanal berikut.
              </div>
            </div>
          </div>
          <div className="mt-4 space-y-2">
            {support.email && (
              <a
                href={`mailto:${support.email}`}
                className="flex items-center gap-2.5 rounded-lg px-3 py-2 border border-border/60 hover:border-primary/60 hover:bg-primary/5 text-xs"
              >
                <Mail className="h-3.5 w-3.5 text-primary" />
                <span className="text-foreground/90">{support.email}</span>
              </a>
            )}
            {support.phone && (
              <a
                href={`tel:${support.phone.replace(/\s+/g, "")}`}
                className="flex items-center gap-2.5 rounded-lg px-3 py-2 border border-border/60 hover:border-primary/60 hover:bg-primary/5 text-xs"
              >
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

        <div className="neumorph p-5">
          <div className="flex items-center gap-3">
            <div
              className="h-10 w-10 rounded-xl grid place-items-center text-primary-foreground shrink-0"
              style={{ background: "var(--gradient-neon)" }}
            >
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
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Runtime</dt>
              <dd className="text-foreground/90">Web · SSR Edge</dd>
            </div>
          </dl>
        </div>

        <div className="neumorph p-5">
          <div className="flex items-center gap-3">
            <div
              className="h-10 w-10 rounded-xl grid place-items-center text-primary-foreground shrink-0"
              style={{ background: "var(--gradient-neon)" }}
            >
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
              <span>
                <b className="text-foreground">Bring Your Own Key (BYOK).</b> Key Anda disimpan
                terenkripsi dan tidak dibagikan ke pengguna lain.
              </span>
            </li>
            <li className="flex gap-2">
              <span className="text-primary mt-0.5">•</span>
              <span>
                <b className="text-foreground">Tanggung jawab konten.</b> Seluruh hasil generate
                menjadi tanggung jawab pembuat.
              </span>
            </li>
            <li className="flex gap-2">
              <span className="text-primary mt-0.5">•</span>
              <span>
                <b className="text-foreground">Satu akun, satu pengguna.</b> Sesi lama otomatis
                dinonaktifkan (single-session).
              </span>
            </li>
            <li className="flex gap-2">
              <span className="text-primary mt-0.5">•</span>
              <span>
                <b className="text-foreground">Provider pihak ketiga.</b> Uptime, harga, dan
                kebijakan provider di luar kendali kami.
              </span>
            </li>
            <li className="flex gap-2">
              <span className="text-primary mt-0.5">•</span>
              <span>
                <b className="text-foreground">Persetujuan.</b> Dengan menggunakan {APP_NAME}, Anda
                menyetujui ketentuan di atas.
              </span>
            </li>
          </ul>
        </div>
      </div>
    </DashboardShell>
  );
}

function CatChip({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
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
