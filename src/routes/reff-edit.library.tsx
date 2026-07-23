import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { DashboardShell, PageHero } from "@/components/dashboard/shell";
import { Card, GhostButton } from "@/components/dashboard/ui";
import { useAuth } from "@/lib/auth-context";
import { loadRefs, saveRefs, type ReferenceItem } from "@/lib/reff-edit/store";

export const Route = createFileRoute("/reff-edit/library")({
  head: () => ({
    meta: [
      { title: "Reference Library — Reff EDIT" },
      {
        name: "description",
        content:
          "Simpan referensi visual beserta Reference DNA-nya untuk dipakai ulang tanpa upload ulang.",
      },
      { property: "og:title", content: "Reference Library — Reff EDIT" },
      {
        property: "og:description",
        content: "Bank referensi visual + DNA untuk workflow AI editing.",
      },
    ],
  }),
  component: LibraryPage,
});

function LibraryPage() {
  const { user } = useAuth();
  const uid = user?.id ?? null;
  const [items, setItems] = useState<ReferenceItem[]>([]);

  useEffect(() => {
    setItems(loadRefs(uid));
  }, [uid]);

  const removeOne = (id: string) => {
    const next = items.filter((i) => i.id !== id);
    setItems(next);
    saveRefs(uid, next);
  };

  return (
    <DashboardShell>
      <PageHero
        eyebrow="Reff EDIT"
        title="Reference"
        highlight="Library"
        desc="Reuse referensi + DNA yang sudah pernah dianalisa AI."
      />
      <Card
        title={`Koleksi (${items.length})`}
        sub="Tersimpan lokal per akun"
      >
        {items.length === 0 ? (
          <div className="text-sm text-muted-foreground">
            Belum ada referensi tersimpan. Simpan dari workspace Image/Video.
          </div>
        ) : (
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3">
            {items.map((it) => (
              <div
                key={it.id}
                className="rounded-2xl border border-border bg-card/40 overflow-hidden"
              >
                <div className="aspect-video bg-black/40 grid place-items-center">
                  {it.thumbnailUrl ? (
                    it.type === "image" ? (
                      <img
                        src={it.thumbnailUrl}
                        alt={it.name}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <video
                        src={it.thumbnailUrl}
                        className="h-full w-full object-cover"
                        muted
                      />
                    )
                  ) : (
                    <span className="text-xs text-muted-foreground">no preview</span>
                  )}
                </div>
                <div className="p-3 space-y-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">{it.name}</div>
                      <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-muted-foreground">
                        {it.type} · {it.category} · {it.role}
                      </div>
                    </div>
                    <GhostButton onClick={() => removeOne(it.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </GhostButton>
                  </div>
                  {it.dna?.visualStyle && (
                    <div className="text-xs text-foreground/80 line-clamp-2">
                      DNA: {it.dna.visualStyle}
                    </div>
                  )}
                  <div className="text-[10px] text-muted-foreground">
                    {new Date(it.createdAt).toLocaleString("id-ID")}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </DashboardShell>
  );
}
