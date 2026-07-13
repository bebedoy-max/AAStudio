import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Search, Trash2, ExternalLink, Upload, Sparkles, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { DashboardShell, PageHero } from "@/components/dashboard/shell";
import { Card, Input, GhostButton, PrimaryButton, GalleryEmpty } from "@/components/dashboard/ui";
import { Chip } from "@/components/dashboard/os/section";
import { useActiveCharacterId } from "@/lib/ai-influencer/active-character";
import { openPrompt, openConfirm } from "@/components/ai-influencer/dialogs";
import { listAssets, insertAsset, deleteAsset } from "@/lib/ai-influencer/studio.functions";

export const Route = createFileRoute("/ai-influencer/library")({
  component: LibraryPage,
});

const TYPE_FILTERS = ["all", "image", "motion", "video", "caption", "prompt", "voice", "subtitle", "thumbnail", "storyboard"] as const;

type Asset = {
  id: string;
  kind: string;
  url: string | null;
  content: string | null;
  source: string | null;
  created_at: string;
  meta: Record<string, unknown> | null;
};

function LibraryPage() {
  const [activeId] = useActiveCharacterId();
  const [assets, setAssets] = useState<Asset[]>([]);
  const [q, setQ] = useState("");
  const [type, setType] = useState<(typeof TYPE_FILTERS)[number]>("all");
  const [loading, setLoading] = useState(false);

  const _listAssets = useServerFn(listAssets);
  const _insertAsset = useServerFn(insertAsset);
  const _deleteAsset = useServerFn(deleteAsset);

  const reload = async () => {
    if (!activeId) { setAssets([]); return; }
    setLoading(true);
    try {
      const rows = await _listAssets({ data: { characterId: activeId, kind: type === "all" ? null : type } });
      setAssets(rows as unknown as Asset[]);
    } catch (e) {
      toast.error((e as Error).message);
    } finally { setLoading(false); }
  };
  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [activeId, type]);

  const filtered = useMemo(
    () =>
      assets.filter((a) => {
        if (!q) return true;
        const t = (a.content ?? "") + " " + (a.url ?? "") + " " + a.kind;
        return t.toLowerCase().includes(q.toLowerCase());
      }),
    [assets, q],
  );

  const onManualUpload = async () => {
    if (!activeId) return;
    const url = await openPrompt({
      title: "Upload manual (URL)",
      description: "Paste URL image / video / caption text URL. Nanti akan bisa direplace ke uploader storage.",
      placeholder: "https://…",
      icon: <Upload className="h-5 w-5" />,
    });
    if (!url) return;
    const kind = url.match(/\.(mp4|mov|webm)$/i) ? "video" : "image";
    try {
      await _insertAsset({
        data: { characterId: activeId, kind, url, source: "manual" },
      });
      toast.success("Asset ditambahkan.");
      reload();
    } catch (e) { toast.error((e as Error).message); }
  };

  const onDelete = async (a: Asset) => {
    const ok = await openConfirm({
      title: "Hapus asset?",
      description: "Asset ini akan dihapus dari library.",
      confirmLabel: "Hapus", tone: "danger",
      icon: <Trash2 className="h-5 w-5" />,
    });
    if (!ok) return;
    try {
      await _deleteAsset({ data: { id: a.id } });
      setAssets((p) => p.filter((x) => x.id !== a.id));
    } catch (e) { toast.error((e as Error).message); }
  };

  return (
    <DashboardShell>
      <PageHero
        eyebrow="Module · Content Library"
        title="Content"
        highlight="Library"
        desc="Semua asset — dari Character slots, pipeline Planner (image/motion/caption/subtitle/thumbnail), dan manual upload — tersimpan otomatis di sini."
        action={
          <div className="flex gap-2">
            <GhostButton onClick={onManualUpload} disabled={!activeId}>
              <Upload className="h-4 w-4" /> Upload manual
            </GhostButton>
            <Link to="/ai-influencer/planner">
              <PrimaryButton>
                <Sparkles className="h-4 w-4" /> Generate di Planner
              </PrimaryButton>
            </Link>
          </div>
        }
      />

      {!activeId && (
        <Card>
          <div className="text-sm text-muted-foreground">
            Pilih karakter di menu <b>Character</b> untuk melihat library.
          </div>
        </Card>
      )}

      <Card sub="Filter berdasarkan tipe & search.">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search asset, caption, prompt…"
              className="pl-9"
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {TYPE_FILTERS.map((t) => (
              <button
                key={t}
                onClick={() => setType(t)}
                className={[
                  "px-3 py-1.5 rounded-full text-xs border transition",
                  type === t ? "border-transparent text-primary-foreground glow-pink" : "border-border bg-card/50",
                ].join(" ")}
                style={type === t ? { background: "var(--gradient-neon)" } : undefined}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
      </Card>

      {loading ? (
        <Card>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Memuat asset…
          </div>
        </Card>
      ) : filtered.length === 0 ? (
        <GalleryEmpty label="Belum ada asset. Generate di Character/Planner atau Upload manual." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((a) => (
            <div key={a.id} className="rounded-2xl border border-border bg-card/40 overflow-hidden flex flex-col">
              <div className="aspect-square relative bg-black/40 grid place-items-center text-xs text-muted-foreground">
                {a.url && a.kind !== "caption" && a.kind !== "prompt" ? (
                  <img src={a.url} alt={a.kind} className="absolute inset-0 h-full w-full object-cover" />
                ) : (
                  <span className="p-3 text-center">{a.content?.slice(0, 160) || a.kind}</span>
                )}
                <span className="absolute top-2 left-2">
                  <Chip tone="primary">{a.kind}</Chip>
                </span>
                {a.source && (
                  <span className="absolute top-2 right-2">
                    <Chip>{a.source}</Chip>
                  </span>
                )}
              </div>
              <div className="p-3 flex items-center justify-between gap-2">
                <div className="text-[10px] text-muted-foreground truncate">
                  {new Date(a.created_at).toLocaleString()}
                </div>
                <div className="flex gap-1">
                  {a.url && (
                    <a href={a.url} target="_blank" rel="noreferrer">
                      <GhostButton className="!px-2 !py-1 text-xs" title="Open">
                        <ExternalLink className="h-3 w-3" />
                      </GhostButton>
                    </a>
                  )}
                  <GhostButton className="!px-2 !py-1 text-xs" title="Delete" onClick={() => onDelete(a)}>
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
