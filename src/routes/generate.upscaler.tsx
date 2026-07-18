import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { X, Upload, Download, Trash2, Loader2, Search } from "lucide-react";
import { DashboardShell, PageHero } from "@/components/dashboard/shell";
import { Card, Field, Select, Input, Textarea, PrimaryButton, GhostButton, GalleryEmpty } from "@/components/dashboard/ui";
import {
  runUpscale,
  TOPAZ_MODELS,
  MAG_ENGINES,
  MAG_OPTIMIZED,
  type UpscalerProvider,
  type UpscalerMode,
  type TopazParams,
  type MagnificParams,
} from "@/lib/providers/upscaler";
import { logGenerate } from "@/lib/activity/log";
import { useAuth } from "@/lib/auth-context";
import { confirmDialog } from "@/components/ui-confirm";

export const Route = createFileRoute("/generate/upscaler")({
  head: () => ({
    meta: [
      { title: "AI Upscaler & Enhancer — AA Creative Studio" },
      { name: "description", content: "Upscale / enhance gambar (satuan atau bulk s/d 50 gambar) menggunakan Topaz atau Magnific." },
    ],
  }),
  component: UpscalerPage,
});

const MAX_IMAGES = 50;

type Row = { id: string; file: File; preview: string; ratio: number; status: string; url?: string; error?: string };
type ResultItem = { id: string; url: string; provider: UpscalerProvider; mode: UpscalerMode; date: string; sourceName: string };
const LS_BASE = "aatools.upscaler.results";
const lsKey = (uid: string | null) => (uid ? `${LS_BASE}.${uid}` : `${LS_BASE}.anon`);
type LogItem = { time: string; msg: string; level: string };

// In-memory session store — kept across route unmount/mount so upload progress
// tidak reset ketika user pindah menu lalu balik lagi.
type SessionState = {
  rows: Row[];
  logs: LogItem[];
  progress: { done: number; total: number };
  running: boolean;
  provider: UpscalerProvider;
  mode: UpscalerMode;
};
const upscalerSession: SessionState = {
  rows: [],
  logs: [],
  progress: { done: 0, total: 0 },
  running: false,
  provider: "topaz",
  mode: "upscale",
};

function UpscalerPage() {
  const { user } = useAuth();
  const uid = user?.id ?? null;
  const [provider, setProvider] = useState<UpscalerProvider>(upscalerSession.provider);
  const [mode, setMode] = useState<UpscalerMode>(upscalerSession.mode);
  const [rows, setRows] = useState<Row[]>(upscalerSession.rows);
  const [running, setRunning] = useState(upscalerSession.running);
  const [logs, setLogs] = useState<LogItem[]>(upscalerSession.logs);
  const [progress, setProgress] = useState(upscalerSession.progress);
  const [results, setResults] = useState<ResultItem[]>([]);
  const [search, setSearch] = useState("");
  const [exporting, setExporting] = useState(false);

  // Sync ke module store agar bertahan lintas navigasi.
  useEffect(() => { upscalerSession.rows = rows; }, [rows]);
  useEffect(() => { upscalerSession.logs = logs; }, [logs]);
  useEffect(() => { upscalerSession.progress = progress; }, [progress]);
  useEffect(() => { upscalerSession.running = running; }, [running]);
  useEffect(() => { upscalerSession.provider = provider; }, [provider]);
  useEffect(() => { upscalerSession.mode = mode; }, [mode]);

  // Topaz params
  const [tzModel, setTzModel] = useState<TopazParams["model"]>("Standard V2");
  const [tzFactor, setTzFactor] = useState<1 | 2 | 3 | 4>(2);
  const [tzFormat, setTzFormat] = useState<"jpeg" | "png">("jpeg");
  const [tzCrop, setTzCrop] = useState(false);

  // Magnific params
  const [magScale, setMagScale] = useState<MagnificParams["scale_factor"]>("2x");
  const [magEngine, setMagEngine] = useState<MagnificParams["engine"]>("automatic");
  const [magOpt, setMagOpt] = useState<MagnificParams["optimized_for"]>("standard");
  const [magCreativity, setMagCreativity] = useState(2);
  const [magHdr, setMagHdr] = useState(3);
  const [magResemblance, setMagResemblance] = useState(50);
  const [magFractality, setMagFractality] = useState(2);
  const [magPrompt, setMagPrompt] = useState("");

  const canRun = useMemo(() => rows.length > 0 && !running, [rows.length, running]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(lsKey(uid));
      setResults(raw ? JSON.parse(raw) : []);
    } catch { setResults([]); }
  }, [uid]);

  const persistResults = (next: ResultItem[] | ((prev: ResultItem[]) => ResultItem[])) => {
    setResults((prev) => {
      const v = typeof next === "function" ? (next as (p: ResultItem[]) => ResultItem[])(prev) : next;
      try { localStorage.setItem(lsKey(uid), JSON.stringify(v)); } catch {}
      return v;
    });
  };

  const pushLog = (msg: string, level = "info") =>
    setLogs((prev) => [...prev, { time: new Date().toLocaleTimeString(), msg, level }].slice(-300));

  function addFiles(files: FileList | null) {
    if (!files) return;
    const arr = Array.from(files).filter((f) => f.type.startsWith("image/"));
    const room = MAX_IMAGES - rows.length;
    const take = arr.slice(0, Math.max(0, room));
    take.forEach((f) => {
      const url = URL.createObjectURL(f);
      const img = new Image();
      img.onload = () => {
        const ratio = img.naturalWidth / Math.max(1, img.naturalHeight);
        setRows((prev) => [
          ...prev,
          { id: Math.random().toString(36).slice(2), file: f, preview: url, ratio, status: "queued" },
        ]);
      };
      img.onerror = () => {
        setRows((prev) => [
          ...prev,
          { id: Math.random().toString(36).slice(2), file: f, preview: url, ratio: 1, status: "queued" },
        ]);
      };
      img.src = url;
    });
  }

  function removeRow(id: string) {
    setRows((prev) => {
      const target = prev.find((r) => r.id === id);
      if (target) URL.revokeObjectURL(target.preview);
      return prev.filter((r) => r.id !== id);
    });
  }

  function clearAll() {
    rows.forEach((r) => URL.revokeObjectURL(r.preview));
    setRows([]);
  }

  async function handleRun() {
    if (rows.length === 0) return;
    setRunning(true);
    setLogs([]);
    setProgress({ done: 0, total: rows.length });
    setRows((prev) => prev.map((r) => ({ ...r, status: "queued", url: undefined, error: undefined })));
    const jobs = rows.map((r, i) => ({ index: i, file: r.file }));
    const snapshot = rows.map((r) => ({ name: r.file.name }));
    try {
      await runUpscale(jobs, {
        provider,
        mode,
        topaz: { model: tzModel, upscale_factor: tzFactor, output_format: tzFormat, crop_to_fill: tzCrop },
        magnific: {
          scale_factor: magScale,
          engine: magEngine,
          optimized_for: magOpt,
          creativity: magCreativity,
          hdr: magHdr,
          resemblance: magResemblance,
          fractality: magFractality,
          prompt: magPrompt || undefined,
        },
        concurrency: 2,
        onLog: (m, level) => pushLog(m, level || "info"),
        onStatus: ({ index, status, url, error }) => {
          setRows((prev) => prev.map((r, i) => (i === index ? { ...r, status, url: url ?? r.url, error: error ?? r.error } : r)));
          if (status === "done" && url) {
            setProgress((p) => ({ ...p, done: p.done + 1 }));
            persistResults((prev) => [
              {
                id: Math.random().toString(36).slice(2),
                url,
                provider,
                mode,
                date: new Date().toISOString(),
                sourceName: snapshot[index]?.name || `image-${index + 1}`,
              },
              ...prev,
            ]);
          } else if (status === "error") {
            setProgress((p) => ({ ...p, done: p.done + 1 }));
          }
        },
      });
      logGenerate("upscaler", { provider, count: rows.length, mode });
    } finally {
      setRunning(false);
    }
  }

  const filteredResults = results.filter((r) => !search || r.sourceName.toLowerCase().includes(search.toLowerCase()));

  const exportAll = async () => {
    if (filteredResults.length === 0 || exporting) return;
    setExporting(true);
    try {
      const { downloadFilesAsZip } = await import("@/lib/utils/download-zip");
      await downloadFilesAsZip(
        filteredResults.map((r, i) => {
          const ext = /\.(png|jpe?g|webp)(\?|$)/i.exec(r.url)?.[1] || "jpg";
          return { url: r.url, filename: `upscale-${String(i + 1).padStart(2, "0")}-${r.id}.${ext.toLowerCase()}` };
        }),
        `upscaler-gallery-${new Date().toISOString().slice(0, 10)}.zip`,
      );
    } finally {
      setExporting(false);
    }
  };

  const clearResults = async () => {
    if (results.length === 0) return;
    const ok = await confirmDialog({
      title: `Hapus semua ${results.length} hasil dari gallery?`,
      description: "Semua item akan dihapus dari gallery ini. Tindakan tidak bisa dibatalkan.",
      confirmLabel: "Ya, hapus semua",
      tone: "danger",
    });
    if (!ok) return;
    persistResults([]);
  };

  const downloadOne = async (r: ResultItem) => {
    try {
      let blob: Blob | null = null;
      try {
        const res = await fetch(r.url, { mode: "cors" });
        if (res.ok) blob = await res.blob();
      } catch {}
      if (!blob) {
        const res = await fetch(`/api/public/proxy-image?url=${encodeURIComponent(r.url)}`);
        if (res.ok) blob = await res.blob();
      }
      if (!blob) throw new Error("Download gagal");
      const url = URL.createObjectURL(blob);
      const ext = /\.(png|jpe?g|webp)(\?|$)/i.exec(r.url)?.[1]?.toLowerCase() || "jpg";
      const a = document.createElement("a");
      a.href = url;
      a.download = `upscale-${r.id}.${ext}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    } catch (e) {
      pushLog(`Download error: ${(e as Error).message}`, "error");
    }
  };

  const progressPct = progress.total ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <DashboardShell>
      <PageHero
        eyebrow="Generate"
        title="AI Upscaler &"
        highlight="Enhancer"
        desc={`Provider Topaz (via Weavy) atau Magnific. Bulk maksimum ${MAX_IMAGES} gambar sekaligus.`}
      />

      <div className="flex flex-col gap-5">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="lg:col-span-1 space-y-5">
          <Card title="Konfigurasi" sub="Pilih model AI & parameter">
            <div className="space-y-4">
              <Field label="Model AI" >
                <Select
                  value={provider}
                  onChange={(e) => setProvider(e.target.value as UpscalerProvider)}
                  options={[
                    { value: "topaz", label: "Topaz Upscale (Weavy node)" },
                    { value: "magnific", label: "Magnific Upscale (Weavy node)" },
                  ]}
                />
              </Field>
              <Field label="Mode">
                <Select
                  value={mode}
                  onChange={(e) => setMode(e.target.value as UpscalerMode)}
                  options={[
                    { value: "upscale", label: "Upscale (resolusi lebih besar)" },
                    { value: "enhance", label: "Enhance (detil / precision)" },
                  ]}
                />
              </Field>

              {provider === "topaz" && (
                <>
                  <Field label="Model Topaz">
                    <Select
                      value={tzModel}
                      onChange={(e) => setTzModel(e.target.value as TopazParams["model"])}
                      options={TOPAZ_MODELS.map((m) => ({ value: m, label: m }))}
                    />
                  </Field>
                  <Field label="Upscale factor">
                    <Select
                      value={String(tzFactor)}
                      onChange={(e) => setTzFactor(Number(e.target.value) as 1 | 2 | 3 | 4)}
                      options={[
                        { value: "1", label: "1x" },
                        { value: "2", label: "2x" },
                        { value: "3", label: "3x" },
                        { value: "4", label: "4x" },
                      ]}
                    />
                  </Field>
                  <Field label="Output format">
                    <Select
                      value={tzFormat}
                      onChange={(e) => setTzFormat(e.target.value as "jpeg" | "png")}
                      options={[
                        { value: "jpeg", label: "JPEG" },
                        { value: "png", label: "PNG" },
                      ]}
                    />
                  </Field>
                  <label className="flex items-center gap-2 text-sm text-foreground/90">
                    <input type="checkbox" checked={tzCrop} onChange={(e) => setTzCrop(e.target.checked)} />
                    Crop to fill
                  </label>
                </>
              )}

              {provider === "magnific" && (
                <>
                  <Field label="Scale factor">
                    <Select
                      value={magScale}
                      onChange={(e) => setMagScale(e.target.value as MagnificParams["scale_factor"])}
                      options={[
                        { value: "2x", label: "2x" },
                        { value: "4x", label: "4x" },
                        { value: "8x", label: "8x" },
                        { value: "16x", label: "16x" },
                      ]}
                    />
                  </Field>
                  <Field label="Engine">
                    <Select
                      value={magEngine}
                      onChange={(e) => setMagEngine(e.target.value as MagnificParams["engine"])}
                      options={MAG_ENGINES.map((v) => ({ value: v, label: v }))}
                    />
                  </Field>
                  <Field label="Optimized for">
                    <Select
                      value={magOpt}
                      onChange={(e) => setMagOpt(e.target.value as MagnificParams["optimized_for"])}
                      options={MAG_OPTIMIZED.map((v) => ({ value: v, label: v }))}
                    />
                  </Field>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label={`Creativity (${magCreativity})`}>
                      <Input type="number" min={-10} max={10} value={magCreativity} onChange={(e) => setMagCreativity(Number(e.target.value))} />
                    </Field>
                    <Field label={`HDR (${magHdr})`}>
                      <Input type="number" min={-10} max={10} value={magHdr} onChange={(e) => setMagHdr(Number(e.target.value))} />
                    </Field>
                    <Field label={`Resemblance (${magResemblance})`}>
                      <Input type="number" min={0} max={100} value={magResemblance} onChange={(e) => setMagResemblance(Number(e.target.value))} />
                    </Field>
                    <Field label={`Fractality (${magFractality})`}>
                      <Input type="number" min={0} max={10} value={magFractality} onChange={(e) => setMagFractality(Number(e.target.value))} />
                    </Field>
                  </div>
                  <Field label="Prompt (opsional)">
                    <Textarea rows={2} value={magPrompt} onChange={(e) => setMagPrompt(e.target.value)} placeholder="Deskripsi tambahan..." />
                  </Field>
                </>
              )}

              <div className="flex gap-2 pt-2">
                <PrimaryButton onClick={handleRun} disabled={!canRun}>
                  {running ? "Memproses..." : `Jalankan (${rows.length})`}
                </PrimaryButton>
                <GhostButton onClick={clearAll} disabled={running || rows.length === 0}>Bersihkan</GhostButton>
              </div>
            </div>
          </Card>
          </div>

          <div className="lg:col-span-2 space-y-5">
          <Card
            title={`Gambar (${rows.length}/${MAX_IMAGES})`}
            sub="Drop / pilih gambar, satuan atau banyak sekaligus"
            right={
              <label className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold border border-border cursor-pointer hover:bg-accent/40">
                <Upload className="h-4 w-4" /> Tambah
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => { addFiles(e.target.files); e.currentTarget.value = ""; }}
                />
              </label>
            }
          >
            {rows.length === 0 ? (
              <div className="text-sm text-muted-foreground p-8 text-center border border-dashed border-border rounded-xl">
                Belum ada gambar. Klik <b>Tambah</b> untuk memilih file (maks {MAX_IMAGES}).
              </div>
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                {rows.map((r, i) => (
                  <div key={r.id} className="relative rounded-xl overflow-hidden border border-border bg-background/40">
                    <div className="relative bg-black/40" style={{ aspectRatio: r.ratio || 1 }}>
                      <img src={r.url || r.preview} alt="" className="absolute inset-0 w-full h-full object-contain" />
                      {!running && (
                        <button
                          onClick={() => removeRow(r.id)}
                          className="absolute top-1 right-1 h-6 w-6 grid place-items-center rounded-full bg-black/70 text-white hover:bg-black/90"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                    <div className="p-1.5 text-[10px] leading-tight">
                      <div className="truncate text-foreground/90">#{i + 1} {r.file.name}</div>
                      {r.error ? (
                        <div className="truncate text-destructive">{r.error}</div>
                      ) : r.status === "done" ? (
                        <div className="truncate text-emerald-400">done</div>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
          </div>
        </div>

        <Card title="Log Info & Progress" sub={`Total ${logs.length} entri`}>
          {(running || progress.total > 0) && (
            <div className="mb-3">
              <div className="flex items-center justify-between text-[11px] text-muted-foreground mb-1">
                <span>{running ? "Memproses..." : "Selesai"}</span>
                <span className="font-mono">{progress.done}/{progress.total} · {progressPct}%</span>
              </div>
              <div className="h-2 rounded-full bg-card/60 border border-border overflow-hidden">
                <div
                  className="h-full transition-all"
                  style={{ width: `${progressPct}%`, background: "var(--gradient-neon)" }}
                />
              </div>
            </div>
          )}
          <div className="rounded-xl border border-border/60 bg-black/40 p-2 max-h-64 overflow-auto text-[11px] font-mono">
            {logs.length === 0 ? (
              <div className="text-muted-foreground px-1 py-2">Belum ada log. Jalankan proses untuk melihat aktivitas.</div>
            ) : (
              logs.map((l, i) => (
                <div
                  key={i}
                  className={
                    l.level === "error"
                      ? "text-red-400"
                      : l.level === "warn"
                        ? "text-amber-400"
                        : l.level === "success"
                          ? "text-emerald-400"
                          : "text-muted-foreground"
                  }
                >
                  [{l.time}] {l.msg}
                </div>
              ))
            )}
          </div>
        </Card>

        <Card
            title="Gallery Hasil"
            sub="Gambar hasil upscale / enhance"
            right={
              <div className="flex gap-2">
                <GhostButton onClick={exportAll} disabled={filteredResults.length === 0 || exporting} title="Export semua ke ZIP">
                  {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                  <span className="hidden sm:inline">{exporting ? "Zipping…" : "Export ZIP"}</span>
                </GhostButton>
                <GhostButton
                  onClick={clearResults}
                  disabled={results.length === 0}
                  className="text-destructive hover:text-destructive"
                  title="Hapus semua"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Hapus Semua</span>
                </GhostButton>
              </div>
            }
          >
            <div className="flex items-center gap-2 rounded-full border border-border bg-card/50 px-3 py-2 mb-4">
              <Search className="h-4 w-4 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search nama file…"
                className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
            </div>
            {results.length === 0 ? (
              <GalleryEmpty />
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                {filteredResults.map((r) => (
                  <div key={r.id} className="rounded-xl overflow-hidden border border-border/60 bg-card/40 group">
                    <a href={r.url} target="_blank" rel="noreferrer" className="block relative bg-black/40">
                      <img src={r.url} alt="" className="w-full h-auto object-contain" />
                    </a>
                    <div className="p-2 text-[11px] text-muted-foreground flex items-center justify-between gap-1">
                      <span className="truncate flex-1" title={r.sourceName}>{r.sourceName}</span>
                      <button
                        type="button"
                        onClick={() => downloadOne(r)}
                        className="inline-flex items-center gap-1 rounded-full border border-border bg-card/60 px-2 py-1 hover:text-foreground hover:border-primary/50 transition"
                        title="Download"
                      >
                        <Download className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => persistResults(results.filter((x) => x.id !== r.id))}
                        className="inline-flex items-center gap-1 rounded-full border border-border bg-card/60 px-2 py-1 hover:text-destructive hover:border-destructive/50 transition"
                        title="Hapus"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
      </div>
    </DashboardShell>
  );
}