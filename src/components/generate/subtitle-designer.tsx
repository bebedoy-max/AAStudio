import { Type } from "lucide-react";
import { Field, Select, Input } from "@/components/dashboard/ui";
import {
  SUB_PRESETS,
  SUB_FONTS,
  SUB_EFFECTS,
  SUB_POSITIONS,
  presetConfig,
  subtitleCss,
  type SubtitleConfig,
} from "@/lib/subtitle/styles";

const SAMPLE = "Ini contoh tampilan subtitle kamu";

export function SubtitleDesigner({
  value,
  onChange,
  ratio,
}: {
  value: SubtitleConfig;
  onChange: (cfg: SubtitleConfig) => void;
  ratio: string;
}) {
  const set = <K extends keyof SubtitleConfig>(k: K, v: SubtitleConfig[K]) => onChange({ ...value, [k]: v });
  const previewClass = ratio.startsWith("9:16")
    ? "aspect-[9/16] max-w-[190px]"
    : ratio.startsWith("1:1")
      ? "aspect-square max-w-[280px]"
      : "aspect-video";

  return (
    <div className="grid gap-3">
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Style subtitle">
          <Select
            value={value.preset}
            onChange={(e) => onChange(presetConfig(e.target.value))}
            options={SUB_PRESETS.map((p) => ({ value: p.key, label: p.label }))}
          />
        </Field>
        <Field label="Jenis font">
          <Select
            value={value.font}
            onChange={(e) => set("font", e.target.value)}
            options={SUB_FONTS.map((f) => ({ value: f.key, label: f.label }))}
          />
        </Field>
      </div>

      {/* Preview */}
      <div className="rounded-xl border border-border bg-background/40 p-3">
        <div className="mb-2 flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
          <Type className="h-3 w-3" /> Preview subtitle
        </div>
        <div
          className={`relative mx-auto w-full ${previewClass} overflow-hidden rounded-lg border border-border`}
          style={{ background: "linear-gradient(135deg,#1b1b25,#2b2136 60%,#101018)" }}
        >
          <div
            className="absolute inset-x-0 flex justify-center px-3"
            style={
              value.position === "top"
                ? { top: `${Math.min(45, value.marginV / 12)}%` }
                : value.position === "middle"
                  ? { top: "45%" }
                  : { bottom: `${Math.min(45, value.marginV / 12)}%` }
            }
          >
            <span style={subtitleCss(value)}>{value.uppercase ? SAMPLE.toUpperCase() : SAMPLE}</span>
          </div>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <Field label={`Ukuran font (${value.fontSize})`}>
          <input
            type="range"
            min={20}
            max={90}
            step={1}
            value={value.fontSize}
            onChange={(e) => set("fontSize", Number(e.target.value))}
            className="w-full accent-primary"
          />
        </Field>
        <Field label="Warna teks">
          <Input type="color" value={value.primary} onChange={(e) => set("primary", e.target.value)} />
        </Field>
        <Field label="Warna outline">
          <Input type="color" value={value.outlineColor} onChange={(e) => set("outlineColor", e.target.value)} />
        </Field>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <Field label={`Tebal outline (${value.outlineWidth})`}>
          <input
            type="range"
            min={0}
            max={6}
            step={1}
            value={value.outlineWidth}
            onChange={(e) => set("outlineWidth", Number(e.target.value))}
            className="w-full accent-primary"
          />
        </Field>
        <Field label={`Shadow (${value.shadow})`}>
          <input
            type="range"
            min={0}
            max={4}
            step={1}
            value={value.shadow}
            onChange={(e) => set("shadow", Number(e.target.value))}
            className="w-full accent-primary"
          />
        </Field>
        <Field label="Efek subtitle">
          <Select
            value={value.effect}
            onChange={(e) => set("effect", e.target.value as SubtitleConfig["effect"])}
            options={SUB_EFFECTS.map((e) => ({ value: e.value, label: e.label }))}
          />
        </Field>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <Field label="Posisi">
          <Select
            value={value.position}
            onChange={(e) => set("position", e.target.value as SubtitleConfig["position"])}
            options={SUB_POSITIONS.map((p) => ({ value: p.value, label: p.label }))}
          />
        </Field>
        <Field label={`Jarak dari tepi (${value.marginV}px)`}>
          <input
            type="range"
            min={20}
            max={320}
            step={5}
            value={value.marginV}
            onChange={(e) => set("marginV", Number(e.target.value))}
            className="w-full accent-primary"
          />
        </Field>
        <Field label={`Maks. karakter / baris (${value.maxChars})`}>
          <input
            type="range"
            min={16}
            max={70}
            step={1}
            value={value.maxChars}
            onChange={(e) => set("maxChars", Number(e.target.value))}
            className="w-full accent-primary"
          />
        </Field>
      </div>

      <div className="flex flex-wrap items-center gap-3 text-xs">
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={value.bold} onChange={(e) => set("bold", e.target.checked)} /> Bold
        </label>
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={value.italic} onChange={(e) => set("italic", e.target.checked)} /> Italic
        </label>
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={value.uppercase} onChange={(e) => set("uppercase", e.target.checked)} /> UPPERCASE
        </label>
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={value.box} onChange={(e) => set("box", e.target.checked)} /> Box background
        </label>
        {value.box && (
          <label className="flex items-center gap-1.5">
            Opasitas box
            <input
              type="range"
              min={0.2}
              max={1}
              step={0.05}
              value={value.boxOpacity}
              onChange={(e) => set("boxOpacity", Number(e.target.value))}
              className="accent-primary"
            />
          </label>
        )}
      </div>
    </div>
  );
}
