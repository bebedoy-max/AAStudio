// Server-side proxy untuk AWS Cognito Leonardo (USER_PASSWORD_AUTH).
// Browser tidak bisa memanggil cognito-idp.us-east-1.amazonaws.com karena CORS
// dan karena flow ini harus menyembunyikan password dari network log klien.
//
// Body:  { email, password, clientId?, region?, refreshToken? }
//        - Jika `refreshToken` diberikan → REFRESH_TOKEN_AUTH (ambil ID token baru).
//        - Selain itu → USER_PASSWORD_AUTH.
// Return: { ok, idToken?, accessToken?, refreshToken?, expiresIn?, error?, code? }
//
// PENTING: Leonardo tidak mempublikasikan Cognito ClientId resmi untuk pihak
// ketiga. Default `LEONARDO_COGNITO_CLIENT_ID` di bawah adalah nilai yang
// beredar di komunitas reverse-engineer; jika berubah / salah, Cognito akan
// membalas `ResourceNotFoundException` dan user diminta memasukkan ClientId
// sendiri lewat field Advanced di UI.

import { createFileRoute } from "@tanstack/react-router";

const DEFAULT_CLIENT_ID = "1ni7hsqe1kt40q19cepqhs1jrn";
const DEFAULT_REGION = "us-east-1";

function cors(res: Response): Response {
  res.headers.set("Access-Control-Allow-Origin", "*");
  res.headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.headers.set("Access-Control-Allow-Headers", "Content-Type");
  return res;
}
function json(data: unknown, status = 200): Response {
  return cors(
    new Response(JSON.stringify(data), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

type Body = {
  email?: string;
  password?: string;
  clientId?: string;
  region?: string;
  refreshToken?: string;
};

export const Route = createFileRoute("/api/public/leonardo-cognito")({
  server: {
    handlers: {
      OPTIONS: async () => cors(new Response(null, { status: 204 })),
      POST: async ({ request }) => {
        const body = (await request.json().catch(() => null)) as Body | null;
        if (!body) return json({ ok: false, error: "invalid body" }, 200);

        const clientId =
          body.clientId?.trim() ||
          process.env.LEONARDO_COGNITO_CLIENT_ID ||
          DEFAULT_CLIENT_ID;
        const region = body.region?.trim() || DEFAULT_REGION;
        const endpoint = `https://cognito-idp.${region}.amazonaws.com/`;

        let payload: Record<string, unknown>;
        if (body.refreshToken) {
          payload = {
            AuthFlow: "REFRESH_TOKEN_AUTH",
            ClientId: clientId,
            AuthParameters: { REFRESH_TOKEN: body.refreshToken },
          };
        } else {
          if (!body.email || !body.password) {
            return json({ ok: false, error: "email dan password wajib" }, 200);
          }
          payload = {
            AuthFlow: "USER_PASSWORD_AUTH",
            ClientId: clientId,
            AuthParameters: {
              USERNAME: body.email.trim(),
              PASSWORD: body.password,
            },
          };
        }

        let upstream: Response;
        try {
          upstream = await fetch(endpoint, {
            method: "POST",
            headers: {
              "Content-Type": "application/x-amz-json-1.1",
              "X-Amz-Target":
                "AWSCognitoIdentityProviderService.InitiateAuth",
              "X-Amz-User-Agent": "aws-amplify/5.0.4 js",
              "User-Agent":
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/150.0.0.0",
            },
            body: JSON.stringify(payload),
          });
        } catch (e) {
          return json(
            { ok: false, error: `network: ${(e as Error).message}` },
            200,
          );
        }

        const text = await upstream.text();
        let parsed: {
          AuthenticationResult?: {
            IdToken?: string;
            AccessToken?: string;
            RefreshToken?: string;
            ExpiresIn?: number;
          };
          ChallengeName?: string;
          Session?: string;
          __type?: string;
          message?: string;
          Message?: string;
        } = {};
        try {
          parsed = JSON.parse(text);
        } catch {
          return json(
            {
              ok: false,
              error: `Cognito response bukan JSON (HTTP ${upstream.status})`,
              raw: text.slice(0, 300),
            },
            200,
          );
        }

        if (!upstream.ok) {
          const code = parsed.__type?.split("#").pop() || `HTTP_${upstream.status}`;
          const msg = parsed.message || parsed.Message || text.slice(0, 200);
          let hint = msg;
          if (code === "ResourceNotFoundException") {
            hint =
              "Cognito ClientId tidak dikenal. Leonardo mungkin sudah mengubahnya — isi ClientId manual di form Advanced (ambil dari DevTools app.leonardo.ai → Network → cari request ke cognito-idp).";
          } else if (code === "NotAuthorizedException") {
            hint = "Email atau password salah, atau akun butuh verifikasi.";
          } else if (code === "UserNotFoundException") {
            hint = "Akun dengan email ini tidak ditemukan di Leonardo.";
          } else if (code === "UserNotConfirmedException") {
            hint = "Akun belum diverifikasi. Selesaikan verifikasi email di app.leonardo.ai lebih dulu.";
          } else if (code === "PasswordResetRequiredException") {
            hint = "Leonardo meminta reset password. Reset lewat app.leonardo.ai lalu coba lagi.";
          } else if (code === "InvalidParameterException" && /USER_PASSWORD_AUTH/i.test(msg)) {
            hint =
              "USER_PASSWORD_AUTH tidak diizinkan oleh Leonardo untuk client ini. Login web pakai flow yang berbeda (SRP). Gunakan opsi paste JWT dari Token Manager.";
          }
          return json({ ok: false, code, error: hint, providerMessage: msg }, 200);
        }

        if (parsed.ChallengeName) {
          // MFA / password reset / new password required
          return json(
            {
              ok: false,
              code: parsed.ChallengeName,
              error: `Cognito minta challenge tambahan: ${parsed.ChallengeName}. Selesaikan lewat app.leonardo.ai lalu coba lagi.`,
            },
            200,
          );
        }

        const r = parsed.AuthenticationResult;
        if (!r?.IdToken) {
          return json(
            { ok: false, error: "Cognito tidak mengembalikan IdToken", raw: text.slice(0, 200) },
            200,
          );
        }

        return json({
          ok: true,
          idToken: r.IdToken,
          accessToken: r.AccessToken,
          refreshToken: r.RefreshToken,
          expiresIn: r.ExpiresIn,
        });
      },
    },
  },
});
