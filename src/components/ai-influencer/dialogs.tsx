// Themed, aesthetic imperative modals to replace window.prompt / confirm.
// Usage: `await openPrompt({ title, placeholder })` returns string | null.
// Mount <DialogsHost /> once (done in ai-influencer.tsx).

import { useEffect, useState, type ReactNode } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input, PrimaryButton, GhostButton } from "@/components/dashboard/ui";
import { Sparkles } from "lucide-react";

type PromptOpts = {
  title: string;
  description?: string;
  placeholder?: string;
  defaultValue?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  multiline?: boolean;
  icon?: ReactNode;
};
type ConfirmOpts = {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "default" | "danger";
  icon?: ReactNode;
};

type Req =
  | { kind: "prompt"; id: number; opts: PromptOpts; resolve: (v: string | null) => void }
  | { kind: "confirm"; id: number; opts: ConfirmOpts; resolve: (v: boolean) => void };

const listeners = new Set<(r: Req) => void>();
let idc = 0;

export function openPrompt(opts: PromptOpts): Promise<string | null> {
  return new Promise((resolve) => {
    const req: Req = { kind: "prompt", id: ++idc, opts, resolve };
    listeners.forEach((fn) => fn(req));
  });
}
export function openConfirm(opts: ConfirmOpts): Promise<boolean> {
  return new Promise((resolve) => {
    const req: Req = { kind: "confirm", id: ++idc, opts, resolve };
    listeners.forEach((fn) => fn(req));
  });
}

export function DialogsHost() {
  const [current, setCurrent] = useState<Req | null>(null);
  const [value, setValue] = useState("");

  useEffect(() => {
    const fn = (r: Req) => {
      setCurrent(r);
      if (r.kind === "prompt") setValue(r.opts.defaultValue ?? "");
    };
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  }, []);

  const close = (result: string | null | boolean) => {
    if (!current) return;
    if (current.kind === "prompt") current.resolve(result as string | null);
    else current.resolve(Boolean(result));
    setCurrent(null);
    setValue("");
  };

  const open = current !== null;
  return (
    <Dialog open={open} onOpenChange={(v) => !v && close(current?.kind === "confirm" ? false : null)}>
      <DialogContent className="border-border/60 bg-[oklch(0.17_0.05_275)]/95 backdrop-blur-xl neumorph !max-w-md p-0 overflow-hidden">
        {current && (
          <div className="p-6">
            <DialogHeader className="mb-4">
              <div className="flex items-start gap-3">
                <div
                  className="h-10 w-10 shrink-0 rounded-2xl grid place-items-center text-primary-foreground glow-pink"
                  style={{ background: "var(--gradient-neon)" }}
                >
                  {current.opts.icon ?? <Sparkles className="h-5 w-5" />}
                </div>
                <div className="flex-1 min-w-0">
                  <DialogTitle className="font-display text-lg text-foreground text-left">
                    {current.opts.title}
                  </DialogTitle>
                  {current.opts.description && (
                    <DialogDescription className="text-xs text-muted-foreground mt-1 text-left">
                      {current.opts.description}
                    </DialogDescription>
                  )}
                </div>
              </div>
            </DialogHeader>

            {current.kind === "prompt" && (
              <div className="mb-5">
                {current.opts.multiline ? (
                  <textarea
                    autoFocus
                    rows={4}
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    placeholder={current.opts.placeholder}
                    className="w-full rounded-xl border border-border bg-card/50 px-3 py-2.5 text-sm outline-none placeholder:text-muted-foreground/70 focus:border-primary/60 focus:shadow-[var(--shadow-glow-cyan)] transition resize-y"
                  />
                ) : (
                  <Input
                    autoFocus
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    placeholder={current.opts.placeholder}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") close(value.trim() ? value : null);
                    }}
                  />
                )}
              </div>
            )}

            <div className="flex items-center justify-end gap-2">
              <GhostButton onClick={() => close(current.kind === "confirm" ? false : null)}>
                {current.opts.cancelLabel ?? "Batal"}
              </GhostButton>
              <PrimaryButton
                onClick={() =>
                  close(current.kind === "prompt" ? (value.trim() ? value : null) : true)
                }
              >
                {current.opts.confirmLabel ?? (current.kind === "confirm" ? "Konfirmasi" : "Simpan")}
              </PrimaryButton>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
