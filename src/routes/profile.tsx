import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, ShieldCheck, Crown, Check, Users } from "lucide-react";
import { DashboardShell, PageHero } from "@/components/dashboard/shell";
import { useAuth, ALL_ROUTE_KEYS } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";


export const Route = createFileRoute("/profile")({
  head: () => ({
    meta: [
      { title: "Profil Saya — AA Creative Studio" },
      { name: "description", content: "Kelola info profil, avatar, dan password akun AA Creative Studio." },
    ],
  }),
  component: ProfilePage,
});

function ProfilePage() {
  const { user, profile, roles, routePermissions, isAdmin, refresh } = useAuth();

  const [displayName, setDisplayName] = useState("");
  const [phone, setPhone] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);

  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);

  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    setDisplayName(profile?.display_name ?? "");
    setAvatarUrl(profile?.avatar_url ?? "");
    setPhone((user?.user_metadata as { phone?: string } | undefined)?.phone ?? "");
  }, [profile, user]);

  const hasFullAccess =
    isAdmin || ALL_ROUTE_KEYS.every((r) => routePermissions.includes(r.key));

  const grantedFeatures = isAdmin
    ? ALL_ROUTE_KEYS
    : ALL_ROUTE_KEYS.filter((r) => routePermissions.includes(r.key));

  const handleSaveProfile = async () => {
    if (!user) return;
    setSavingProfile(true);
    try {
      const { error: pErr } = await supabase
        .from("profiles")
        .update({ display_name: displayName, avatar_url: avatarUrl || null })
        .eq("id", user.id);
      if (pErr) throw pErr;

      const { error: uErr } = await supabase.auth.updateUser({ data: { phone } });
      if (uErr) throw uErr;

      await refresh();
      toast.success("Profil berhasil disimpan");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal menyimpan profil");
    } finally {
      setSavingProfile(false);
    }
  };

  const handleAvatarUpload = async (file: File) => {
    if (!user) return;
    setUploading(true);
    try {
      const reader = new FileReader();
      const dataUrl = await new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      setAvatarUrl(dataUrl);
      toast.info('Foto siap. Klik "Simpan Perubahan" untuk menyimpan.');
    } catch {
      toast.error("Gagal memuat gambar");
    } finally {
      setUploading(false);
    }
  };

  const handleChangePassword = async () => {
    if (!password || password.length < 6) {
      toast.error("Password minimal 6 karakter");
      return;
    }
    if (password !== password2) {
      toast.error("Konfirmasi password tidak cocok");
      return;
    }
    setSavingPassword(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setPassword("");
      setPassword2("");
      toast.success("Password berhasil diubah");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal mengubah password");
    } finally {
      setSavingPassword(false);
    }
  };

  const initial = (displayName[0] || user?.email?.[0] || "U").toUpperCase();
  const roleLabel = isAdmin ? "Admin" : roles[0] ?? "user";

  return (
    <DashboardShell>
      <PageHero
        eyebrow="Akun"
        title="Profil"
        highlight="Saya"
        desc="Kelola informasi akun, avatar, akses, dan password Anda."
        action={
          isAdmin ? (
            <Link
              to="/admin"
              className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold text-primary-foreground"
              style={{ background: "var(--gradient-neon)" }}
            >
              <Users className="h-4 w-4" /> Manage User
            </Link>
          ) : undefined
        }
      />


      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Left: Avatar + identity card */}
        <div className="neumorph p-5 lg:col-span-1">
          <div className="flex flex-col items-center text-center">
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt={displayName}
                className="h-28 w-28 rounded-full object-cover border border-border"
              />
            ) : (
              <div
                className="h-28 w-28 rounded-full grid place-items-center text-primary-foreground font-display text-4xl"
                style={{ background: "var(--gradient-neon)" }}
              >
                {initial}
              </div>
            )}
            <div className="mt-3 font-display text-lg text-foreground">
              {displayName || user?.email?.split("@")[0]}
            </div>
            <div className="text-xs text-muted-foreground">{user?.email}</div>
            <div className="mt-2 inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-widest text-primary">
              {isAdmin ? <ShieldCheck className="h-3 w-3" /> : <Check className="h-3 w-3" />}
              {roleLabel}
            </div>

            <label className="mt-4 w-full">
              <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-1 text-left">
                Ubah Foto / Avatar
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  id="avatar-file"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleAvatarUpload(f);
                  }}
                />
                <label
                  htmlFor="avatar-file"
                  className="cursor-pointer flex-1 rounded-xl border border-border bg-card/50 px-3 py-2 text-xs text-center hover:bg-sidebar-accent/60"
                >
                  {uploading ? "Memuat…" : "Pilih file"}
                </label>
                {avatarUrl && (
                  <button
                    onClick={() => setAvatarUrl("")}
                    className="rounded-xl border border-border bg-card/50 px-3 py-2 text-xs hover:bg-sidebar-accent/60"
                  >
                    Hapus
                  </button>
                )}
              </div>
              <div className="mt-1 text-[10px] text-muted-foreground text-left">
                Atau tempel URL gambar pada input di kanan.
              </div>
            </label>
          </div>
        </div>

        {/* Right: Info & password */}
        <div className="lg:col-span-2 flex flex-col gap-5">
          <div className="neumorph p-5">
            <div className="font-display text-lg text-foreground">Info Profil</div>
            <p className="text-xs text-muted-foreground mt-1">
              Data ini muncul di header aplikasi dan pada aktivitas Anda.
            </p>
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Nama Tampilan">
                <input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full rounded-xl border border-border bg-card/50 px-3 py-2 text-sm outline-none focus:border-primary/60"
                  placeholder="Nama lengkap / display name"
                />
              </Field>
              <Field label="Email">
                <input
                  value={user?.email ?? ""}
                  disabled
                  className="w-full rounded-xl border border-border bg-card/40 px-3 py-2 text-sm text-muted-foreground"
                />
              </Field>
              <Field label="No. Telepon">
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full rounded-xl border border-border bg-card/50 px-3 py-2 text-sm outline-none focus:border-primary/60"
                  placeholder="+62…"
                />
              </Field>
              <Field label="URL Avatar">
                <input
                  value={avatarUrl}
                  onChange={(e) => setAvatarUrl(e.target.value)}
                  className="w-full rounded-xl border border-border bg-card/50 px-3 py-2 text-sm outline-none focus:border-primary/60"
                  placeholder="https://…"
                />
              </Field>
            </div>
            <div className="mt-4 flex justify-end">
              <button
                onClick={handleSaveProfile}
                disabled={savingProfile}
                className="inline-flex items-center gap-1.5 rounded-full px-5 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
                style={{ background: "var(--gradient-neon)" }}
              >
                {savingProfile && <Loader2 className="h-4 w-4 animate-spin" />}
                Simpan Perubahan
              </button>
            </div>
          </div>

          <div className="neumorph p-5">
            <div className="flex items-center gap-2">
              {hasFullAccess ? (
                <Crown className="h-4 w-4 text-primary" />
              ) : (
                <ShieldCheck className="h-4 w-4 text-primary" />
              )}
              <div className="font-display text-lg text-foreground">Akses yang Diberikan</div>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Daftar fitur yang bisa Anda akses dalam aplikasi.
            </p>
            {hasFullAccess ? (
              <div className="mt-3 rounded-xl border border-primary/40 bg-primary/[0.06] px-4 py-3">
                <div className="font-display text-base text-gradient">FULL AKSES</div>
                <div className="text-xs text-muted-foreground">
                  Semua fitur premium dan area admin terbuka untuk akun Anda.
                </div>
              </div>
            ) : (
              <div className="mt-3">
                <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-2">
                  Sebagian / Tertentu — {grantedFeatures.length} fitur
                </div>
                {grantedFeatures.length === 0 ? (
                  <div className="text-sm text-muted-foreground rounded-xl border border-border px-4 py-3">
                    Belum ada fitur premium yang dibuka. Silakan lakukan upgrade.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {grantedFeatures.map((f) => (
                      <div
                        key={f.key}
                        className="flex items-center gap-2 rounded-xl border border-border bg-card/40 px-3 py-2 text-sm"
                      >
                        <Check className="h-4 w-4 text-primary" />
                        <span className="flex-1 truncate">{f.label}</span>
                        <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                          {f.group}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="neumorph p-5">
            <div className="font-display text-lg text-foreground">Ganti Password</div>
            <p className="text-xs text-muted-foreground mt-1">
              Minimal 6 karakter. Anda akan tetap login setelah mengubah password.
            </p>
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Password Baru">
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-xl border border-border bg-card/50 px-3 py-2 text-sm outline-none focus:border-primary/60"
                  placeholder="••••••••"
                />
              </Field>
              <Field label="Konfirmasi Password">
                <input
                  type="password"
                  value={password2}
                  onChange={(e) => setPassword2(e.target.value)}
                  className="w-full rounded-xl border border-border bg-card/50 px-3 py-2 text-sm outline-none focus:border-primary/60"
                  placeholder="••••••••"
                />
              </Field>
            </div>
            <div className="mt-4 flex justify-end">
              <button
                onClick={handleChangePassword}
                disabled={savingPassword}
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card/50 px-5 py-2 text-sm hover:bg-sidebar-accent/60 disabled:opacity-60"
              >
                {savingPassword && <Loader2 className="h-4 w-4 animate-spin" />}
                Ubah Password
              </button>
            </div>
          </div>
        </div>
      </div>
    </DashboardShell>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-1">
        {label}
      </div>
      {children}
    </div>
  );
}
