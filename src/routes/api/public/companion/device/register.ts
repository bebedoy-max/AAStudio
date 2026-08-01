// POST /api/public/companion/device/register
// Body: { device_id, device_name, android_version, enroll_secret }
// Response: { ok, token }
//
// enroll_secret harus sama dengan env COMPANION_ENROLL_SECRET (di-set di Vercel).
import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, preflight } from "@/lib/companion/http";

export const Route = createFileRoute("/api/public/companion/device/register")({
  server: {
    handlers: {
      OPTIONS: async () => preflight(),
      POST: async ({ request }) => {
        const enrollSecret = process.env["COMPANION_ENROLL_SECRET"];
        if (!enrollSecret) {
          return jsonResponse({ ok: false, error: "server not configured" }, 503);
        }

        let body: {
          device_id?: string;
          device_name?: string;
          android_version?: string;
          enroll_secret?: string;
        };
        try {
          body = await request.json();
        } catch {
          return jsonResponse({ ok: false, error: "invalid json" }, 400);
        }

        const { safeEqual, registerDevice } = await import("@/lib/companion/companion.server");
        if (!body.enroll_secret || !safeEqual(body.enroll_secret, enrollSecret)) {
          return jsonResponse({ ok: false, error: "unauthorized" }, 401);
        }
        const deviceId = (body.device_id ?? "").trim();
        if (deviceId.length < 8 || deviceId.length > 128) {
          return jsonResponse({ ok: false, error: "invalid device_id" }, 400);
        }

        try {
          const { token } = await registerDevice({
            deviceId,
            deviceName: (body.device_name ?? "").slice(0, 120) || null,
            androidVersion: (body.android_version ?? "").slice(0, 40) || null,
          });
          return jsonResponse({ ok: true, token });
        } catch (e) {
          console.error("[companion/register]", e);
          return jsonResponse({ ok: false, error: "register failed" }, 500);
        }
      },
    },
  },
});
