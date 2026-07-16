// Aesthetic centered confirm dialog matching the app theme.
// Two usages:
//   1) <ConfirmDialog open ... onConfirm onCancel /> declarative
//   2) confirmDialog({ title, description }) imperative promise API
import { createRoot, type Root } from "react-dom/client";
import { useEffect } from "react";
import { AlertTriangle, Loader2, X } from "lucide-react";

export type ConfirmOptions = {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "danger" | "default";
};

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Ya, hapus",
  cancelLabel = "Batal",
  tone = "danger",
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmOptions & {
  open: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open) return null;
  const isDanger = tone === "danger";
  return (
    <div
      className="fixed inset-0 z-[90] grid place-items-center bg-background/80 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      onClick={busy ? undefined : onCancel}
    >
      <div
        className="neumorph w-full max-w-md p-6 relative"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onCancel}
          disabled={busy}
          className="absolute top-3 right-3 h-8 w-8 grid place-items-center rounded-full border border-border bg-card/50 hover:bg-sidebar-accent/60 disabled:opacity-50"
          aria-label="Tutup"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="flex items-start gap-3">
          <div
            className={[
              "h-11 w-11 grid place-items-center rounded-2xl border shrink-0",
              isDanger
                ? "border-rose-400/40 bg-rose-500/10 text-rose-300"
                : "border-primary/40 bg-primary/10 text-primary",
            ].join(" ")}
          >
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <div className="text-[11px] font-mono uppercase tracking-[0.25em] text-muted-foreground">
              Konfirmasi
            </div>
            <h2 className="mt-1 font-display text-lg leading-tight">{title}</h2>
            {description && (
              <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">
                {description}
              </p>
            )}
          </div>
        </div>

        <div className="mt-6 flex items-center justify-end gap-2">
          <button
            onClick={onCancel}
            disabled={busy}
            className="rounded-full border border-border bg-card/50 px-4 py-2 text-sm hover:bg-sidebar-accent/60 disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            disabled={busy}
            className={[
              "inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60",
            ].join(" ")}
            style={
              isDanger
                ? { background: "linear-gradient(135deg, #f43f5e, #ec4899)" }
                : { background: "var(--gradient-neon)" }
            }
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// Imperative promise API — resolves true on confirm, false on cancel.
let host: HTMLDivElement | null = null;
let root: Root | null = null;

export function confirmDialog(opts: ConfirmOptions): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  if (!host) {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  }
  return new Promise((resolve) => {
    const close = (val: boolean) => {
      root?.render(null);
      resolve(val);
    };
    root!.render(
      <ConfirmDialog
        open
        {...opts}
        onConfirm={() => close(true)}
        onCancel={() => close(false)}
      />,
    );
  });
}
