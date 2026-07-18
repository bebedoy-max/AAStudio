import { createContext, useContext, useEffect, useCallback, useRef, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { AuthChangeEvent, Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { syncTokensForUser, resetTokenSync, clearLocalTokenCache } from "@/lib/tokens/sync";
import {
  claimExclusiveSession,
  clearLocalExclusiveSession,
  endExclusiveSession,
  INACTIVITY_TIMEOUT_MS,
  verifyExclusiveSession,
} from "@/lib/auth/single-session";
import { hasRunningTasks } from "@/lib/stores/notifications";
import { logActivity } from "@/lib/activity/log";

type Role = "admin" | "editor" | "user";

export type FeatureAccessMode = "public" | "subscription" | "trial";
export type FeatureAccessEntry = { mode: FeatureAccessMode; trialUntil: string | null };

type Profile = {
  id: string;
  email: string | null;
  display_name: string | null;
  avatar_url: string | null;
  is_active: boolean;
};

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  roles: Role[];
  routePermissions: string[];
  featureAccess: Record<string, FeatureAccessEntry>;
  loading: boolean;
  isAdmin: boolean;
  hasRoutePermission: (key: string) => boolean;
  isFeatureEnabled: (key: string) => boolean;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function logAuth(message: string, payload?: Record<string, unknown>) {
  console.info(`[auth] ${message}`, payload ?? {});
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [roles, setRoles] = useState<Role[]>([]);
  const [routePermissions, setRoutePermissions] = useState<string[]>([]);
  const [featureAccess, setFeatureAccess] = useState<Record<string, FeatureAccessEntry>>({});
  const [loading, setLoading] = useState(true);

  // Global per-feature access settings (public / subscription / trial), managed by admin.
  useEffect(() => {
    let active = true;
    (async () => {
      const { data, error } = await supabase
        .from("feature_access" as never)
        .select("route_key, access_mode, trial_until");
      if (!active || error || !data) return;
      const map: Record<string, FeatureAccessEntry> = {};
      (data as { route_key: string; access_mode: FeatureAccessMode; trial_until: string | null }[]).forEach(
        (r) => {
          map[r.route_key] = { mode: r.access_mode, trialUntil: r.trial_until };
        },
      );
      setFeatureAccess(map);
    })();
    return () => {
      active = false;
    };
  }, []);

  const clearUserData = useCallback(() => {
    setProfile(null);
    setRoles([]);
    setRoutePermissions([]);
  }, []);

  const forceLocalSignOut = useCallback(
    async (uid?: string) => {
      await queryClient.cancelQueries();
      queryClient.clear();
      clearLocalTokenCache();
      resetTokenSync();
      clearLocalExclusiveSession(uid);
      setSession(null);
      clearUserData();
      const { error } = await supabase.auth.signOut({ scope: "local" });
      if (error) console.warn("[auth] local sign-out failed", error.message);
    },
    [clearUserData, queryClient],
  );

  const loadUserData = useCallback(async (uid: string) => {
    const nowIso = new Date().toISOString();
    const [{ data: p, error: profileError }, { data: r, error: rolesError }, { data: rp, error: permissionsError }] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", uid).maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", uid),
      supabase
        .from("route_permissions")
        .select("route_key, expires_at")
        .eq("user_id", uid)
        .or(`expires_at.is.null,expires_at.gt.${nowIso}`),
    ]);

    if (profileError) console.warn("[auth] profile load failed", profileError.message);
    if (rolesError) console.warn("[auth] roles load failed", rolesError.message);
    if (permissionsError) console.warn("[auth] route permissions load failed", permissionsError.message);

    setProfile((p as Profile) ?? null);
    setRoles(((r ?? []) as { role: Role }[]).map((x) => x.role));
    setRoutePermissions(((rp ?? []) as { route_key: string }[]).map((x) => x.route_key));

    // Pull encrypted per-user tokens (API keys) from Supabase into localStorage
    // so users don't need to re-enter them on new devices.
    void syncTokensForUser(uid, { force: true });
  }, []);

  useEffect(() => {
    let mounted = true;
    let loadId = 0;

    async function readSessionFromUrlOrStorage(): Promise<{ session: Session | null; shouldClaim: boolean }> {
      if (typeof window === "undefined") {
        const { data } = await supabase.auth.getSession();
        return { session: data.session, shouldClaim: false };
      }

      const url = new URL(window.location.href);
      const code = url.searchParams.get("code");
      const authError = url.searchParams.get("error_description") ?? url.searchParams.get("error");

      if (authError) {
        console.warn("[auth] OAuth returned error", authError);
      }

      if (code) {
        logAuth("OAuth code detected, exchanging for session", {
          path: window.location.pathname,
        });

        const { data, error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) {
          console.warn("[auth] OAuth code exchange failed, falling back to stored session", error.message);
        }

        url.searchParams.delete("code");
        url.searchParams.delete("error");
        url.searchParams.delete("error_code");
        url.searchParams.delete("error_description");
        const cleanSearch = url.searchParams.toString();
        window.history.replaceState(
          {},
          document.title,
          `${url.pathname}${cleanSearch ? `?${cleanSearch}` : ""}${url.hash}`,
        );

        if (data.session) return { session: data.session, shouldClaim: true };
      }

      const { data } = await supabase.auth.getSession();
      return { session: data.session, shouldClaim: false };
    }

    async function applySession(nextSession: Session | null, source: string, event?: AuthChangeEvent, shouldClaim = false) {
      const currentLoadId = ++loadId;
      logAuth(source, {
        event,
        hasSession: Boolean(nextSession),
        userId: nextSession?.user.id ?? null,
        email: nextSession?.user.email ?? null,
      });

      if (!mounted || currentLoadId !== loadId) return;

      if (!nextSession?.user) {
        setSession(null);
        clearUserData();
        clearLocalTokenCache();
        resetTokenSync();
        clearLocalExclusiveSession();
        return;
      }

      if (shouldClaim) {
        const claim = await claimExclusiveSession(nextSession.user.id);
        if (!mounted || currentLoadId !== loadId) return;
        if (claim === "blocked") {
          toast.error(
            "Akun ini sedang aktif di perangkat lain. Jika Anda pemilik akun, tunggu hingga sesi tersebut idle 30 menit lalu coba lagi.",
            { duration: 8000 },
          );
          await forceLocalSignOut(nextSession.user.id);
          return;
        }
        if (claim === "error") {
          toast.error("Tidak bisa memvalidasi sesi. Coba lagi.");
          await forceLocalSignOut(nextSession.user.id);
          return;
        }
      } else {
        const ok = await verifyExclusiveSession(nextSession.user.id);
        if (!mounted || currentLoadId !== loadId) return;
        if (!ok) {
          await forceLocalSignOut(nextSession.user.id);
          return;
        }
      }

      setSession(nextSession);

      await loadUserData(nextSession.user.id);
    }

    async function initializeAuth() {
      setLoading(true);
      try {
        const initial = await readSessionFromUrlOrStorage();
        await applySession(initial.session, "Session Loaded", undefined, initial.shouldClaim);
      } catch (error) {
        console.warn("[auth] initial session load failed", error);
        if (mounted) {
          setSession(null);
          clearUserData();
          clearLocalTokenCache();
          resetTokenSync();
          clearLocalExclusiveSession();
        }
      } finally {
        if (mounted) setLoading(false);
      }
    }

    const { data: sub } = supabase.auth.onAuthStateChange((event: AuthChangeEvent, s: Session | null) => {
      if (
        event !== "INITIAL_SESSION" &&
        event !== "SIGNED_IN" &&
        event !== "SIGNED_OUT" &&
        event !== "TOKEN_REFRESHED" &&
        event !== "USER_UPDATED"
      ) {
        return;
      }

      logAuth("Auth State Changed", {
        event,
        hasSession: Boolean(s),
        userId: s?.user.id ?? null,
        email: s?.user.email ?? null,
      });

      if (event === "SIGNED_OUT") {
        const uid = session?.user.id;
        if (uid) void logActivity({ category: "auth", action: "logout", userId: uid });
        try {
          if (typeof sessionStorage !== "undefined") {
            for (let i = sessionStorage.length - 1; i >= 0; i--) {
              const k = sessionStorage.key(i);
              if (k?.startsWith("aatools.auth.loginLogged.")) sessionStorage.removeItem(k);
            }
          }
        } catch {
          // ignore
        }
        setSession(null);
        clearUserData();
        clearLocalTokenCache();
        resetTokenSync();
        clearLocalExclusiveSession();
        setLoading(false);
        return;
      }

      if (s?.user) {
        if (event === "SIGNED_IN") {
          // Supabase memicu SIGNED_IN pada setiap tab reload / restore sesi.
          // Log "login" hanya sekali per browser session per user supaya
          // tidak menumpuk puluhan entri palsu.
          try {
            const key = `aatools.auth.loginLogged.${s.user.id}`;
            if (typeof sessionStorage !== "undefined" && !sessionStorage.getItem(key)) {
              sessionStorage.setItem(key, "1");
              void logActivity({ category: "auth", action: "login", userId: s.user.id });
            }
          } catch {
            // sessionStorage tidak tersedia — abaikan, jangan log agar tidak spam.
          }
        }
        setTimeout(() => {
          void applySession(s, "Auth State Applied", event, event === "SIGNED_IN");
        }, 0);
      } else {
        clearUserData();
        clearLocalTokenCache();
        resetTokenSync();
        clearLocalExclusiveSession();
      }
      setLoading(false);
    });

    void initializeAuth();

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [clearUserData, forceLocalSignOut, loadUserData]);

  const lastActivityRef = useRef<number>(Date.now());

  useEffect(() => {
    if (!session?.user) return;
    let cancelled = false;
    const uid = session.user.id;
    lastActivityRef.current = Date.now();

    const idleLogout = async () => {
      toast.info("Anda otomatis keluar setelah 30 menit tidak aktif.", { duration: 6000 });
      await forceLocalSignOut(uid);
    };

    // Idle-check HANYA dijalankan saat tab visible. Kalau tab di-hide,
    // kita anggap user sedang menunggu proses (mis. generate) atau memang
    // sedang buka tab lain — jangan langsung logout. Timer idle di-reset
    // setiap kali tab kembali visible sehingga user selalu punya waktu
    // penuh setelah balik ke aplikasi.
    const runIdleAndVerify = async () => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") {
        return;
      }
      // Selama ada proses generate/render yang berjalan, anggap itu sebagai
      // aktivitas — reset timer idle. User tidak akan pernah ke-logout saat
      // job masih berjalan (mis. motion, storyboard, naratif, dubbing).
      if (hasRunningTasks()) {
        lastActivityRef.current = Date.now();
      }
      if (Date.now() - lastActivityRef.current >= INACTIVITY_TIMEOUT_MS) {
        if (!cancelled) await idleLogout();
        return;
      }
      const ok = await verifyExclusiveSession(uid);
      if (!cancelled && !ok) await forceLocalSignOut(uid);
    };

    // Heartbeat ringan tetap jalan meski tab hidden supaya slot sesi
    // tidak dianggap idle oleh perangkat lain, TAPI tanpa idle-logout.
    const backgroundHeartbeat = async () => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") return;
      await verifyExclusiveSession(uid).catch(() => false);
    };

    const markActive = () => {
      lastActivityRef.current = Date.now();
    };
    const onFocus = () => {
      markActive();
      void syncTokensForUser(uid, { force: true });
      void runIdleAndVerify();
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        // User baru balik — reset timer idle supaya tidak langsung ke-logout.
        markActive();
        void syncTokensForUser(uid, { force: true });
        void runIdleAndVerify();
      }
    };

    const activityEvents: (keyof WindowEventMap)[] = ["mousemove", "keydown", "click", "scroll", "touchstart"];
    activityEvents.forEach((ev) => window.addEventListener(ev, markActive, { passive: true }));

    const idleInterval = window.setInterval(runIdleAndVerify, 15_000);
    const hbInterval = window.setInterval(backgroundHeartbeat, 60_000);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      window.clearInterval(idleInterval);
      window.clearInterval(hbInterval);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
      activityEvents.forEach((ev) => window.removeEventListener(ev, markActive));
    };
  }, [forceLocalSignOut, session?.user?.id]);


  const value: AuthContextValue = {
    session,
    user: session?.user ?? null,
    profile,
    roles,
    routePermissions,
    featureAccess,
    loading,
    isAdmin: roles.includes("admin"),
    hasRoutePermission: (key) => roles.includes("admin") || routePermissions.includes(key),
    isFeatureEnabled: (key) => {
      if (roles.includes("admin")) return true;
      const entry = featureAccess[key];
      if (entry) {
        if (entry.mode === "public") return true;
        if (entry.mode === "trial") {
          if (!entry.trialUntil) return true;
          if (new Date(entry.trialUntil).getTime() > Date.now()) return true;
        }
      }
      return routePermissions.includes(key);
    },
    refresh: async () => {
      if (session?.user) await loadUserData(session.user.id);
    },
    signOut: async () => {
      logAuth("Signing out");
      await queryClient.cancelQueries();
      queryClient.clear();
      if (session?.user) await endExclusiveSession(session.user.id);
      clearLocalTokenCache();
      resetTokenSync();
      const { error } = await supabase.auth.signOut({ scope: "local" });
      if (error) throw error;
      setSession(null);
      clearUserData();
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

// Hanya fitur premium yang bisa dikunci per user. Route lain (Manage / System)
// selalu terbuka karena diperlukan untuk mengatur token, routing, dsb.
export const ALL_ROUTE_KEYS: { key: string; label: string; group: string }[] = [
  { key: "generate.motion", label: "Motion Control", group: "Generate" },
  { key: "generate.storyboard", label: "Produk Storyboard", group: "Generate" },
  { key: "generate.bulk-fashion", label: "Bulk Fashion Generator", group: "Generate" },
  { key: "generate.image-to-video", label: "Image To Video", group: "Generate" },
  { key: "generate.naratif", label: "Naratif Video Maker", group: "Generate" },
  { key: "ai-influencer.studio", label: "AI Influencer Studio", group: "AI Influencer" },
  { key: "mixing.clipper", label: "AI Clipper", group: "Mixing" },
  { key: "mixing.dubbing", label: "AI Dubbing", group: "Mixing" },
];

