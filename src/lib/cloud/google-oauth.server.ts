// Server-only: OAuth Google Drive milik aplikasi sendiri (tanpa gateway),
// supaya jalan di hosting mana pun (Vercel, dsb).
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { decryptConnectionKey } from "./connection-crypto.server";

export const GOOGLE_DRIVE_SCOPES = [
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/drive.file",
];

export const OAUTH_CALLBACK_PATH = "/api/public/google-drive/callback";

export type GoogleOAuthClient = { clientId: string; clientSecret: string };

export async function getOAuthClient(): Promise<GoogleOAuthClient | null> {
  const { getGlobalCloudRow } = await import("./global-cloud.server");
  const row = await getGlobalCloudRow();
  if (row?.client_id && row.client_secret_cipher) {
    try {
      return {
        clientId: row.client_id,
        clientSecret: decryptConnectionKey(row.client_secret_cipher),
      };
    } catch (e) {
      console.error("[cloud] failed to decrypt oauth client secret", e);
    }
  }
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  if (clientId && clientSecret) return { clientId, clientSecret };
  return null;
}

function stateSecret(): Buffer {
  const raw =
    process.env.APP_USER_CONNECTION_KEY_SECRET ||
    process.env.SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    "";
  if (!raw) throw new Error("Secret server belum diset (SERVICE_ROLE_KEY).");
  return createHash("sha256").update(raw).digest();
}

export type OAuthState = { userId: string; target: "global" | "personal"; ts: number };

export function signState(state: OAuthState): string {
  const payload = Buffer.from(JSON.stringify(state)).toString("base64url");
  const sig = createHmac("sha256", stateSecret()).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

export function verifyState(raw: string): OAuthState | null {
  const [payload, sig] = String(raw || "").split(".");
  if (!payload || !sig) return null;
  const expected = createHmac("sha256", stateSecret()).update(payload).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as OAuthState;
    if (!parsed?.userId || Date.now() - parsed.ts > 15 * 60 * 1000) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function callbackUrl(requestUrl: string): string {
  return new URL(OAUTH_CALLBACK_PATH, requestUrl).toString();
}

export function buildAuthUrl(params: {
  client: GoogleOAuthClient;
  redirectUri: string;
  state: string;
  loginHint?: string | null;
}): string {
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", params.client.clientId);
  url.searchParams.set("redirect_uri", params.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", GOOGLE_DRIVE_SCOPES.join(" "));
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("include_granted_scopes", "true");
  url.searchParams.set("state", params.state);
  if (params.loginHint) url.searchParams.set("login_hint", params.loginHint);
  return url.toString();
}

export async function exchangeCodeForRefreshToken(params: {
  client: GoogleOAuthClient;
  code: string;
  redirectUri: string;
}): Promise<{ refreshToken: string; accessToken: string }> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code: params.code,
      client_id: params.client.clientId,
      client_secret: params.client.clientSecret,
      redirect_uri: params.redirectUri,
      grant_type: "authorization_code",
    }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Tukar kode OAuth gagal [${res.status}]: ${text.slice(0, 300)}`);
  const json = JSON.parse(text) as { refresh_token?: string; access_token?: string };
  if (!json.refresh_token) {
    throw new Error(
      "Google tidak mengirim refresh token. Cabut akses aplikasi di akun Google lalu coba lagi.",
    );
  }
  return { refreshToken: json.refresh_token, accessToken: json.access_token ?? "" };
}

const tokenCache = new Map<string, { token: string; exp: number }>();

export async function accessTokenFromRefresh(refreshToken: string): Promise<string> {
  const cacheKey = createHash("sha256").update(refreshToken).digest("hex");
  const hit = tokenCache.get(cacheKey);
  if (hit && hit.exp > Date.now() + 30_000) return hit.token;

  const client = await getOAuthClient();
  if (!client) throw new Error("Google OAuth client belum dikonfigurasi admin.");
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: client.clientId,
      client_secret: client.clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  const text = await res.text();
  if (!res.ok)
    throw new Error(`Refresh token Google ditolak [${res.status}]: ${text.slice(0, 300)}`);
  const json = JSON.parse(text) as { access_token?: string; expires_in?: number };
  if (!json.access_token) throw new Error("Google tidak mengirim access token.");
  tokenCache.set(cacheKey, {
    token: json.access_token,
    exp: Date.now() + (json.expires_in ?? 3600) * 1000,
  });
  return json.access_token;
}

export async function googleAccountEmail(accessToken: string): Promise<string | null> {
  try {
    const res = await fetch("https://www.googleapis.com/drive/v3/about?fields=user(emailAddress)", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { user?: { emailAddress?: string } };
    return data.user?.emailAddress ?? null;
  } catch {
    return null;
  }
}
