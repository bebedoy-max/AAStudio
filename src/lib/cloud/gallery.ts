// Galeri hasil generate yang tersimpan di cloud (Google Drive + registry),
// bukan di localStorage — jadi hasilnya sama di semua perangkat.
import { useCallback, useEffect, useRef, useState } from "react";
import { listCloudFiles, archiveGeneratedUrl, deleteCloudFile } from "./cloud.functions";

export type CloudGalleryItem<M = Record<string, unknown>> = {
  id: string;
  /** URL streaming dari cloud (stabil lintas perangkat). */
  url: string;
  /** URL asli provider (bisa kedaluwarsa) — hanya untuk dedupe. */
  sourceUrl: string | null;
  name: string;
  kind: string;
  createdAt: string;
  meta: M;
};

function normalize<M>(r: any): CloudGalleryItem<M> {
  return {
    id: String(r.id),
    url: String(r.url),
    sourceUrl: (r.sourceUrl ?? null) as string | null,
    name: String(r.name ?? ""),
    kind: String(r.kind ?? "file"),
    createdAt: String(r.createdAt ?? new Date().toISOString()),
    meta: (r.meta ?? {}) as M,
  };
}

/**
 * Galeri per menu (`source`), tersinkron dengan Google Drive.
 * - Hasil generate tetap ada selama user tidak menghapusnya di galeri.
 * - Menghapus item hanya menghapus entri galeri; file di Google Drive tetap ada.
 */
export function useCloudGallery<M = Record<string, unknown>>(source: string, kind?: string | null) {
  const [items, setItems] = useState<CloudGalleryItem<M>[]>([]);
  const [loading, setLoading] = useState(true);
  const pending = useRef(new Set<string>());

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const rows = (await listCloudFiles({
        data: { source, origin: "generate", kind: kind ?? null },
      })) as any[];
      setItems(rows.map((r) => normalize<M>(r)));
    } catch (e) {
      console.warn("[cloud-gallery] load failed", e);
    } finally {
      setLoading(false);
    }
  }, [source, kind]);

  useEffect(() => {
    void reload();
  }, [reload]);

  /** Simpan hasil generate ke cloud lalu tampilkan di galeri. */
  const add = useCallback(
    async (url: string, meta?: M, name?: string): Promise<CloudGalleryItem<M> | null> => {
      if (!url || !/^https?:\/\//i.test(url) || pending.current.has(url)) return null;
      pending.current.add(url);
      try {
        const row = await archiveGeneratedUrl({
          data: {
            url,
            source,
            origin: "generate",
            name,
            meta: (meta ?? {}) as Record<string, string | number | boolean | null>,
          },
        });
        const item = normalize<M>(row);
        setItems((prev) => (prev.some((p) => p.id === item.id) ? prev : [item, ...prev]));
        return item;
      } catch (e) {
        console.warn("[cloud-gallery] save failed", e);
        return null;
      } finally {
        pending.current.delete(url);
      }
    },
    [source],
  );

  const addMany = useCallback(
    async (entries: { url: string; meta?: M; name?: string }[]) => {
      const out: CloudGalleryItem<M>[] = [];
      for (const e of entries) {
        const it = await add(e.url, e.meta, e.name);
        if (it) out.push(it);
      }
      return out;
    },
    [add],
  );

  /** Hapus dari galeri saja — file di Google Drive tidak ikut terhapus. */
  const remove = useCallback(async (id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
    try {
      await deleteCloudFile({ data: { id } });
    } catch (e) {
      console.warn("[cloud-gallery] delete failed", e);
      void 0;
    }
  }, []);

  const removeAll = useCallback(async () => {
    const ids = items.map((i) => i.id);
    setItems([]);
    for (const id of ids) {
      try {
        await deleteCloudFile({ data: { id } });
      } catch (e) {
        console.warn("[cloud-gallery] delete failed", e);
      }
    }
  }, [items]);

  return { items, loading, reload, add, addMany, remove, removeAll, setItems };
}
