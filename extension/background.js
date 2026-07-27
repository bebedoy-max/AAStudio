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

async function handleHeaders(details, provider) {
  const headers = details.requestHeaders || [];
  for (const h of headers) {
    if (!h?.name || h.name.toLowerCase() !== "authorization") continue;
    const m = typeof h.value === "string" ? h.value.match(/Bearer\s+(\S+)/i) : null;
    if (!m || !JWT_RE.test(m[1])) continue;
    await onTokenCaptured(provider.id, m[1], "header:" + new URL(details.url).hostname);
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
