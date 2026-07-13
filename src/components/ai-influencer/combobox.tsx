// Themed combobox: preset dropdown + "Custom…" that opens an aesthetic prompt.
import { openPrompt } from "./dialogs";
import { ChevronDown, Plus, Check } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export function Combobox({
  value,
  onChange,
  options,
  placeholder,
  customLabel = "Custom (isi manual)…",
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  placeholder?: string;
  customLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const inPresets = value && options.includes(value);
  const customActive = !!value && !inPresets;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full rounded-xl border border-border bg-card/50 px-3 py-2.5 text-sm text-left flex items-center justify-between gap-2 outline-none focus:border-primary/60 focus:shadow-[var(--shadow-glow-cyan)] transition"
      >
        <span className={value ? "" : "text-muted-foreground/70"}>
          {value || placeholder || "Pilih…"}
        </span>
        <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
      </button>
      {open && (
        <div className="absolute z-30 mt-1 w-full max-h-72 overflow-auto rounded-xl border border-border bg-[oklch(0.19_0.055_275)]/95 backdrop-blur-xl shadow-2xl p-1">
          {options.map((o) => (
            <button
              key={o}
              type="button"
              onClick={() => {
                onChange(o);
                setOpen(false);
              }}
              className="w-full text-left px-3 py-2 rounded-lg text-sm hover:bg-sidebar-accent/70 flex items-center justify-between gap-2"
            >
              <span>{o}</span>
              {value === o && <Check className="h-4 w-4 text-primary" />}
            </button>
          ))}
          <div className="my-1 h-px bg-border/60" />
          <button
            type="button"
            onClick={async () => {
              setOpen(false);
              const v = await openPrompt({
                title: "Isi manual",
                description: "Ketik nilai custom sesuai kebutuhan.",
                placeholder: placeholder,
                defaultValue: customActive ? value : "",
              });
              if (v) onChange(v);
            }}
            className={
              "w-full text-left px-3 py-2 rounded-lg text-sm flex items-center gap-2 " +
              (customActive ? "text-primary" : "text-foreground/90 hover:bg-sidebar-accent/70")
            }
          >
            <Plus className="h-4 w-4" />
            {customActive ? `Custom: ${value}` : customLabel}
          </button>
        </div>
      )}
    </div>
  );
}
