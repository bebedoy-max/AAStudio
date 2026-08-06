import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/ai-influencer")({
  head: () => ({
    meta: [
      { title: "AI Digital Human Studio — Creative Studio" },
      {
        name: "description",
        content:
          "AI Digital Human Studio — bangun AI Influencer yang hidup: kelola karakter, brain, konten, publisher, dan analytics dalam satu workspace otomatis.",
      },
    ],
  }),
  component: () => <Outlet />,
});

