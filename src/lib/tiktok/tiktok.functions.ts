import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const TIKTOK_AUTHORIZE_URL = "https://www.tiktok.com/v2/auth/authorize/";
const DEFAULT_SCOPES = "user.info.basic,video.list,video.upload,video.publish";

function getOrigin(): string {
  const explicit = process.env.APP_URL || process.env.PUBLIC_APP_URL;
  if (explicit) return explicit.replace(/\/$/, "");
  const vercel = process.env.VERCEL_URL;
  if (vercel) return `https://${vercel}`;
  return "http://localhost:8080";
}

function randomState(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export const startTikTokConnect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const clientKey = process.env.TIKTOK_CLIENT_KEY;
    if (!clientKey) throw new Error("TIKTOK_CLIENT_KEY belum di-set di server secrets.");

    const state = randomState();
    const redirectUri = `${getOrigin()}/api/public/tiktok/callback`;

    const { error } = await (context.supabase as any)
      .from("tiktok_oauth_state")
      .insert({ state, user_id: context.userId });
    if (error) throw new Error(`Gagal simpan state: ${error.message}`);

    const url = new URL(TIKTOK_AUTHORIZE_URL);
    url.searchParams.set("client_key", clientKey);
    url.searchParams.set("scope", DEFAULT_SCOPES);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("state", state);

    return { authorizeUrl: url.toString(), redirectUri };
  });

export const listTikTokAccounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await (context.supabase as any)
      .from("tiktok_accounts")
      .select("id, open_id, union_id, display_name, avatar_url, scope, access_expires_at, created_at, updated_at")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const disconnectTikTokAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string }) => {
    if (!data?.id || typeof data.id !== "string") throw new Error("id required");
    return data;
  })
  .handler(async ({ data, context }) => {
    const { error } = await (context.supabase as any)
      .from("tiktok_accounts")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
