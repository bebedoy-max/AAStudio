import { createFileRoute } from "@tanstack/react-router";
import { LineChart, TrendingUp, Lightbulb, Sparkles } from "lucide-react";
import { DashboardShell, PageHero } from "@/components/dashboard/shell";
import { Card, GhostButton } from "@/components/dashboard/ui";
import { Chip } from "@/components/dashboard/os/section";
import { useActiveCharacterId } from "@/lib/ai-influencer/active-character";

export const Route = createFileRoute("/ai-influencer/analytics")({
  component: AnalyticsPage,
});

const METRICS = [
  "Views",
  "Reach",
  "Watch Time",
  "Retention",
  "CTR",
  "Like",
  "Comment",
  "Share",
  "Save",
  "Follower Growth",
  "Affiliate Click",
  "Conversion",
];

const INSIGHTS = [
  "Konten apa yang paling berhasil?",
  "Hook apa yang paling efektif?",
  "Outfit apa yang paling disukai?",
  "Background apa yang paling menarik?",
  "Jam posting terbaik?",
  "Platform terbaik?",
  "Caption terbaik?",
  "Affiliate terbaik?",
];

const RECOMMENDATIONS = [
  "Generate lebih banyak konten Cafe",
  "Kurangi Library",
  "Tambah Outfit Hitam",
  "Posting jam 20.00",
  "Gunakan caption pendek",
  "Gunakan hook pertanyaan",
];

function AnalyticsPage() {
  const [activeId] = useActiveCharacterId();

  return (
    <DashboardShell>
      <PageHero
        eyebrow="Module · Analytics"
        title="AI"
        highlight="Analytics"
        desc="AI membaca performa, memberi insight & rekomendasi, dan otomatis mengupdate Brain sehingga karakter makin pintar tiap posting."
      />

      {!activeId && (
        <Card>
          <div className="text-sm text-muted-foreground">
            Pilih karakter di menu <b>Character</b> untuk melihat analytics.
          </div>
        </Card>
      )}

      <Card title="Analytics" sub="Metrics real-time dari semua platform yang terhubung.">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {METRICS.map((m) => (
            <div key={m} className="rounded-xl border border-border/60 bg-card/40 p-3">
              <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground flex items-center gap-1">
                <LineChart className="h-3 w-3" /> {m}
              </div>
              <div className="font-display text-2xl mt-1">—</div>
              <div className="text-[10px] text-muted-foreground">Belum ada data</div>
            </div>
          ))}
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="AI Insight" sub="Jawaban dari AI setelah membaca semua data.">
          <ul className="space-y-2 text-sm">
            {INSIGHTS.map((q) => (
              <li key={q} className="flex items-start gap-2">
                <Sparkles className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                <div>
                  <div className="text-foreground/85">{q}</div>
                  <div className="text-xs text-muted-foreground">Menunggu data posting…</div>
                </div>
              </li>
            ))}
          </ul>
        </Card>

        <Card
          title="AI Recommendation"
          sub="Setiap rekomendasi bisa langsung meng-update Brain."
          right={
            <GhostButton className="!px-3 !py-1.5 text-xs">
              <TrendingUp className="h-3 w-3" /> Apply All to Brain
            </GhostButton>
          }
        >
          <div className="flex flex-wrap gap-2">
            {RECOMMENDATIONS.map((r) => (
              <Chip key={r} tone="primary">
                <Lightbulb className="h-3 w-3" /> {r}
              </Chip>
            ))}
          </div>
          <div className="mt-4 text-xs text-muted-foreground">
            Rekomendasi otomatis dihasilkan setelah minimal 7 posting terkumpul.
          </div>
        </Card>
      </div>
    </DashboardShell>
  );
}
