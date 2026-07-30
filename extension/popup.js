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
// Auto-detect the provider from whatever tab the user currently has open.
// The user never picks a provider manually anymore.
let detectedProvider = null;

async function detectProviderFromActiveTab() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.url) {
      const match = PROVIDERS.find((p) => p.hostMatch.test(tab.url));
      if (match) return match;
    }
  } catch {}
  // Fallback: last captured token across any provider.
  const { lastCapture } = await chrome.storage.local.get("lastCapture");
  if (lastCapture?.providerId) {
    return PROVIDERS.find((p) => p.id === lastCapture.providerId) ?? null;
  }
  return null;
}

function currentProvider() {
  return detectedProvider;
}

function setStatus(msg, cls = "muted", el = "status") {
  const s = $(el);
  s.className = "status " + cls;
  s.textContent = msg;
}

async function refreshProviderUI() {
  detectedProvider = await detectProviderFromActiveTab();
  const p = detectedProvider;
  const pill = $("detect-pill");
  if (!p) {
    $("detected").textContent = "Belum ada provider terdeteksi";
    $("provider-hint").textContent = "Buka tab Framia / Leonardo / Adobe Firefly.";
    pill.textContent = "—";
    pill.className = "pill";
    $("token").value = "";
    $("copy").disabled = true;
    $("push").disabled = true;
    $("grab").disabled = true;
    $("open").disabled = true;
    setStatus("Buka salah satu situs provider di tab aktif.", "muted");
    return;
  }
  $("grab").disabled = false;
  $("open").disabled = false;
  $("detected").textContent = p.label;
  $("provider-hint").textContent = p.hint;
  pill.textContent = "aktif";
  pill.className = "pill on";
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

chrome.storage.local.get(["autoSync"]).then((r) => {
  $("auto").checked = r.autoSync !== false;
  refreshProviderUI();
  renderAccount();
});

// Re-detect when the user switches tabs while the popup is open.
chrome.tabs?.onActivated?.addListener?.(() => refreshProviderUI());
chrome.tabs?.onUpdated?.addListener?.((_id, info) => { if (info.url) refreshProviderUI(); });

$("auto").addEventListener("change", () => {
  chrome.storage.local.set({ autoSync: $("auto").checked });
});

/* --------------------------- open provider site --------------------------- */
$("open").addEventListener("click", () => {
  const p = currentProvider();
  if (p) chrome.tabs.create({ url: p.openUrl });
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
  if (!p) { setStatus("Provider tidak terdeteksi dari tab aktif.", "err"); return; }
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
  const p = currentProvider();
  if (p) pushToApp(p.id, $("token").value);
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
const DEFAULT_APP_URL = "https://aacreative.vercel.app/";

async function renderAccount() {
  const { appUrl, session, savedAccounts } = await chrome.storage.local.get(["appUrl", "session", "savedAccounts"]);
  const effectiveUrl = appUrl || DEFAULT_APP_URL;
  if ($("appUrl")) $("appUrl").value = effectiveUrl;
  const pill = $("account-pill");
  if (session?.user?.email) {
    $("account-signed-out").style.display = "none";
    $("account-signed-in").style.display = "block";
    $("who").textContent = session.user.email;
    $("app-info").textContent = effectiveUrl;
    pill.textContent = "✓ " + session.user.email;
    pill.className = "pill on";
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
    renderSavedAccounts(savedAccounts || []);
  }
}

function renderSavedAccounts(accounts) {
  const wrap = $("saved-wrap");
  const list = $("saved-list");
  if (!wrap || !list) return;
  if (!accounts.length) { wrap.style.display = "none"; return; }
  wrap.style.display = "block";
  list.innerHTML = "";
  accounts.forEach((acc, idx) => {
    const row = document.createElement("div");
    row.className = "toggle";
    row.innerHTML = `<div style="min-width:0; flex:1;"><div style="font-size:12px; font-weight:600; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${acc.email}</div><div style="font-size:10.5px; color:#8a8aa0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${acc.appUrl}</div></div><div style="display:flex; gap:6px;"><button data-act="use" data-i="${idx}" style="flex:0 0 auto; padding:5px 9px;">Masuk</button><button data-act="del" data-i="${idx}" style="flex:0 0 auto; padding:5px 9px;">✕</button></div>`;
    list.appendChild(row);
  });
  list.querySelectorAll("button").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const i = Number(btn.dataset.i);
      const { savedAccounts = [] } = await chrome.storage.local.get("savedAccounts");
      const acc = savedAccounts[i];
      if (!acc) return;
      if (btn.dataset.act === "del") {
        savedAccounts.splice(i, 1);
        await chrome.storage.local.set({ savedAccounts });
        renderSavedAccounts(savedAccounts);
        return;
      }
      $("appUrl").value = acc.appUrl;
      $("email").value = acc.email;
      $("password").value = acc.password || "";
      await chrome.storage.local.set({ appUrl: acc.appUrl });
      if (acc.password) $("login").click();
      else setStatus("Isi password untuk akun ini.", "muted", "auth-status");
    });
  });
}

$("appUrl")?.addEventListener("change", () => {
  const v = $("appUrl").value.trim() || DEFAULT_APP_URL;
  chrome.storage.local.set({ appUrl: v });
});

$("login").addEventListener("click", async () => {
  const appUrl = ($("appUrl").value.trim() || DEFAULT_APP_URL);
  const email = $("email").value.trim();
  const password = $("password").value;
  const remember = $("remember")?.checked;
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
    if (remember) {
      const { savedAccounts = [] } = await chrome.storage.local.get("savedAccounts");
      const filtered = savedAccounts.filter((a) => !(a.email === email && a.appUrl === appUrl));
      filtered.unshift({ appUrl, email, password });
      await chrome.storage.local.set({ savedAccounts: filtered.slice(0, 10) });
    }
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
