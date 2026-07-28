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
];
