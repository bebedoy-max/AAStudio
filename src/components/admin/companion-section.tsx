// Admin: status perangkat Companion (Android GoPay listener) + log event terakhir.
import { useEffect, useState } from "react";
import { Loader2, Smartphone, RefreshCw, Power, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/dashboard/ui";
import { confirmDialog } from "@/components/ui-confirm";
import {
  listCompanionDevices,
  listCompanionEvents,
  setCompanionDeviceActive,
  deleteCompanionDevice,
  type CompanionDeviceRow,
  type CompanionEventRow,
} from "@/lib/companion/admin.functions";

function rupiah(n: number) {
  return "Rp " + n.toLocaleString("id-ID");
}

function timeAgo(iso: string | null) {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(diff)) return "—";
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "baru saja";
  if (m < 60) return `${m} mnt lalu`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} jam lalu`;
  return `${Math.floor(h / 24)} hari lalu`;
}

const STATUS_STYLE: Record<string, string> = {
  matched: "border-emerald-400/40 text-emerald-300",
  paid: "border-emerald-400/40 text-emerald-300",
  ambiguous: "border-amber-400/40 text-amber-300",
  no_candidate: "border-border text-muted-foreground",
  error: "border-destructive/50 text-destructive",
};

export function CompanionSection() {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [devices, setDevices] = useState<CompanionDeviceRow[]>([]);
  const [events, setEvents] = useState<CompanionEventRow[]>([]);

  async function load() {
    setLoading(true);
    try {
      const [d, e] = await Promise.all([
        listCompanionDevices().catch(() => [] as CompanionDeviceRow[]),
        listCompanionEvents().catch(() => [] as CompanionEventRow[]),
      ]);
      setDevices(d);
      setEvents(e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function toggle(row: CompanionDeviceRow) {
    setBusy(row.id);
    try {
      await setCompanionDeviceActive({ data: { id: row.id, active: !row.active } });
      setDevices((list) =>
        list.map((d) => (d.id === row.id ? { ...d, active: !row.active } : d)),
      );
      toast.success(!row.active ? "Perangkat diaktifkan" : "Perangkat dinonaktifkan");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal mengubah status");
    } finally {
      setBusy(null);
    }
  }

  async function remove(row: CompanionDeviceRow) {
    const ok = await confirmDialog({
      title: "Hapus perangkat?",
      description: `Token perangkat ${row.device_name ?? row.device_id} langsung tidak berlaku. Perangkat harus register ulang.`,
      confirmLabel: "Hapus",
      tone: "danger",
    });
    if (!ok) return;
    setBusy(row.id);
    try {
      await deleteCompanionDevice({ data: { id: row.id } });
      setDevices((list) => list.filter((d) => d.id !== row.id));
      toast.success("Perangkat dihapus");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal menghapus");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card
      title="Companion GoPay (Android)"
      sub="Perangkat yang membaca notifikasi GoPay Merchant lalu mencocokkan nominal dengan pesanan pending (jendela 90 menit)."
    >
      <div className="mb-3 flex justify-end">
        <button
          onClick={() => void load()}
          className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card/50 px-3.5 py-1.5 text-xs hover:bg-sidebar-accent/60"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Muat ulang
        </button>
      </div>

      {loading ? (
        <div className="p-8 grid place-items-center">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
              Perangkat terdaftar
            </div>
            {devices.length === 0 ? (
              <div className="rounded-2xl border border-border bg-card/40 p-4 text-xs text-muted-foreground">
                Belum ada perangkat. Install APK Companion, isi enrollment secret, lalu register.
              </div>
            ) : (
              devices.map((d) => (
                <div
                  key={d.id}
                  className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-card/40 p-3"
                >
                  <Smartphone className="h-4 w-4 text-muted-foreground" />
                  <div className="min-w-[200px]">
                    <div className="text-sm font-medium">{d.device_name ?? "Perangkat Android"}</div>
                    <div className="font-mono text-[10px] text-muted-foreground break-all">
                      {d.device_id}
                    </div>
                  </div>
                  <span
                    className={`rounded-full border px-2.5 py-1 text-[10px] font-mono ${
                      d.active
                        ? "border-emerald-400/40 text-emerald-300"
                        : "border-border text-muted-foreground"
                    }`}
                  >
                    {d.active ? "Aktif" : "Nonaktif"}
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    Terakhir aktif: {timeAgo(d.last_seen_at)}
                  </span>
                  {d.android_version && (
                    <span className="text-[11px] text-muted-foreground">
                      Android {d.android_version}
                    </span>
                  )}
                  <div className="ml-auto flex items-center gap-2">
                    <button
                      onClick={() => void toggle(d)}
                      disabled={busy === d.id}
                      className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card/50 px-3 py-1.5 text-xs hover:bg-sidebar-accent/60 disabled:opacity-60"
                    >
                      {busy === d.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Power className="h-3.5 w-3.5" />
                      )}
                      {d.active ? "Nonaktifkan" : "Aktifkan"}
                    </button>
                    <button
                      onClick={() => void remove(d)}
                      disabled={busy === d.id}
                      className="inline-flex items-center gap-1.5 rounded-full border border-destructive/40 px-3 py-1.5 text-xs text-destructive hover:bg-destructive/10 disabled:opacity-60"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Hapus
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="flex flex-col gap-2">
            <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
              Log notifikasi terakhir
            </div>
            {events.length === 0 ? (
              <div className="rounded-2xl border border-border bg-card/40 p-4 text-xs text-muted-foreground">
                Belum ada notifikasi pembayaran yang masuk.
              </div>
            ) : (
              <div className="overflow-x-auto rounded-2xl border border-border bg-card/40">
                <table className="w-full text-left text-xs">
                  <thead className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                    <tr className="border-b border-border/60">
                      <th className="px-3 py-2">Waktu</th>
                      <th className="px-3 py-2">Nominal</th>
                      <th className="px-3 py-2">Status</th>
                      <th className="px-3 py-2">Pesanan</th>
                      <th className="px-3 py-2">Notifikasi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {events.map((e) => (
                      <tr key={e.id} className="border-b border-border/40 last:border-0">
                        <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">
                          {new Date(e.received_at ?? e.created_at).toLocaleString("id-ID")}
                        </td>
                        <td className="px-3 py-2 font-mono whitespace-nowrap">{rupiah(e.amount)}</td>
                        <td className="px-3 py-2">
                          <span
                            className={`rounded-full border px-2 py-0.5 text-[10px] font-mono ${
                              STATUS_STYLE[e.status] ?? "border-border text-muted-foreground"
                            }`}
                          >
                            {e.status}
                          </span>
                        </td>
                        <td className="px-3 py-2 font-mono text-[10px] text-muted-foreground">
                          {e.matched_purchase_id ? e.matched_purchase_id.slice(0, 8) : "—"}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground max-w-[280px] truncate">
                          {e.notification_title ?? e.notification_text ?? "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}
