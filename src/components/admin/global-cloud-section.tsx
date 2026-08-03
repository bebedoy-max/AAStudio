import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Cloud, Link2, Loader2, RefreshCw, Save, Unlink } from "lucide-react";
import { toast } from "sonner";
import { Card, GhostButton, PrimaryButton, Input } from "@/components/dashboard/ui";
import { Chip } from "@/components/dashboard/os/section";
import {
  getGlobalCloudSettings,
  saveGlobalCloudClient,
  setGlobalCloudEnabled,
  startGlobalCloudConnect,
  disconnectGlobalCloud,
} from "@/lib/cloud/admin-cloud.functions";

type Settings = {
  enabled: boolean;
  clientId: string;
  clientSecretSet: boolean;
  connected: boolean;
  accountEmail: string | null;
  rootFolderName: string;
  redirectUri: string;
  updatedAt: string | null;
};

function waitForOAuth(popup: Window) {
  return new Promise<void>((resolve, reject) => {
    let poll: number | undefined;
    const cleanup = () => {
      window.removeEventListener("message", onMessage);
      if (poll !== undefined) window.clearInterval(poll);
    };
    const onMessage = (event: MessageEvent) => {
      const data = event.data as { type?: string; connectorId?: string };
      if (
        event.origin !== window.location.origin ||
        data?.connectorId !== "google_drive" ||
        (data.type !== "appUserConnectorOAuthComplete" && data.type !== "appUserConnectorOAuthFailed")
      )
        return;
      cleanup();
      if (data.type === "appUserConnectorOAuthComplete") return resolve();
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

export function GlobalCloudSection() {
  const _get = useServerFn(getGlobalCloudSettings);
  const _save = useServerFn(saveGlobalCloudClient);
  const _toggle = useServerFn(setGlobalCloudEnabled);
  const _connect = useServerFn(startGlobalCloudConnect);
  const _disconnect = useServerFn(disconnectGlobalCloud);

  const [s, setS] = useState<Settings | null>(null);
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [folder, setFolder] = useState("AA Creative Studio");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const data = (await _get()) as Settings;
      setS(data);
      setClientId(data.clientId);
      setFolder(data.rootFolderName);
      setClientSecret("");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [_get]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const configDirty =
    !!s &&
    (clientId.trim() !== (s.clientId ?? "") ||
      folder.trim() !== (s.rootFolderName ?? "") ||
      clientSecret.trim().length > 0);

  const onSave = async () => {
    setBusy(true);
    try {
      await _save({ data: { clientId, clientSecret: clientSecret || undefined, rootFolderName: folder } });
      toast.success("Konfigurasi Google OAuth disimpan.");
      await reload();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const onConnect = async () => {
    const popup = window.open("", "global-drive-oauth", "width=600,height=720");
    if (!popup) return toast.error("Popup diblokir. Izinkan popup lalu coba lagi.");
    setBusy(true);
    try {
      const { authorizationUrl } = await _connect();
      const done = waitForOAuth(popup);
      popup.location.href = authorizationUrl;
      await done;
      toast.success("Global Cloud terhubung ke Google Drive.");
      await reload();
    } catch (e) {
      popup.close();
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const onDisconnect = async () => {
    setBusy(true);
    try {
      await _disconnect();
      toast.success("Global Cloud diputuskan.");
      await reload();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const onToggle = async (enabled: boolean) => {
    setBusy(true);
    try {
      await _toggle({ data: { enabled } });
      await reload();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Memuat konfigurasi Global Cloud…
        </div>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Card
        title="Global Cloud — Google Drive aplikasi"
        sub="Semua user tanpa Drive pribadi akan memakai Drive ini. Hanya admin yang bisa mengaturnya."
      >
        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center gap-2 text-sm">
            <Cloud className="h-4 w-4" /> Status:
            {s?.connected ? (
              <Chip tone="primary">Terhubung{s.accountEmail ? ` — ${s.accountEmail}` : ""}</Chip>
            ) : (
              <Chip>Belum terhubung</Chip>
            )}
            {s?.enabled ? <Chip tone="primary">Aktif</Chip> : <Chip>Nonaktif</Chip>}
          </span>
          <GhostButton onClick={() => void reload()} disabled={busy}>
            <RefreshCw className="h-4 w-4" /> Refresh
          </GhostButton>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <label className="text-xs text-muted-foreground">
            Google OAuth Client ID
            <Input value={clientId} onChange={(e) => setClientId(e.target.value)} placeholder="xxxx.apps.googleusercontent.com" />
          </label>
          <label className="text-xs text-muted-foreground">
            Google OAuth Client Secret {s?.clientSecretSet && "(tersimpan — isi untuk mengganti)"}
            <Input
              type="password"
              value={clientSecret}
              onChange={(e) => setClientSecret(e.target.value)}
              placeholder={s?.clientSecretSet ? "••••••••" : "GOCSPX-…"}
            />
          </label>
          <label className="text-xs text-muted-foreground">
            Nama folder root di Drive
            <Input value={folder} onChange={(e) => setFolder(e.target.value)} />
          </label>
          <label className="text-xs text-muted-foreground">
            Authorized redirect URI (daftarkan di Google Cloud Console)
            <Input value={s?.redirectUri ?? ""} readOnly onFocus={(e) => e.currentTarget.select()} />
          </label>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <PrimaryButton onClick={() => void onSave()} disabled={busy || !clientId.trim() || !configDirty}>
            <Save className="h-4 w-4" /> Simpan konfigurasi
          </PrimaryButton>
          {s?.connected ? (
            <>
              <GhostButton onClick={() => void onConnect()} disabled={busy}>
                <Link2 className="h-4 w-4" /> Hubungkan ulang
              </GhostButton>
              <GhostButton onClick={() => void onDisconnect()} disabled={busy} className="text-destructive hover:text-destructive">
                <Unlink className="h-4 w-4" /> Putuskan
              </GhostButton>
            </>
          ) : (
            <PrimaryButton onClick={() => void onConnect()} disabled={busy || !s?.clientId}>
              <Link2 className="h-4 w-4" /> Hubungkan Google Drive admin
            </PrimaryButton>
          )}
          <GhostButton onClick={() => void onToggle(!s?.enabled)} disabled={busy}>
            {s?.enabled ? "Nonaktifkan Global Cloud" : "Aktifkan Global Cloud"}
          </GhostButton>
        </div>

        <p className="mt-4 text-xs text-muted-foreground leading-relaxed">
          Cara setup: buka Google Cloud Console → APIs &amp; Services → Credentials → buat <b>OAuth client ID</b> tipe
          <b> Web application</b>, aktifkan <b>Google Drive API</b>, tambahkan redirect URI di atas, lalu tempel Client ID
          &amp; Secret di sini dan klik Hubungkan memakai akun Google yang dipakai sebagai penyimpanan aplikasi.
        </p>
      </Card>
    </div>
  );
}
