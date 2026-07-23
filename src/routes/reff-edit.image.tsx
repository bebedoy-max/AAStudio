import { createFileRoute } from "@tanstack/react-router";
import { DashboardShell, PageHero } from "@/components/dashboard/shell";
import { ReffEditWorkspace } from "@/components/reff-edit/workspace";

export const Route = createFileRoute("/reff-edit/image")({
  head: () => ({
    meta: [
      { title: "Image Reference Edit — Reff EDIT" },
      {
        name: "description",
        content:
          "Upload gambar referensi, AI ekstrak Reference DNA, lalu terapkan ke gambar target.",
      },
      { property: "og:title", content: "Image Reference Edit — Reff EDIT" },
      {
        property: "og:description",
        content:
          "AI Creative Director untuk image editing berbasis referensi visual.",
      },
    ],
  }),
  component: () => (
    <DashboardShell>
      <PageHero
        eyebrow="Reff EDIT"
        title="Image Reference"
        highlight="Edit"
        desc="Berikan gambar sebagai acuan style — AI menganalisa dan menerapkannya ke gambar target."
      />
      <ReffEditWorkspace
        mode="image"
        title="Image Reference Edit"
        desc="AI Creative Director untuk image."
        aspectOptions={[
          { value: "original", label: "Original size" },
          { value: "1:1", label: "1:1" },
          { value: "4:5", label: "4:5" },
          { value: "9:16", label: "9:16" },
          { value: "16:9", label: "16:9" },
        ]}
      />
    </DashboardShell>
  ),
});
