import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  Bell,
  Menu,
  X,
  ChevronDown,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Trash2,
  LogOut,
  ShieldCheck,
  User as UserIcon,
} from "lucide-react";
import { AppSidebar } from "@/components/app-sidebar";
import { UpgradeDialogHost } from "@/components/upgrade-card";
import { useAuth } from "@/lib/auth-context";
import { GlobalSearch } from "@/components/dashboard/global-search";
import {
  useNotifications,
  markAllRead,
  removeNotification,
  clearFinished,
  type AppNotification,
} from "@/lib/stores/notifications";

// Top-nav sub-menu mirrors sidebar section (Manage / Generate / System).
const NAV_SECTIONS: Record<string, { label: string; url: string }[]> = {
  "/": [],
  "/manage": [
    { label: "Token / API Manager", url: "/manage/tokens" },
    { label: "Routing Provider", url: "/manage/routing" },
  ],
  "/generate": [
    { label: "Motion Control", url: "/generate/motion" },
    { label: "Produk Storyboard", url: "/generate/storyboard" },
    { label: "Bulk Fashion", url: "/generate/bulk-fashion" },
    { label: "Image To Video", url: "/generate/image-to-video" },
    { label: "Naratif Video", url: "/generate/naratif" },
  ],
  "/mixing": [
    { label: "AI Clipper", url: "/mixing/clipper" },
    { label: "AI Dubber", url: "/mixing/dubbing" },
  ],
  "/system": [
    { label: "Analytic", url: "/system/analytic" },
    { label: "Pengaturan", url: "/system/settings" },
    { label: "Help", url: "/system/help" },
  ],
  "/admin": [
    { label: "Kelola User", url: "/admin" },
    { label: "Request Pembelian", url: "/admin/requests" },
    { label: "Metode Pembayaran", url: "/admin/payments" },
  ],
};

function formatAgo(ts: number): string {
  const diff = Math.max(0, Date.now() - ts);
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}d lalu`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m lalu`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}j lalu`;
  return `${Math.floor(h / 24)}h lalu`;
}

function NotifPanel({
  items,
  onClose,
  onNavigate,
}: {
  items: AppNotification[];
  onClose: () => void;
  onNavigate: (n: AppNotification) => void;
}) {
  return (
    <div className="fixed left-2 right-2 top-16 z-40 mx-auto max-w-sm sm:absolute sm:left-auto sm:right-0 sm:top-full sm:mt-2 sm:mx-0 sm:w-[22rem] sm:max-w-none neumorph p-0 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/60">
        <div>
          <div className="font-display text-sm text-foreground">Notifikasi</div>
          <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
            Proses generate & update
          </div>
        </div>
        <button
          onClick={clearFinished}
          className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
          title="Hapus notifikasi selesai"
        >
          <Trash2 className="h-3 w-3" /> Bersihkan
        </button>
      </div>
      <div className="max-h-[70vh] overflow-y-auto">
        {items.length === 0 ? (
          <div className="px-4 py-10 text-center text-xs text-muted-foreground">
            Belum ada notifikasi.
            <div className="mt-1 text-muted-foreground/70">
              Notifikasi muncul saat ada proses generate berjalan atau selesai.
            </div>
          </div>
        ) : (
          <ul className="divide-y divide-border/50">
            {items.map((n) => {
              const Icon =
                n.status === "running" ? Loader2 : n.status === "done" ? CheckCircle2 : AlertCircle;
              const tone =
                n.status === "running"
                  ? "text-primary"
                  : n.status === "done"
                    ? "text-emerald-300"
                    : "text-rose-300";
              const clickable = !!n.route;
              return (
                <li
                  key={n.id}
                  className={[
                    "px-4 py-3 flex items-start gap-3 transition",
                    clickable ? "cursor-pointer hover:bg-sidebar-accent/40" : "",
                    !n.read ? "bg-primary/[0.04]" : "",
                  ].join(" ")}
                  onClick={() => {
                    if (clickable) {
                      onNavigate(n);
                      onClose();
                    }
                  }}
                >
                  <span
                    className={[
                      "h-8 w-8 shrink-0 grid place-items-center rounded-lg border border-border bg-sidebar-accent/60",
                      tone,
                    ].join(" ")}
                  >
                    <Icon className={["h-4 w-4", n.status === "running" ? "animate-spin" : ""].join(" ")} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm text-foreground/95 truncate">{n.label}</div>
                    {n.detail && (
                      <div className="text-xs text-muted-foreground truncate">{n.detail}</div>
                    )}
                    <div className="mt-1 flex items-center gap-2 text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                      <span>
                        {n.status === "running"
                          ? "Berjalan"
                          : n.status === "done"
                            ? "Selesai"
                            : "Gagal"}
                      </span>
                      <span className="h-0.5 w-0.5 rounded-full bg-muted-foreground/60" />
                      <span>{formatAgo(n.endedAt ?? n.startedAt)}</span>
                    </div>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      removeNotification(n.id);
                    }}
                    className="shrink-0 text-muted-foreground/60 hover:text-foreground"
                    title="Hapus"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

function AccountMenu() {
  const { user, profile, isAdmin, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const name = profile?.display_name || user?.email?.split("@")[0] || "Akun";
  const initial = (name[0] || "U").toUpperCase();

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-full border border-border bg-card/50 pl-1 pr-2 md:pr-3 py-1"
      >
        {profile?.avatar_url ? (
          <img src={profile.avatar_url} alt={name} className="h-8 w-8 rounded-full object-cover" />
        ) : (
          <span
            className="h-8 w-8 rounded-full grid place-items-center text-primary-foreground font-display text-sm"
            style={{ background: "var(--gradient-neon)" }}
          >
            {initial}
          </span>
        )}
        <span className="hidden md:inline text-xs text-foreground/90 max-w-[8rem] truncate">{name}</span>
        <ChevronDown className="hidden md:inline h-3.5 w-3.5 text-muted-foreground" />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-2 w-64 neumorph p-2 z-40">
          <div className="px-3 py-2 border-b border-border/60">
            <div className="text-sm font-medium truncate">{name}</div>
            <div className="text-xs text-muted-foreground truncate">{user?.email}</div>
            {isAdmin && (
              <div className="mt-1 inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-widest text-primary">
                <ShieldCheck className="h-3 w-3" /> Admin
              </div>
            )}
          </div>
          <div className="flex flex-col gap-0.5 pt-1">
            <Link
              to="/profile"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-sidebar-accent/60"
            >
              <UserIcon className="h-4 w-4" /> Profil Saya
            </Link>
            {isAdmin && (
              <Link
                to="/admin"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-sidebar-accent/60"
              >
                <ShieldCheck className="h-4 w-4" /> Admin Panel
              </Link>
            )}
            <button
              onClick={() => {
                setOpen(false);
                signOut();
              }}
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-sidebar-accent/60 text-left"
            >
              <LogOut className="h-4 w-4" /> Keluar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}


export function DashboardShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const section = pathname === "/" ? "/" : "/" + pathname.split("/")[1];
  const items = NAV_SECTIONS[section] || NAV_SECTIONS["/"];
  const isHome = pathname === "/";

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const navigate = useNavigate();
  const { items: notifs } = useNotifications();
  const unread = notifs.filter((n) => !n.read).length;
  const running = notifs.filter((n) => n.status === "running").length;

  // Close drawer on route change
  useEffect(() => {
    setDrawerOpen(false);
    setNotifOpen(false);
  }, [pathname]);

  // Lock scroll while drawer is open
  useEffect(() => {
    if (typeof document === "undefined") return;
    document.body.style.overflow = drawerOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [drawerOpen]);

  return (
    <div className="min-h-screen flex w-full">
      <AppSidebar />

      {/* Mobile drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true">
          <div
            className="absolute inset-0 bg-background/70 backdrop-blur-sm"
            onClick={() => setDrawerOpen(false)}
          />
          <div className="absolute inset-y-0 left-0 w-[85vw] max-w-[20rem] bg-background border-r border-border shadow-2xl overflow-y-auto animate-in slide-in-from-left duration-200">
            <div className="flex items-center justify-end p-2">
              <button
                onClick={() => setDrawerOpen(false)}
                className="h-9 w-9 grid place-items-center rounded-full border border-border bg-card/50"
                aria-label="Tutup menu"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <AppSidebar inline onNavigate={() => setDrawerOpen(false)} />
          </div>
        </div>
      )}

      <main className="flex-1 min-w-0 flex flex-col">
        <header
          className={[
            "sticky top-0 z-20",
            isHome
              ? "bg-transparent"
              : "backdrop-blur-md bg-background/60 border-b border-border/50",
          ].join(" ")}
        >
          <div className="flex items-center gap-2 px-3 sm:px-6 py-3">
            {/* Mobile hamburger — top-left */}
            <button
              onClick={() => setDrawerOpen(true)}
              className="md:hidden inline-flex h-10 w-10 items-center justify-center rounded-full border border-border bg-card/50"
              aria-label="Buka menu"
            >
              <Menu className="h-4 w-4" />
            </button>

            {/* Desktop sub-nav — hidden on dashboard */}
            {items.length > 0 && (
              <nav className="hidden lg:flex items-center gap-6 text-sm">
                {items.map((it) => {
                const active = pathname === it.url;
                return (
                  <Link
                    key={it.url}
                    to={it.url}
                    className={[
                      "relative pb-1 transition-colors whitespace-nowrap",
                      active
                        ? "text-foreground font-medium"
                        : "text-muted-foreground hover:text-foreground",
                    ].join(" ")}
                  >
                    {it.label}
                    {active && (
                      <span
                        className="absolute -bottom-0.5 left-0 right-0 h-[2px] rounded-full"
                        style={{ background: "var(--gradient-neon)" }}
                      />
                    )}
                  </Link>
                );
                })}
              </nav>
            )}

            <div className="flex-1" />

            {/* Global search — desktop only */}
            <GlobalSearch />

            {/* Notifications */}
            <div className="relative">
              <button
                onClick={() => {
                  setNotifOpen((v) => {
                    const next = !v;
                    if (next) markAllRead();
                    return next;
                  });
                }}
                aria-label="Notifikasi"
                className="relative inline-flex h-10 w-10 md:w-auto md:px-3 items-center justify-center gap-2 rounded-full border border-border bg-card/50 text-xs text-foreground/90"
              >
                <Bell className={["h-4 w-4", running > 0 ? "text-primary" : ""].join(" ")} />
                <span className="hidden xl:inline">Notifikasi</span>
                {(unread > 0 || running > 0) && (
                  <span
                    className="absolute -top-1 -right-1 h-5 min-w-5 px-1 grid place-items-center rounded-full text-[10px] font-mono text-primary-foreground"
                    style={{ background: "var(--gradient-neon)" }}
                  >
                    {running > 0 ? running : unread}
                  </span>
                )}
              </button>
              {notifOpen && (
                <>
                  <div
                    className="fixed inset-0 z-30"
                    onClick={() => setNotifOpen(false)}
                    aria-hidden="true"
                  />
                  <NotifPanel
                    items={notifs}
                    onClose={() => setNotifOpen(false)}
                    onNavigate={(n) => {
                      if (n.route) navigate({ to: n.route });
                    }}
                  />
                </>
              )}
            </div>

            {/* Account */}
            <AccountMenu />

          </div>
        </header>
        <div className="p-4 sm:p-6 flex flex-col gap-6">{children}</div>
      </main>
      <UpgradeDialogHost />
    </div>
  );
}

export function PageHero({
  eyebrow,
  title,
  highlight,
  desc,
  action,
}: {
  eyebrow: string;
  title: string;
  highlight?: string;
  desc: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <div className="text-[11px] font-mono uppercase tracking-[0.25em] text-muted-foreground">
          {eyebrow}
        </div>
        <h1 className="mt-1 font-display text-3xl md:text-4xl font-bold">
          {title} {highlight && <span className="text-gradient">{highlight}</span>}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground max-w-xl">{desc}</p>
      </div>
      {action}
    </div>
  );
}
