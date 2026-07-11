import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/auth/callback")({
  component: AuthCallback,
});

function AuthCallback() {
  useEffect(() => {
    let cancelled = false;

    async function waitForPersistedSession() {
      for (let attempt = 0; attempt < 10; attempt += 1) {
        const { data } = await supabase.auth.getSession();
        if (data.session) return data.session;
        await new Promise((resolve) => setTimeout(resolve, 150));
      }
      return null;
    }

    async function finish() {
      try {
        const url = new URL(window.location.href);
        const code = url.searchParams.get("code");
        const authError = url.searchParams.get("error_description") ?? url.searchParams.get("error");

        if (authError) throw new Error(authError);

        if (code) {
          console.info("[auth/callback] OAuth code detected, exchanging for session");
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
          await waitForPersistedSession();
        } else if (window.location.hash.includes("access_token")) {
          // Implicit flow — SDK dgn detectSessionInUrl akan parse hash otomatis.
          await waitForPersistedSession();
        } else {
          await waitForPersistedSession();
        }
      } catch (err) {
        console.error("[auth/callback] exchange error", err);
      }

      if (cancelled) return;
      // Full reload agar AuthContext re-hydrate session dari localStorage
      // dan AuthGate melihat session yang baru.
      window.location.replace("/");
    }

    finish();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Menyelesaikan login…
      </div>
    </div>
  );
}
