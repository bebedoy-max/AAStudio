import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { DashboardShell, PageHero } from "@/components/dashboard/shell";
import { Card } from "@/components/dashboard/ui";
import {
  getAdminStats, getAdminDetail,
  type AdminCounts, type AdminDetailKey, type AdminDetailRow,
} from "@/lib/admin/stats.functions";
import {
  Loader2, Users, ShieldCheck, Wallet, Receipt, LineChart as LineChartIcon,
  SlidersHorizontal, BookText, Video, Image as ImageIcon, Sparkles, Activity, Landmark,
  Radio, TrendingUp, ArrowRight, KeyRound, Crown, X,
} from "lucide-react";


export const Route = createFileRoute("/admin/")({
  head: () => ({
    meta: [
      { title: "Admin Dashboard — AA Creative Studio" },
      { name: "description", content: "Overview realtime aktivitas platform, statistik konten, dan akses cepat ke seluruh modul admin." },
    ],
  }),
  component: AdminDashboardPage,
});

type Counts = AdminCounts;

type KindPoint = { kind: string; count: number };
type DayPoint = { day: string; count: number };


function AdminDashboardPage() {
  return (
    <DashboardShell>
      <PageHero
        eyebrow="Admin"
        title="Command"
        highlight="Dashboard"
        desc="Ringkasan realtime platform — klik salah satu kartu untuk masuk ke modul detail."
      />
      <Gate />
    </DashboardShell>
  );
}

function Gate() {
  const { loading, isAdmin } = useAuth();
  if (loading) {
    return <Card><div className="p-8 flex items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div></Card>;
  }
  if (!isAdmin) {
    return (
      <Card>
        <div className="p-8 text-center">
          <ShieldCheck className="h-8 w-8 text-muted-foreground mx-auto" />
          <div className="mt-3 font-display text-lg">Akses ditolak</div>
          <p className="mt-1 text-sm text-muted-foreground">Halaman ini hanya untuk admin.</p>
        </div>
      </Card>
    );
  }
  return <Body />;
}

type DetailKey = AdminDetailKey;

function Body() {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [c, setC] = useState<Counts>({
    users: 0, paidUsers: 0, onlineUsers: 0, totalAssets: 0, totalVideos: 0,
    totalImages: 0, totalUploads: 0, pendingRequests: 0, approvedTx: 0,
    activityToday: 0, generateToday: 0,
  });
  const [byKind, setByKind] = useState<KindPoint[]>([]);
  const [series, setSeries] = useState<DayPoint[]>([]);
  const [tick, setTick] = useState(0);
  const [lastUpdate, setLastUpdate] = useState<Date>(() => new Date());
  const [detail, setDetail] = useState<DetailKey | null>(null);
  const fetchStats = useServerFn(getAdminStats);

  // Fast polling + realtime subscriptions so the dashboard reflects
  // activity immediately (no 5-minute or 30-second wait).
  useEffect(() => {
    const iv = setInterval(() => setTick((t) => t + 1), 10_000);
    let deb: ReturnType<typeof setTimeout> | null = null;
    const bump = () => {
      if (deb) clearTimeout(deb);
      deb = setTimeout(() => setTick((t) => t + 1), 400);
    };
    const ch = supabase
      .channel("admin-dashboard-live")
      .on("postgres_changes" as never, { event: "*", schema: "public", table: "user_active_sessions" } as never, bump)
      .on("postgres_changes" as never, { event: "INSERT", schema: "public", table: "user_activity_logs" } as never, bump)
      .on("postgres_changes" as never, { event: "*", schema: "public", table: "cloud_files" } as never, bump)
      .on("postgres_changes" as never, { event: "*", schema: "public", table: "purchase_requests" } as never, bump)
      .subscribe();
    return () => {
      clearInterval(iv);
      if (deb) clearTimeout(deb);
      supabase.removeChannel(ch);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stats = await fetchStats();
        if (cancelled) return;
        setC(stats.counts);
        setByKind(stats.byMenu);
        setSeries(stats.series);
        setErr(null);
      } catch (e) {
        if (!cancelled) setErr((e as Error).message || "Gagal memuat statistik.");
      } finally {
        if (!cancelled) {
          setLastUpdate(new Date());
          setLoading(false);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [tick, fetchStats]);

  const top = byKind[0];
  const total30 = useMemo(() => series.reduce((s, p) => s + p.count, 0), [series]);
  const growth = useMemo(() => {
    if (series.length < 30) return 0;
    const a = series.slice(0, 15).reduce((s, p) => s + p.count, 0);
    const b = series.slice(15).reduce((s, p) => s + p.count, 0);
    if (a === 0) return b > 0 ? 100 : 0;
    return Math.round(((b - a) / a) * 100);
  }, [series]);

  if (loading) {
    return <Card><div className="p-8 flex items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div></Card>;
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Live pulse */}
      <div className="flex flex-wrap items-center gap-2 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
        <span className="inline-flex items-center gap-1.5 text-primary">
          <Radio className="h-3 w-3 animate-pulse" /> Realtime
        </span>
        <span>· data asli dari registry cloud</span>
        <span>· update terakhir {lastUpdate.toLocaleTimeString("id-ID")}</span>
      </div>

      {err && (
        <Card><div className="p-4 text-xs text-destructive">Gagal memuat statistik: {err}</div></Card>
      )}

      {/* KPI Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Kpi icon={Users} label="Total User" value={c.users} accent="Terdaftar" onClick={() => setDetail("users")} />
        <Kpi icon={Radio} label="Online Sekarang" value={c.onlineUsers} accent="Live · heartbeat 2m" pulse onClick={() => setDetail("onlineUsers")} />
        <Kpi icon={Crown} label="Paid User" value={c.paidUsers} accent="VIP + VVIP" onClick={() => setDetail("paidUsers")} />
        <Kpi icon={Video} label="Video Generated" value={c.totalVideos} accent="Tersimpan di cloud" onClick={() => setDetail("totalVideos")} />
        <Kpi icon={ImageIcon} label="Image Generated" value={c.totalImages} accent="Tersimpan di cloud" onClick={() => setDetail("totalImages")} />
        <Kpi icon={Sparkles} label="Total Aset" value={c.totalAssets} accent="Generate + upload" onClick={() => setDetail("totalAssets")} />
        <Kpi icon={KeyRound} label="File Upload User" value={c.totalUploads} accent="Referensi & input" onClick={() => setDetail("totalUploads")} />
        <Kpi icon={TrendingUp} label="Generate Hari Ini" value={c.generateToday} accent="Semua menu" onClick={() => setDetail("generateToday")} />
        <Kpi icon={Receipt} label="Request Pending" value={c.pendingRequests} accent="Perlu review" tone={c.pendingRequests > 0 ? "warn" : "ok"} onClick={() => setDetail("pendingRequests")} />
        <Kpi icon={Activity} label="Aktivitas Hari Ini" value={c.activityToday} accent="Semua user" onClick={() => setDetail("activityToday")} />
      </div>



      {/* Main content: chart + top kind */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2 flex">
          <Card
            className="flex-1 flex flex-col"
            title="Generate 30 Hari Terakhir"
            sub={`Total ${total30} aset · Pertumbuhan 15 hari terakhir vs 15 hari sebelumnya: ${growth > 0 ? "+" : ""}${growth}%`}
          >
            <SeriesChart data={series} />
            {total30 === 0 && (
              <div className="text-xs text-muted-foreground text-center py-6">Belum ada aset di-generate 30 hari terakhir.</div>
            )}
          </Card>
        </div>

        <Card className="h-full" title="Konten Terpopuler" sub="Jenis yang paling banyak di-generate">
          {byKind.length === 0 ? (
            <div className="text-xs text-muted-foreground py-4">Belum ada data.</div>
          ) : (
            <>
              {top && (
                <div className="rounded-xl border border-primary/30 bg-primary/10 p-3 mb-3">
                  <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Juara</div>
                  <div className="mt-1 font-display text-xl text-foreground capitalize truncate">{top.kind}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{top.count.toLocaleString("id-ID")} kali di-generate</div>
                </div>
              )}
              <ul className="space-y-2">
                {byKind.map((k) => {
                  const pct = top ? Math.round((k.count / top.count) * 100) : 0;
                  return (
                    <li key={k.kind} className="text-xs">
                      <div className="flex justify-between text-foreground/90 capitalize">
                        <span className="truncate">{k.kind}</span>
                        <span className="font-mono text-muted-foreground">{k.count.toLocaleString("id-ID")}</span>
                      </div>
                      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-white/5">
                        <div className="h-full bg-primary/70" style={{ width: `${pct}%` }} />
                      </div>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </Card>
      </div>

      {/* Modules */}
      <div>
        <div className="mb-3 flex items-end justify-between">
          <div>
            <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Explore</div>
            <div className="font-display text-lg text-foreground">Modul Admin</div>
          </div>
          <div className="text-xs text-muted-foreground flex items-center gap-1"><TrendingUp className="h-3 w-3" /> klik untuk detail</div>
        </div>
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          <ModuleCard to="/admin/users" icon={Users} title="Kelola User" desc={`${c.users} user terdaftar · atur role & akses`} />
          <ModuleCard to="/admin/requests" icon={Receipt} title="Request Pembelian" desc={`${c.pendingRequests} menunggu review`} highlight={c.pendingRequests > 0} />
          <ModuleCard to="/admin/payments" icon={Wallet} title="Metode Pembayaran & Harga" desc="Konfigurasi gateway & tarif fitur" />
          <ModuleCard to="/admin/transactions" icon={LineChartIcon} title="Laporan Transaksi" desc={`${c.approvedTx} transaksi disetujui`} />
          <ModuleCard to="/admin/access" icon={SlidersHorizontal} title="Pengaturan Halaman" desc="Aktif / non-aktif halaman & feature flag" />
          <ModuleCard to="/admin/activity-log" icon={BookText} title="Log Aktivitas" desc={`${c.activityToday} event hari ini`} />
          <ModuleCard to="/admin/token-bank" icon={Landmark} title="Token Bank" desc="Kirim / hapus banyak key sekaligus" />
        </div>
      </div>
      {detail && <KpiDetailModal type={detail} onClose={() => setDetail(null)} />}
    </div>
  );
}


function Kpi({
  icon: Icon, label, value, accent, tone = "ok", pulse, onClick,
}: {
  icon: any; label: string; value: number; accent?: string; tone?: "ok" | "warn"; pulse?: boolean; onClick?: () => void;
}) {
  const bg = tone === "warn" && value > 0
    ? "linear-gradient(135deg, oklch(0.7 0.19 30), oklch(0.65 0.2 15))"
    : "var(--gradient-neon)";
  const clickable = typeof onClick === "function";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!clickable}
      className={
        "neumorph p-4 relative overflow-hidden text-left w-full " +
        (clickable ? "cursor-pointer hover:-translate-y-0.5 hover:border-primary/50 transition" : "cursor-default")
      }
      title={clickable ? "Lihat detail" : undefined}
    >
      <div className="flex items-center gap-2">
        <div className="h-8 w-8 rounded-lg grid place-items-center text-primary-foreground shrink-0" style={{ background: bg }}>
          <Icon className={"h-4 w-4 " + (pulse ? "animate-pulse" : "")} />
        </div>
        <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground truncate">{label}</div>
      </div>
      <div className="mt-2 font-display text-2xl md:text-3xl text-foreground">{value.toLocaleString("id-ID")}</div>
      {accent && <div className="text-[10px] text-muted-foreground mt-0.5 truncate">{accent}</div>}
    </button>
  );
}


function ModuleCard({
  to, icon: Icon, title, desc, highlight,
}: { to: string; icon: any; title: string; desc: string; highlight?: boolean }) {
  return (
    <Link
      to={to}
      className={
        "group neumorph p-4 flex items-start gap-3 transition hover:border-primary/50 hover:-translate-y-0.5 " +
        (highlight ? "ring-1 ring-primary/50" : "")
      }
    >
      <div className="h-10 w-10 rounded-xl grid place-items-center shrink-0 text-primary-foreground" style={{ background: "var(--gradient-neon)" }}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <div className="font-display text-sm text-foreground truncate">{title}</div>
          {highlight && <span className="text-[9px] font-mono uppercase px-1.5 py-0.5 rounded-full bg-primary/20 text-primary">Perlu aksi</span>}
        </div>
        <div className="text-xs text-muted-foreground mt-0.5">{desc}</div>
      </div>
      <ArrowRight className="h-4 w-4 text-muted-foreground mt-1 group-hover:text-primary group-hover:translate-x-0.5 transition" />
    </Link>
  );
}

function SeriesChart({ data }: { data: DayPoint[] }) {
  const w = 640, h = 180, pad = 24;
  const max = Math.max(1, ...data.map((d) => d.count));
  const step = (w - pad * 2) / Math.max(1, data.length - 1);
  const points = data.map((d, i) => ({
    x: pad + i * step,
    y: h - pad - (d.count / max) * (h - pad * 2),
    ...d,
  }));
  const path = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
  const area = `${path} L ${points[points.length - 1]?.x ?? w - pad} ${h - pad} L ${pad} ${h - pad} Z`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-48">
      <defs>
        <linearGradient id="ad-fill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="var(--neon-pink)" stopOpacity="0.45" />
          <stop offset="100%" stopColor="var(--neon-pink)" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0.25, 0.5, 0.75].map((r) => (
        <line key={r} x1={pad} x2={w - pad} y1={pad + (h - pad * 2) * r} y2={pad + (h - pad * 2) * r}
          stroke="oklch(0.35 0.06 275 / 0.25)" strokeDasharray="3 5" />
      ))}
      <path d={area} fill="url(#ad-fill)" />
      <path d={path} fill="none" stroke="var(--neon-pink)" strokeWidth="2" style={{ filter: "drop-shadow(0 0 4px var(--neon-pink))" }} />
      {points.filter((_, i) => i % 5 === 0 || i === points.length - 1).map((p, i) => (
        <text key={i} x={p.x} y={h - 6} textAnchor="middle" fontSize="9" fill="oklch(0.65 0.05 265)">
          {p.day.slice(5)}
        </text>
      ))}
    </svg>
  );
}

type DetailRow = AdminDetailRow;

// meta dari server berupa ISO timestamp — format di client supaya identik
// dengan tampilan pada halaman Log Aktivitas (zona waktu perangkat user).
function fmtMeta(meta?: string): string {
  if (!meta) return "";
  const t = Date.parse(meta);
  if (Number.isNaN(t)) return meta;
  return new Date(t).toLocaleString("id-ID", { dateStyle: "short", timeStyle: "medium" });
}

const DETAIL_TITLES: Record<DetailKey, { title: string; subtitle: string }> = {
  users: { title: "Total User", subtitle: "30 user terbaru terdaftar" },
  onlineUsers: { title: "User Online Sekarang", subtitle: "Heartbeat < 2 menit terakhir" },
  paidUsers: { title: "Paid User", subtitle: "User dengan tag VIP / VVIP aktif" },
  totalVideos: { title: "Video Generated", subtitle: "30 video hasil generate terbaru (registry cloud)" },
  totalImages: { title: "Image Generated", subtitle: "30 image hasil generate terbaru (registry cloud)" },
  totalAssets: { title: "Total Aset", subtitle: "30 file terbaru (generate + upload)" },
  totalUploads: { title: "File Upload User", subtitle: "30 file referensi/input terbaru" },
  generateToday: { title: "Generate Hari Ini", subtitle: "Semua hasil generate sejak 00.00" },
  pendingRequests: { title: "Request Pending", subtitle: "Menunggu review admin" },
  activityToday: { title: "Aktivitas Hari Ini", subtitle: "Event sejak 00.00" },
};

function KpiDetailModal({ type, onClose }: { type: DetailKey; onClose: () => void }) {
  const [rows, setRows] = useState<DetailRow[]>([]);
  const [loading, setLoading] = useState(true);
  const info = DETAIL_TITLES[type];
  const fetchDetail = useServerFn(getAdminDetail);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const data = await fetchDetail({ data: { type } });
        if (alive) setRows(data);
      } catch {
        if (alive) setRows([]);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [type, fetchDetail]);


  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[80] grid place-items-center bg-background/80 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="relative w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-2xl border border-border bg-card shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 z-10 flex items-start gap-3 border-b border-border/60 bg-card/95 backdrop-blur p-4">
          <div className="flex-1 min-w-0">
            <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Detail</div>
            <div className="font-display text-lg text-foreground">{info.title}</div>
            <div className="text-xs text-muted-foreground mt-0.5">{info.subtitle}</div>
          </div>
          <button onClick={onClose} className="h-8 w-8 grid place-items-center rounded-full border border-border hover:bg-sidebar-accent/30" aria-label="Tutup">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-4">
          {loading ? (
            <div className="p-8 grid place-items-center"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
          ) : rows.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">Tidak ada data.</div>
          ) : (
            <div className="flex flex-col gap-1.5">
              {rows.map((r) => (
                <div key={r.id} className="rounded-xl border border-border/60 bg-card/40 p-3 flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-sm text-foreground truncate">{r.primary}</div>
                    {r.secondary && <div className="text-xs text-muted-foreground truncate">{r.secondary}</div>}
                  </div>
                  {r.badge && (
                    <span className="text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded-full border border-primary/40 bg-primary/10 text-primary">{r.badge}</span>
                  )}
                  {r.meta && (
                    <div className="text-[11px] font-mono text-muted-foreground whitespace-nowrap">{fmtMeta(r.meta)}</div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

