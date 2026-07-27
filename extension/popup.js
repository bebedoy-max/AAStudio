const $ = (id) => document.getElementById(id);
const PROVIDERS = self.AA_PROVIDERS;

/* ------------------------------ tab switcher ------------------------------ */
document.querySelectorAll(".tabs button").forEach((b) => {
  b.addEventListener("click", () => {
    document.querySelectorAll(".tabs button").forEach((x) => x.classList.remove("active"));
    b.classList.add("active");
    $("tab-grab").style.display = b.dataset.tab === "grab" ? "flex" : "none";
    $("tab-account").style.display = b.dataset.tab === "account" ? "flex" : "none";
    if (b.dataset.tab === "account") renderAccount();
  });
});

/* ------------------------------- provider UI ------------------------------ */
const providerSel = $("provider");
for (const p of PROVIDERS) {
  const o = document.createElement("option");
  o.value = p.id;
  o.textContent = p.label;
  providerSel.appendChild(o);
}

function currentProvider() {
  return PROVIDERS.find((p) => p.id === providerSel.value) ?? PROVIDERS[0];
}

function setStatus(msg, cls = "muted", el = "status") {
  const s = $(el);
  s.className = "status " + cls;
  s.textContent = msg;
}

async function refreshProviderUI() {
  const p = currentProvider();
  $("provider-hint").textContent = p.hint;
  const cap = (await chrome.storage.local.get(`captured::${p.id}`))[`captured::${p.id}`];
  if (cap?.token) {
    $("token").value = cap.token;
    $("copy").disabled = false;
    $("push").disabled = false;
    setStatus(`Token siap (${cap.source}).`, "ok");
  } else {
    $("token").value = "";
    $("copy").disabled = true;
    $("push").disabled = true;
    setStatus("Belum ada token. Login di situs provider lalu klik Ambil.", "muted");
  }
}
providerSel.addEventListener("change", () => {
  chrome.storage.local.set({ lastProvider: providerSel.value });
  refreshProviderUI();
});

chrome.storage.local.get(["lastProvider", "autoSync"]).then((r) => {
  if (r.lastProvider) providerSel.value = r.lastProvider;
  $("auto").checked = r.autoSync !== false;
  refreshProviderUI();
});

$("auto").addEventListener("change", () => {
  chrome.storage.local.set({ autoSync: $("auto").checked });
});

/* --------------------------- open provider site --------------------------- */
$("open").addEventListener("click", () => {
  chrome.tabs.create({ url: currentProvider().openUrl });
});

/* ------------------------------ grab token -------------------------------- */
// This runs in the provider's page (MAIN world). It scans every storage
// surface Firebase / Auth0 / Cognito might have written into and picks the
// most likely access-token JWT.
function extractToken(scoreKeysStr) {
  const JWT_RE = /^eyJ[\w-]+\.[\w-]+\.[\w-]+$/;
  const scoreKeys = new RegExp(scoreKeysStr, "i");
  const looksJwt = (s) => typeof s === "string" && JWT_RE.test(s);
  const candidates = [];
  const walk = (o, key, score) => {
    if (o == null) return;
    if (typeof o === "string") {
      if (looksJwt(o)) candidates.push({ key, token: o, score });
      return;
    }
    if (typeof o === "object") {
      for (const kk of Object.keys(o)) {
        const boost = /access.?token|id.?token|body|stsTokenManager/i.test(kk) ? 40 : 0;
        walk(o[kk], key + "." + kk, score + boost);
      }
    }
  };
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      const v = localStorage.getItem(k);
      if (!v) continue;
      const boost = scoreKeys.test(k) ? 40 : 0;
      if (looksJwt(v)) candidates.push({ key: "ls:" + k, token: v, score: 60 + boost });
      try { walk(JSON.parse(v), "ls:" + k, 50 + boost); } catch {}
    }
  } catch {}
  try {
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i);
      const v = sessionStorage.getItem(k);
      if (!v) continue;
      if (looksJwt(v)) candidates.push({ key: "ss:" + k, token: v, score: 55 });
      try { walk(JSON.parse(v), "ss:" + k, 45); } catch {}
    }
  } catch {}
  document.cookie.split(";").forEach((c) => {
    const [k, ...rest] = c.trim().split("=");
    const v = decodeURIComponent(rest.join("="));
    if (looksJwt(v)) candidates.push({ key: "cookie:" + k, token: v, score: 70 });
  });
  const scanIDB = async () => {
    if (!indexedDB.databases) return;
    let dbs = [];
    try { dbs = await indexedDB.databases(); } catch {}
    for (const info of dbs) {
      if (!info?.name) continue;
      await new Promise((resolve) => {
        let done = false;
        const finish = () => { if (!done) { done = true; resolve(); } };
        setTimeout(finish, 1500);
        try {
          const req = indexedDB.open(info.name);
          req.onerror = finish;
          req.onsuccess = () => {
            const db = req.result;
            const stores = Array.from(db.objectStoreNames || []);
            if (!stores.length) { db.close(); finish(); return; }
            try {
              const tx = db.transaction(stores, "readonly");
              let pending = stores.length;
              const doneOne = () => { if (--pending <= 0) { db.close(); finish(); } };
              stores.forEach((sn) => {
                try {
                  const g = tx.objectStore(sn).getAll();
                  g.onerror = doneOne;
                  g.onsuccess = () => {
                    (g.result || []).forEach((row, idx) => {
                      const boost = scoreKeys.test(info.name) || scoreKeys.test(sn) ? 40 : 0;
                      walk(row, `idb:${info.name}/${sn}[${idx}]`, 80 + boost);
                    });
                    doneOne();
                  };
                } catch { doneOne(); }
              });
            } catch { db.close(); finish(); }
          };
        } catch { finish(); }
      });
    }
  };
  return scanIDB().then(() => {
    if (!candidates.length) return { ok: false, error: "Tidak menemukan JWT di halaman ini." };
    candidates.sort((a, b) => (b.score - a.score) || (b.token.length - a.token.length));
    const best = candidates[0];
    return { ok: true, token: best.token, source: best.key, all: candidates.length };
  });
}

$("grab").addEventListener("click", async () => {
  const p = currentProvider();
  setStatus("Membaca token...");
  const cap = (await chrome.storage.local.get(`captured::${p.id}`))[`captured::${p.id}`];
  if (cap?.token && Date.now() - cap.at < 30 * 60 * 1000) {
    await onGrabbed(p.id, cap.token, cap.source);
    return;
  }
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.url || !p.hostMatch.test(tab.url)) {
      setStatus(`Buka tab ${p.openUrl.replace(/^https?:\/\//, "").replace(/\/$/, "")} dulu.`, "err");
      return;
    }
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: extractToken,
      world: "MAIN",
      args: [p.scoreKeys.source],
    });
    const r = results?.[0]?.result;
    if (!r?.ok) { setStatus(r?.error || "Gagal.", "err"); return; }
    await chrome.storage.local.set({ [`captured::${p.id}`]: { token: r.token, source: r.source, at: Date.now() } });
    await onGrabbed(p.id, r.token, r.source);
  } catch (e) {
    setStatus("Error: " + (e?.message || e), "err");
  }
});

async function onGrabbed(providerId, token, source) {
  $("token").value = token;
  $("copy").disabled = false;
  $("push").disabled = false;
  setStatus(`Token diambil (${source}).`, "ok");
  // If logged in + auto-sync, push immediately so user doesn't have to click.
  const { session, autoSync } = await chrome.storage.local.get(["session", "autoSync"]);
  if (session?.access_token && autoSync !== false) pushToApp(providerId, token, /*silent*/ true);
}

/* ------------------------------- copy / push ------------------------------ */
$("copy").addEventListener("click", async () => {
  try { await navigator.clipboard.writeText($("token").value); setStatus("Disalin ke clipboard.", "ok"); }
  catch { setStatus("Gagal copy.", "err"); }
});

$("push").addEventListener("click", () => {
  pushToApp(currentProvider().id, $("token").value);
});

async function pushToApp(providerId, token, silent = false) {
  const { appUrl, session } = await chrome.storage.local.get(["appUrl", "session"]);
  if (!appUrl || !session?.access_token) {
    setStatus("Login dulu di tab Akun.", "err");
    return;
  }
  if (!silent) setStatus("Mengirim ke akun...");
  try {
    const res = await fetch(appUrl.replace(/\/+$/, "") + "/api/public/extension/push-token", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + session.access_token },
      body: JSON.stringify({ provider: providerId, token }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (res.status === 401 && session.refresh_token) {
        const refreshed = await refreshSession(appUrl, session.refresh_token);
        if (refreshed) return pushToApp(providerId, token, silent);
      }
      setStatus("Gagal kirim: " + (data?.error || res.status), "err");
      return;
    }
    await chrome.storage.local.set({ [`synced::${providerId}`]: { at: Date.now(), ok: true } });
    setStatus(data?.added ? "Token baru ditambahkan ke Token Manager." : "Token sudah ada — tidak duplikat.", "ok");
  } catch (e) {
    setStatus("Error: " + (e?.message || e), "err");
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
  } catch { return null; }
}

/* --------------------------------- account -------------------------------- */
async function renderAccount() {
  const { appUrl, session } = await chrome.storage.local.get(["appUrl", "session"]);
  if (appUrl) $("appUrl").value = appUrl;
  const pill = $("account-pill");
  if (session?.user?.email) {
    $("account-signed-out").style.display = "none";
    $("account-signed-in").style.display = "block";
    $("who").textContent = session.user.email;
    $("app-info").textContent = appUrl || "";
    pill.textContent = "✓ " + session.user.email;
    pill.className = "pill on";
    // render per-provider sync status
    const list = $("sync-list");
    list.innerHTML = "";
    for (const p of PROVIDERS) {
      const syn = (await chrome.storage.local.get(`synced::${p.id}`))[`synced::${p.id}`];
      const cap = (await chrome.storage.local.get(`captured::${p.id}`))[`captured::${p.id}`];
      const row = document.createElement("div");
      row.className = "toggle";
      const when = syn?.at ? new Date(syn.at).toLocaleTimeString() : "belum";
      row.innerHTML = `<div><div style="font-size:12px; font-weight:600;">${p.label}</div><div style="font-size:10.5px; color:#8a8aa0;">Terakhir sync: ${when}${cap ? " · token siap" : ""}</div></div><span class="pill ${syn?.ok ? "on" : ""}">${syn?.ok ? "OK" : "—"}</span>`;
      list.appendChild(row);
    }
  } else {
    $("account-signed-out").style.display = "block";
    $("account-signed-in").style.display = "none";
    pill.textContent = "Belum login";
    pill.className = "muted";
  }
}

$("appUrl")?.addEventListener("change", () => {
  chrome.storage.local.set({ appUrl: $("appUrl").value.trim() });
});

$("login").addEventListener("click", async () => {
  const appUrl = $("appUrl").value.trim();
  const email = $("email").value.trim();
  const password = $("password").value;
  if (!appUrl || !email || !password) { setStatus("Isi URL app, email, password.", "err", "auth-status"); return; }
  await chrome.storage.local.set({ appUrl });
  setStatus("Login...", "muted", "auth-status");
  try {
    const res = await fetch(appUrl.replace(/\/+$/, "") + "/api/public/extension/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.access_token) {
      setStatus("Gagal: " + (data?.error || res.status), "err", "auth-status");
      return;
    }
    await chrome.storage.local.set({ session: data });
    $("password").value = "";
    setStatus("Berhasil masuk sebagai " + data.user.email, "ok", "auth-status");
    renderAccount();
  } catch (e) {
    setStatus("Error: " + (e?.message || e), "err", "auth-status");
  }
});

$("logout").addEventListener("click", async () => {
  await chrome.storage.local.remove("session");
  renderAccount();
});
