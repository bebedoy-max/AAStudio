import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Heart, HeartOff, Loader2, Play, Pause, Star, X } from "lucide-react";
import { toast } from "sonner";
import {
  listBacksoundFavorites,
  addBacksoundFavorite,
  removeBacksoundFavorite,
  type FavoriteTrack,
} from "@/lib/backsound/favorites.functions";

function fmtDur(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function useBacksoundFavorites() {
  const list = useServerFn(listBacksoundFavorites);
  const add = useServerFn(addBacksoundFavorite);
  const remove = useServerFn(removeBacksoundFavorite);
  const [items, setItems] = useState<FavoriteTrack[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await list());
    } catch (e) {
      const msg = (e as Error).message || "";
      if (!/unauthorized|401/i.test(msg)) console.warn("[backsound-fav]", msg);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [list]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const isFav = useCallback((url: string) => items.some((i) => i.url === url), [items]);

  const toggle = useCallback(
    async (track: { title: string; url: string; duration?: number; mood?: string }) => {
      try {
        if (isFav(track.url)) {
          await remove({ data: { url: track.url } });
          toast.success("Dihapus dari favorit");
        } else {
          await add({
            data: {
              title: track.title,
              url: track.url,
              duration: track.duration || 0,
              mood: track.mood || "",
            },
          });
          toast.success("Backsound disimpan ke favorit");
        }
        await refresh();
      } catch (e) {
        toast.error((e as Error).message || "Gagal menyimpan favorit (perlu login)");
      }
    },
    [add, remove, isFav, refresh],
  );

  return { items, loading, refresh, isFav, toggle };
}

export function BacksoundFavoritesDialog({
  open,
  onClose,
  items,
  loading,
  onRefresh,
  onRemove,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  items: FavoriteTrack[];
  loading: boolean;
  onRefresh: () => void;
  onRemove: (url: string) => void;
  onPick: (t: FavoriteTrack) => void;
}) {
  const [playing, setPlaying] = useState<string | null>(null);
  const [audio, setAudio] = useState<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (!open && audio) {
      audio.pause();
      setPlaying(null);
    }
  }, [open, audio]);

  useEffect(() => () => audio?.pause(), [audio]);

  if (!open) return null;

  const play = (t: FavoriteTrack) => {
    audio?.pause();
    if (playing === t.url) {
      setPlaying(null);
      return;
    }
    const a = new Audio(t.url);
    a.volume = 0.8;
    void a.play().catch(() => toast.error("Gagal memutar backsound"));
    a.onended = () => setPlaying(null);
    setAudio(a);
    setPlaying(t.url);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-2xl border border-border bg-card p-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2">
          <Star className="h-4 w-4 text-yellow-400" />
          <div className="font-semibold text-sm">Backsound Favorit</div>
          <button onClick={onRefresh} className="ml-auto text-[11px] text-muted-foreground hover:text-foreground">
            Muat ulang
          </button>
          <button onClick={onClose} className="rounded p-1 hover:bg-muted">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-3 max-h-[60vh] space-y-1.5 overflow-y-auto pr-1">
          {loading && (
            <div className="flex items-center gap-2 p-6 text-xs text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Memuat favorit…
            </div>
          )}
          {!loading && !items.length && (
            <div className="rounded-xl border border-dashed border-border/60 p-8 text-center text-xs text-muted-foreground">
              Belum ada backsound favorit. Klik ikon ❤ pada daftar backsound untuk menyimpannya di cloud.
            </div>
          )}
          {items.map((t) => (
            <div key={t.id} className="flex items-center gap-2 rounded-xl border border-border bg-background/40 p-2">
              <button
                onClick={() => play(t)}
                className="rounded-full border border-border p-1.5 hover:bg-muted"
                aria-label={playing === t.url ? "Jeda" : "Putar"}
              >
                {playing === t.url ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
              </button>
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs font-medium">{t.title}</div>
                <div className="text-[10px] text-muted-foreground">
                  {t.mood ? `${t.mood} · ` : ""}
                  {fmtDur(t.duration)}
                </div>
              </div>
              <button
                onClick={() => {
                  audio?.pause();
                  setPlaying(null);
                  onPick(t);
                  onClose();
                }}
                className="rounded-full border border-primary/40 bg-primary/10 px-3 py-1 text-[11px] text-primary hover:bg-primary/20"
              >
                Pakai
              </button>
              <button
                onClick={() => onRemove(t.url)}
                className="rounded p-1 text-muted-foreground hover:text-destructive"
                aria-label="Hapus favorit"
              >
                <HeartOff className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function FavoriteHeart({ active, onClick }: { active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-label={active ? "Hapus dari favorit" : "Simpan ke favorit"}
      className={`rounded p-1 transition ${active ? "text-pink-500" : "text-muted-foreground hover:text-pink-400"}`}
    >
      <Heart className="h-3.5 w-3.5" fill={active ? "currentColor" : "none"} />
    </button>
  );
}
