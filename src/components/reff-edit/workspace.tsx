import { useMemo, useRef, type ChangeEvent, type ReactNode } from "react";
import { useSticky } from "@/lib/stores/use-sticky";
import {
  Loader2,
  Upload,
  X,
  Sparkles,
  Send,
  MessageSquare,
  BookmarkPlus,
  Plus,
  Download,
  Images,
} from "lucide-react";
import { downloadFilesAsZip } from "@/lib/utils/download-zip";
import {
  Card,
  Field,
  Input,
  Select,
  Textarea,
  PrimaryButton,
  GhostButton,
} from "@/components/dashboard/ui";
import {
  REF_CATEGORIES,
  REF_ROLES,
  type BlueprintScene,
  type HistoryItem,
  type ReferenceDNA,
  type ReferenceItem,
  type RefRole,
  loadHistory,
  loadRefs,
  saveHistory,
  saveRefs,
  uid8,
} from "@/lib/reff-edit/store";
import {
  adjustBlueprint,
  analyzeReferenceDNA,
  generateBlueprint,
} from "@/lib/reff-edit/brain";
import { useAuth } from "@/lib/auth-context";
import { getCreativeKeys, headersFor } from "@/lib/creative/keys";

const LS_ROUTING = "aatools.routing.v2";
function getImageProvider(): string {
  if (typeof window === "undefined") return "weavy";
  try {
    const raw = localStorage.getItem(LS_ROUTING);
    if (!raw) return "weavy";
    const r = JSON.parse(raw) as { image?: string };
    return r.image || "weavy";
  } catch {
    return "weavy";
  }
}

type LocalRef = {
  key: string;
  file: File | null;
  previewUrl: string | null;
  name: string;
  role: RefRole;
  category: string;
  weight: number;
};

function newLocalRef(kind: "image" | "video"): LocalRef {
  return {
    key: uid8(),
    file: null,
    previewUrl: null,
    name: kind === "image" ? "Reference image" : "Reference video",
    role: "style",
    category: "Cinematic",
    weight: 70,
  };
}

async function downscaleImageToB64(
  file: File,
  maxDim = 1280,
  quality = 0.82,
): Promise<{ mime: string; b64: string }> {
  // For non-image files or when canvas is unavailable, fall back to raw base64.
  const rawFallback = async () => {
    const buf = await file.arrayBuffer();
    let bin = "";
    const bytes = new Uint8Array(buf);
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return { mime: file.type || "application/octet-stream", b64: btoa(bin) };
  };
  if (typeof window === "undefined" || !file.type.startsWith("image/")) {
    return rawFallback();
  }
  try {
    const url = URL.createObjectURL(file);
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("image decode failed"));
      el.src = url;
    });
    const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas ctx null");
    ctx.drawImage(img, 0, 0, w, h);
    URL.revokeObjectURL(url);
    const dataUrl = canvas.toDataURL("image/jpeg", quality);
    const [, b64 = ""] = dataUrl.split(",");
    return { mime: "image/jpeg", b64 };
  } catch {
    return rawFallback();
  }
}

type LogLine = { time: string; level: "info" | "error" | "ok"; msg: string };

export function ReffEditWorkspace({
  mode,
  title,
  desc,
  aspectOptions,
}: {
  mode: "image" | "video";
  title: string;
  desc: string;
  aspectOptions: { value: string; label: string }[];
}) {
  const { user } = useAuth();
  const uid = user?.id ?? null;

  const K = `reff-edit.${mode}`;
  const [refs, setRefs] = useSticky<LocalRef[]>(`${K}.refs`, () => [newLocalRef(mode)]);
  const [target, setTarget] = useSticky<LocalRef>(`${K}.target`, () => ({
    ...newLocalRef(mode),
    name: mode === "image" ? "Target image" : "Target video",
  }));
  const [aspect, setAspect] = useSticky<string>(`${K}.aspect`, aspectOptions[0]?.value ?? "original");
  const [quality, setQuality] = useSticky<"draft" | "standard" | "high">(
    `${K}.quality`,
    "standard",
  );
  const [prompt, setPrompt] = useSticky<string>(`${K}.prompt`, "");

  const [dna, setDna] = useSticky<ReferenceDNA | null>(`${K}.dna`, null);
  const [blueprint, setBlueprint] = useSticky<BlueprintScene[]>(`${K}.blueprint`, []);
  const [logs, setLogs] = useSticky<LogLine[]>(`${K}.logs`, []);
  const [analyzing, setAnalyzing] = useSticky<boolean>(`${K}.analyzing`, false);
  const [rendering, setRendering] = useSticky<boolean>(`${K}.rendering`, false);
  const [outputs, setOutputs] = useSticky<string[]>(`${K}.outputs`, []);
  const [selectedIdx, setSelectedIdx] = useSticky<number>(`${K}.selectedIdx`, 0);
  const [galleryView, setGalleryView] = useSticky<boolean>(`${K}.galleryView`, false);
  const [chatInput, setChatInput] = useSticky<string>(`${K}.chatInput`, "");
  const [chatBusy, setChatBusy] = useSticky<boolean>(`${K}.chatBusy`, false);

  const pushOutput = (url: string) => {
    setOutputs((prev) => [url, ...prev].slice(0, 50));
    setSelectedIdx(0);
    setGalleryView(false);
  };

  const currentOutput = outputs[selectedIdx] ?? null;

  const downloadOne = async (url: string, idx: number) => {
    try {
      const ext = mode === "image" ? "png" : "mp4";
      const filename = `reff-edit-${mode}-${idx + 1}.${ext}`;
      let blobUrl = url;
      if (/^https?:\/\//i.test(url)) {
        const r = await fetch(url).catch(() => null);
        if (r && r.ok) blobUrl = URL.createObjectURL(await r.blob());
      }
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      if (blobUrl !== url) setTimeout(() => URL.revokeObjectURL(blobUrl), 4000);
    } catch (e) {
      pushLog(`Download gagal: ${(e as Error).message}`, "error");
    }
  };

  const downloadAll = async () => {
    if (outputs.length === 0) return;
    const ext = mode === "image" ? "png" : "mp4";
    const files = outputs.map((url, i) => ({
      url,
      filename: `reff-edit-${mode}-${i + 1}.${ext}`,
    }));
    await downloadFilesAsZip(files, `reff-edit-${mode}`);
  };

  const canAnalyze = refs.some((r) => r.file) && !analyzing;
  const canRender = !!dna && blueprint.length > 0 && !rendering;

  const pushLog = (msg: string, level: LogLine["level"] = "info") =>
    setLogs((prev) =>
      [...prev, { time: new Date().toLocaleTimeString(), level, msg }].slice(
        -200,
      ),
    );

  const setRef = (key: string, patch: Partial<LocalRef>) =>
    setRefs((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const removeRef = (key: string) =>
    setRefs((prev) => (prev.length <= 1 ? prev : prev.filter((r) => r.key !== key)));
  const addRef = () =>
    setRefs((prev) => (prev.length >= 6 ? prev : [...prev, newLocalRef(mode)]));

  const onFile = (key: string, file: File | null) => {
    setRefs((prev) =>
      prev.map((r) => {
        if (r.key !== key) return r;
        if (r.previewUrl) URL.revokeObjectURL(r.previewUrl);
        return {
          ...r,
          file,
          previewUrl: file ? URL.createObjectURL(file) : null,
        };
      }),
    );
  };

  const onTarget = (file: File | null) => {
    if (target.previewUrl) URL.revokeObjectURL(target.previewUrl);
    setTarget((prev) => ({
      ...prev,
      file,
      previewUrl: file ? URL.createObjectURL(file) : null,
    }));
  };

  const runAnalyze = async () => {
    setAnalyzing(true);
    pushLog("Menganalisa referensi via AI Brain…");
    try {
      const descriptions = refs
        .filter((r) => r.file)
        .map(
          (r) =>
            `${r.name} — role:${r.role}, category:${r.category}, weight:${r.weight}%, file:${r.file?.name}`,
        );
      const gotDna = await analyzeReferenceDNA({ mode, descriptions });
      setDna(gotDna);
      pushLog("Reference DNA siap.", "ok");
      pushLog("Membuat Edit Blueprint…");
      const scenes = await generateBlueprint({
        mode,
        dna: gotDna,
        targetHint: prompt || (target.file?.name ?? "target user"),
        totalDuration: mode === "video" ? 15 : 1,
      });
      setBlueprint(scenes);
      pushLog(`Blueprint: ${scenes.length} scene.`, "ok");
    } catch (e) {
      pushLog(`Gagal analisa: ${(e as Error).message}`, "error");
    } finally {
      setAnalyzing(false);
    }
  };

  const runRender = async () => {
    if (!dna) return;
    setRendering(true);
    pushLog("Mengirim ke editing engine…");
    const started = Date.now();
    let status: HistoryItem["status"] = "pending";
    let err: string | undefined;
    let output: string | null = null;
    let providerUsed = "router";
    try {
      if (mode === "image") {
        // Compose prompt from DNA + Blueprint + user hint
        const applyLines = blueprint
          .flatMap((s) => s.apply || [])
          .filter(Boolean)
          .slice(0, 20);
        const composed = [
          "Apply the following Reference DNA to the TARGET image (first image is the target; the rest are style references).",
          `Reference DNA: ${JSON.stringify(dna)}`,
          applyLines.length ? `Editing directives:\n- ${applyLines.join("\n- ")}` : "",
          prompt ? `User note: ${prompt}` : "",
          "Preserve the subject/identity of the TARGET. Only restyle look, lighting, color, mood, composition per the DNA. Return a single edited image.",
        ].filter(Boolean).join("\n\n");

        // Collect files: target first, then references. Convert to base64.
        const files: File[] = [];
        if (target.file) files.push(target.file);
        for (const r of refs) if (r.file) files.push(r.file);
        if (files.length === 0) throw new Error("Butuh minimal 1 file target atau referensi");

        const imageProvider = getImageProvider();
        if (imageProvider === "weavy") {
          const modelKey = "nanobanana2"; // Gemini Image Nano Banana 2 via Weavy
          pushLog(`Routing via Weavy (${modelKey}) — ${files.length} gambar (target + ref)…`);
          const { generateWeavyEdit } = await import("@/lib/providers/weavy-storyboard");
          const url = await generateWeavyEdit({
            modelKey,
            prompt: composed,
            quality: "1K",
            ratio: aspect,
            files: files.slice(0, 6),
          });
          providerUsed = `weavy/${modelKey}`;
          output = url;
          pushOutput(output);
          pushLog(`Style transfer selesai via ${providerUsed}.`, "ok");
          status = "success";
        } else {
          const images = await Promise.all(
            files.slice(0, 4).map((f) => downscaleImageToB64(f, 1024, 0.76)),
          );
          const headers = headersFor(getCreativeKeys());
          const res = await fetch("/api/router/image", {
            method: "POST",
            headers,
            body: JSON.stringify({ prompt: composed, aspectRatio: aspect, images }),
          });
          const data = (await res.json().catch(() => ({}))) as {
            provider?: string;
            b64?: string;
            mime?: string;
            error?: string;
          };
          if (!res.ok || !data.b64) {
            throw new Error(data.error || `router-image ${res.status}`);
          }
          providerUsed = data.provider || "router";
          output = `data:${data.mime || "image/png"};base64,${data.b64}`;
          pushOutput(output);
          pushLog(`Style transfer selesai via ${providerUsed}.`, "ok");
          status = "success";
        }
      } else {
        // Video: render lokal via FFmpeg WASM, dipandu Reference DNA + Blueprint.
        const srcUrl = target.previewUrl || refs.find((r) => r.file)?.previewUrl || null;
        if (!srcUrl) throw new Error("Butuh minimal 1 file target atau referensi");
        const { reffVideoRender, probeVideoDuration } = await import(
          "@/lib/reff-edit/video-ffmpeg"
        );
        const durSec = await probeVideoDuration(srcUrl);
        pushLog(`FFmpeg engine · target ${durSec.toFixed(1)}s · ${blueprint.length} scene`);
        const result = await reffVideoRender({
          sourceUrl: srcUrl,
          sourceFile: target.file ?? refs.find((r) => r.file)?.file ?? null,
          targetDurationSec: durSec,
          aspect,
          dna,
          blueprint,
          onLog: (m) => pushLog(m),
          onProgress: () => {},
        });
        providerUsed = "ffmpeg-wasm";
        output = result.url;
        pushOutput(output);
        pushLog(
          `Render video selesai (${(result.sizeBytes / (1024 * 1024)).toFixed(1)} MB).`,
          "ok",
        );
        status = "success";
      }
    } catch (e) {
      err = (e as Error).message;
      status = "error";
      pushLog(`Render error: ${err}`, "error");
    } finally {
      setRendering(false);
      const history = loadHistory(uid);
      history.unshift({
        id: uid8(),
        mode,
        referenceIds: [],
        dna: dna || undefined,
        blueprint,
        targetUrl: target.previewUrl || undefined,
        outputUrl: output || undefined,
        providerUsed,
        durationMs: Date.now() - started,
        status,
        error: err,
        createdAt: new Date().toISOString(),
      });
      saveHistory(uid, history.slice(0, 100));
    }
  };

  const saveRefsToLibrary = () => {
    const list = loadRefs(uid);
    const now = new Date().toISOString();
    for (const r of refs.filter((x) => x.file)) {
      list.unshift({
        id: uid8(),
        name: r.name,
        type: mode,
        category: r.category,
        role: r.role,
        weight: r.weight,
        sourceUrl: r.previewUrl || "",
        thumbnailUrl: r.previewUrl || undefined,
        dna: dna || undefined,
        createdAt: now,
      });
    }
    saveRefs(uid, list.slice(0, 200));
    pushLog("Referensi disimpan ke Library.", "ok");
  };

  const runChatAdjust = async () => {
    if (!chatInput.trim() || !dna || blueprint.length === 0) return;
    setChatBusy(true);
    pushLog(`Revisi: ${chatInput}`);
    try {
      const next = await adjustBlueprint({
        dna,
        blueprint,
        revision: chatInput.trim(),
      });
      setBlueprint(next);
      pushLog("Blueprint diperbarui.", "ok");
      setChatInput("");
    } catch (e) {
      pushLog(`Revisi gagal: ${(e as Error).message}`, "error");
    } finally {
      setChatBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      {/* ROW 1 — Reference Upload (full width) */}
      <Card
        title="Reference Upload"
        sub={`Sampai 6 file — ${mode === "image" ? "gambar acuan style" : "video acuan style + motion"}`}
        right={
          <div className="flex items-center gap-2">
            <GhostButton
              onClick={saveRefsToLibrary}
              disabled={!refs.some((r) => r.file)}
              className="!px-3 sm:!px-4"
              aria-label="Simpan ke Library"
              title="Simpan ke Library"
            >
              <BookmarkPlus className="h-4 w-4 sm:mr-1" />
              <span className="hidden sm:inline">Simpan ke Library</span>
            </GhostButton>
            <GhostButton
              onClick={addRef}
              disabled={refs.length >= 6}
              className="!px-3 sm:!px-4"
              aria-label="Tambah referensi"
              title="Tambah referensi"
            >
              <Plus className="h-4 w-4 sm:mr-1" />
              <span className="hidden sm:inline">Tambah</span>
            </GhostButton>
          </div>
        }
      >
        <div className="flex flex-col gap-4">
          <div
            className={`grid gap-4 grid-cols-1 ${
              refs.length >= 2 ? "sm:grid-cols-2" : ""
            } ${refs.length >= 3 ? "lg:grid-cols-3" : ""}`}
          >
            {refs.map((r) => (
              <RefRow
                key={r.key}
                accept={mode === "image" ? "image/*" : "video/*"}
                item={r}
                onChange={(patch) => setRef(r.key, patch)}
                onFile={(f) => onFile(r.key, f)}
                onRemove={() => removeRef(r.key)}
                canRemove={refs.length > 1}
              />
            ))}
          </div>
          <PrimaryButton onClick={runAnalyze} disabled={!canAnalyze} className="self-start">
            {analyzing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            Analyze Reference
          </PrimaryButton>
        </div>
      </Card>

      {/* ROW 2 — Reference DNA (full width) */}
      <Card title="Reference DNA" sub="Hasil analisa AI Creative Director">
        {!dna ? (
          <div className="text-sm text-muted-foreground">
            Upload referensi lalu tekan <span className="text-primary">Analyze Reference</span>.
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Object.entries(dna)
              .filter(([k, v]) => k !== "raw" && !!v)
              .map(([k, v]) => (
                <DnaCell key={k} label={k} value={String(v)} />
              ))}
          </div>
        )}
      </Card>


      {/* ROW 2 — Target Content | Output Settings */}
      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Target Content" sub="File yang akan diedit oleh AI">
          <FileDrop
            accept={mode === "image" ? "image/*" : "video/*"}
            file={target.file}
            previewUrl={target.previewUrl}
            kind={mode}
            onFile={(f) => onTarget(f)}
          />
          <div className="mt-3">
            <Field label="Prompt tambahan (opsional)">
              <Textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Contoh: fokus pada produk, background netral, mood premium…"
              />
            </Field>
          </div>
        </Card>

        <Card title="Output Settings">
          <div className="flex flex-col gap-4">
            <Field label="Aspect Ratio">
              <Select
                value={aspect}
                onChange={(e) => setAspect(e.target.value)}
                options={aspectOptions}
              />
            </Field>
            <Field label="Quality">
              <Select
                value={quality}
                onChange={(e) => setQuality(e.target.value as typeof quality)}
                options={[
                  { value: "draft", label: "Draft" },
                  { value: "standard", label: "Standard" },
                  { value: "high", label: "High" },
                ]}
              />
            </Field>
          </div>
        </Card>
      </div>

      {/* ROW 3 — Output Preview | AI Chat Adjustment */}
      <div className="grid gap-5 lg:grid-cols-2">
        <Card
          title="Output Preview"
          sub={outputs.length > 0 ? `${outputs.length} render${outputs.length > 1 ? "s" : ""}` : undefined}
          right={
            outputs.length > 0 ? (
              <div className="flex items-center gap-2">
                {galleryView ? (
                  <GhostButton
                    onClick={() => setGalleryView(false)}
                    className="!px-3"
                    aria-label="Tutup galeri"
                    title="Tutup galeri"
                  >
                    <X className="h-4 w-4 sm:mr-1" />
                    <span className="hidden sm:inline">Tutup</span>
                  </GhostButton>
                ) : outputs.length > 1 ? (
                  <GhostButton
                    onClick={() => setGalleryView(true)}
                    className="!px-3"
                    aria-label="Back to gallery"
                    title="Back to gallery"
                  >
                    <Images className="h-4 w-4 sm:mr-1" />
                    <span className="hidden sm:inline">Galeri</span>
                  </GhostButton>
                ) : null}
                <GhostButton
                  onClick={downloadAll}
                  className="!px-3"
                  aria-label="Download semua"
                  title="Download semua sebagai zip"
                  disabled={outputs.length === 0}
                >
                  <Download className="h-4 w-4 sm:mr-1" />
                  <span className="hidden sm:inline">Download all</span>
                </GhostButton>
              </div>
            ) : null
          }
        >
          {outputs.length === 0 ? (
            <div className="text-sm text-muted-foreground">
              Belum ada hasil. Selesaikan analisa lalu jalankan render.
            </div>
          ) : galleryView ? (
            <div className="grid gap-3 grid-cols-2 sm:grid-cols-3">
              {outputs.map((url, i) => (
                <div
                  key={`${i}-${url.slice(0, 32)}`}
                  className="group relative rounded-xl border border-border overflow-hidden bg-card/40 aspect-square"
                >
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedIdx(i);
                      setGalleryView(false);
                    }}
                    className="block w-full h-full"
                    aria-label={`Buka render #${i + 1}`}
                  >
                    {mode === "image" ? (
                      <img src={url} alt={`Render ${i + 1}`} className="w-full h-full object-cover" />
                    ) : (
                      <video src={url} className="w-full h-full object-cover" muted />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      void downloadOne(url, i);
                    }}
                    className="absolute top-2 right-2 h-8 w-8 grid place-items-center rounded-full bg-background/80 backdrop-blur border border-border text-foreground opacity-0 group-hover:opacity-100 hover:text-primary transition"
                    aria-label="Download"
                    title="Download"
                  >
                    <Download className="h-4 w-4" />
                  </button>
                  {i === 0 && (
                    <div className="absolute bottom-2 left-2 text-[10px] font-mono uppercase tracking-widest bg-primary/90 text-primary-foreground px-2 py-0.5 rounded">
                      Latest
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : currentOutput ? (
            <div className="group relative rounded-xl border border-border overflow-hidden">
              {mode === "image" ? (
                <img src={currentOutput} alt="Output" className="w-full h-auto" />
              ) : (
                <video src={currentOutput} controls className="w-full h-auto" />
              )}
              <button
                type="button"
                onClick={() => void downloadOne(currentOutput, selectedIdx)}
                className="absolute top-3 right-3 h-9 w-9 grid place-items-center rounded-full bg-background/80 backdrop-blur border border-border text-foreground opacity-0 group-hover:opacity-100 hover:text-primary transition"
                aria-label="Download"
                title="Download"
              >
                <Download className="h-4 w-4" />
              </button>
            </div>
          ) : null}
        </Card>

        <Card title="AI Chat Adjustment" sub="Minta revisi bahasa natural">
          <div className="flex flex-col gap-2">
            <Textarea
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder='mis. "buat lebih cinematic", "lighting lebih soft", "seperti iklan Apple"'
            />
            <PrimaryButton
              onClick={runChatAdjust}
              disabled={!chatInput.trim() || chatBusy || !dna || blueprint.length === 0}
            >
              {chatBusy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <MessageSquare className="h-4 w-4" />
              )}
              Kirim revisi
            </PrimaryButton>
          </div>
        </Card>
      </div>

      {/* ROW 4 — Edit Blueprint (full width) */}
      <Card title="Edit Blueprint" sub="Ubah scene sebelum render">
        {blueprint.length === 0 ? (
          <div className="text-sm text-muted-foreground">
            Blueprint muncul otomatis setelah DNA siap.
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="grid gap-3 md:grid-cols-2">
              {blueprint.map((s, idx) => (
                <div key={s.id} className="rounded-xl border border-border bg-card/40 p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <Input
                      value={s.name}
                      onChange={(e) =>
                        setBlueprint((prev) =>
                          prev.map((x, i) =>
                            i === idx ? { ...x, name: e.target.value } : x,
                          ),
                        )
                      }
                      className="!py-1.5 !text-sm"
                    />
                    <Input
                      type="number"
                      value={s.from}
                      onChange={(e) =>
                        setBlueprint((prev) =>
                          prev.map((x, i) =>
                            i === idx ? { ...x, from: Number(e.target.value) } : x,
                          ),
                        )
                      }
                      className="!w-20 !py-1.5 !text-sm"
                    />
                    <span className="text-xs text-muted-foreground">→</span>
                    <Input
                      type="number"
                      value={s.to}
                      onChange={(e) =>
                        setBlueprint((prev) =>
                          prev.map((x, i) =>
                            i === idx ? { ...x, to: Number(e.target.value) } : x,
                          ),
                        )
                      }
                      className="!w-20 !py-1.5 !text-sm"
                    />
                  </div>
                  <Textarea
                    rows={3}
                    value={s.apply.join("\n")}
                    onChange={(e) =>
                      setBlueprint((prev) =>
                        prev.map((x, i) =>
                          i === idx
                            ? {
                                ...x,
                                apply: e.target.value
                                  .split("\n")
                                  .map((t) => t.trim())
                                  .filter(Boolean),
                              }
                            : x,
                        ),
                      )
                    }
                  />
                </div>
              ))}
            </div>
            <PrimaryButton onClick={runRender} disabled={!canRender}>
              {rendering ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              Send to Editing Engine
            </PrimaryButton>
          </div>
        )}
      </Card>

      {/* ROW 5 — Render Timeline (full width) */}
      <Card title="Render Timeline" sub="Log status per langkah">
        <div className="max-h-52 overflow-y-auto font-mono text-xs space-y-1">
          {logs.length === 0 ? (
            <div className="text-muted-foreground">Belum ada aktivitas.</div>
          ) : (
            logs.map((l, i) => (
              <div
                key={i}
                className={
                  l.level === "error"
                    ? "text-red-400"
                    : l.level === "ok"
                      ? "text-emerald-300"
                      : "text-foreground/80"
                }
              >
                <span className="text-muted-foreground">[{l.time}]</span> {l.msg}
              </div>
            ))
          )}
        </div>
      </Card>
    </div>
  );
}

function DnaCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-card/40 p-3">
      <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground">
        {label}
      </div>
      <div className="text-sm text-foreground mt-1">{value}</div>
    </div>
  );
}

function RefRow({
  item,
  accept,
  onChange,
  onFile,
  onRemove,
  canRemove,
}: {
  item: LocalRef;
  accept: string;
  onChange: (patch: Partial<LocalRef>) => void;
  onFile: (file: File | null) => void;
  onRemove: () => void;
  canRemove: boolean;
}) {
  return (
    <div className="group/ref relative rounded-2xl border border-border bg-card/30 p-3 flex flex-col gap-3">
      <div className="relative">
        <FileDrop
          accept={accept}
          file={item.file}
          previewUrl={item.previewUrl}
          kind={accept.startsWith("image") ? "image" : "video"}
          onFile={onFile}
          large
        />
        {canRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="absolute top-2 right-2 h-8 w-8 grid place-items-center rounded-full bg-background/80 backdrop-blur border border-border text-muted-foreground opacity-0 group-hover/ref:opacity-100 hover:text-red-400 hover:border-red-400/60 transition"
            aria-label="Hapus referensi"
          >
            <X className="h-4 w-4" />
          </button>
        )}
        {item.file && (
          <div className="absolute bottom-2 left-2 right-2 text-[11px] text-white/90 truncate bg-black/50 backdrop-blur px-2 py-1 rounded-md opacity-0 group-hover/ref:opacity-100 transition">
            {item.file.name}
          </div>
        )}
      </div>
      <div className="flex flex-col gap-2">
        <Input
          value={item.name}
          onChange={(e) => onChange({ name: e.target.value })}
          className="!py-1.5 !text-sm"
        />
        <div className="grid grid-cols-2 gap-2">
          <Select
            value={item.role}
            onChange={(e) => onChange({ role: e.target.value as RefRole })}
            options={REF_ROLES.map((r) => ({ value: r.value, label: r.label }))}
          />
          <Select
            value={item.category}
            onChange={(e) => onChange({ category: e.target.value })}
            options={REF_CATEGORIES.map((c) => ({ value: c, label: c }))}
          />
        </div>
        <div>
          <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-muted-foreground mb-1">
            Weight · {item.weight}%
          </div>
          <input
            type="range"
            min={0}
            max={100}
            value={item.weight}
            onChange={(e) => onChange({ weight: Number(e.target.value) })}
            className="w-full accent-primary"
          />
        </div>
      </div>
    </div>
  );
}


function FileDrop({
  accept,
  file,
  previewUrl,
  kind,
  onFile,
  compact,
  large,
}: {
  accept: string;
  file: File | null;
  previewUrl: string | null;
  kind: "image" | "video";
  onFile: (f: File | null) => void;
  compact?: boolean;
  large?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const onChange = (e: ChangeEvent<HTMLInputElement>) => {
    onFile(e.target.files?.[0] ?? null);
  };
  const emptySize = compact ? "h-20 w-20" : large ? "h-56 w-full" : "h-40 w-full";
  return (
    <div className={compact ? "shrink-0" : ""}>

      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={onChange}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className={`${previewUrl ? "w-full max-h-[70vh]" : emptySize} rounded-xl border ${previewUrl ? "border-border" : "border-dashed border-border"} bg-card/30 grid place-items-center overflow-hidden hover:border-primary/60 transition`}
      >
        {previewUrl ? (
          kind === "image" ? (
            <img src={previewUrl} alt="preview" className="w-full h-auto max-h-[70vh] object-contain" />
          ) : (
            <video src={previewUrl} className="w-full h-auto max-h-[70vh] object-contain" controls muted />
          )
        ) : (
          <div className="flex flex-col items-center gap-1 text-muted-foreground text-xs">
            <Upload className="h-4 w-4" />
            {!compact && <span>Klik untuk upload</span>}
          </div>
        )}
      </button>
      {file && !compact && (
        <div className="text-[11px] text-muted-foreground mt-1 truncate">
          {file.name}
        </div>
      )}
    </div>
  );
}

export function ReffEditListCard({
  title,
  sub,
  empty,
  children,
}: {
  title: string;
  sub?: string;
  empty?: string;
  children: ReactNode;
}) {
  return (
    <Card title={title} sub={sub}>
      {empty ? (
        <div className="text-sm text-muted-foreground">{empty}</div>
      ) : (
        children
      )}
    </Card>
  );
}

export function useLibrary(uid: string | null) {
  return useMemo(() => loadRefs(uid), [uid]);
}

export function useHistoryList(uid: string | null): HistoryItem[] {
  return useMemo(() => loadHistory(uid), [uid]);
}

export type { ReferenceItem };
