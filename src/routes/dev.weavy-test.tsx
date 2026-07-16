import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { DashboardShell, PageHero } from "@/components/dashboard/shell";
import { Card, PrimaryButton, GhostButton } from "@/components/dashboard/ui";
import { getWeavyI2VModelKeys, generateWeavyI2V } from "@/lib/providers/weavy-i2v";

export const Route = createFileRoute("/dev/weavy-test")({
  head: () => ({ meta: [{ title: "Weavy I2V Tester" }] }),
  component: Tester,
});

type Row = { key: string; status: "idle" | "running" | "ok" | "fail"; msg: string; url?: string };

function Tester() {
  const keys = getWeavyI2VModelKeys();
  const [file, setFile] = useState<File | null>(null);
  const [prompt, setPrompt] = useState("cinematic slow camera pan, subject stays centered, soft cinematic light");
  const [rows, setRows] = useState<Row[]>(keys.map((k) => ({ key: k, status: "idle", msg: "" })));
  const [busy, setBusy] = useState(false);

  async function runOne(key: string) {
    if (!file) return;
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, status: "running", msg: "start..." } : r)));
    try {
      const url = await generateWeavyI2V({
        modelKey: key, imageFile: file, prompt, duration: 5, ratio: "9:16",
        onProgress: (m) => setRows((p) => p.map((r) => (r.key === key ? { ...r, msg: m } : r))),
      });
      setRows((p) => p.map((r) => (r.key === key ? { ...r, status: "ok", msg: "done", url } : r)));
    } catch (e) {
      setRows((p) => p.map((r) => (r.key === key ? { ...r, status: "fail", msg: (e as Error).message } : r)));
    }
  }

  async function runAll() {
    if (!file) return;
    setBusy(true);
    for (const k of keys) {
      // sequential — Weavy account may throttle parallel batches
      // eslint-disable-next-line no-await-in-loop
      await runOne(k);
    }
    setBusy(false);
  }

  return (
    <DashboardShell>
      <PageHero eyebrow="Dev" title="Weavy I2V Tester" desc="Uji semua recipe image-to-video pakai token Weavy aktif." />
      <Card>
        <div className="space-y-3">
          <input type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] || null)} />
          <textarea
            className="w-full min-h-20 rounded-md bg-muted/40 border border-border p-2 text-sm"
            value={prompt} onChange={(e) => setPrompt(e.target.value)}
          />
          <div className="flex gap-2">
            <PrimaryButton disabled={!file || busy} onClick={runAll}>Test Semua Model</PrimaryButton>
            <GhostButton onClick={() => setRows(keys.map((k) => ({ key: k, status: "idle", msg: "" })))}>Reset</GhostButton>
          </div>
        </div>
      </Card>

      <div className="mt-4 grid gap-2">
        {rows.map((r) => (
          <Card key={r.key}>
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="font-medium">{r.key}</div>
                <div className={`text-xs ${r.status === "fail" ? "text-red-500" : "text-muted-foreground"} break-all`}>
                  [{r.status}] {r.msg}
                </div>
                {r.url && (
                  <a href={r.url} target="_blank" rel="noreferrer" className="text-xs text-blue-500 underline break-all">
                    {r.url}
                  </a>
                )}
              </div>
              <GhostButton onClick={() => runOne(r.key)} disabled={!file || busy}>Test</GhostButton>
            </div>
            {r.url && <video src={r.url} controls className="mt-2 max-h-64 rounded" />}
          </Card>
        ))}
      </div>
    </DashboardShell>
  );
}
