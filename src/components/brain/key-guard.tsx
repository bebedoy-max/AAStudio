import { useEffect, useState, type FC } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { KeyRound, AlertTriangle } from "lucide-react";
import {
  checkKey,
  KEY_LABELS,
  KEY_DESCRIPTIONS,
  type KeyRequirement,
} from "@/lib/brain/availability";

function computeMissing(reqs: KeyRequirement[]): KeyRequirement[] {
  return reqs.filter((r) => !checkKey(r));
}

export function KeyGuard({
  requires,
  children,
}: {
  requires: KeyRequirement[];
  children: React.ReactNode;
}) {
  const navigate = useNavigate();
  const [missing, setMissing] = useState<KeyRequirement[]>(() =>
    typeof window === "undefined" ? [] : computeMissing(requires),
  );
  const [open, setOpen] = useState<boolean>(() =>
    typeof window === "undefined" ? false : computeMissing(requires).length > 0,
  );

  useEffect(() => {
    const refresh = () => {
      const m = computeMissing(requires);
      setMissing(m);
      setOpen(m.length > 0);
    };
    refresh();
    window.addEventListener("aatools:keys-changed", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("aatools:keys-changed", refresh);
      window.removeEventListener("storage", refresh);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requires.join(",")]);

  const goToTokens = () => {
    setOpen(false);
    navigate({ to: "/manage/tokens" });
  };

  return (
    <>
      {children}
      <Dialog open={open} onOpenChange={(v) => !v && setOpen(false)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-amber-500/15 border border-amber-500/40 flex items-center justify-center">
                <AlertTriangle className="h-5 w-5 text-amber-400" />
              </div>
              <div>
                <DialogTitle>API Key belum tersedia</DialogTitle>
                <DialogDescription>
                  Menu ini membutuhkan API di bawah untuk mengolah dan mengenerate data.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
          <ul className="mt-2 space-y-2">
            {missing.map((k) => (
              <li
                key={k}
                className="rounded-lg border border-border/60 bg-card/40 p-3 flex items-start gap-3"
              >
                <KeyRound className="h-4 w-4 mt-0.5 text-primary" />
                <div>
                  <div className="text-sm font-medium">{KEY_LABELS[k]}</div>
                  <div className="text-xs text-muted-foreground">{KEY_DESCRIPTIONS[k]}</div>
                </div>
              </li>
            ))}
          </ul>
          <DialogFooter className="mt-4">
            <Button onClick={goToTokens} className="w-full">
              OK, isi API Key sekarang
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function withKeyGuard<P extends object>(
  Component: FC<P>,
  requires: KeyRequirement[],
): FC<P> {
  const Wrapped: FC<P> = (props) => (
    <KeyGuard requires={requires}>
      <Component {...props} />
    </KeyGuard>
  );
  Wrapped.displayName = `withKeyGuard(${Component.displayName || Component.name || "Component"})`;
  return Wrapped;
}
