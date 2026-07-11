import { createFileRoute } from "@tanstack/react-router";
import { DashboardShell, PageHero } from "@/components/dashboard/shell";
import { AreaChartCard, BarChartCard, GaugesCard, ArcCard } from "@/components/dashboard/widgets";

export const Route = createFileRoute("/system/analytic")({
  head: () => ({ meta: [{ title: "Analytic — AATools" }, { name: "description", content: "Statistik penggunaan, credits, dan performa model AI." }] }),
  component: () => (
    <DashboardShell>
      <PageHero
        eyebrow="System"
        title="Analytic"
        highlight="Overview"
        desc="Statistik penggunaan, credits, dan performa model AI Anda."
      />
      <div className="grid grid-cols-1 md:grid-cols-6 gap-5">
        <div className="md:col-span-3"><GaugesCard /></div>
        <div className="md:col-span-3"><ArcCard /></div>
        <div className="md:col-span-3"><BarChartCard /></div>
        <div className="md:col-span-3"><BarChartCard /></div>
        <div className="md:col-span-6"><AreaChartCard /></div>
      </div>
    </DashboardShell>
  ),
});
