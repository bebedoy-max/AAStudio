// Unified background: watches Authorization headers on every registered
// provider and, when a fresh JWT arrives, saves it locally AND auto-pushes it
// to the linked AA Creative account (if the user is logged in inside the
// extension). This is what makes "auto grab & sync on refresh" work.

importScripts("providers.js");

const JWT_RE = /^eyJ[\w-]+\.[\w-]+\.[\w-]+$/;

// Wire one listener per provider so we know which provider a captured token
// belongs to without having to inspect the URL again in the popup.
for (const p of self.AA_PROVIDERS) {
  try {
    chrome.webRequest.onBeforeSendHeaders.addListener(
      (details) => handleHeaders(details, p),
      { urls: p.urlPatterns },
      ["requestHeaders", "extraHeaders"],
    );
  } catch (e) {
    console.warn("[aa] webRequest listener failed for", p.id, e);
  }
}

// Providers use different header names to carry the JWT:
//   Leonardo   → Authorization: Bearer <jwt>
//   Framia     → Authorization: Bearer <jwt>  OR  x-framia-token / token / access-token
// Scan every request header and pick the first value that looks like a JWT.
async function handleHeaders(details, provider) {
  const headers = details.requestHeaders || [];
  for (const h of headers) {
    if (!h?.name || typeof h.value !== "string") continue;
    const name = h.name.toLowerCase();
    if (name === "cookie" || name === "user-agent" || name === "referer" || name === "origin") continue;
    // Strip an optional "Bearer " / "Token " prefix.
    const raw = h.value.replace(/^\s*(Bearer|Token)\s+/i, "").trim();
    if (!JWT_RE.test(raw)) continue;
    await onTokenCaptured(provider.id, raw, `header:${name}@${new URL(details.url).hostname}`);
    return;
  }
}

// Debounce so we don't spam the app when a page fires 20 requests per second.
const lastPushAt = {}; // providerId -> ms

async function onTokenCaptured(providerId, token, source) {
  const storageKey = `captured::${providerId}`;
  const prev = (await chrome.storage.local.get(storageKey))[storageKey];
  const changed = !prev || prev.token !== token;

  await chrome.storage.local.set({
    [storageKey]: { token, source, at: Date.now() },
  });
  // Keep a single "latest across all providers" pointer for the popup UI.
  await chrome.storage.local.set({
    lastCapture: { providerId, token, source, at: Date.now() },
  });

  if (!changed) return;
  const now = Date.now();
  if (lastPushAt[providerId] && now - lastPushAt[providerId] < 5000) return;
  lastPushAt[providerId] = now;

  // Fire-and-forget auto-sync; the popup surfaces errors if the user opens it.
  autoPush(providerId, token).catch((e) => console.debug("[aa] autoPush", e?.message || e));
}

async function autoPush(providerId, token) {
  const cfg = await chrome.storage.local.get(["appUrl", "session", "autoSync"]);
  if (cfg.autoSync === false) return;
  if (!cfg.appUrl || !cfg.session?.access_token) return;
  const url = cfg.appUrl.replace(/\/+$/, "") + "/api/public/extension/push-token";
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + cfg.session.access_token,
    },
    body: JSON.stringify({ provider: providerId, token }),
  });
  if (res.status === 401 && cfg.session.refresh_token) {
    // Access token expired — try refresh once, then retry.
    const refreshed = await refreshSession(cfg.appUrl, cfg.session.refresh_token);
    if (refreshed) {
      await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + refreshed.access_token,
        },
        body: JSON.stringify({ provider: providerId, token }),
      });
    }
  }
  const at = Date.now();
  await chrome.storage.local.set({ [`synced::${providerId}`]: { at, ok: res.ok } });
  if (res.ok) {
    try {
      chrome.notifications?.create?.({
        type: "basic",
        iconUrl: "icon.png",
        title: "AA Creative",
        message: `Token ${providerId} auto-sync ke akun kamu.`,
        priority: 0,
      });
    } catch {}
  }
}

async function refreshSession(appUrl, refreshToken) {
  try {
    const res = await fetch(appUrl.replace(/\/+$/, "") + "/api/public/extension/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data?.access_token) return null;
    await chrome.storage.local.set({ session: data });
    return data;
  } catch {
    return null;
  }
}

// Periodic keepalive: refresh session before expiry so long-running captures
// don't get 401 on the auto-push path.
chrome.alarms.create("aa-refresh", { periodInMinutes: 30 });
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== "aa-refresh") return;
  const cfg = await chrome.storage.local.get(["appUrl", "session"]);
  if (!cfg.appUrl || !cfg.session?.refresh_token) return;
  await refreshSession(cfg.appUrl, cfg.session.refresh_token);
});

/* ------------------------------------------------------------------ *
 * Firefly relay: the app asks the extension to perform Adobe requests
 * from the user's own browser (Adobe blocks datacenter IPs with a 408
 * "system under load"). Requests come from the relay.js content script.
 * ------------------------------------------------------------------ */

const RELAY_ALLOWED_HOSTS = [
  "firefly.adobe.io",
  "firefly-3p.ff.adobe.io",
  "firefly-api.adobe.io",
];

function b64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function relayFirefly(req) {
  let target;
  try {
    target = new URL(req.url);
  } catch {
    return { ok: false, status: 0, data: null, error: "invalid url" };
  }
  if (!RELAY_ALLOWED_HOSTS.includes(target.hostname)) {
    return { ok: false, status: 0, data: null, error: `host not allowed: ${target.hostname}` };
  }

  const headers = {
    Accept: "application/json, text/plain, */*",
    Authorization: req.token.startsWith("Bearer ") ? req.token : "Bearer " + req.token,
    "x-api-key": req.apiKey || "SunbreakWebUI1",
    "x-arp-session-id": req.sessionId || crypto.randomUUID(),
    ...(req.nonce ? { "x-nonce": req.nonce } : {}),
    ...(req.accountId ? { "x-account-id": req.accountId } : {}),
    ...(req.headers || {}),
  };

  let body;
  if (req.bodyBase64 !== undefined) {
    headers["Content-Type"] = req.contentType || "application/octet-stream";
    body = b64ToBytes(req.bodyBase64);
  } else if (req.body !== undefined) {
    headers["Content-Type"] = req.contentType || "application/json";
    body = JSON.stringify(req.body);
  }

  const method = req.method || (body ? "POST" : "GET");

  // Preferred path: run the fetch inside a real firefly.adobe.com tab so the
  // Origin/Referer headers are genuine (Adobe's 3P gate rejects other origins).
  const viaTab = await relayViaFireflyTab({
    url: target.toString(),
    method,
    headers,
    bodyText: req.bodyBase64 === undefined && req.body !== undefined ? JSON.stringify(req.body) : null,
    bodyBase64: req.bodyBase64 ?? null,
  });
  if (viaTab) return { ...viaTab, via: "firefly-tab" };

  let res;
  try {
    res = await fetch(target.toString(), { method, headers, body, credentials: "omit" });
  } catch (e) {
    return { ok: false, status: 0, data: null, error: String(e?.message || e) };
  }
  const text = await res.text();
  let parsed = null;
  try {
    parsed = JSON.parse(text);
  } catch {}
  return {
    ok: res.ok,
    status: res.status,
    data: parsed,
    raw: parsed ? undefined : text.slice(0, 800),
    via: "background",
  };
}

/** Persist a short relay activity log so the popup can show live proof. */
async function noteRelay(entry) {
  try {
    const cur = await chrome.storage.local.get("relayLog");
    const log = Array.isArray(cur.relayLog) ? cur.relayLog : [];
    log.unshift({ at: Date.now(), ...entry });
    await chrome.storage.local.set({ relayLog: log.slice(0, 20) });
    chrome.action.setBadgeBackgroundColor({ color: entry.ok ? "#16a34a" : "#dc2626" });
    chrome.action.setBadgeText({ text: entry.ok ? "OK" : "ERR" });
    setTimeout(() => chrome.action.setBadgeText({ text: "" }), 6000);
  } catch {}
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.kind === "AA_FF_RELAY_STATUS") {
    (async () => {
      const tabs = await chrome.tabs.query({ url: ["https://firefly.adobe.com/*"] });
      const cur = await chrome.storage.local.get("relayLog");
      sendResponse({ fireflyTab: tabs.length > 0, relayLog: cur.relayLog || [] });
    })();
    return true;
  }
  if (msg?.kind !== "AA_FF_RELAY") return;
  const req = msg.req || {};
  relayFirefly(req)
    .then((res) => {
      noteRelay({
        ok: !!res?.ok,
        status: res?.status ?? 0,
        path: (() => {
          try {
            return new URL(req.url).pathname;
          } catch {
            return String(req.url || "");
          }
        })(),
        via: res?.via || "extension",
        from: sender?.tab?.url ? new URL(sender.tab.url).host : "",
      });
      sendResponse(res);
    })
    .catch((e) => {
      noteRelay({ ok: false, status: 0, path: String(req.url || ""), via: "error" });
      sendResponse({ ok: false, status: 0, data: null, error: String(e?.message || e) });
    });
  return true; // async
});


async function findFireflyTab() {
  const tabs = await chrome.tabs.query({ url: ["https://firefly.adobe.com/*"] });
  return tabs?.[0] || null;
}

/** Execute the request inside a firefly.adobe.com tab. Returns null when no
 *  such tab is open or injection is not possible (caller falls back). */
async function relayViaFireflyTab({ url, method, headers, bodyText, bodyBase64 }) {
  try {
    const tab = await findFireflyTab();
    if (!tab?.id) return null;
    const [out] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      world: "MAIN",
      func: async (u, m, h, bText, bB64) => {
        try {
          let body;
          if (bB64) {
            const bin = atob(bB64);
            const bytes = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
            body = bytes;
          } else if (bText) {
            body = bText;
          }
          const r = await fetch(u, { method: m, headers: h, body, credentials: "include" });
          const t = await r.text();
          let d = null;
          try { d = JSON.parse(t); } catch {}
          return { ok: r.ok, status: r.status, data: d, raw: d ? undefined : t.slice(0, 800) };
        } catch (e) {
          return { ok: false, status: 0, data: null, error: String(e && e.message ? e.message : e) };
        }
      },
      args: [url, method, headers, bodyText, bodyBase64],
    });
    const r = out?.result;
    if (!r) return null;
    if (r.status === 0 && r.error) return null; // tab fetch failed -> fallback
    return r;
  } catch {
    return null;
  }
}
