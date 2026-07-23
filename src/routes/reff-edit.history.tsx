import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { DashboardShell, PageHero } from "@/components/dashboard/shell";
import { Card, GhostButton } from "@/components/dashboard/ui";
import { useAuth } from "@/lib/auth-context";
import { loadHistory, saveHistory, type HistoryItem } from "@/lib/reff-edit/store";

export const Route = createFileRoute("/reff-edit/history")({
  head: () => ({
    meta: [
      { title: "Edit History — Reff EDIT" },
      {
        name: "description",
        content:
          "Riwayat hasil edit berbasis referensi: blueprint, provider, dan output.",
      },
      { property: "og:title", content: "Edit History — Reff EDIT" },
      {
        property: "og:description",
        content: "History editing AI Reference Based Editing Workspace.",
      },
    ],
  }),
  component: HistoryPage,
});

function HistoryPage() {
  const { user } = useAuth();
  const uid = user?.id ?? null;
  const [items, setItems] = useState<HistoryItem[]>([]);

  useEffect(() => {
    setItems(loadHistory(uid));
  }, [uid]);

  const clearAll = () => {
    setItems([]);
    saveHistory(uid, []);
  };

  return (
    <DashboardShell>
      <PageHero
        eyebrow="Reff EDIT"
        title="Edit"
        highlight="History"
        desc="Semua run editing tercatat di sini beserta blueprint & output."
      />
      <Card
        title={`Riwayat (${items.length})`}
        sub="Tersimpan lokal per akun"
        right={
          items.length > 0 ? (
            <GhostButton onClick={clearAll}>Hapus semua</GhostButton>
          ) : undefined
        }
      >
        {items.length === 0 ? (
          <div className="text-sm text-muted-foreground">
            Belum ada history. Jalankan render di Image/Video Reference Edit.
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {items.map((h) => (
              <div
                key={h.id}
                className="rounded-2xl border border-border bg-card/40 p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium">
                      {h.mode.toUpperCase()} · {h.status} ·{" "}
                      {h.providerUsed || "-"}
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      {new Date(h.createdAt).toLocaleString("id-ID")} ·{" "}
                      {h.durationMs ? `${(h.durationMs / 1000).toFixed(1)}s` : "-"}
                    </div>
                  </div>
                  {h.outputUrl &&
                    (h.mode === "image" ? (
                      <img
                        src={h.outputUrl}
                        alt="output"
                        className="h-16 w-16 object-cover rounded-lg border border-border"
                      />
                    ) : (
                      <video
                        src={h.outputUrl}
                        className="h-16 w-16 object-cover rounded-lg border border-border"
                        muted
                      />
                    ))}
                </div>
                {h.dna?.visualStyle && (
                  <div className="text-xs text-foreground/80 mt-2">
                    DNA: {h.dna.visualStyle}
                  </div>
                )}
                {h.blueprint && h.blueprint.length > 0 && (
                  <div className="text-[11px] text-muted-foreground mt-1">
                    {h.blueprint.length} scene ·{" "}
                    {h.blueprint
                      .map((s) => s.name)
                      .slice(0, 3)
                      .join(", ")}
                    {h.blueprint.length > 3 ? "…" : ""}
                  </div>
                )}
                {h.error && (
                  <div className="text-xs text-red-400 mt-1">{h.error}</div>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>
    </DashboardShell>
  );
}
