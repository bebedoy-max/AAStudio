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
        // .trim(): nilai env dari dashboard sering terbawa spasi/newline saat copy-paste.
        const enrollSecret = process.env["COMPANION_ENROLL_SECRET"]?.trim();
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
        const received = (body.enroll_secret ?? "").trim();
        const matches = received.length > 0 && safeEqual(received, enrollSecret);
        if (!matches) {
          // Diagnostik aman: hanya panjang & sidik jari pendek, bukan nilai rahasianya.
          const { shortFingerprint } = await import("@/lib/companion/companion.server");
          const reason = !received
            ? "body.enroll_secret missing"
            : received.length !== enrollSecret.length
              ? "length mismatch"
              : "value mismatch";
          console.warn("[companion/register] unauthorized", {
            envLoaded: true,
            envLength: enrollSecret.length,
            envTrimmedLength: enrollSecret.trim().length,
            envFingerprint: await shortFingerprint(enrollSecret),
            receivedLength: received.length,
            receivedTrimmedLength: received.trim().length,
            receivedFingerprint: await shortFingerprint(received),
            trimmedMatch: received.trim() === enrollSecret.trim(),
            reason,
          });
          return jsonResponse({ ok: false, error: "unauthorized", reason }, 401);
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
