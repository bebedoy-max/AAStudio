import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const PRESETS = [
  "#ffffff", "#000000", "#ffe600", "#08dd21", "#ff5757", "#ff2d95",
  "#d946ef", "#7c3aed", "#2563eb", "#06b6d4", "#f97316", "#94a3b8",
];

export function ColorField({ value, onChange }: { value: string; onChange: (hex: string) => void }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center gap-2 rounded-lg border border-border bg-background/60 px-2 py-1.5 text-left text-xs hover:border-primary/60"
        >
          <span
            className="h-5 w-5 shrink-0 rounded-md border border-border"
            style={{ background: value }}
          />
          <span className="font-mono uppercase text-foreground">{value}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-3" align="start">
        <div className="grid grid-cols-6 gap-1.5">
          {PRESETS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => onChange(c)}
              className={`h-6 w-6 rounded-md border ${value.toLowerCase() === c ? "border-primary ring-2 ring-primary/40" : "border-border"}`}
              style={{ background: c }}
              aria-label={c}
            />
          ))}
        </div>
        <div className="mt-3 flex items-center gap-2">
          <input
            type="color"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="h-8 w-10 cursor-pointer rounded-md border border-border bg-transparent p-0.5"
          />
          <input
            value={value}
            onChange={(e) => {
              const v = e.target.value.startsWith("#") ? e.target.value : `#${e.target.value}`;
              if (/^#[0-9a-fA-F]{0,6}$/.test(v)) onChange(v);
            }}
            className="h-8 w-full rounded-md border border-border bg-background px-2 font-mono text-xs uppercase"
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}
