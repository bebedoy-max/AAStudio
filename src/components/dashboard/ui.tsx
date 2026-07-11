import { type ReactNode } from "react";

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[11px] font-mono uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </label>
      {children}
      {hint && <div className="text-[11px] text-muted-foreground">{hint}</div>}
    </div>
  );
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={
        "w-full rounded-xl border border-border bg-card/50 px-3 py-2.5 text-sm outline-none placeholder:text-muted-foreground/70 focus:border-primary/60 focus:shadow-[var(--shadow-glow-cyan)] transition " +
        (props.className || "")
      }
    />
  );
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      rows={4}
      {...props}
      className={
        "w-full rounded-xl border border-border bg-card/50 px-3 py-2.5 text-sm outline-none placeholder:text-muted-foreground/70 focus:border-primary/60 focus:shadow-[var(--shadow-glow-cyan)] transition resize-y " +
        (props.className || "")
      }
    />
  );
}

export function Select({ options, ...props }: { options: { value: string; label: string }[] } & React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={
        "w-full rounded-xl border border-border bg-card/50 px-3 py-2.5 text-sm outline-none focus:border-primary/60 focus:shadow-[var(--shadow-glow-cyan)] transition " +
        (props.className || "")
      }
    >
      {options.map((o) => (
        <option key={o.value} value={o.value} className="bg-[oklch(0.19_0.055_275)]">
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function Check({ id, label, defaultChecked }: { id: string; label: string; defaultChecked?: boolean }) {
  return (
    <label htmlFor={id} className="flex items-center gap-2.5 cursor-pointer select-none">
      <input id={id} type="checkbox" defaultChecked={defaultChecked} className="peer sr-only" />
      <span className="h-5 w-5 rounded-md border border-border bg-card/50 grid place-items-center peer-checked:bg-[image:var(--gradient-neon)] peer-checked:border-transparent transition">
        <svg viewBox="0 0 24 24" className="h-3 w-3 text-primary-foreground opacity-0 peer-checked:opacity-100" fill="none" stroke="currentColor" strokeWidth="3">
          <path d="M5 12l5 5L20 7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      <span className="text-sm text-foreground/90">{label}</span>
    </label>
  );
}

export function Card({ title, sub, children, right }: { title?: string; sub?: string; right?: ReactNode; children: ReactNode }) {
  return (
    <div className="neumorph p-5">
      {(title || right) && (
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            {title && <div className="font-display text-lg text-foreground">{title}</div>}
            {sub && <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>}
          </div>
          {right}
        </div>
      )}
      {children}
    </div>
  );
}

export function PrimaryButton({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={
        "inline-flex items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold text-primary-foreground glow-pink transition hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed " +
        (props.className || "")
      }
      style={{ background: "var(--gradient-neon)", ...(props.style || {}) }}
    >
      {children}
    </button>
  );
}

export function GhostButton({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={
        "inline-flex items-center justify-center gap-2 rounded-full border border-border bg-card/50 px-4 py-2 text-sm font-medium text-foreground/90 hover:text-foreground hover:bg-sidebar-accent/60 transition " +
        (props.className || "")
      }
    >
      {children}
    </button>
  );
}

export function Dropzone({ label, hint }: { label: string; hint?: string }) {
  return (
    <label className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border/80 bg-card/30 px-4 py-8 text-center cursor-pointer hover:border-primary/60 transition">
      <div
        className="h-10 w-10 rounded-xl grid place-items-center text-primary-foreground"
        style={{ background: "var(--gradient-neon)" }}
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 3v14M5 10l7-7 7 7M4 21h16" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      <div className="text-sm font-medium text-foreground">{label}</div>
      {hint && <div className="text-[11px] text-muted-foreground">{hint}</div>}
      <input type="file" className="hidden" />
    </label>
  );
}

export function GalleryEmpty({ label = "Belum ada hasil" }: { label?: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-border/60 bg-card/20 py-14 text-center">
      <div className="mx-auto h-12 w-12 rounded-2xl grid place-items-center text-primary-foreground opacity-80" style={{ background: "var(--gradient-neon)" }}>
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M4 5h16v14H4z" />
          <path d="M4 15l4-4 4 4 3-3 5 5" strokeLinejoin="round" />
        </svg>
      </div>
      <div className="mt-3 text-sm text-foreground">{label}</div>
      <div className="text-xs text-muted-foreground">Generate untuk mulai mengisi galeri</div>
    </div>
  );
}
