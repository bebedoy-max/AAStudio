// Shared helper: when the user's Routing Provider selection points at
// "framia" for a given capability, redirect the current generate page to
// the Framia workspace (/generate/framia). Framia jobs run through the
// canvas workflow API — they cannot be executed inline from the legacy
// per-provider forms — so following the routing selection means opening
// the Framia page.

import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";

const LS_ROUTING = "aatools.routing.v2";
export type FramiaCap = "image" | "video" | "motion";

export function readRoutedProvider(cap: FramiaCap): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(LS_ROUTING);
    if (!raw) return null;
    const obj = JSON.parse(raw) as Record<string, string | undefined>;
    return obj?.[cap] ?? null;
  } catch {
    return null;
  }
}

/**
 * Hook: watch the routing selection for `cap`. If it is "framia", navigate
 * to /generate/framia (once per activation) with an explanatory toast.
 */
export function useFramiaRoutingRedirect(cap: FramiaCap) {
  const navigate = useNavigate();
  useEffect(() => {
    let notified = false;
    const check = () => {
      if (readRoutedProvider(cap) !== "framia") {
        notified = false;
        return;
      }
      if (notified) return;
      notified = true;
      toast.info("Provider aktif: Framia", {
        description: `Routing ${cap} kamu diset ke Framia. Buka workspace Framia untuk menjalankan node ini.`,
      });
      navigate({ to: "/generate/framia" }).catch(() => {});
    };
    check();
    const onStorage = (e: StorageEvent) => {
      if (e.key === LS_ROUTING || e.key === null) check();
    };
    const onFocus = () => check();
    window.addEventListener("storage", onStorage);
    window.addEventListener("focus", onFocus);
    window.addEventListener("aatools:routing-changed", check as EventListener);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("aatools:routing-changed", check as EventListener);
    };
  }, [cap, navigate]);
}
