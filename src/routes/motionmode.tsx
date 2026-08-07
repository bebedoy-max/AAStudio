import { createFileRoute } from "@tanstack/react-router";
import { MotionControl } from "@/components/generate/motion-control";

export const Route = createFileRoute("/motionmode")({
  head: () => ({
    meta: [
      { title: "Motion Mode — Generate Video Motion Control Tanpa Login" },
      {
        name: "description",
        content:
          "Mode khusus Motion Control: pilih provider, isi atau beli token, lalu generate video motion transfer langsung tanpa perlu login.",
      },
      { property: "og:title", content: "Motion Mode — Motion Control Tanpa Login" },
      {
        property: "og:description",
        content: "Akses cepat Motion Control: pilih provider, isi token, generate video.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: MotionControl,
});
