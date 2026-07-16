import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Bell,
  Palette,
  User as UserIcon,
  Wand2,
  HardDrive,
  ShieldCheck,
  Plug,
  Info,
  LogOut,
  ExternalLink,
  Save,
} from "lucide-react";
import { DashboardShell, PageHero } from "@/components/dashboard/shell";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/system/settings")({
  head: () => ({
    meta: [
      { title: "Pengaturan — AA Creative Studio" },
      { name: "description", content: "Kelola akun, tampilan, default generasi, penyimpanan, dan keamanan AA Creative Studio." },
    ],
  }),
  component: SettingsPage,
});

// ---------- Preferences (localStorage) ----------
const PREF_KEY = "aatools.settings.prefs";

type Prefs = {
  theme: "dark" | "light" | "system";
  reduceMotion: boolean;
  language: "id" | "en";
  notifyDesktop: boolean;
  notifySound: boolean;
  notifyErrors: boolean;
  defaultVideoModel: "kling-2.5" | "wavespeed" | "runway";
  defaultImageSize: "1024" | "1536" | "2048";
  motionStrength: number; // 0..100
  autoDownloadRender: boolean;
};

const DEFAULT_PREFS: Prefs = {
  theme: "dark",
  reduceMotion: false,
  language: "id",
  notifyDesktop: true,
  notifySound: false,
  notifyErrors: true,
  defaultVideoModel: "kling-2.5",
  defaultImageSize: "1536",
  motionStrength: 60,
  autoDownloadRender: false,
};

function loadPrefs(): Prefs {
  if (typeof window === "undefined") return DEFAULT_PREFS;
  try {
    const raw = localStorage.getItem(PREF_KEY);
    return raw ? { ...DEFAULT_PREFS, ...JSON.parse(raw) } : DEFAULT_PREFS;
  } catch {
    return DEFAULT_PREFS;
  }
}
function savePrefs(p: Prefs) {
  localStorage.setItem(PREF_KEY, JSON.stringify(p));
}

// ---------- Small UI atoms ----------
function Section({
  icon: Icon,
  title,
  desc,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  desc: string;
  children: React.ReactNode;
}) {
  return (
    <section className="neumorph p-5 md:p-6">
      <header className="flex items-start gap-3 mb-5">
        <div className="h-10 w-10 rounded-xl border border-border grid place-items-center bg-card/40">
          <Icon className="h-5 w-5 text-[var(--neon-cyan)]" />
        </div>
        <div>
          <h2 className="font-display text-lg text-foreground">{title}</h2>
          <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
        </div>
      </header>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function Row({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-2">
      <div className="min-w-0">
        <div className="text-sm text-foreground">{label}</div>
        {hint && <div className="text-xs text-muted-foreground mt-0.5">{hint}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      aria-pressed={value}
      onClick={() => onChange(!value)}
      className={[
        "relative h-7 w-14 rounded-full transition-all border",
        value ? "border-transparent" : "border-border bg-sidebar-accent",
      ].join(" ")}
      style={value ? { background: "var(--gradient-neon)" } : undefined}
    >
      <span
        className={[
          "absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all",
          value ? "left-7" : "left-0.5",
        ].join(" ")}
      />
    </button>
  );
}

function Select<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as T)}
      className="rounded-lg border border-border bg-card/60 px-3 py-1.5 text-sm outline-none focus:border-primary/60"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={[
        "w-full rounded-lg border border-border bg-card/60 px-3 py-2 text-sm outline-none focus:border-primary/60 disabled:opacity-60",
        props.className ?? "",
      ].join(" ")}
    />
  );
}

// ---------- Page ----------
function SettingsPage() {
  const { user, profile, roles, signOut, refresh } = useAuth();
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);
  const [displayName, setDisplayName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [storageBytes, setStorageBytes] = useState(0);

  useEffect(() => {
    setPrefs(loadPrefs());
  }, []);
  useEffect(() => {
    setDisplayName(profile?.display_name ?? "");
    setAvatarUrl(profile?.avatar_url ?? "");
  }, [profile]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    let total = 0;
    for (const k in localStorage) {
      if (!Object.prototype.hasOwnProperty.call(localStorage, k)) continue;
      if (!k.startsWith("aatools.")) continue;
      total += (localStorage.getItem(k) ?? "").length + k.length;
    }
    setStorageBytes(total * 2); // UTF-16
  }, []);

  const update = <K extends keyof Prefs>(key: K, val: Prefs[K]) => {
    setPrefs((p) => {
      const next = { ...p, [key]: val };
      savePrefs(next);
      return next;
    });
  };

  const humanBytes = useMemo(() => {
    const kb = storageBytes / 1024;
    if (kb < 1024) return `${kb.toFixed(1)} KB`;
    return `${(kb / 1024).toFixed(2)} MB`;
  }, [storageBytes]);

  async function handleSaveProfile() {
    if (!user) return;
    setSavingProfile(true);
    const { error } = await supabase
      .from("profiles")
      .update({ display_name: displayName || null, avatar_url: avatarUrl || null })
      .eq("id", user.id);
    setSavingProfile(false);
    if (error) {
      toast.error("Gagal menyimpan profil", { description: error.message });
      return;
    }
    toast.success("Profil disimpan");
    await refresh();
  }

  function handleClearCache() {
    if (typeof window === "undefined") return;
    const keys = Object.keys(localStorage).filter(
      (k) =>
        k.startsWith("aatools.") &&
        // preserve credentials & auth-critical stores
        !k.includes(".weavy.tokens") &&
        !k.includes(".weavy.activeId") &&
        !k.includes(".brain.geminiKeys") &&
        !k.includes(".brain.openaiKeys") &&
        k !== PREF_KEY,
    );
    keys.forEach((k) => localStorage.removeItem(k));
    toast.success(`Cache lokal dibersihkan (${keys.length} item)`, {
      description: "Token & preferensi tidak dihapus.",
    });
    setStorageBytes(0);
  }

  async function handleSignOutEverywhere() {
    await supabase.auth.signOut({ scope: "global" });
    await signOut();
    toast.success("Keluar dari semua perangkat");
  }

  return (
    <DashboardShell>
      <PageHero
        eyebrow="System"
        title="Pengaturan"
        desc="Kelola akun, tampilan, default generasi, penyimpanan, keamanan, dan integrasi AA Creative Studio."
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Akun */}
        <Section icon={UserIcon} title="Akun & Profil" desc="Info akun yang tampil di workspace dan history.">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-1">Email</div>
              <TextInput value={user?.email ?? ""} disabled />
            </div>
            <div>
              <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-1">Role</div>
              <TextInput value={roles.join(", ") || "user"} disabled />
            </div>
            <div>
              <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-1">
                Nama Tampilan
              </div>
              <TextInput
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Nama kamu"
              />
            </div>
            <div>
              <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-1">
                URL Avatar
              </div>
              <TextInput
                value={avatarUrl}
                onChange={(e) => setAvatarUrl(e.target.value)}
                placeholder="https://…"
              />
            </div>
          </div>
          <div className="flex justify-end">
            <button
              onClick={handleSaveProfile}
              disabled={savingProfile || !user}
              className="inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-60"
              style={{ background: "var(--gradient-neon)" }}
            >
              <Save className="h-4 w-4" /> {savingProfile ? "Menyimpan…" : "Simpan Profil"}
            </button>
          </div>
        </Section>

        {/* Tampilan */}
        <Section icon={Palette} title="Tampilan & Bahasa" desc="Tema, animasi, dan bahasa antarmuka.">
          <Row label="Tema" hint="Warna dasar antarmuka.">
            <Select
              value={prefs.theme}
              onChange={(v) => update("theme", v)}
              options={[
                { value: "dark", label: "Gelap" },
                { value: "light", label: "Terang" },
                { value: "system", label: "Ikuti Sistem" },
              ]}
            />
          </Row>
          <Row label="Kurangi Animasi" hint="Nonaktifkan transisi berat untuk performa.">
            <Toggle value={prefs.reduceMotion} onChange={(v) => update("reduceMotion", v)} />
          </Row>
          <Row label="Bahasa" hint="Bahasa label & panduan.">
            <Select
              value={prefs.language}
              onChange={(v) => update("language", v)}
              options={[
                { value: "id", label: "Bahasa Indonesia" },
                { value: "en", label: "English" },
              ]}
            />
          </Row>
        </Section>

        {/* Notifikasi */}
        <Section icon={Bell} title="Notifikasi" desc="Pemberitahuan saat task generate selesai atau gagal.">
          <Row label="Notifikasi Desktop" hint="Tampilkan popup saat render selesai.">
            <Toggle
              value={prefs.notifyDesktop}
              onChange={async (v) => {
                if (v && typeof Notification !== "undefined" && Notification.permission === "default") {
                  await Notification.requestPermission();
                }
                update("notifyDesktop", v);
              }}
            />
          </Row>
          <Row label="Suara Selesai" hint="Bunyi lembut ketika task berhasil.">
            <Toggle value={prefs.notifySound} onChange={(v) => update("notifySound", v)} />
          </Row>
          <Row label="Alert Error" hint="Toast merah jika provider/API gagal.">
            <Toggle value={prefs.notifyErrors} onChange={(v) => update("notifyErrors", v)} />
          </Row>
        </Section>

        {/* Default Generasi */}
        <Section icon={Wand2} title="Default Generasi" desc="Preset yang dipakai halaman Generate & Mixing.">
          <Row label="Model Video Default">
            <Select
              value={prefs.defaultVideoModel}
              onChange={(v) => update("defaultVideoModel", v)}
              options={[
                { value: "kling-2.5", label: "Kling 2.5" },
                { value: "wavespeed", label: "Wavespeed" },
                { value: "runway", label: "Runway" },
              ]}
            />
          </Row>
          <Row label="Ukuran Gambar Default">
            <Select
              value={prefs.defaultImageSize}
              onChange={(v) => update("defaultImageSize", v)}
              options={[
                { value: "1024", label: "1024 px" },
                { value: "1536", label: "1536 px" },
                { value: "2048", label: "2048 px" },
              ]}
            />
          </Row>
          <Row label={`Motion Strength — ${prefs.motionStrength}`} hint="Intensitas gerakan default untuk i2v & motion.">
            <input
              type="range"
              min={0}
              max={100}
              value={prefs.motionStrength}
              onChange={(e) => update("motionStrength", Number(e.target.value))}
              className="w-40 accent-[var(--neon-cyan)]"
            />
          </Row>
          <Row label="Auto-download Hasil" hint="Unduh otomatis file render begitu selesai.">
            <Toggle value={prefs.autoDownloadRender} onChange={(v) => update("autoDownloadRender", v)} />
          </Row>
        </Section>

        {/* Penyimpanan */}
        <Section icon={HardDrive} title="Penyimpanan Lokal" desc="Draft project & cache di browser (tidak termasuk token).">
          <Row label="Penggunaan" hint="Total data AA Creative Studio di localStorage browser ini.">
            <span className="rounded-full border border-border px-2.5 py-0.5 text-xs font-mono text-foreground">
              {humanBytes}
            </span>
          </Row>
          <div className="flex justify-end">
            <button
              onClick={handleClearCache}
              className="rounded-lg border border-border bg-card/40 px-3 py-1.5 text-sm hover:border-[var(--neon-pink)]/60"
            >
              Bersihkan Cache
            </button>
          </div>
        </Section>

        {/* Keamanan */}
        <Section icon={ShieldCheck} title="Keamanan & Sesi" desc="Kontrol sesi login dan akses perangkat.">
          <Row label="Sesi Tunggal Aktif" hint="Login di perangkat baru otomatis meng-logout perangkat lain.">
            <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-xs text-emerald-300">
              Aktif
            </span>
          </Row>
          <Row label="Auto Logout Idle" hint="Sesi berakhir setelah tidak ada aktivitas.">
            <span className="rounded-full border border-border px-2.5 py-0.5 text-xs font-mono">30 menit</span>
          </Row>
          <div className="flex justify-end">
            <button
              onClick={handleSignOutEverywhere}
              className="inline-flex items-center gap-2 rounded-lg border border-[var(--neon-pink)]/40 bg-[var(--neon-pink)]/10 px-3 py-1.5 text-sm text-[var(--neon-pink)] hover:bg-[var(--neon-pink)]/20"
            >
              <LogOut className="h-4 w-4" /> Keluar dari Semua Perangkat
            </button>
          </div>
        </Section>

        {/* Integrasi */}
        <Section icon={Plug} title="Integrasi & Token" desc="Kelola API key provider dan routing model.">
          <Row label="Token Provider" hint="Weavy, ElevenLabs, Magnific, Wavespeed, dll.">
            <Link
              to="/manage/tokens"
              className="inline-flex items-center gap-1.5 text-xs text-[var(--neon-cyan)] hover:underline"
            >
              Buka <ExternalLink className="h-3.5 w-3.5" />
            </Link>
          </Row>
          <Row label="Routing Model" hint="Preferensi model per task (chat, image, video, voice).">
            <Link
              to="/manage/routing"
              className="inline-flex items-center gap-1.5 text-xs text-[var(--neon-cyan)] hover:underline"
            >
              Buka <ExternalLink className="h-3.5 w-3.5" />
            </Link>
          </Row>
          <Row label="AI Keys (Gemini / OpenAI)" hint="Disimpan lokal di browser, dipakai Brain & Router.">
            <Link
              to="/manage/tokens"
              className="inline-flex items-center gap-1.5 text-xs text-[var(--neon-cyan)] hover:underline"
            >
              Kelola <ExternalLink className="h-3.5 w-3.5" />
            </Link>
          </Row>
        </Section>

        {/* Tentang */}
        <Section icon={Info} title="Tentang AA Creative Studio" desc="Info aplikasi dan bantuan.">
          <Row label="Versi Aplikasi">
            <span className="rounded-full border border-border px-2.5 py-0.5 text-xs font-mono">v1.0.0</span>
          </Row>
          <Row label="Bantuan & Dokumentasi">
            <Link
              to="/system/help"
              className="inline-flex items-center gap-1.5 text-xs text-[var(--neon-cyan)] hover:underline"
            >
              Buka Help <ExternalLink className="h-3.5 w-3.5" />
            </Link>
          </Row>
          <Row label="Analitik Penggunaan">
            <Link
              to="/system/analytic"
              className="inline-flex items-center gap-1.5 text-xs text-[var(--neon-cyan)] hover:underline"
            >
              Lihat <ExternalLink className="h-3.5 w-3.5" />
            </Link>
          </Row>
        </Section>
      </div>
    </DashboardShell>
  );
}
