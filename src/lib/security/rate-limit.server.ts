// Rate limiter best-effort untuk endpoint publik (server-only).
//
// Catatan: runtime serverless bersifat stateless per-instance, jadi penghitung
// ini tidak global. Tujuannya menahan credential-stuffing / abuse skrip
// (yang biasanya menembak satu instance berulang kali), BUKAN jaminan kuota
// absolut. Untuk jaminan keras, ganti backend Map ini dengan Redis/Upstash.

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();
const MAX_KEYS = 5000;

export function clientIp(request: Request): string {
  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return (
    request.headers.get("x-real-ip") ||
    request.headers.get("cf-connecting-ip") ||
    "unknown"
  );
}

/**
 * @returns { allowed, retryAfter } — retryAfter dalam detik saat ditolak.
 */
export function rateLimit(
  key: string,
  opts: { limit: number; windowMs: number },
): { allowed: boolean; retryAfter: number } {
  const now = Date.now();

  // Housekeeping: buang bucket kedaluwarsa supaya Map tidak tumbuh tanpa batas.
  if (buckets.size > MAX_KEYS) {
    for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
    if (buckets.size > MAX_KEYS) buckets.clear();
  }

  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + opts.windowMs });
    return { allowed: true, retryAfter: 0 };
  }
  existing.count += 1;
  if (existing.count > opts.limit) {
    return { allowed: false, retryAfter: Math.ceil((existing.resetAt - now) / 1000) };
  }
  return { allowed: true, retryAfter: 0 };
}
