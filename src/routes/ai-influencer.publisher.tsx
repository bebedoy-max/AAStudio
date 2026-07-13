import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Send, Plus, Trash2, Sparkles, Check, X, Edit3, Loader2, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { DashboardShell, PageHero } from "@/components/dashboard/shell";
import { Card, Field, Input, Select, PrimaryButton, GhostButton } from "@/components/dashboard/ui";
import { Chip } from "@/components/dashboard/os/section";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { PUBLISH_PLATFORMS } from "@/lib/ai-influencer/catalog";
import { useActiveCharacterId } from "@/lib/ai-influencer/active-character";
import {
  listPublisherAccounts, connectPublisherAccount, disconnectPublisherAccount,
  loadStrategy, saveQueueBatch,
} from "@/lib/ai-influencer/studio.functions";

export const Route = createFileRoute("/ai-influencer/publisher")({
  component: PublisherPage,
});

type Account = {
  id: string;
  platform: string;
  handle: string;
  status: string;
  webhook_url: string | null;
  created_at: string;
};

type Draft = {
  id: string;
  day_label: string;
  slot_time: string;
  platform: string;
  idea: string;
  caption: string;
  thumbnail_url: string;
  action: "approve" | "skip";
};

const DEFAULT_SLOTS = ["09:00", "12:00", "17:00", "20:00"];
const DAYS = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"];

function PublisherPage() {
  const [activeId] = useActiveCharacterId();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [connectOpen, setConnectOpen] = useState<string | null>(null);
  const [connectForm, setConnectForm] = useState({ handle: "", webhook: "", token: "" });
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [genBusy, setGenBusy] = useState(false);
  const [saveBusy, setSaveBusy] = useState(false);

  const _listAccounts = useServerFn(listPublisherAccounts);
  const _connect = useServerFn(connectPublisherAccount);
  const _disconnect = useServerFn(disconnectPublisherAccount);
  const _loadStrategy = useServerFn(loadStrategy);
  const _saveQueue = useServerFn(saveQueueBatch);

  const reloadAccounts = async () => {
    try {
      const rows = await _listAccounts();
      setAccounts(rows as unknown as Account[]);
    } catch (e) { toast.error((e as Error).message); }
  };
  useEffect(() => { reloadAccounts(); /* eslint-disable-next-line */ }, []);

  const openConnect = (platform: string) => {
    setConnectForm({ handle: "", webhook: "", token: "" });
    setConnectOpen(platform);
  };

  const submitConnect = async () => {
    if (!connectOpen) return;
    if (!connectForm.handle.trim()) { toast.error("Handle wajib diisi."); return; }
    try {
      await _connect({
        data: {
          platform: connectOpen,
          handle: connectForm.handle.trim(),
          webhook_url: connectForm.webhook.trim() || null,
          access_token: connectForm.token.trim() || null,
          characterId: activeId ?? null,
        },
      });
      toast.success(`${connectOpen} terhubung.`);
      setConnectOpen(null);
      reloadAccounts();
    } catch (e) { toast.error((e as Error).message); }
  };

  const doDisconnect = async (a: Account) => {
    try {
      await _disconnect({ data: { id: a.id } });
      setAccounts((p) => p.filter((x) => x.id !== a.id));
    } catch (e) { toast.error((e as Error).message); }
  };

  const generateAiSchedule = async () => {
    if (!activeId) { toast.error("Pilih karakter dulu."); return; }
    if (accounts.length === 0) { toast.error("Connect minimal 1 platform dulu."); return; }
    setGenBusy(true);
    try {
      const strat = await _loadStrategy({ data: { characterId: activeId } });
      const weekly = (strat.weekly as unknown as { day: string; idea: string; platform: string; time: string }[]) ?? [];
      const platforms = Array.from(new Set(accounts.map((a) => a.platform)));
      const base = weekly.length
        ? weekly
        : DAYS.map((d, i) => ({
            day: d,
            idea: `Auto idea ${d} — lifestyle daily`,
            platform: platforms[i % platforms.length] ?? "instagram",
            time: DEFAULT_SLOTS[i % DEFAULT_SLOTS.length],
          }));

      const list: Draft[] = base.map((w, i) => ({
        id: `d${i}-${Date.now()}`,
        day_label: w.day,
        slot_time: w.time,
        platform: w.platform,
        idea: w.idea,
        caption: `${w.idea} — auto caption (edit sebelum save).`,
        thumbnail_url: "",
        action: "approve",
      }));
      setDrafts(list);
      toast.success(`${list.length} draft jadwal digenerate. Review & approve.`);
    } catch (e) { toast.error((e as Error).message); }
    finally { setGenBusy(false); }
  };

  const patchDraft = (id: string, patch: Partial<Draft>) => {
    setDrafts((p) => p.map((d) => (d.id === id ? { ...d, ...patch } : d)));
  };

  const approveAll = () => setDrafts((p) => p.map((d) => ({ ...d, action: "approve" })));

  const saveApproved = async () => {
    if (!activeId) return;
    const approved = drafts.filter((d) => d.action === "approve");
    if (approved.length === 0) { toast.error("Tidak ada draft yang di-approve."); return; }
    setSaveBusy(true);
    try {
      const now = Date.now();
      const items = approved.map((d, i) => ({
        idea: d.idea,
        caption: d.caption,
        day_label: d.day_label,
        slot_time: d.slot_time,
        platform: d.platform,
        thumbnail_url: d.thumbnail_url || null,
        status: "scheduled",
        scheduled_for: new Date(now + (i + 1) * 3600_000).toISOString(),
        payload: { source: "ai-schedule" },
      }));
      await _saveQueue({ data: { characterId: activeId, items } });
      toast.success(`${approved.length} jadwal tersimpan ke queue.`);
      setDrafts([]);
    } catch (e) { toast.error((e as Error).message); }
    finally { setSaveBusy(false); }
  };

  return (
    <DashboardShell>
      <PageHero
        eyebrow="Module · Auto Publisher"
        title="Auto"
        highlight="Publisher"
        desc="Hubungkan sosial media, generate jadwal via AI, review & approve — approved items tersimpan permanen di queue."
      />

      {!activeId && (
        <Card>
          <div className="text-sm text-muted-foreground">
            Pilih karakter di menu <b>Character</b> untuk mengatur publisher.
          </div>
        </Card>
      )}

      <Card
        title="Connected Accounts"
        sub="OAuth resmi ke TikTok/IG/Meta butuh review platform — sementara gunakan handle + webhook/access token (bisa via Zapier / Make)."
      >
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {PUBLISH_PLATFORMS.map((p) => {
            const connected = accounts.filter((a) => a.platform === p.key);
            return (
              <div key={p.key} className="rounded-xl border border-border bg-card/40 p-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Send className="h-4 w-4 text-primary" />
                    {p.label}
                  </div>
                  <GhostButton className="!px-3 !py-1.5 text-xs" onClick={() => openConnect(p.key)}>
                    <Plus className="h-3 w-3" /> Connect
                  </GhostButton>
                </div>
                {connected.length === 0 ? (
                  <div className="text-[11px] text-muted-foreground">Belum ada akun terhubung.</div>
                ) : (
                  <ul className="space-y-1.5">
                    {connected.map((a) => (
                      <li key={a.id} className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2 min-w-0">
                          <Chip tone={a.status === "connected" ? "success" : "warn"}>{a.status}</Chip>
                          <span className="truncate">@{a.handle}</span>
                        </div>
                        <button
                          onClick={() => doDisconnect(a)}
                          className="text-muted-foreground hover:text-rose-300"
                          title="Disconnect"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      </Card>

      <Card
        title="AI Auto-Schedule"
        sub="AI baca Strategy + akun terhubung → susun draft jadwal → kamu approve / edit / skip → save ke queue."
        right={
          <div className="flex gap-2">
            <PrimaryButton onClick={generateAiSchedule} disabled={!activeId || genBusy || accounts.length === 0}>
              {genBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
              Generate Jadwal AI
            </PrimaryButton>
          </div>
        }
      >
        {drafts.length === 0 ? (
          <div className="text-xs text-muted-foreground">
            Belum ada draft. Klik <b>Generate Jadwal AI</b> untuk mulai.
          </div>
        ) : (
          <>
            <div className="mb-3 flex gap-2 flex-wrap">
              <GhostButton onClick={approveAll}><Check className="h-4 w-4" /> Approve semua</GhostButton>
              <PrimaryButton onClick={saveApproved} disabled={saveBusy}>
                {saveBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Save schedule
              </PrimaryButton>
            </div>
            <div className="space-y-2">
              {drafts.map((d) => (
                <div
                  key={d.id}
                  className={[
                    "rounded-xl border p-3 text-xs",
                    d.action === "skip" ? "border-border/40 bg-card/20 opacity-50" : "border-border bg-card/40",
                  ].join(" ")}
                >
                  <div className="grid gap-2 md:grid-cols-4 items-center">
                    <div>
                      <div className="text-[10px] uppercase text-muted-foreground">Day / Time</div>
                      <div className="flex gap-1 mt-1">
                        <Select
                          value={d.day_label}
                          onChange={(e) => patchDraft(d.id, { day_label: e.target.value })}
                          options={DAYS.map((x) => ({ value: x, label: x }))}
                          className="!py-1"
                        />
                        <Select
                          value={d.slot_time}
                          onChange={(e) => patchDraft(d.id, { slot_time: e.target.value })}
                          options={DEFAULT_SLOTS.map((x) => ({ value: x, label: x }))}
                          className="!py-1"
                        />
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase text-muted-foreground">Platform</div>
                      <Select
                        value={d.platform}
                        onChange={(e) => patchDraft(d.id, { platform: e.target.value })}
                        options={PUBLISH_PLATFORMS.map((p) => ({ value: p.key, label: p.label }))}
                        className="!py-1 mt-1"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <div className="text-[10px] uppercase text-muted-foreground">Idea / Caption</div>
                      <Input
                        value={d.idea}
                        onChange={(e) => patchDraft(d.id, { idea: e.target.value })}
                        className="!py-1 mt-1"
                      />
                      <Input
                        value={d.caption}
                        onChange={(e) => patchDraft(d.id, { caption: e.target.value })}
                        className="!py-1 mt-1"
                        placeholder="Caption"
                      />
                    </div>
                  </div>
                  <div className="mt-2 flex gap-1.5 justify-end">
                    <button
                      onClick={() => patchDraft(d.id, { action: "approve" })}
                      className={[
                        "px-2 py-1 rounded-full text-[10px] border transition inline-flex items-center gap-1",
                        d.action === "approve" ? "border-transparent text-primary-foreground glow-pink" : "border-border bg-card/50",
                      ].join(" ")}
                      style={d.action === "approve" ? { background: "var(--gradient-neon)" } : undefined}
                    >
                      <Check className="h-3 w-3" /> Approve
                    </button>
                    <button
                      onClick={() => patchDraft(d.id, { action: "skip" })}
                      className={[
                        "px-2 py-1 rounded-full text-[10px] border transition inline-flex items-center gap-1",
                        d.action === "skip" ? "border-rose-500/60 text-rose-200 bg-rose-500/10" : "border-border bg-card/50",
                      ].join(" ")}
                    >
                      <X className="h-3 w-3" /> Skip
                    </button>
                    <span className="text-muted-foreground inline-flex items-center gap-1 text-[10px]">
                      <Edit3 className="h-3 w-3" /> Editable
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </Card>

      <Card title="Manual Schedule (fallback)" sub="Isi manual jika tidak ingin pakai AI auto.">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Tanggal"><Input type="date" /></Field>
          <Field label="Jam"><Input type="time" /></Field>
          <Field label="Platform">
            <Select options={[{ value: "", label: "— pilih —" }, ...PUBLISH_PLATFORMS.map((p) => ({ value: p.key, label: p.label }))]} />
          </Field>
          <Field label="Caption"><Input placeholder="Caption" /></Field>
        </div>
        <div className="mt-3">
          <GhostButton disabled>
            <Sparkles className="h-4 w-4" /> Save manual (gunakan Planner untuk saat ini)
          </GhostButton>
        </div>
      </Card>

      {/* Connect dialog */}
      <Dialog open={!!connectOpen} onOpenChange={(v) => !v && setConnectOpen(null)}>
        <DialogContent className="border-border/60 bg-[oklch(0.17_0.05_275)]/95 backdrop-blur-xl neumorph !max-w-md p-0 overflow-hidden">
          {connectOpen && (
            <div className="p-6">
              <DialogHeader className="mb-4">
                <div className="flex items-start gap-3">
                  <div
                    className="h-10 w-10 shrink-0 rounded-2xl grid place-items-center text-primary-foreground glow-pink"
                    style={{ background: "var(--gradient-neon)" }}
                  >
                    <Send className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <DialogTitle className="font-display text-lg text-foreground text-left capitalize">
                      Connect {connectOpen}
                    </DialogTitle>
                    <DialogDescription className="text-xs text-muted-foreground mt-1 text-left">
                      Simpan handle + access token / webhook. OAuth resmi butuh review platform — sementara pakai integrasi via Zapier / Make.
                    </DialogDescription>
                  </div>
                </div>
              </DialogHeader>
              <div className="space-y-3">
                <Field label="Handle (username)">
                  <Input
                    autoFocus
                    value={connectForm.handle}
                    onChange={(e) => setConnectForm((p) => ({ ...p, handle: e.target.value }))}
                    placeholder="mis. @aria.nakamura"
                  />
                </Field>
                <Field label="Webhook URL (optional)" hint="URL dari Zapier / Make yang akan menerima payload post.">
                  <Input
                    value={connectForm.webhook}
                    onChange={(e) => setConnectForm((p) => ({ ...p, webhook: e.target.value }))}
                    placeholder="https://hooks.zapier.com/…"
                  />
                </Field>
                <Field label="Access Token (optional)" hint="Untuk integrasi via API resmi (bila tersedia).">
                  <Input
                    value={connectForm.token}
                    onChange={(e) => setConnectForm((p) => ({ ...p, token: e.target.value }))}
                    placeholder="paste token…"
                  />
                </Field>
              </div>
              <div className="mt-5 flex justify-end gap-2">
                <GhostButton onClick={() => setConnectOpen(null)}>Batal</GhostButton>
                <PrimaryButton onClick={submitConnect}>Connect</PrimaryButton>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </DashboardShell>
  );
}
