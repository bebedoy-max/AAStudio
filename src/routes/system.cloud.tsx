import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  Cloud,
  HardDrive,
  Loader2,
  Link2,
  Unlink,
  Trash2,
  Download,
  ExternalLink,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { DashboardShell, PageHero } from "@/components/dashboard/shell";
import { Card, GhostButton, PrimaryButton, GalleryEmpty, Input } from "@/components/dashboard/ui";
import { Chip } from "@/components/dashboard/os/section";
import { openConfirm } from "@/components/ai-influencer/dialogs";
import {
  getCloudStatus,
  listCloudFiles,
  deleteCloudFile,
  setCloudStorageMode,
  startDriveConnect,
  disconnectDrive,
} from "@/lib/cloud/cloud.functions";

export const Route = createFileRoute("/system/cloud")({
  component: CloudStoragePage,
  head: () => ({
    meta: [
      { title: "Cloud Storage — AA Creative Studio" },
      {
        name: "description",
        content:
          "Kelola penyimpanan media AA Creative Studio: cloud global aplikasi atau Google Drive pribadi, lengkap dengan download dan hapus file.",
      },
      { property: "og:title", content: "Cloud Storage — AA Creative Studio" },
      {
        property: "og:description",
        content:
          "Semua upload dan hasil generate tersimpan aman di cloud dan bisa diakses dari perangkat mana pun.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

type CloudFile = {
  id: string;
  name: string;
  kind: string;
  mimeType: string;
  size: number;
  storage: "global" | "personal";
  origin: string;
  source: string | null;
  createdAt: string;
  url: string;
};

const KINDS = ["all", "image", "video", "audio", "file"] as const;

function fmtSize(bytes: number) {
  if (!bytes) return "—";
  const mb = bytes / (1024 * 1024);
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function waitForOAuth(popup: Window) {
  return new Promise<void>((resolve, reject) => {
    let poll: number | undefined;
    const cleanup = () => {
      window.removeEventListener("message", onMessage);
      if (poll !== undefined) window.clearInterval(poll);
    };
    const onMessage = (event: MessageEvent) => {
      const type = (event.data as { type?: string; connectorId?: string })?.type;
      if (
        event.origin !== window.location.origin ||
        event.source !== popup ||
        (event.data as { connectorId?: string })?.connectorId !== "google_drive" ||
        (type !== "appUserConnectorOAuthComplete" && type !== "appUserConnectorOAuthFailed")
      )
        return;
      cleanup();
      if (type === "appUserConnectorOAuthComplete") return resolve();
      popup.close();
      reject(new Error("Koneksi Google Drive gagal."));
    };
    window.addEventListener("message", onMessage);
    poll = window.setInterval(() => {
      if (!popup.closed) return;
      cleanup();
      reject(new Error("Jendela OAuth ditutup sebelum selesai."));
    }, 500);
  });
}

function CloudStoragePage() {
  const _status = useServerFn(getCloudStatus);
  const _list = useServerFn(listCloudFiles);
  const _delete = useServerFn(deleteCloudFile);
  const _setMode = useServerFn(setCloudStorageMode);
  const _startConnect = useServerFn(startDriveConnect);
  const _disconnect = useServerFn(disconnectDrive);

  const [status, setStatus] = useState<{
    storageMode: "global" | "personal";
    personalConnected: boolean;
    accountEmail: string | null;
    globalAvailable: boolean;
  } | null>(null);
  const [files, setFiles] = useState<CloudFile[]>([]);
  const [kind, setKind] = useState<(typeof KINDS)[number]>("all");
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [s, rows] = await Promise.all([
        _status(),
        _list({ data: { kind: kind === "all" ? null : kind } }),
      ]);
      setStatus(s);
      setFiles(rows as CloudFile[]);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [_status, _list, kind]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const onConnect = async () => {
    const popup = window.open("", "drive-oauth", "width=600,height=720");
    if (!popup) {
      toast.error("Popup diblokir. Izinkan popup lalu coba lagi.");
      return;
    }
    setBusy(true);
    try {
      const { authorizationUrl } = await _startConnect();
      const done = waitForOAuth(popup);
      popup.location.href = authorizationUrl;
      await done;
      toast.success("Google Drive pribadi terhubung.");
      await reload();
    } catch (e) {
      popup.close();
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const onDisconnect = async () => {
    const ok = await openConfirm({
      title: "Putuskan Google Drive pribadi?",
      description:
        "File yang sudah ada di Drive Anda tetap aman, tapi aplikasi tidak bisa lagi menulis/membacanya sampai dihubungkan kembali. Penyimpanan kembali ke Global Cloud.",
      confirmLabel: "Putuskan",
      tone: "danger",
      icon: <Unlink className="h-5 w-5" />,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await _disconnect();
      toast.success("Google Drive pribadi diputuskan.");
      await reload();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const onMode = async (mode: "global" | "personal") => {
    setBusy(true);
    try {
      await _setMode({ data: { mode } });
      toast.success(mode === "global" ? "Memakai Global Cloud." : "Memakai Google Drive pribadi.");
      await reload();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const onDelete = async (f: CloudFile) => {
    const ok = await openConfirm({
      title: "Hapus file dari cloud?",
      description: `${f.name} akan dihapus permanen dari ${f.storage === "personal" ? "Google Drive Anda" : "Global Cloud"}.`,
      confirmLabel: "Hapus",
      tone: "danger",
      icon: <Trash2 className="h-5 w-5" />,
    });
    if (!ok) return;
    try {
      await _delete({ data: { id: f.id } });
      setFiles((p) => p.filter((x) => x.id !== f.id));
      toast.success("File dihapus.");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const visible = files.filter((f) => !q || f.name.toLowerCase().includes(q.toLowerCase()));

  return (
    <DashboardShell>
      <PageHero
        eyebrow="System · Cloud Storage"
        title="Cloud"
        highlight="Storage"
        desc="Semua file upload dan hasil generate otomatis tersimpan di cloud, jadi tetap bisa dipakai, di-download, atau dihapus dari perangkat mana pun."
        action={
          <GhostButton onClick={() => void reload()} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh
          </GhostButton>
        }
      />

      <Card
        title="Pilih penyimpanan"
        sub="Global Cloud disediakan aplikasi, atau pakai Google Drive milik Anda sendiri."
      >
        <div className="grid gap-3 md:grid-cols-2">
          <button
            onClick={() => void onMode("global")}
            disabled={busy || status?.storageMode === "global"}
            className={[
              "text-left rounded-2xl border p-4 transition",
              status?.storageMode === "global"
                ? "border-primary bg-primary/5"
                : "border-border bg-card/40 hover:bg-card/70",
            ].join(" ")}
          >
            <div className="flex items-center gap-2 font-medium">
              <Cloud className="h-4 w-4" /> Global Cloud
              {status?.storageMode === "global" && <Chip tone="primary">Aktif</Chip>}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Google Drive milik aplikasi. Tidak perlu setup — file Anda tersimpan di folder khusus
              akun Anda.
            </p>
          </button>

          <button
            onClick={() => void onMode("personal")}
            disabled={busy || !status?.personalConnected || status?.storageMode === "personal"}
            className={[
              "text-left rounded-2xl border p-4 transition disabled:opacity-60",
              status?.storageMode === "personal"
                ? "border-primary bg-primary/5"
                : "border-border bg-card/40 hover:bg-card/70",
            ].join(" ")}
          >
            <div className="flex items-center gap-2 font-medium">
              <HardDrive className="h-4 w-4" /> Google Drive saya
              {status?.storageMode === "personal" && <Chip tone="primary">Aktif</Chip>}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {status?.personalConnected
                ? `Terhubung${status.accountEmail ? ` — ${status.accountEmail}` : ""}. File masuk ke folder "AA Creative Studio" di Drive Anda.`
                : "Belum terhubung. Klik Hubungkan Google Drive di bawah."}
            </p>
          </button>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {status?.personalConnected ? (
            <GhostButton
              onClick={() => void onDisconnect()}
              disabled={busy}
              className="text-destructive hover:text-destructive"
            >
              <Unlink className="h-4 w-4" /> Putuskan Google Drive
            </GhostButton>
          ) : (
            <PrimaryButton onClick={() => void onConnect()} disabled={busy}>
              <Link2 className="h-4 w-4" /> Hubungkan Google Drive
            </PrimaryButton>
          )}
          {status && !status.globalAvailable && (
            <span className="text-xs text-destructive self-center">
              Global Cloud belum dikonfigurasi admin.
            </span>
          )}
        </div>
      </Card>

      <Card sub="File di cloud — bisa dibuka, di-download, atau dihapus kapan saja.">
        <div className="flex flex-wrap items-center gap-3">
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Cari nama file…"
            className="flex-1 min-w-[220px]"
          />
          <div className="flex flex-wrap gap-1.5">
            {KINDS.map((k) => (
              <button
                key={k}
                onClick={() => setKind(k)}
                className={[
                  "px-3 py-1.5 rounded-full text-xs border transition",
                  kind === k
                    ? "border-transparent text-primary-foreground glow-pink"
                    : "border-border bg-card/50",
                ].join(" ")}
                style={kind === k ? { background: "var(--gradient-neon)" } : undefined}
              >
                {k}
              </button>
            ))}
          </div>
        </div>
      </Card>

      {loading ? (
        <Card>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Memuat file cloud…
          </div>
        </Card>
      ) : visible.length === 0 ? (
        <GalleryEmpty label="Belum ada file di cloud. Upload atau generate sesuatu, file akan otomatis tersimpan di sini." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {visible.map((f) => (
            <div
              key={f.id}
              className="rounded-2xl border border-border bg-card/40 overflow-hidden flex flex-col"
            >
              <div className="aspect-square relative bg-black/40 grid place-items-center text-xs text-muted-foreground">
                {f.kind === "image" ? (
                  <img
                    src={f.url}
                    alt={f.name}
                    loading="lazy"
                    className="absolute inset-0 h-full w-full object-cover"
                  />
                ) : f.kind === "video" ? (
                  <video
                    src={f.url}
                    className="absolute inset-0 h-full w-full object-cover"
                    muted
                    playsInline
                  />
                ) : (
                  <span className="p-3 text-center break-all">{f.name}</span>
                )}
                <span className="absolute top-2 left-2">
                  <Chip tone="primary">{f.kind}</Chip>
                </span>
                <span className="absolute top-2 right-2">
                  <Chip>{f.storage === "personal" ? "Drive saya" : "Global"}</Chip>
                </span>
              </div>
              <div className="p-3 space-y-1">
                <div className="text-xs truncate" title={f.name}>
                  {f.name}
                </div>
                <div className="text-[10px] text-muted-foreground">
                  {fmtSize(f.size)} · {f.origin} · {new Date(f.createdAt).toLocaleString()}
                </div>
                <div className="flex gap-1 pt-1">
                  <a href={f.url} target="_blank" rel="noreferrer">
                    <GhostButton className="!px-2 !py-1 text-xs" title="Buka">
                      <ExternalLink className="h-3 w-3" />
                    </GhostButton>
                  </a>
                  <a href={`${f.url}?download=1`} download={f.name}>
                    <GhostButton className="!px-2 !py-1 text-xs" title="Download">
                      <Download className="h-3 w-3" />
                    </GhostButton>
                  </a>
                  <GhostButton
                    className="!px-2 !py-1 text-xs"
                    title="Hapus"
                    onClick={() => void onDelete(f)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </GhostButton>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </DashboardShell>
  );
}
