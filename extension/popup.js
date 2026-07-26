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

// Load saved app URL
chrome.storage.local.get(["appUrl", "lastToken"], (r) => {
  if (r.appUrl) appUrlEl.value = r.appUrl;
  if (r.lastToken) {
    tokenEl.value = r.lastToken;
    copyBtn.disabled = false;
    sendBtn.disabled = false;
  }
});
appUrlEl.addEventListener("change", () => chrome.storage.local.set({ appUrl: appUrlEl.value.trim() }));

// Runs inside app.leonardo.ai page
function extractToken() {
  const looksJwt = (s) => typeof s === "string" && /^eyJ[\w-]+\.[\w-]+\.[\w-]+$/.test(s);
  const candidates = [];

  // 1) Cognito standard keys
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      const v = localStorage.getItem(k);
      if (!v) continue;
      if (/idToken$/i.test(k) && looksJwt(v)) candidates.push({ key: k, token: v, score: 100 });
      else if (/accessToken$/i.test(k) && looksJwt(v)) candidates.push({ key: k, token: v, score: 90 });
      else if (looksJwt(v)) candidates.push({ key: k, token: v, score: 40 });
      else {
        // maybe JSON blob containing tokens
        try {
          const obj = JSON.parse(v);
          const walk = (o) => {
            if (!o) return;
            if (typeof o === "string" && looksJwt(o)) candidates.push({ key: k, token: o, score: 60 });
            else if (typeof o === "object") for (const kk of Object.keys(o)) walk(o[kk]);
          };
          walk(obj);
        } catch {}
      }
    }
  } catch (e) {}

  // 2) sessionStorage
  try {
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i);
      const v = sessionStorage.getItem(k);
      if (looksJwt(v)) candidates.push({ key: "session:" + k, token: v, score: 50 });
    }
  } catch {}

  // 3) cookies (readable, non-httpOnly)
  document.cookie.split(";").forEach((c) => {
    const [k, ...rest] = c.trim().split("=");
    const v = decodeURIComponent(rest.join("="));
    if (looksJwt(v)) candidates.push({ key: "cookie:" + k, token: v, score: 70 });
  });

  if (!candidates.length) return { ok: false, error: "Tidak menemukan JWT. Pastikan sudah login di app.leonardo.ai." };
  candidates.sort((a, b) => b.score - a.score);
  return { ok: true, token: candidates[0].token, source: candidates[0].key, all: candidates.length };
}

grabBtn.addEventListener("click", async () => {
  setStatus("Membaca token...", "muted");
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.url || !/https:\/\/(app\.)?leonardo\.ai\//.test(tab.url)) {
      setStatus("Buka tab app.leonardo.ai dulu, lalu klik lagi.", "err");
      return;
    }
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: extractToken,
    });
    if (!result?.ok) {
      setStatus(result?.error || "Gagal.", "err");
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
});

copyBtn.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(tokenEl.value);
    setStatus("Token disalin ke clipboard.", "ok");
  } catch (e) {
    tokenEl.select();
    document.execCommand("copy");
    setStatus("Token disalin (fallback).", "ok");
  }
});

sendBtn.addEventListener("click", async () => {
  const url = appUrlEl.value.trim();
  if (!url) { setStatus("Isi URL AACreative dulu.", "err"); return; }
  chrome.storage.local.set({ appUrl: url });
  const target = url.replace(/\/$/, "") + "/manage/accounts#leonardo_token=" + encodeURIComponent(tokenEl.value);
  await chrome.tabs.create({ url: target });
  setStatus("Tab AACreative dibuka.", "ok");
});
