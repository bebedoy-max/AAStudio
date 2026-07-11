import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Upload,
  Play,
  Scissors,
  Wand2,
  Download,
  Sparkles,
  Trash2,
  FileVideo,
  Zap,
  Loader2,
  ChevronRight,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { DashboardShell } from "@/components/dashboard/shell";
import { clipperStore, pushLog, setStage } from "@/lib/mixing/run-store";
import type {
  ClipperProject,
  ClipperSettings,
  HookScore,
  VideoSource,
} from "@/lib/mixing/types";
import { autoBuildClips } from "@/lib/mixing/timeline-engine";
import { toSrt, toVtt, stylePreview } from "@/lib/mixing/subtitle-engine";
import { headersForBrain, listProviders, health } from "@/lib/mixing/providers";
import { mixingQueue } from "@/lib/mixing/queue";
import { loadMemory, saveMemory } from "@/lib/mixing/memory";
import { listProjects, saveClipper, loadClipper, deleteProject } from "@/lib/mixing/projects";
import { submitRender, checkSourceSize, fmtBytes, type RenderEngine } from "@/lib/mixing/render-engine";
import { cloudRenderStatus } from "@/lib/mixing/providers";

export const Route = createFileRoute("/mixing/clipper")({
  component: ClipperPage,
});

const DEFAULT_SETTINGS: ClipperSettings = {
  clipDurationSec: 30,
  autoCutting: true,
  autoReframe: true,
  aspectRatio: "9:16",
  autoZoom: true,
  zoomKind: "punch",
  subtitle: true,
  subtitleStyle: "TikTok",
  subtitleFont: "Inter",
  subtitleColor: "#ffffff",
  subtitleAnimation: "karaoke",
  transition: "Smooth",
  transitionDuration: 0.3,
  music: "Vlog",
  musicVolume: 0.35,
  musicDuck: true,
  sfx: ["Whoosh"],
  generateDub: false,
  hookKinds: ["best_hook", "best_moment", "most_viral", "most_emotional", "most_funny"],
};

function makeId() {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

function clipPreviewRange(clip: ClipperProject["clips"][number]): { start: number; end: number } {
  const ranges = clip.timeline.tracks
    .filter((t) => t.kind === "clip")
    .map((t) => ({ start: t.sourceIn, end: t.sourceOut }))
    .filter((r) => Number.isFinite(r.start) && Number.isFinite(r.end) && r.end > r.start);
  if (ranges.length === 0) return { start: clip.start, end: Math.max(clip.end, clip.start + 0.5) };
  return {
    start: Math.min(...ranges.map((r) => r.start)),
    end: Math.max(...ranges.map((r) => r.end)),
  };
}

function ClipperPage() {
  const state = clipperStore.use();
  const { user } = useAuth();
  const [settings, setSettings] = useState<ClipperSettings>(DEFAULT_SETTINGS);
  const [drawerOpen, setDrawerOpen] = useState(true);
  const [projects, setProjects] = useState(listProjects("clipper"));
  const [renderEngine, setRenderEngine] = useState<RenderEngine>("ffmpeg");
  const [renderOutUrl, setRenderOutUrl] = useState<string | null>(null);
  const [renderProgress, setRenderProgress] = useState<number>(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const brainHealth = useMemo(() => health("brain"), []);
  const sttHealth = useMemo(() => {
    const h = health("stt");
    if (h.status === "ok") return h;
    const openai = readLsArray("aatools.brain.openaiKeys").filter((k) => k.startsWith("sk-"));
    return openai.length ? { ...h, status: "ok" as const } : h;
  }, []);


  useEffect(() => {
    const mem = loadMemory().clipper;
    if (mem) {
      setSettings((s) => ({
        ...s,
        subtitleStyle: (mem.subtitleStyle as ClipperSettings["subtitleStyle"]) ?? s.subtitleStyle,
        transition: (mem.transition as ClipperSettings["transition"]) ?? s.transition,
        aspectRatio: (mem.aspectRatio as ClipperSettings["aspectRatio"]) ?? s.aspectRatio,
        zoomKind: (mem.zoomKind as ClipperSettings["zoomKind"]) ?? s.zoomKind,
        clipDurationSec: mem.lastClipDuration ?? s.clipDurationSec,
      }));
    }
  }, []);

  useEffect(() => {
    saveMemory({
      clipper: {
        subtitleStyle: settings.subtitleStyle,
        transition: settings.transition,
        aspectRatio: settings.aspectRatio,
        zoomKind: settings.zoomKind,
        lastClipDuration: settings.clipDurationSec,
      },
    });
  }, [settings.subtitleStyle, settings.transition, settings.aspectRatio, settings.zoomKind, settings.clipDurationSec]);

  const project = state.project;

  const ensureProject = (): ClipperProject => {
    if (project) return project;
    const p: ClipperProject = {
      id: makeId(),
      name: "Untitled Clipper",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      sources: [],
      analysis: null,
      settings,
      timeline: null,
      clips: [],
    };
    clipperStore.patch({ project: p });
    return p;
  };

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const p = ensureProject();
    const additions: VideoSource[] = [];
    for (const f of Array.from(files)) {
      if (!/^video\//.test(f.type) && !/\.(mp4|mov|mkv|avi|webm)$/i.test(f.name)) continue;
      const url = URL.createObjectURL(f);
      const durationSec = await new Promise<number>((resolve) => {
        const v = document.createElement("video");
        v.preload = "metadata";
        v.src = url;
        v.onloadedmetadata = () => resolve(v.duration);
        v.onerror = () => resolve(0);
      });
      additions.push({
        id: makeId(),
        name: f.name,
        size: f.size,
        type: f.type,
        url,
        durationSec,
      });
    }
    if (additions.length === 0) {
      toast.error("File tidak didukung. Gunakan MP4/MOV/MKV/AVI/WEBM.");
      return;
    }
    const updated: ClipperProject = { ...p, sources: [...p.sources, ...additions], updatedAt: Date.now() };
    clipperStore.patch({ project: updated });
    setStage(clipperStore, "upload", 100, `Loaded ${additions.length} video`);
    pushLog(clipperStore, `Upload: ${additions.map((a) => a.name).join(", ")}`);
  }

  async function extractAudioBlob(source: VideoSource): Promise<Blob> {
    // Web-audio decode into 16k mono WAV so /api/router/stt is happy on any browser.
    const res = await fetch(source.url);
    const buf = await res.arrayBuffer();
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ac = new AC();
    const decoded = await ac.decodeAudioData(buf.slice(0));
    const targetRate = 16000;
    const ratio = decoded.sampleRate / targetRate;
    const outLen = Math.floor(decoded.length / ratio);
    const out = new Float32Array(outLen);
    const ch = decoded.numberOfChannels;
    const channels: Float32Array[] = [];
    for (let i = 0; i < ch; i++) channels.push(decoded.getChannelData(i));
    for (let i = 0; i < outLen; i++) {
      const src = Math.floor(i * ratio);
      let sum = 0;
      for (let c = 0; c < ch; c++) sum += channels[c][src] || 0;
      out[i] = sum / ch;
    }
    await ac.close();
    return encodeWav(out, targetRate);
  }

  function encodeWav(samples: Float32Array, sampleRate: number): Blob {
    const buffer = new ArrayBuffer(44 + samples.length * 2);
    const view = new DataView(buffer);
    const writeStr = (o: number, s: string) => {
      for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i));
    };
    writeStr(0, "RIFF");
    view.setUint32(4, 36 + samples.length * 2, true);
    writeStr(8, "WAVE");
    writeStr(12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeStr(36, "data");
    view.setUint32(40, samples.length * 2, true);
    let offset = 44;
    for (let i = 0; i < samples.length; i++, offset += 2) {
      const s = Math.max(-1, Math.min(1, samples[i]));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    }
    return new Blob([buffer], { type: "audio/wav" });
  }

  function readLsArray(key: string): string[] {
    try {
      const v = localStorage.getItem(key);
      if (!v) return [];
      const p = JSON.parse(v);
      return Array.isArray(p) ? p.filter((s): s is string => typeof s === "string" && s.trim().length > 0) : [];
    } catch { return []; }
  }

  async function directStt(
    wav: Blob,
    openaiKeys: string[],
    elevenKeys: string[],
  ): Promise<import("@/lib/mixing/types").Transcript> {
    const errors: string[] = [];
    const mask = (k: string) => `${k.slice(0, 6)}…${k.slice(-4)}`;
    let idx = 0;
    for (const key of openaiKeys) {
      idx++;
      for (const model of ["gpt-4o-transcribe", "whisper-1"]) {
        try {
          const fd = new FormData();
          fd.append("file", wav, "audio.wav");
          fd.append("model", model);
          fd.append("response_format", "verbose_json");
          const r = await fetch("https://api.openai.com/v1/audio/transcriptions", {
            method: "POST",
            headers: { Authorization: `Bearer ${key}` },
            body: fd,
          });
          if (!r.ok) {
            const body = (await r.text()).slice(0, 160);
            errors.push(`openai#${idx}/${model} ${r.status}: ${body}`);
            pushLog(clipperStore, `OpenAI key #${idx} (${mask(key)}) ${model} → ${r.status}, next…`);
            continue;
          }
          const d = await r.json() as { text?: string; language?: string; segments?: Array<{ start: number; end: number; text: string }> };
          pushLog(clipperStore, `OpenAI key #${idx} OK (${model})`);
          return {
            language: d.language || "en",
            fullText: d.text || "",
            segments: d.segments?.map((s) => ({ start: s.start, end: s.end, text: s.text })) ?? [{ start: 0, end: 0, text: d.text || "" }],
          };
        } catch (e) { errors.push(`openai#${idx}/${model}: ${(e as Error).message}`); }
      }
    }
    idx = 0;
    for (const key of elevenKeys) {
      idx++;
      try {
        const fd = new FormData();
        fd.append("file", wav, "audio.wav");
        fd.append("model_id", "scribe_v1");
        const r = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
          method: "POST",
          headers: { "xi-api-key": key },
          body: fd,
        });
        if (!r.ok) {
          const body = (await r.text()).slice(0, 200);
          const reason =
            r.status === 401 ? "invalid/expired key" :
            r.status === 402 ? "quota habis" :
            r.status === 429 ? "rate-limited" :
            r.status >= 500 ? "server error" : "gagal";
          errors.push(`eleven#${idx} ${r.status} (${reason}): ${body}`);
          pushLog(clipperStore, `ElevenLabs key #${idx} (${mask(key)}) → ${r.status} ${reason}, coba key berikutnya…`);
          continue;
        }
        const d = await r.json() as { text?: string; language_code?: string; words?: Array<{ start: number; end: number; text: string }> };
        pushLog(clipperStore, `ElevenLabs key #${idx} OK`);
        const segments = (d.words ?? []).reduce<Array<{ start: number; end: number; text: string }>>((acc, w) => {
          const last = acc[acc.length - 1];
          if (last && w.start - last.end < 0.8 && last.text.length < 120) {
            last.end = w.end; last.text = `${last.text} ${w.text}`.trim();
          } else acc.push({ start: w.start, end: w.end, text: w.text });
          return acc;
        }, []);
        return {
          language: d.language_code || "en",
          fullText: d.text || segments.map((s) => s.text).join(" "),
          segments: segments.length ? segments : [{ start: 0, end: 0, text: d.text || "" }],
        };
      } catch (e) { errors.push(`eleven#${idx}: ${(e as Error).message}`); }
    }
    throw new Error(`Semua STT key gagal. ${errors.join(" | ") || "no keys"}`);
  }


  async function runAnalyze() {
    if (state.busy) return;
    const p = project;
    if (!p || p.sources.length === 0) {
      toast.error("Upload video dulu.");
      return;
    }
    if (brainHealth.status !== "ok") {
      toast.error("Belum ada Brain key. Tambah OpenAI/Gemini di Token Manager.");
      return;
    }
    if (sttHealth.status !== "ok") {
      toast.error("Belum ada STT key. Tambah OpenAI atau ElevenLabs.");
      return;
    }
    clipperStore.patch({ busy: true, log: [] });
    try {
      setStage(clipperStore, "stt", 5, "Extracting audio…");
      const primary = p.sources[0];
      const wav = await extractAudioBlob(primary);
      pushLog(clipperStore, `Audio ready (${(wav.size / 1024).toFixed(0)} KB)`);

      setStage(clipperStore, "stt", 25, "Transcribing…");
      const sttFd = new FormData();
      sttFd.append("file", wav, "audio.wav");
      sttFd.append("filename", "audio.wav");
      const headers: Record<string, string> = {};
      const openaiKeys = readLsArray("aatools.brain.openaiKeys").filter((k) => k.startsWith("sk-"));
      // ElevenLabs STT hanya dipakai kalau user butuh subtitle atau dubbing.
      // Kalau cuma cari hook + cut/gabung via FFmpeg, cukup OpenAI STT (Whisper).
      const needsEleven = settings.subtitle || settings.generateDub;
      const elevenKeys = needsEleven
        ? (listProviders("stt").find((x) => x.id === "eleven")?.keys ?? [])
        : [];
      if (elevenKeys.length) headers["x-user-elevenlabs-keys"] = elevenKeys.join(",");
      if (!needsEleven && openaiKeys.length === 0) {
        throw new Error("Butuh OpenAI STT key (Whisper) untuk transkrip. Tambahkan di Token Manager, atau enable Subtitle/Dub untuk pakai ElevenLabs.");
      }

      // Large audio (>8MB) bypasses worker proxy and goes browser→provider to avoid
      // gateway timeouts / body-size caps that surface as HTML error pages.
      const useDirect = wav.size > 8 * 1024 * 1024;
      const sttRes = await mixingQueue.submit({
        id: "stt",
        label: "stt",
        retries: 1,
        run: async () => {
          if (useDirect) {
            pushLog(clipperStore, needsEleven
              ? "Direct upload to STT provider (bypass worker)"
              : "Direct upload to OpenAI Whisper (ElevenLabs dilewati, subtitle/dub off)");
            return await directStt(wav, openaiKeys, elevenKeys);
          }
          const r = await fetch("/api/router/stt", { method: "POST", headers, body: sttFd });
          const text = await r.text();
          let j: { ok?: boolean; error?: string; transcript?: import("@/lib/mixing/types").Transcript } | null = null;
          try { j = JSON.parse(text); } catch { /* non-json (HTML error page) */ }
          if (!r.ok || !j?.ok) {
            const snippet = text.replace(/<[^>]+>/g, " ").trim().slice(0, 200);
            throw new Error(j?.error || `stt ${r.status}: ${snippet || "non-JSON response (likely upload too large or gateway timeout)"}`);
          }
          return j.transcript!;
        },
      });
      if (!sttRes.ok) throw new Error(sttRes.error);
      const transcript = sttRes.value;

      pushLog(clipperStore, `Transcript: ${transcript.segments.length} segments (${transcript.language})`);

      setStage(clipperStore, "brain", 55, "AI analysing hooks & scenes…");
      const brainRes = await mixingQueue.submit({
        id: "brain",
        label: "brain",
        retries: 1,
        run: async () => {
          const r = await fetch("/api/public/clipper-brain", {
            method: "POST",
            headers: headersForBrain(),
            body: JSON.stringify({
              transcript,
              durationSec: primary.durationSec,
              language: transcript.language,
            }),
          });
          const text = await r.text();
          let j: {
            ok?: boolean;
            error?: string;
            analysis?: Omit<import("@/lib/mixing/types").ClipperAnalysis, "transcript">;
          } | null = null;
          try { j = JSON.parse(text); } catch { /* non-json */ }
          if (!r.ok || !j?.ok) {
            const snippet = text.replace(/<[^>]+>/g, " ").trim().slice(0, 200);
            throw new Error(j?.error || `brain ${r.status}: ${snippet || "non-JSON response"}`);
          }
          return j.analysis!;
        },
      });
      if (!brainRes.ok) throw new Error(brainRes.error);


      const analysis: import("@/lib/mixing/types").ClipperAnalysis = {
        scenes: brainRes.value.scenes ?? [],
        speakers: brainRes.value.speakers ?? [],
        hooks: brainRes.value.hooks ?? [],
        deadAir: brainRes.value.deadAir ?? [],
        fillers: brainRes.value.fillers ?? [],
        keywords: brainRes.value.keywords ?? [],
        topics: brainRes.value.topics ?? [],
        emotionCurve: brainRes.value.emotionCurve ?? [],
        transcript,
      };

      setStage(clipperStore, "timeline", 80, "Building timeline…");
      const clips = autoBuildClips(p.sources, analysis, settings);
      const updated: ClipperProject = {
        ...p,
        analysis,
        settings,
        timeline: clips[0]?.timeline ?? null,
        clips,
        updatedAt: Date.now(),
      };
      clipperStore.patch({ project: updated });
      saveClipper(updated);
      setProjects(listProjects("clipper"));
      setStage(clipperStore, "done", 100, `Ready — ${clips.length} clips`);
      pushLog(clipperStore, `Timeline built — ${clips.length} clips`);
      toast.success(`AI selesai. ${clips.length} klip siap.`);
    } catch (e) {
      const msg = (e as Error).message || "unknown";
      setStage(clipperStore, "error", 0, msg);
      pushLog(clipperStore, `ERROR: ${msg}`);
      toast.error(msg);
    } finally {
      clipperStore.patch({ busy: false });
    }
  }

  function rebuildClips() {
    if (!project?.analysis) return;
    const clips = autoBuildClips(project.sources, project.analysis, settings);
    const updated: ClipperProject = {
      ...project,
      settings,
      timeline: clips[0]?.timeline ?? null,
      clips,
      updatedAt: Date.now(),
    };
    clipperStore.patch({ project: updated });
    saveClipper(updated);
    setProjects(listProjects("clipper"));
    pushLog(clipperStore, `Rebuilt timeline (${clips.length} clips)`);
  }
  async function handleRender() {
    if (!project?.timeline) {
      toast.error("Jalankan Analyze dulu.");
      return;
    }
    const sourceBytes = project.sources.reduce((a, s) => a + (s.size || 0), 0);
    const sizeInfo = checkSourceSize(sourceBytes);
    if (renderEngine === "ffmpeg" && sizeInfo.overLimit) {
      const cloud = cloudRenderStatus();
      const availTxt = cloud.shotstack.available
        ? "Shotstack tersedia"
        : cloud.creatomate.available
          ? "Creatomate tersedia"
          : "belum ada key cloud di Token Manager → Render";
      toast.error(
        `Video ${sizeInfo.humanBytes} melebihi limit FFmpeg (${sizeInfo.humanLimit}). Ganti Render engine ke Shotstack/Creatomate — ${availTxt}.`,
      );
      pushLog(clipperStore, `ERROR: file terlalu besar untuk FFmpeg (${sizeInfo.humanBytes} > ${sizeInfo.humanLimit})`);
      return;
    }
    setRenderOutUrl(null);
    setRenderProgress(0);
    setStage(clipperStore, "render", 10, `Rendering via ${renderEngine}…`);
    const r = await submitRender(
      {
        kind: "clipper",
        sources: project.sources.map((s) => ({ id: s.id, name: s.name, url: s.url })),
        timeline: project.timeline,
        subtitle: {
          enabled: settings.subtitle,
          srt: project.analysis ? toSrt(project.analysis.transcript) : undefined,
          style: settings.subtitleStyle,
        },
        audio: { music: settings.music, sfx: settings.sfx },
        aspectRatio: settings.aspectRatio,
      },
      {
        engine: renderEngine,
        sourceBytes,
        onLog: (m) => pushLog(clipperStore, m),
        onProgress: (p) => {
          setRenderProgress(p);
          setStage(clipperStore, "render", Math.max(10, p), `Rendering ${p}%`);
        },
      },
    );
    if (!r.ok) {
      pushLog(clipperStore, `ERROR: ${r.message || "render failed"}`);
      setStage(clipperStore, "error", 0, r.message || "render failed");
      toast.error(r.message || "render failed");
      return;
    }
    if (r.url && r.engine === "ffmpeg") setRenderOutUrl(r.url);
    setStage(clipperStore, "export", 100, r.message || "Render selesai");
    pushLog(clipperStore, `Render ${r.engine} → ${r.status} ${r.jobId ? `(${r.jobId})` : ""}`);
    toast.success(r.message || "Render selesai");
    if (project) {
      const updated: ClipperProject = {
        ...project,
        renderResult: { url: r.url, provider: r.provider || r.engine, status: r.status ?? "queued", message: r.message },
      };
      clipperStore.patch({ project: updated });
      saveClipper(updated);
    }
  }


  function download(name: string, content: string, mime = "text/plain") {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportProject() {
    if (!project) return;
    download(
      `${project.name.replace(/\W+/g, "-")}.aatools.mixing.json`,
      JSON.stringify(project, null, 2),
      "application/json",
    );
  }

  function exportSrt() {
    if (!project?.analysis) {
      toast.error("Analyze dulu.");
      return;
    }
    download(`${project.name}.srt`, toSrt(project.analysis.transcript));
  }

  function exportVtt() {
    if (!project?.analysis) {
      toast.error("Analyze dulu.");
      return;
    }
    download(`${project.name}.vtt`, toVtt(project.analysis.transcript), "text/vtt");
  }

  function exportTimeline() {
    if (!project?.timeline) return;
    download(`${project.name}.timeline.json`, JSON.stringify(project.timeline, null, 2), "application/json");
  }

  function newProject() {
    const p: ClipperProject = {
      id: makeId(),
      name: `Clipper ${new Date().toLocaleString()}`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      sources: [],
      analysis: null,
      settings,
      timeline: null,
      clips: [],
    };
    clipperStore.patch({ project: p, progress: { stage: "idle", pct: 0, message: "" }, log: [] });
  }

  function openProject(id: string) {
    const p = loadClipper(id);
    if (!p) return;
    clipperStore.patch({ project: p, progress: { stage: "idle", pct: 0, message: "" }, log: [] });
    setSettings(p.settings);
    toast.success(`Loaded: ${p.name}`);
  }

  function removeProject(id: string) {
    deleteProject("clipper", id);
    setProjects(listProjects("clipper"));
  }

  const stylePrev = stylePreview(settings.subtitleStyle);
  const aspect = settings.aspectRatio;
  const aspectRatioBox: React.CSSProperties = {
    aspectRatio: aspect === "9:16" ? "9/16" : aspect === "1:1" ? "1/1" : aspect === "4:5" ? "4/5" : aspect === "21:9" ? "21/9" : "16/9",
  };

  return (
    <DashboardShell>
    <div className="p-4 md:p-8">

      <header className="mb-6 flex items-center gap-4 flex-wrap">
        <div className="h-11 w-11 grid place-items-center rounded-2xl neumorph">
          <Scissors className="h-5 w-5 text-primary" />
        </div>
        <div>
          <div className="text-[10px] font-mono uppercase tracking-[0.25em] text-muted-foreground">Mixing · AI Post Production</div>
          <h1 className="text-2xl font-display font-bold text-gradient">AI Clipper</h1>
        </div>
        <div className="ml-auto flex gap-2">
          <button onClick={newProject} className="px-3 py-2 rounded-xl text-xs neumorph hover:text-primary">
            + New Project
          </button>
          <button onClick={() => setDrawerOpen((x) => !x)} className="px-3 py-2 rounded-xl text-xs neumorph">
            {drawerOpen ? "Hide" : "Show"} Projects
          </button>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr_320px] gap-4">
        {/* PROJECT DRAWER */}
        {drawerOpen && (
          <aside className="neumorph p-4 space-y-4 h-fit sticky top-4">
            <div>
              <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-2">Providers</div>
              <div className="space-y-1 text-xs">
                <HealthRow label="Brain" status={brainHealth.status} />
                <HealthRow label="Speech-to-Text" status={sttHealth.status} />
                <HealthRow label="Voice (optional)" status={health("voice").status} />
              </div>
            </div>
            <div>
              <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-2">Workspace</div>
              {projects.length === 0 ? (
                <div className="text-xs text-muted-foreground">No saved projects yet.</div>
              ) : (
                <ul className="space-y-1">
                  {projects.map((pr) => (
                    <li key={pr.id} className="flex items-center gap-1">
                      <button
                        onClick={() => openProject(pr.id)}
                        className="flex-1 text-left text-xs truncate px-2 py-1.5 rounded-lg hover:bg-sidebar-accent/60"
                      >
                        {pr.name}
                      </button>
                      <button onClick={() => removeProject(pr.id)} className="p-1 opacity-60 hover:opacity-100 hover:text-red-400">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-2">Signed in</div>
              <div className="text-xs truncate">{user?.email ?? "—"}</div>
            </div>
          </aside>
        )}

        {/* MAIN */}
        <main className="space-y-4">
          {/* UPLOAD */}
          <section className="neumorph p-4">
            <div className="flex items-center gap-2 mb-3">
              <Upload className="h-4 w-4 text-primary" />
              <h2 className="font-semibold">Upload video</h2>
              <span className="text-xs text-muted-foreground">MP4 · MOV · MKV · AVI · WEBM</span>
            </div>
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                handleFiles(e.dataTransfer.files);
              }}
              onClick={() => fileRef.current?.click()}
              className="cursor-pointer rounded-2xl border border-dashed border-border/60 bg-card/40 grid place-items-center py-10 hover:border-primary transition"
            >
              <div className="text-center">
                <FileVideo className="h-8 w-8 mx-auto text-muted-foreground" />
                <div className="mt-2 text-sm">Drag & drop atau klik untuk upload</div>
                <div className="text-xs text-muted-foreground mt-1">Multiple upload didukung</div>
              </div>
              <input
                ref={fileRef}
                type="file"
                accept="video/*,.mkv,.avi"
                multiple
                hidden
                onChange={(e) => handleFiles(e.target.files)}
              />
            </div>
            {project?.sources && project.sources.length > 0 && (
              <div className="mt-3 grid grid-cols-2 md:grid-cols-3 gap-2">
                {project.sources.map((s) => (
                  <div key={s.id} className="rounded-xl bg-card/60 border border-border p-2 flex flex-col gap-1">
                    <video src={s.url} className="rounded-lg w-full h-24 object-cover bg-black" muted />
                    <div className="text-xs truncate">{s.name}</div>
                    <div className="text-[10px] text-muted-foreground">
                      {(s.size / 1024 / 1024).toFixed(1)} MB · {s.durationSec?.toFixed(1)}s
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* ANALYZE / PROGRESS */}
          <section className="neumorph p-4">
            <div className="flex items-center gap-3 mb-3">
              <Sparkles className="h-4 w-4 text-primary" />
              <h2 className="font-semibold">AI Analyse & Build</h2>
              <div className="ml-auto flex gap-2">
                <button
                  disabled={state.busy || !project?.sources?.length}
                  onClick={runAnalyze}
                  className="px-4 py-2 rounded-xl text-sm font-medium text-primary-foreground disabled:opacity-40"
                  style={{ background: "var(--gradient-neon)" }}
                >
                  {state.busy ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" /> Working…
                    </span>
                  ) : (
                    <span className="flex items-center gap-2">
                      <Zap className="h-4 w-4" /> Analyze
                    </span>
                  )}
                </button>
                <button
                  onClick={rebuildClips}
                  disabled={!project?.analysis}
                  className="px-3 py-2 rounded-xl text-xs neumorph disabled:opacity-40"
                >
                  <Wand2 className="h-3.5 w-3.5 inline mr-1" /> Rebuild
                </button>
              </div>
            </div>

            <ProgressStrip stage={state.progress.stage} pct={state.progress.pct} message={state.progress.message} />

            {state.log.length > 0 && (
              <details className="mt-3" open>
                <summary className="cursor-pointer text-xs text-muted-foreground">Log</summary>
                <pre className="mt-2 text-[11px] bg-black/40 rounded-lg p-2 max-h-40 overflow-auto whitespace-pre-wrap">
                  {state.log.join("\n")}
                </pre>
              </details>
            )}

            {project?.analysis && (
              <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-2">
                <Stat label="Scenes" value={project.analysis.scenes.length} />
                <Stat label="Speakers" value={project.analysis.speakers.length} />
                <Stat label="Hooks" value={project.analysis.hooks.length} />
                <Stat label="Dead-air" value={project.analysis.deadAir.length} />
              </div>
            )}
          </section>

          {/* CLIPS */}
          {project?.clips && project.clips.length > 0 && (
            <section className="neumorph p-4">
              <div className="flex items-center gap-2 mb-3">
                <Play className="h-4 w-4 text-primary" />
                <h2 className="font-semibold">Auto-generated clips</h2>
                <span className="text-xs text-muted-foreground">Diurutkan berdasarkan score AI</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {project.clips.map((c) => {
                  const preview = clipPreviewRange(c);
                  return (
                  <div key={c.id} className="rounded-2xl border border-border bg-card/60 p-3 flex flex-col gap-2">
                    <div className="relative rounded-xl overflow-hidden bg-black" style={aspectRatioBox}>
                      <video
                        src={project.sources[0]?.url}
                        className="w-full h-full object-cover"
                        muted
                        controls
                        playsInline
                        preload="metadata"
                        onLoadedMetadata={(e) => {
                          const v = e.currentTarget;
                          try { v.currentTime = preview.start; } catch { /* */ }
                        }}
                        onPlay={(e) => {
                          const v = e.currentTarget;
                          if (v.currentTime < preview.start || v.currentTime >= preview.end) v.currentTime = preview.start;
                        }}
                        onTimeUpdate={(e) => {
                          const v = e.currentTarget;
                          if (v.currentTime >= preview.end) { v.pause(); v.currentTime = preview.start; }
                        }}
                      />
                      {settings.subtitle && (
                        <div className={`pointer-events-none absolute inset-x-0 bottom-10 text-center text-sm ${stylePrev.className}`} style={stylePrev.style}>
                          {c.timeline.tracks.find((t) => t.kind === "subtitle" && (t as { text: string }).text)
                            ? (c.timeline.tracks.find((t) => t.kind === "subtitle") as { text: string }).text
                            : "Preview subtitle"}
                        </div>
                      )}
                    </div>
                    <div>
                      <div className="text-sm font-medium truncate">{c.title}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {preview.start.toFixed(1)}s → {preview.end.toFixed(1)}s · {c.timeline.totalSec.toFixed(1)}s output · {c.timeline.tracks.length} tracks
                      </div>
                    </div>
                    <TimelineMini tracks={c.timeline.tracks} totalSec={c.timeline.totalSec} />
                  </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* EXPORT */}
          <section className="neumorph p-4">
            <div className="flex items-center gap-2 mb-3">
              <Download className="h-4 w-4 text-primary" />
              <h2 className="font-semibold">Render & Export</h2>
            </div>
            <RenderEngineBar
              engine={renderEngine}
              onChange={setRenderEngine}
              sourceBytes={project?.sources.reduce((a, s) => a + (s.size || 0), 0) ?? 0}
            />
            <div className="flex flex-wrap gap-2 mt-3">
              <button onClick={handleRender} disabled={!project?.timeline} className="px-4 py-2 rounded-xl text-sm font-medium text-primary-foreground disabled:opacity-40" style={{ background: "var(--gradient-neon)" }}>
                Render ({renderEngine === "ffmpeg" ? "FFmpeg · Browser" : renderEngine === "shotstack" ? "Shotstack · Cloud" : "Creatomate · Cloud"})
              </button>
              <button onClick={exportSrt} disabled={!project?.analysis} className="px-3 py-2 rounded-xl text-xs neumorph disabled:opacity-40">Export SRT</button>
              <button onClick={exportVtt} disabled={!project?.analysis} className="px-3 py-2 rounded-xl text-xs neumorph disabled:opacity-40">Export VTT</button>
              <button onClick={exportTimeline} disabled={!project?.timeline} className="px-3 py-2 rounded-xl text-xs neumorph disabled:opacity-40">Export Timeline JSON</button>
              <button onClick={exportProject} disabled={!project} className="px-3 py-2 rounded-xl text-xs neumorph disabled:opacity-40">Export Project</button>
              {settings.generateDub && (
                <a href="/mixing/dubbing" className="px-3 py-2 rounded-xl text-xs neumorph inline-flex items-center gap-1">
                  Go to AI Dubbing <ChevronRight className="h-3.5 w-3.5" />
                </a>
              )}
            </div>
            {renderProgress > 0 && renderProgress < 100 && (
              <div className="mt-3">
                <div className="flex justify-between text-[11px] text-muted-foreground mb-1">
                  <span>FFmpeg rendering…</span><span>{renderProgress}%</span>
                </div>
                <div className="h-1.5 rounded-full bg-black/40 overflow-hidden">
                  <div className="h-full" style={{ width: `${renderProgress}%`, background: "var(--gradient-neon)" }} />
                </div>
              </div>
            )}
            {renderOutUrl && (
              <div className="mt-3 flex items-center gap-2 rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-3">
                <video src={renderOutUrl} controls className="w-40 rounded-lg" />
                <div className="flex-1 text-xs">
                  <div className="font-medium text-emerald-300">✅ Render selesai</div>
                  <a href={renderOutUrl} download={`clipper-${Date.now()}.mp4`} className="text-primary underline">Download MP4</a>
                </div>
              </div>
            )}
            {project?.renderResult && !renderOutUrl && (
              <div className="mt-3 text-xs text-muted-foreground">
                Last render: {project.renderResult.provider} · {project.renderResult.status} — {project.renderResult.message}
              </div>
            )}
          </section>

        </main>

        {/* SETTINGS PANEL */}
        <aside className="neumorph p-4 space-y-4 h-fit lg:sticky lg:top-4">
          <div>
            <SectionLabel>Clip length</SectionLabel>
            <div className="flex flex-wrap gap-1.5">
              {[15, 30, 45, 60, 90].map((d) => (
                <button key={d} onClick={() => setSettings((s) => ({ ...s, clipDurationSec: d }))} className={pill(settings.clipDurationSec === d)}>
                  {d}s
                </button>
              ))}
              <input
                type="number"
                min={5}
                max={300}
                value={settings.clipDurationSec}
                onChange={(e) => setSettings((s) => ({ ...s, clipDurationSec: Number(e.target.value) || 30 }))}
                className="w-16 px-2 py-1 text-xs rounded-lg bg-card/60 border border-border"
              />
            </div>
          </div>

          <div>
            <SectionLabel>Aspect ratio · Auto reframe</SectionLabel>
            <div className="flex flex-wrap gap-1.5">
              {(["9:16", "16:9", "1:1", "4:5", "21:9"] as const).map((r) => (
                <button key={r} onClick={() => setSettings((s) => ({ ...s, aspectRatio: r }))} className={pill(settings.aspectRatio === r)}>
                  {r}
                </button>
              ))}
            </div>
            <Toggle label="Auto reframe (face + object tracking)" checked={settings.autoReframe} onChange={(v) => setSettings((s) => ({ ...s, autoReframe: v }))} />
          </div>

          <div>
            <SectionLabel>Auto cutting</SectionLabel>
            <Toggle label="Remove dead-air, hmm, ehh, filler, noise" checked={settings.autoCutting} onChange={(v) => setSettings((s) => ({ ...s, autoCutting: v }))} />
          </div>

          <div>
            <SectionLabel>Auto zoom</SectionLabel>
            <Toggle label="Enable auto zoom" checked={settings.autoZoom} onChange={(v) => setSettings((s) => ({ ...s, autoZoom: v }))} />
            {settings.autoZoom && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {(["punch", "face", "dynamic", "reaction"] as const).map((k) => (
                  <button key={k} onClick={() => setSettings((s) => ({ ...s, zoomKind: k }))} className={pill(settings.zoomKind === k)}>
                    {k}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div>
            <SectionLabel>Subtitle</SectionLabel>
            <Toggle label="Enable subtitle" checked={settings.subtitle} onChange={(v) => setSettings((s) => ({ ...s, subtitle: v }))} />
            {settings.subtitle && (
              <div className="mt-2 space-y-2">
                <div className="flex flex-wrap gap-1.5">
                  {(["Minimal", "Modern", "TikTok", "CapCut", "Cinematic", "Anime"] as const).map((st) => (
                    <button key={st} onClick={() => setSettings((s) => ({ ...s, subtitleStyle: st }))} className={pill(settings.subtitleStyle === st)}>
                      {st}
                    </button>
                  ))}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {(["none", "typewriter", "pop", "bounce", "karaoke"] as const).map((a) => (
                    <button key={a} onClick={() => setSettings((s) => ({ ...s, subtitleAnimation: a }))} className={pill(settings.subtitleAnimation === a)}>
                      {a}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div>
            <SectionLabel>Transition</SectionLabel>
            <div className="flex flex-wrap gap-1.5">
              {(["None", "Fade", "Cross Fade", "Smooth", "Slide", "Zoom", "Flash", "Blur", "Dip To Black", "Random"] as const).map((t) => (
                <button key={t} onClick={() => setSettings((s) => ({ ...s, transition: t }))} className={pill(settings.transition === t)}>
                  {t}
                </button>
              ))}
            </div>
            <div className="mt-2 flex gap-1.5">
              {[0.2, 0.3, 0.5, 1.0].map((d) => (
                <button key={d} onClick={() => setSettings((s) => ({ ...s, transitionDuration: d }))} className={pill(settings.transitionDuration === d)}>
                  {d}s
                </button>
              ))}
            </div>
          </div>

          <div>
            <SectionLabel>Background music</SectionLabel>
            <div className="flex flex-wrap gap-1.5">
              {(["None", "Cinematic", "Vlog", "Epic", "Documentary", "Relax", "Corporate"] as const).map((m) => (
                <button key={m} onClick={() => setSettings((s) => ({ ...s, music: m }))} className={pill(settings.music === m)}>
                  {m}
                </button>
              ))}
            </div>
            <Toggle label="Duck voice under music" checked={settings.musicDuck} onChange={(v) => setSettings((s) => ({ ...s, musicDuck: v }))} />
            <div className="mt-1 flex items-center gap-2 text-xs">
              <span className="w-16 text-muted-foreground">Volume</span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={settings.musicVolume}
                onChange={(e) => setSettings((s) => ({ ...s, musicVolume: Number(e.target.value) }))}
                className="flex-1"
              />
              <span className="w-8 text-right">{Math.round(settings.musicVolume * 100)}%</span>
            </div>
          </div>

          <div>
            <SectionLabel>SFX</SectionLabel>
            <div className="flex flex-wrap gap-1.5">
              {(["Whoosh", "Click", "Pop", "Impact", "Typing", "Notification"] as const).map((s) => {
                const on = settings.sfx.includes(s);
                return (
                  <button
                    key={s}
                    onClick={() =>
                      setSettings((prev) => ({
                        ...prev,
                        sfx: on ? prev.sfx.filter((x) => x !== s) : [...prev.sfx, s],
                      }))
                    }
                    className={pill(on)}
                  >
                    {s}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <SectionLabel>Hand-off to Dubbing</SectionLabel>
            <Toggle
              label="Generate dub after render"
              checked={settings.generateDub}
              onChange={(v) => setSettings((s) => ({ ...s, generateDub: v }))}
            />
          </div>
        </aside>
      </div>
    </div>
    </DashboardShell>
  );
}

// -------- tiny helpers (kept local, workspace-only) --------

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-1.5">{children}</div>;
}

function pill(active: boolean) {
  return [
    "px-2.5 py-1 rounded-lg text-[11px] border transition",
    active
      ? "bg-primary/20 border-primary text-primary-foreground"
      : "border-border bg-card/60 text-foreground/80 hover:text-foreground",
  ].join(" ");
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="mt-1 flex items-center gap-2 text-xs cursor-pointer select-none">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-card/60 border border-border p-3">
      <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold">{value}</div>
    </div>
  );
}

function HealthRow({ label, status }: { label: string; status: "ok" | "no-key" | "unknown" }) {
  const color = status === "ok" ? "bg-green-500" : status === "no-key" ? "bg-red-500" : "bg-yellow-500";
  return (
    <div className="flex items-center gap-2">
      <span className={`h-2 w-2 rounded-full ${color}`} />
      <span className="text-foreground/80">{label}</span>
      <span className="ml-auto text-muted-foreground">{status}</span>
    </div>
  );
}

function ProgressStrip({ stage, pct, message }: { stage: string; pct: number; message: string }) {
  const stages = ["upload", "stt", "brain", "timeline", "render", "export"];
  const idx = stages.indexOf(stage);
  return (
    <div>
      <div className="flex items-center gap-2 mb-1.5">
        {stages.map((s, i) => (
          <div key={s} className="flex items-center gap-1">
            <div
              className={`h-2 w-2 rounded-full ${
                stage === "error"
                  ? "bg-red-500"
                  : i <= idx || stage === "done"
                  ? "bg-primary"
                  : "bg-border"
              }`}
            />
            <span className="text-[10px] uppercase tracking-widest text-muted-foreground">{s}</span>
          </div>
        ))}
      </div>
      <div className="w-full h-1.5 rounded-full bg-card/60 overflow-hidden">
        <div
          className="h-full transition-all"
          style={{
            width: `${Math.max(4, pct)}%`,
            background: stage === "error" ? "#ef4444" : "var(--gradient-neon)",
          }}
        />
      </div>
      <div className="mt-1 text-[11px] text-muted-foreground truncate">{message || "—"}</div>
    </div>
  );
}

function TimelineMini({
  tracks,
  totalSec,
}: {
  tracks: import("@/lib/mixing/types").Timeline["tracks"];
  totalSec: number;
}) {
  const rows: Record<string, string> = {
    clip: "bg-primary/60",
    subtitle: "bg-fuchsia-500/60",
    zoom: "bg-yellow-400/60",
    reframe: "bg-cyan-400/60",
    transition: "bg-white/40",
    music: "bg-green-400/50",
    sfx: "bg-orange-400/80",
  };
  const order: Array<keyof typeof rows> = ["clip", "subtitle", "zoom", "reframe", "transition", "music", "sfx"];
  return (
    <div className="mt-1 space-y-1">
      {order.map((row) => {
        const items = tracks.filter((t) => t.kind === row);
        if (items.length === 0) return null;
        return (
          <div key={row} className="relative h-2.5 rounded bg-black/40">
            {items.map((t, i) => {
              const start = "at" in t ? t.at : (t as { start: number }).start;
              const end = "at" in t ? t.at + 0.3 : (t as { end: number }).end;
              const left = Math.max(0, (start / totalSec) * 100);
              const width = Math.max(1, ((end - start) / totalSec) * 100);
              return (
                <div
                  key={`${row}-${i}`}
                  className={`absolute inset-y-0 rounded ${rows[row]}`}
                  style={{ left: `${left}%`, width: `${width}%` }}
                  title={`${row} ${start.toFixed(1)}-${end.toFixed(1)}s`}
                />
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

function RenderEngineBar({ engine, onChange, sourceBytes }: { engine: RenderEngine; onChange: (e: RenderEngine) => void; sourceBytes: number }) {
  const info = checkSourceSize(sourceBytes);
  const cloud = typeof window !== "undefined" ? cloudRenderStatus() : { shotstack: { available: false, count: 0 }, creatomate: { available: false, count: 0 } };
  const options: { key: RenderEngine; label: string; ok: boolean; hint: string }[] = [
    { key: "ffmpeg", label: "FFmpeg (Browser · gratis)", ok: !info.overLimit, hint: info.overLimit ? `File ${info.humanBytes} > limit ${info.humanLimit}` : "Default · di device kamu" },
    { key: "shotstack", label: "Shotstack (Cloud)", ok: cloud.shotstack.available, hint: cloud.shotstack.available ? `${cloud.shotstack.count} key aktif` : "Belum ada key di Token Manager → Render" },
    { key: "creatomate", label: "Creatomate (Cloud)", ok: cloud.creatomate.available, hint: cloud.creatomate.available ? `${cloud.creatomate.count} key aktif` : "Belum ada key di Token Manager → Render" },
  ];
  return (
    <div className="rounded-xl border border-border bg-card/40 p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground">Render Engine</div>
        <div className="text-[11px] text-muted-foreground">
          Source: <b className="text-foreground">{info.humanBytes}</b> · Limit FFmpeg: {info.humanLimit}
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {options.map((o) => {
          const active = engine === o.key;
          const disabled = !o.ok && o.key !== "ffmpeg"; // ffmpeg selectable always, error surfaces on run
          return (
            <button
              key={o.key}
              onClick={() => !disabled && onChange(o.key)}
              disabled={disabled}
              className={[
                "text-left rounded-xl px-3 py-2 border transition",
                active ? "border-primary bg-primary/10" : "border-border bg-card/60 hover:border-primary/40",
                disabled ? "opacity-50 cursor-not-allowed" : "",
              ].join(" ")}
            >
              <div className="flex items-center gap-2">
                <span className={["h-2 w-2 rounded-full", o.ok ? "bg-emerald-400" : "bg-amber-400"].join(" ")} />
                <div className="text-xs font-medium">{o.label}</div>
              </div>
              <div className="text-[10.5px] text-muted-foreground mt-1 leading-snug">{o.hint}</div>
            </button>
          );
        })}
      </div>
      {info.overLimit && engine === "ffmpeg" && (
        <div className="mt-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-2 text-[11px] text-amber-200 leading-relaxed">
          ⚠️ Video {info.humanBytes} melebihi limit FFmpeg browser ({info.humanLimit}). Ganti ke <b>Shotstack</b> atau <b>Creatomate</b> di atas — kalau belum ada key, tambah dulu di{" "}
          <a href="/manage/tokens" className="underline text-primary">Token Manager → Render</a>.
        </div>
      )}
    </div>
  );
}
