import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Sparkles, Send, Loader2, ArrowUpRight } from "lucide-react";
import { getCreativeKeys, headersFor } from "@/lib/creative/keys";
import { setHandoff, WORKFLOW_ROUTES, type CreativeHandoff } from "@/lib/creative/handoff";
import { openUpgradePrompt } from "@/lib/stores/upgrade-prompt";
import { toast } from "sonner";

type OrchestratorResult = {
  workflow: CreativeHandoff["workflow"] | "research";
  title?: string;
  hook?: string;
  description?: string;
  keyword?: string;
  reasoning?: string;
};

const STEPS = ["Menganalisa intent", "Memilih workflow", "Menyiapkan handoff"];

export function CommandCenter({ onResearch }: { onResearch: (keyword: string) => void }) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState(0);
  const [lastResult, setLastResult] = useState<OrchestratorResult | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  async function run(text: string) {
    const prompt = text.trim();
    if (!prompt) return;
    const keys = getCreativeKeys();
    if (!keys.gemini && !keys.openai) {
      openUpgradePrompt("ai-command-center");
      toast.error("Tambahkan Gemini/OpenAI key di Token Manager.");
      return;
    }
    setBusy(true);
    setStep(0);
    setLastResult(null);
    const timer = setInterval(() => setStep((s) => Math.min(s + 1, STEPS.length - 1)), 700);
    try {
      const system =
        "You are an AI Content OS orchestrator. Read the user's Indonesian/English request and pick ONE workflow. " +
        "Reply with pure JSON only, no fences.";
      const user = `USER REQUEST: "${prompt}"

Choose one workflow:
- "narrative-video" — script/story/what-if/education/news
- "motion" — dance/character animation/motion transfer
- "storyboard" — product/affiliate/commerce/multi-scene ad
- "bulk-fashion" — apparel model shots
- "image-to-video" — animate single image
- "research" — user wants research/ideas/trends, no direct generate

Return JSON: { "workflow": string, "keyword": string (5-8 words topic), "title": string, "hook": string, "description": string, "reasoning": string }`;
      const res = await fetch("/api/router/chat", {
        method: "POST",
        headers: headersFor(keys),
        body: JSON.stringify({ system, user, json: true, temperature: 0.6 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "AI gagal merespons");
      let parsed: OrchestratorResult;
      try {
        parsed = JSON.parse(data.text);
      } catch {
        throw new Error("AI mengembalikan format tidak valid");
      }
      setLastResult(parsed);
      setStep(STEPS.length - 1);

      if (parsed.workflow === "research") {
        onResearch(parsed.keyword || prompt);
        toast.success("Membuka riset kreatif…");
      } else if (parsed.workflow in WORKFLOW_ROUTES) {
        setHandoff({
          workflow: parsed.workflow as CreativeHandoff["workflow"],
          title: parsed.title || prompt.slice(0, 60),
          hook: parsed.hook || "",
          description: parsed.description || prompt,
          keyword: parsed.keyword,
        });
        toast.success(`Routing → ${parsed.workflow}`);
        navigate({ to: WORKFLOW_ROUTES[parsed.workflow as CreativeHandoff["workflow"]] });
      } else {
        toast.message("Tidak ada workflow yang cocok — coba kalimat lebih spesifik.");
      }
    } catch (e) {
      toast.error((e as Error).message || "Gagal menjalankan command");
    } finally {
      clearInterval(timer);
      setBusy(false);
    }
  }

  return (
    <div className="neumorph p-5 md:p-6 relative overflow-hidden">
      <div
        aria-hidden
        className="absolute -top-24 -right-24 h-64 w-64 rounded-full opacity-30 blur-3xl"
        style={{ background: "var(--gradient-neon)" }}
      />
      <div className="relative flex items-start gap-3">
        <div
          className="h-10 w-10 grid place-items-center rounded-xl text-primary-foreground shrink-0"
          style={{ background: "var(--gradient-neon)" }}
        >
          <Sparkles className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-display text-base md:text-lg">AI Command Center</div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Tulis apa yang mau kamu buat. AI memilih workflow, sumber, dan hand-off ke studio yang tepat.
          </p>
        </div>
      </div>

      <div className="relative mt-4">
        <textarea
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
              e.preventDefault();
              run(value);
            }
          }}
          disabled={busy}
          rows={2}
          placeholder="Tulis permintaanmu…"
          className="w-full rounded-2xl border border-border bg-card/60 px-4 py-3 pr-32 text-sm outline-none placeholder:text-muted-foreground/70 focus:border-primary/60 focus:shadow-[var(--shadow-glow-cyan)] transition resize-none"
        />
        <button
          onClick={() => run(value)}
          disabled={busy || !value.trim()}
          className="absolute right-2 top-2 inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold text-primary-foreground glow-pink transition hover:brightness-110 disabled:opacity-50"
          style={{ background: "var(--gradient-neon)" }}
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          <span>{busy ? "Routing…" : "Run"}</span>
        </button>
      </div>

      {busy && (
        <div className="mt-4 flex items-center gap-3 text-xs text-muted-foreground">
          {STEPS.map((s, i) => (
            <div key={s} className="flex items-center gap-1.5">
              <span
                className={
                  "h-1.5 w-1.5 rounded-full " +
                  (i <= step ? "bg-primary shadow-[0_0_8px_var(--primary)]" : "bg-border")
                }
              />
              <span className={i <= step ? "text-foreground/80" : ""}>{s}</span>
              {i < STEPS.length - 1 && <span className="opacity-40">→</span>}
            </div>
          ))}
        </div>
      )}

      {lastResult && !busy && (
        <div className="mt-4 rounded-xl border border-border bg-card/40 p-3 flex items-start gap-3 animate-fade-in">
          <ArrowUpRight className="h-4 w-4 text-primary mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0 text-xs">
            <div className="text-foreground/90">
              <span className="text-muted-foreground">Routed to </span>
              <span className="font-medium">{lastResult.workflow}</span>
              {lastResult.title && <> · {lastResult.title}</>}
            </div>
            {lastResult.reasoning && (
              <div className="text-muted-foreground mt-1 line-clamp-2">{lastResult.reasoning}</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
