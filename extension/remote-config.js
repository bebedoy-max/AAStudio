// Auto-sync konfigurasi dari AA Creative Studio.
// URL studio, nama, dan logo extension dikontrol admin lewat Plug-IN Config —
// extension yang sudah ter-install akan mengambil nilai terbaru secara berkala,
// jadi admin tidak perlu meminta user install ulang.

self.AA_REMOTE = (() => {
  const BAKED = (self.AA_CONFIG && self.AA_CONFIG.appUrl) || "https://aacreative.vercel.app/";
  const PROVIDER = (self.AA_CONFIG && self.AA_CONFIG.providerId) || "";

  const clean = (u) => String(u || "").replace(/\/+$/, "");

  async function currentAppUrl() {
    const s = await chrome.storage.local.get(["appUrl"]);
    return clean(s.appUrl || BAKED);
  }

  async function fetchFrom(base) {
    const url = `${clean(base)}/api/public/extension/config?provider=${encodeURIComponent(PROVIDER)}`;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error("config " + res.status);
    return res.json();
  }

  /** Ambil config terbaru. Coba URL aktif dulu, lalu URL bawaan build. */
  async function sync() {
    const active = await currentAppUrl();
    const candidates = [...new Set([active, clean(BAKED)])].filter(Boolean);
    let data = null;
    for (const base of candidates) {
      try {
        data = await fetchFrom(base);
        break;
      } catch {}
    }
    if (!data) return null;

    const patch = { remoteConfig: { ...data, at: Date.now() } };
    if (data.appUrl) patch.appUrl = clean(data.appUrl);
    await chrome.storage.local.set(patch);
    await applyBranding(data);
    return data;
  }

  async function applyBranding(data) {
    try {
      if (data?.name) chrome.action?.setTitle?.({ title: data.name });
    } catch {}
    try {
      if (data?.logoUrl && typeof OffscreenCanvas !== "undefined") {
        const res = await fetch(data.logoUrl, { cache: "force-cache" });
        if (!res.ok) return;
        const bmp = await createImageBitmap(await res.blob());
        const canvas = new OffscreenCanvas(128, 128);
        const ctx = canvas.getContext("2d");
        ctx.drawImage(bmp, 0, 0, 128, 128);
        chrome.action?.setIcon?.({ imageData: { 128: ctx.getImageData(0, 0, 128, 128) } });
      }
    } catch {}
  }

  return { sync, currentAppUrl, BAKED, PROVIDER };
})();
