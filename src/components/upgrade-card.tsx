import { useEffect, useMemo, useState } from "react";
import { Zap, X, Check, Clock, Sparkles } from "lucide-react";
import { useAuth, ALL_ROUTE_KEYS } from "@/lib/auth-context";
import { useUpgradePrompt, closeUpgradePrompt } from "@/lib/stores/upgrade-prompt";
import { supabase } from "@/integrations/supabase/client";
import { CheckoutDialog } from "@/components/checkout-dialog";
import { MidtransQrisPanel } from "@/components/payments/midtrans-qris-panel";

// Pending purchase considered stale after 1 hour (matches Midtrans QRIS expiry).
const PENDING_TTL_MS = 60 * 60 * 1000;

type PendingRow = { id: string; route_key: string; price_idr: number; created_at: string };

const FULL_ACCESS_KEY = "__full_access__";

function formatRupiah(n: number) {
  return "Rp " + n.toLocaleString("id-ID");
}

export function UpgradeCard() {
  const { isAdmin, isFeatureEnabled } = useAuth();
  const [open, setOpen] = useState(false);

  const hasFullAccess = useMemo(() => {
    if (isAdmin) return true;
    // If every premium feature is already enabled (via permission, public mode,
    // or active trial), there is nothing left to upgrade to.
    return ALL_ROUTE_KEYS.every((r) => isFeatureEnabled(r.key));
  }, [isAdmin, isFeatureEnabled]);

  if (hasFullAccess) return null;

  return (
    <>
      <div className="mt-auto neumorph p-4 relative overflow-hidden">
        <div
          className="absolute -top-8 -right-8 h-24 w-24 rounded-full opacity-40 blur-2xl"
          style={{ background: "var(--gradient-neon)" }}
        />
        <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
          Upgrade
        </div>
        <div className="mt-1 font-display text-base text-foreground">
          Buka semua fitur premium
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Motion Control, Storyboard, Bulk Fashion, Naratif Video, dan banyak lainnya..
        </p>
        <button
          onClick={() => setOpen(true)}
          className="mt-3 inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-semibold text-primary-foreground"
          style={{ background: "var(--gradient-neon)" }}
        >
          <Zap className="h-3.5 w-3.5" /> Upgrade
        </button>
      </div>

      {open && <UpgradeDialog onClose={() => setOpen(false)} />}
    </>
  );
}

// Host that listens to the global upgrade-prompt store.
// Mount this once (e.g. in DashboardShell) so any page can trigger it.
export function UpgradeDialogHost() {
  const { open, featureKey } = useUpgradePrompt();
  if (!open) return null;
  return <UpgradeDialog onClose={closeUpgradePrompt} preselectedFeature={featureKey} />;
}

export function UpgradeDialog({
  onClose,
  preselectedFeature,
}: {
  onClose: () => void;
  preselectedFeature?: string;
}) {
  const { routePermissions, featureAccess, user } = useAuth();
  const [prices, setPrices] = useState<Record<string, { label: string; price_idr: number }>>({});
  const [pendingRows, setPendingRows] = useState<PendingRow[]>([]);
  const [selected, setSelected] = useState<string[]>(preselectedFeature ? [preselectedFeature] : []);
  const [bundle, setBundle] = useState(false);
  const [checkout, setCheckout] = useState(false);
  const [resume, setResume] = useState<PendingRow | null>(null);

  useEffect(() => {
    if (preselectedFeature) {
      setSelected((s) => (s.includes(preselectedFeature) ? s : [...s, preselectedFeature]));
    }
  }, [preselectedFeature]);

  const loadPending = async () => {
    if (!user) return;
    const cutoff = new Date(Date.now() - PENDING_TTL_MS).toISOString();
    const { data } = await supabase
      .from("purchase_requests")
      .select("id, route_key, price_idr, created_at")
      .eq("user_id", user.id)
      .eq("status", "pending")
      .gte("created_at", cutoff)
      .order("created_at", { ascending: false });
    setPendingRows(((data ?? []) as PendingRow[]));
  };

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("feature_prices").select("route_key, label, price_idr").eq("is_active", true);
      const map: Record<string, { label: string; price_idr: number }> = {};
      ((data ?? []) as { route_key: string; label: string; price_idr: number }[]).forEach((r) => {
        map[r.route_key] = { label: r.label, price_idr: r.price_idr };
      });
      setPrices(map);
    })();
    loadPending();
  }, [user?.id]);

  const pendingKeys = useMemo(() => pendingRows.map((r) => r.route_key), [pendingRows]);

  // Only show features that are:
  //   - not already unlocked for this user (no permission granted)
  //   - actually gated by subscription (mode === 'subscription'; default when
  //     the admin hasn't configured it, which matches the access page default)
  //   - have an active, non-zero price
  const availableFeatures = ALL_ROUTE_KEYS.filter((f) => {
    if (routePermissions.includes(f.key)) return false;
    const mode = featureAccess[f.key]?.mode ?? "subscription";
    if (mode !== "subscription") return false;
    const price = prices[f.key]?.price_idr;
    if (!price || price <= 0) return false;
    return true;
  });

  const isPending = (k: string) => pendingKeys.includes(k);
  const pendingFor = (k: string) => pendingRows.find((r) => r.route_key === k) ?? null;

  const bundlePrice = prices[FULL_ACCESS_KEY];
  const bundleAvailable = !!bundlePrice && availableFeatures.length > 1;

  const toggle = (key: string) => {
    if (isPending(key)) {
      const row = pendingFor(key);
      if (row) setResume(row);
      return;
    }
    if (bundle) setBundle(false);
    setSelected((s) => (s.includes(key) ? s.filter((k) => k !== key) : [...s, key]));
  };

  const activateBundle = () => {
    if (!bundleAvailable) return;
    setBundle(true);
    setSelected(availableFeatures.filter((f) => !isPending(f.key)).map((f) => f.key));
  };

  const total = useMemo(
    () =>
      bundle && bundlePrice
        ? bundlePrice.price_idr
        : selected.reduce((sum, k) => sum + (prices[k]?.price_idr ?? 0), 0),
    [selected, prices, bundle, bundlePrice],
  );

  const individualTotal = useMemo(
    () => availableFeatures.reduce((s, f) => s + (prices[f.key]?.price_idr ?? 0), 0),
    [availableFeatures, prices],
  );
  const savings = bundlePrice ? Math.max(0, individualTotal - bundlePrice.price_idr) : 0;

  const handleContinue = () => {
    if (selected.length === 0) return;
    setCheckout(true);
  };

  if (checkout) {
    return (
      <CheckoutDialog
        featureKeys={selected}
        bundleLabel={bundle ? bundlePrice?.label ?? null : null}
        bundlePrice={bundle ? bundlePrice?.price_idr ?? null : null}
        onClose={() => setCheckout(false)}
        onSubmitted={() => {
          // Refresh pending list but DO NOT close the upgrade dialog — the
          // CheckoutDialog now shows the QRIS panel and closing would kill it.
          loadPending();
        }}
      />
    );
  }

  if (resume) {
    return (
      <ResumePaymentDialog
        row={resume}
        onClose={() => {
          setResume(null);
          loadPending();
        }}
      />
    );
  }


  return (
    <div
      className="fixed inset-0 z-[60] grid place-items-center bg-background/70 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="neumorph w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 relative"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-3 right-3 h-9 w-9 grid place-items-center rounded-full border border-border bg-card/50 hover:bg-sidebar-accent/60"
          aria-label="Tutup"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="text-[11px] font-mono uppercase tracking-[0.25em] text-muted-foreground">
          Upgrade Akses
        </div>
        <h2 className="mt-1 font-display text-2xl font-bold">
          Pilih fitur <span className="text-gradient">premium</span>
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Beli akses per fitur untuk 30 hari. Bayar → upload bukti → admin verifikasi → fitur aktif otomatis.
        </p>

        {bundleAvailable && (
          <button
            type="button"
            onClick={() => (bundle ? setBundle(false) : activateBundle())}
            className={[
              "mt-5 w-full text-left rounded-2xl border p-4 transition-all relative overflow-hidden",
              bundle
                ? "border-primary/60 bg-primary/[0.10]"
                : "border-primary/30 bg-primary/[0.04] hover:bg-primary/[0.08]",
            ].join(" ")}
          >
            <div
              aria-hidden
              className="absolute -top-10 -right-10 h-32 w-32 rounded-full opacity-30 blur-3xl"
              style={{ background: "var(--gradient-neon)" }}
            />
            <div className="relative flex items-start gap-3">
              <span
                className={[
                  "h-9 w-9 grid place-items-center rounded-xl shrink-0 text-primary-foreground",
                ].join(" ")}
                style={{ background: "var(--gradient-neon)" }}
              >
                <Sparkles className="h-4 w-4" />
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="font-display text-base">{bundlePrice?.label}</div>
                  {savings > 0 && (
                    <span className="text-[10px] font-mono uppercase tracking-widest rounded-full border border-emerald-400/40 bg-emerald-400/10 text-emerald-300 px-2 py-0.5">
                      Hemat {formatRupiah(savings)}
                    </span>
                  )}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  Semua fitur premium aktif 30 hari dengan satu harga diskon.
                </div>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="font-display text-xl text-gradient">
                    {formatRupiah(bundlePrice?.price_idr ?? 0)}
                  </span>
                  {individualTotal > 0 && (
                    <span className="text-xs text-muted-foreground line-through">
                      {formatRupiah(individualTotal)}
                    </span>
                  )}
                </div>
              </div>
              <span
                className={[
                  "h-5 w-5 grid place-items-center rounded-md border shrink-0 mt-1",
                  bundle ? "border-primary bg-primary text-primary-foreground" : "border-border",
                ].join(" ")}
              >
                {bundle && <Check className="h-3.5 w-3.5" />}
              </span>
            </div>
          </button>
        )}

        {/* Per-feature list */}
        <div className="mt-5">
            <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-2">
              {bundle ? "Termasuk semua fitur di bawah" : `Atau pilih per fitur (${selected.length} dipilih)`}
            </div>
            {availableFeatures.length === 0 ? (
              <div className="text-sm text-muted-foreground p-4 border border-border rounded-xl">
                Semua fitur sudah terbuka untuk akun Anda.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-72 overflow-y-auto pr-1">
                {availableFeatures.map((f) => {
                  const checked = selected.includes(f.key);
                  const pending = isPending(f.key);
                  const price = prices[f.key]?.price_idr;
                  return (
                    <label
                      key={f.key}
                      className={[
                        "flex items-center gap-3 rounded-xl border px-3 py-2.5 transition-all",
                        bundle ? "cursor-default opacity-70" : "cursor-pointer",
                        pending
                          ? "border-amber-500/40 bg-amber-500/[0.06] cursor-not-allowed"
                          : checked
                          ? "border-primary/60 bg-primary/[0.08]"
                          : "border-border bg-card/40 hover:bg-sidebar-accent/40",
                      ].join(" ")}
                    >
                      <span
                        className={[
                          "h-5 w-5 grid place-items-center rounded-md border shrink-0",
                          checked ? "border-primary bg-primary text-primary-foreground" : "border-border",
                        ].join(" ")}
                      >
                        {checked && <Check className="h-3.5 w-3.5" />}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm text-foreground truncate">{f.label}</div>
                        {pending ? (
                          <div className="text-[10px] font-mono uppercase tracking-widest text-amber-400 flex items-center gap-1">
                            <Clock className="h-3 w-3" /> menunggu verifikasi
                          </div>
                        ) : (
                          <div className="text-[10px] font-mono text-muted-foreground">
                            {price ? `${formatRupiah(price)} / 30 hari` : "—"}
                          </div>
                        )}
                      </div>
                      <input
                        type="checkbox"
                        className="sr-only"
                        checked={checked}
                        disabled={pending}
                        onChange={() => toggle(f.key)}
                      />
                    </label>
                  );
                })}
              </div>
            )}
          </div>

        {/* Footer */}
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-border/60">
          <div>
            <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
              Total
            </div>
            <div className="font-display text-2xl text-gradient">
              {formatRupiah(total)}
              <span className="text-xs text-muted-foreground font-sans"> / 30 hari</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="rounded-full border border-border bg-card/50 px-4 py-2 text-sm hover:bg-sidebar-accent/60"
            >
              Batal
            </button>
            <button
              onClick={handleContinue}
              disabled={selected.length === 0}
              className="inline-flex items-center gap-1.5 rounded-full px-5 py-2 text-sm font-semibold text-primary-foreground"
              style={{ background: "var(--gradient-neon)", opacity: selected.length === 0 ? 0.5 : 1 }}
            >
              <Zap className="h-4 w-4" /> Lanjut ke Pembayaran
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ResumePaymentDialog({ row, onClose }: { row: PendingRow; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-[70] grid place-items-center bg-background/80 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="neumorph w-full max-w-md max-h-[92vh] overflow-y-auto p-6 relative"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-3 right-3 h-9 w-9 grid place-items-center rounded-full border border-border bg-card/50 hover:bg-sidebar-accent/60"
          aria-label="Tutup"
        >
          <X className="h-4 w-4" />
        </button>
        <div className="text-[11px] font-mono uppercase tracking-[0.25em] text-muted-foreground">
          Lanjutkan pembayaran
        </div>
        <h2 className="mt-1 font-display text-xl font-bold">
          Selesaikan <span className="text-gradient">QRIS</span>
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Pesanan masih menunggu pembayaran. Scan QRIS di bawah untuk menyelesaikan.
        </p>
        <div className="mt-4">
          <MidtransQrisPanel
            purchaseRequestId={row.id}
            amount={row.price_idr}
            onApproved={onClose}
          />
        </div>
      </div>
    </div>
  );
}
