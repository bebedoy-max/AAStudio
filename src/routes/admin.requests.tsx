import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { DashboardShell, PageHero } from "@/components/dashboard/shell";
import { Card } from "@/components/dashboard/ui";
import { Loader2, ShieldCheck, Check, X, ExternalLink, Clock, CircleCheck, CircleX } from "lucide-react";
import { toast } from "sonner";
import { fulfillTokenPurchase } from "@/lib/token-bank/bank.functions";
import { promptDialog } from "@/components/ui-prompt";

export const Route = createFileRoute("/admin/requests")({
  head: () => ({
    meta: [
      { title: "Request Pembelian — Admin" },
      { name: "description", content: "Verifikasi permintaan pembelian fitur premium dari user." },
    ],
  }),
  component: AdminRequestsPage,
});

type Req = {
  id: string;
  user_id: string;
  route_key: string;
  price_idr: number;
  payment_method_name: string | null;
  proof_image_url: string | null;
  note: string | null;
  status: "pending" | "approved" | "rejected";
  admin_note: string | null;
  reviewed_at: string | null;
  activated_until: string | null;
  created_at: string;
  user_email?: string | null;
  user_display_name?: string | null;
};

function rupiah(n: number) {
  return "Rp " + n.toLocaleString("id-ID");
}

function parseFeaturesFromNote(note: string | null): string[] {
  if (!note) return [];
  const m = note.match(/\[FEATURES:([^\]]+)\]/);
  if (!m) return [];
  return m[1].split(",").map((s) => s.trim()).filter(Boolean);
}

function AdminRequestsPage() {
  return (
    <DashboardShell>
      <PageHero
        eyebrow="Admin"
        title="Request"
        highlight="Pembelian"
        desc="Verifikasi bukti pembayaran & aktifkan fitur premium user."
      />
      <Gate />
    </DashboardShell>
  );
}

function Gate() {
  const { loading, isAdmin } = useAuth();
  if (loading)
    return (
      <Card>
        <div className="p-8 grid place-items-center">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        </div>
      </Card>
    );
  if (!isAdmin)
    return (
      <Card>
        <div className="p-8 text-center">
          <ShieldCheck className="h-8 w-8 text-muted-foreground mx-auto" />
          <div className="mt-3 font-display text-lg">Akses ditolak</div>
          <p className="mt-1 text-sm text-muted-foreground">Halaman ini hanya untuk admin.</p>
        </div>
      </Card>
    );
  return <Body />;
}

function Body() {
  const { user } = useAuth();
  const [rows, setRows] = useState<Req[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"pending" | "approved" | "rejected" | "all">("pending");
  const [busy, setBusy] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const [{ data: reqs }, { data: profiles }] = await Promise.all([
      supabase.from("purchase_requests").select("*").order("created_at", { ascending: false }),
      supabase.from("profiles").select("id, email, display_name"),
    ]);
    const byId: Record<string, { email: string | null; display_name: string | null }> = {};
    ((profiles ?? []) as { id: string; email: string | null; display_name: string | null }[]).forEach(
      (p) => {
        byId[p.id] = { email: p.email, display_name: p.display_name };
      },
    );
    setRows(
      ((reqs ?? []) as Req[]).map((r) => ({
        ...r,
        user_email: byId[r.user_id]?.email ?? null,
        user_display_name: byId[r.user_id]?.display_name ?? null,
      })),
    );
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(
    () => (filter === "all" ? rows : rows.filter((r) => r.status === filter)),
    [rows, filter],
  );

  async function openProof(path: string | null) {
    if (!path) return;
    const { data } = await supabase.storage.from("payment-proofs").createSignedUrl(path, 300);
    if (data?.signedUrl) setPreviewUrl(data.signedUrl);
    else toast.error("Gagal memuat bukti");
  }

  async function decide(row: Req, status: "approved" | "rejected") {
    let admin_note: string | null = null;
    if (status === "rejected") {
      const reason = await promptDialog({
        title: "Tolak permintaan ini?",
        description: "Berikan alasan penolakan (opsional). User akan melihat catatan ini pada notifikasinya.",
        placeholder: "Alasan penolakan…",
        confirmLabel: "Tolak permintaan",
        cancelLabel: "Batal",
        multiline: true,
        allowEmpty: true,
      });
      if (reason === null) return; // user cancelled
      admin_note = reason;
    }
    setBusy(row.id);
    const { error } = await supabase
      .from("purchase_requests")
      .update({ status, admin_note, reviewed_by: user?.id ?? null, reviewed_at: new Date().toISOString() })
      .eq("id", row.id);
    if (error) {
      setBusy(null);
      return toast.error(error.message);
    }
    // Auto-fulfill token-bank purchases: pulls N keys from bank, appends encrypted
    // to buyer's user_tokens, marks bank rows as assigned. Idempotent server-side.
    if (status === "approved" && (row as unknown as { request_kind?: string }).request_kind === "token_bank") {
      try {
        await fulfillTokenPurchase({ data: { purchaseRequestId: row.id } });
        toast.success("Disetujui — token dikirim ke user");
      } catch (e) {
        toast.error("Approve OK tapi gagal kirim token: " + (e instanceof Error ? e.message : ""));
      }
    } else if (status === "approved") {
      // Bundle checkouts encode ALL feature route_keys in the note. Grant
      // route_permissions for every listed extra key so the whole bundle
      // activates, not just pr.route_key (which the DB trigger handles).
      const extras = parseFeaturesFromNote((row as unknown as { note?: string | null }).note ?? null)
        .filter((rk: string) => rk && rk !== row.route_key);
      if (extras.length > 0) {
        const until = new Date();
        until.setDate(until.getDate() + 30);
        const rpRows = extras.map((rk: string) => ({
          user_id: row.user_id,
          route_key: rk,
          expires_at: until.toISOString(),
        }));
        const { error: rpErr } = await supabase
          .from("route_permissions")
          .upsert(rpRows, { onConflict: "user_id,route_key" });
        if (rpErr) {
          toast.error("Approve OK tapi gagal aktifkan fitur bundle: " + rpErr.message);
        } else {
          toast.success(`Disetujui — ${extras.length + 1} fitur aktif 30 hari`);
        }
      } else {
        toast.success("Disetujui — fitur aktif 30 hari");
      }
    } else {
      toast.success("Ditolak");
    }
    setBusy(null);
    load();
  }

  const counts = useMemo(() => {
    const c = { pending: 0, approved: 0, rejected: 0 };
    rows.forEach((r) => (c[r.status] += 1));
    return c;
  }, [rows]);

  return (
    <>
      <Card>
        <div className="p-4 flex flex-wrap items-center gap-2">
          {(["pending", "approved", "rejected", "all"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={[
                "text-xs uppercase tracking-widest font-mono rounded-full px-3 py-1.5 border transition",
                filter === s
                  ? "border-primary/60 bg-primary/10 text-foreground"
                  : "border-border bg-card/40 text-muted-foreground hover:text-foreground",
              ].join(" ")}
            >
              {s}
              {s !== "all" && (
                <span className="ml-1.5 text-[10px] opacity-70">({counts[s]})</span>
              )}
            </button>
          ))}
        </div>
      </Card>

      <Card>
        {loading ? (
          <div className="p-8 grid place-items-center">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">Tidak ada request.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                <tr className="border-b border-border/60">
                  <th className="px-4 py-3">User</th>
                  <th className="px-4 py-3">Fitur</th>
                  <th className="px-4 py-3">Harga</th>
                  <th className="px-4 py-3">Metode</th>
                  <th className="px-4 py-3">Bukti</th>
                  <th className="px-4 py-3">Waktu</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id} className="border-b border-border/40 hover:bg-sidebar-accent/20 align-top">
                    <td className="px-4 py-3">
                      <div className="font-medium">{r.user_display_name || "—"}</div>
                      <div className="text-xs text-muted-foreground">{r.user_email}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-sm">{r.route_key}</div>
                    </td>
                    <td className="px-4 py-3 font-mono text-sm">{rupiah(r.price_idr)}</td>
                    <td className="px-4 py-3 text-sm">{r.payment_method_name ?? "—"}</td>
                    <td className="px-4 py-3">
                      {r.proof_image_url ? (
                        <button
                          onClick={() => openProof(r.proof_image_url)}
                          className="inline-flex items-center gap-1 text-xs rounded-full border border-border bg-card/50 px-2.5 py-1 hover:bg-card"
                        >
                          <ExternalLink className="h-3 w-3" /> Lihat
                        </button>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                      {r.note && (
                        <div className="mt-1 text-[11px] text-muted-foreground max-w-[200px] truncate" title={r.note}>
                          "{r.note}"
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {new Date(r.created_at).toLocaleString("id-ID")}
                      {r.activated_until && (
                        <div className="mt-0.5 text-emerald-400/80">
                          aktif s/d {new Date(r.activated_until).toLocaleDateString("id-ID")}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <StatusPill status={r.status} />
                      {r.admin_note && (
                        <div className="mt-1 text-[11px] text-muted-foreground max-w-[180px]">
                          {r.admin_note}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {r.status === "pending" ? (
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            disabled={busy === r.id}
                            onClick={() => decide(r, "approved")}
                            className="inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-60"
                            style={{ background: "var(--gradient-neon)" }}
                          >
                            {busy === r.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                            Approve
                          </button>
                          <button
                            disabled={busy === r.id}
                            onClick={() => decide(r, "rejected")}
                            className="inline-flex items-center gap-1 rounded-full border border-rose-400/40 text-rose-300 px-3 py-1.5 text-xs hover:bg-rose-500/10 disabled:opacity-60"
                          >
                            <X className="h-3 w-3" /> Tolak
                          </button>
                        </div>
                      ) : (
                        <div className="text-right text-xs text-muted-foreground">
                          {r.reviewed_at && new Date(r.reviewed_at).toLocaleDateString("id-ID")}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {previewUrl && (
        <div
          className="fixed inset-0 z-[80] grid place-items-center bg-background/80 backdrop-blur-sm p-4"
          onClick={() => setPreviewUrl(null)}
        >
          <div className="relative" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setPreviewUrl(null)}
              className="absolute -top-3 -right-3 h-9 w-9 grid place-items-center rounded-full border border-border bg-card"
            >
              <X className="h-4 w-4" />
            </button>
            <img src={previewUrl} alt="bukti" className="max-h-[85vh] max-w-[90vw] rounded-2xl border border-border" />
          </div>
        </div>
      )}
    </>
  );
}

function StatusPill({ status }: { status: "pending" | "approved" | "rejected" }) {
  const map = {
    pending: { icon: Clock, cls: "border-amber-400/50 text-amber-300 bg-amber-400/10", label: "pending" },
    approved: { icon: CircleCheck, cls: "border-emerald-400/50 text-emerald-300 bg-emerald-400/10", label: "approved" },
    rejected: { icon: CircleX, cls: "border-rose-400/50 text-rose-300 bg-rose-400/10", label: "rejected" },
  } as const;
  const { icon: Icon, cls, label } = map[status];
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-widest px-2 py-0.5 rounded-full border ${cls}`}>
      <Icon className="h-3 w-3" /> {label}
    </span>
  );
}