// Capture Authorization: Bearer <jwt> from Framia API requests.
const JWT_RE = /^eyJ[\w-]+\.[\w-]+\.[\w-]+$/;

const URL_FILTERS = {
  urls: [
    "https://api.framia.pro/*",
    "https://*.framia.pro/*",
    "https://framia.converge.ai/*",
    "https://*.converge.ai/*",
  ],
};

function saveToken(token, source) {
  if (!token || !JWT_RE.test(token)) return;
  chrome.storage.local.set({
    capturedToken: token,
    capturedSource: source,
    capturedAt: Date.now(),
  });
}

try {
  chrome.webRequest.onBeforeSendHeaders.addListener(
    (details) => {
      const headers = details.requestHeaders || [];
      for (const h of headers) {
        if (!h.name) continue;
        if (h.name.toLowerCase() === "authorization" && typeof h.value === "string") {
          const m = h.value.match(/Bearer\s+(\S+)/i);
          if (m && JWT_RE.test(m[1])) {
            saveToken(m[1], "header:" + new URL(details.url).hostname);
            return;
          }
        }
      }
    },
    URL_FILTERS,
    ["requestHeaders", "extraHeaders"],
  );
} catch (e) {
  console.warn("webRequest listener failed", e);
}
