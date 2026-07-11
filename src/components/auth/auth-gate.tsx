import type { ReactNode } from "react";
import { useRouterState } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth-context";
import { LoginCard } from "@/components/auth/login-card";
import { Loader2 } from "lucide-react";

export function AuthGate({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  // Jangan tampilkan overlay login di route callback OAuth — biarkan
  // callback menyelesaikan exchange lalu redirect sendiri.
  if (pathname.startsWith("/auth/")) return <>{children}</>;


  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (session) return <>{children}</>;

  return (
    <div className="relative min-h-screen">
      {/* Dashboard tampak samar di belakang */}
      <div
        aria-hidden
        className="pointer-events-none select-none opacity-40"
        style={{ filter: "blur(10px) saturate(1.1)" }}
      >
        {children}
      </div>

      {/* Overlay login */}
      <div className="fixed inset-0 z-50 grid place-items-center px-4 py-8 bg-background/40 backdrop-blur-sm overflow-y-auto">
        <LoginCard />
      </div>
    </div>
  );
}
