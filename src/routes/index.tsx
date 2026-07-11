import { createFileRoute } from "@tanstack/react-router";
import { useRef, useCallback } from "react";
import { DashboardShell } from "@/components/dashboard/shell";
import { Section } from "@/components/dashboard/os/section";
import { CommandCenter } from "@/components/dashboard/os/command-center";
import { BrainInsight } from "@/components/dashboard/os/brain-insight";
import { QuickActions } from "@/components/dashboard/os/quick-actions";
import { RunningTasks } from "@/components/dashboard/os/running-tasks";
import { ProjectWorkspace } from "@/components/dashboard/os/project-workspace";
import { ProviderStatus } from "@/components/dashboard/os/provider-status";
import { Trending } from "@/components/dashboard/os/trending";
import { PlaybookNews } from "@/components/dashboard/os/playbook-news";
import { ResearchPanel, type ResearchPanelHandle } from "@/components/dashboard/os/research-panel";
import { AssetHub } from "@/components/dashboard/os/asset-hub";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "AI Content OS — AATools" },
      {
        name: "description",
        content:
          "Operating system untuk creator: command center, riset, workflow, project memory, dan realtime tasks dalam satu dashboard.",
      },
    ],
  }),
  component: DashboardHome,
});

function DashboardHome() {
  const { user } = useAuth();
  const researchRef = useRef<ResearchPanelHandle>(null);

  const openResearch = useCallback((kw: string) => {
    researchRef.current?.runKeyword(kw);
    // smooth scroll to research panel
    setTimeout(() => {
      document.getElementById("research-panel")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
  }, []);

  const name = user?.email?.split("@")[0] || "Creator";
  const hour = new Date().getHours();
  const greeting = hour < 11 ? "Selamat pagi" : hour < 15 ? "Selamat siang" : hour < 19 ? "Selamat sore" : "Selamat malam";

  return (
    <DashboardShell>
      <div className="flex flex-col gap-6">
        {/* Header */}
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <div>
            <div className="text-[10px] font-mono uppercase tracking-[0.3em] text-muted-foreground">
              AI Content Operating System
            </div>
            <h1 className="mt-1 font-display text-2xl md:text-3xl text-foreground">
              {greeting}, <span className="text-gradient">{name}</span>
            </h1>
            <p className="text-xs md:text-sm text-muted-foreground mt-1">
              Semua workflow dimulai dari sini · realtime, modular, orchestrated by AI.
            </p>
          </div>
        </div>

        {/* 1. Command Center */}
        <CommandCenter onResearch={openResearch} />

        {/* 2. Brain Insight */}
        <BrainInsight onKeyword={openResearch} />

        {/* 3. Quick Actions */}
        <Section eyebrow="02 · Studio" title="Quick Actions" desc="Semua workflow AI dalam satu klik">
          <QuickActions />
        </Section>

        {/* 4. Running + Providers */}
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <RunningTasks />
          </div>
          <div>
            <ProviderStatus />
          </div>
        </div>

        {/* 5. Project Workspace */}
        <Section eyebrow="03 · Memory" title="Project Workspace" desc="Setiap generate hidup di sini — pin, favorit, lanjutkan">
          <ProjectWorkspace />
        </Section>

        {/* 6. Research + Trending */}
        <div id="research-panel" className="grid gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <ResearchPanel ref={researchRef} />
          </div>
          <div>
            <Trending onPick={openResearch} />
          </div>
        </div>

        {/* 7. Playbook + Asset Hub */}
        <div className="grid gap-4 lg:grid-cols-2">
          <PlaybookNews onGenerate={openResearch} />
          <AssetHub />
        </div>
      </div>
    </DashboardShell>
  );
}
