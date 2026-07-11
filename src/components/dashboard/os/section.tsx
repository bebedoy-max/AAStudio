import type { ReactNode } from "react";

export function Section({
  eyebrow,
  title,
  desc,
  right,
  children,
  className,
}: {
  eyebrow?: string;
  title: string;
  desc?: string;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={"flex flex-col gap-3 animate-fade-in " + (className || "")}>
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          {eyebrow && (
            <div className="text-[10px] font-mono uppercase tracking-[0.25em] text-muted-foreground">
              {eyebrow}
            </div>
          )}
          <h2 className="mt-0.5 font-display text-lg md:text-xl text-foreground">{title}</h2>
          {desc && <p className="text-xs text-muted-foreground mt-0.5 max-w-xl">{desc}</p>}
        </div>
        {right}
      </div>
      {children}
    </section>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={
        "rounded-xl bg-gradient-to-r from-card/40 via-card/20 to-card/40 animate-pulse " + (className || "")
      }
    />
  );
}

export function Chip({
  children,
  tone = "default",
  className,
}: {
  children: ReactNode;
  tone?: "default" | "primary" | "success" | "warn" | "danger";
  className?: string;
}) {
  const map = {
    default: "border-border bg-card/50 text-foreground/80",
    primary: "border-primary/40 bg-primary/10 text-primary",
    success: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
    warn: "border-amber-500/30 bg-amber-500/10 text-amber-300",
    danger: "border-rose-500/30 bg-rose-500/10 text-rose-300",
  } as const;
  return (
    <span
      className={
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider " +
        map[tone] +
        " " +
        (className || "")
      }
    >
      {children}
    </span>
  );
}
