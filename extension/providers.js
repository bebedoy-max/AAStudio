// Shared provider registry — extend this list to add more targets later.
// Each provider owns:
//  - id           : short slug, matches app storage key aatools.<id>.keys
//  - label        : display name
//  - hostMatch    : RegExp matched against active tab URL
//  - urlPatterns  : chrome.webRequest URL filters
//  - openUrl      : where to send the user to sign in
//  - hint         : instructions shown in the popup
//  - scoreKeys    : localStorage key regex to prefer when scanning
self.AA_PROVIDERS = [
  {
    id: "framia",
    label: "Framia (Converge AI)",
    hostMatch: /https:\/\/([\w-]+\.)?(converge\.ai|framia\.pro)\//,
    urlPatterns: [
      "https://api.framia.pro/*",
      "https://*.framia.pro/*",
      "https://framia.converge.ai/*",
      "https://*.converge.ai/*",
    ],
    openUrl: "https://framia.converge.ai/",
    hint: "Login ke framia.converge.ai lalu klik Ambil Token.",
    scoreKeys: /auth0|framia|converge/i,
  },
  {
    id: "leonardo",
    label: "Leonardo.ai",
    hostMatch: /https:\/\/([\w-]+\.)?leonardo\.ai\//,
    urlPatterns: [
      "https://api.leonardo.ai/*",
      "https://cloud.leonardo.ai/*",
      "https://app.leonardo.ai/*",
      "https://*.leonardo.ai/*",
    ],
    openUrl: "https://app.leonardo.ai/",
    hint: "Login ke app.leonardo.ai lalu klik Ambil Token.",
    scoreKeys: /firebase|leonardo|cognito|access.?token|idToken|stsTokenManager/i,
  },
  {
    id: "firefly",
    label: "Adobe Firefly",
    hostMatch: /https:\/\/([\w-]+\.)?(firefly\.adobe\.(com|io)|adobe\.com)\//,
    urlPatterns: [
      "https://firefly.adobe.com/*",
      "https://firefly.adobe.io/*",
      "https://firefly-3p.ff.adobe.io/*",
      "https://firefly-api.adobe.io/*",
    ],
    openUrl: "https://firefly.adobe.com/",
    hint: "Login ke firefly.adobe.com lalu klik Ambil Token.",
    scoreKeys: /adobe|firefly|ims|access.?token|bearer/i,
  },
  {
    id: "dola",
    label: "Dola",
    hostMatch: /https:\/\/([\w-]+\.)?dola\.com\//,
    urlPatterns: [
      "https://www.dola.com/*",
      "https://*.dola.com/*",
      "https://*.bytevcloudapi.com/*",
    ],
    openUrl: "https://www.dola.com/chat/",
    hint: "Login ke www.dola.com lalu klik Ambil Token (cookie session diambil otomatis).",
    // Dola tidak memakai JWT — auth-nya cookie session penuh.
    // Nama cookie session Dola berbeda-beda per region/akun, jadi cukup salah
    // satu dari daftar ini yang ada supaya jar dianggap valid.
    cookieCapture: {
      domain: "dola.com",
      urls: ["https://www.dola.com/", "https://dola.com/"],
      required: [],
      anyOf: ["sessionid", "sessionid_ss", "sid_tt", "sid_guard", "session_id", "passport_auth_status", "uid_tt"],
      // Header STS ImageX (upload gambar) ikut ditangkap dari request browser.
      stsHosts: /bytevcloudapi\.com$/i,
    },
    scoreKeys: /dola|doubao|samantha/i,
  },
];
