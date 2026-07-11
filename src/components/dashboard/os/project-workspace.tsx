import { Link } from "@tanstack/react-router";
import { Pin, Star, ArrowRight, FolderKanban, BookText, Package, Move3d, Shirt, ImagePlay, Search as SearchIcon } from "lucide-react";
import { useProjects, pinProject, favoriteProject, type Project, type ProjectKind } from "@/lib/dashboard/projects";
import { Chip } from "./section";

const KIND_ICON: Record<ProjectKind, React.ComponentType<{ className?: string }>> = {
  narrative: BookText,
  storyboard: Package,
  motion: Move3d,
  "bulk-fashion": Shirt,
  "image-to-video": ImagePlay,
  research: SearchIcon,
};

function ago(t: number): string {
  const diff = Date.now() - t;
  const h = Math.floor(diff / 3600_000);
  if (h < 1) return "baru saja";
  if (h < 24) return `${h} jam lalu`;
  return `${Math.floor(h / 24)} hari lalu`;
}

export function ProjectWorkspace() {
  const all = useProjects();
  const pinned = all.filter((p) => p.pinned);
  const recent = all.filter((p) => !p.pinned).sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 6);

  return (
    <div className="neumorph p-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <FolderKanban className="h-4 w-4 text-primary" />
          <div className="font-display text-base">Project Workspace</div>
          <Chip>{all.length} project</Chip>
        </div>
        <div className="text-[11px] text-muted-foreground">Lanjutkan project · pin favorit · lihat progress</div>
      </div>

      {pinned.length > 0 && (
        <>
          <div className="mt-4 text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground">Pinned</div>
          <div className="mt-2 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {pinned.map((p) => (
              <ProjectCard key={p.id} project={p} featured />
            ))}
          </div>
        </>
      )}

      <div className="mt-5 text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground">Recent</div>
      <div className="mt-2 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {recent.map((p) => (
          <ProjectCard key={p.id} project={p} />
        ))}
        {recent.length === 0 && pinned.length === 0 && (
          <div className="col-span-full rounded-xl border border-dashed border-border/60 bg-card/20 p-8 text-center text-xs text-muted-foreground">
            Belum ada project. Setiap generate akan otomatis membuat project di sini.
          </div>
        )}
      </div>
    </div>
  );
}

function ProjectCard({ project, featured }: { project: Project; featured?: boolean }) {
  const Icon = KIND_ICON[project.kind];
  const total = Object.values(project.counts).reduce<number>((s, v) => s + (v || 0), 0);
  return (
    <div
      className={
        "group relative rounded-2xl border p-4 transition hover-scale " +
        (featured
          ? "border-primary/40 bg-gradient-to-br from-primary/[0.08] via-card/40 to-card/40"
          : "border-border bg-card/40 hover:border-primary/40")
      }
    >
      <div className="flex items-start gap-3">
        <div
          className="h-10 w-10 grid place-items-center rounded-xl text-primary-foreground shrink-0"
          style={{ background: "var(--gradient-neon)" }}
        >
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-display text-sm text-foreground truncate">{project.title}</div>
          <div className="text-[11px] text-muted-foreground truncate">{project.niche || project.kind}</div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => favoriteProject(project.id, !project.favorite)}
            className={project.favorite ? "text-amber-300" : "text-muted-foreground/60 hover:text-foreground"}
            aria-label="Favorite"
          >
            <Star className="h-3.5 w-3.5" fill={project.favorite ? "currentColor" : "none"} />
          </button>
          <button
            onClick={() => pinProject(project.id, !project.pinned)}
            className={project.pinned ? "text-primary" : "text-muted-foreground/60 hover:text-foreground"}
            aria-label="Pin"
          >
            <Pin className="h-3.5 w-3.5" fill={project.pinned ? "currentColor" : "none"} />
          </button>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-1">
        {project.counts.videos ? <Chip>{project.counts.videos} video</Chip> : null}
        {project.counts.images ? <Chip>{project.counts.images} image</Chip> : null}
        {project.counts.storyboards ? <Chip>{project.counts.storyboards} storyboard</Chip> : null}
        {project.counts.ideas ? <Chip>{project.counts.ideas} idea</Chip> : null}
        {total === 0 && <Chip>fresh</Chip>}
      </div>

      <div className="mt-3">
        <div className="flex items-center justify-between text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
          <span>Progress</span>
          <span>{project.progress}%</span>
        </div>
        <div className="mt-1 h-1.5 rounded-full bg-card/60 overflow-hidden">
          <div
            className="h-full rounded-full transition-all"
            style={{ width: `${project.progress}%`, background: "var(--gradient-neon)" }}
          />
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between">
        <span className="text-[10px] text-muted-foreground">{ago(project.updatedAt)}</span>
        {project.route && (
          <Link
            to={project.route}
            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
          >
            Continue <ArrowRight className="h-3 w-3" />
          </Link>
        )}
      </div>
    </div>
  );
}
