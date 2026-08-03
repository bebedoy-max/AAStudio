// Header CORS bersama untuk endpoint Companion (dipanggil app Android, bukan browser,
// tapi tetap disediakan agar bisa diuji dari tooling web).
export const COMPANION_CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age": "86400",
} as const;

export function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...COMPANION_CORS },
  });
}

export function preflight() {
  return new Response(null, { status: 204, headers: COMPANION_CORS });
}
