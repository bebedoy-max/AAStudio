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
<<<<<<< HEAD
    provider: "Framia",
    tagline: "Auto-sync token Framia ke Token Manager",
    desc: "Browser extension khusus Framia. Menangkap bearer token Auth0 dari sesi kamu dan menyinkronkannya ke Token Manager tanpa copy-paste manual.",
=======
    provider: "Framia (Converge AI)",
    tagline: "Auto-sync token Framia ke Token Manager",
    desc: "Browser extension khusus Framia / Converge AI. Menangkap bearer token Auth0 dari sesi kamu dan menyinkronkannya ke Token Manager tanpa copy-paste manual.",
>>>>>>> 409eb24b21ce412f88d578894fd59d62736c1a9b
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

export type PluginAccessMode = "open" | "premium" | "hide";

export type PluginConfigEntry = {
  enabled?: boolean;
  /** Status plug-in: open (gratis), premium (berbayar), hide (disembunyikan). */
  access?: PluginAccessMode;
  /** Harga jual (IDR) bila access = premium. */
  priceIdr?: number;
  version?: string;
  note?: string;
  /** Override nama extension yang tampil di katalog & popup extension. */
  name?: string;
  /** URL logo (https) yang dipakai extension sebagai ikon & di katalog. */
  logoUrl?: string;
};

export type PluginConfig = Record<string, PluginConfigEntry>;

export const DEFAULT_STUDIO_URL = "https://aacreative.vercel.app/";

export function pluginVersion(entry: PluginEntry, cfg: PluginConfig | null | undefined) {
  return cfg?.[entry.id]?.version?.trim() || entry.version;
}

export function pluginAccess(
  entry: PluginEntry,
  cfg: PluginConfig | null | undefined,
): PluginAccessMode {
  const c = cfg?.[entry.id];
  if (c?.enabled === false) return "hide";
  const a = c?.access;
  return a === "premium" || a === "hide" || a === "open" ? a : "open";
}

export function pluginPrice(entry: PluginEntry, cfg: PluginConfig | null | undefined) {
  const v = Number(cfg?.[entry.id]?.priceIdr ?? 0);
  return Number.isFinite(v) && v > 0 ? Math.round(v) : 0;
}

export function pluginEnabled(entry: PluginEntry, cfg: PluginConfig | null | undefined) {
  return pluginAccess(entry, cfg) !== "hide";
}

export function pluginName(entry: PluginEntry, cfg: PluginConfig | null | undefined) {
  return cfg?.[entry.id]?.name?.trim() || entry.name;
}

export function pluginLogo(entry: PluginEntry, cfg: PluginConfig | null | undefined) {
  return normalizePluginLogoUrl(cfg?.[entry.id]?.logoUrl || "");
}

/**
 * Link Google Drive hasil "Share" (drive.google.com/file/d/<id>/view) bukan URL
 * gambar — kalau dipakai di <img> hasilnya broken image. Ubah otomatis ke URL
 * gambar langsung (thumbnail endpoint) supaya admin bisa paste link apa pun.
 */
export function normalizePluginLogoUrl(raw: string) {
  const url = (raw || "").trim();
  if (!url) return "";
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    if (host === "drive.google.com" || host === "drive.usercontent.google.com") {
      const byPath = u.pathname.match(/\/file\/d\/([^/]+)/);
      const id = byPath?.[1] || u.searchParams.get("id") || "";
      if (id) return `https://drive.google.com/thumbnail?id=${id}&sz=w512`;
    }
    if (host === "dropbox.com" || host.endsWith(".dropbox.com")) {
      u.searchParams.set("raw", "1");
      u.searchParams.delete("dl");
      return u.toString();
    }
    return url;
  } catch {
    return url;
  }
}
