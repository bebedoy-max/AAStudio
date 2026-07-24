import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Download, Trash2 } from "lucide-react";
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

  const removeOne = (id: string) => {
    const next = items.filter((i) => i.id !== id);
    setItems(next);
    saveHistory(uid, next);
  };

  const download = async (h: HistoryItem) => {
    if (!h.outputUrl) return;
    try {
      const ext = h.mode === "image" ? "png" : "mp4";
      const filename = `reff-edit-${h.mode}-${h.id}.${ext}`;
      let href = h.outputUrl;
      if (/^https?:\/\//i.test(href)) {
        const r = await fetch(href).catch(() => null);
        if (r && r.ok) href = URL.createObjectURL(await r.blob());
      }
      const a = document.createElement("a");
      a.href = href;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      if (href !== h.outputUrl) setTimeout(() => URL.revokeObjectURL(href), 4000);
    } catch {
      /* ignore */
    }
  };

  return (
    <DashboardShell>
      <PageHero
        eyebrow="Reff EDIT"
        title="Edit"
        highlight="History"
        desc="Semua run editing tersimpan lokal per akun: thumbnail, blueprint, provider, dan link output."
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
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3">
            {items.map((h) => (
              <div
                key={h.id}
                className="rounded-2xl border border-border bg-card/40 overflow-hidden flex flex-col"
              >
                <HistoryThumb h={h} />
                <div className="p-3 flex-1 flex flex-col gap-1">
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`text-[10px] font-mono uppercase tracking-[0.18em] px-2 py-0.5 rounded ${
                        h.status === "success"
                          ? "bg-emerald-500/15 text-emerald-300"
                          : h.status === "error"
                            ? "bg-red-500/15 text-red-300"
                            : "bg-amber-500/15 text-amber-300"
                      }`}
                    >
                      {h.mode} · {h.status}
                    </span>
                    <div className="flex items-center gap-1">
                      {h.outputUrl && h.status === "success" && (
                        <button
                          type="button"
                          onClick={() => void download(h)}
                          className="h-7 w-7 grid place-items-center rounded-md border border-border text-muted-foreground hover:text-primary hover:border-primary/60 transition"
                          title="Download output"
                          aria-label="Download output"
                        >
                          <Download className="h-3.5 w-3.5" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => removeOne(h.id)}
                        className="h-7 w-7 grid place-items-center rounded-md border border-border text-muted-foreground hover:text-red-400 hover:border-red-400/60 transition"
                        title="Hapus entry"
                        aria-label="Hapus entry"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    {new Date(h.createdAt).toLocaleString("id-ID")} ·{" "}
                    {h.durationMs ? `${(h.durationMs / 1000).toFixed(1)}s` : "-"} ·{" "}
                    {h.providerUsed || "-"}
                  </div>
                  {h.dna?.visualStyle && (
                    <div className="text-xs text-foreground/80 line-clamp-2">
                      DNA: {h.dna.visualStyle}
                    </div>
                  )}
                  {h.blueprint && h.blueprint.length > 0 && (
                    <div className="text-[11px] text-muted-foreground line-clamp-2">
                      {h.blueprint.length} scene ·{" "}
                      {h.blueprint.map((s) => s.name).slice(0, 3).join(", ")}
                      {h.blueprint.length > 3 ? "…" : ""}
                    </div>
                  )}
                  {h.error && (
                    <div className="text-xs text-red-400">{h.error}</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </DashboardShell>
  );
}

function HistoryThumb({ h }: { h: HistoryItem }) {
  const thumb = h.thumbnailUrl;
  const output = h.outputUrl;
  return (
    <div className="aspect-video bg-black/50 grid place-items-center relative overflow-hidden">
      {thumb ? (
        <img src={thumb} alt="output" className="w-full h-full object-cover" />
      ) : output && h.mode === "image" ? (
        <img src={output} alt="output" className="w-full h-full object-cover" />
      ) : output && h.mode === "video" && /^https?:\/\//i.test(output) ? (
        <video src={output} className="w-full h-full object-cover" muted preload="metadata" />
      ) : (
        <span className="text-[11px] text-muted-foreground px-3 text-center">
          {h.status === "error" ? "Render gagal" : "Thumbnail tidak tersedia"}
        </span>
      )}
      {h.mode === "video" && (thumb || output) && (
        <span className="absolute bottom-2 left-2 text-[10px] font-mono uppercase tracking-widest bg-background/70 backdrop-blur px-2 py-0.5 rounded border border-border">
          Video
        </span>
      )}
    </div>
  );
}
