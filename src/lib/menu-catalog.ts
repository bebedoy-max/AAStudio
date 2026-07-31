// =============================================================================
// Menu catalog — sumber tunggal daftar menu yang bisa di-atur admin
// (Pengaturan Halaman). Setiap menu baru cukup di-append di sini dan otomatis
// muncul di halaman Admin → Pengaturan Halaman.
//
// Key harus stabil dan dipakai sebagai `permKey` di sidebar & tempat lain
// yang memanggil `isFeatureEnabled` / `isFeatureVisible`.
// =============================================================================

export type MenuCatalogEntry = {
  key: string;
  label: string;
  group: string;
  url: string;
};

export const MENU_CATALOG: MenuCatalogEntry[] = [
  // AI Influencer
  { key: "ai-influencer.studio", label: "AI Influencer Studio", group: "AI Influencer", url: "/ai-influencer" },

  // Clip nMix
  { key: "mixing.clipper", label: "AI Clipper", group: "Clip nMix", url: "/mixing/clipper" },
  { key: "mixing.dubbing", label: "AI Dubber", group: "Clip nMix", url: "/mixing/dubbing" },

  // Generate
  { key: "generate.motion", label: "Motion Control", group: "Generate", url: "/generate/motion" },
  { key: "generate.bulk-fashion", label: "Bulk Fashion Generator", group: "Generate", url: "/generate/bulk-fashion" },
  { key: "generate.image-to-video", label: "Image To Video", group: "Generate", url: "/generate/image-to-video" },
  { key: "generate.upscaler", label: "Upscaler / Enhance", group: "Generate", url: "/generate/upscaler" },
  { key: "generate.leonardo", label: "Text to Image", group: "Generate", url: "/generate/leonardo" },
  { key: "generate.text-to-video", label: "Text to Video", group: "Generate", url: "/generate/text-to-video" },

  // Storyboard
  { key: "generate.storyboard", label: "Produk Storyboard", group: "Storyboard", url: "/generate/storyboard" },
  { key: "generate.naratif", label: "Naratif Video Maker", group: "Storyboard", url: "/generate/naratif" },

  // Reff EDIT
  { key: "reff-edit.image", label: "Image Reference Edit", group: "Reff EDIT", url: "/reff-edit/image" },
  { key: "reff-edit.video", label: "Video Reference Edit", group: "Reff EDIT", url: "/reff-edit/video" },
  { key: "reff-edit.library", label: "Reference Library", group: "Reff EDIT", url: "/reff-edit/library" },
  { key: "reff-edit.history", label: "Edit History", group: "Reff EDIT", url: "/reff-edit/history" },

  // Manage
  { key: "manage.tokens", label: "Token / API Manager", group: "Manage", url: "/manage/tokens" },
  { key: "manage.routing", label: "Routing Provider", group: "Manage", url: "/manage/routing" },
  { key: "manage.accounts", label: "Account", group: "Manage", url: "/manage/accounts" },

  // System
  { key: "system.analytic", label: "Analytic", group: "System", url: "/system/analytic" },
  { key: "system.cloud", label: "Cloud Storage", group: "System", url: "/system/cloud" },
  { key: "system.settings", label: "Pengaturan", group: "System", url: "/system/settings" },
  { key: "system.help", label: "Help", group: "System", url: "/system/help" },
];

export function menuCatalogByGroup(): Record<string, MenuCatalogEntry[]> {
  const out: Record<string, MenuCatalogEntry[]> = {};
  for (const m of MENU_CATALOG) (out[m.group] ||= []).push(m);
  return out;
}