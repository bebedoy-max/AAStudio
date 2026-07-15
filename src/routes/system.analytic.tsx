import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { DashboardShell, PageHero } from "@/components/dashboard/shell";
import { Card } from "@/components/dashboard/ui";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useProjects } from "@/lib/dashboard/projects";
import {
  Users, Image as ImageIcon, CalendarRange, FolderKanban, Loader2, TrendingUp, Activity,
} from "lucide-react";

export const Route = createFileRoute("/system/analytic")({
  head: () => ({
    meta: [
      { title: "Analytic — AA Creative Studio" },
      { name: "description", content: "Statistik nyata dari aktivitas & aset yang Anda buat di AA Creative Studio." },
    ],
  }),
  component: AnalyticPage,
});

type Counts = { characters: number; assets: number; queue: number };
type Point = { day: string; count: number };

function AnalyticPage() {
  const { user, loading: authLoading } = useAuth();
  const projects = useProjects();
  const [loading, setLoading] = useState(true);
  const [counts, setCounts] = useState<Counts>({ characters: 0, assets: 0, queue: 0 });
  const [series, setSeries] = useState<Point[]>([]);
  const [recent, setRecent] = useState<{ kind: string; label: string; at: string }[]>([]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      setLoading(true);
      const since = new Date();
      since.setDate(since.getDate() - 29);
      const sinceIso = since.toISOString();

      const [c1, c2, c3, a1, a2, a3] = await Promise.all([
        supabase.from("ai_characters").select("id", { count: "exact", head: true }).eq("user_id", user.id),
        supabase.from("ai_influencer_assets").select("id", { count: "exact", head: true }).eq("user_id", user.id),
        supabase.from("ai_influencer_queue").select("id", { count: "exact", head: true }).eq("user_id", user.id),
        supabase.from("ai_characters").select("id, name, created_at").eq("user_id", user.id).gte("created_at", sinceIso).order("created_at", { ascending: false }).limit(50),
        supabase.from("ai_influencer_assets").select("id, kind, created_at").eq("user_id", user.id).gte("created_at", sinceIso).order("created_at", { ascending: false }).limit(200),
        supabase.from("ai_influencer_queue").select("id, idea, created_at").eq("user_id", user.id).gte("created_at", sinceIso).order("created_at", { ascending: false }).limit(200),
      ]);

      setCounts({ characters: c1.count ?? 0, assets: c2.count ?? 0, queue: c3.count ?? 0 });

      // Build 30-day daily series across all activity
      const buckets = new Map<string, number>();
      for (let i = 0; i < 30; i++) {
        const d = new Date();
        d.setDate(d.getDate() - (29 - i));
        buckets.set(d.toISOString().slice(0, 10), 0);
      }
      const add = (arr: any[] | null | undefined) => {
        (arr ?? []).forEach((r: any) => {
          const k = String(r.created_at ?? "").slice(0, 10);
          if (buckets.has(k)) buckets.set(k, (buckets.get(k) ?? 0) + 1);
        });
      };
      add(a1.data); add(a2.data); add(a3.data);
      setSeries(Array.from(buckets.entries()).map(([day, count]) => ({ day, count })));

      // Recent activity feed (mix, sorted)
      const feed: { kind: string; label: string; at: string }[] = [];
      (a1.data ?? []).forEach((r: any) => feed.push({ kind: "Character", label: r.name ?? "(tanpa nama)", at: r.created_at }));
      (a2.data ?? []).forEach((r: any) => feed.push({ kind: `Asset · ${r.kind ?? "-"}`, label: "Asset dibuat", at: r.created_at }));
      (a3.data ?? []).forEach((r: any) => feed.push({ kind: "Queue", label: r.idea ?? "(tanpa judul)", at: r.created_at }));
      feed.sort((a, b) => (a.at < b.at ? 1 : -1));
      setRecent(feed.slice(0, 10));

      setLoading(false);
    })();
  }, [user]);

  const total30 = useMemo(() => series.reduce((s, p) => s + p.count, 0), [series]);
  const prev30Ratio = useMemo(() => {
    if (series.length < 30) return 0;
    const first15 = series.slice(0, 15).reduce((s, p) => s + p.count, 0);
    const last15 = series.slice(15).reduce((s, p) => s + p.count, 0);
    if (first15 === 0) return last15 > 0 ? 100 : 0;
    return Math.round(((last15 - first15) / first15) * 100);
  }, [series]);

  if (authLoading) {
    return (
      <DashboardShell>
        <Card><div className="p-8 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div></Card>
      </DashboardShell>
    );
  }

  if (!user) {
    return (
      <DashboardShell>
        <PageHero eyebrow="System" title="Analytic" highlight="Overview" desc="Statistik aktivitas Anda." />
        <Card><div className="p-8 text-center text-sm text-muted-foreground">Login untuk melihat analytic Anda.</div></Card>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell>
      <PageHero
        eyebrow="System"
        title="Analytic"
        highlight="Aktivitas Anda"
        desc="Data nyata dari karakter, aset, konten planner, dan project yang telah Anda buat."
      />

      {loading ? (
        <Card><div className="p-8 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div></Card>
      ) : (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
            <Kpi icon={Users} label="Karakter" value={counts.characters} />
            <Kpi icon={ImageIcon} label="Aset (30 hari)" value={counts.assets} />
            <Kpi icon={CalendarRange} label="Ide di Planner" value={counts.queue} />
            <Kpi icon={FolderKanban} label="Project lokal" value={projects.length} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Chart */}
            <div className="lg:col-span-2">
              <Card
                title="Aktivitas 30 Hari Terakhir"
                sub={`Total ${total30} event · Pertumbuhan 15 hari terakhir vs 15 hari sebelumnya: ${prev30Ratio > 0 ? "+" : ""}${prev30Ratio}%`}
              >
                <SeriesChart data={series} />
                {total30 === 0 && (
                  <div className="text-xs text-muted-foreground text-center py-6">
                    Belum ada aktivitas dalam 30 hari terakhir. Mulai dari <b>Generate</b> atau <b>AI Influencer</b>.
                  </div>
                )}
              </Card>
            </div>

            {/* Recent */}
            <Card title="Aktivitas Terbaru" sub="10 event terakhir">
              {recent.length === 0 ? (
                <div className="text-xs text-muted-foreground py-4">Belum ada aktivitas.</div>
              ) : (
                <ul className="space-y-2">
                  {recent.map((r, i) => (
                    <li key={i} className="flex items-start gap-2.5 text-xs border-b border-border/40 pb-2 last:border-0">
                      <Activity className="h-3.5 w-3.5 text-primary mt-0.5 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <div className="text-foreground/90 truncate">{r.label}</div>
                        <div className="text-[10px] text-muted-foreground flex justify-between">
                          <span>{r.kind}</span>
                          <span>{new Date(r.at).toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          <div className="mt-4">
            <Card title="Sumber Data" sub="Analytic dihitung langsung dari database Anda — bukan angka simulasi.">
              <ul className="text-xs text-muted-foreground space-y-1.5 list-disc list-inside">
                <li><code className="text-foreground/80">ai_characters</code> — jumlah karakter yang Anda buat.</li>
                <li><code className="text-foreground/80">ai_influencer_assets</code> — aset gambar/video/referensi karakter.</li>
                <li><code className="text-foreground/80">ai_influencer_queue</code> — ide/konten yang dijadwalkan.</li>
                <li>Project lokal — workspace yang tersimpan di browser Anda.</li>
              </ul>
              <div className="text-[11px] text-muted-foreground mt-3 flex items-center gap-1.5">
                <TrendingUp className="h-3 w-3" />
                Angka bertambah secara otomatis setiap kali Anda men-generate sesuatu.
              </div>
            </Card>
          </div>
        </>
      )}
    </DashboardShell>
  );
}

function Kpi({ icon: Icon, label, value }: { icon: any; label: string; value: number }) {
  return (
    <div className="neumorph p-4">
      <div className="flex items-center gap-2">
        <div className="h-8 w-8 rounded-lg grid place-items-center text-primary-foreground" style={{ background: "var(--gradient-neon)" }}>
          <Icon className="h-4 w-4" />
        </div>
        <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">{label}</div>
      </div>
      <div className="mt-2 font-display text-3xl text-foreground">{value.toLocaleString("id-ID")}</div>
    </div>
  );
}

function SeriesChart({ data }: { data: Point[] }) {
  const w = 640;
  const h = 180;
  const pad = 24;
  const max = Math.max(1, ...data.map((d) => d.count));
  const step = (w - pad * 2) / Math.max(1, data.length - 1);
  const points = data.map((d, i) => {
    const x = pad + i * step;
    const y = h - pad - ((d.count / max) * (h - pad * 2));
    return { x, y, ...d };
  });
  const path = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
  const area = `${path} L ${points[points.length - 1]?.x ?? w - pad} ${h - pad} L ${pad} ${h - pad} Z`;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-48">
      <defs>
        <linearGradient id="a-fill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="var(--neon-pink)" stopOpacity="0.45" />
          <stop offset="100%" stopColor="var(--neon-pink)" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0.25, 0.5, 0.75].map((r) => (
        <line key={r} x1={pad} x2={w - pad} y1={pad + (h - pad * 2) * r} y2={pad + (h - pad * 2) * r}
          stroke="oklch(0.35 0.06 275 / 0.25)" strokeDasharray="3 5" />
      ))}
      <path d={area} fill="url(#a-fill)" />
      <path d={path} fill="none" stroke="var(--neon-pink)" strokeWidth="2" style={{ filter: "drop-shadow(0 0 4px var(--neon-pink))" }} />
      {points.filter((_, i) => i % 5 === 0 || i === points.length - 1).map((p, i) => (
        <text key={i} x={p.x} y={h - 6} textAnchor="middle" fontSize="9" fill="oklch(0.65 0.05 265)">
          {p.day.slice(5)}
        </text>
      ))}
    </svg>
  );
}
