import { Link } from "@tanstack/react-router";
import {
  Move3d,
  BookText,
  Package,
  Shirt,
  ImagePlay,
  Scissors,
  Newspaper,
  ArrowRight,
} from "lucide-react";
import { Chip } from "./section";
import { useProviders } from "@/lib/dashboard/provider-health";
import { useNotifications } from "@/lib/stores/notifications";

type Action = {
  id: string;
  title: string;
  desc: string;
  icon: React.ComponentType<{ className?: string }>;
  route: string;
  provider: string;
  soon?: boolean;
};

const ACTIONS: Action[] = [
  {
    id: "motion",
    title: "Motion Control",
    desc: "Character & tarian dari video referensi",
    icon: Move3d,
    route: "/generate/motion",
    provider: "Kling / Wavespeed",
  },
  {
    id: "narrative",
    title: "Narrative Video",
    desc: "Naratif what-if · edukasi · dokumenter",
    icon: BookText,
    route: "/generate/naratif",
    provider: "GPT / Gemini",
  },
  {
    id: "storyboard",
    title: "Product Storyboard",
    desc: "Iklan produk multi-scene untuk affiliate",
    icon: Package,
    route: "/generate/storyboard",
    provider: "Gemini Image",
  },
  {
    id: "fashion",
    title: "Bulk Fashion",
    desc: "Model apparel batch dari 1 produk",
    icon: Shirt,
    route: "/generate/bulk-fashion",
    provider: "Gemini Image",
  },
  {
    id: "i2v",
    title: "Image to Video",
    desc: "Animasikan single image → clip pendek",
    icon: ImagePlay,
    route: "/generate/image-to-video",
    provider: "Wavespeed",
  },
  {
    id: "clipper",
    title: "Auto Clipper",
    desc: "Potong long-form ke shorts otomatis",
    icon: Scissors,
    route: "/generate/naratif",
    provider: "Planned",
    soon: true,
  },
  {
    id: "news",
    title: "News to Video",
    desc: "Berita → naratif → video pendek",
    icon: Newspaper,
    route: "/generate/naratif",
    provider: "Planned",
    soon: true,
  },
];

export function QuickActions() {
  const providers = useProviders();
  const { items } = useNotifications();
  const runningTotal = items.filter((n) => n.status === "running").length;

  function statusFor(actionId: string): { text: string; tone: "success" | "warn" | "default" | "primary"; queue: number } {
    const cat: Record<string, string> = {
      motion: "video",
      narrative: "text",
      storyboard: "image",
      fashion: "image",
      i2v: "video",
      clipper: "video",
      news: "text",
    };
    const c = cat[actionId];
    const relevant = providers.filter((p) => p.category === c);
    const healthy = relevant.some((p) => p.status === "healthy");
    const queue = relevant.reduce((s, p) => s + p.queue, 0);
    if (healthy) return { text: "Healthy", tone: "success", queue };
    if (relevant.some((p) => p.status === "fallback")) return { text: "Fallback", tone: "warn", queue };
    return { text: "No key", tone: "default", queue };
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3">
      {ACTIONS.map((a) => {
        const Icon = a.icon;
        const st = statusFor(a.id);
        return (
          <Link
            key={a.id}
            to={a.route}
            className="group relative overflow-hidden rounded-2xl border border-border bg-card/40 p-4 hover-scale hover:border-primary/50 transition"
          >
            <div
              aria-hidden
              className="absolute -top-12 -right-12 h-32 w-32 rounded-full opacity-0 group-hover:opacity-30 blur-2xl transition"
              style={{ background: "var(--gradient-neon)" }}
            />
            <div className="relative flex items-start gap-3">
              <div
                className="h-10 w-10 grid place-items-center rounded-xl text-primary-foreground shrink-0"
                style={{ background: "var(--gradient-neon)" }}
              >
                <Icon className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <div className="font-display text-sm text-foreground truncate">{a.title}</div>
                  {a.soon && <Chip>Soon</Chip>}
                </div>
                <div className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">{a.desc}</div>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 transition shrink-0" />
            </div>
            <div className="relative mt-3 flex items-center gap-2 flex-wrap">
              <Chip tone={st.tone === "default" ? "default" : st.tone}>{st.text}</Chip>
              <Chip>{a.provider}</Chip>
              {st.queue > 0 && <Chip tone="primary">Queue {st.queue}</Chip>}
              {runningTotal > 0 && <Chip tone="warn">{runningTotal} running</Chip>}
            </div>
          </Link>
        );
      })}
    </div>
  );
}
