import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { RefreshCw, Play, Loader2, Sparkles, Layers, Puzzle, ExternalLink, Copy, Check } from "lucide-react";
import { DashboardShell, PageHero } from "@/components/dashboard/shell";
import { Card, Field, Input, Textarea, PrimaryButton, GhostButton } from "@/components/dashboard/ui";
import {
  getAllFramiaKeys,
  getFirstFramiaKey,
  fetchFramiaCredits,
  fetchFramiaProfile,
  listFramiaSkills,
  listFramiaTemplateCategories,
  createWorkflowRun,
  waitForRunCompletion,
  type FramiaSkill,
  type FramiaCategory,
  type FramiaTemplate,
  type FramiaRunNode,
} from "@/lib/providers/framia";

export const Route = createFileRoute("/generate/framia")({
  head: () => ({
    meta: [
      { title: "Framia — Canvas Workflow · AA Creative Studio" },
      {
        name: "description",
        content:
          "Jalankan semua node dan recipe Framia (Converge AI) langsung dari AA Creative Studio — image, video, avatar, garment, storyboard.",
      },
      { property: "og:title", content: "Framia — Canvas Workflow" },
      {
        property: "og:description",
        content: "Semua skill dan template Framia terintegrasi dalam satu dashboard.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: FramiaPage,
});

type LoadState = "idle" | "loading" | "ready" | "error";

function FramiaPage() {
  const [token, setToken] = useState<string | null>(null);
  const [tokens, setTokens] = useState<string[]>([]);
  const [profile, setProfile] = useState<{ email?: string; plan?: string; workspace?: string } | null>(null);
  const [credits, setCredits] = useState<number | null>(null);
  const [skills, setSkills] = useState<FramiaSkill[]>([]);
  const [categories, setCategories] = useState<FramiaCategory[]>([]);
  const [status, setStatus] = useState<LoadState>("idle");
  const [error, setError] = useState<string>("");
  const [tab, setTab] = useState<"skills" | "templates">("skills");
  const [filter, setFilter] = useState("");

  const refreshTokens = () => {
    const all = getAllFramiaKeys();
    setTokens(all);
    setToken((prev) => prev && all.includes(prev) ? prev : (all[0] ?? null));
  };

  useEffect(() => {
    refreshTokens();
    const on = () => refreshTokens();
    window.addEventListener("aatools:tokens-synced", on);
    window.addEventListener("aatools:keys-changed", on);
    window.addEventListener("storage", on);
    return () => {
      window.removeEventListener("aatools:tokens-synced", on);
      window.removeEventListener("aatools:keys-changed", on);
      window.removeEventListener("storage", on);
    };
  }, []);

  const loadAll = async (t: string) => {
    setStatus("loading");
    setError("");
    try {
      const [prof, cred, sk, cats] = await Promise.all([
        fetchFramiaProfile(t).catch(() => null),
        fetchFramiaCredits(t).catch(() => null),
        listFramiaSkills(t).catch((e) => {
          throw e;
        }),
        listFramiaTemplateCategories(t, true).catch(() => [] as FramiaCategory[]),
      ]);
      setProfile(
        prof
          ? {
              email: prof.email,
              plan: prof.subscription_plan_name || prof.subscription_plan,
              workspace: prof.workspace_id,
            }
          : null,
      );
      setCredits(
        typeof cred?.credits === "number"
          ? cred.credits
          : typeof cred?.balance === "number"
            ? cred.balance
            : null,
      );
      setSkills(Array.isArray(sk) ? sk : []);
      setCategories(Array.isArray(cats) ? cats : []);
      setStatus("ready");
    } catch (e) {
      setError((e as Error).message);
      setStatus("error");
    }
  };

  useEffect(() => {
    if (token) void loadAll(token);
    else setStatus("idle");
  }, [token]);

  const templates: (FramiaTemplate & { _category?: string })[] = useMemo(() => {
    const out: (FramiaTemplate & { _category?: string })[] = [];
    for (const c of Array.isArray(categories) ? categories : []) {
      for (const t of c.templates ?? []) out.push({ ...t, _category: c.name });
    }
    return out;
  }, [categories]);

  const filteredSkills = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return skills;
    return skills.filter((s) =>
      [s.display_name, s.name, s.description, s.category].join(" ").toLowerCase().includes(q),
    );
  }, [skills, filter]);

  const filteredTemplates = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return templates;
    return templates.filter((t) =>
      [t.name, t.description, t._category, ...(t.tags ?? [])].join(" ").toLowerCase().includes(q),
    );
  }, [templates, filter]);

  const [runOpen, setRunOpen] = useState<null | { title: string; workflowId?: string }>(null);

  return (
    <DashboardShell>
      <PageHero
        eyebrow="Framia · Converge AI"
        title="Canvas Workflow"
        highlight="Runner"
        desc="Semua node (skills) dan recipe (templates) dari akun Framia kamu — image, video, avatar, garment, storyboard. Auto-load begitu token tersimpan di Token Manager."
      />

      {!token ? (
        <Card>
          <div className="text-sm text-muted-foreground">
            Belum ada token Framia. Buka{" "}
            <a href="/manage/tokens" className="text-primary underline">
              Manage → Tokens → Framia
            </a>{" "}
            lalu paste Bearer JWT dari framia.converge.ai (F12 → Network → header
            <code className="text-foreground/85"> authorization</code>).
          </div>
        </Card>
      ) : (
        <>
          <Card>
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Account</div>
                <div className="font-semibold text-foreground">{profile?.email ?? "—"}</div>
                {profile?.plan && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full border border-primary/40 bg-primary/10 text-primary">
                    {profile.plan}
                  </span>
                )}
              </div>
              <div className="ml-auto flex items-center gap-3 text-sm">
                <div>
                  <span className="text-muted-foreground">Credits: </span>
                  <span className="font-mono font-semibold text-emerald-400">
                    {credits == null ? "—" : credits}
                  </span>
                </div>
                {tokens.length > 1 && (
                  <select
                    className="rounded-lg border border-border bg-card/50 px-2 py-1 text-xs"
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                  >
                    {tokens.map((t, i) => (
                      <option key={t} value={t}>
                        Token #{i + 1} ({t.slice(0, 10)}…)
                      </option>
                    ))}
                  </select>
                )}
                <GhostButton onClick={() => token && loadAll(token)} disabled={status === "loading"}>
                  <RefreshCw className={["h-3.5 w-3.5", status === "loading" ? "animate-spin" : ""].join(" ")} />
                  Refresh
                </GhostButton>
              </div>
            </div>
            {error && (
              <div className="mt-3 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
                {error}
              </div>
            )}
          </Card>

          <Card>
            <div className="flex flex-wrap items-center gap-2 mb-4">
              <div className="flex gap-1 rounded-full bg-card/40 border border-border p-1 w-fit">
                {(["skills", "templates"] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setTab(t)}
                    className={[
                      "px-4 py-1.5 rounded-full text-xs font-semibold transition inline-flex items-center gap-1.5",
                      tab === t
                        ? "text-primary-foreground glow-pink"
                        : "text-muted-foreground hover:text-foreground",
                    ].join(" ")}
                    style={tab === t ? { background: "var(--gradient-neon)" } : undefined}
                  >
                    {t === "skills" ? <Puzzle className="h-3.5 w-3.5" /> : <Layers className="h-3.5 w-3.5" />}
                    {t === "skills" ? `Nodes (${skills.length})` : `Recipes (${templates.length})`}
                  </button>
                ))}
              </div>
              <Input
                placeholder="Cari…"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                className="max-w-xs ml-auto"
              />
            </div>

            {status === "loading" && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading dari api.framia.pro…
              </div>
            )}

            {status === "ready" && tab === "skills" && (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                {filteredSkills.map((s, i) => {
                  const id = s.skill_id || s.id || String(i);
                  const title = s.display_name || s.name || id;
                  const wf = s.workflow_id;
                  return (
                    <div key={id} className="rounded-2xl border border-border bg-card/40 p-4">
                      <div className="flex items-start gap-2">
                        <div
                          className="h-9 w-9 rounded-xl grid place-items-center text-primary-foreground shrink-0"
                          style={{ background: "var(--gradient-neon)" }}
                        >
                          <Sparkles className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="font-display text-sm truncate">{title}</div>
                          <div className="text-[11px] text-muted-foreground line-clamp-2 mt-0.5">
                            {s.description ?? s.category ?? "—"}
                          </div>
                        </div>
                      </div>
                      <div className="mt-3 flex items-center gap-2 flex-wrap">
                        {s.category && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted/40 text-muted-foreground">
                            {s.category}
                          </span>
                        )}
                        {s.media_type && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted/40 text-muted-foreground">
                            {s.media_type}
                          </span>
                        )}
                        {typeof s.cost === "number" && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/30">
                            {s.cost} cr
                          </span>
                        )}
                        <button
                          disabled={!wf}
                          onClick={() => setRunOpen({ title, workflowId: wf })}
                          className="ml-auto inline-flex items-center gap-1 rounded-full px-3 py-1 text-[11px] font-semibold text-primary-foreground disabled:opacity-40"
                          style={{ background: "var(--gradient-neon)" }}
                        >
                          <Play className="h-3 w-3" /> Run
                        </button>
                      </div>
                    </div>
                  );
                })}
                {filteredSkills.length === 0 && (
                  <div className="text-xs text-muted-foreground italic">Tidak ada skill.</div>
                )}
              </div>
            )}

            {status === "ready" && tab === "templates" && (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3">
                {filteredTemplates.map((t, i) => {
                  const id = t.template_id || t.id || String(i);
                  return (
                    <div key={id} className="rounded-2xl border border-border bg-card/40 overflow-hidden group">
                      {t.cover_url ? (
                        <img src={t.cover_url} alt={t.name ?? ""} className="w-full aspect-video object-cover" />
                      ) : (
                        <div className="w-full aspect-video bg-muted/30 grid place-items-center text-muted-foreground text-xs">
                          {t._category ?? "—"}
                        </div>
                      )}
                      <div className="p-3">
                        <div className="font-display text-sm truncate">{t.name ?? id}</div>
                        <div className="text-[11px] text-muted-foreground line-clamp-2 mt-0.5">
                          {t.description ?? t._category ?? ""}
                        </div>
                        <div className="mt-2 flex items-center gap-2 flex-wrap">
                          {t._category && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted/40 text-muted-foreground">
                              {t._category}
                            </span>
                          )}
                          <button
                            disabled={!t.workflow_id}
                            onClick={() => setRunOpen({ title: t.name ?? id, workflowId: t.workflow_id })}
                            className="ml-auto inline-flex items-center gap-1 rounded-full px-3 py-1 text-[11px] font-semibold text-primary-foreground disabled:opacity-40"
                            style={{ background: "var(--gradient-neon)" }}
                          >
                            <Play className="h-3 w-3" /> Run
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
                {filteredTemplates.length === 0 && (
                  <div className="text-xs text-muted-foreground italic col-span-full">Tidak ada template.</div>
                )}
              </div>
            )}
          </Card>

          <Card>
            <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-2">
              Referensi endpoint aktif
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[11px] font-mono text-muted-foreground">
              {[
                "GET  /video/api/v1/user/credits",
                "GET  /video/api/v2/user/info",
                "GET  /video/api/workflows/skills?user_invocable=true",
                "GET  /video/api/workflows/templates?scope=all",
                "GET  /video/api/workflows/template-categories?with_templates=true",
                "GET  /video/api/workflows/agent-node/options",
                "GET  /video/api/workflows/canvas-node-rules",
                "GET  /video/api/v2/avatar/system-list",
                "GET  /video/api/v2/avatar/user/list",
                "GET  /video/api/v2/garment/system-list",
                "POST /video/api/v2/projects",
                "POST /video/api/v2/projects/{id}/ai/resource_process_pricing",
                "POST /video/api/v2/get_upload_presigned_url",
                "POST /video/api/v2/projects/{id}/upload_done",
                "GET  /video/api/v1/resources/{id}/info",
                "POST /video/api/workflows/runs",
                "GET  /video/api/workflows/runs/{run_id}/nodes",
              ].map((line) => (
                <div key={line} className="truncate">
                  {line}
                </div>
              ))}
            </div>
          </Card>
        </>
      )}

      {runOpen && token && (
        <RunDialog
          token={token}
          workflowId={runOpen.workflowId}
          title={runOpen.title}
          onClose={() => setRunOpen(null)}
        />
      )}
    </DashboardShell>
  );
}

/* --------------------------------- runner --------------------------------- */

function RunDialog({
  token,
  workflowId,
  title,
  onClose,
}: {
  token: string;
  workflowId?: string;
  title: string;
  onClose: () => void;
}) {
  const [projectId, setProjectId] = useState("");
  const [canvasId, setCanvasId] = useState("");
  const [inputJson, setInputJson] = useState(
    JSON.stringify({ nodes: {} }, null, 2),
  );
  const [busy, setBusy] = useState(false);
  const [runId, setRunId] = useState<string | null>(null);
  const [nodes, setNodes] = useState<FramiaRunNode[]>([]);
  const [err, setErr] = useState<string>("");
  const [copied, setCopied] = useState(false);

  const run = async () => {
    if (!workflowId) return;
    setBusy(true);
    setErr("");
    setNodes([]);
    setRunId(null);
    try {
      let inputRefs: Record<string, unknown> = {};
      try {
        inputRefs = JSON.parse(inputJson) as Record<string, unknown>;
      } catch {
        throw new Error("Input JSON tidak valid");
      }
      const res = await createWorkflowRun(token, {
        workflowId,
        projectId,
        canvasId,
        inputRefs,
      });
      const id = String(res.run_id || res.id || "");
      if (!id) throw new Error("run_id tidak dikembalikan Framia");
      setRunId(id);
      const finalNodes = await waitForRunCompletion(token, id, {
        onTick: (n) => setNodes(n),
      });
      setNodes(finalNodes);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[80] grid place-items-center bg-black/70 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="neumorph w-full max-w-2xl p-6 relative max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="font-display text-lg mb-1">Run · {title}</div>
        <div className="text-[11px] text-muted-foreground mb-4">
          workflow_id: <code className="text-foreground/80">{workflowId ?? "—"}</code>
        </div>

        {!workflowId ? (
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-200">
            Node ini tidak expose <code>workflow_id</code>. Buka canvas Framia di{" "}
            <a
              href="https://framia.converge.ai/"
              target="_blank"
              rel="noreferrer"
              className="underline inline-flex items-center gap-1"
            >
              framia.converge.ai <ExternalLink className="h-3 w-3" />
            </a>{" "}
            untuk mengeksekusi dari sana.
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Project ID">
                <Input
                  value={projectId}
                  onChange={(e) => setProjectId(e.target.value)}
                  placeholder="a032980f-..."
                />
              </Field>
              <Field label="Canvas ID">
                <Input
                  value={canvasId}
                  onChange={(e) => setCanvasId(e.target.value)}
                  placeholder="ebbfed16-..."
                />
              </Field>
            </div>
            <Field label="input_refs (JSON)">
              <Textarea
                rows={8}
                className="font-mono text-[11px]"
                value={inputJson}
                onChange={(e) => setInputJson(e.target.value)}
              />
            </Field>
            <div className="text-[11px] text-muted-foreground -mt-2 mb-3">
              Contoh untuk image-to-video:
              <button
                onClick={() => {
                  const ex = {
                    nodes: {
                      "image-abc": {
                        output: {
                          result: {
                            kind: "resource_collection",
                            media_type: "image",
                            resources: [{ resource_id: "RESOURCE_ID_HERE", media_type: "image" }],
                          },
                        },
                      },
                    },
                  };
                  setInputJson(JSON.stringify(ex, null, 2));
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1200);
                }}
                className="ml-1 inline-flex items-center gap-1 text-primary hover:underline"
              >
                {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />} isi contoh
              </button>
            </div>
            <div className="flex gap-2">
              <PrimaryButton onClick={run} disabled={busy || !projectId || !canvasId}>
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                {busy ? "Running…" : "Jalankan Workflow"}
              </PrimaryButton>
              <GhostButton onClick={onClose}>Tutup</GhostButton>
            </div>

            {err && (
              <div className="mt-3 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
                {err}
              </div>
            )}

            {runId && (
              <div className="mt-4 rounded-lg border border-border bg-card/40 p-3 text-[11px]">
                <div className="text-muted-foreground">run_id</div>
                <div className="font-mono text-foreground/90 break-all">{runId}</div>
                {nodes.length > 0 && (
                  <div className="mt-3 space-y-1.5">
                    {nodes.map((n, i) => (
                      <div key={n.node_id ?? i} className="flex items-center gap-2">
                        <span
                          className={[
                            "h-2 w-2 rounded-full",
                            n.status === "success" || n.status === "succeeded"
                              ? "bg-emerald-400"
                              : n.status === "failed"
                                ? "bg-rose-400"
                                : "bg-amber-400",
                          ].join(" ")}
                        />
                        <span className="font-mono text-[10px] text-muted-foreground truncate flex-1">
                          {n.node_id}
                        </span>
                        <span className="text-[10px] text-foreground/80">{n.status}</span>
                        {typeof n.progress === "number" && (
                          <span className="text-[10px] text-muted-foreground">{Math.round(n.progress * 100)}%</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
