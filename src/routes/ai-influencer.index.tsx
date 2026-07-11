import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Plus, Users, Sparkles, Image as ImageIcon, Trash2 } from "lucide-react";
import { DashboardShell, PageHero } from "@/components/dashboard/shell";
import { Card, GhostButton, PrimaryButton, GalleryEmpty } from "@/components/dashboard/ui";
import { Chip } from "@/components/dashboard/os/section";
import {
  listCharacters,
  countAssets,
  deleteCharacter,
  type Character,
} from "@/lib/ai-influencer/service";

export const Route = createFileRoute("/ai-influencer/")({
  component: LibraryPage,
});

function LibraryPage() {
  const [items, setItems] = useState<Character[] | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [err, setErr] = useState<string | null>(null);

  const load = async () => {
    try {
      const data = await listCharacters();
      setItems(data);
      const map: Record<string, number> = {};
      await Promise.all(
        data.map(async (c) => {
          map[c.id] = await countAssets(c.id);
        }),
      );
      setCounts(map);
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const onDelete = async (id: string) => {
    if (!confirm("Hapus karakter ini beserta semua asset?")) return;
    await deleteCharacter(id);
    load();
  };

  return (
    <DashboardShell>
      <PageHero
        eyebrow="AI Persona Studio"
        title="AI Influencer"
        highlight="Character Library"
        desc="Kelola digital persona: dari personality, referensi, scenario, hingga asset. Satu karakter, seluruh pipeline konten."
        action={
          <Link to="/ai-influencer/new">
            <PrimaryButton>
              <Plus className="h-4 w-4" /> Buat Karakter
            </PrimaryButton>
          </Link>
        }
      />

      {err && (
        <Card>
          <div className="text-sm text-rose-300">{err}</div>
        </Card>
      )}

      {items === null ? (
        <Card>
          <div className="text-sm text-muted-foreground">Memuat…</div>
        </Card>
      ) : items.length === 0 ? (
        <div className="neumorph p-10 text-center">
          <div
            className="mx-auto h-14 w-14 rounded-2xl grid place-items-center text-primary-foreground"
            style={{ background: "var(--gradient-neon)" }}
          >
            <Users className="h-6 w-6" />
          </div>
          <div className="mt-4 font-display text-lg">Belum ada karakter</div>
          <div className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
            Buat karakter pertama Anda — AI akan mengelola personality, scenario, dan konten
            secara konsisten.
          </div>
          <div className="mt-5">
            <Link to="/ai-influencer/new">
              <PrimaryButton>
                <Sparkles className="h-4 w-4" /> Mulai Buat Karakter
              </PrimaryButton>
            </Link>
          </div>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((c) => (
            <div key={c.id} className="neumorph p-5 flex flex-col gap-3">
              <div className="flex items-start gap-3">
                {c.avatar_url ? (
                  <img src={c.avatar_url} alt={c.name} className="h-16 w-16 rounded-2xl object-cover" />
                ) : (
                  <div
                    className="h-16 w-16 rounded-2xl grid place-items-center text-primary-foreground font-display text-2xl"
                    style={{ background: "var(--gradient-neon)" }}
                  >
                    {c.name[0]?.toUpperCase() || "?"}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="font-display text-lg truncate">{c.name}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {c.niche || "—"} · {c.style || "—"}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    <Chip tone={c.status === "active" ? "success" : "default"}>{c.status}</Chip>
                    {c.language && <Chip>{c.language}</Chip>}
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-between text-[11px] font-mono uppercase tracking-widest text-muted-foreground">
                <span>
                  <ImageIcon className="inline h-3 w-3 mr-1" />
                  {counts[c.id] ?? 0} asset
                </span>
                <span>
                  {c.last_generated_at
                    ? new Date(c.last_generated_at).toLocaleDateString()
                    : "Belum generate"}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Link to="/ai-influencer/$id" params={{ id: c.id }} className="flex-1">
                  <PrimaryButton className="w-full">Buka Workspace</PrimaryButton>
                </Link>
                <GhostButton onClick={() => onDelete(c.id)} title="Hapus">
                  <Trash2 className="h-4 w-4" />
                </GhostButton>
              </div>
            </div>
          ))}
        </div>
      )}

      {items && items.length > 0 && (
        <div className="text-xs text-muted-foreground">
          {items.length} karakter aktif. Klik <b>Buka Workspace</b> untuk masuk ke ruang kerja
          persona.
        </div>
      )}

      {/* Silent empty visual guard for future filters */}
      {items && items.length === 0 && <GalleryEmpty label="Character library kosong" />}
    </DashboardShell>
  );
}
