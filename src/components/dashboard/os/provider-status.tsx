import { Cpu, Zap } from "lucide-react";
import { useProviders, providerBadge, type Provider } from "@/lib/dashboard/provider-health";
import { Chip } from "./section";

const CATS: { id: Provider["category"]; label: string }[] = [
  { id: "text", label: "Text" },
  { id: "image", label: "Image" },
  { id: "video", label: "Video" },
  { id: "voice", label: "Voice" },
];

export function ProviderStatus() {
  const providers = useProviders();
  const noKey = providers.some((p) => p.status === "no-key" && (p.id === "openai" || p.id === "gemini"));

  return (
    <div className="neumorph p-5 h-full">
      <div className="flex items-center gap-2">
        <Cpu className="h-4 w-4 text-primary" />
        <div className="font-display text-base">Provider Status</div>
        {noKey ? (
          <Chip tone="warn">Butuh Key</Chip>
        ) : (
          <Chip tone="success">Auto Switch On</Chip>
        )}
      </div>
      <div className="text-[11px] text-muted-foreground mt-0.5">
        Multi-provider dengan fallback otomatis — kamu tidak perlu memilih manual
      </div>

      <div className="mt-4 space-y-4">
        {CATS.map((c) => {
          const rows = providers.filter((p) => p.category === c.id);
          return (
            <div key={c.id}>
              <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                <span>{c.label}</span>
                <span className="flex-1 h-px bg-border/60" />
              </div>
              <div className="mt-2 space-y-1.5">
                {rows.map((p) => {
                  const badge = providerBadge(p.status);
                  return (
                    <div
                      key={p.id}
                      className="flex items-center gap-2 rounded-lg border border-border/60 bg-card/30 px-2.5 py-2"
                    >
                      <span
                        className={
                          "h-1.5 w-1.5 rounded-full " +
                          (p.status === "healthy"
                            ? "bg-emerald-400 shadow-[0_0_8px_var(--color-emerald-400)]"
                            : p.status === "fallback"
                              ? "bg-amber-400"
                              : p.status === "no-key"
                                ? "bg-muted"
                                : "bg-sky-400")
                        }
                      />
                      <span className="text-xs text-foreground/90 flex-1 truncate">{p.name}</span>
                      {p.queue > 0 && (
                        <span className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground">
                          <Zap className="h-2.5 w-2.5" />
                          {p.queue}
                        </span>
                      )}
                      <span
                        className={
                          "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-mono uppercase tracking-wider " +
                          badge.className
                        }
                      >
                        {badge.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
