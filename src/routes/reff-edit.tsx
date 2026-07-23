import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/reff-edit")({
  head: () => ({
    meta: [
      { title: "Reff EDIT — AI Creative Director" },
      {
        name: "description",
        content:
          "Reff EDIT — berikan referensi visual, AI menganalisa Reference DNA lalu menerapkan style tersebut ke konten kamu.",
      },
      { property: "og:title", content: "Reff EDIT — AI Creative Director" },
      {
        property: "og:description",
        content:
          "AI Reference-Based Editing Workspace: image & video reference edit, library, dan history.",
      },
    ],
  }),
  component: () => <Outlet />,
});
