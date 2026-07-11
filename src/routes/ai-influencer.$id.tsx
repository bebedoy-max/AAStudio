import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Sparkles,
  User,
  Palette,
  Link2,
  Compass,
  Layers,
  CalendarDays,
  Wand2,
  Image as ImageIcon,
  Trash2,
  Loader2,
  Send,
  BookOpen,
} from "lucide-react";
import { DashboardShell, PageHero } from "@/components/dashboard/shell";
import {
  Card,
  Field,
  Input,
  Select,
  Textarea,
  PrimaryButton,
  GhostButton,
  GalleryEmpty,
} from "@/components/dashboard/ui";
import { Chip } from "@/components/dashboard/os/section";
import {
  getCharacter,
  updateCharacter,
  getPersonality,
  savePersonality,
  listReferences,
  addReference,
  removeReference,
  listScenarios,
  createScenario,
  deleteScenario,
  listAssets,
  listMemory,
  saveAsset,
  type Character,
  type Scenario,
  type Asset,
  type Reference,
  type MemoryRow,
} from "@/lib/ai-influencer/service";
import {
  DEFAULT_OUTPUT,
  DEFAULT_PERSONALITY,
  OUTPUT_LABELS,
  PERSONALITY_DIMS,
  SCENES,
  CONTENT_STRATEGIES,
  type OutputConfig,
  type PersonalitySliders,
} from "@/lib/ai-influencer/scenes";
import { generateScenario, generateStrategy } from "@/lib/ai-influencer/brain";
import { setHandoff, WORKFLOW_ROUTES } from "@/lib/creative/handoff";

export const Route = createFileRoute("/ai-influencer/$id")({
  component: WorkspacePage,
});

type TabKey =
  | "overview"
  | "personality"
  | "reference"
  | "scenario"
  | "output"
  | "strategy"
  | "schedule"
  | "assets"
  | "memory";

const TABS: { key: TabKey; label: string; icon: typeof User }[] = [
  { key: "overview", label: "Overview", icon: User },
  { key: "personality", label: "Personality", icon: Palette },
  { key: "reference", label: "Reference", icon: Link2 },
  { key: "scenario", label: "Scenario", icon: Compass },
  { key: "output", label: "Content Output", icon: Layers },
  { key: "strategy", label: "Strategy", icon: BookOpen },
  { key: "schedule", label: "Calendar", icon: CalendarDays },
  { key: "assets", label: "Assets", icon: ImageIcon },
  { key: "memory", label: "Memory", icon: Wand2 },
];

function WorkspacePage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const [tab, setTab] = useState<TabKey>("overview");
  const [character, setCharacter] = useState<Character | null>(null);
  const [personality, setPersonality] = useState<PersonalitySliders>(DEFAULT_PERSONALITY);
  const [output, setOutput] = useState<OutputConfig>(DEFAULT_OUTPUT);
  const [references, setReferences] = useState<Reference[]>([]);
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [memory, setMemory] = useState<MemoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = async () => {
    try {
      const [c, p, r, s, a, m] = await Promise.all([
        getCharacter(id),
        getPersonality(id),
        listReferences(id),
        listScenarios(id),
        listAssets(id),
        listMemory(id),
      ]);
      if (!c) throw new Error("Karakter tidak ditemukan");
      setCharacter(c);
      setPersonality(p);
      setReferences(r);
      setScenarios(s);
      setAssets(a);
      setMemory(m);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (loading) {
    return (
      <DashboardShell>
        <Card>
          <div className="text-sm text-muted-foreground flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" /> Memuat workspace…
          </div>
        </Card>
      </DashboardShell>
    );
  }
  if (err || !character) {
    return (
      <DashboardShell>
        <Card>
          <div className="text-sm text-rose-300">{err || "Karakter tidak ditemukan"}</div>
          <div className="mt-3">
            <GhostButton onClick={() => navigate({ to: "/ai-influencer" })}>
              <ArrowLeft className="h-4 w-4" /> Kembali
            </GhostButton>
          </div>
        </Card>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell>
      <PageHero
        eyebrow="Persona Workspace"
        title={character.name}
        highlight="Studio"
        desc={`${character.niche || "—"} · ${character.style || "—"} · ${character.language || ""}`}
        action={
          <div className="flex items-center gap-2">
            <Link to="/ai-influencer">
              <GhostButton>
                <ArrowLeft className="h-4 w-4" /> Library
              </GhostButton>
            </Link>
          </div>
        }
      />

      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={[
                "inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-medium transition",
                active
                  ? "text-primary-foreground glow-pink"
                  : "border border-border bg-card/50 text-foreground/80 hover:text-foreground",
              ].join(" ")}
              style={active ? { background: "var(--gradient-neon)" } : undefined}
            >
              <Icon className="h-3.5 w-3.5" />
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === "overview" && (
        <OverviewTab character={character} onChange={setCharacter} onSaved={load} />
      )}
      {tab === "personality" && (
        <PersonalityTab
          characterId={character.id}
          values={personality}
          onChange={setPersonality}
        />
      )}
      {tab === "reference" && (
        <ReferenceTab characterId={character.id} refs={references} reload={load} />
      )}
      {tab === "scenario" && (
        <ScenarioTab
          character={character}
          personality={personality}
          output={output}
          onOutputChange={setOutput}
          scenarios={scenarios}
          memory={memory}
          reload={load}
        />
      )}
      {tab === "output" && <OutputTab value={output} onChange={setOutput} />}
      {tab === "strategy" && (
        <StrategyTab character={character} personality={personality} />
      )}
      {tab === "schedule" && <ScheduleTab />}
      {tab === "assets" && <AssetsTab assets={assets} />}
      {tab === "memory" && <MemoryTab memory={memory} />}
    </DashboardShell>
  );
}

// ---------- Overview ----------
function OverviewTab({
  character,
  onChange,
  onSaved,
}: {
  character: Character;
  onChange: (c: Character) => void;
  onSaved: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const save = async () => {
    setSaving(true);
    setMsg(null);
    try {
      await updateCharacter(character.id, {
        name: character.name,
        niche: character.niche,
        style: character.style,
        description: character.description,
        negative_prompt: character.negative_prompt,
        personality_text: character.personality_text,
        background_story: character.background_story,
        fashion_style: character.fashion_style,
        hair_style: character.hair_style,
        avatar_url: character.avatar_url,
        status: character.status,
      });
      setMsg("Tersimpan");
      onSaved();
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const patch = <K extends keyof Character>(k: K, v: Character[K]) =>
    onChange({ ...character, [k]: v });

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card title="Identitas" sub="Info utama karakter">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Name">
            <Input value={character.name} onChange={(e) => patch("name", e.target.value)} />
          </Field>
          <Field label="Status">
            <Select
              value={character.status}
              onChange={(e) => patch("status", e.target.value)}
              options={[
                { value: "draft", label: "Draft" },
                { value: "active", label: "Active" },
                { value: "paused", label: "Paused" },
              ]}
            />
          </Field>
          <Field label="Niche">
            <Input value={character.niche || ""} onChange={(e) => patch("niche", e.target.value)} />
          </Field>
          <Field label="Style">
            <Input value={character.style || ""} onChange={(e) => patch("style", e.target.value)} />
          </Field>
          <Field label="Fashion Style">
            <Input
              value={character.fashion_style || ""}
              onChange={(e) => patch("fashion_style", e.target.value)}
            />
          </Field>
          <Field label="Hair Style">
            <Input
              value={character.hair_style || ""}
              onChange={(e) => patch("hair_style", e.target.value)}
            />
          </Field>
          <Field label="Avatar URL">
            <Input
              value={character.avatar_url || ""}
              onChange={(e) => patch("avatar_url", e.target.value)}
              placeholder="https://..."
            />
          </Field>
        </div>
      </Card>

      <Card title="Prompt Guidance" sub="Deskripsi & negative prompt untuk generator">
        <div className="grid gap-3">
          <Field label="Personality">
            <Textarea
              value={character.personality_text || ""}
              onChange={(e) => patch("personality_text", e.target.value)}
            />
          </Field>
          <Field label="Background Story">
            <Textarea
              value={character.background_story || ""}
              onChange={(e) => patch("background_story", e.target.value)}
            />
          </Field>
          <Field label="Description">
            <Textarea
              value={character.description || ""}
              onChange={(e) => patch("description", e.target.value)}
            />
          </Field>
          <Field label="Negative Prompt">
            <Textarea
              value={character.negative_prompt || ""}
              onChange={(e) => patch("negative_prompt", e.target.value)}
            />
          </Field>
        </div>
      </Card>

      <div className="lg:col-span-2 flex items-center justify-end gap-3">
        {msg && <div className="text-xs text-muted-foreground">{msg}</div>}
        <PrimaryButton onClick={save} disabled={saving}>
          {saving ? "Menyimpan…" : "Simpan Perubahan"}
        </PrimaryButton>
      </div>
    </div>
  );
}

// ---------- Personality ----------
function PersonalityTab({
  characterId,
  values,
  onChange,
}: {
  characterId: string;
  values: PersonalitySliders;
  onChange: (v: PersonalitySliders) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const set = (k: keyof PersonalitySliders, v: number) => onChange({ ...values, [k]: v });

  const save = async () => {
    setSaving(true);
    setMsg(null);
    try {
      await savePersonality(characterId, values);
      setMsg("Personality tersimpan");
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card title="Personality Engine" sub="Slider 0–100. Nilai ini dipakai AI ketika menulis prompt, caption, dan scenario.">
      <div className="grid gap-4 sm:grid-cols-2">
        {PERSONALITY_DIMS.map((d) => (
          <div key={d.key} className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-mono uppercase tracking-widest text-muted-foreground">
                {d.label}
              </span>
              <span className="text-foreground font-medium">{values[d.key]}</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={values[d.key]}
              onChange={(e) => set(d.key, Number(e.target.value))}
              className="w-full accent-primary"
            />
          </div>
        ))}
      </div>
      <div className="mt-5 flex items-center justify-end gap-3">
        {msg && <div className="text-xs text-muted-foreground">{msg}</div>}
        <PrimaryButton onClick={save} disabled={saving}>
          {saving ? "Menyimpan…" : "Simpan Personality"}
        </PrimaryButton>
      </div>
    </Card>
  );
}

// ---------- Reference ----------
function ReferenceTab({
  characterId,
  refs,
  reload,
}: {
  characterId: string;
  refs: Reference[];
  reload: () => void;
}) {
  const [platform, setPlatform] = useState("instagram");
  const [url, setUrl] = useState("");
  const [saving, setSaving] = useState(false);

  const add = async () => {
    if (!url.trim()) return;
    setSaving(true);
    try {
      await addReference(characterId, platform, url.trim());
      setUrl("");
      reload();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="lg:col-span-1">
        <Card title="Tambah Referensi" sub="URL disimpan sebagai style guidance — bukan untuk cloning.">
          <div className="grid gap-3">
            <Field label="Platform">
              <Select
                value={platform}
                onChange={(e) => setPlatform(e.target.value)}
                options={[
                  { value: "instagram", label: "Instagram" },
                  { value: "tiktok", label: "TikTok" },
                  { value: "youtube", label: "YouTube" },
                  { value: "pinterest", label: "Pinterest" },
                  { value: "website", label: "Website" },
                ]}
              />
            </Field>
            <Field label="URL">
              <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://..." />
            </Field>
            <PrimaryButton onClick={add} disabled={saving || !url.trim()}>
              {saving ? "Menyimpan…" : "Tambah Referensi"}
            </PrimaryButton>
            <div className="text-[11px] text-muted-foreground">
              AI menganalisis: content style · color tone · caption style · posting pattern · pose ·
              camera angle · outfit · editing · lifestyle · visual theme. Analisis mendalam
              (auto-parse) hadir di Phase 2.
            </div>
          </div>
        </Card>
      </div>
      <div className="lg:col-span-2">
        <Card title="Daftar Referensi" sub={`${refs.length} reference tersimpan`}>
          {refs.length === 0 ? (
            <div className="text-sm text-muted-foreground">Belum ada referensi.</div>
          ) : (
            <ul className="divide-y divide-border/50">
              {refs.map((r) => (
                <li key={r.id} className="flex items-center gap-3 py-3">
                  <Chip>{r.platform}</Chip>
                  <a
                    href={r.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm truncate hover:text-primary flex-1"
                  >
                    {r.url}
                  </a>
                  <button
                    className="text-muted-foreground hover:text-rose-300"
                    onClick={async () => {
                      await removeReference(r.id);
                      reload();
                    }}
                    title="Hapus"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

// ---------- Scenario Generator ----------
function ScenarioTab({
  character,
  personality,
  output,
  onOutputChange,
  scenarios,
  memory,
  reload,
}: {
  character: Character;
  personality: PersonalitySliders;
  output: OutputConfig;
  onOutputChange: (o: OutputConfig) => void;
  scenarios: Scenario[];
  memory: MemoryRow[];
  reload: () => void;
}) {
  const [sceneKey, setSceneKey] = useState<string>("cafe");
  const [extra, setExtra] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ prompt: string; caption: string } | null>(null);

  const scene = useMemo(() => SCENES.find((s) => s.key === sceneKey) || SCENES[0], [sceneKey]);

  const generate = async () => {
    setBusy(true);
    setErr(null);
    setPreview(null);
    try {
      const r = await generateScenario(
        character,
        personality,
        `${scene.label} — ${scene.hint}`,
        memory.map((m) => ({ scene_key: m.scene_key, count: m.count })),
        extra || undefined,
      );
      setPreview({ prompt: r.prompt, caption: r.caption });
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const commit = async () => {
    if (!preview) return;
    setBusy(true);
    try {
      const scenario = await createScenario(
        character.id,
        scene.label,
        preview.prompt,
        preview.caption,
        output as unknown as Record<string, boolean>,
      );
      // simpan asset yang dipilih user (prompt / caption)
      if (output.prompt_only || output.image) {
        await saveAsset(character.id, "prompt", {
          content: preview.prompt,
          scenario_id: scenario.id,
        });
      }
      if (output.caption) {
        await saveAsset(character.id, "caption", {
          content: preview.caption,
          scenario_id: scenario.id,
        });
      }
      setPreview(null);
      setExtra("");
      reload();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const sendTo = (workflow: keyof typeof WORKFLOW_ROUTES) => {
    if (!preview) return;
    setHandoff({
      workflow,
      title: `${character.name} · ${scene.label}`,
      hook: preview.caption.slice(0, 120),
      description: preview.prompt,
      keyword: scene.label,
      tone: character.style || "",
    });
    window.location.href = WORKFLOW_ROUTES[workflow];
  };

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="lg:col-span-1">
        <Card title="Scenario" sub="Pilih scene → AI generate prompt + caption sesuai persona">
          <div className="grid gap-3">
            <Field label="Scene">
              <Select
                value={sceneKey}
                onChange={(e) => setSceneKey(e.target.value)}
                options={SCENES.map((s) => ({ value: s.key, label: s.label }))}
              />
            </Field>
            <Field label="Extra direction (opsional)">
              <Textarea
                value={extra}
                onChange={(e) => setExtra(e.target.value)}
                placeholder="mis: golden hour, tone hangat, membawa iced latte"
                rows={3}
              />
            </Field>
            <PrimaryButton onClick={generate} disabled={busy}>
              {busy ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> AI berpikir…
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" /> Generate Scenario
                </>
              )}
            </PrimaryButton>
            {err && <div className="text-xs text-rose-300">{err}</div>}
            <div className="text-[11px] text-muted-foreground">
              Router: <b>OpenAI → Gemini</b> (fallback otomatis via /api/router/chat).
            </div>
          </div>
        </Card>
      </div>

      <div className="lg:col-span-2">
        <Card title="Preview" sub="Modular — pilih output di tab Content Output atau langsung kirim ke workflow.">
          {!preview ? (
            <div className="text-sm text-muted-foreground">
              Klik <b>Generate Scenario</b> untuk melihat prompt + caption. Hasil belum tersimpan
              sampai Anda menekan <b>Simpan Scenario</b> atau <b>Kirim ke workflow</b>.
            </div>
          ) : (
            <div className="grid gap-4">
              <div>
                <div className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground mb-1">
                  Prompt
                </div>
                <Textarea
                  value={preview.prompt}
                  onChange={(e) => setPreview({ ...preview, prompt: e.target.value })}
                  rows={5}
                />
              </div>
              <div>
                <div className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground mb-1">
                  Caption
                </div>
                <Textarea
                  value={preview.caption}
                  onChange={(e) => setPreview({ ...preview, caption: e.target.value })}
                  rows={5}
                />
              </div>

              <OutputChecklist value={output} onChange={onOutputChange} />

              <div className="flex flex-wrap gap-2 justify-end">
                <GhostButton onClick={() => setPreview(null)}>Batal</GhostButton>
                <PrimaryButton onClick={commit} disabled={busy}>
                  <Send className="h-4 w-4" /> Simpan Scenario
                </PrimaryButton>
                {output.motion && (
                  <GhostButton onClick={() => sendTo("motion")}>Kirim ke Motion Control</GhostButton>
                )}
                {output.storyboard && (
                  <GhostButton onClick={() => sendTo("storyboard")}>Kirim ke Storyboard</GhostButton>
                )}
                {output.full_narrative && (
                  <GhostButton onClick={() => sendTo("narrative-video")}>
                    Kirim ke Naratif Video
                  </GhostButton>
                )}
              </div>
            </div>
          )}
        </Card>

        <div className="mt-4">
          <Card title="Scenario Tersimpan" sub={`${scenarios.length} scenario`}>
            {scenarios.length === 0 ? (
              <GalleryEmpty label="Belum ada scenario tersimpan" />
            ) : (
              <ul className="divide-y divide-border/50">
                {scenarios.map((s) => (
                  <li key={s.id} className="py-3 flex items-start gap-3">
                    <Chip tone="primary">{s.scene}</Chip>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm truncate">{s.caption || s.prompt}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {new Date(s.created_at).toLocaleString()}
                      </div>
                    </div>
                    <button
                      className="text-muted-foreground hover:text-rose-300"
                      onClick={async () => {
                        await deleteScenario(s.id);
                        reload();
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

// ---------- Output Config ----------
function OutputChecklist({
  value,
  onChange,
}: {
  value: OutputConfig;
  onChange: (v: OutputConfig) => void;
}) {
  const toggle = (k: keyof OutputConfig) => onChange({ ...value, [k]: !value[k] });
  return (
    <div>
      <div className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground mb-2">
        Content Output
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {OUTPUT_LABELS.map((o) => (
          <label
            key={o.key}
            className="flex items-start gap-2 rounded-xl border border-border bg-card/40 p-3 cursor-pointer hover:border-primary/50 transition"
          >
            <input
              type="checkbox"
              checked={value[o.key]}
              onChange={() => toggle(o.key)}
              className="mt-1 accent-primary"
            />
            <div>
              <div className="text-sm font-medium">{o.label}</div>
              <div className="text-[11px] text-muted-foreground">{o.desc}</div>
            </div>
          </label>
        ))}
      </div>
      <div className="text-[11px] text-muted-foreground mt-2">
        Workflow bersifat modular — jika Anda hanya centang <b>Image</b>, prosesnya berhenti setelah
        generate image. Tidak ada pemaksaan ke video.
      </div>
    </div>
  );
}

function OutputTab({ value, onChange }: { value: OutputConfig; onChange: (v: OutputConfig) => void }) {
  return (
    <Card title="Content Output" sub="Preset default untuk semua scenario yang Anda generate di tab Scenario.">
      <OutputChecklist value={value} onChange={onChange} />
    </Card>
  );
}

// ---------- Strategy ----------
function StrategyTab({
  character,
  personality,
}: {
  character: Character;
  personality: PersonalitySliders;
}) {
  const [goals, setGoals] = useState<string[]>(["lifestyle", "affiliate"]);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string>("");
  const [err, setErr] = useState<string | null>(null);

  const toggle = (k: string) =>
    setGoals((g) => (g.includes(k) ? g.filter((x) => x !== k) : [...g, k]));

  const run = async () => {
    setBusy(true);
    setErr(null);
    try {
      const text = await generateStrategy(character, personality, goals);
      setResult(text);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card
      title="Content Strategy"
      sub="AI menyusun komposisi konten mingguan dengan komposisi yang natural."
    >
      <div className="flex flex-wrap gap-2 mb-4">
        {CONTENT_STRATEGIES.map((c) => (
          <button
            key={c.key}
            onClick={() => toggle(c.key)}
            className={[
              "px-3 py-1.5 rounded-full text-xs border transition",
              goals.includes(c.key)
                ? "text-primary-foreground border-transparent glow-pink"
                : "border-border bg-card/50 text-foreground/80 hover:text-foreground",
            ].join(" ")}
            style={goals.includes(c.key) ? { background: "var(--gradient-neon)" } : undefined}
            title={c.desc}
          >
            {c.label}
          </button>
        ))}
      </div>
      <div className="flex justify-end mb-3">
        <PrimaryButton onClick={run} disabled={busy}>
          {busy ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Menyusun…
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4" /> Susun Strategy
            </>
          )}
        </PrimaryButton>
      </div>
      {err && <div className="text-xs text-rose-300 mb-2">{err}</div>}
      {result ? (
        <pre className="whitespace-pre-wrap text-sm bg-card/40 rounded-xl p-4 border border-border">
          {result}
        </pre>
      ) : (
        <div className="text-sm text-muted-foreground">
          Belum ada strategi. Pilih goal lalu klik <b>Susun Strategy</b>.
        </div>
      )}
    </Card>
  );
}

// ---------- Schedule (Phase 1: template statis, Phase 2: AI planner) ----------
function ScheduleTab() {
  const DEFAULT = [
    { day: "Monday", type: "OOTD" },
    { day: "Tuesday", type: "Coffee / Lifestyle" },
    { day: "Wednesday", type: "Gym / Wellness" },
    { day: "Thursday", type: "Travel / Explore" },
    { day: "Friday", type: "Affiliate / Review" },
    { day: "Saturday", type: "Lifestyle" },
    { day: "Sunday", type: "Relax / Reflection" },
  ];
  return (
    <Card
      title="Posting Schedule"
      sub="Template default. AI Content Calendar aktif di Phase 2 — akan menghubungkan strategy → scenario → asset."
    >
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {DEFAULT.map((d) => (
          <div key={d.day} className="rounded-xl border border-border bg-card/40 p-4">
            <div className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground">
              {d.day}
            </div>
            <div className="mt-1 font-display text-base">{d.type}</div>
          </div>
        ))}
      </div>
    </Card>
  );
}

// ---------- Assets ----------
function AssetsTab({ assets }: { assets: Asset[] }) {
  if (assets.length === 0) return <GalleryEmpty label="Asset Manager kosong" />;
  return (
    <Card title="Asset Manager" sub={`${assets.length} asset tersimpan`}>
      <ul className="divide-y divide-border/50">
        {assets.map((a) => (
          <li key={a.id} className="py-3 flex items-start gap-3">
            <Chip tone="primary">{a.type}</Chip>
            <div className="flex-1 min-w-0">
              {a.url ? (
                <a
                  href={a.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm hover:text-primary truncate block"
                >
                  {a.url}
                </a>
              ) : (
                <div className="text-sm truncate">{a.content}</div>
              )}
              <div className="text-[11px] text-muted-foreground">
                {new Date(a.created_at).toLocaleString()}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

// ---------- Memory ----------
function MemoryTab({ memory }: { memory: MemoryRow[] }) {
  const usedKeys = new Set(memory.map((m) => m.scene_key.toLowerCase()));
  const unused = SCENES.filter((s) => !usedKeys.has(s.label.toLowerCase()));
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card title="Sudah Pernah Dibuat" sub="AI menghindari scene yang terlalu berulang">
        {memory.length === 0 ? (
          <div className="text-sm text-muted-foreground">Belum ada history scenario.</div>
        ) : (
          <ul className="divide-y divide-border/50">
            {memory.map((m) => (
              <li key={m.id} className="py-2 flex items-center justify-between">
                <span className="text-sm">{m.scene_key}</span>
                <Chip tone={m.count >= 4 ? "warn" : "default"}>{m.count}x</Chip>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card title="Belum Pernah Dicoba" sub="Ide segar untuk variasi konten">
        <div className="flex flex-wrap gap-2">
          {unused.map((s) => (
            <Chip key={s.key}>{s.label}</Chip>
          ))}
        </div>
      </Card>
    </div>
  );
}
