import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Search, CornerDownLeft } from "lucide-react";
import { buildSearchIndex, searchItems, type SearchItem } from "@/lib/dashboard/search-index";
import { useProjects } from "@/lib/dashboard/projects";
import { useAuth } from "@/lib/auth-context";

export function GlobalSearch() {
  const navigate = useNavigate();
  const projects = useProjects();
  const { isAdmin, routePermissions } = useAuth();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);

  const index = useMemo(
    () => buildSearchIndex(projects, { isAdmin, permissions: routePermissions }),
    [projects, isAdmin, routePermissions],
  );
  const results = useMemo(() => searchItems(index, q), [index, q]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  useEffect(() => setActive(0), [q]);

  function go(item: SearchItem) {
    setOpen(false);
    setQ("");
    navigate({ to: item.route });
  }

  return (
    <div ref={wrapRef} className="relative hidden md:block w-64 lg:w-72">
      <div className="flex items-center gap-2 rounded-full border border-border bg-card/50 px-3 py-2">
        <Search className="h-4 w-4 text-muted-foreground" />
        <input
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => q && setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => Math.min(a + 1, results.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(a - 1, 0));
            } else if (e.key === "Enter" && results[active]) {
              e.preventDefault();
              go(results[active]);
            } else if (e.key === "Escape") {
              setOpen(false);
            }
          }}
          placeholder="Cari fitur, project, prompt…"
          className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
      </div>
      {open && q && (
        <div className="absolute left-0 right-0 top-full mt-2 z-40 neumorph p-1 max-h-[70vh] overflow-y-auto">
          {results.length === 0 ? (
            <div className="px-3 py-6 text-center text-xs text-muted-foreground">
              Tidak ada hasil untuk "{q}"
            </div>
          ) : (
            <ul className="flex flex-col">
              {results.map((r, i) => (
                <li key={r.id}>
                  <button
                    onClick={() => go(r)}
                    onMouseEnter={() => setActive(i)}
                    className={[
                      "w-full text-left flex items-start gap-3 rounded-xl px-3 py-2.5 transition",
                      i === active ? "bg-primary/[0.08]" : "hover:bg-sidebar-accent/50",
                    ].join(" ")}
                  >
                    <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground shrink-0 w-16 pt-0.5">
                      {r.group}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm text-foreground truncate">{r.label}</div>
                      {r.description && (
                        <div className="text-[11px] text-muted-foreground truncate">{r.description}</div>
                      )}
                    </div>
                    {i === active && <CornerDownLeft className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-1" />}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}