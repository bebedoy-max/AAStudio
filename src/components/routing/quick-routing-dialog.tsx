// Reusable clickable "Provider aktif" pill + dialog.
// Dipakai di halaman generate.motion / image-to-video / storyboard / naratif /
// leonardo, dsb — user bisa mengubah routing provider tanpa pindah menu.
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X, Check, Zap, ExternalLink, Repeat } from "lucide-react";
import { Link } from "@tanstack/react-router";
import {
  type CapKey,
  enabledProviders,
  getCap,
  readRouting,
  writeRoutingCap,
} from "@/lib/routing/catalog";
import { useProviderFlags } from "@/lib/platform/provider-flags";

export function useActiveProvider(cap: CapKey): string {
  const [id, setId] = useState<string>(() => readRouting()[cap]);
  useEffect(() => {
    const sync = () => setId(readRouting()[cap]);
    window.addEventListener("aatools:routing-changed", sync as EventListener);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("aatools:routing-changed", sync as EventListener);
      window.removeEventListener("storage", sync);
    };
  }, [cap]);
  return id;
}

export function ProviderActivePill({
  cap,
  label,
  className,
}: {
  cap: CapKey;
  label?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const activeId = useActiveProvider(cap);
  const capDef = getCap(cap);
  const active = capDef?.providers.find((p) => p.id === activeId);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          "inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 hover:bg-primary/20 hover:border-primary/70 transition px-2.5 py-1 text-[11px] font-mono uppercase tracking-wider text-primary cursor-pointer " +
          (className || "")
        }
        title={`Klik untuk ubah provider ${capDef?.label ?? cap}`}
      >
        <Zap className="h-3 w-3" />
        <span className="normal-case tracking-normal text-foreground/90">
          {label ?? "Provider aktif:"}
        </span>
        <b className="text-primary normal-case tracking-normal">{active?.name ?? activeId}</b>
        <Repeat className="h-3 w-3 text-primary animate-switch-hint" aria-hidden />
      </button>
      {open && <RoutingDialog cap={cap} onClose={() => setOpen(false)} />}
    </>
  );
}

export function RoutingDialog({ cap, onClose }: { cap: CapKey; onClose: () => void }) {
  const capDef = getCap(cap);
  const { flags } = useProviderFlags();
  const [activeId, setActiveId] = useState<string>(() => readRouting()[cap]);
  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [onClose]);

  if (!capDef) return null;
  const Icon = capDef.icon;

  const pick = (id: string) => {
    setActiveId(id);
    writeRoutingCap(cap, id);
  };

  const content = (
    <div
      className="fixed inset-0 z-[9999] grid place-items-center bg-background/80 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-2xl border border-border bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-start gap-3 border-b border-border/60 bg-card/95 backdrop-blur p-4">
          <div
            className="h-10 w-10 rounded-xl grid place-items-center text-primary-foreground shrink-0"
            style={{ background: "var(--gradient-neon)" }}
          >
            <Icon className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
              Routing Provider
            </div>
            <div className="font-display text-lg text-foreground">{capDef.label}</div>
            <div className="text-xs text-muted-foreground mt-0.5">{capDef.desc}</div>
          </div>
          <button
            onClick={onClose}
            className="h-8 w-8 grid place-items-center rounded-full border border-border hover:bg-sidebar-accent/30"
            aria-label="Tutup"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-4 flex flex-col gap-2.5">
          {enabledProviders(capDef, flags).map((p) => {
            const selected = p.id === activeId;
            const disabled = p.note === "coming-soon";
            return (
              <button
                key={p.id}
                type="button"
                disabled={disabled}
                onClick={() => !disabled && pick(p.id)}
                className={[
                  "text-left rounded-xl border p-3 transition",
                  disabled
                    ? "border-border/40 bg-card/20 opacity-60 cursor-not-allowed"
                    : selected
                      ? "border-primary/60 bg-primary/10 ring-1 ring-primary/40"
                      : "border-border bg-card/40 hover:border-primary/50 hover:bg-card/70",
                ].join(" ")}
              >
                <div className="flex items-center gap-2">
                  <div className="font-display text-sm text-foreground flex-1 truncate">
                    {p.name}
                  </div>
                  {selected && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-wider text-primary">
                      <Check className="h-3 w-3" /> aktif
                    </span>
                  )}
                  {disabled && (
                    <span className="text-[9px] font-mono uppercase tracking-widest px-1.5 py-0.5 rounded-full border border-amber-500/40 text-amber-300 bg-amber-500/10">
                      Coming Soon
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{p.desc}</p>
                {p.models.length > 0 && (
                  <div className="mt-2 flex flex-col gap-0.5">
                    {p.models.slice(0, 4).map((m) => (
                      <div key={m.name} className="flex items-start gap-2 text-[11px]">
                        <span className="mt-1 h-1.5 w-1.5 rounded-full bg-primary/60 shrink-0" />
                        <span className="text-foreground/80 flex-1 truncate">{m.name}</span>
                        <span className="font-mono text-emerald-300/90 text-[10px] whitespace-nowrap">
                          {m.cost}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </button>
            );
          })}
        </div>

        <div className="sticky bottom-0 border-t border-border/60 bg-card/95 backdrop-blur p-3 flex items-center justify-between gap-2">
          <Link
            to="/manage/routing"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            onClick={onClose}
          >
            <ExternalLink className="h-3 w-3" /> Buka Routing lengkap
          </Link>
          <button
            onClick={onClose}
            className="rounded-full px-4 py-1.5 text-xs font-semibold text-primary-foreground"
            style={{ background: "var(--gradient-neon)" }}
          >
            Selesai
          </button>
        </div>
      </div>
    </div>
  );

  if (typeof document === "undefined") return content;
  return createPortal(content, document.body);
}
