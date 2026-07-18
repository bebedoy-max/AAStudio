// Client-side activity logger. Inserts a row into `user_activity_logs`.
// Fire-and-forget: never throws to the caller, never blocks the UI.
import { supabase } from "@/integrations/supabase/client";

export type ActivityCategory =
  | "auth"
  | "profile"
  | "generate"
  | "payment"
  | "admin"
  | "system";

export type ActivityInput = {
  category: ActivityCategory;
  action: string;
  details?: Record<string, unknown>;
  userId?: string;
};

export async function logActivity(input: ActivityInput): Promise<void> {
  try {
    let uid = input.userId;
    if (!uid) {
      const { data } = await supabase.auth.getUser();
      uid = data.user?.id ?? undefined;
    }
    if (!uid) return; // anonymous — nothing to log
    const ua =
      typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 512) : null;
    await supabase.from("user_activity_logs" as never).insert({
      user_id: uid,
      category: input.category,
      action: input.action,
      details: input.details ?? null,
      user_agent: ua,
    } as never);
  } catch (e) {
    // Silence — logging must never break the app.
    if (typeof console !== "undefined") {
      console.warn("[activity] log failed", e);
    }
  }
}

export function logGenerate(kind: string, details?: Record<string, unknown>): void {
  void logActivity({ category: "generate", action: `generate_${kind}`, details });
}
