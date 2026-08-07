import { createFileRoute } from "@tanstack/react-router";
import { MotionControl } from "@/components/generate/motion-control";

export const Route = createFileRoute("/generate/motion")({
  head: () => ({
    meta: [
      { title: "Motion Control — AA Creative Studio" },
      {
        name: "description",
        content:
          "Kling Motion Control — character motion transfer dari video/gambar referensi.",
      },
      { property: "og:title", content: "Motion Control — AA Creative Studio" },
      {
        property: "og:description",
        content: "Transfer gerakan karakter dari video dan gambar referensi dengan AI Motion Control.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: MotionControl,
});
