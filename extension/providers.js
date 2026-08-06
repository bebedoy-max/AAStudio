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
    label: "Framia",
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
    id: "weavy",
    label: "Weavy",
    hostMatch: /https:\/\/([\w-]+\.)?weavy\.ai\//,
    urlPatterns: ["https://weavy.ai/*", "https://*.weavy.ai/*"],
    openUrl: "https://weavy.ai/",
    hint: "Login ke weavy.ai lalu klik Ambil Token — refresh token Firebase akan disinkron ke Token Manager.",
    scoreKeys: /firebase|weavy|stsTokenManager|refresh.?token/i,
    firebaseRefresh: true,
  },
];
