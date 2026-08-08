// Guard SSRF untuk semua endpoint yang mem-fetch URL dari user.
// Menolak skema non-http(s), host internal/loopback/link-local/private,
// notasi IP numerik yang menyamar, dan mengikuti redirect secara manual
// sambil memvalidasi ulang tiap hop.

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "localhost.localdomain",
  "metadata",
  "metadata.google.internal",
  "instance-data",
]);

function ipv4FromNumeric(host: string): string | null {
  // 2130706433, 0x7f000001, 017700000001 -> 127.0.0.1
  let value: number | null = null;
  if (/^\d+$/.test(host)) value = Number(host);
  else if (/^0x[0-9a-f]+$/i.test(host)) value = Number.parseInt(host, 16);
  else if (/^0[0-7]+$/.test(host)) value = Number.parseInt(host, 8);
  if (value === null || !Number.isFinite(value) || value < 0 || value > 0xffffffff) return null;
  return [24, 16, 8, 0].map((s) => (value! >>> s) & 0xff).join(".");
}

function isPrivateIpv4(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return false;
  const [a, b] = parts as [number, number, number, number];
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true; // link-local + cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 192 && b === 0) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a >= 224) return true; // multicast + reserved
  return false;
}

function isPrivateIpv6(host: string): boolean {
  const h = host.replace(/^\[|\]$/g, "").toLowerCase();
  if (h === "::" || h === "::1") return true;
  if (h.startsWith("fe80") || h.startsWith("fc") || h.startsWith("fd")) return true;
  const mapped = h.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateIpv4(mapped[1]!);
  return false;
}

/** true kalau URL aman untuk di-fetch server-side. */
export function isSafePublicUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return false;
  if (url.username || url.password) return false;

  const host = url.hostname.toLowerCase();
  if (!host) return false;
  if (BLOCKED_HOSTNAMES.has(host)) return false;
  if (host.endsWith(".localhost") || host.endsWith(".internal") || host.endsWith(".local")) return false;
  if (host.includes(":") || host.startsWith("[")) return !isPrivateIpv6(host);

  const numeric = ipv4FromNumeric(host);
  if (numeric) return !isPrivateIpv4(numeric);
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) return !isPrivateIpv4(host);
  return true;
}

export type SafeFetchInit = RequestInit & { maxRedirects?: number };

/**
 * fetch() dengan validasi SSRF pada URL awal dan setiap hop redirect.
 * Melempar Error("blocked url") kalau ada hop yang tidak aman.
 */
export async function safeFetch(input: string, init: SafeFetchInit = {}): Promise<Response> {
  const { maxRedirects = 4, ...rest } = init;
  let current = input;

  for (let hop = 0; hop <= maxRedirects; hop++) {
    if (!isSafePublicUrl(current)) throw new Error("blocked url");
    const res = await fetch(current, { ...rest, redirect: "manual" });
    const status = res.status;
    if (status < 300 || status > 399) return res;
    const location = res.headers.get("location");
    if (!location) return res;
    current = new URL(location, current).toString();
  }
  throw new Error("too many redirects");
}
