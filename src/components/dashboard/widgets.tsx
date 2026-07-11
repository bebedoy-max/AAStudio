import { useState } from "react";
import { Star } from "lucide-react";

export function ToggleCard() {
  const [a, setA] = useState(true);
  const [b, setB] = useState(false);
  return (
    <div className="neumorph p-5 flex flex-col gap-4">
      {[
        { label: "Auto Enhance", desc: "Tingkatkan output otomatis via Topaz", value: a, set: setA },
        { label: "Cinematic Mode", desc: "Camera motion sinematik pada video gen", value: b, set: setB },
      ].map((row, i) => (
        <div key={i} className="flex items-center gap-4">
          <button
            aria-pressed={row.value}
            onClick={() => row.set(!row.value)}
            className={[
              "relative h-8 w-20 shrink-0 rounded-full transition-all text-[10px] font-semibold",
              row.value ? "glow-cyan" : "bg-sidebar-accent border border-sidebar-border",
            ].join(" ")}
            style={row.value ? { background: "var(--gradient-neon)" } : undefined}
          >
            <span className={["absolute top-1/2 -translate-y-1/2", row.value ? "left-3 text-primary-foreground" : "right-3 text-muted-foreground"].join(" ")}>{row.value ? "ON" : "OFF"}</span>
            <span
              className={[
                "absolute top-1 h-6 w-6 rounded-full bg-white transition-all shadow",
                row.value ? "left-[3.25rem]" : "left-1",
              ].join(" ")}
            />
          </button>
          <div className="min-w-0">
            <div className="font-display text-sm text-foreground">{row.label}</div>
            <div className="text-xs text-muted-foreground truncate">{row.desc}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function RatingCard() {
  return (
    <div className="neumorph p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-display text-lg text-foreground">Project terakhir</div>
          <div className="text-xs text-muted-foreground mt-0.5">Cinematic Reel · 12 klip</div>
        </div>
        <div className="flex gap-0.5">
          {[1, 2, 3, 4, 5].map((i) => (
            <Star
              key={i}
              className={["h-4 w-4", i <= 4 ? "fill-[var(--neon-pink)] text-[var(--neon-pink)]" : "text-muted-foreground"].join(" ")}
            />
          ))}
        </div>
      </div>
      <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
        Video generation berhasil dengan skor kualitas tinggi. Klik untuk melihat detail render, prompt & versi.
      </p>
      <div className="mt-4 flex items-center gap-2">
        <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Model</span>
        <span className="rounded-full border border-border px-2.5 py-0.5 text-xs text-foreground">Kling 2.1</span>
        <span className="rounded-full border border-border px-2.5 py-0.5 text-xs text-foreground">Sora</span>
      </div>
    </div>
  );
}

function Gauge({ value, label, sub, color }: { value: number; label: string; sub: string; color: string }) {
  const r = 42;
  const c = 2 * Math.PI * r;
  const dash = c * (value / 100);
  return (
    <div className="flex items-center gap-4">
      <svg viewBox="0 0 110 110" className="h-28 w-28">
        <defs>
          <linearGradient id={`g-${label}`} x1="0" x2="1" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--neon-pink)" />
            <stop offset="100%" stopColor="var(--neon-cyan)" />
          </linearGradient>
        </defs>
        <circle cx="55" cy="55" r={r} fill="none" stroke="oklch(0.3 0.06 275 / 0.7)" strokeWidth="8" />
        <circle
          cx="55" cy="55" r={r} fill="none"
          stroke={`url(#g-${label})`}
          strokeWidth="8" strokeLinecap="round"
          strokeDasharray={`${dash} ${c}`}
          transform="rotate(-90 55 55)"
        />
        <text x="55" y="52" textAnchor="middle" className="font-mono" fill={color} fontSize="16" fontWeight="700">
          {value.toLocaleString()}
        </text>
        <text x="55" y="68" textAnchor="middle" fill="oklch(0.72 0.05 265)" fontSize="8">
          {sub}
        </text>
      </svg>
      <div>
        <div className="font-display text-base text-foreground">{label}</div>
        <div className="text-xs text-muted-foreground max-w-[10rem]">Lorem ipsum dolor sit amet consectetur</div>
      </div>
    </div>
  );
}

export function GaugesCard() {
  return (
    <div className="neumorph p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
      <Gauge value={72} label="Credits" sub="1 450 / 2000" color="var(--neon-cyan)" />
      <Gauge value={88} label="Generations" sub="3 120 total" color="var(--neon-pink)" />
    </div>
  );
}

export function BarChartCard() {
  const values = [56, 51, 28, 54, 37, 52, 44];
  const days = ["11.02", "12.02", "13.02", "14.02", "15.02", "16.02", "17.02"];
  const max = Math.max(...values);
  return (
    <div className="neumorph p-5">
      <div className="flex items-end justify-between gap-1">
        {values.map((v, i) => (
          <div key={i} className="text-center font-mono text-xs text-muted-foreground w-8">
            {v}
          </div>
        ))}
      </div>
      <div className="mt-2 flex items-end justify-between gap-1 h-32">
        {values.map((v, i) => (
          <div
            key={i}
            className="w-6 rounded-t-md"
            style={{
              height: `${(v / max) * 100}%`,
              background: "linear-gradient(180deg, var(--neon-pink), oklch(0.6 0.2 20))",
              boxShadow: "0 0 12px oklch(0.72 0.22 355 / 0.35)",
            }}
          />
        ))}
      </div>
      <div className="mt-2 flex justify-between gap-1">
        {days.map((d, i) => (
          <div key={i} className="w-8 text-center font-mono text-[10px] text-muted-foreground">
            {d}
          </div>
        ))}
      </div>
    </div>
  );
}

export function ProgressDots() {
  return (
    <div className="neumorph p-5">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-2xl font-display text-foreground">78%</div>
          <div className="text-xs text-muted-foreground">Storage terpakai</div>
        </div>
        <div>
          <div className="text-2xl font-display text-gradient">92%</div>
          <div className="text-xs text-muted-foreground">Success rate</div>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-10 gap-1.5">
        {Array.from({ length: 20 }).map((_, i) => {
          const on = i < 15;
          const alt = i % 2 === 0;
          return (
            <div
              key={i}
              className="h-3.5 w-3.5 rounded-full"
              style={{
                background: on
                  ? alt
                    ? "var(--neon-pink)"
                    : "var(--neon-cyan)"
                  : "oklch(0.3 0.06 275 / 0.6)",
                boxShadow: on ? "0 0 8px currentColor" : "none",
              }}
            />
          );
        })}
      </div>
    </div>
  );
}

export function AreaChartCard() {
  const pts = [80, 220, 140, 340, 210, 380, 260, 430, 300, 360, 250, 400];
  const w = 520;
  const h = 180;
  const step = w / (pts.length - 1);
  const max = 500;
  const path = pts
    .map((p, i) => `${i === 0 ? "M" : "L"} ${i * step} ${h - (p / max) * h}`)
    .join(" ");
  const area = `${path} L ${w} ${h} L 0 ${h} Z`;
  return (
    <div className="neumorph p-5">
      <div className="flex items-center justify-between mb-2">
        <div>
          <div className="font-display text-lg text-foreground">Aktivitas Bulanan</div>
          <div className="text-xs text-muted-foreground">Generasi per hari</div>
        </div>
        <div className="flex gap-2 text-[11px] font-mono text-muted-foreground">
          <span>500</span>
        </div>
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-44">
        <defs>
          <linearGradient id="area-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--neon-pink)" stopOpacity="0.5" />
            <stop offset="100%" stopColor="var(--neon-pink)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[100, 200, 300, 400].map((y) => (
          <line
            key={y}
            x1="0" x2={w} y1={h - (y / max) * h} y2={h - (y / max) * h}
            stroke="oklch(0.35 0.06 275 / 0.35)" strokeDasharray="4 6"
          />
        ))}
        <path d={area} fill="url(#area-fill)" />
        <path d={path} fill="none" stroke="var(--neon-pink)" strokeWidth="2.5" style={{ filter: "drop-shadow(0 0 6px var(--neon-pink))" }} />
      </svg>
    </div>
  );
}

export function ArcCard() {
  return (
    <div className="neumorph p-5 flex flex-col items-center justify-center text-center">
      <svg viewBox="0 0 200 120" className="w-full max-w-[220px]">
        <defs>
          <linearGradient id="arc-g" x1="0" x2="1">
            <stop offset="0%" stopColor="var(--neon-pink)" />
            <stop offset="100%" stopColor="var(--neon-cyan)" />
          </linearGradient>
        </defs>
        {[70, 55, 40].map((r, i) => (
          <path
            key={i}
            d={`M ${100 - r} 100 A ${r} ${r} 0 0 1 ${100 + r} 100`}
            fill="none"
            stroke={i === 0 ? "url(#arc-g)" : i === 1 ? "var(--neon-pink)" : "var(--neon-cyan)"}
            strokeWidth="6"
            strokeLinecap="round"
            opacity={1 - i * 0.15}
          />
        ))}
      </svg>
      <div className="mt-2 font-mono text-3xl font-bold text-foreground">43,223</div>
      <div className="text-xs uppercase tracking-widest text-muted-foreground mt-1">
        Total render selesai
      </div>
    </div>
  );
}
