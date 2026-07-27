const $ = (id) => document.getElementById(id);
const statusEl = $("status");
const tokenEl = $("token");
const grabBtn = $("grab");
const copyBtn = $("copy");
const sendBtn = $("send");
const appUrlEl = $("appUrl");

const setStatus = (msg, cls = "muted") => {
  statusEl.className = "status " + cls;
  statusEl.textContent = msg;
};

chrome.storage.local.get(["appUrl", "lastToken"], (r) => {
  if (r.appUrl) appUrlEl.value = r.appUrl;
  if (r.lastToken) {
    tokenEl.value = r.lastToken;
    copyBtn.disabled = false;
    sendBtn.disabled = false;
  }
});
appUrlEl.addEventListener("change", () => chrome.storage.local.set({ appUrl: appUrlEl.value.trim() }));

// Runs INSIDE the framia.converge.ai tab.
// Framia uses Auth0 -> tokens typically live in localStorage under
// keys like "@@auth0spajs@@::..." (as JSON with body.access_token) and
// are injected in Authorization headers.
async function extractToken() {
  const JWT_RE = /^eyJ[\w-]+\.[\w-]+\.[\w-]+$/;
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
        const boost = /access.?token|id.?token|body/i.test(kk) ? 40 : 0;
        walk(o[kk], key + "." + kk, score + boost);
      }
    }
  };

  // 1) localStorage (Auth0 SPA stores here)
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      const v = localStorage.getItem(k);
      if (!v) continue;
      const isAuth0 = /auth0|framia|converge/i.test(k);
      if (looksJwt(v)) candidates.push({ key: "ls:" + k, token: v, score: isAuth0 ? 100 : 60 });
      try { walk(JSON.parse(v), "ls:" + k, isAuth0 ? 90 : 50); } catch {}
    }
  } catch {}

  // 2) sessionStorage
  try {
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i);
      const v = sessionStorage.getItem(k);
      if (!v) continue;
      if (looksJwt(v)) candidates.push({ key: "ss:" + k, token: v, score: 55 });
      try { walk(JSON.parse(v), "ss:" + k, 45); } catch {}
    }
  } catch {}

  // 3) cookies (readable)
  document.cookie.split(";").forEach((c) => {
    const [k, ...rest] = c.trim().split("=");
    const v = decodeURIComponent(rest.join("="));
    if (looksJwt(v)) candidates.push({ key: "cookie:" + k, token: v, score: 70 });
  });

  // 4) IndexedDB
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
                  const gAll = tx.objectStore(sn).getAll();
                  gAll.onerror = doneOne;
                  gAll.onsuccess = () => {
                    const rows = gAll.result || [];
                    rows.forEach((row, idx) => {
                      walk(row, `idb:${info.name}/${sn}[${idx}]`, 80);
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
  try { await scanIDB(); } catch {}

  if (!candidates.length) return { ok: false, error: "Tidak menemukan JWT di halaman ini." };
  candidates.sort((a, b) => (b.score - a.score) || (b.token.length - a.token.length));
  const best = candidates[0];
  return { ok: true, token: best.token, source: best.key, all: candidates.length };
}

async function grab() {
  setStatus("Membaca token...", "muted");

  // 1) Try background-captured Authorization header first.
  const cap = await chrome.storage.local.get(["capturedToken", "capturedSource", "capturedAt"]);
  if (cap.capturedToken && Date.now() - (cap.capturedAt || 0) < 30 * 60 * 1000) {
    tokenEl.value = cap.capturedToken;
    copyBtn.disabled = false;
    sendBtn.disabled = false;
    chrome.storage.local.set({ lastToken: cap.capturedToken });
    setStatus(`Token diambil dari ${cap.capturedSource}.`, "ok");
    return;
  }

  // 2) Fallback: scan the page.
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.url || !/https:\/\/([\w-]+\.)?(converge\.ai|framia\.pro)\//.test(tab.url)) {
      setStatus("Buka tab framia.converge.ai (yang sudah login) lalu klik lagi.", "err");
      return;
    }
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: extractToken,
      world: "MAIN",
    });
    const result = results?.[0]?.result;
    if (!result?.ok) {
      setStatus(
        (result?.error || "Gagal.") +
          " Coba refresh halaman framia (Ctrl+R), tunggu 3 detik, lalu klik lagi.",
        "err",
      );
      return;
    }
    tokenEl.value = result.token;
    copyBtn.disabled = false;
    sendBtn.disabled = false;
    chrome.storage.local.set({ lastToken: result.token });
    setStatus(`Token diambil dari ${result.source} (${result.all} kandidat).`, "ok");
  } catch (e) {
    setStatus("Error: " + (e?.message || e), "err");
  }
}

grabBtn.addEventListener("click", grab);

copyBtn.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(tokenEl.value);
    setStatus("Token disalin ke clipboard.", "ok");
  } catch {
    tokenEl.select();
    document.execCommand("copy");
    setStatus("Token disalin (fallback).", "ok");
  }
});

sendBtn.addEventListener("click", async () => {
  const url = appUrlEl.value.trim();
  if (!url) { setStatus("Isi URL AACreative dulu.", "err"); return; }
  chrome.storage.local.set({ appUrl: url });
  const target = url.replace(/\/$/, "") + "/manage/accounts#framia_token=" + encodeURIComponent(tokenEl.value);
  await chrome.tabs.create({ url: target });
  setStatus("Tab AACreative dibuka.", "ok");
});
