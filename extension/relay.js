// Content script injected into the AA Creative app pages.
// Bridges window.postMessage from the app to the extension background, which
// performs Adobe Firefly requests from the user's own browser/IP (the server
// proxy is blocked by Adobe's 3P gate).

document.documentElement.setAttribute("data-aa-relay", "1");

window.addEventListener("message", (ev) => {
  if (ev.source !== window) return;
  // Hanya terima pesan dari origin halaman ini sendiri (blokir iframe/origin lain).
  if (ev.origin !== window.location.origin) return;
  const msg = ev.data;
  if (!msg || msg.channel !== "aa-relay" || !msg.id) return;

  if (msg.type === "ping") {
    window.postMessage({ channel: "aa-relay", type: "pong", id: msg.id }, "*");
    return;
  }
  if (msg.type !== "request") return;

  try {
    chrome.runtime.sendMessage({ kind: "AA_FF_RELAY", req: msg.req }, (res) => {
      const err = chrome.runtime.lastError;
      window.postMessage(
        {
          channel: "aa-relay",
          type: "response",
          id: msg.id,
          res: err
            ? { ok: false, status: 0, data: null, error: err.message }
            : res || { ok: false, status: 0, data: null, error: "relay: empty response" },
        },
        "*",
      );
    });
  } catch (e) {
    window.postMessage(
      {
        channel: "aa-relay",
        type: "response",
        id: msg.id,
        res: { ok: false, status: 0, data: null, error: String(e?.message || e) },
      },
      "*",
    );
  }
});
