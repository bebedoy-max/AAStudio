import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { completeDriveConnect } from "@/lib/cloud/cloud.functions";

export const Route = createFileRoute("/oauth/google-drive/return")({
  component: DriveOAuthReturn,
  head: () => ({
    meta: [
      { title: "Menyelesaikan koneksi Google Drive" },
      { name: "robots", content: "noindex" },
    ],
  }),
});

function DriveOAuthReturn() {
  const [message, setMessage] = useState("Menyelesaikan koneksi Google Drive…");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const notify = (type: "appUserConnectorOAuthComplete" | "appUserConnectorOAuthFailed") => {
      window.opener?.postMessage({ type, connectorId: "google_drive" }, window.location.origin);
      window.close();
    };

    if (params.get("success") !== "true") {
      setMessage(params.get("error") ?? "OAuth tidak selesai.");
      notify("appUserConnectorOAuthFailed");
      return;
    }
    const code = params.get("code");
    if (!code) {
      if (params.get("offline_access_allowed") === "false") {
        notify("appUserConnectorOAuthComplete");
        return;
      }
      setMessage("OAuth selesai tanpa exchange code.");
      notify("appUserConnectorOAuthFailed");
      return;
    }
    void completeDriveConnect({ data: { code } })
      .then(() => notify("appUserConnectorOAuthComplete"))
      .catch((e) => {
        setMessage(`Gagal menyimpan koneksi: ${(e as Error).message}`);
        notify("appUserConnectorOAuthFailed");
      });
  }, []);

  return (
    <div className="min-h-screen grid place-items-center p-6 text-sm text-muted-foreground">
      <p>{message}</p>
    </div>
  );
}