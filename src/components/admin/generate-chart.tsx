// Grafik "Generate 30 Hari Terakhir" — interaktif, animatif, dengan beberapa
// mode tampilan (area, bar, kumulatif) dan rentang waktu (7 / 14 / 30 hari).
import { useEffect, useMemo, useRef, useState } from "react";
import { AreaChart as AreaIcon, BarChart3, TrendingUp, Activity, CalendarRange } from "lucide-react";

export type DayPoint = { day: string; count: number };
type Mode = "area" | "bar" | "cumulative";
type Range = 7 | 14 | 30;

const MODES: { key: Mode; label: string; icon: any }[] = [
  { key: "area", label: "Area", icon: AreaIcon },
  { key: "bar", label: "Bar", icon: BarChart3 },
  { key: "cumulative", label: "Kumulatif", icon: TrendingUp },
];

const RANGES: Range[] = [7, 14, 30];

function fmtDay(d: string) {
  const t = Date.parse(d);
  if (Number.isNaN(t)) return d.slice(5);
  return new Date(t).toLocaleDateString("id-ID", { day: "numeric", month: "short" });
}

export function GenerateChart({ data }: { data: DayPoint[] }) {
  const [mode, setMode] = useState<Mode>("area");
  const [range, setRange] = useState<Range>(30);
  const [hover, setHover] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [boxW, setBoxW] = useState(640);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 0;
      if (w > 0) setBoxW(Math.round(w));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const sliced = useMemo(() => data.slice(Math.max(0, data.length - range)), [data, range]);

  const shown = useMemo(() => {
    if (mode !== "cumulative") return sliced;
    let acc = 0;
    return sliced.map((p) => ({ day: p.day, count: (acc += p.count) }));
  }, [sliced, mode]);

  const stats = useMemo(() => {
    const total = sliced.reduce((s, p) => s + p.count, 0);
    const avg = sliced.length ? total / sliced.length : 0;
    let peak = sliced[0] ?? { day: "-", count: 0 };
    for (const p of sliced) if (p.count > peak.count) peak = p;
    const half = Math.floor(sliced.length / 2);
    const a = sliced.slice(0, half).reduce((s, p) => s + p.count, 0);
    const b = sliced.slice(half).reduce((s, p) => s + p.count, 0);
    const growth = a === 0 ? (b > 0 ? 100 : 0) : Math.round(((b - a) / a) * 100);
    const active = sliced.filter((p) => p.count > 0).length;
    return { total, avg, peak, growth, active };
  }, [sliced]);

  const W = Math.max(320, boxW), H = 200, PADX = 30, PADT = 18, PADB = 28;
  const max = Math.max(1, ...shown.map((d) => d.count));
  const innerW = W - PADX * 2;
  const innerH = H - PADT - PADB;
  const n = shown.length;
  const step = innerW / Math.max(1, n - 1);
  const xAt = (i: number) => PADX + i * step;
  const yAt = (v: number) => PADT + innerH - (v / max) * innerH;

  const pts = shown.map((d, i) => ({ x: xAt(i), y: yAt(d.count), ...d }));

  // Smooth curve (Catmull-Rom -> bezier)
  const line = useMemo(() => {
    if (pts.length === 0) return "";
    if (pts.length < 3) return pts.map((p, i) => `${i ? "L" : "M"} ${p.x} ${p.y}`).join(" ");
    let d = `M ${pts[0].x} ${pts[0].y}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] ?? pts[i];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = pts[i + 2] ?? p2;
      const c1x = p1.x + (p2.x - p0.x) / 6, c1y = p1.y + (p2.y - p0.y) / 6;
      const c2x = p2.x - (p3.x - p1.x) / 6, c2y = p2.y - (p3.y - p1.y) / 6;
      d += ` C ${c1x.toFixed(1)} ${c1y.toFixed(1)}, ${c2x.toFixed(1)} ${c2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
    }
    return d;
  }, [pts]);

  const area = pts.length ? `${line} L ${pts[pts.length - 1].x} ${PADT + innerH} L ${pts[0].x} ${PADT + innerH} Z` : "";

  // re-trigger draw animation on mode/range change
  const [animKey, setAnimKey] = useState(0);
  useEffect(() => { setAnimKey((k) => k + 1); }, [mode, range, data]);

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg || n === 0) return;
    const rect = svg.getBoundingClientRect();
    const rel = ((e.clientX - rect.left) / rect.width) * W;
    const i = Math.round((rel - PADX) / step);
    setHover(Math.min(n - 1, Math.max(0, i)));
  };

  const hp = hover != null ? pts[hover] : null;
  const barW = Math.max(3, innerW / Math.max(1, n) - 4);

  return (
    <div className="flex flex-col gap-3">
      {/* Controls */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex rounded-lg border border-border/60 bg-muted/30 p-0.5">
          {MODES.map((m) => (
            <button
              key={m.key}
              type="button"
              onClick={() => setMode(m.key)}
              className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-medium transition ${
                mode === m.key ? "bg-primary/20 text-primary" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <m.icon className="h-3.5 w-3.5" /> {m.label}
            </button>
          ))}
        </div>
        <div className="inline-flex items-center gap-1 rounded-lg border border-border/60 bg-muted/30 p-0.5">
          <CalendarRange className="h-3.5 w-3.5 text-muted-foreground ml-1.5" />
          {RANGES.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRange(r)}
              className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition ${
                range === r ? "bg-primary/20 text-primary" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {r}h
            </button>
          ))}
        </div>
      </div>

      {/* Mini stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <MiniStat label="Total" value={stats.total.toLocaleString("id-ID")} />
        <MiniStat label="Rata-rata / hari" value={stats.avg.toFixed(1)} />
        <MiniStat label="Puncak" value={`${stats.peak?.count ?? 0}`} sub={stats.peak ? fmtDay(stats.peak.day) : ""} />
        <MiniStat
          label="Pertumbuhan"
          value={`${stats.growth > 0 ? "+" : ""}${stats.growth}%`}
          tone={stats.growth >= 0 ? "up" : "down"}
        />
      </div>

      {/* Chart */}
      <div className="relative w-full" ref={wrapRef}>
        <svg
          ref={svgRef}
          key={animKey}
          viewBox={`0 0 ${W} ${H}`}
          className="w-full h-56 select-none"
          onMouseMove={onMove}
          onMouseLeave={() => setHover(null)}
        >
          <defs>
            <linearGradient id="gc-fill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="var(--neon-pink)" stopOpacity="0.5" />
              <stop offset="100%" stopColor="var(--neon-pink)" stopOpacity="0" />
            </linearGradient>
            <linearGradient id="gc-bar" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="var(--neon-pink)" stopOpacity="0.95" />
              <stop offset="100%" stopColor="var(--neon-pink)" stopOpacity="0.15" />
            </linearGradient>
            <style>{`
              @keyframes gcDraw { from { stroke-dashoffset: 2000 } to { stroke-dashoffset: 0 } }
              @keyframes gcFade { from { opacity: 0 } to { opacity: 1 } }
              @keyframes gcGrow { from { transform: scaleY(0) } to { transform: scaleY(1) } }
              .gc-line { stroke-dasharray: 2000; animation: gcDraw 1.1s cubic-bezier(.4,0,.2,1) forwards }
              .gc-area { animation: gcFade .9s .25s ease both }
              .gc-bar { transform-box: fill-box; transform-origin: bottom; animation: gcGrow .55s cubic-bezier(.34,1.3,.64,1) both }
            `}</style>
          </defs>

          {/* grid + axis labels */}
          {[0, 0.25, 0.5, 0.75, 1].map((r) => {
            const y = PADT + innerH * r;
            return (
              <g key={r}>
                <line x1={PADX} x2={W - PADX} y1={y} y2={y} stroke="oklch(0.35 0.06 275 / 0.25)" strokeDasharray="3 5" />
                <text x={4} y={y + 3} fontSize="8" fill="oklch(0.6 0.04 265)">
                  {Math.round(max * (1 - r))}
                </text>
              </g>
            );
          })}

          {mode === "bar" ? (
            pts.map((p, i) => (
              <rect
                key={i}
                className="gc-bar"
                style={{ animationDelay: `${i * 22}ms` }}
                x={p.x - barW / 2}
                y={p.y}
                width={barW}
                height={Math.max(1, PADT + innerH - p.y)}
                rx={2}
                fill="url(#gc-bar)"
                opacity={hover == null || hover === i ? 1 : 0.45}
              />
            ))
          ) : (
            <>
              <path className="gc-area" d={area} fill="url(#gc-fill)" />
              <path
                className="gc-line"
                d={line}
                fill="none"
                stroke="var(--neon-pink)"
                strokeWidth="2.2"
                strokeLinecap="round"
                style={{ filter: "drop-shadow(0 0 5px var(--neon-pink))" }}
              />
            </>
          )}

          {/* hover marker */}
          {hp && (
            <g>
              <line x1={hp.x} x2={hp.x} y1={PADT} y2={PADT + innerH} stroke="var(--neon-pink)" strokeOpacity="0.4" strokeDasharray="2 4" />
              <circle cx={hp.x} cy={hp.y} r="4.5" fill="var(--neon-pink)" style={{ filter: "drop-shadow(0 0 6px var(--neon-pink))" }} />
              <circle cx={hp.x} cy={hp.y} r="9" fill="var(--neon-pink)" fillOpacity="0.15" />
            </g>
          )}

          {/* x labels */}
          {pts
            .filter((_, i) => i % Math.max(1, Math.ceil(n / 6)) === 0 || i === n - 1)
            .map((p, i) => (
              <text key={i} x={p.x} y={H - 8} textAnchor="middle" fontSize="9" fill="oklch(0.65 0.05 265)">
                {p.day.slice(5)}
              </text>
            ))}
        </svg>

        {/* tooltip */}
        {hp && (
          <div
            className="pointer-events-none absolute -translate-x-1/2 rounded-lg border border-primary/30 bg-background/95 px-2.5 py-1.5 shadow-lg backdrop-blur"
            style={{ left: `${(hp.x / W) * 100}%`, top: `${(hp.y / H) * 100}%`, transform: "translate(-50%, -120%)" }}
          >
            <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">{fmtDay(hp.day)}</div>
            <div className="font-display text-base text-foreground leading-tight">
              {hp.count.toLocaleString("id-ID")} <span className="text-[10px] text-muted-foreground">aset</span>
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
        <Activity className="h-3 w-3 text-primary" />
        {stats.active} dari {sliced.length} hari punya aktivitas generate
      </div>
    </div>
  );
}

function MiniStat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "up" | "down" }) {
  return (
    <div className="rounded-lg border border-border/50 bg-muted/20 px-2.5 py-2">
      <div className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground truncate">{label}</div>
      <div
        className={`font-display text-lg leading-tight ${
          tone === "up" ? "text-primary" : tone === "down" ? "text-destructive" : "text-foreground"
        }`}
      >
        {value}
      </div>
      {sub && <div className="text-[10px] text-muted-foreground truncate">{sub}</div>}
    </div>
  );
}
