import { createFileRoute } from "@tanstack/react-router";
import { withKeyGuard } from "@/components/brain/key-guard";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  Brain as BrainIcon, Sparkles, BookOpen, GraduationCap, Wand2, Loader2,
  RefreshCw, X, CheckCircle2, AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import { DashboardShell, PageHero } from "@/components/dashboard/shell";
import { Card, PrimaryButton, GhostButton } from "@/components/dashboard/ui";
import { Chip } from "@/components/dashboard/os/section";
import { ANALYSIS_DIMENSIONS } from "@/lib/ai-influencer/catalog";
import { useActiveCharacterId } from "@/lib/ai-influencer/active-character";
import { openConfirm } from "@/components/ai-influencer/dialogs";
import { loadBrain, saveBrain } from "@/lib/ai-influencer/studio.functions";
import { listReferences, listCharacters, type Character } from "@/lib/ai-influencer/service";
import { getCreativeKeys, headersFor } from "@/lib/creative/keys";

export const Route = createFileRoute("/ai-influencer/brain")({
  component: withKeyGuard(BrainPage, ["brain"]),
});

const PERSONA_KEYS = [
  "Personality", "Writing Style", "Speaking Style", "Visual Style",
  "Audience Target", "Tone", "Brand Identity",
];
const MEMORY_KEYS = [
  "Scene yang sudah dibuat", "Outfit yang sering dipakai", "Background favorit",
  "Jam posting terbaik", "Caption terbaik", "Hook terbaik",
  "Prompt terbaik", "Affiliate berhasil", "Affiliate gagal",
];

type StepLog = {
  step: string;
  status: "start" | "running" | "done" | "error";
  label: string;
  progress: number;
  detail?: string | null;
};

function BrainPage() {
  const [activeId] = useActiveCharacterId();
  const [character, setCharacter] = useState<Character | null>(null);
  const [persona, setPersona] = useState<Record<string, string> | null>(null);
  const [memory, setMemory] = useState<Record<string, string> | null>(null);
  const [learning, setLearning] = useState<Record<string, unknown> | null>(null);
  const [busy, setBusy] = useState(false);
  const [logs, setLogs] = useState<StepLog[]>([]);
  const [progress, setProgress] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  const _loadBrain = useServerFn(loadBrain);
  const _saveBrain = useServerFn(saveBrain);

  // Hydrate from DB.
  useEffect(() => {
    if (!activeId) {
      setPersona(null); setMemory(null); setLearning(null); setCharacter(null); return;
    }
    listCharacters().then((all) => setCharacter(all.find((c) => c.id === activeId) ?? null));
    _loadBrain({ data: { characterId: activeId } })
      .then((row) => {
        const p = row.persona as Record<string, string> | null;
        const m = row.memory as Record<string, string> | null;
        const l = row.learning as Record<string, unknown> | null;
        setPersona(p && Object.keys(p).length ? p : null);
        setMemory(m && Object.keys(m).length ? m : null);
        setLearning(l && Object.keys(l).length ? l : null);
      })
      .catch(() => {});
  }, [activeId, _loadBrain]);

  const cancel = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setBusy(false);
    toast.info("Analisa dibatalkan.");
  };

  const runAnalyze = async () => {
    if (!activeId || abortRef.current) return;
    const refs = await listReferences(activeId);
    const socialLinks = refs.filter((r) => r.platform.startsWith("social_")).map((r) => r.url);
    const references = refs.filter((r) => r.platform.startsWith("ref_")).map((r) => r.url);

    if (socialLinks.length === 0 && references.length === 0) {
      toast.error("Tambahkan minimal 1 reference / social link di menu Character dulu.");
      return;
    }

    setBusy(true);
    setLogs([]);
    setProgress(0);
    const ac = new AbortController();
    abortRef.current = ac;

    try {
      const keys = getCreativeKeys();
      if (!keys.gemini && !keys.openai) {
        toast.error("Brain API key kosong — tambahkan Gemini/OpenAI key di Manage → Tokens dulu.");
        setBusy(false);
        return;
      }
      const res = await fetch("/api/router/brain-analyze", {
        method: "POST",
        signal: ac.signal,
        headers: headersFor(keys),
        body: JSON.stringify({
          characterId: activeId,
          socialLinks,
          references,
          name: character?.name ?? null,
          niche: character?.niche ?? null,
        }),
      });
      if (!res.ok || !res.body) throw new Error(`Stream error: ${res.status}`);

      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      let finalPayload: { persona: Record<string, string>; memory: Record<string, string>; learning: Record<string, unknown> } | null = null;
      let pipelineError: string | null = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const parts = buf.split("\n\n");
        buf = parts.pop() ?? "";
        for (const p of parts) {
          const line = p.split("\n").find((l) => l.startsWith("data: "));
          if (!line) continue;
          try {
            const evt = JSON.parse(line.slice(6)) as StepLog;
            setLogs((prev) => [...prev, evt]);
            if (typeof evt.progress === "number") setProgress(evt.progress);
            if (evt.status === "error" && (evt.step === "extract_persona" || evt.step === "extract_memory" || evt.step === "auth" || evt.step === "error")) {
              pipelineError = evt.label;
            }
            if (evt.step === "done" && evt.detail) {
              try {
                finalPayload = JSON.parse(evt.detail);
              } catch { /* */ }
            }
          } catch { /* */ }
        }
      }

      if (pipelineError) {
        toast.error(pipelineError);
      } else if (finalPayload) {
        setPersona(finalPayload.persona);
        setMemory(finalPayload.memory);
        setLearning(finalPayload.learning);
        // Persist ke Supabase.
        await _saveBrain({
          data: {
            characterId: activeId,
            persona: finalPayload.persona,
            memory: finalPayload.memory,
            learning: finalPayload.learning,
          },
        });
        toast.success("Brain siap & tersimpan permanen.");
      } else {
        toast.error("Pipeline berhenti tanpa hasil final. Silakan jalankan ulang analisa.");
      }
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      toast.error(`Analisa gagal: ${(e as Error).message}`);
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  };

  const clear = async () => {
    if (!activeId) return;
    const ok = await openConfirm({
      title: "Reset Brain?",
      description: "Persona, Memory, dan Learning yang tersimpan akan dihapus.",
      confirmLabel: "Reset", tone: "danger",
    });
    if (!ok) return;
    await _saveBrain({ data: { characterId: activeId, persona: {}, memory: {}, learning: {} } });
    setPersona(null); setMemory(null); setLearning(null); setLogs([]); setProgress(0);
    toast.success("Brain direset.");
  };

  return (
    <DashboardShell>
      <PageHero
        eyebrow="Module · Brain"
        title="AI"
        highlight="Brain"
        desc="Pusat kecerdasan AI Influencer. Persona, memory, dan learning dibangun dari reference image + link sosmed real (streaming progress)."
        action={
          <div className="flex gap-2">
            {busy && <GhostButton onClick={cancel}><X className="h-4 w-4" /> Cancel</GhostButton>}
            <GhostButton onClick={clear} disabled={!persona || busy}>
              <RefreshCw className="h-4 w-4" /> Reset
            </GhostButton>
            <PrimaryButton onClick={runAnalyze} disabled={!activeId || busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
              {persona ? "Regenerate Brain" : "Analisa & Build Brain"}
            </PrimaryButton>
          </div>
        }
      />

      {!activeId && (
        <Card>
          <div className="text-sm text-muted-foreground">
            Pilih karakter di menu <b>Character</b> untuk melihat Brain.
          </div>
        </Card>
      )}

      {(busy || logs.length > 0) && (
        <Card title="Pipeline Progress" sub="Streaming realtime dari backend router.">
          <div className="mb-3">
            <div className="h-2 rounded-full bg-card/70 border border-border overflow-hidden">
              <div
                className="h-full transition-all"
                style={{ width: `${progress}%`, background: "var(--gradient-neon)" }}
              />
            </div>
            <div className="text-[11px] text-muted-foreground mt-1">{progress}%</div>
          </div>
          <ul className="max-h-56 overflow-y-auto overflow-x-hidden space-y-1.5 text-xs font-mono min-w-0">
            {logs.map((l, i) => (
              <li key={i} className="flex items-start gap-2 min-w-0">
                {(() => {
                  const later = logs.slice(i + 1).find((next) => next.step === l.step && next.detail === l.detail);
                  const visibleStatus = l.status === "running" && later ? later.status : l.status;
                  return visibleStatus === "done" ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 mt-0.5 shrink-0" />
                  ) : visibleStatus === "error" || (!busy && visibleStatus === "running") ? (
                  <AlertTriangle className="h-3.5 w-3.5 text-rose-400 mt-0.5 shrink-0" />
                  ) : (
                  <Loader2 className="h-3.5 w-3.5 text-primary animate-spin mt-0.5 shrink-0" />
                  );
                })()}
                <div className="flex-1 min-w-0 break-words">
                  <span className="text-foreground/90">[{l.step}]</span>{" "}
                  <span className="text-muted-foreground">{l.label}</span>
                  {l.detail && l.step !== "done" && (
                    <div className="text-[10px] text-muted-foreground/70 break-all">{l.detail}</div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Persona" sub="Hasil ekstraksi dari reference + sosmed.">
          <div className="space-y-3 text-sm">
            {PERSONA_KEYS.map((k) => (
              <div key={k} className="flex items-start gap-3">
                <Sparkles className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                <div>
                  <div className="font-medium">{k}</div>
                  <div className="text-xs text-muted-foreground">
                    {persona?.[k] ?? (
                      busy && logs.length > 0 ? (
                        <span className="inline-flex items-center gap-1.5">
                          <Loader2 className="h-3 w-3 animate-spin text-primary" />
                          <span className="text-primary/90">
                            [{logs[logs.length - 1].step}] {logs[logs.length - 1].label} · {progress}%
                          </span>
                        </span>
                      ) : (
                        "Menunggu hasil analisa referensi…"
                      )
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card title="AI Memory" sub="Apa yang sudah karakter pelajari.">
          <ul className="space-y-2 text-sm">
            {MEMORY_KEYS.map((k) => (
              <li key={k} className="flex items-start gap-2">
                <BookOpen className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                <div>
                  <div className="text-foreground/90">{k}</div>
                  {memory?.[k] && <div className="text-[11px] text-muted-foreground">{memory[k]}</div>}
                </div>
              </li>
            ))}
          </ul>
          {!memory && <div className="mt-4 text-xs text-muted-foreground">Belum ada memory.</div>}
        </Card>

        <Card title="AI Learning" sub="Sumber data yang dianalisa.">
          {learning ? (
            <div className="space-y-2 text-xs">
              <div>Sumber dianalisa: <b>{String((learning as { scraped_count?: number }).scraped_count ?? 0)}</b></div>
              <ul className="space-y-1 max-h-40 overflow-y-auto">
                {Array.isArray((learning as { sources?: { platform: string; url: string }[] }).sources) &&
                  (learning as { sources: { platform: string; url: string }[] }).sources.map((s, i) => (
                    <li key={i} className="truncate text-muted-foreground">
                      <span className="text-primary">{s.platform}</span> · {s.url}
                    </li>
                  ))}
              </ul>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-10 text-center gap-3">
              <div
                className="h-14 w-14 rounded-2xl grid place-items-center text-primary-foreground"
                style={{ background: "var(--gradient-neon)" }}
              >
                <GraduationCap className="h-6 w-6" />
              </div>
              <div className="text-sm">Belum ada siklus learning</div>
              <div className="text-xs text-muted-foreground max-w-xs">
                Klik <b>Analisa & Build Brain</b> untuk mulai — pipeline akan scrape sosmed & isi memory otomatis.
              </div>
            </div>
          )}
        </Card>
      </div>

      <Card title="Reference Analysis" sub="Dimensi yang diekstrak dari social reference.">
        <div className="flex flex-wrap gap-1.5">
          {ANALYSIS_DIMENSIONS.map((d) => (
            <Chip key={d} tone={persona ? "success" : "default"}>
              <BrainIcon className="h-3 w-3" />
              {d}
            </Chip>
          ))}
        </div>
      </Card>
    </DashboardShell>
  );
}
