import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/ai-influencer")({
  head: () => ({
    meta: [
      { title: "AI Influencer Studio — AATools" },
      {
        name: "description",
        content:
          "AI Persona Management System — bangun, kelola, dan kembangkan karakter virtual yang konsisten menghasilkan konten untuk berbagai media sosial.",
      },
    ],
  }),
  component: () => <Outlet />,
});
