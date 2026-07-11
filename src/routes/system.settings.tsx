import { createFileRoute } from "@tanstack/react-router";
import { DashboardShell, PageHero } from "@/components/dashboard/shell";
import { ToggleCard } from "@/components/dashboard/widgets";

export const Route = createFileRoute("/system/settings")({
  head: () => ({ meta: [{ title: "Pengaturan — AATools" }, { name: "description", content: "Preferensi akun, tampilan, dan integrasi AATools." }] }),
  component: () => (
    <DashboardShell>
      <PageHero
        eyebrow="System"
        title="Pengaturan"
        desc="Preferensi akun, tampilan, notifikasi, dan integrasi."
      />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <ToggleCard />
        <ToggleCard />
        <div className="neumorph p-5 md:col-span-2">
          <div className="font-display text-lg text-foreground">Profil</div>
          <p className="text-xs text-muted-foreground mt-1">Kelola informasi akun, workspace, dan tim.</p>
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
            {["Nama Workspace", "Email", "Timezone", "Bahasa"].map((f) => (
              <div key={f}>
                <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-1">{f}</div>
                <input
                  className="w-full rounded-xl border border-border bg-card/50 px-3 py-2 text-sm outline-none focus:border-primary/60"
                  placeholder={f}
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    </DashboardShell>
  ),
});
