// Server-only AES-GCM helpers for encrypting user API tokens.
// Uses Web Crypto API — works on Vercel (Node 18+), Cloudflare Workers, and Deno.
// TOKEN_ENCRYPTION_KEY (any string ≥ 32 chars) is hashed to a 256-bit AES key.

const enc = new TextEncoder();
const dec = new TextDecoder();

let _keyPromise: Promise<CryptoKey> | undefined;

async function getKey(): Promise<CryptoKey> {
  if (_keyPromise) return _keyPromise;
  const secret = process.env.TOKEN_ENCRYPTION_KEY;
  if (!secret || secret.length < 16) {
    throw new Error("TOKEN_ENCRYPTION_KEY missing or too short (need >= 16 chars).");
  }
  _keyPromise = (async () => {
    const hash = await crypto.subtle.digest("SHA-256", enc.encode(secret));
    return crypto.subtle.importKey("raw", hash, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
  })();
  return _keyPromise;
}

function toBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

function fromBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function encryptString(plaintext: string): Promise<string> {
  const key = await getKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: iv.buffer as ArrayBuffer },
      key,
      enc.encode(plaintext),
    ),
  );
  const packed = new Uint8Array(iv.length + ct.length);
  packed.set(iv, 0);
  packed.set(ct, iv.length);
  return toBase64(packed);
}

export async function decryptString(payload: string): Promise<string> {
  const key = await getKey();
  const packed = fromBase64(payload);
  const iv = packed.slice(0, 12);
  const ct = packed.slice(12);
  const pt = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: iv.buffer as ArrayBuffer },
    key,
    ct.buffer as ArrayBuffer,
  );
  return dec.decode(pt);
}
