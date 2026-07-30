// Bridge to the AA Creative browser extension.
//
// Adobe's 3P gate answers 408 "system under load" for datacenter IPs, so the
// server proxy (/api/public/firefly) can never complete a generate request.
// When the extension is installed it relays the call from the user's own
// browser (ideally from an open firefly.adobe.com tab), which succeeds.

export type RelayResult<T> = { ok: boolean; status: number; data: T | null; raw?: string; error?: string };

export type RelayRequest = {
  url: string;
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: unknown;
  bodyBase64?: string;
  contentType?: string;
  token: string;
  apiKey?: string;
  accountId?: string;
  sessionId?: string;
  nonce?: string;
  headers?: Record<string, string>;
};

const CHANNEL = "aa-relay";

function post(msg: Record<string, unknown>) {
  window.postMessage({ channel: CHANNEL, ...msg }, "*");
}

function waitFor<T>(id: string, type: string, timeoutMs: number): Promise<T | null> {
  return new Promise((resolve) => {
    const timer = window.setTimeout(() => {
      window.removeEventListener("message", onMsg);
      resolve(null);
    }, timeoutMs);
    function onMsg(ev: MessageEvent) {
      const d = ev.data as { channel?: string; type?: string; id?: string; res?: T };
      if (ev.source !== window || d?.channel !== CHANNEL || d?.id !== id || d?.type !== type) return;
      window.clearTimeout(timer);
      window.removeEventListener("message", onMsg);
      resolve((d.res ?? (true as unknown)) as T);
    }
    window.addEventListener("message", onMsg);
  });
}

let cached: { at: number; ok: boolean } | null = null;

/** True when the AA Creative extension is installed on this page. */
export async function isRelayAvailable(force = false): Promise<boolean> {
  if (typeof window === "undefined") return false;
  if (!force && cached && Date.now() - cached.at < 30_000) return cached.ok;
  if (document.documentElement.getAttribute("data-aa-relay") !== "1") {
    cached = { at: Date.now(), ok: false };
    return false;
  }
  const id = crypto.randomUUID();
  const p = waitFor<boolean>(id, "pong", 1200);
  post({ type: "ping", id });
  const ok = (await p) === true;
  cached = { at: Date.now(), ok };
  return ok;
}

/** Perform a Firefly request through the extension. Throws when unavailable. */
export async function relayFireflyRequest<T = unknown>(
  req: RelayRequest,
  timeoutMs = 120_000,
): Promise<RelayResult<T>> {
  if (!(await isRelayAvailable())) throw new Error("relay-unavailable");
  const id = crypto.randomUUID();
  const p = waitFor<RelayResult<T>>(id, "response", timeoutMs);
  post({ type: "request", id, req });
  const res = await p;
  if (!res) throw new Error("relay-timeout");
  return res;
}

export function bytesToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}
