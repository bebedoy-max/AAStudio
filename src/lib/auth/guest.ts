// Client helper: pastikan ada sesi Supabase, bikin akun tamu bila perlu.
// Kredensial tamu disimpan di localStorage + cookie ringan supaya identitas
// (dan token yang dibeli) tetap melekat di browser yang sama.
import { supabase } from "@/integrations/supabase/client";
import { createGuestAccount } from "./anon.functions";

const LS_KEY = "aatools.guest.cred";
const COOKIE_KEY = "aatools_guest";

export type GuestCred = { handle: string; email: string; password: string };

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return m ? decodeURIComponent(m[1]) : null;
}

function writeCookie(name: string, value: string) {
  if (typeof document === "undefined") return;
  const oneYear = 60 * 60 * 24 * 365;
  const secure = typeof location !== "undefined" && location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${oneYear}; SameSite=Lax${secure}`;
}

export function readGuestCred(): GuestCred | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(LS_KEY) ?? readCookie(COOKIE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as GuestCred;
    if (parsed?.email && parsed?.password) return parsed;
  } catch {
    /* ignore */
  }
  return null;
}

function saveGuestCred(cred: GuestCred) {
  const raw = JSON.stringify(cred);
  try {
    localStorage.setItem(LS_KEY, raw);
  } catch {
    /* ignore */
  }
  writeCookie(COOKIE_KEY, raw);
}

export function isGuestEmail(email: string | null | undefined): boolean {
  return !!email && /^aanon_[a-z0-9]+@aatools\.app$/i.test(email);
}

/**
 * Mengembalikan user id aktif. Kalau belum login, otomatis memakai/membuat
 * akun tamu `aanon_xxxxxxxx` sehingga pembelian token tetap bisa jalan dan
 * masuk ke Token Manager browser tersebut.
 */
export async function ensureGuestSession(): Promise<{ userId: string; handle: string | null }> {
  const { data: current } = await supabase.auth.getSession();
  if (current.session?.user) {
    const email = current.session.user.email ?? null;
    return {
      userId: current.session.user.id,
      handle: isGuestEmail(email) ? (email as string).split("@")[0] : null,
    };
  }

  const existing = readGuestCred();
  if (existing) {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: existing.email,
      password: existing.password,
    });
    if (!error && data.user) return { userId: data.user.id, handle: existing.handle };
  }

  // Jalur utama: akun tamu dibuat di server (service role, email langsung
  // terkonfirmasi) supaya tidak ada email verifikasi / rate limit.
  try {
    const created = await createGuestAccount();
    saveGuestCred({ handle: created.handle, email: created.email, password: created.password });
    const { data, error } = await supabase.auth.signInWithPassword({
      email: created.email,
      password: created.password,
    });
    if (!error && data.user) return { userId: data.user.id, handle: created.handle };
    throw new Error(error?.message ?? "Sesi akun tamu tidak dapat diaktifkan");
  } catch (error) {
    throw new Error(
      error instanceof Error
        ? `Tidak dapat menyiapkan akun tamu: ${error.message}`
        : "Tidak dapat menyiapkan akun tamu",
    );
  }
}

