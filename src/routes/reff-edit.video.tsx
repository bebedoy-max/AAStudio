import { createFileRoute } from "@tanstack/react-router";
import { DashboardShell, PageHero } from "@/components/dashboard/shell";
import { ReffEditWorkspace } from "@/components/reff-edit/workspace";

export const Route = createFileRoute("/reff-edit/video")({
  head: () => ({
    meta: [
      { title: "Video Reference Edit — Reff EDIT" },
      {
        name: "description",
        content:
          "Upload video referensi, AI menganalisa camera + motion + editing rhythm lalu menerapkan ke video target.",
      },
      { property: "og:title", content: "Video Reference Edit — Reff EDIT" },
      {
        property: "og:description",
        content:
          "AI Creative Director untuk video editing berbasis referensi cinematic.",
      },
    ],
  }),
  component: () => (
    <DashboardShell>
      <PageHero
        eyebrow="Reff EDIT"
        title="Video Reference"
        highlight="Edit"
        desc="Berikan video sebagai acuan — AI menyusun Edit Blueprint (cut, transition, color grade) untuk target video."
      />
      <ReffEditWorkspace
        mode="video"
        title="Video Reference Edit"
        desc="AI Creative Director untuk video."
        aspectOptions={[
          { value: "9:16", label: "TikTok / Reels 9:16" },
          { value: "16:9", label: "YouTube 16:9" },
          { value: "1:1", label: "Square 1:1" },
        ]}
      />
    </DashboardShell>
  ),
});
