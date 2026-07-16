import { Link, useRouterState } from "@tanstack/react-router";
import {
  KeyRound,
  Route as RouteIcon,
  Move3d,
  Package,
  Shirt,
  ImagePlay,
  BookText,
  BarChart3,
  Settings,
  HelpCircle,
  Layers,
  Sparkles,
  Cog,
  ShieldCheck,
  Receipt,
  Wallet,
  UserCircle2,
  Scissors,
  Film,
  Languages,
  Lightbulb,
  GripVertical,
  ChevronRight,
  Brain,
  CalendarRange,
  FolderOpen,
  Send,
  LineChart,
  Lock,
  SlidersHorizontal,
  
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  arrayMove,
  verticalListSortingStrategy,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useAuth } from "@/lib/auth-context";
import { openUpgradePrompt } from "@/lib/stores/upgrade-prompt";
import { UpgradeCard } from "@/components/upgrade-card";

const LOGO_URL = "https://drive.google.com/thumbnail?id=1X9sHtl0_OwVYcZIXwPmreKiOt70bnDc4&sz=w512";

type Item = { title: string; url: string; icon: LucideIcon; permKey?: string };
type NavEntry =
  | { kind: "link"; key: string; label: string; url: string; icon: LucideIcon; permKey?: string; requireAdmin?: boolean; alwaysVisible?: boolean; premium?: boolean }
  | { kind: "group"; key: string; label: string; icon: LucideIcon; items: Item[]; requireAdmin?: boolean; requirePremium?: boolean };

const DEFAULT_NAV: NavEntry[] = [
  { kind: "link", key: "dashboard", label: "Creative Dashboard", url: "/", icon: Lightbulb, alwaysVisible: true },
  {
    kind: "group",
    key: "ai-influencer",
    label: "AI Influencer",
    icon: UserCircle2,
    items: [
      { title: "Character", url: "/ai-influencer/character", icon: UserCircle2, permKey: "ai-influencer.studio" },
      { title: "Brain", url: "/ai-influencer/brain", icon: Brain, permKey: "ai-influencer.studio" },
      { title: "Content Planner", url: "/ai-influencer/planner", icon: CalendarRange, permKey: "ai-influencer.studio" },
      { title: "Content Library", url: "/ai-influencer/library", icon: FolderOpen, permKey: "ai-influencer.studio" },
      { title: "Auto Publisher", url: "/ai-influencer/publisher", icon: Send, permKey: "ai-influencer.studio" },
      { title: "Analytics", url: "/ai-influencer/analytics", icon: LineChart, permKey: "ai-influencer.studio" },
    ],
  },
  {
    kind: "group",
    key: "mixing",
    label: "Clip nMix",
    icon: Film,
    items: [
      { title: "AI Clipper", url: "/mixing/clipper", icon: Scissors, permKey: "mixing.clipper" },
      { title: "AI Dubber", url: "/mixing/dubbing", icon: Languages, permKey: "mixing.dubbing" },
    ],
  },
  {
    kind: "group",
    key: "generate",
    label: "Generate",
    icon: Sparkles,
    items: [
      { title: "Motion Control", url: "/generate/motion", icon: Move3d, permKey: "generate.motion" },
      { title: "Bulk Fashion Generator", url: "/generate/bulk-fashion", icon: Shirt, permKey: "generate.bulk-fashion" },
      { title: "Image To Video", url: "/generate/image-to-video", icon: ImagePlay, permKey: "generate.image-to-video" },
    ],
  },
  {
    kind: "group",
    key: "storyboard",
    label: "Storyboard",
    icon: BookText,
    items: [
      { title: "Produk Storyboard", url: "/generate/storyboard", icon: Package, permKey: "generate.storyboard" },
      { title: "Naratif Video Maker", url: "/generate/naratif", icon: BookText, permKey: "generate.naratif" },
    ],
  },
  {
    kind: "group",
    key: "manage",
    label: "Manage",
    icon: Layers,
    items: [
      { title: "Token / API Manager", url: "/manage/tokens", icon: KeyRound },
      { title: "Routing Provider", url: "/manage/routing", icon: RouteIcon },
    ],
  },
  {
    kind: "group",
    key: "system",
    label: "System",
    icon: Cog,
    items: [
      { title: "Analytic", url: "/system/analytic", icon: BarChart3 },
      { title: "Pengaturan", url: "/system/settings", icon: Settings },
      { title: "Help", url: "/system/help", icon: HelpCircle },
    ],
  },
];

const ADMIN_GROUP: NavEntry = {
  kind: "group",
  key: "admin",
  label: "Admin",
  icon: ShieldCheck,
  requireAdmin: true,
  items: [
    { title: "Kelola User", url: "/admin", icon: ShieldCheck },
    { title: "Request Pembelian", url: "/admin/requests", icon: Receipt },
    { title: "Metode Pembayaran & Harga", url: "/admin/payments", icon: Wallet },
    { title: "Token Bank", url: "/admin/token-bank", icon: KeyRound },
    { title: "Pengaturan Halaman", url: "/admin/access", icon: SlidersHorizontal },
  ],
};

const NAV_ORDER_KEY = "aatools.sidebar.order.v2";
const HOVER_CLOSE_DELAY = 320;

function loadOrder(defaults: string[]): string[] {
  if (typeof window === "undefined") return defaults;
  try {
    const raw = localStorage.getItem(NAV_ORDER_KEY);
    if (!raw) return defaults;
    const saved = JSON.parse(raw) as string[];
    const merged = saved.filter((k) => defaults.includes(k));
    for (const k of defaults) if (!merged.includes(k)) merged.push(k);
    return merged;
  } catch {
    return defaults;
  }
}

function saveOrder(order: string[]) {
  try {
    localStorage.setItem(NAV_ORDER_KEY, JSON.stringify(order));
  } catch {}
}

function HoverFlyout({
  items,
  currentPath,
  open,
  anchorTop,
  onNavigate,
  onEnter,
  onLeave,
}: {
  items: Item[];
  currentPath: string;
  open: boolean;
  anchorTop: number;
  onNavigate?: () => void;
  onEnter: () => void;
  onLeave: () => void;
}) {
  const { isFeatureEnabled, featureAccess, hasRoutePermission, isAdmin } = useAuth();
  if (!open) return null;
  return (
    <div
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      className="fixed left-[24.25rem] z-50 min-w-[220px] rounded-2xl border border-sidebar-border bg-sidebar/95 backdrop-blur-xl p-2 shadow-2xl animate-in fade-in-0 slide-in-from-left-2 duration-150"
      style={{ top: anchorTop }}
    >
      {/* invisible bridge to prevent gap-triggered close */}
      <div className="absolute -left-3 top-0 h-full w-3" />
      <div className="flex flex-col gap-1">
        {items.map((item) => {
          const isActive = currentPath === item.url;
          const CIcon = item.icon;
          const enabled = !item.permKey || isFeatureEnabled(item.permKey);
          const access = item.permKey ? featureAccess[item.permKey] : undefined;
          // Trial badge hanya ditampilkan untuk user yang tidak punya akses
          // eksplisit ke menu ini — jadi user yang sudah subscribe / diberi
          // akses admin tidak melihat label "Trial" yang tidak relevan.
          const ownsAccess = !item.permKey || isAdmin || hasRoutePermission(item.permKey);
          const trialBadge =
            enabled && !ownsAccess && access?.mode === "trial" && access.trialUntil
              ? `Trial s/d ${new Date(access.trialUntil).toLocaleDateString("id-ID", { day: "numeric", month: "short" })}`
              : null;

          if (!enabled) {
            return (
              <button
                key={item.url}
                type="button"
                onClick={() => {
                  openUpgradePrompt(item.permKey);
                  onNavigate?.();
                }}
                className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm text-foreground/40 hover:text-foreground/70 hover:bg-sidebar-accent/40 transition-all text-left"
              >
                <span className="h-7 w-7 grid place-items-center rounded-lg shrink-0 bg-sidebar-accent/40 border border-sidebar-border">
                  <CIcon className="h-3.5 w-3.5" />
                </span>
                <span className="flex-1 truncate">{item.title}</span>
                <Lock className="h-3.5 w-3.5 shrink-0 opacity-70" />
              </button>
            );
          }

          return (
            <Link
              key={item.url}
              to={item.url}
              onClick={onNavigate}
              className={[
                "flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm transition-all",
                isActive
                  ? "text-primary-foreground"
                  : "text-foreground/85 hover:text-foreground hover:bg-sidebar-accent/60",
              ].join(" ")}
              style={isActive ? { background: "var(--gradient-neon)" } : undefined}
            >
              <span
                className={[
                  "h-7 w-7 grid place-items-center rounded-lg shrink-0",
                  isActive ? "bg-black/25" : "bg-sidebar-accent/60 border border-sidebar-border",
                ].join(" ")}
              >
                <CIcon className="h-3.5 w-3.5" />
              </span>
              <span className="flex-1 min-w-0 leading-tight">
                <span className="block truncate">{item.title}</span>
                {trialBadge && (
                  <span className="block text-[9px] font-mono uppercase tracking-wider text-amber-300 truncate mt-0.5">
                    {trialBadge}
                  </span>
                )}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

/** Inline (mobile-drawer) submenu: renders items directly below the group row */
function InlineSubmenu({
  items,
  currentPath,
  onNavigate,
}: {
  items: Item[];
  currentPath: string;
  onNavigate?: () => void;
}) {
  const { isFeatureEnabled, featureAccess, hasRoutePermission, isAdmin } = useAuth();
  return (
    <div className="mt-1 ml-9 flex flex-col gap-1 border-l border-sidebar-border/60 pl-2">
      {items.map((item) => {
        const isActive = currentPath === item.url;
        const CIcon = item.icon;
        const enabled = !item.permKey || isFeatureEnabled(item.permKey);
        const access = item.permKey ? featureAccess[item.permKey] : undefined;
        const ownsAccess = !item.permKey || isAdmin || hasRoutePermission(item.permKey);
        const trialBadge =
          enabled && !ownsAccess && access?.mode === "trial" && access.trialUntil
            ? `Trial s/d ${new Date(access.trialUntil).toLocaleDateString("id-ID", { day: "numeric", month: "short" })}`
            : null;

        if (!enabled) {
          return (
            <button
              key={item.url}
              type="button"
              onClick={() => {
                openUpgradePrompt(item.permKey);
                onNavigate?.();
              }}
              className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm text-foreground/40 hover:text-foreground/70 hover:bg-sidebar-accent/40 transition-all text-left"
            >
              <span className="h-7 w-7 grid place-items-center rounded-lg shrink-0 bg-sidebar-accent/40 border border-sidebar-border">
                <CIcon className="h-3.5 w-3.5" />
              </span>
              <span className="flex-1 truncate">{item.title}</span>
              <Lock className="h-3.5 w-3.5 shrink-0 opacity-70" />
            </button>
          );
        }

        return (
          <Link
            key={item.url}
            to={item.url}
            onClick={onNavigate}
            className={[
              "flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm transition-all",
              isActive
                ? "text-primary-foreground"
                : "text-foreground/85 hover:text-foreground hover:bg-sidebar-accent/60",
            ].join(" ")}
            style={isActive ? { background: "var(--gradient-neon)" } : undefined}
          >
            <span
              className={[
                "h-7 w-7 grid place-items-center rounded-lg shrink-0",
                isActive ? "bg-black/25" : "bg-sidebar-accent/60 border border-sidebar-border",
              ].join(" ")}
            >
              <CIcon className="h-3.5 w-3.5" />
            </span>
            <span className="flex-1 min-w-0 leading-tight">
              <span className="block truncate">{item.title}</span>
              {trialBadge && (
                <span className="block text-[9px] font-mono uppercase tracking-wider text-amber-300 truncate mt-0.5">
                  {trialBadge}
                </span>
              )}
            </span>
          </Link>
        );
      })}
    </div>
  );
}


function SortableEntry({
  entry,
  currentPath,
  onNavigate,
  inline = false,
}: {
  entry: NavEntry;
  currentPath: string;
  onNavigate?: () => void;
  inline?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: entry.key });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const activeUrl =
    entry.kind === "link"
      ? entry.url === currentPath
      : entry.items.some((i) => i.url === currentPath);
  const Icon = entry.icon;

  const rowRef = useRef<HTMLDivElement | null>(null);
  const [hoverOpen, setHoverOpen] = useState(false);
  const [anchorTop, setAnchorTop] = useState(0);
  const [inlineOpen, setInlineOpen] = useState(false);
  const closeTimer = useRef<number | null>(null);

  // Auto-open inline group if a child route is active
  useEffect(() => {
    if (inline && entry.kind === "group" && activeUrl) setInlineOpen(true);
  }, [inline, entry.kind, activeUrl]);

  const scheduleClose = () => {
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => setHoverOpen(false), HOVER_CLOSE_DELAY);
  };
  const cancelClose = () => {
    if (closeTimer.current) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  };
  const openFlyout = () => {
    cancelClose();
    if (rowRef.current) {
      const r = rowRef.current.getBoundingClientRect();
      setAnchorTop(r.top);
    }
    setHoverOpen(true);
  };

  useEffect(() => () => cancelClose(), []);

  const rowClasses = [
    "flex-1 group relative flex items-center gap-3 rounded-2xl pl-2 pr-3 py-2.5 text-sm transition-all min-w-0",
    activeUrl
      ? "text-primary-foreground glow-pink"
      : "text-foreground/80 hover:text-foreground hover:bg-sidebar-accent/60",
  ].join(" ");

  const iconBadge = (
    <span
      className={[
        "h-9 w-9 grid place-items-center rounded-xl shrink-0",
        activeUrl ? "bg-black/25" : "bg-sidebar-accent/60 border border-sidebar-border",
      ].join(" ")}
    >
      <Icon className="h-4 w-4" />
    </span>
  );

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="relative"
      onMouseEnter={entry.kind === "group" && !inline ? openFlyout : undefined}
      onMouseLeave={entry.kind === "group" && !inline ? scheduleClose : undefined}
    >
      <div ref={rowRef} className="flex items-center gap-1">
        <button
          type="button"
          {...attributes}
          {...listeners}
          className="h-9 w-5 grid place-items-center rounded-md text-muted-foreground/40 hover:text-foreground/70 hover:bg-sidebar-accent/40 cursor-grab active:cursor-grabbing touch-none shrink-0"
          aria-label="Geser untuk mengatur urutan"
          onClick={(e) => e.stopPropagation()}
        >
          <GripVertical className="h-3.5 w-3.5" />
        </button>

        {entry.kind === "link" ? (
          <Link
            to={entry.url}
            onClick={onNavigate}
            className={rowClasses}
            style={activeUrl ? { background: "var(--gradient-neon)" } : undefined}
          >
            {iconBadge}
            <span className="flex-1 min-w-0 font-medium text-left leading-tight text-[15px]">
              <span className="block truncate">{entry.label}</span>
              {entry.premium && (
                <span className="block text-[10px] font-mono uppercase tracking-[0.32em] text-vvip-gold leading-none mt-1">
                  STUDIO
                </span>
              )}
            </span>
          </Link>
        ) : inline ? (
          <button
            type="button"
            onClick={() => setInlineOpen((v) => !v)}
            className={rowClasses}
            style={activeUrl ? { background: "var(--gradient-neon)" } : undefined}
            aria-expanded={inlineOpen}
          >
            {iconBadge}
            <span className="flex-1 min-w-0 font-medium text-left truncate text-[15px]">{entry.label}</span>
            <ChevronRight
              className={[
                "h-4 w-4 transition-transform shrink-0",
                inlineOpen ? "rotate-90" : "",
                activeUrl ? "opacity-90" : "opacity-50",
              ].join(" ")}
            />
          </button>
        ) : (
          <div
            className={rowClasses}
            style={activeUrl ? { background: "var(--gradient-neon)" } : undefined}
          >
            {iconBadge}
            <span className="flex-1 min-w-0 font-medium text-left truncate text-[15px]">{entry.label}</span>
            <ChevronRight className={["h-4 w-4 transition-transform shrink-0", hoverOpen ? "translate-x-0.5" : "", activeUrl ? "opacity-90" : "opacity-50"].join(" ")} />
          </div>
        )}
      </div>

      {entry.kind === "group" && !inline && (
        <HoverFlyout
          items={entry.items}
          currentPath={currentPath}
          open={hoverOpen}
          anchorTop={anchorTop}
          onNavigate={() => {
            setHoverOpen(false);
            onNavigate?.();
          }}
          onEnter={cancelClose}
          onLeave={scheduleClose}
        />
      )}

      {entry.kind === "group" && inline && inlineOpen && (
        <InlineSubmenu items={entry.items} currentPath={currentPath} onNavigate={onNavigate} />
      )}
    </div>
  );
}


export function AppSidebar({
  inline = false,
  onNavigate,
}: { inline?: boolean; onNavigate?: () => void } = {}) {
  const currentPath = useRouterState({ select: (r) => r.location.pathname });
  const { isAdmin, hasRoutePermission, routePermissions } = useAuth();
  const hasAnyPremium = isAdmin || routePermissions.length > 0;

  // Show every feature item (locked ones render disabled in the flyout), so new
  // users still see all menus — only enabled/disabled differs by access settings.
  const filterItems = (its: Item[]) => its;
  const allEntries: NavEntry[] = [...DEFAULT_NAV];
  if (isAdmin) allEntries.push(ADMIN_GROUP);

  const visible = allEntries
    .map((e) => {
      if (e.kind === "group") return { ...e, items: filterItems(e.items) };
      return e;
    })
    .filter((e) => {
      if (e.kind === "link") {
        if (e.alwaysVisible) return true;
        if (e.permKey && !hasRoutePermission(e.permKey) && !isAdmin) return false;
        return true;
      }
      if (e.requireAdmin && !isAdmin) return false;
      if (e.requirePremium && !hasAnyPremium) return false;
      return e.items.length > 0;
    });

  const defaultOrder = visible.map((e) => e.key);
  const [order, setOrder] = useState<string[]>(defaultOrder);

  useEffect(() => {
    setOrder(loadOrder(defaultOrder));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultOrder.join(",")]);

  const entryMap = new Map(visible.map((e) => [e.key, e]));
  const ordered = order.map((k) => entryMap.get(k)).filter(Boolean) as NavEntry[];

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIdx = order.indexOf(active.id as string);
    const newIdx = order.indexOf(over.id as string);
    if (oldIdx < 0 || newIdx < 0) return;
    const next = arrayMove(order, oldIdx, newIdx);
    setOrder(next);
    saveOrder(next);
  };

  const outerClass = inline
    ? "flex flex-col w-full p-4 gap-1"
    : "hidden md:flex flex-col w-[24rem] shrink-0 px-4 pt-5 pb-4 gap-1 sticky top-0 h-screen z-40";


  return (
    <aside className={outerClass}>
      <div className="flex items-center gap-3 px-1 pt-1 pb-3">
        <div className="relative shrink-0 h-[100px] w-[100px]">
          {/* thin smoke — outer drift */}
          <div
            aria-hidden
            className="pointer-events-none absolute -inset-[22px] rounded-full blur-2xl opacity-60 animate-[smoke-drift_7s_ease-in-out_infinite]"
            style={{
              background:
                "radial-gradient(circle, rgba(230,235,245,0.28) 0%, rgba(200,210,230,0.14) 45%, rgba(0,0,0,0) 72%)",
            }}
          />
          {/* thin smoke — inner wisp */}
          <div
            aria-hidden
            className="pointer-events-none absolute -inset-[11px] rounded-full blur-lg opacity-70 animate-[smoke-drift_5s_ease-in-out_infinite_reverse]"
            style={{
              background:
                "radial-gradient(circle, rgba(245,245,250,0.32) 0%, rgba(210,215,230,0.16) 55%, rgba(0,0,0,0) 78%)",
            }}
          />
          <img
            src={LOGO_URL}
            alt="Creative Studio"
            className="relative h-[100px] w-[100px] rounded-[25px] object-contain ring-1 ring-white/10"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = "none";
            }}
          />
        </div>
        <div className="leading-[1.05] font-display font-black tracking-tight min-w-0" style={{ letterSpacing: "-0.025em" }}>
          <div className="text-[44px] text-gradient">Creative</div>
          <div className="text-[44px] text-gradient">Studio</div>
        </div>
      </div>

      <nav className="flex flex-col gap-1.5 mt-[52px]">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={order} strategy={verticalListSortingStrategy}>
            {ordered.map((e) => (
              <SortableEntry key={e.key} entry={e} currentPath={currentPath} onNavigate={onNavigate} inline={inline} />
            ))}
          </SortableContext>
        </DndContext>
      </nav>

      <UpgradeCard />
    </aside>
  );
}
