// Aesthetic centered prompt dialog matching the app theme.
// Imperative promise API — resolves with input string or null on cancel.
//
//   const reason = await promptDialog({
//     title: "Alasan penolakan",
//     placeholder: "Opsional",
//     allowEmpty: true,
//   });
import { createRoot, type Root } from "react-dom/client";
import { useEffect, useRef, useState } from "react";
import { Loader2, Sparkles, X } from "lucide-react";

export type PromptOptions = {
  title: string;
  description?: string;
  placeholder?: string;
  defaultValue?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  multiline?: boolean;
  allowEmpty?: boolean;
};

export function PromptDialog({
  open,
  title,
  description,
  placeholder,
  defaultValue = "",
  confirmLabel = "Simpan",
  cancelLabel = "Batal",
  multiline = false,
  allowEmpty = false,
  busy = false,
  onConfirm,
  onCancel,
}: PromptOptions & {
  open: boolean;
  busy?: boolean;
  onConfirm: (v: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(defaultValue);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!open) return;
    setValue(defaultValue);
    const t = setTimeout(() => {
      inputRef.current?.focus();
      (inputRef.current as HTMLInputElement | null)?.select?.();
    }, 30);
    return () => clearTimeout(t);
  }, [open, defaultValue]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open) return null;

  const submit = () => {
    const v = value.trim();
    if (!allowEmpty && !v) {
      inputRef.current?.focus();
      return;
    }
    onConfirm(v);
  };

  return (
    <div
      className="fixed inset-0 z-[95] grid place-items-center bg-background/80 backdrop-blur-sm p-4"
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
            className="h-11 w-11 grid place-items-center rounded-2xl shrink-0 text-primary-foreground"
            style={{ background: "var(--gradient-neon)" }}
          >
            <Sparkles className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-mono uppercase tracking-[0.25em] text-muted-foreground">
              Input
            </div>
            <h2 className="mt-1 font-display text-lg leading-tight">{title}</h2>
            {description && (
              <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">
                {description}
              </p>
            )}
          </div>
        </div>

        <div className="mt-4">
          {multiline ? (
            <textarea
              ref={inputRef as React.RefObject<HTMLTextAreaElement>}
              rows={4}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={placeholder}
              className="w-full rounded-xl border border-border bg-card/50 px-3 py-2.5 text-sm outline-none placeholder:text-muted-foreground/70 focus:border-primary/60 transition resize-y"
            />
          ) : (
            <input
              ref={inputRef as React.RefObject<HTMLInputElement>}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={placeholder}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  submit();
                }
              }}
              className="w-full rounded-xl border border-border bg-card/50 px-3 py-2.5 text-sm outline-none placeholder:text-muted-foreground/70 focus:border-primary/60 transition"
            />
          )}
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
            onClick={submit}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
            style={{ background: "var(--gradient-neon)" }}
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

let host: HTMLDivElement | null = null;
let root: Root | null = null;

export function promptDialog(opts: PromptOptions): Promise<string | null> {
  if (typeof window === "undefined") return Promise.resolve(null);
  if (!host) {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  }
  return new Promise((resolve) => {
    const close = (val: string | null) => {
      root?.render(null);
      resolve(val);
    };
    root!.render(
      <PromptDialog
        open
        {...opts}
        onConfirm={(v) => close(v)}
        onCancel={() => close(null)}
      />,
    );
  });
}
