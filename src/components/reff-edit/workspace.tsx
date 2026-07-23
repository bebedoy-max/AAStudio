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

/**
 * Capture the first meaningful frame from a video URL (blob or http) and
 * return a JPEG data URL usable as a persistent thumbnail. Returns null on
 * failure (e.g. CORS-blocked cross-origin video).
 */
async function captureVideoThumbnail(
  url: string,
  maxDim = 480,
  quality = 0.7,
): Promise<string | null> {
  if (typeof window === "undefined") return null;
  return await new Promise((resolve) => {
    try {
      const video = document.createElement("video");
      video.crossOrigin = "anonymous";
      video.preload = "auto";
      video.muted = true;
      video.playsInline = true;
      video.src = url;
      let done = false;
      const finish = (result: string | null) => {
        if (done) return;
        done = true;
        video.src = "";
        resolve(result);
      };
      video.onerror = () => finish(null);
      video.onloadedmetadata = () => {
        const target = Math.min(1.0, Math.max(0.1, (video.duration || 2) * 0.1));
        try {
          video.currentTime = target;
        } catch {
          finish(null);
        }
      };
      video.onseeked = () => {
        try {
          const w0 = video.videoWidth || 0;
          const h0 = video.videoHeight || 0;
          if (!w0 || !h0) return finish(null);
          const scale = Math.min(1, maxDim / Math.max(w0, h0));
          const w = Math.max(1, Math.round(w0 * scale));
          const h = Math.max(1, Math.round(h0 * scale));
          const canvas = document.createElement("canvas");
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext("2d");
          if (!ctx) return finish(null);
          ctx.drawImage(video, 0, 0, w, h);
          finish(canvas.toDataURL("image/jpeg", quality));
        } catch {
          finish(null);
        }
      };
      setTimeout(() => finish(null), 8000);
    } catch {
      resolve(null);
    }
  });
}

/**
 * For images: if the URL is a remote http(s) URL, fetch and inline as a
 * data URL so it survives blob revocation / link expiry. Data URLs are
 * returned as-is. Returns null on failure.
 */
async function persistImageThumbnail(url: string): Promise<string | null> {
  if (!url) return null;
  if (url.startsWith("data:")) return url;
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    const blob = await r.blob();
    const file = new File([blob], "output.jpg", { type: blob.type || "image/jpeg" });
    const { b64, mime } = await downscaleImageToB64(file, 640, 0.72);
    return `data:${mime};base64,${b64}`;
  } catch {
    return null;
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
  const [targets, setTargets] = useSticky<LocalRef[]>(`${K}.targets`, () => [
    { ...newLocalRef(mode), name: mode === "image" ? "Target image" : "Target video 1" },
  ]);
  const target = targets[0]; // legacy accessor for image mode
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
  const [renderEngine, setRenderEngine] = useSticky<"browser" | "shotstack" | "creatomate">(
    `${K}.renderEngine`,
    "browser",
  );

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

  const onTargetFile = (key: string, file: File | null) => {
    setTargets((prev) =>
      prev.map((t) => {
        if (t.key !== key) return t;
        if (t.previewUrl) URL.revokeObjectURL(t.previewUrl);
        return { ...t, file, previewUrl: file ? URL.createObjectURL(file) : null };
      }),
    );
  };
  const addTarget = () =>
    setTargets((prev) => {
      if (mode === "image" || prev.length >= 10) return prev;
      return [
        ...prev,
        { ...newLocalRef(mode), name: `Target video ${prev.length + 1}` },
      ];
    });
  const removeTarget = (key: string) =>
    setTargets((prev) => {
      if (prev.length <= 1) return prev;
      const t = prev.find((x) => x.key === key);
      if (t?.previewUrl) URL.revokeObjectURL(t.previewUrl);
      return prev.filter((x) => x.key !== key);
    });

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
      // For video mode, probe each target duration so the brain can pick hooks per source.
      let brainTargets: { name: string; durationSec: number }[] | undefined;
      if (mode === "video") {
        const filledTargets = targets.filter((t) => t.file);
        if (filledTargets.length) {
          const { probeVideoDuration } = await import("@/lib/reff-edit/video-ffmpeg");
          brainTargets = await Promise.all(
            filledTargets.map(async (t) => ({
              name: t.file?.name || t.name,
              durationSec: t.previewUrl ? await probeVideoDuration(t.previewUrl) : 0,
            })),
          );
          pushLog(
            `Analisa ${brainTargets.length} target video (total ${brainTargets
              .reduce((a, b) => a + b.durationSec, 0)
              .toFixed(1)}s)…`,
          );
        }
      }
      const scenes = await generateBlueprint({
        mode,
        dna: gotDna,
        targetHint: prompt || (target?.file?.name ?? "target user"),
        totalDuration: mode === "video" ? 15 : 1,
        targets: brainTargets,
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
        // Video mode. Collect all target files.
        const filled = targets.filter((t) => t.file && t.previewUrl);
        if (filled.length === 0) throw new Error("Upload minimal 1 target video.");
        const { reffVideoRender, probeVideoDuration } = await import(
          "@/lib/reff-edit/video-ffmpeg"
        );
        const sourceInfo = await Promise.all(
          filled.map(async (t) => ({
            url: t.previewUrl!,
            file: t.file!,
            durationSec: await probeVideoDuration(t.previewUrl!),
            name: t.file!.name,
          })),
        );
        if (renderEngine === "browser") {
          pushLog(
            `FFmpeg (browser) · ${sourceInfo.length} source · ${blueprint.length} scene`,
          );
          const result = await reffVideoRender({
            sources: sourceInfo,
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
        } else {
          // Cloud render (Shotstack / Creatomate). Upload each source publicly first.
          pushLog(`Cloud render via ${renderEngine} — mengunggah ${sourceInfo.length} source…`);
          const uploaded: { url: string; name: string }[] = [];
          for (let i = 0; i < sourceInfo.length; i++) {
            const s = sourceInfo[i];
            const fd = new FormData();
            fd.append("file", s.file, s.name);
            const up = await fetch("/api/public/upload-catbox", { method: "POST", body: fd });
            const upData = (await up.json().catch(() => ({}))) as { url?: string; error?: string };
            if (!up.ok || !upData.url) {
              throw new Error(`Upload source #${i + 1} gagal: ${upData.error || up.status}`);
            }
            uploaded.push({ url: upData.url, name: s.name });
            pushLog(`  ↑ #${i + 1} ${upData.url}`);
          }
          const headers = headersFor(getCreativeKeys());
          const res = await fetch("/api/router/render-cloud", {
            method: "POST",
            headers,
            body: JSON.stringify({
              provider: renderEngine,
              kind: "clipper",
              aspectRatio: aspect,
              sources: uploaded,
              blueprint,
              dna,
              timeline: {
                totalSec: blueprint.reduce(
                  (a, s) => a + Math.max(0.1, (s.to || 0) - (s.from || 0)),
                  0,
                ),
              },
            }),
          });
          const data = (await res.json().catch(() => ({}))) as {
            ok?: boolean;
            jobId?: string;
            url?: string;
            status?: string;
            message?: string;
          };
          if (!res.ok || !data.ok) {
            throw new Error(data.message || `render-cloud ${res.status}`);
          }
          providerUsed = renderEngine;
          if (data.url) {
            output = data.url;
            pushOutput(output);
            pushLog(`Cloud render selesai: ${data.url}`, "ok");
            status = "success";
          } else {
            pushLog(
              `Job ${data.jobId} ter-antri di ${renderEngine}. ${data.message || "Cek dashboard provider untuk URL final."}`,
              "ok",
            );
            status = "pending";
          }
        }
      }
    } catch (e) {
      err = (e as Error).message;
      status = "error";
      pushLog(`Render error: ${err}`, "error");
    } finally {
      setRendering(false);
      const history = loadHistory(uid);
      let thumbnailUrl: string | undefined;
      if (output) {
        try {
          if (mode === "image") {
            thumbnailUrl = (await persistImageThumbnail(output)) || undefined;
          } else {
            thumbnailUrl = (await captureVideoThumbnail(output)) || undefined;
          }
        } catch {
          thumbnailUrl = undefined;
        }
      }
      history.unshift({
        id: uid8(),
        mode,
        referenceIds: [],
        dna: dna || undefined,
        blueprint,
        targetUrl: target?.previewUrl || undefined,
        outputUrl: output || undefined,
        thumbnailUrl,
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

  const saveOutputAsStyle = async () => {
    if (!currentOutput || !dna) return;
    const list = loadRefs(uid);
    let thumb: string | undefined;
    if (mode === "image") {
      thumb = (await persistImageThumbnail(currentOutput)) || currentOutput;
    } else {
      thumb = (await captureVideoThumbnail(currentOutput)) || undefined;
    }
    list.unshift({
      id: uid8(),
      name: `Style ${new Date().toLocaleString("id-ID")}`,
      type: mode,
      category: "Cinematic",
      role: "style",
      weight: 80,
      sourceUrl: currentOutput,
      thumbnailUrl: thumb,
      dna,
      createdAt: new Date().toISOString(),
    });
    saveRefs(uid, list.slice(0, 200));
    pushLog("Style output disimpan ke Library.", "ok");
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
              title="Simpan file referensi (+ DNA jika sudah dianalisa) ke Reference Library"
            >
              <BookmarkPlus className="h-4 w-4 mr-1" />
              <span>Save to Library</span>
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
      <Card
        title="Reference DNA"
        sub="Hasil analisa AI Creative Director"
        right={
          dna ? (
            <GhostButton
              onClick={saveRefsToLibrary}
              disabled={!refs.some((r) => r.file)}
              className="!px-3"
              title="Simpan referensi + DNA ke Library"
            >
              <BookmarkPlus className="h-4 w-4 mr-1" />
              <span>Save Style + DNA</span>
            </GhostButton>
          ) : undefined
        }
      >
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
        <Card
          title="Target Content"
          sub={
            mode === "video"
              ? `File yang akan diedit AI — bisa upload s.d. 10 video, AI akan pilih segmen terbaik dari tiap video`
              : "File yang akan diedit oleh AI"
          }
          right={
            mode === "video" ? (
              <GhostButton
                onClick={addTarget}
                disabled={targets.length >= 10}
                className="!px-3"
                aria-label="Tambah target"
                title="Tambah target video"
              >
                <Plus className="h-4 w-4 sm:mr-1" />
                <span className="hidden sm:inline">Tambah</span>
              </GhostButton>
            ) : null
          }
        >
          {mode === "image" ? (
            <FileDrop
              accept="image/*"
              file={targets[0]?.file ?? null}
              previewUrl={targets[0]?.previewUrl ?? null}
              kind="image"
              onFile={(f) => onTargetFile(targets[0].key, f)}
            />
          ) : (
            <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3">
              {targets.map((t, i) => (
                <div key={t.key} className="relative rounded-xl border border-border bg-card/30 p-2">
                  <FileDrop
                    accept="video/*"
                    file={t.file}
                    previewUrl={t.previewUrl}
                    kind="video"
                    onFile={(f) => onTargetFile(t.key, f)}
                    large
                  />
                  <div className="mt-1 flex items-center justify-between gap-2">
                    <div className="text-[11px] text-muted-foreground truncate">
                      #{i + 1} {t.file?.name ?? "(kosong)"}
                    </div>
                    {targets.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeTarget(t.key)}
                        className="h-6 w-6 grid place-items-center rounded-md border border-border text-muted-foreground hover:text-red-400 hover:border-red-400/60 transition"
                        aria-label="Hapus target"
                        title="Hapus target"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
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
            {mode === "video" && (
              <Field label="Render Engine">
                <Select
                  value={renderEngine}
                  onChange={(e) => setRenderEngine(e.target.value as typeof renderEngine)}
                  options={[
                    { value: "browser", label: "Browser FFmpeg (cepat, ≤ ~8 menit / 350 MB per file)" },
                    { value: "shotstack", label: "Cloud · Shotstack (video panjang, butuh key)" },
                    { value: "creatomate", label: "Cloud · Creatomate (video panjang, butuh key)" },
                  ]}
                />
              </Field>
            )}
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
                <GhostButton
                  onClick={() => void saveOutputAsStyle()}
                  disabled={!currentOutput || !dna}
                  className="!px-3"
                  title="Simpan output ini + DNA sebagai style baru di Library"
                >
                  <BookmarkPlus className="h-4 w-4 sm:mr-1" />
                  <span className="hidden sm:inline">Save as style</span>
                </GhostButton>
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
