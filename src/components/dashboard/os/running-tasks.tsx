import { Link } from "@tanstack/react-router";
import { Activity, Loader2, CheckCircle2, AlertCircle, ArrowRight } from "lucide-react";
import { useNotifications } from "@/lib/stores/notifications";
import { Chip } from "./section";

function ago(t: number): string {
  const s = Math.floor((Date.now() - t) / 1000);
  if (s < 60) return `${s}d`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}j`;
}

export function RunningTasks() {
  const { items } = useNotifications();
  const running = items.filter((n) => n.status === "running");
  const recent = items.filter((n) => n.status !== "running").slice(0, 4);

  return (
    <div className="neumorph p-5 h-full flex flex-col">
      <div className="flex items-center gap-2">
        <Activity className={"h-4 w-4 " + (running.length ? "text-primary animate-pulse" : "text-muted-foreground")} />
        <div className="font-display text-base">Running Tasks</div>
        {running.length > 0 && <Chip tone="primary">{running.length} aktif</Chip>}
      </div>
      <div className="text-[11px] text-muted-foreground mt-0.5">Realtime — semua job dari studio</div>

      <div className="mt-4 flex-1 min-h-0 overflow-y-auto space-y-2">
        {running.length === 0 && recent.length === 0 && (
          <div className="rounded-xl border border-dashed border-border/60 bg-card/20 p-6 text-center text-xs text-muted-foreground">
            Belum ada job berjalan. Mulai generate dari quick action atau command center.
          </div>
        )}
        {running.map((r) => (
          <div key={r.id} className="rounded-xl border border-primary/30 bg-primary/[0.04] p-3 animate-fade-in">
            <div className="flex items-center gap-2">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
              <div className="text-sm text-foreground/95 truncate flex-1">{r.label}</div>
              <span className="text-[10px] font-mono text-muted-foreground">{ago(r.startedAt)}</span>
            </div>
            {r.detail && (
              <div className="text-[11px] text-muted-foreground mt-1 truncate">{r.detail}</div>
            )}
            <div className="mt-2 h-1 rounded-full bg-card/60 overflow-hidden">
              <div
                className="h-full rounded-full animate-pulse"
                style={{
                  width: "62%",
                  background: "var(--gradient-neon)",
                }}
              />
            </div>
            {r.route && (
              <Link
                to={r.route}
                className="mt-2 inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
              >
                Buka <ArrowRight className="h-3 w-3" />
              </Link>
            )}
          </div>
        ))}
        {recent.map((r) => {
          const Icon = r.status === "done" ? CheckCircle2 : AlertCircle;
          const tone = r.status === "done" ? "text-emerald-300" : "text-rose-300";
          return (
            <div key={r.id} className="rounded-xl border border-border bg-card/40 p-3">
              <div className="flex items-center gap-2">
                <Icon className={"h-3.5 w-3.5 " + tone} />
                <div className="text-sm text-foreground/85 truncate flex-1">{r.label}</div>
                <span className="text-[10px] font-mono text-muted-foreground">
                  {ago(r.endedAt ?? r.startedAt)}
                </span>
              </div>
              {r.detail && <div className="text-[11px] text-muted-foreground mt-0.5 truncate">{r.detail}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
