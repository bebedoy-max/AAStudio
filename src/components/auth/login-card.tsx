import { useState, type FormEvent } from "react";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

import { toast } from "sonner";
import { Loader2, Mail, Lock, User as UserIcon } from "lucide-react";

export function LoginCard() {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("Berhasil masuk");
        navigate({ to: "/" });
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: window.location.origin,
            data: { display_name: displayName || email.split("@")[0] },
          },
        });
        if (error) throw error;
        toast.success("Akun dibuat. Selamat datang!");
        navigate({ to: "/" });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Terjadi kesalahan");
    } finally {
      setLoading(false);
    }
  }

  async function onGoogle() {
    setLoading(true);
    try {
      console.info("[auth] Redirecting to Google OAuth", {
        redirectTo: window.location.origin,
      });
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: window.location.origin },
      });
      if (error) throw error;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Google sign-in gagal");
      setLoading(false);
    }
  }

  return (
    <div className="w-full max-w-md neumorph neon-border p-8 relative overflow-hidden">
      <div
        className="absolute -top-16 -right-16 h-40 w-40 rounded-full opacity-40 blur-3xl"
        style={{ background: "var(--gradient-neon)" }}
      />
      <div className="relative">
        <div className="text-[11px] font-mono uppercase tracking-[0.3em] text-muted-foreground">
          {mode === "signin" ? "Selamat datang" : "Buat akun baru"}
        </div>
        <h1 className="mt-1 font-display text-3xl font-bold">
          {mode === "signin" ? (
            <>
              Masuk ke <span className="text-gradient">AATools</span>
            </>
          ) : (
            <>
              Daftar <span className="text-gradient">AATools</span>
            </>
          )}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {mode === "signin"
            ? "Masuk untuk mengakses studio AI Anda."
            : "Buat akun untuk mulai menggunakan studio."}
        </p>

        <button
          type="button"
          onClick={onGoogle}
          disabled={loading}
          className="mt-6 w-full inline-flex items-center justify-center gap-2 rounded-full border border-border bg-card/70 px-4 py-2.5 text-sm font-medium hover:bg-card transition"
        >
          <svg width="16" height="16" viewBox="0 0 48 48">
            <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
            <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
            <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
            <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
          </svg>
          Lanjutkan dengan Google
        </button>

        <div className="my-5 flex items-center gap-3 text-[10px] font-mono uppercase tracking-[0.25em] text-muted-foreground">
          <div className="flex-1 h-px bg-border" /> atau <div className="flex-1 h-px bg-border" />
        </div>

        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          {mode === "signup" && (
            <div className="flex items-center gap-2 rounded-2xl border border-border bg-card/50 px-3 py-2.5">
              <UserIcon className="h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Nama tampilan"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
            </div>
          )}
          <div className="flex items-center gap-2 rounded-2xl border border-border bg-card/50 px-3 py-2.5">
            <Mail className="h-4 w-4 text-muted-foreground" />
            <input
              type="email"
              required
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>
          <div className="flex items-center gap-2 rounded-2xl border border-border bg-card/50 px-3 py-2.5">
            <Lock className="h-4 w-4 text-muted-foreground" />
            <input
              type="password"
              required
              minLength={6}
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="mt-2 inline-flex items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
            style={{ background: "var(--gradient-neon)" }}
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            {mode === "signin" ? "Masuk" : "Daftar"}
          </button>
        </form>

        <div className="mt-4 text-center text-xs text-muted-foreground">
          {mode === "signin" ? "Belum punya akun? " : "Sudah punya akun? "}
          <button
            type="button"
            onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
            className="text-foreground font-medium hover:text-gradient"
          >
            {mode === "signin" ? "Daftar di sini" : "Masuk"}
          </button>
        </div>
      </div>
    </div>
  );
}
