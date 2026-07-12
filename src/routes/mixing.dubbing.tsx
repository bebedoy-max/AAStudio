import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Upload, Languages, Mic, Loader2, Download, Zap, FileVideo, Trash2 } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { DashboardShell } from "@/components/dashboard/shell";
import { dubbingStore, pushLog, setStage } from "@/lib/mixing/run-store";
import type {
  DubbingProject,
  DubbingSettings,
  Transcript,
  VideoSource,
} from "@/lib/mixing/types";
import { LANGUAGES } from "@/lib/mixing/types";
import { toSrt } from "@/lib/mixing/subtitle-engine";
import { headersForBrain, headersForVoice, listProviders, health } from "@/lib/mixing/providers";
import { mixingQueue } from "@/lib/mixing/queue";
import { loadMemory, saveMemory } from "@/lib/mixing/memory";
import { listProjects, saveDubbing, loadDubbing, deleteProject } from "@/lib/mixing/projects";
import { submitRender, buildDubbingPayload, checkSourceSize, type RenderEngine } from "@/lib/mixing/render-engine";
import { cloudRenderStatus } from "@/lib/mixing/providers";
import { NewProjectDialog } from "@/components/mixing/new-project-dialog";

export const Route = createFileRoute("/mixing/dubbing")({
  component: DubbingPage,
});

const DEFAULT_SETTINGS: DubbingSettings = {
  sourceLanguage: "zh",
  targetLanguage: "id",
  translationMode: "Natural",
  voice: "JBFqnCBsd6RMkjVDRZzb", // George (ElevenLabs)
  lipSync: false,
  subtitle: "translated",
  aspectRatio: "9:16",
  preserveOriginalVideo: true,
  reframe: false,
  motionEnhancement: false,
  colorEnhancement: false,
  sharpen: false,
  upscale: false,
  noiseReduction: false,
};

function makeId() {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

const ELEVEN_VOICES: Array<{ id: string; label: string }> = [
  { id: "JBFqnCBsd6RMkjVDRZzb", label: "George (M, warm)" },
  { id: "nPczCjzI2devNBz1zQrb", label: "Brian (M, deep)" },
  { id: "onwK4e9ZLuTAKqWW03F9", label: "Daniel (M, news)" },
  { id: "IKne3meq5aSn9XLyUdCD", label: "Charlie (M, casual)" },
  { id: "TX3LPaxmHKxFdv7VOQHJ", label: "Liam (M, articulate)" },
  { id: "N2lVS1w4EtoT3dr4eOWO", label: "Callum (M, intense)" },
  { id: "bIHbv24MWmeRgasZH58o", label: "Will (M, chill)" },
  { id: "cjVigY5qzO86Huf0OWal", label: "Eric (M, smooth)" },
  { id: "iP95p4xoKVk53GoZ742B", label: "Chris (M, natural)" },
  { id: "pqHfZKP75CvOlQylNhV4", label: "Bill (M, narrator)" },
  { id: "CwhRBWXzGAHq8TQ4Fs17", label: "Roger (M, confident)" },
  { id: "EXAVITQu4vr4xnSDxMaL", label: "Sarah (F, soft)" },
  { id: "FGY2WhTYpPnrIDTdsKH5", label: "Laura (F, upbeat)" },
  { id: "Xb7hH8MSUJpSbSDYk0k2", label: "Alice (F, clear)" },
  { id: "XrExE9yKIg1WjnnlVkGX", label: "Matilda (F, friendly)" },
  { id: "cgSgspJ2msm6clMCkdW9", label: "Jessica (F, expressive)" },
  { id: "pFZP5JQG7iQjIQuC4Bku", label: "Lily (F, warm)" },
  { id: "SAz9YHcvj6GT2YYXdXww", label: "River (N, neutral)" },
];

function DubbingPage() {
  const state = dubbingStore.use();
  const { user } = useAuth();
  const [settings, setSettings] = useState<DubbingSettings>(DEFAULT_SETTINGS);
  const [projects, setProjects] = useState(listProjects("dubbing"));
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(true);
  const [renderEngine, setRenderEngine] = useState<RenderEngine>("ffmpeg");
  const [renderOutUrl, setRenderOutUrl] = useState<string | null>(null);
  const [renderProgress, setRenderProgress] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const brainHealth = useMemo(() => health("brain"), []);
  const sttHealth = useMemo(() => health("stt"), []);
  const voiceHealth = useMemo(() => health("voice"), []);
  const videoProviders = useMemo(() => listProviders("video"), []);
  const lipSyncAvailable = videoProviders.some((p) => p.available && p.capabilities?.lipSync);
  const [testingVoice, setTestingVoice] = useState(false);
  const voiceAudioRef = useRef<HTMLAudioElement | null>(null);

  const testVoice = async () => {
    if (voiceHealth.status !== "ok") { toast.error("Voice key belum ada."); return; }
    setTestingVoice(true);
    try {
      const sampleByLang: Record<string, string> = {
        id: "Halo, ini contoh suara untuk pengujian dubbing.",
        en: "Hello, this is a sample voice for dubbing test.",
        zh: "你好，这是配音测试的示例声音。",
        ja: "こんにちは、これは吹き替えテスト用のサンプル音声です。",
        ko: "안녕하세요, 더빙 테스트용 샘플 음성입니다.",
      };
      const text = sampleByLang[settings.targetLanguage] ?? sampleByLang.en;
      const r = await fetch("/api/router/voice", {
        method: "POST",
        headers: headersForVoice(),
        body: JSON.stringify({ text, voice: settings.voice }),
      });
      const j = await r.json().catch(() => null) as { ok?: boolean; audioBase64?: string; mime?: string; error?: string } | null;
      if (!r.ok || !j?.ok || !j.audioBase64) throw new Error(j?.error || `voice test failed (${r.status})`);
      const url = `data:${j.mime ?? "audio/mpeg"};base64,${j.audioBase64}`;
      if (voiceAudioRef.current) { voiceAudioRef.current.pause(); }
      const audio = new Audio(url);
      voiceAudioRef.current = audio;
      await audio.play();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setTestingVoice(false);
    }
  };

  useEffect(() => {
    const mem = loadMemory().dubbing;
    if (mem) {
      setSettings((s) => ({
        ...s,
        targetLanguage: mem.targetLanguage ?? s.targetLanguage,
        voice: (mem.voice as DubbingSettings["voice"]) ?? s.voice,
        translationMode: (mem.translationMode as DubbingSettings["translationMode"]) ?? s.translationMode,
        aspectRatio: (mem.aspectRatio as DubbingSettings["aspectRatio"]) ?? s.aspectRatio,
      }));
    }
  }, []);

  useEffect(() => {
    saveMemory({
      dubbing: {
        targetLanguage: settings.targetLanguage,
        voice: settings.voice,
        translationMode: settings.translationMode,
        aspectRatio: settings.aspectRatio,
      },
    });
  }, [settings.targetLanguage, settings.voice, settings.translationMode, settings.aspectRatio]);

  const project = state.project;

  useEffect(() => {
    if (!project) return;
    saveDubbing({ ...project, lastProgress: state.progress, log: state.log });
    setProjects(listProjects("dubbing"));
  }, [project?.id, state.progress.stage, state.progress.pct, state.progress.message, state.log]);

  const ensureProject = (): DubbingProject => {
    if (project) return project;
    const p: DubbingProject = {
      id: makeId(),
      name: "Untitled Dubbing",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      sources: [],
      transcript: null,
      translated: null,
      settings,
      timeline: null,
    };
    dubbingStore.patch({ project: p });
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
      additions.push({ id: makeId(), name: f.name, size: f.size, type: f.type, url, durationSec });
    }
    if (additions.length === 0) {
      toast.error("File tidak didukung.");
      return;
    }
    dubbingStore.patch({
      project: { ...p, sources: [...p.sources, ...additions], updatedAt: Date.now() },
    });
    setStage(dubbingStore, "upload", 100, `Loaded ${additions.length} video`);
    pushLog(dubbingStore, `Upload: ${additions.map((a) => a.name).join(", ")}`);
  }

  function removeSource(id: string) {
    if (!project) return;
    const src = project.sources.find((s) => s.id === id);
    if (src?.url?.startsWith("blob:")) try { URL.revokeObjectURL(src.url); } catch { /* */ }
    const updated: DubbingProject = {
      ...project,
      sources: project.sources.filter((s) => s.id !== id),
      updatedAt: Date.now(),
    };
    dubbingStore.patch({ project: updated });
    pushLog(dubbingStore, `Removed video: ${src?.name ?? id}`);
  }

  async function extractAudioBlob(source: VideoSource): Promise<Blob> {
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
    const buffer = new ArrayBuffer(44 + out.length * 2);
    const view = new DataView(buffer);
    const writeStr = (o: number, s: string) => {
      for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i));
    };
    writeStr(0, "RIFF");
    view.setUint32(4, 36 + out.length * 2, true);
    writeStr(8, "WAVE");
    writeStr(12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, targetRate, true);
    view.setUint32(28, targetRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeStr(36, "data");
    view.setUint32(40, out.length * 2, true);
    let offset = 44;
    for (let i = 0; i < out.length; i++, offset += 2) {
      const s = Math.max(-1, Math.min(1, out[i]));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    }
    return new Blob([buffer], { type: "audio/wav" });
  }

  async function runDubbing() {
    if (state.busy) return;
    const p = project;
    if (!p || p.sources.length === 0) return toast.error("Upload video dulu.");
    if (brainHealth.status !== "ok") return toast.error("Brain key belum ada.");
    if (sttHealth.status !== "ok") return toast.error("STT key belum ada.");
    if (voiceHealth.status !== "ok") return toast.error("Voice key belum ada.");
    dubbingStore.patch({ busy: true, log: [] });
    try {
      const primary = p.sources[0];
      setStage(dubbingStore, "stt", 10, "Extracting audio…");
      pushLog(dubbingStore, `Source: ${primary.name} (${(primary.size / 1024 / 1024).toFixed(1)} MB · ${primary.durationSec?.toFixed(1)}s)`);
      const wav = await extractAudioBlob(primary);
      pushLog(dubbingStore, `Audio ready (${(wav.size / 1024).toFixed(0)} KB, 16k mono WAV)`);
      setStage(dubbingStore, "stt", 30, "Transcribing…");
      const fd = new FormData();
      fd.append("file", wav, "audio.wav");
      fd.append("filename", "audio.wav");
      if (settings.sourceLanguage && settings.sourceLanguage !== "auto") fd.append("language", settings.sourceLanguage);
      const elevenKeys = listProviders("stt").find((x) => x.id === "eleven")?.keys ?? [];
      const sttHeaders: Record<string, string> = {};
      if (elevenKeys.length) sttHeaders["x-user-elevenlabs-keys"] = elevenKeys.join(",");
      pushLog(dubbingStore, `STT → /api/router/stt (${elevenKeys.length} ElevenLabs key, source=${settings.sourceLanguage})`);

      const sttRes = await mixingQueue.submit({
        id: "stt",
        label: "stt",
        retries: 1,
        run: async () => {
          const r = await fetch("/api/router/stt", { method: "POST", headers: sttHeaders, body: fd });
          const text = await r.text();
          let j: { ok?: boolean; error?: string; transcript?: Transcript } | null = null;
          try { j = JSON.parse(text); } catch { /* non-json */ }
          if (!r.ok || !j?.ok) {
            const snippet = text.replace(/<[^>]+>/g, " ").trim().slice(0, 200);
            const reason =
              r.status === 401 ? "invalid/expired key"
              : r.status === 402 ? "quota habis / limit"
              : r.status === 413 ? "file terlalu besar"
              : r.status === 415 ? "format audio tidak didukung"
              : r.status === 429 ? "rate-limited"
              : r.status >= 500 ? "server error" : "gagal";
            throw new Error(j?.error || `stt ${r.status} (${reason}): ${snippet || "no body"}`);
          }
          return j.transcript!;
        },
      });
      if (!sttRes.ok) throw new Error(sttRes.error);
      const transcript = sttRes.value;
      pushLog(dubbingStore, `Transcript OK — ${transcript.segments.length} segments · lang=${transcript.language}`);

      setStage(dubbingStore, "translate", 55, `Translating → ${settings.targetLanguage}`);
      pushLog(dubbingStore, `Brain translate — mode=${settings.translationMode} · ${settings.sourceLanguage} → ${settings.targetLanguage}`);
      const CHUNK = 8;
      const chunks: Array<typeof transcript.segments> = [];
      for (let i = 0; i < transcript.segments.length; i += CHUNK) {
        chunks.push(transcript.segments.slice(i, i + CHUNK));
      }
      pushLog(dubbingStore, `Translate dibagi ${chunks.length} batch (chunk=${CHUNK}) agar tidak time-out gateway`);
      const translatedSegments: typeof transcript.segments = [];
      for (let ci = 0; ci < chunks.length; ci++) {
        const batch = chunks[ci];
        const label = `translate-${ci + 1}/${chunks.length}`;
        setStage(
          dubbingStore,
          "translate",
          55 + Math.round((ci / chunks.length) * 20),
          `Translating batch ${ci + 1}/${chunks.length}`,
        );
        const res = await mixingQueue.submit({
          id: label,
          label,
          retries: 2,
          run: async () => {
            const r = await fetch("/api/public/dubbing-brain", {
              method: "POST",
              headers: headersForBrain(),
              body: JSON.stringify({
                segments: batch,
                sourceLanguage: settings.sourceLanguage,
                targetLanguage: settings.targetLanguage,
                mode: settings.translationMode,
              }),
            });
            const text = await r.text();
            let j: { ok?: boolean; error?: string; translated?: Transcript } | null = null;
            try { j = JSON.parse(text); } catch { /* */ }
            if (!r.ok || !j?.ok) {
              const snippet = text.replace(/<[^>]+>/g, " ").trim().slice(0, 200);
              const reason =
                r.status === 502 || r.status === 504
                  ? "gateway timeout — coba ulang batch"
                  : r.status === 401
                  ? "invalid AI key"
                  : r.status === 402
                  ? "AI credits habis"
                  : r.status === 429
                  ? "AI rate-limit"
                  : "gagal";
              throw new Error(j?.error || `translate ${r.status} (${reason}): ${snippet || "no body"}`);
            }
            return j.translated!;
          },
        });
        if (!res.ok) throw new Error(res.error);
        translatedSegments.push(...(res.value.segments || []));
        pushLog(dubbingStore, `Batch ${ci + 1}/${chunks.length} OK — ${res.value.segments?.length ?? 0} segments`);
      }
      const translated: Transcript = {
        language: settings.targetLanguage,
        fullText: translatedSegments.map((s) => s.text).join(" "),
        segments: translatedSegments,
      };
      pushLog(dubbingStore, `Translated OK — ${translated.segments.length} segments`);

      setStage(dubbingStore, "voice", 80, "Generating dubbed voice…");
      pushLog(dubbingStore, `Voice → /api/router/voice preset=${settings.voice} (${translated.fullText.length} chars)`);
      const voiceRes = await mixingQueue.submit({
        id: "voice",
        label: "voice",
        retries: 1,
        run: async () => {
          const r = await fetch("/api/router/voice", {
            method: "POST",
            headers: headersForVoice(),
            body: JSON.stringify({ text: translated.fullText.slice(0, 4500), voice: settings.voice }),
          });
          const text = await r.text();
          let j: { ok?: boolean; error?: string; audioBase64?: string; mime?: string } | null = null;
          try { j = JSON.parse(text); } catch { /* */ }
          if (!r.ok || !j?.ok) {
            const snippet = text.replace(/<[^>]+>/g, " ").trim().slice(0, 200);
            const reason =
              r.status === 401 ? "invalid/expired voice key"
              : r.status === 402 ? "voice quota habis"
              : r.status === 429 ? "rate-limited"
              : r.status >= 500 ? "server error" : "gagal";
            throw new Error(j?.error || `voice ${r.status} (${reason}): ${snippet || "no body"}`);
          }
          return `data:${j.mime ?? "audio/mpeg"};base64,${j.audioBase64}`;
        },
      });
      if (!voiceRes.ok) throw new Error(voiceRes.error);
      pushLog(dubbingStore, `Voice OK — audio generated`);

      const srt = toSrt(translated);
      const updated: DubbingProject = {
        ...p,
        transcript,
        translated,
        subtitleSrt: srt,
        voiceUrl: voiceRes.value,
        timeline: {
          totalSec: primary.durationSec ?? translated.segments.at(-1)?.end ?? 0,
          aspectRatio: settings.aspectRatio,
          tracks: [
            {
              kind: "clip",
              start: 0,
              end: primary.durationSec ?? 0,
              sourceIn: 0,
              sourceOut: primary.durationSec ?? 0,
              sourceId: primary.id,
            },
            ...translated.segments.map(
              (s) =>
                ({
                  kind: "subtitle",
                  start: s.start,
                  end: s.end,
                  text: s.text,
                  style: "Modern",
                }) as const,
            ),
          ],
        },
        settings,
        updatedAt: Date.now(),
      };
      dubbingStore.patch({ project: updated });
      saveDubbing(updated);
      setProjects(listProjects("dubbing"));
      setStage(dubbingStore, "done", 100, "Dubbing ready — preview & export");
      toast.success("Dubbing selesai.");
    } catch (e) {
      const msg = (e as Error).message || "unknown";
      setStage(dubbingStore, "error", 0, msg);
      pushLog(dubbingStore, `ERROR: ${msg}`);
      toast.error(msg);
    } finally {
      dubbingStore.patch({ busy: false });
    }
  }

  async function handleRender() {
    if (!project) return;
    const sourceBytes = project.sources.reduce((a, s) => a + (s.size || 0), 0);
    const sizeInfo = checkSourceSize(sourceBytes);
    if (renderEngine === "ffmpeg" && sizeInfo.overLimit) {
      const cloud = cloudRenderStatus();
      const avail = cloud.shotstack.available ? "Shotstack tersedia" : cloud.creatomate.available ? "Creatomate tersedia" : "belum ada key cloud";
      toast.error(`Video ${sizeInfo.humanBytes} > limit FFmpeg (${sizeInfo.humanLimit}). Ganti engine — ${avail}.`);
      return;
    }
    setRenderOutUrl(null);
    setRenderProgress(0);
    setStage(dubbingStore, "render", 10, `Rendering via ${renderEngine}…`);
    const r = await submitRender(buildDubbingPayload(project), {
      engine: renderEngine,
      sourceBytes,
      onLog: (m) => pushLog(dubbingStore, m),
      onProgress: (p) => { setRenderProgress(p); setStage(dubbingStore, "render", Math.max(10, p), `Rendering ${p}%`); },
    });
    if (!r.ok) {
      toast.error(r.message || "render failed");
      return;
    }
    if (r.url && r.engine === "ffmpeg") setRenderOutUrl(r.url);
    setStage(dubbingStore, "export", 100, r.message || "queued");
    pushLog(dubbingStore, `Render ${r.engine} → ${r.status} ${r.jobId ? `(${r.jobId})` : ""}`);
    toast.success(r.message || "Render selesai");
    const entry = {
      url: r.url,
      provider: r.provider || r.engine || "ffmpeg",
      status: r.status ?? "queued",
      message: r.message,
      ts: Date.now(),
    };
    const updated: DubbingProject = {
      ...project,
      renderResult: entry,
      renderHistory: [...(project.renderHistory ?? []), entry],
    };
    dubbingStore.patch({ project: updated });
    saveDubbing(updated);
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

  function exportSrt() {
    if (!project?.subtitleSrt) return;
    download(`${project.name}.srt`, project.subtitleSrt);
  }
  function exportTranscript() {
    if (!project?.translated) return;
    download(`${project.name}.transcript.txt`, project.translated.fullText);
  }
  function exportProject() {
    if (!project) return;
    download(`${project.name}.aatools.dubbing.json`, JSON.stringify(project, null, 2), "application/json");
  }
  function newProject() {
    setNewProjectOpen(true);
  }

  function createProjectWithName(rawName: string) {
    const name = rawName.trim();
    if (!name) return;
    if (project) saveDubbing({ ...project, lastProgress: state.progress, log: state.log });
    const p: DubbingProject = {
      id: makeId(),
      name,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      sources: [],
      transcript: null,
      translated: null,
      settings,
      timeline: null,
    };
    dubbingStore.patch({ project: p, progress: { stage: "idle", pct: 0, message: "" }, log: [] });
    setProjects(listProjects("dubbing"));
    setNewProjectOpen(false);
  }
  function openProject(id: string) {
    const p = loadDubbing(id);
    if (!p) return;
    dubbingStore.patch({
      project: p,
      progress: p.lastProgress ?? { stage: "idle", pct: 0, message: "" },
      log: p.log ?? [],
    });
    setSettings(p.settings);
    toast.success(`Loaded: ${p.name}`);
  }
  function removeProject(id: string) {
    deleteProject("dubbing", id);
    setProjects(listProjects("dubbing"));
  }

  return (
    <DashboardShell>
    <div className="p-4 md:p-8">
      <header className="mb-6 flex items-center gap-4 flex-wrap">
        <div className="h-11 w-11 grid place-items-center rounded-2xl neumorph">
          <Languages className="h-5 w-5 text-primary" />
        </div>
        <div>
          <div className="text-[10px] font-mono uppercase tracking-[0.25em] text-muted-foreground">Mixing · AI Post Production</div>
          <h1 className="text-2xl font-display font-bold text-gradient">AI Dubber</h1>
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
        {drawerOpen && (
          <aside className="neumorph p-4 space-y-4 h-fit sticky top-4">
            <div>
              <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-2">Providers</div>
              <div className="space-y-1 text-xs">
                <HealthRow label="Brain" status={brainHealth.status} />
                <HealthRow label="Speech-to-Text" status={sttHealth.status} />
                <HealthRow label="Voice" status={voiceHealth.status} />
                <HealthRow label="Lip-Sync" status={lipSyncAvailable ? "ok" : "no-key"} />
              </div>
            </div>
            <div>
              <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-2">Workspace</div>
              {projects.length === 0 ? (
                <div className="text-xs text-muted-foreground">No saved projects yet.</div>
              ) : (
                <ul className="space-y-1.5">
                  {projects.map((pr) => (
                    <QueueRow
                      key={pr.id}
                      summary={pr}
                      active={project?.id === pr.id}
                      live={project?.id === pr.id ? state.progress : undefined}
                      onOpen={() => openProject(pr.id)}
                      onDelete={() => removeProject(pr.id)}
                    />
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

        <main className="space-y-4">
          {!project ? (
            <section className="neumorph p-10 text-center">
              <div className="mx-auto h-14 w-14 grid place-items-center rounded-2xl neumorph mb-4">
                <Languages className="h-6 w-6 text-primary" />
              </div>
              <h2 className="font-display text-xl font-bold text-gradient mb-1">Belum ada project aktif</h2>
              <p className="text-sm text-muted-foreground mb-5">
                Klik <b>+ New Project</b> untuk membuat project baru. Project yang sedang berjalan tetap berjalan di background dan muncul di list Workspace.
              </p>
              <button
                onClick={newProject}
                className="px-4 py-2 rounded-xl text-sm font-medium text-primary-foreground"
                style={{ background: "var(--gradient-neon)" }}
              >
                + New Project
              </button>
            </section>
          ) : (
          <>
          <section className="neumorph p-4">
            <div className="flex items-center gap-2 mb-3">
              <Upload className="h-4 w-4 text-primary" />
              <h2 className="font-semibold truncate">{project.name}</h2>
              <span className="text-[10px] uppercase tracking-widest text-muted-foreground ml-1">· Sources</span>
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
                    <div className="relative">
                      <video src={s.url} className="rounded-lg w-full h-24 object-cover bg-black" muted />
                      <button
                        onClick={(e) => { e.stopPropagation(); removeSource(s.id); }}
                        className="absolute top-1 right-1 p-1 rounded-md bg-black/60 hover:bg-red-500/80 text-white"
                        title="Hapus video"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                    <div className="text-xs truncate">{s.name}</div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="neumorph p-4">
            <div className="flex items-center gap-2 mb-3">
              <Mic className="h-4 w-4 text-primary" />
              <h2 className="font-semibold">AI Dubber Pipeline</h2>
              <div className="ml-auto flex gap-2">
                <button
                  disabled={state.busy || !project?.sources?.length}
                  onClick={runDubbing}
                  className="px-4 py-2 rounded-xl text-sm font-medium text-primary-foreground disabled:opacity-40"
                  style={{ background: "var(--gradient-neon)" }}
                >
                  {state.busy ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" /> Working…
                    </span>
                  ) : (
                    <span className="flex items-center gap-2">
                      <Zap className="h-4 w-4" /> Start Dubbing
                    </span>
                  )}
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

            {project?.voiceUrl && (
              <div className="mt-4 space-y-2">
                <div className="text-xs text-muted-foreground">Dubbed voice preview:</div>
                <audio src={project.voiceUrl} controls className="w-full" />
              </div>
            )}

            {project?.translated && (
              <div className="mt-4 max-h-52 overflow-auto rounded-lg bg-black/40 p-3 text-xs">
                {project.translated.segments.map((s, i) => (
                  <div key={i} className="mb-1">
                    <span className="text-muted-foreground">
                      {s.start.toFixed(1)}s → {s.end.toFixed(1)}s
                    </span>{" "}
                    {s.text}
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="neumorph p-4">
            <div className="flex items-center gap-2 mb-3">
              <Download className="h-4 w-4 text-primary" />
              <h2 className="font-semibold">Render & Export</h2>
            </div>
            <DubbingRenderEngineBar
              engine={renderEngine}
              onChange={setRenderEngine}
              sourceBytes={project?.sources.reduce((a, s) => a + (s.size || 0), 0) ?? 0}
            />
            <div className="flex flex-wrap gap-2 mt-3">
              <button
                onClick={handleRender}
                disabled={!project?.timeline}
                className="px-4 py-2 rounded-xl text-sm font-medium text-primary-foreground disabled:opacity-40"
                style={{ background: "var(--gradient-neon)" }}
              >
                Render ({renderEngine === "ffmpeg" ? "FFmpeg · Browser" : renderEngine === "shotstack" ? "Shotstack · Cloud" : "Creatomate · Cloud"})
              </button>
              <button onClick={exportSrt} disabled={!project?.subtitleSrt} className="px-3 py-2 rounded-xl text-xs neumorph disabled:opacity-40">
                Export SRT
              </button>
              <button onClick={exportTranscript} disabled={!project?.translated} className="px-3 py-2 rounded-xl text-xs neumorph disabled:opacity-40">
                Export Transcript
              </button>
              <button onClick={exportProject} disabled={!project} className="px-3 py-2 rounded-xl text-xs neumorph disabled:opacity-40">
                Export Project
              </button>
            </div>
            {renderProgress > 0 && renderProgress < 100 && (
              <div className="mt-3">
                <div className="flex justify-between text-[11px] text-muted-foreground mb-1"><span>FFmpeg rendering…</span><span>{renderProgress}%</span></div>
                <div className="h-1.5 rounded-full bg-black/40 overflow-hidden"><div className="h-full" style={{ width: `${renderProgress}%`, background: "var(--gradient-neon)" }} /></div>
              </div>
            )}
            {renderOutUrl && (
              <div className="mt-3 flex items-center gap-2 rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-3">
                <video src={renderOutUrl} controls className="w-40 rounded-lg" />
                <div className="flex-1 text-xs">
                  <div className="font-medium text-emerald-300">✅ Render selesai</div>
                  <a href={renderOutUrl} download={`dubbing-${Date.now()}.mp4`} className="text-primary underline">Download MP4</a>
                </div>
              </div>
            )}
            {project?.renderHistory && project.renderHistory.length > 0 && (
              <div className="mt-4">
                <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-2">
                  Render Gallery ({project.renderHistory.length})
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {[...project.renderHistory].reverse().map((h, i) => (
                    <div key={`${h.ts}-${i}`} className="rounded-xl bg-card/60 border border-border p-2 flex flex-col gap-1">
                      {h.url ? (
                        <video src={h.url} controls className="rounded-lg w-full h-28 object-cover bg-black" />
                      ) : (
                        <div className="rounded-lg w-full h-28 grid place-items-center bg-black/50 text-[10px] text-muted-foreground">no preview</div>
                      )}
                      <div className="text-[10px] text-muted-foreground truncate">
                        {new Date(h.ts).toLocaleString()} · {h.provider}
                      </div>
                      {h.url && (
                        <a href={h.url} download={`dubbing-${h.ts}.mp4`} className="text-[11px] text-primary underline truncate">
                          Download
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
          </>
          )}
        </main>

        <aside className="neumorph p-4 space-y-4 h-fit lg:sticky lg:top-4">
          <div>
            <SectionLabel>Source language</SectionLabel>
            <LangPicker value={settings.sourceLanguage} onChange={(v) => setSettings((s) => ({ ...s, sourceLanguage: v }))} allowAuto />
          </div>
          <div>
            <SectionLabel>Target language</SectionLabel>
            <LangPicker value={settings.targetLanguage} onChange={(v) => setSettings((s) => ({ ...s, targetLanguage: v }))} />
          </div>
          <div>
            <SectionLabel>Translation mode</SectionLabel>
            <div className="flex flex-wrap gap-1.5">
              {(["Literal", "Natural", "Localization", "Affiliate Style", "Formal", "Casual"] as const).map((m) => (
                <button key={m} onClick={() => setSettings((s) => ({ ...s, translationMode: m }))} className={pill(settings.translationMode === m)}>
                  {m}
                </button>
              ))}
            </div>
          </div>
          <div>
            <SectionLabel>Voice</SectionLabel>
            <div className="flex items-center gap-2">
              <select
                value={settings.voice}
                onChange={(e) => setSettings((s) => ({ ...s, voice: e.target.value }))}
                className="flex-1 rounded-md border border-border bg-background px-2 py-1.5 text-xs"
              >
                {ELEVEN_VOICES.map((v) => (
                  <option key={v.id} value={v.id}>{v.label}</option>
                ))}
              </select>
              <button
                onClick={testVoice}
                disabled={testingVoice || voiceHealth.status !== "ok"}
                className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1.5 text-xs hover:bg-accent disabled:opacity-50"
                title="Test suara"
              >
                {testingVoice ? <Loader2 className="h-3 w-3 animate-spin" /> : <Mic className="h-3 w-3" />}
                Tes
              </button>
            </div>
            <div className="mt-1 text-[10px] text-muted-foreground">Powered by ElevenLabs Multilingual v2</div>
          </div>
          <div>
            <SectionLabel>Lip Sync</SectionLabel>
            <Toggle
              label={lipSyncAvailable ? "Enable lip sync (provider capable)" : "Not available — no lip-sync-capable provider key"}
              checked={settings.lipSync && lipSyncAvailable}
              onChange={(v) => setSettings((s) => ({ ...s, lipSync: v && lipSyncAvailable }))}
            />
          </div>
          <div>
            <SectionLabel>Subtitle</SectionLabel>
            <div className="flex flex-wrap gap-1.5">
              {(["off", "original", "translated", "dual"] as const).map((s) => (
                <button key={s} onClick={() => setSettings((prev) => ({ ...prev, subtitle: s }))} className={pill(settings.subtitle === s)}>
                  {s}
                </button>
              ))}
            </div>
          </div>
          <div>
            <SectionLabel>Aspect ratio · Auto crop</SectionLabel>
            <div className="flex flex-wrap gap-1.5">
              {(["9:16", "16:9", "1:1", "4:5"] as const).map((r) => (
                <button key={r} onClick={() => setSettings((s) => ({ ...s, aspectRatio: r }))} className={pill(settings.aspectRatio === r)}>
                  {r}
                </button>
              ))}
            </div>
          </div>
          <div>
            <SectionLabel>Video enhancement</SectionLabel>
            <Toggle label="Preserve original video" checked={settings.preserveOriginalVideo} onChange={(v) => setSettings((s) => ({ ...s, preserveOriginalVideo: v }))} />
            <Toggle label="Reframe" checked={settings.reframe} onChange={(v) => setSettings((s) => ({ ...s, reframe: v }))} />
            <Toggle label="Motion enhancement" checked={settings.motionEnhancement} onChange={(v) => setSettings((s) => ({ ...s, motionEnhancement: v }))} />
            <Toggle label="Color enhancement" checked={settings.colorEnhancement} onChange={(v) => setSettings((s) => ({ ...s, colorEnhancement: v }))} />
            <Toggle label="Sharpen" checked={settings.sharpen} onChange={(v) => setSettings((s) => ({ ...s, sharpen: v }))} />
            <Toggle label="Upscale" checked={settings.upscale} onChange={(v) => setSettings((s) => ({ ...s, upscale: v }))} />
            <Toggle label="Noise reduction" checked={settings.noiseReduction} onChange={(v) => setSettings((s) => ({ ...s, noiseReduction: v }))} />
          </div>
        </aside>
      </div>
    </div>
    <NewProjectDialog
      open={newProjectOpen}
      title="Project Dubber Baru"
      subtitle="Beri nama project agar mudah dikenali di Workspace queue."
      defaultValue={`Dubbing ${new Date().toLocaleString()}`}
      onConfirm={createProjectWithName}
      onClose={() => setNewProjectOpen(false)}
    />
    </DashboardShell>
  );
}

function LangPicker({
  value,
  onChange,
  allowAuto = false,
}: {
  value: string;
  onChange: (v: string) => void;
  allowAuto?: boolean;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full px-2 py-2 text-xs rounded-lg bg-card/60 border border-border"
    >
      {allowAuto && <option value="auto">Auto-detect</option>}
      {LANGUAGES.map((l) => (
        <option key={l.code} value={l.code}>
          {l.label}
        </option>
      ))}
    </select>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-1.5">{children}</div>;
}
function pill(active: boolean) {
  return [
    "px-2.5 py-1 rounded-lg text-[11px] border transition",
    active ? "bg-primary/20 border-primary text-primary-foreground" : "border-border bg-card/60 text-foreground/80 hover:text-foreground",
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
  const stages = ["upload", "stt", "translate", "voice", "render", "export"];
  const idx = stages.indexOf(stage);
  return (
    <div>
      <div className="flex items-center gap-2 mb-1.5">
        {stages.map((s, i) => (
          <div key={s} className="flex items-center gap-1">
            <div
              className={`h-2 w-2 rounded-full ${
                stage === "error" ? "bg-red-500" : i <= idx || stage === "done" ? "bg-primary" : "bg-border"
              }`}
            />
            <span className="text-[10px] uppercase tracking-widest text-muted-foreground">{s}</span>
          </div>
        ))}
      </div>
      <div className="w-full h-1.5 rounded-full bg-card/60 overflow-hidden">
        <div
          className="h-full transition-all"
          style={{ width: `${Math.max(4, pct)}%`, background: stage === "error" ? "#ef4444" : "var(--gradient-neon)" }}
        />
      </div>
      <div className="mt-1 text-[11px] text-muted-foreground truncate">{message || "—"}</div>
    </div>
  );
}

function DubbingRenderEngineBar({ engine, onChange, sourceBytes }: { engine: RenderEngine; onChange: (e: RenderEngine) => void; sourceBytes: number }) {
  const info = checkSourceSize(sourceBytes);
  const cloud = typeof window !== "undefined" ? cloudRenderStatus() : { shotstack: { available: false, count: 0 }, creatomate: { available: false, count: 0 } };
  const opts: { key: RenderEngine; label: string; ok: boolean; hint: string }[] = [
    { key: "ffmpeg", label: "FFmpeg (Browser · gratis)", ok: !info.overLimit, hint: info.overLimit ? `File ${info.humanBytes} > limit ${info.humanLimit}` : "Default · di device kamu" },
    { key: "shotstack", label: "Shotstack (Cloud)", ok: cloud.shotstack.available, hint: cloud.shotstack.available ? `${cloud.shotstack.count} key aktif` : "Belum ada key di Token Manager → Render" },
    { key: "creatomate", label: "Creatomate (Cloud)", ok: cloud.creatomate.available, hint: cloud.creatomate.available ? `${cloud.creatomate.count} key aktif` : "Belum ada key di Token Manager → Render" },
  ];
  return (
    <div className="rounded-xl border border-border bg-card/40 p-3 mb-1">
      <div className="flex items-center justify-between mb-2">
        <div className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground">Render Engine</div>
        <div className="text-[11px] text-muted-foreground">Source: <b className="text-foreground">{info.humanBytes}</b> · Limit FFmpeg: {info.humanLimit}</div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {opts.map((o) => {
          const active = engine === o.key;
          const disabled = !o.ok && o.key !== "ffmpeg";
          return (
            <button
              key={o.key}
              onClick={() => !disabled && onChange(o.key)}
              disabled={disabled}
              className={["text-left rounded-xl px-3 py-2 border transition", active ? "border-primary bg-primary/10" : "border-border bg-card/60 hover:border-primary/40", disabled ? "opacity-50 cursor-not-allowed" : ""].join(" ")}
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
          ⚠️ Video {info.humanBytes} melebihi limit FFmpeg ({info.humanLimit}). Pilih Shotstack/Creatomate — kalau belum ada key, tambah di{" "}
          <a href="/manage/tokens" className="underline text-primary">Token Manager → Render</a>.
        </div>
      )}
    </div>
  );
}

function QueueRow({
  summary,
  active,
  live,
  onOpen,
  onDelete,
}: {
  summary: import("@/lib/mixing/projects").ProjectSummary;
  active: boolean;
  live?: import("@/lib/mixing/types").MixingProgress;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const prog = live ?? summary.lastProgress;
  const stage = prog?.stage ?? "idle";
  const pct = prog?.pct ?? 0;
  const running = stage !== "idle" && stage !== "done" && stage !== "error";
  const tone =
    stage === "error" ? "bg-red-500"
    : stage === "done" ? "bg-emerald-500"
    : running ? "bg-primary animate-pulse"
    : "bg-border";
  return (
    <li className={`rounded-lg border px-2 py-1.5 ${active ? "border-primary/60 bg-primary/5" : "border-border/60 bg-card/30"}`}>
      <div className="flex items-center gap-1.5">
        <span className={`h-2 w-2 rounded-full ${tone}`} />
        <button onClick={onOpen} className="flex-1 text-left text-xs truncate hover:text-primary">
          {summary.name}
        </button>
        <button onClick={onDelete} className="p-1 opacity-60 hover:opacity-100 hover:text-red-400" title="Hapus project">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
      {prog && stage !== "idle" && (
        <>
          <div className="mt-1 h-1 rounded-full bg-black/40 overflow-hidden">
            <div
              className="h-full transition-all"
              style={{ width: `${Math.max(4, pct)}%`, background: stage === "error" ? "#ef4444" : "var(--gradient-neon)" }}
            />
          </div>
          <div className="mt-0.5 flex items-center justify-between text-[10px] text-muted-foreground">
            <span className="uppercase tracking-widest">{stage}</span>
            <span>{pct}%</span>
          </div>
          {prog.message && <div className="text-[10px] text-muted-foreground truncate">{prog.message}</div>}
        </>
      )}
    </li>
  );
}
