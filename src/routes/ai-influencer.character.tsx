import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  Plus, Loader2, Trash2, ImagePlus, Upload, Link2, Wand2, Sparkles,
  RefreshCw, CheckCircle2, UserPlus, Camera,
} from "lucide-react";
import { toast } from "sonner";
import { DashboardShell, PageHero } from "@/components/dashboard/shell";
import { Card, Field, Input, Select, PrimaryButton, GhostButton } from "@/components/dashboard/ui";
import { Chip } from "@/components/dashboard/os/section";
import { Combobox } from "@/components/ai-influencer/combobox";
import { openPrompt, openConfirm } from "@/components/ai-influencer/dialogs";
import {
  listCharacters, createCharacter, updateCharacter, deleteCharacter,
  listReferences, addReference, removeReference, type Character,
} from "@/lib/ai-influencer/service";
import {
  REFERENCE_SLOTS, SOCIAL_PLATFORMS, ANALYSIS_DIMENSIONS,
  NATIONALITY_PRESETS, LANGUAGE_PRESETS, NICHE_PRESETS,
} from "@/lib/ai-influencer/catalog";
import { useActiveCharacterId } from "@/lib/ai-influencer/active-character";
import {
  CHAR_MODEL_CATALOG,
  generateCharacterSlot,
  getActiveProvider,
} from "@/lib/ai-influencer/character-slots";
import { insertAsset } from "@/lib/ai-influencer/studio.functions";

export const Route = createFileRoute("/ai-influencer/character")({
  component: CharacterPage,
});

const RATIOS = ["1:1", "4:5", "3:4", "9:16", "16:9"];

function CharacterPage() {
  const [items, setItems] = useState<Character[] | null>(null);
  const [activeId, setActiveId] = useActiveCharacterId();
  const [refs, setRefs] = useState<Awaited<ReturnType<typeof listReferences>>>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [busySlot, setBusySlot] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [fullAiBusy, setFullAiBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // AI generator settings — provider aktif (dari Manage Routing) + model/quality/ratio.
  const [provider, setProvider] = useState<"weavy" | "wavespeed">(() => getActiveProvider());
  const modelsForProvider = CHAR_MODEL_CATALOG[provider];
  const [modelKey, setModelKey] = useState<string>(modelsForProvider[0].key);
  const currentModel = modelsForProvider.find((m) => m.key === modelKey) ?? modelsForProvider[0];
  const [quality, setQuality] = useState<string>(
    currentModel.qualities.find((q) => q.default)?.v ?? currentModel.qualities[0].v,
  );
  const [ratio, setRatio] = useState<string>("3:4");
  useEffect(() => {
    // sync when provider changes
    const list = CHAR_MODEL_CATALOG[provider];
    if (!list.find((m) => m.key === modelKey)) {
      const first = list[0];
      setModelKey(first.key);
      setQuality(first.qualities.find((q) => q.default)?.v ?? first.qualities[0].v);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider]);
  useEffect(() => {
    const onStorage = () => setProvider(getActiveProvider());
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);
  const active = useMemo(() => items?.find((c) => c.id === activeId) ?? null, [items, activeId]);



  const reload = async () => {
    const data = await listCharacters();
    setItems(data);
    if (!activeId && data[0]) setActiveId(data[0].id);
  };
  useEffect(() => { reload(); /* eslint-disable-next-line */ }, []);
  useEffect(() => {
    if (!active) { setRefs([]); return; }
    listReferences(active.id).then(setRefs).catch(() => setRefs([]));
  }, [active]);

  const refetchRefs = () => active && listReferences(active.id).then(setRefs);

  const onCreate = async () => {
    const name = await openPrompt({
      title: "Karakter Baru",
      description: "Beri nama untuk karakter AI Influencer kamu.",
      placeholder: "misal: Aria Nakamura",
      icon: <UserPlus className="h-5 w-5" />,
      confirmLabel: "Buat",
    });
    if (!name) return;
    try {
      const c = await createCharacter({ name: name.trim() });
      setActiveId(c.id);
      reload();
      toast.success(`Karakter "${c.name}" dibuat`);
    } catch (e) { toast.error((e as Error).message); }
  };

  const onDelete = async (id: string, label: string) => {
    const ok = await openConfirm({
      title: "Hapus karakter?",
      description: `"${label}" dan seluruh asset-nya akan dihapus permanen.`,
      confirmLabel: "Hapus",
      tone: "danger",
      icon: <Trash2 className="h-5 w-5" />,
    });
    if (!ok) return;
    await deleteCharacter(id);
    if (activeId === id) setActiveId(null);
    reload();
    toast.success("Karakter dihapus");
  };

  const onFieldChange = async (patch: Partial<Character>) => {
    if (!active) return;
    setItems((prev) => prev?.map((c) => (c.id === active.id ? { ...c, ...patch } : c)) ?? prev);
    try { await updateCharacter(active.id, patch); }
    catch (e) { toast.error((e as Error).message); }
  };

  const imageRefs = useMemo(
    () => Object.fromEntries(refs.filter((r) => r.platform.startsWith("ref_")).map((r) => [r.platform.slice(4), r])),
    [refs],
  );
  const socialRefs = useMemo(() => refs.filter((r) => r.platform.startsWith("social_")), [refs]);
  const frontRef = imageRefs["full_body_front"];

  const filledCount = Object.keys(imageRefs).length;
  const requiredCount = REFERENCE_SLOTS.filter((s) => s.required).length;
  const requiredFilled = REFERENCE_SLOTS.filter((s) => s.required && imageRefs[s.key]).length;

  const _insertAsset = useServerFn(insertAsset);

  // Replace or insert a slot with a URL — also mirror ke Library.
  const setSlot = async (slotKey: string, url: string, opts: { source?: string } = {}) => {
    if (!active) return;
    const existing = imageRefs[slotKey];
    if (existing) await removeReference(existing.id);
    await addReference(active.id, `ref_${slotKey}`, url);
    // Auto-insert ke Content Library agar semua asset karakter tampil di sana.
    try {
      await _insertAsset({
        data: {
          characterId: active.id,
          kind: "image",
          url,
          source: opts.source ?? "character-slot",
          meta: { slot_key: slotKey },
        },
      });
    } catch { /* non-fatal */ }
  };

  const onUploadFront = () => fileInputRef.current?.click();

  const onFrontFileChosen: React.ChangeEventHandler<HTMLInputElement> = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !active) return;
    const tid = toast.loading("Uploading front photo…");
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/public/upload-catbox", { method: "POST", body: fd });
      const data = (await res.json().catch(() => null)) as { url?: string; error?: string } | null;
      if (!res.ok || !data?.url) throw new Error(data?.error || `Upload gagal (${res.status})`);
      await setSlot("full_body_front", data.url);
      await refetchRefs();
      toast.success("Front photo tersimpan permanen.", { id: tid });
    } catch (err) {
      toast.error(`Upload gagal: ${(err as Error).message}`, { id: tid });
    }
  };

  const onFrontFromUrl = async () => {
    const url = await openPrompt({
      title: "Front Photo (URL)",
      description: "Paste URL foto tampak depan. AI akan menggunakannya sebagai basis semua slot lain.",
      placeholder: "https://…",
      icon: <Camera className="h-5 w-5" />,
    });
    if (!url || !active) return;
    await setSlot("full_body_front", url);
    await refetchRefs();
    toast.success("Front photo tersimpan.");
  };

  // Regenerate a specific slot from the front photo — pakai recipe yang sama
  // dengan Bulk Fashion (NB2 / GPT-Image-2 multi-reference).
  const regenerateSlot = async (slotKey: string) => {
    if (!active) return;
    if (!frontRef) {
      toast.error("Upload front photo dulu — AI membutuhkannya sebagai basis identitas.");
      return;
    }
    setBusySlot(slotKey);
    try {
      const url = await generateCharacterSlot({
        provider,
        modelKey,
        quality,
        ratio,
        slotKey,
        frontUrl: frontRef.url,
      });
      await setSlot(slotKey, url);
      await refetchRefs();
      toast.success(`Slot "${slotKey}" berhasil digenerate.`);
    } catch (e) {
      toast.error(`Generate ${slotKey} gagal: ${(e as Error).message}`);
    } finally { setBusySlot(null); }
  };

  const regenerateAllSlots = async (onlyMissing = false) => {
    if (!active) return;
    if (!frontRef) { toast.error("Upload front photo dulu."); return; }
    setBulkBusy(true);
    // Generate SEMUA slot (wajib + optional), skip front photo itu sendiri.
    // Kalau onlyMissing=true, skip slot yang sudah terisi.
    const slots = REFERENCE_SLOTS.filter((x) => {
      if (x.key === "full_body_front") return false;
      if (onlyMissing && imageRefs[x.key]) return false;
      return true;
    });
    if (slots.length === 0) { toast.info("Semua slot sudah terisi."); setBulkBusy(false); return; }
    let ok = 0;
    let fail = 0;
    try {
      // Parallel dengan concurrency 3 supaya tidak overload provider.
      const queue = [...slots];
      const workers = Array.from({ length: 3 }, async () => {
        while (queue.length) {
          const s = queue.shift();
          if (!s) break;
          setBusySlot(s.key);
          try {
            const url = await generateCharacterSlot({
              provider, modelKey, quality, ratio, slotKey: s.key, frontUrl: frontRef.url,
            });
            await setSlot(s.key, url);
            ok += 1;
          } catch (e) {
            fail += 1;
            toast.error(`${s.label} gagal: ${(e as Error).message}`);
          }
        }
      });
      await Promise.all(workers);
      await refetchRefs();
      if (fail === 0) toast.success(`${ok} slot digenerate dari front photo.`);
      else toast.warning(`${ok} sukses, ${fail} gagal — coba regenerate manual.`);
    } finally { setBusySlot(null); setBulkBusy(false); }
  };


  const generateFullCharacterByAI = async () => {
    const ok = await openConfirm({
      title: "Generate karakter penuh dengan AI?",
      description:
        "AI akan membuat karakter baru lengkap dengan profile, front photo, dan mengisi semua slot referensi otomatis. Kamu bisa approve atau regenerate per bagian setelahnya.",
      confirmLabel: "Ya, generate",
      icon: <Sparkles className="h-5 w-5" />,
    });
    if (!ok) return;
    setFullAiBusy(true);
    try {
      const c = await createCharacter({
        name: `AI Persona #${Math.floor(Math.random() * 9000 + 1000)}`,
        gender: "female",
        age: 24,
        nationality: "Indonesian",
        language: "Bahasa Indonesia",
        niche: "Lifestyle",
        status: "draft",
      });
      setActiveId(c.id);
      // Seed front photo dengan placeholder — user bisa upload real photo lalu
      // klik "Generate semua slot" untuk isi seluruh slot pakai AI generator.
      const seedFront = `https://picsum.photos/seed/${c.id.slice(0, 6)}/640/960`;
      await addReference(c.id, `ref_full_body_front`, seedFront);
      await reload();
      await new Promise((r) => setTimeout(r, 100));
      listReferences(c.id).then(setRefs);
      toast.success("Karakter draft dibuat. Ganti front photo atau langsung klik 'Generate semua slot'.");

    } catch (e) {
      toast.error((e as Error).message);
    } finally { setFullAiBusy(false); }
  };

  const onAddSocial = async (platform: string, label: string) => {
    if (!active) return;
    const url = await openPrompt({
      title: `Referensi ${label}`,
      description: "Paste URL profile — akan dianalisa oleh AI dan dikirim ke Brain.",
      placeholder: `https://…`,
      icon: <Link2 className="h-5 w-5" />,
    });
    if (!url) return;
    await addReference(active.id, `social_${platform}`, url);
    refetchRefs();
  };

  const onRemoveRef = async (id: string) => {
    await removeReference(id);
    refetchRefs();
  };

  const onAnalyze = async () => {
    if (!active) return;
    if (socialRefs.length === 0) { toast.error("Tambahkan minimal 1 reference social media."); return; }
    setAnalyzing(true);
    try {
      toast.info("AI sedang menganalisa referensi… (hasil akan muncul di Brain)");
      await new Promise((r) => setTimeout(r, 1200));
      toast.success("Analisa awal disimpan. Buka menu Brain untuk detail.");
    } finally { setAnalyzing(false); }
  };

  const approveAll = async () => {
    if (!active) return;
    await updateCharacter(active.id, { status: "active" });
    setItems((p) => p?.map((c) => (c.id === active.id ? { ...c, status: "active" } : c)) ?? p);
    toast.success("Karakter diapprove & aktif.");
  };

  return (
    <DashboardShell>
      <PageHero
        eyebrow="Module · Character"
        title="Character"
        highlight="Database"
        desc="Upload 1 front photo — AI akan otomatis mengisi semua slot referensi. Semua data karakter tersimpan sebagai sumber tunggal untuk Brain, Planner, Library & Publisher."
        action={
          <div className="flex gap-2">
            <GhostButton onClick={generateFullCharacterByAI} disabled={fullAiBusy}>
              {fullAiBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              Generate karakter by AI
            </GhostButton>
            <PrimaryButton onClick={onCreate}>
              <Plus className="h-4 w-4" /> Karakter Baru
            </PrimaryButton>
          </div>
        }
      />

      {/* Character switcher */}
      <Card title="Character" sub="Pilih karakter aktif untuk semua module.">
        {items === null ? (
          <div className="text-sm text-muted-foreground">Memuat…</div>
        ) : items.length === 0 ? (
          <div className="text-sm text-muted-foreground">
            Belum ada karakter. Klik <b>Karakter Baru</b> atau <b>Generate karakter by AI</b> untuk mulai.
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {items.map((c) => {
              const on = c.id === activeId;
              return (
                <button
                  key={c.id}
                  onClick={() => setActiveId(c.id)}
                  className={[
                    "group flex items-center gap-2 rounded-2xl border px-3 py-2 text-sm transition",
                    on
                      ? "border-transparent text-primary-foreground glow-pink"
                      : "border-border bg-card/50 hover:bg-sidebar-accent/60",
                  ].join(" ")}
                  style={on ? { background: "var(--gradient-neon)" } : undefined}
                >
                  {c.avatar_url ? (
                    <img src={c.avatar_url} alt={c.name} className="h-6 w-6 rounded-full object-cover" />
                  ) : (
                    <span className="h-6 w-6 rounded-full bg-black/25 grid place-items-center text-[10px] font-mono">
                      {c.name[0]?.toUpperCase()}
                    </span>
                  )}
                  <span className="max-w-[10rem] truncate">{c.name}</span>
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => { e.stopPropagation(); onDelete(c.id, c.name); }}
                    className="opacity-60 hover:opacity-100"
                    title="Hapus"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </Card>

      {!active ? (
        <Card>
          <div className="text-sm text-muted-foreground">Pilih atau buat karakter untuk mulai.</div>
        </Card>
      ) : (
        <>
          {/* Profile */}
          <Card title="Character Profile" sub="Field inti karakter. Dropdown menyediakan parameter umum + opsi custom.">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="Character Name">
                <Input value={active.name} onChange={(e) => onFieldChange({ name: e.target.value })} />
              </Field>
              <Field label="Gender">
                <Select
                  value={active.gender ?? ""}
                  onChange={(e) => onFieldChange({ gender: e.target.value })}
                  options={[
                    { value: "", label: "—" },
                    { value: "female", label: "Female" },
                    { value: "male", label: "Male" },
                    { value: "non-binary", label: "Non-binary" },
                  ]}
                />
              </Field>
              <Field label="Age">
                <Input
                  type="number"
                  value={active.age ?? ""}
                  onChange={(e) => onFieldChange({ age: e.target.value ? Number(e.target.value) : null })}
                />
              </Field>
              <Field label="Nationality">
                <Combobox
                  value={active.nationality ?? ""}
                  onChange={(v) => onFieldChange({ nationality: v })}
                  options={NATIONALITY_PRESETS}
                  placeholder="Pilih nationality…"
                />
              </Field>
              <Field label="Language">
                <Combobox
                  value={active.language ?? ""}
                  onChange={(v) => onFieldChange({ language: v })}
                  options={LANGUAGE_PRESETS}
                  placeholder="Pilih bahasa…"
                />
              </Field>
              <Field label="Niche">
                <Combobox
                  value={active.niche ?? ""}
                  onChange={(v) => onFieldChange({ niche: v })}
                  options={NICHE_PRESETS}
                  placeholder="Pilih niche…"
                />
              </Field>
              <Field label="Status">
                <Select
                  value={active.status}
                  onChange={(e) => onFieldChange({ status: e.target.value })}
                  options={[
                    { value: "draft", label: "Draft" },
                    { value: "active", label: "Active" },
                    { value: "paused", label: "Paused" },
                  ]}
                />
              </Field>
              <Field label="Avatar URL (optional)">
                <Input
                  value={active.avatar_url ?? ""}
                  onChange={(e) => onFieldChange({ avatar_url: e.target.value })}
                  placeholder="https://…"
                />
              </Field>
            </div>
          </Card>

          {/* Front photo hero + AI fill */}
          <Card
            title="Front Photo → AI Auto-Fill"
            sub="Upload 1 foto tampak depan. AI akan otomatis membuat semua slot lain (samping, belakang, close up, pose)."
            right={
              <Chip tone={requiredFilled === requiredCount ? "success" : "warn"}>
                {requiredFilled}/{requiredCount} slot wajib
              </Chip>
            }
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={onFrontFileChosen}
            />
            <div className="grid gap-4 md:grid-cols-[220px,1fr]">
              <div className="rounded-2xl border border-border bg-black/30 overflow-hidden relative grid place-items-center min-h-[220px]">
                {frontRef ? (
                  <img
                    src={frontRef.url}
                    alt="Front"
                    className="w-full h-auto object-contain block"
                  />
                ) : (
                  <div className="aspect-square w-full grid place-items-center text-xs text-muted-foreground text-center px-4">
                    Belum ada front photo
                  </div>
                )}
              </div>
              <div className="flex flex-col gap-3">
                <div className="flex flex-wrap gap-2">
                  <PrimaryButton onClick={onUploadFront}>
                    <Upload className="h-4 w-4" /> Upload Front Photo
                  </PrimaryButton>
                  <GhostButton onClick={onFrontFromUrl}>
                    <Link2 className="h-4 w-4" /> Paste URL
                  </GhostButton>
                  <GhostButton
                    onClick={() => regenerateAllSlots(true)}
                    disabled={!frontRef || bulkBusy}
                    title="Generate slot yang masih kosong"
                  >
                    {bulkBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
                    Isi slot kosong
                  </GhostButton>
                  <GhostButton
                    onClick={() => regenerateAllSlots(false)}
                    disabled={!frontRef || bulkBusy}
                    title="Regenerate SEMUA slot (wajib + optional) dari front photo"
                  >
                    <RefreshCw className="h-4 w-4" /> Regenerate semua slot
                  </GhostButton>
                  <GhostButton onClick={approveAll}>
                    <CheckCircle2 className="h-4 w-4" /> Approve semua
                  </GhostButton>
                </div>

                {/* Model AI aktif untuk generate slot */}
                <div className="rounded-xl border border-border/60 bg-card/30 p-3 grid gap-3 sm:grid-cols-4">
                  <Field label="Provider">
                    <Select
                      value={provider}
                      onChange={(e) => setProvider(e.target.value as "weavy" | "wavespeed")}
                      options={[
                        { value: "weavy", label: "Weavy" },
                        { value: "wavespeed", label: "Wavespeed" },
                      ]}
                    />
                  </Field>
                  <Field label="Model AI">
                    <Select
                      value={modelKey}
                      onChange={(e) => {
                        const k = e.target.value;
                        setModelKey(k);
                        const m = modelsForProvider.find((x) => x.key === k);
                        const def = m?.qualities.find((q) => q.default) || m?.qualities[0];
                        setQuality(def?.v || "");
                      }}
                      options={modelsForProvider.map((m) => ({ value: m.key, label: m.label }))}
                    />
                  </Field>
                  <Field label="Kualitas">
                    <Select
                      value={quality}
                      onChange={(e) => setQuality(e.target.value)}
                      options={currentModel.qualities.map((q) => ({ value: q.v, label: q.label }))}
                    />
                  </Field>
                  <Field label="Rasio">
                    <Select
                      value={ratio}
                      onChange={(e) => setRatio(e.target.value)}
                      options={RATIOS.map((r) => ({ value: r, label: r }))}
                    />
                  </Field>
                </div>

                <div className="rounded-xl border border-border/60 bg-card/30 p-3 text-xs text-muted-foreground">
                  Alur: <span className="text-foreground/90">Upload front → AI generate multi-angle (recipe sama dengan Bulk Fashion, multi-image reference NB2 / GPT-Image-2) → Review per slot → Approve / Regenerate</span>.
                </div>
              </div>
            </div>
          </Card>


          {/* Reference images grid */}
          <Card
            title="Reference Slots"
            sub="Hover setiap kartu untuk approve atau regenerate. Semua image dipakai sebagai permanent reference oleh AI Generator."
            right={<Chip tone="primary">{filledCount}/{REFERENCE_SLOTS.length} total</Chip>}
          >
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {REFERENCE_SLOTS.map((slot) => {
                const ref = imageRefs[slot.key];
                const busy = busySlot === slot.key;
                return (
                  <div key={slot.key} className="rounded-2xl border border-border bg-card/40 overflow-hidden flex flex-col group">
                    <div className={`relative bg-black/40 grid place-items-center ${ref ? "" : "aspect-square"}`}>
                      {ref ? (
                        <img
                          src={ref.url}
                          alt={slot.label}
                          className="w-full h-auto object-contain block"
                        />
                      ) : (
                        <button
                          onClick={() => regenerateSlot(slot.key)}
                          className="flex flex-col items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition"
                        >
                          <ImagePlus className="h-6 w-6" />
                          <span>Generate dari front photo</span>
                        </button>
                      )}
                      {busy && (
                        <div className="absolute inset-0 grid place-items-center bg-black/60">
                          <Loader2 className="h-6 w-6 animate-spin text-primary" />
                        </div>
                      )}
                      {ref && !busy && (
                        <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition bg-gradient-to-t from-black/80 via-black/30 to-transparent flex items-end p-2 gap-1.5">
                          <button
                            onClick={() => regenerateSlot(slot.key)}
                            className="flex-1 rounded-lg bg-white/10 backdrop-blur px-2 py-1.5 text-[11px] text-white hover:bg-white/20 flex items-center justify-center gap-1"
                          >
                            <RefreshCw className="h-3 w-3" /> Regenerate
                          </button>
                          {!slot.required && (
                            <button
                              onClick={() => onRemoveRef(ref.id)}
                              className="h-7 w-7 grid place-items-center rounded-lg bg-rose-500/70 text-white hover:bg-rose-500"
                              title="Hapus (optional saja)"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="px-3 py-2 flex items-center justify-between gap-2">
                      <div className="text-xs font-medium truncate">{slot.label}</div>
                      {slot.required ? <Chip tone="warn">wajib</Chip> : <Chip>optional</Chip>}
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>

          {/* Social */}
          <Card
            title="Reference Social Media"
            sub="Paste URL akun referensi. AI Analysis akan mengekstrak style dan mengirim ke Brain."
          >
            <div className="flex flex-wrap gap-2 mb-4">
              {SOCIAL_PLATFORMS.map((p) => (
                <GhostButton key={p.key} onClick={() => onAddSocial(p.key, p.label)}>
                  <Link2 className="h-3.5 w-3.5" /> + {p.label}
                </GhostButton>
              ))}
            </div>
            {socialRefs.length === 0 ? (
              <div className="text-xs text-muted-foreground">Belum ada referensi social.</div>
            ) : (
              <ul className="divide-y divide-border/50">
                {socialRefs.map((r) => (
                  <li key={r.id} className="flex items-center gap-3 py-2 text-sm">
                    <Chip tone="primary">{r.platform.replace("social_", "")}</Chip>
                    <a href={r.url} target="_blank" rel="noreferrer" className="flex-1 truncate text-foreground/90 hover:text-foreground">
                      {r.url}
                    </a>
                    <button onClick={() => onRemoveRef(r.id)} className="text-muted-foreground hover:text-rose-300" title="Hapus">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <div className="mt-5 flex flex-wrap items-center gap-3">
              <PrimaryButton onClick={onAnalyze} disabled={analyzing}>
                {analyzing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
                Analyze Reference
              </PrimaryButton>
              <Link to="/ai-influencer/brain" className="text-xs text-primary hover:underline">
                Lihat hasil di Brain →
              </Link>
            </div>

            <div className="mt-5 rounded-xl border border-border/60 bg-card/30 p-4">
              <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-2">
                AI Analysis akan mengekstrak
              </div>
              <div className="flex flex-wrap gap-1.5">
                {ANALYSIS_DIMENSIONS.map((d) => (<Chip key={d}>{d}</Chip>))}
              </div>
            </div>
          </Card>
        </>
      )}
    </DashboardShell>
  );
}
