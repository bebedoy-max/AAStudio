// =============================================================================
// AA Plug-IN catalog — sumber tunggal daftar companion app / browser extension
// / plugin yang tersedia untuk user. Tambahkan entry baru di sini dan otomatis
// muncul di halaman "AA Plug-IN" dan di Admin → Plug-IN Config.
// =============================================================================

export type PluginKind = "extension" | "app" | "plugin";

export type PluginEntry = {
  id: string;
  name: string;
  kind: PluginKind;
  provider: string;
  tagline: string;
  desc: string;
  version: string;
  file: string;
  site: string;
  accent: string; // css gradient token
  features: string[];
};

export const PLUGIN_CATALOG: PluginEntry[] = [
  {
    id: "grabber-leonardo",
    name: "AA Grabber — Leonardo.ai",
    kind: "extension",
    provider: "Leonardo.ai",
    tagline: "Auto-sync token Leonardo ke Token Manager",
    desc: "Browser extension khusus Leonardo.ai. Menangkap JWT sesi kamu saat login / refresh lalu mengirimkannya otomatis ke Token Manager akun AA Creative Studio kamu.",
    version: "3.0.0",
    file: "/plugins/aa-token-grabber-leonardo.zip",
    site: "https://app.leonardo.ai/",
    accent: "linear-gradient(135deg, hsl(265 85% 60%), hsl(200 90% 55%))",
    features: [
      "Deteksi tab Leonardo otomatis",
      "Auto-grab saat token di-refresh",
      "Kirim ke Token Manager sekali klik",
      "Terikat ke akun kamu — tidak bisa dipindah",
    ],
  },
  {
    id: "grabber-framia",
    name: "AA Grabber — Framia",
    kind: "extension",
    provider: "Framia (Converge AI)",
    tagline: "Auto-sync token Framia ke Token Manager",
    desc: "Browser extension khusus Framia / Converge AI. Menangkap bearer token Auth0 dari sesi kamu dan menyinkronkannya ke Token Manager tanpa copy-paste manual.",
    version: "3.0.0",
    file: "/plugins/aa-token-grabber-framia.zip",
    site: "https://framia.converge.ai/",
    accent: "linear-gradient(135deg, hsl(160 80% 45%), hsl(200 90% 55%))",
    features: [
      "Deteksi tab Framia otomatis",
      "Menangkap header Authorization live",
      "Anti duplikat di Token Manager",
      "Terikat ke akun kamu — tidak bisa dipindah",
    ],
  },
];

export type PluginConfigEntry = {
  enabled?: boolean;
  version?: string;
  note?: string;
};

export type PluginConfig = Record<string, PluginConfigEntry>;

export const DEFAULT_STUDIO_URL = "https://aacreative.vercel.app/";

export function pluginVersion(entry: PluginEntry, cfg: PluginConfig | null | undefined) {
  return cfg?.[entry.id]?.version?.trim() || entry.version;
}

export function pluginEnabled(entry: PluginEntry, cfg: PluginConfig | null | undefined) {
  return cfg?.[entry.id]?.enabled !== false;
}
