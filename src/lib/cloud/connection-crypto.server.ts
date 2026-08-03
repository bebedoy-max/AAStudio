// Server-only AES-GCM crypto for per-user connector connection keys.
import { createCipheriv, createDecipheriv, randomBytes, createHash } from "node:crypto";

function key(): Buffer {
  const raw = process.env.APP_USER_CONNECTION_KEY_SECRET;
  if (raw) {
    const buf = Buffer.from(raw, "base64");
    return buf.length === 32 ? buf : createHash("sha256").update(raw).digest();
  }
  // Self-hosting fallback: derive a stable key from the server-only service role key.
  const fallback = process.env.SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (fallback) return createHash("sha256").update(fallback).digest();
  throw new Error("APP_USER_CONNECTION_KEY_SECRET / SERVICE_ROLE_KEY belum diset di server.");
}

export function encryptConnectionKey(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ct]).toString("base64");
}

export function decryptConnectionKey(stored: string): string {
  const buf = Buffer.from(stored, "base64");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const ct = buf.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
}
