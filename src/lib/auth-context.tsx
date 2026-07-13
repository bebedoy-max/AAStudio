import { createContext, useContext, useEffect, useCallback, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { AuthChangeEvent, Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

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
  }, []);

  useEffect(() => {
    let mounted = true;
    let loadId = 0;

    async function readSessionFromUrlOrStorage() {
      if (typeof window === "undefined") {
        const { data } = await supabase.auth.getSession();
        return data.session;
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

        if (data.session) return data.session;
      }

      const { data } = await supabase.auth.getSession();
      return data.session;
    }

    async function applySession(nextSession: Session | null, source: string, event?: AuthChangeEvent) {
      const currentLoadId = ++loadId;
      logAuth(source, {
        event,
        hasSession: Boolean(nextSession),
        userId: nextSession?.user.id ?? null,
        email: nextSession?.user.email ?? null,
      });

      if (!mounted || currentLoadId !== loadId) return;

      setSession(nextSession);

      if (!nextSession?.user) {
        clearUserData();
        return;
      }

      await loadUserData(nextSession.user.id);
    }

    async function initializeAuth() {
      setLoading(true);
      try {
        const initialSession = await readSessionFromUrlOrStorage();
        await applySession(initialSession, "Session Loaded");
      } catch (error) {
        console.warn("[auth] initial session load failed", error);
        if (mounted) {
          setSession(null);
          clearUserData();
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

      setSession(s);
      if (event === "SIGNED_OUT") {
        clearUserData();
        setLoading(false);
        return;
      }

      if (s?.user) {
        setTimeout(() => {
          void loadUserData(s.user.id);
        }, 0);
      } else {
        clearUserData();
      }
      setLoading(false);
    });

    void initializeAuth();

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [clearUserData, loadUserData]);

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
      const { error } = await supabase.auth.signOut();
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

