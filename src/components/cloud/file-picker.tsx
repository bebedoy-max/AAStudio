// Pemilih file dua sumber: "Perangkat" (file lokal) & "Cloud" (riwayat upload di Google Drive).
// Dipakai lewat hook `useFilePicker()` supaya bisa dipasang di tombol upload manapun.
import { useCallback, useMemo, useRef, useState } from "react";
import { Cloud, HardDrive, Search, Loader2, FileIcon } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { listCloudFiles } from "@/lib/cloud/cloud.functions";
import { archiveUploadInBackground } from "@/lib/cloud/client";

export type PickOptions = {
  /** accept attribute untuk file input perangkat, mis. "image/*". */
  accept?: string;
  multiple?: boolean;
  /** slug menu — dipakai untuk folder Drive saat file perangkat diarsipkan. */
  source?: string;
  /** filter jenis file cloud: image | video | audio | file */
  kind?: string | null;
  title?: string;
};

type CloudRow = {
  id: string;
  name: string;
  kind: string;
  mimeType: string;
  size: number;
  origin: string;
  source: string | null;
  createdAt: string;
  url: string;
};

const KIND_FROM_ACCEPT = (accept?: string): string | null => {
  if (!accept) return null;
  if (accept.includes("image/")) return "image";
  if (accept.includes("video/")) return "video";
  if (accept.includes("audio/")) return "audio";
  return null;
};

export function useFilePicker() {
  const [open, setOpen] = useState(false);
  const [opts, setOpts] = useState<PickOptions>({});
  const [tab, setTab] = useState<"device" | "cloud">("device");
  const [rows, setRows] = useState<CloudRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const resolver = useRef<((files: File[]) => void) | null>(null);

  const finish = useCallback((files: File[]) => {
    const r = resolver.current;
    resolver.current = null;
    setOpen(false);
    r?.(files);
  }, []);

  const pick = useCallback((options: PickOptions = {}) => {
    setOpts(options);
    setTab("device");
    setQ("");
    setRows([]);
    setOpen(true);
    return new Promise<File[]>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const loadCloud = useCallback(async () => {
    setLoading(true);
    try {
      const kind = opts.kind ?? KIND_FROM_ACCEPT(opts.accept);
      // Hanya file hasil upload user — hasil generate tidak ikut ditampilkan.
      const data = (await listCloudFiles({ data: { kind, origin: "upload" } })) as unknown as CloudRow[];
      setRows(data);

    } catch (e) {
      console.warn("[file-picker] load cloud failed", e);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [opts.accept, opts.kind]);

  const openCloud = useCallback(() => {
    setTab("cloud");
    void loadCloud();
  }, [loadCloud]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter(
      (r) =>
        r.name.toLowerCase().includes(needle) ||
        (r.source ?? "").toLowerCase().includes(needle) ||
        r.kind.toLowerCase().includes(needle),
    );
  }, [rows, q]);

  const chooseCloud = useCallback(
    async (row: CloudRow) => {
      setBusy(true);
      try {
        const res = await fetch(row.url);
        if (!res.ok) throw new Error(`Gagal mengambil file cloud (${res.status})`);
        const blob = await res.blob();
        const file = new File([blob], row.name, { type: row.mimeType || blob.type || "application/octet-stream" });
        finish([file]);
      } catch (e) {
        console.warn("[file-picker] fetch cloud file failed", e);
        setBusy(false);
      } finally {
        setBusy(false);
      }
    },
    [finish],
  );

  const onDeviceFiles = useCallback(
    (list: FileList | null) => {
      const files = Array.from(list ?? []);
      if (!files.length) return finish([]);
      // Setiap file yang dipilih dari perangkat ikut diarsipkan ke Google Drive.
      for (const f of files) archiveUploadInBackground(f, { source: opts.source, origin: "upload" });
      finish(files);
    },
    [finish, opts.source],
  );

  const element = (
    <>
      <input
        ref={inputRef}
        type="file"
        accept={opts.accept}
        multiple={opts.multiple}
        hidden
        onChange={(e) => {
          onDeviceFiles(e.target.files);
          e.currentTarget.value = "";
        }}
      />
      <Dialog
        open={open}
        onOpenChange={(v) => {
          if (!v) finish([]);
          setOpen(v);
        }}
      >
        <DialogContent className="max-w-lg" onClick={(e) => e.stopPropagation()}>
          <DialogHeader>
            <DialogTitle>{opts.title ?? "Pilih file"}</DialogTitle>
            <DialogDescription>Ambil dari perangkat atau dari file yang sudah tersimpan di cloud.</DialogDescription>
          </DialogHeader>

          {tab === "device" ? (
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => inputRef.current?.click()}
                className="rounded-2xl border border-border p-5 text-center hover:border-primary/60 hover:bg-accent/30 transition"
              >
                <HardDrive className="h-6 w-6 mx-auto mb-2 text-primary" />
                <div className="text-sm font-semibold">Perangkat</div>
                <div className="text-[11px] text-muted-foreground">Browse file di perangkat ini</div>
              </button>
              <button
                onClick={openCloud}
                className="rounded-2xl border border-border p-5 text-center hover:border-primary/60 hover:bg-accent/30 transition"
              >
                <Cloud className="h-6 w-6 mx-auto mb-2 text-primary" />
                <div className="text-sm font-semibold">Cloud</div>
                <div className="text-[11px] text-muted-foreground">Riwayat file di Google Drive</div>
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="relative">
                <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Cari nama file / menu..."
                  className="pl-9"
                />
              </div>
              <div className="max-h-[320px] overflow-y-auto rounded-xl border border-border divide-y divide-border">
                {loading ? (
                  <div className="p-6 text-center text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin mx-auto mb-2" /> Memuat file cloud...
                  </div>
                ) : filtered.length === 0 ? (
                  <div className="p-6 text-center text-sm text-muted-foreground">Tidak ada file cocok.</div>
                ) : (
                  filtered.map((r) => (
                    <button
                      key={r.id}
                      disabled={busy}
                      onClick={() => void chooseCloud(r)}
                      className="w-full flex items-center gap-3 p-2.5 text-left hover:bg-accent/40 transition disabled:opacity-50"
                    >
                      {r.kind === "image" ? (
                        <img src={r.url} alt="" loading="lazy" className="h-10 w-10 rounded-lg object-cover bg-muted" />
                      ) : (
                        <div className="h-10 w-10 rounded-lg bg-muted grid place-items-center">
                          <FileIcon className="h-4 w-4 text-muted-foreground" />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="text-sm truncate">{r.name}</div>
                        <div className="text-[11px] text-muted-foreground truncate">
                          {r.origin === "upload" ? "Upload" : "Generate"}
                          {r.source ? ` · ${r.source}` : ""} · {new Date(r.createdAt).toLocaleDateString()}
                        </div>
                      </div>
                    </button>
                  ))
                )}
              </div>
              <button className="text-xs text-muted-foreground hover:text-foreground" onClick={() => setTab("device")}>
                ← Kembali ke pilihan sumber
              </button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );

  return { pick, element };
}

/** Ubah File[] menjadi FileList supaya bisa dipakai handler lama yang menerima FileList. */
export function toFileList(files: File[]): FileList {
  const dt = new DataTransfer();
  for (const f of files) dt.items.add(f);
  return dt.files;
}
