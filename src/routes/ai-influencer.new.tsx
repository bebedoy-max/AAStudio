import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowLeft, Sparkles } from "lucide-react";
import { DashboardShell, PageHero } from "@/components/dashboard/shell";
import { Card, Field, Input, Select, Textarea, PrimaryButton, GhostButton } from "@/components/dashboard/ui";
import { createCharacter } from "@/lib/ai-influencer/service";

export const Route = createFileRoute("/ai-influencer/new")({
  component: NewCharacterPage,
});

const GENDERS = [
  { value: "female", label: "Female" },
  { value: "male", label: "Male" },
  { value: "non-binary", label: "Non-binary" },
];

const RELATIONSHIP = [
  { value: "single", label: "Single" },
  { value: "in-relationship", label: "In relationship" },
  { value: "married", label: "Married" },
  { value: "prefer-not", label: "Prefer not to say" },
];

const BODY = [
  { value: "slim", label: "Slim" },
  { value: "athletic", label: "Athletic" },
  { value: "curvy", label: "Curvy" },
  { value: "plus-size", label: "Plus size" },
  { value: "petite", label: "Petite" },
];

function NewCharacterPage() {
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    gender: "female",
    age: "" as string,
    nationality: "",
    language: "Bahasa Indonesia",
    occupation: "",
    niche: "",
    style: "",
    personality_text: "",
    background_story: "",
    hobby: "",
    relationship_status: "single",
    favorite_color: "",
    fashion_style: "",
    hair_style: "",
    body_type: "athletic",
    voice: "",
    description: "",
    negative_prompt: "",
    avatar_url: "",
  });

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    if (!form.name.trim()) {
      setErr("Nama wajib diisi");
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      const character = await createCharacter({
        name: form.name.trim(),
        gender: form.gender || null,
        age: form.age ? Number(form.age) : null,
        nationality: form.nationality || null,
        language: form.language || null,
        occupation: form.occupation || null,
        niche: form.niche || null,
        style: form.style || null,
        personality_text: form.personality_text || null,
        background_story: form.background_story || null,
        hobby: form.hobby || null,
        relationship_status: form.relationship_status || null,
        favorite_color: form.favorite_color || null,
        fashion_style: form.fashion_style || null,
        hair_style: form.hair_style || null,
        body_type: form.body_type || null,
        voice: form.voice || null,
        description: form.description || null,
        negative_prompt: form.negative_prompt || null,
        avatar_url: form.avatar_url || null,
        status: "active",
      });
      navigate({ to: "/ai-influencer/$id", params: { id: character.id } });
    } catch (e) {
      setErr((e as Error).message);
      setSaving(false);
    }
  };

  return (
    <DashboardShell>
      <PageHero
        eyebrow="Create Persona"
        title="Karakter"
        highlight="Baru"
        desc="Isi profil dasar karakter. Semua field dapat diubah kapan saja dari workspace."
        action={
          <GhostButton onClick={() => navigate({ to: "/ai-influencer" })}>
            <ArrowLeft className="h-4 w-4" /> Kembali
          </GhostButton>
        }
      />

      {err && (
        <Card>
          <div className="text-sm text-rose-300">{err}</div>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Identitas" sub="Data utama karakter">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Character Name">
              <Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Aria" />
            </Field>
            <Field label="Gender">
              <Select value={form.gender} onChange={(e) => set("gender", e.target.value)} options={GENDERS} />
            </Field>
            <Field label="Age">
              <Input
                type="number"
                value={form.age}
                onChange={(e) => set("age", e.target.value)}
                placeholder="24"
              />
            </Field>
            <Field label="Nationality">
              <Input value={form.nationality} onChange={(e) => set("nationality", e.target.value)} placeholder="Indonesian" />
            </Field>
            <Field label="Language">
              <Input value={form.language} onChange={(e) => set("language", e.target.value)} />
            </Field>
            <Field label="Occupation">
              <Input value={form.occupation} onChange={(e) => set("occupation", e.target.value)} placeholder="Content Creator" />
            </Field>
            <Field label="Niche">
              <Input value={form.niche} onChange={(e) => set("niche", e.target.value)} placeholder="Lifestyle · Fashion" />
            </Field>
            <Field label="Style">
              <Input value={form.style} onChange={(e) => set("style", e.target.value)} placeholder="Editorial minimalist" />
            </Field>
          </div>
        </Card>

        <Card title="Physical & Voice" sub="Ciri visual dan suara">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Body Type">
              <Select value={form.body_type} onChange={(e) => set("body_type", e.target.value)} options={BODY} />
            </Field>
            <Field label="Hair Style">
              <Input value={form.hair_style} onChange={(e) => set("hair_style", e.target.value)} placeholder="Long wavy brown" />
            </Field>
            <Field label="Fashion Style">
              <Input value={form.fashion_style} onChange={(e) => set("fashion_style", e.target.value)} placeholder="Streetwear · Minimal" />
            </Field>
            <Field label="Favorite Color">
              <Input value={form.favorite_color} onChange={(e) => set("favorite_color", e.target.value)} placeholder="Nude · Warm beige" />
            </Field>
            <Field label="Voice">
              <Input value={form.voice} onChange={(e) => set("voice", e.target.value)} placeholder="Warm, calm, mid-range" />
            </Field>
            <Field label="Relationship Status">
              <Select
                value={form.relationship_status}
                onChange={(e) => set("relationship_status", e.target.value)}
                options={RELATIONSHIP}
              />
            </Field>
            <Field label="Avatar URL (opsional)">
              <Input value={form.avatar_url} onChange={(e) => set("avatar_url", e.target.value)} placeholder="https://..." />
            </Field>
            <Field label="Hobby">
              <Input value={form.hobby} onChange={(e) => set("hobby", e.target.value)} placeholder="Yoga · Cafe hopping" />
            </Field>
          </div>
        </Card>

        <Card title="Personality & Background" sub="AI akan pakai info ini untuk semua konten">
          <div className="grid gap-4">
            <Field label="Personality">
              <Textarea
                value={form.personality_text}
                onChange={(e) => set("personality_text", e.target.value)}
                placeholder="Warm, curious, understated confidence"
              />
            </Field>
            <Field label="Background Story">
              <Textarea
                value={form.background_story}
                onChange={(e) => set("background_story", e.target.value)}
                placeholder="Grew up in coastal town, moved to Jakarta for design school..."
              />
            </Field>
          </div>
        </Card>

        <Card title="Prompt Guidance" sub="Deskripsi & negative prompt untuk image/video">
          <div className="grid gap-4">
            <Field label="Description">
              <Textarea
                value={form.description}
                onChange={(e) => set("description", e.target.value)}
                placeholder="24yo Southeast Asian female, soft features, warm skin, subtle makeup..."
              />
            </Field>
            <Field label="Negative Prompt">
              <Textarea
                value={form.negative_prompt}
                onChange={(e) => set("negative_prompt", e.target.value)}
                placeholder="deformed, extra fingers, low quality, watermark"
              />
            </Field>
          </div>
        </Card>
      </div>

      <div className="flex items-center justify-end gap-2">
        <GhostButton onClick={() => navigate({ to: "/ai-influencer" })}>Batal</GhostButton>
        <PrimaryButton onClick={submit} disabled={saving}>
          <Sparkles className="h-4 w-4" /> {saving ? "Menyimpan…" : "Simpan Karakter"}
        </PrimaryButton>
      </div>
    </DashboardShell>
  );
}
