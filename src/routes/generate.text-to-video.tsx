import { GenMetaBar } from "@/components/generate/gen-meta-bar";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Download, ExternalLink } from "lucide-react";
import { useSticky } from "@/lib/stores/use-sticky";
import { DashboardShell, PageHero } from "@/components/dashboard/shell";
import { Field, Textarea, Select, PrimaryButton, GhostButton } from "@/components/dashboard/ui";
import { ProviderActivePill } from "@/components/routing/quick-routing-dialog";
import { useProviderCredit } from "@/lib/providers/credit-summary";
import {
  I2V_CATALOG,
  RATIOS,
  qualityOptsFor,
  readRoutedVideoProvider,
} from "@/lib/providers/video-catalog";
import { runLeonardoVideo, type LeonardoVideoAspect, type LeonardoVideoSizeTier } from "@/lib/providers/leonardo-video";
import { FIREFLY_VIDEO_MODELS, generateFireflyVideo, runFireflyWithRotation } from "@/lib/providers/firefly";
import { useCloudGallery } from "@/lib/cloud/gallery";

// Provider yang punya jalur text-to-video (tanpa gambar input).
const T2V_SUPPORTED = ["leonardo", "firefly", "roboneo", "dola"];
const FIREFLY_RATIOS = ["16:9", "9:16", "1:1"];
const ROBONEO_RATIOS = ["9:16", "16:9", "1:1", "4:3", "3:4"];
const DOLA_RATIOS = ["9:16", "16:9", "1:1", "4:3", "3:4"];

export const Route = createFileRoute("/generate/text-to-video")({
  head: () => ({
    meta: [
      { title: "Text to Video — Creative Studio" },
      {
        name: "description",
        content: "Generate video dari teks memakai model & parameter provider video yang sedang aktif.",
      },
      { property: "og:title", content: "Text to Video — Creative Studio" },
      {
        property: "og:description",
        content: "Model, aspect ratio, dan kualitas mengikuti provider video aktif.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "Text to Video — Creative Studio" },
      {
        name: "twitter:description",
        content: "Model, aspect ratio, dan kualitas mengikuti provider video aktif.",
      },
    ],
  }),
  component: TextToVideoPage,
});

function TextToVideoPage() {
  const [prompt, setPrompt] = useSticky("t2v.prompt", "");
  const [busy, setBusy] = useSticky("t2v.busy", false);
  const [logs, setLogs] = useSticky<string[]>("t2v.logs", []);
  const [status, setStatus] = useSticky<{ show: boolean; text: string; pct: number; time: string }>("t2v.status", {
    show: false, text: "", pct: 0, time: "0:00",
  });
  const [runState, setRunState] = useSticky<"idle" | "processing" | "sukses" | "gagal">("t2v.runState", "idle");
  const [error, setError] = useSticky<string | null>("t2v.error", null);
  const gallery = useCloudGallery<{ prompt?: string }>("text-to-video", "video");
  const videos = gallery.items;

  // Provider mengikuti routing cap "video" (label Provider aktif).
  const [provider, setProvider] = useSticky<string>("t2v.provider", "leonardo");
  const [model, setModel] = useSticky<string>("t2v.model", "");
  const [ratio, setRatio] = useSticky<string>("t2v.ratio", "9:16");
  const [quality, setQuality] = useSticky<string>("t2v.quality", "");
  const [bootstrapped, setBootstrapped] = useState(false);

  useEffect(() => {
    const sync = () => {
      const routed = readRoutedVideoProvider();
      const p = routed || provider || "leonardo";
      if (p !== provider) setProvider(p);
      const list = I2V_CATALOG[p] || [];
      if (!list.find((m) => m.value === model)) setModel(list[0]?.value || "");
      setBootstrapped(true);
    };
    sync();
    window.addEventListener("storage", sync);
    window.addEventListener("focus", sync);
    window.addEventListener("aatools:routing-changed", sync as EventListener);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener("focus", sync);
      window.removeEventListener("aatools:routing-changed", sync as EventListener);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider, model]);

  const isFirefly = provider === "firefly";
  const isRoboneo = provider === "roboneo";
  const isDola = provider === "dola";
  const supported = T2V_SUPPORTED.includes(provider);
  const { tokens } = useProviderCredit(provider);

  const models = I2V_CATALOG[provider] || [];
  const activeModel = models.find((m) => m.value === model) || models[0];
  const ratios = isFirefly ? FIREFLY_RATIOS : isRoboneo ? ROBONEO_RATIOS : isDola ? DOLA_RATIOS : RATIOS;
  const qualityOpts = qualityOptsFor(activeModel?.value || "", ratio);
  const activeQuality = qualityOpts.find((q) => q.value === quality) || qualityOpts[0];
  const totalCost = activeQuality?.cr ?? Math.round((activeModel?.cr ?? 0) * (activeQuality?.mult ?? 1));

  useEffect(() => {
    if (!bootstrapped) return;
    if (!ratios.includes(ratio)) setRatio(ratios[0]);
    if (!qualityOpts.find((q) => q.value === quality)) setQuality(qualityOpts[0]?.value || "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider, model, ratio, bootstrapped]);

  const log = (m: string, pct?: number) => {
    setLogs((prev) => [`${new Date().toLocaleTimeString()} — ${m}`, ...prev].slice(0, 40));
    setStatus((s) => ({ ...s, text: m, pct: pct != null ? pct : s.pct }));
  };

  const startStatus = (text: string) => {
    const start = Date.now();
    setStatus({ show: true, text, pct: 5, time: "0:00" });
    const tick = setInterval(() => {
      const el = Math.floor((Date.now() - start) / 1000);
      setStatus((s) => ({ ...s, time: `${Math.floor(el / 60)}:${String(el % 60).padStart(2, "0")}` }));
    }, 1000);
    return () => clearInterval(tick);
  };

  const generateVideo = async () => {
    if (!prompt.trim() || !supported || !activeModel) return;
    setBusy(true);
    setError(null);
    setRunState("processing");
    const stopTick = startStatus("Submit…");
    try {
      const duration = activeQuality?.duration ?? 5;
      let url: string;
      if (isFirefly) {
        const ffKey = activeModel.value.replace(/^ff:/, "");
        const ffModel =
          FIREFLY_VIDEO_MODELS.find((m) => m.key === activeModel.value || m.key === ffKey) ??
          FIREFLY_VIDEO_MODELS[0];
        log(`Submit ${ffModel.label} (${duration}s · ${ratio})`);
        url = await runFireflyWithRotation(
          (token) =>
            generateFireflyVideo({
              token,
              modelKey: ffModel.key,
              prompt,
              ratio,
              duration,
              onProgress: (m, pct) => log(m, pct),
            }),
          (i, total, reason) => log(`↻ rotate token #${i}/${total}: ${reason}`),
        );
      } else if (isDola) {
        const { runDolaWithRotation } = await import("@/lib/providers/dola");
        log(`Submit ${activeModel.label} (${activeQuality?.label ?? ""} · ${ratio})`);
        url = await runDolaWithRotation({
          prompt: prompt.trim(),
          modelKey: activeModel.value,
          ratio,
          duration,
          resolution: activeQuality?.resolution,
          onLog: (m) => log(m),
        });
      } else if (isRoboneo) {
        const { runRoboneoT2V } = await import("@/lib/providers/roboneo");
        log(`Submit ${activeModel.label} (${activeQuality?.label ?? ""} · ${ratio})`);
        url = await runRoboneoT2V({
          prompt: prompt.trim(),
          modelKey: activeModel.value,
          ratio,
          duration,
          resolution: activeQuality?.resolution,
          sound: activeQuality?.sound,
          onProgress: (m, pct) => log(m, pct),
        });
      } else {

        log(`Submit ${activeModel.label} (${activeQuality?.label ?? ""} · ${ratio})`);
        url = await runLeonardoVideo({
          modelKey: activeModel.value,
          prompt,
          aspectRatio: ratio as LeonardoVideoAspect,
          sizeTier: (activeQuality?.sizeTier ?? "hd") as LeonardoVideoSizeTier["id"],
          duration,
          onProgress: (m) => log(m),
          onRotate: (i, total, reason) => log(`↻ rotate token #${i}/${total}: ${reason}`),
        });
      }
      const archived = await gallery.add(url, { prompt: prompt.trim() });
      if (!archived) throw new Error("Video selesai dibuat, tetapi gagal disimpan ke cloud.");
      log("✅ Video siap", 100);
      setRunState("sukses");
      setStatus((s) => ({ ...s, pct: 100, text: "✅ Selesai" }));
    } catch (e) {
      const msg = (e as Error).message;
      setError(msg);
      log(`❌ ${msg}`, 100);
      setRunState("gagal");
      setStatus((s) => ({ ...s, pct: 100, text: "❌ " + msg }));
    } finally {
      stopTick();
      setBusy(false);
    }
  };

  return (
    <DashboardShell>
      <PageHero
        eyebrow="Generate"
        title="Text to"
        highlight="Video"
        desc="Generate video dari teks — model, rasio, dan kualitas mengikuti provider aktif."
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px] mt-4">
        <div className="neumorph rounded-xl p-4 space-y-4">
          <Field label="Prompt (deskripsi motion / kamera / suasana)">
            <Textarea
              rows={4}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Cinematic slow pan, subject centered, natural lighting…"
            />
          </Field>

          <div className="flex flex-col gap-1.5">
            <div className="flex flex-wrap items-center gap-2 min-h-[20px]">
              <label className="text-[11px] font-mono uppercase tracking-[0.18em] text-muted-foreground">
                Model AI
              </label>
              <ProviderActivePill cap="video" />
            </div>
            <Select
              value={activeModel?.value || ""}
              onChange={(e) => setModel(e.target.value)}
              options={models.map((m) => ({ value: m.value, label: `${m.label} — ${m.cr} cr` }))}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Aspek Rasio">
              <Select
                value={ratio}
                onChange={(e) => setRatio(e.target.value)}
                options={ratios.map((r) => ({ value: r, label: r }))}
              />
            </Field>
            <Field label="Kualitas">
              <Select
                value={activeQuality?.value || ""}
                onChange={(e) => setQuality(e.target.value)}
                options={qualityOpts.map((q) => ({ value: q.value, label: q.label }))}
              />
            </Field>
          </div>

          {!supported && (
            <div className="rounded-lg border border-amber-400/40 bg-amber-400/10 px-3 py-2 text-xs text-amber-300">
              Provider <b>{provider}</b> belum menyediakan jalur text-to-video (butuh gambar input).
              Gunakan menu <b>Image to Video</b> atau ganti provider aktif ke Leonardo / Firefly.
            </div>
          )}

          <div className="flex gap-2 items-center flex-wrap">
            <PrimaryButton onClick={generateVideo} disabled={busy || !prompt.trim() || !supported || tokens === 0}>
              {busy ? "Generating…" : "Generate Video"}
            </PrimaryButton>
            <GhostButton
              onClick={() => {
                setPrompt("");
                setLogs([]);
                setError(null);
                setRunState("idle");
              }}
              disabled={busy}
            >
              Reset
            </GhostButton>
            <GenMetaBar provider={provider} cost={totalCost} status={runState} />
          </div>

          {error && (
            <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {error}
            </div>
          )}
        </div>

        <div className="neumorph rounded-xl p-4 space-y-3">
          {status.show && (
            <div className="rounded-lg border border-border/70 bg-card/40 p-2">
              <div className="flex justify-between items-center text-[11px] mb-1">
                <span className="text-foreground">{status.text}</span>
                <span className="font-mono text-muted-foreground">{status.time}</span>
              </div>
              <div className="h-1 rounded-full bg-border overflow-hidden">
                <div
                  className="h-full transition-all"
                  style={{ width: `${status.pct}%`, background: "var(--gradient-neon, linear-gradient(90deg,#22d3ee,#a78bfa))" }}
                />
              </div>
            </div>
          )}
          <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
            Log Proses
          </div>
          <div className="rounded-lg border border-border bg-black/40 p-2 h-56 overflow-auto font-mono text-[11px] leading-relaxed">
            {logs.length === 0 ? (
              <div className="text-muted-foreground italic">Belum ada aktivitas.</div>
            ) : (
              logs.map((l, i) => (
                <div key={i} className="text-muted-foreground">
                  {l}
                </div>
              ))
            )}
          </div>
          <div className="text-[11px] text-muted-foreground">
            Token tersimpan: <b className="text-emerald-400">{tokens}</b>
          </div>
        </div>
      </div>

      <div className="neumorph rounded-xl p-4 mt-4">
        <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-3">
          Hasil Video ({videos.length})
        </div>
        {videos.length === 0 ? (
          <div className="text-xs text-muted-foreground italic">Belum ada video.</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {videos.map(({ id, url }) => (
              <div key={id} className="rounded-lg overflow-hidden border border-border bg-black/40">
                <video
                  src={url}
                  controls
                  preload="metadata"
                  playsInline
                  crossOrigin="anonymous"
                  className="w-full aspect-video object-contain bg-black"
                />
                <div className="p-2 flex justify-between text-[11px]">
                  <a href={url} target="_blank" rel="noreferrer" className="text-primary hover:underline inline-flex items-center gap-1">
                    <ExternalLink className="h-3 w-3" /> Buka
                  </a>
                  <a href={url} download className="text-primary hover:underline inline-flex items-center gap-1">
                    <Download className="h-3 w-3" /> Unduh
                  </a>
                  <button className="text-destructive hover:underline" onClick={() => void gallery.remove(id)}>
                    Hapus
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </DashboardShell>
  );
}
