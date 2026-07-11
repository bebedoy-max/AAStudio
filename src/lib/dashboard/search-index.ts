// Global search index — routes, features, projects. Used by header search.
import { ALL_ROUTE_KEYS } from "@/lib/auth-context";
import type { Project } from "@/lib/dashboard/projects";

export type SearchItem = {
  id: string;
  label: string;
  description?: string;
  route: string;
  group: string;
  keywords: string[];
};

const STATIC: SearchItem[] = [
  { id: "home", label: "Creative Dashboard", description: "Command center, riset, workflow, project memory", route: "/", group: "Dashboard", keywords: ["dashboard", "home", "beranda", "command", "brain"] },
  { id: "profile", label: "Profil Saya", route: "/profile", group: "Akun", keywords: ["profile", "akun", "pengguna", "avatar"] },
  { id: "tokens", label: "Token / API Manager", description: "Kelola API key Gemini, ElevenLabs, Weavy, dll.", route: "/manage/tokens", group: "Manage", keywords: ["api", "key", "token", "gemini", "openai", "elevenlabs", "wavespeed", "weavy", "magnific"] },
  { id: "routing", label: "Routing Provider", description: "Pilih provider untuk image, video, voice, motion", route: "/manage/routing", group: "Manage", keywords: ["routing", "provider", "model", "image", "video", "voice", "motion"] },
  { id: "analytic", label: "Analytic", route: "/system/analytic", group: "System", keywords: ["analytic", "stat", "statistik"] },
  { id: "settings", label: "Pengaturan", route: "/system/settings", group: "System", keywords: ["setting", "pengaturan", "config"] },
  { id: "help", label: "Help", route: "/system/help", group: "System", keywords: ["help", "bantuan", "faq"] },
  { id: "admin-users", label: "Kelola User", route: "/admin", group: "Admin", keywords: ["admin", "user", "kelola", "pengguna", "role"] },
  { id: "admin-requests", label: "Request Pembelian", route: "/admin/requests", group: "Admin", keywords: ["admin", "request", "pembelian", "verifikasi", "purchase"] },
  { id: "admin-payments", label: "Metode Pembayaran & Harga", route: "/admin/payments", group: "Admin", keywords: ["admin", "pembayaran", "harga", "qris", "bank", "ewallet", "price"] },
];

const FEATURE_ROUTES: Record<string, string> = {
  "generate.motion": "/generate/motion",
  "generate.storyboard": "/generate/storyboard",
  "generate.bulk-fashion": "/generate/bulk-fashion",
  "generate.image-to-video": "/generate/image-to-video",
  "generate.naratif": "/generate/naratif",
};

export function buildSearchIndex(projects: Project[], opts: { isAdmin: boolean; permissions: string[] }): SearchItem[] {
  const items: SearchItem[] = [];

  for (const r of STATIC) {
    if (r.group === "Admin" && !opts.isAdmin) continue;
    items.push(r);
  }

  for (const f of ALL_ROUTE_KEYS) {
    const route = FEATURE_ROUTES[f.key];
    if (!route) continue;
    items.push({
      id: `feat-${f.key}`,
      label: f.label,
      description: `Fitur ${f.group}`,
      route,
      group: f.group,
      keywords: [f.key, f.label.toLowerCase(), "generate", f.group.toLowerCase()],
    });
  }

  for (const p of projects) {
    items.push({
      id: `proj-${p.id}`,
      label: p.title,
      description: `Project · ${p.niche ?? p.kind}`,
      route: p.route ?? "/",
      group: "Project",
      keywords: [p.title.toLowerCase(), p.kind, p.niche?.toLowerCase() ?? "", "project", "hasil", "generate"],
    });
  }

  return items;
}

export function searchItems(items: SearchItem[], query: string, limit = 12): SearchItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const tokens = q.split(/\s+/);
  const scored = items.map((it) => {
    const hay = (it.label + " " + (it.description ?? "") + " " + it.keywords.join(" ") + " " + it.group).toLowerCase();
    let score = 0;
    for (const t of tokens) {
      if (!hay.includes(t)) return { it, score: -1 };
      if (it.label.toLowerCase().startsWith(t)) score += 5;
      if (it.label.toLowerCase().includes(t)) score += 3;
      if (it.keywords.some((k) => k.startsWith(t))) score += 2;
      score += 1;
    }
    return { it, score };
  });
  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => s.it);
}