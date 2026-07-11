import { createFileRoute } from "@tanstack/react-router";
import { DashboardShell, PageHero } from "@/components/dashboard/shell";
import { LifeBuoy, BookOpen, MessageCircle, Mail } from "lucide-react";

const items = [
  { icon: BookOpen, title: "Dokumentasi", desc: "Panduan lengkap semua tool AATools." },
  { icon: MessageCircle, title: "Community", desc: "Diskusi & tips dari pengguna lain." },
  { icon: LifeBuoy, title: "Support", desc: "Tim support siap membantu Anda." },
  { icon: Mail, title: "Kontak", desc: "Email langsung untuk pertanyaan bisnis." },
];

export const Route = createFileRoute("/system/help")({
  head: () => ({ meta: [{ title: "Help — AATools" }, { name: "description", content: "Bantuan, dokumentasi, dan kontak dukungan AATools." }] }),
  component: () => (
    <DashboardShell>
      <PageHero eyebrow="System" title="Pusat" highlight="Bantuan" desc="Dokumentasi, community, dan support untuk semua tool AATools." />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {items.map((it) => (
          <div key={it.title} className="neumorph p-5 flex items-start gap-4">
            <div className="h-11 w-11 rounded-xl grid place-items-center text-primary-foreground shrink-0" style={{ background: "var(--gradient-neon)" }}>
              <it.icon className="h-5 w-5" />
            </div>
            <div>
              <div className="font-display text-base text-foreground">{it.title}</div>
              <div className="text-xs text-muted-foreground mt-1">{it.desc}</div>
            </div>
          </div>
        ))}
      </div>
    </DashboardShell>
  ),
});
