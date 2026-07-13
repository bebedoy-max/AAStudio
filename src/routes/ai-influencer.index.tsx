import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/ai-influencer/")({
  beforeLoad: () => {
    throw redirect({ to: "/ai-influencer/character" });
  },
});
