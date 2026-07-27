import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { DashboardShell, PageHero } from "@/components/dashboard/shell";
import { Card, PrimaryButton, GhostButton } from "@/components/dashboard/ui";
import {
  getActiveWeavyAccessToken,
  listWeavyRecipes,
  getWeavyRecipe,
  type WeavyRecipeSummary,
} from "@/lib/providers/weavy";

export const Route = createFileRoute("/dev/weavy-node-inspect")({
  head: () => ({
    meta: [
      { title: "Weavy Node Inspector" },
      { name: "description", content: "Dump JSON node natif dari canvas Weavy untuk mencocokkan recipe builder." },
    ],
  }),
  component: Inspector,
});

function Inspector() {
  const [recipes, setRecipes] = useState<WeavyRecipeSummary[]>([]);
  const [json, setJson] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [manualId, setManualId] = useState("");
  const [modelOnly, setModelOnly] = useState(true);

  async function load() {
    setErr("");
    setBusy(true);
    try {
      const active = await getActiveWeavyAccessToken();
      if (!active) throw new Error("Belum ada Weavy token aktif di Kelola Token");
      setRecipes(await listWeavyRecipes(active.accessToken));
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function dump(id: string) {
    setErr("");
    setJson("");
    setBusy(true);
    try {
      const active = await getActiveWeavyAccessToken();
      if (!active) throw new Error("Belum ada Weavy token aktif di Kelola Token");
      const data = (await getWeavyRecipe(id, active.accessToken)) as {
        nodes?: Array<Record<string, unknown>>;
        edges?: unknown[];
      };
      const nodes = Array.isArray(data?.nodes) ? data.nodes : [];
      const picked = modelOnly ? nodes.filter((n) => (n as { isModel?: boolean }).isModel) : nodes;
      setJson(JSON.stringify(modelOnly ? { nodes: picked } : { nodes, edges: data?.edges }, null, 2));
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <DashboardShell>
      <PageHero
        eyebrow="Dev"
        title="Weavy Node Inspector"
        desc="Buka canvas Weavy yang hasilnya akurat, lalu dump JSON node modelnya di sini untuk dicocokkan dengan builder storyboard."
      />
      <Card>
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <PrimaryButton onClick={load} disabled={busy}>
              Muat daftar recipe
            </PrimaryButton>
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <input type="checkbox" checked={modelOnly} onChange={(e) => setModelOnly(e.target.checked)} />
              Hanya node model
            </label>
          </div>
          <div className="flex gap-2">
            <input
              className="flex-1 rounded-md border border-border bg-muted/40 p-2 text-sm"
              placeholder="Recipe ID (dari URL canvas Weavy)"
              value={manualId}
              onChange={(e) => setManualId(e.target.value)}
            />
            <GhostButton onClick={() => manualId && dump(manualId.trim())} disabled={busy || !manualId}>
              Dump
            </GhostButton>
          </div>
          {err && <div className="text-sm text-red-500 break-all">{err}</div>}
        </div>
      </Card>

      {recipes.length > 0 && (
        <div className="mt-4 grid gap-2">
          {recipes.map((r) => (
            <Card key={r.id}>
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-medium truncate">{r.name || r.id}</div>
                  <div className="text-xs text-muted-foreground break-all">
                    {r.id}
                    {r.updatedAt ? ` · ${r.updatedAt}` : ""}
                  </div>
                </div>
                <GhostButton onClick={() => dump(r.id)} disabled={busy}>
                  Dump
                </GhostButton>
              </div>
            </Card>
          ))}
        </div>
      )}

      {json && (
        <div className="mt-4">
        <Card>

          <div className="mb-2 flex justify-end">
            <GhostButton onClick={() => navigator.clipboard?.writeText(json)}>Copy JSON</GhostButton>
          </div>
          <pre className="max-h-[60vh] overflow-auto rounded-md bg-muted/40 p-3 text-xs">{json}</pre>
        </Card>
        </div>
      )}

    </DashboardShell>
  );
}
