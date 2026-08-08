// POST /api/public/companion/device/register
// Body: { device_id, device_name, android_version, enroll_secret }
// Response: { ok, token }
//
// enroll_secret harus sama dengan env COMPANION_ENROLL_SECRET (di-set di Vercel).
import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, preflight } from "@/lib/companion/http";

const REGISTER_DIAGNOSTIC_BUILD = "device-register-diag-2026-08-04";

function diagnosticHeaders(request: Request) {
  const headers: Record<string, string> = {};
  const safeHeaders = new Set([
    "accept",
    "content-length",
    "content-type",
    "host",
    "user-agent",
    "x-forwarded-for",
    "x-forwarded-host",
    "x-forwarded-proto",
    "x-vercel-id",
  ]);
  for (const [name, value] of request.headers.entries()) {
    const lower = name.toLowerCase();
    if (lower === "authorization" || lower === "cookie" || lower === "x-api-key") {
      headers[name] = `[REDACTED length=${value.length}]`;
    } else if (safeHeaders.has(lower)) {
      headers[name] = value;
    }
  }
  return headers;
}

function errorDetails(error: unknown) {
  if (error instanceof Error) {
    return { name: error.name, message: error.message, stack: error.stack };
  }
  return { value: String(error) };
}

export const Route = createFileRoute("/api/public/companion/device/register")({
  server: {
    handlers: {
      OPTIONS: async () => preflight(),
      POST: async ({ request }) => {
        const requestId = crypto.randomUUID();
        const startedAt = Date.now();
        const log = (stage: string, detail: Record<string, unknown> = {}) => {
          console.info("[companion/register]", {
            requestId,
            build: REGISTER_DIAGNOSTIC_BUILD,
            stage,
            elapsedMs: Date.now() - startedAt,
            ...detail,
          });
        };
        const respond = (body: Record<string, unknown>, status = 200) => {
          log("FINAL_RESPONSE", {
            status,
            ok: body.ok === true,
            error: typeof body.error === "string" ? body.error : undefined,
          });
          const response = jsonResponse(body, status);
          response.headers.set("X-Companion-Request-Id", requestId);
          response.headers.set("X-Companion-Register-Build", REGISTER_DIAGNOSTIC_BUILD);
          return response;
        };

        log("DEVICE_REGISTER_START", {
          method: request.method,
          url: request.url,
          headers: diagnosticHeaders(request),
        });

        try {
        // Brute-force guard: registrasi perangkat dibatasi per-IP.
        {
          const { rateLimit, clientIp } = await import("@/lib/security/rate-limit.server");
          const limited = rateLimit(`companion-register:${clientIp(request)}`, {
            limit: 10,
            windowMs: 10 * 60 * 1000,
          });
          if (!limited.allowed) {
            return respond({ ok: false, error: "rate limited" }, 429);
          }
        }

        // .trim(): nilai env dari dashboard sering terbawa spasi/newline saat copy-paste.
        const enrollSecret = process.env["COMPANION_ENROLL_SECRET"]?.trim();
        log("SERVER_CONFIGURATION", {
          enrollmentSecretConfigured: Boolean(enrollSecret),
        });
        if (!enrollSecret) {
          return respond({ ok: false, error: "server not configured" }, 503);
        }

        let body: {
          device_id?: string;
          device_name?: string;
          android_version?: string;
          enroll_secret?: string;
        };
        try {
          body = await request.json();
          log("BODY_PARSED", {
            body: {
              device_id: body.device_id,
              device_name: body.device_name,
              android_version: body.android_version,
              enroll_secret: "[REDACTED]",
            },
          });
        } catch (error) {
          console.error("[companion/register] invalid JSON", {
            requestId,
            ...errorDetails(error),
          });
          return respond({ ok: false, error: "invalid json" }, 400);
        }

        const { safeEqual, registerDevice } = await import("@/lib/companion/companion.server");
        const received = (body.enroll_secret ?? "").trim();
        const matches = received.length > 0 && safeEqual(received, enrollSecret);
        log("SECRET_VALIDATION", { matches });
        if (!matches) {
          // Jangan bocorkan panjang/sidik jari secret ke log maupun ke klien:
          // metadata itu mempersempit ruang brute-force. Cukup catat kegagalan.
          console.warn("[companion/register] unauthorized", { requestId });
          return respond({ ok: false, error: "unauthorized" }, 401);
        }
        const deviceId = (body.device_id ?? "").trim();
        log("DEVICE_VALIDATION", { deviceId, deviceIdLength: deviceId.length });
        if (deviceId.length < 8 || deviceId.length > 128) {
          return respond({ ok: false, error: "invalid device_id" }, 400);
        }

        try {
          log("REGISTER_DEVICE_CALLED", { deviceId });
          const { token } = await registerDevice({
            deviceId,
            deviceName: (body.device_name ?? "").slice(0, 120) || null,
            androidVersion: (body.android_version ?? "").slice(0, 40) || null,
          }, { requestId, build: REGISTER_DIAGNOSTIC_BUILD });
          log("TOKEN_READY_FOR_RESPONSE", { issued: true });
          return respond({ ok: true, token });
        } catch (error) {
          console.error("[companion/register] register failed", {
            requestId,
            build: REGISTER_DIAGNOSTIC_BUILD,
            stage: "REGISTER_DEVICE_EXCEPTION",
            elapsedMs: Date.now() - startedAt,
            ...errorDetails(error),
          });
          return respond({ ok: false, error: "register failed" }, 500);
        }
        } catch (error) {
          console.error("[companion/register] unhandled request exception", {
            requestId,
            build: REGISTER_DIAGNOSTIC_BUILD,
            stage: "UNHANDLED_REQUEST_EXCEPTION",
            elapsedMs: Date.now() - startedAt,
            ...errorDetails(error),
          });
          return respond({ ok: false, error: "internal server error" }, 500);
        }
      },
    },
  },
});
