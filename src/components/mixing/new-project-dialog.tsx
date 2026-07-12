import { useEffect, useRef, useState } from "react";
import { Sparkles } from "lucide-react";

type Props = {
  open: boolean;
  title?: string;
  subtitle?: string;
  defaultValue?: string;
  confirmLabel?: string;
  onConfirm: (name: string) => void;
  onClose: () => void;
};

export function NewProjectDialog({
  open,
  title = "Project Baru",
  subtitle = "Beri nama project agar mudah dikenali di Workspace.",
  defaultValue = "",
  confirmLabel = "Buat Project",
  onConfirm,
  onClose,
}: Props) {
  const [value, setValue] = useState(defaultValue);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setValue(defaultValue);
    const t = setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 30);
    return () => clearTimeout(t);
  }, [open, defaultValue]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  function submit() {
    const v = value.trim();
    if (!v) {
      inputRef.current?.focus();
      return;
    }
    onConfirm(v);
  }

  return (
    <div
      className="fixed inset-0 z-[100] grid place-items-center p-4"
      style={{ background: "color-mix(in oklab, black 65%, transparent)", backdropFilter: "blur(6px)" }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="w-full max-w-md rounded-2xl neumorph p-6 shadow-2xl"
        style={{ borderTop: "1px solid color-mix(in oklab, var(--primary) 25%, transparent)" }}
      >
        <div className="flex items-center gap-3 mb-4">
          <div
            className="h-10 w-10 grid place-items-center rounded-xl"
            style={{ background: "var(--gradient-neon)" }}
          >
            <Sparkles className="h-5 w-5 text-primary-foreground" />
          </div>
          <div>
            <div className="text-[10px] font-mono uppercase tracking-[0.25em] text-muted-foreground">
              Creative Studio
            </div>
            <h3 className="font-display text-lg font-bold text-gradient leading-tight">{title}</h3>
          </div>
        </div>
        <p className="text-xs text-muted-foreground mb-4">{subtitle}</p>
        <label className="block text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-1.5">
          Nama Project
        </label>
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submit();
            }
          }}
          placeholder="mis. Video promo produk"
          className="w-full px-3 py-2.5 rounded-xl bg-background/50 border border-border/60 text-sm outline-none focus:border-primary/60 transition"
        />
        <div className="flex justify-end gap-2 mt-5">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs neumorph hover:text-foreground text-muted-foreground"
          >
            Batal
          </button>
          <button
            onClick={submit}
            className="px-4 py-2 rounded-xl text-xs font-medium text-primary-foreground"
            style={{ background: "var(--gradient-neon)" }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}