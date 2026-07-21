import { useCallback, useEffect, useImperativeHandle, useState, forwardRef } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Loader2, Search, Sparkles, ArrowRight, Play } from "lucide-react";
import { getCreativeKeys, headersFor } from "@/lib/creative/keys";
import { setHandoff, WORKFLOW_ROUTES, type CreativeHandoff } from "@/lib/creative/handoff";
import { useSticky } from "@/lib/stores/use-sticky";
import { Chip, Skeleton } from "./section";
import { toast } from "sonner";

type Idea = {
  title: string;
  hook: string;
  description: string;
  difficulty: string;
  viral_score: number;
  affiliate_score: number;
  duration: string;
  thumbnail_prompt: string;
  workflow: CreativeHandoff["workflow"];
};
type ResearchResult = {
  keyword: string;
  audience: string;
  summary: string;
  trending_topics: string[];
  content_gap: string[];
  creative_angles: { title: string; description: string }[];
  ideas: Idea[];
};

export type ResearchPanelHandle = { runKeyword: (kw: string) => void };

export const ResearchPanel = forwardRef<ResearchPanelHandle>(function ResearchPanel(_props, ref) {
  // Persist across route changes so a user coming back to the dashboard
  // still sees their previous research result.
  const [keyword, setKeyword] = useSticky<string>("dashboard.research.keyword", "");
  const [busy, setBusy] = useState(false);
  const [data, setData] = useSticky<ResearchResult | null>("dashboard.research.data", null);
  const navigate = useNavigate();

  const run = useCallback(async (kw: string) => {
    const q = kw.trim();
    if (!q) return;
    setKeyword(q);
    setBusy(true);
    setData(null);
    try {
      const keys = getCreativeKeys();
      const res = await fetch("/api/public/creative-brain", {
        method: "POST",
        headers: headersFor(keys),
        body: JSON.stringify({ keyword: q, filters: {} }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Riset gagal");
      setData(json as ResearchResult);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, []);

  useImperativeHandle(ref, () => ({ runKeyword: run }), [run]);

  useEffect(() => {
    // no-op
  }, []);

  return (
    <div className="neumorph p-5">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-primary" />
        <div className="font-display text-base">Creative Research</div>
        <Chip tone="primary">AI Deep Dive</Chip>
      </div>
      <div className="text-[11px] text-muted-foreground mt-0.5">
        Ketik keyword → audience · trend · content gap · 20 ide siap generate
      </div>

      <div className="mt-3 flex items-center gap-2 rounded-full border border-border bg-card/50 px-3 py-2">
        <Search className="h-4 w-4 text-muted-foreground" />
        <input
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && run(keyword)}
          placeholder="Contoh: AI ASMR, blender dapur, what if matahari mati"
          disabled={busy}
          className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/70"
        />
        <button
          onClick={() => run(keyword)}
          disabled={busy || !keyword.trim()}
          className="inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-semibold text-primary-foreground glow-pink disabled:opacity-50"
          style={{ background: "var(--gradient-neon)" }}
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
          Riset
        </button>
      </div>

      {busy && (
        <div className="mt-4 grid gap-2">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-2/3" />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-2">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-24" />
            ))}
          </div>
        </div>
      )}

      {data && !busy && (
        <div className="mt-4 animate-fade-in">
          <div className="rounded-xl border border-border bg-card/30 p-3">
            <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Audience</div>
            <div className="text-xs text-foreground/85 mt-1 leading-relaxed">{data.audience}</div>
          </div>

          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <div className="rounded-xl border border-border bg-card/30 p-3">
              <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-2">Trending Topics</div>
              <div className="flex flex-wrap gap-1">
                {data.trending_topics.slice(0, 8).map((t, i) => (
                  <Chip key={i}>{t}</Chip>
                ))}
              </div>
            </div>
            <div className="rounded-xl border border-border bg-card/30 p-3">
              <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-2">Content Gap</div>
              <ul className="space-y-1 text-xs text-foreground/80">
                {data.content_gap.slice(0, 5).map((g, i) => (
                  <li key={i}>• {g}</li>
                ))}
              </ul>
            </div>
          </div>

          <div className="mt-4 text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground">
            20 Ide Konten
          </div>
          <div className="mt-2 grid gap-2 md:grid-cols-2 xl:grid-cols-3 max-h-[520px] overflow-y-auto pr-1">
            {data.ideas.map((idea, i) => (
              <div key={i} className="rounded-xl border border-border bg-card/30 p-3 hover:border-primary/40 transition">
                <div className="flex items-start gap-2">
                  <span className="text-[10px] font-mono text-muted-foreground shrink-0 mt-0.5">#{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-foreground/95 line-clamp-1">{idea.title}</div>
                    <div className="text-[11px] text-primary mt-0.5 italic line-clamp-2">"{idea.hook}"</div>
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap gap-1">
                  <Chip tone={idea.viral_score >= 70 ? "success" : "default"}>V {idea.viral_score}</Chip>
                  <Chip tone={idea.affiliate_score >= 70 ? "primary" : "default"}>A {idea.affiliate_score}</Chip>
                  <Chip>{idea.duration}</Chip>
                  <Chip>{idea.difficulty}</Chip>
                </div>
                <button
                  onClick={() => {
                    // Safety net: only allow bulk-fashion when keyword clearly is apparel
                    const kwLower = (data.keyword + " " + idea.title).toLowerCase();
                    const isFashion = /(fashion|apparel|outfit|dress|lookbook|baju|pakaian|busana|hijab|kaos|jaket|celana|gaun|kemeja|model wear)/i.test(kwLower);
                    let wf = idea.workflow;
                    if (wf === "bulk-fashion" && !isFashion) wf = "narrative-video";
                    setHandoff({
                      workflow: wf,
                      title: idea.title,
                      hook: idea.hook,
                      description: idea.description,
                      thumbnail_prompt: idea.thumbnail_prompt,
                      keyword: data.keyword,
                      duration: idea.duration,
                    });
                    navigate({ to: WORKFLOW_ROUTES[wf] });
                  }}
                  className="mt-2 w-full inline-flex items-center justify-center gap-1 rounded-full border border-primary/40 bg-primary/10 hover:bg-primary/20 px-3 py-1 text-[11px] text-primary transition"
                >
                  Generate <ArrowRight className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {!busy && !data && (
        <div className="mt-4 rounded-xl border border-dashed border-border/60 bg-card/20 p-8 text-center text-xs text-muted-foreground">
          Belum ada riset. Ketik keyword atau klik topik dari Trending / AI Brain.
        </div>
      )}
    </div>
  );
});
