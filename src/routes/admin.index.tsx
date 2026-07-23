import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, ALL_ROUTE_KEYS } from "@/lib/auth-context";
import { DashboardShell, PageHero } from "@/components/dashboard/shell";
import { Card } from "@/components/dashboard/ui";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { listAdminUserStats, setUserTags } from "@/lib/admin/users.functions";
import {
  Loader2,
  Plus,
  Trash2,
  ShieldCheck,
  KeyRound,
  UserCog,
  Save,
  X,
  Search,
  Crown,
  Clock,
} from "lucide-react";
import { confirmDialog } from "@/components/ui-confirm";

export const Route = createFileRoute("/admin/")({
  head: () => ({
    meta: [
      { title: "Admin Panel — AA Creative Studio" },
      { name: "description", content: "Kelola user, role, dan akses fitur." },
    ],
  }),
  component: AdminPage,
});

type Role = "admin" | "editor" | "user";
type UserTag = "vip" | "vvip";

type ManagedUser = {
  id: string;
  email: string | null;
  display_name: string | null;
  avatar_url: string | null;
  created_at: string;
  roles: Role[];
  route_keys: string[];
  tokens_count: number;
  bank_keys_count: number;
  total_active_keys: number;
  last_sign_in_at: string | null;
  tags: UserTag[];
  is_paid: boolean;
};

function accountAge(createdAt: string): string {
  const diff = Date.now() - new Date(createdAt).getTime();
  const days = Math.max(0, Math.floor(diff / 86_400_000));
  if (days < 1) return "hari ini";
  if (days < 30) return `${days} hari`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} bulan`;
  const years = Math.floor(days / 365);
  const remMonths = Math.floor((days - years * 365) / 30);
  return remMonths > 0 ? `${years} thn ${remMonths} bln` : `${years} tahun`;
}

function relativeTime(iso: string | null): string {
  if (!iso) return "belum pernah";
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 0) return "baru saja";
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "baru saja";
  if (mins < 60) return `${mins} menit lalu`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} jam lalu`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days} hari lalu`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} bln lalu`;
  return `${Math.floor(days / 365)} thn lalu`;
}

function AdminPage() {
  return (
    <DashboardShell>
      <PageHero
        eyebrow="Admin"
        title="Manajemen"
        highlight="User"
        desc="Tambah, hapus, ubah role dan akses per-fitur untuk semua user."
      />
      <AdminGate />
    </DashboardShell>
  );
}

function AdminGate() {
  const { loading, isAdmin } = useAuth();
  if (loading) {
    return (
      <Card>
        <div className="p-8 flex items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        </div>
      </Card>
    );
  }
  if (!isAdmin) {
    return (
      <Card>
        <div className="p-8 text-center">
          <ShieldCheck className="h-8 w-8 text-muted-foreground mx-auto" />
          <div className="mt-3 font-display text-lg">Akses ditolak</div>
          <p className="mt-1 text-sm text-muted-foreground">Halaman ini hanya untuk admin.</p>
        </div>
      </Card>
    );
  }
  return <AdminBody />;
}

function AdminBody() {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [filterRole, setFilterRole] = useState<"all" | Role>("all");
  const [filterFeatureMin, setFilterFeatureMin] = useState<string>("");
  const [filterKeyMin, setFilterKeyMin] = useState<string>("");
  const [filterLoginFrom, setFilterLoginFrom] = useState<string>("");
  const [filterLoginTo, setFilterLoginTo] = useState<string>("");
  const [filterAgeMin, setFilterAgeMin] = useState<string>("");
  const [filterStatus, setFilterStatus] = useState<"all" | "free" | "paid">("all");
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<ManagedUser | null>(null);
  const [mobileDetail, setMobileDetail] = useState<ManagedUser | null>(null);
  const fetchStats = useServerFn(listAdminUserStats);

  async function load() {
    setLoading(true);
    const [{ data: profiles }, { data: roles }, { data: perms }, statsRes] = await Promise.all([
      supabase.from("profiles").select("*").order("created_at", { ascending: false }),
      supabase.from("user_roles").select("user_id, role"),
      supabase.from("route_permissions").select("user_id, route_key"),
      fetchStats().catch((e) => {
        console.warn("[admin] listAdminUserStats failed", e);
        return [] as Awaited<ReturnType<typeof listAdminUserStats>>;
      }),
    ]);
    const rolesByUser: Record<string, Role[]> = {};
    (roles ?? []).forEach((r: any) => {
      (rolesByUser[r.user_id] ||= []).push(r.role);
    });
    const permsByUser: Record<string, string[]> = {};
    (perms ?? []).forEach((p: any) => {
      (permsByUser[p.user_id] ||= []).push(p.route_key);
    });
    const statsByUser: Record<
      string,
      { t: number; b: number; total: number; last: string | null; tags: UserTag[]; is_paid: boolean }
    > = {};
    ((statsRes ?? []) as any[]).forEach((r) => {
      statsByUser[r.id] = {
        t: r.tokens_count ?? 0,
        b: r.bank_keys_count ?? 0,
        total: r.total_active_keys ?? 0,
        last: r.last_sign_in_at ?? null,
        tags: (r.tags ?? []) as UserTag[],
        is_paid: Boolean(r.is_paid),
      };
    });
    setUsers(
      ((profiles ?? []) as any[]).map((p) => ({
        ...p,
        roles: rolesByUser[p.id] ?? [],
        route_keys: permsByUser[p.id] ?? [],
        tokens_count: statsByUser[p.id]?.t ?? 0,
        bank_keys_count: statsByUser[p.id]?.b ?? 0,
        total_active_keys:
          statsByUser[p.id]?.total ??
          (statsByUser[p.id]?.t ?? 0) + (statsByUser[p.id]?.b ?? 0),
        last_sign_in_at: statsByUser[p.id]?.last ?? null,
        tags: statsByUser[p.id]?.tags ?? [],
        is_paid: statsByUser[p.id]?.is_paid ?? false,
      })),
    );
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const featMin = Number(filterFeatureMin) || 0;
    const keyMin = Number(filterKeyMin) || 0;
    const ageMinDays = Number(filterAgeMin) || 0;
    const loginFromMs = filterLoginFrom ? new Date(filterLoginFrom).getTime() : null;
    const loginToMs = filterLoginTo ? new Date(filterLoginTo).getTime() + 86_400_000 : null;
    return users.filter((u) => {
      if (q && !(u.email?.toLowerCase().includes(q) || u.display_name?.toLowerCase().includes(q))) return false;
      if (filterRole !== "all") {
        if (filterRole === "user" ? u.roles.length > 0 && !u.roles.includes("user") : !u.roles.includes(filterRole))
          return false;
      }
      const featCount = u.roles.includes("admin") ? ALL_ROUTE_KEYS.length : u.route_keys.length;
      if (featCount < featMin) return false;
      if (u.total_active_keys < keyMin) return false;
      if (loginFromMs !== null) {
        if (!u.last_sign_in_at || new Date(u.last_sign_in_at).getTime() < loginFromMs) return false;
      }
      if (loginToMs !== null) {
        if (!u.last_sign_in_at || new Date(u.last_sign_in_at).getTime() > loginToMs) return false;
      }
      if (ageMinDays > 0) {
        const days = Math.floor((Date.now() - new Date(u.created_at).getTime()) / 86_400_000);
        if (days < ageMinDays) return false;
      }
      if (filterStatus === "paid" && !u.is_paid) return false;
      if (filterStatus === "free" && u.is_paid) return false;
      return true;
    });
  }, [users, query, filterRole, filterFeatureMin, filterKeyMin, filterLoginFrom, filterLoginTo, filterAgeMin, filterStatus]);

  const resetFilters = () => {
    setQuery("");
    setFilterRole("all");
    setFilterFeatureMin("");
    setFilterKeyMin("");
    setFilterLoginFrom("");
    setFilterLoginTo("");
    setFilterAgeMin("");
    setFilterStatus("all");
  };

  async function callAdmin(body: Record<string, unknown>) {
    const { data: sess } = await supabase.auth.getSession();
    const token = sess.session?.access_token;
    const res = await supabase.functions.invoke("admin-users", {
      body,
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });
    if (res.error) throw new Error(res.error.message);
    if ((res.data as any)?.error) throw new Error((res.data as any).error);
    return res.data;
  }

  async function removeUser(u: ManagedUser) {
    const ok = await confirmDialog({
      title: `Hapus user ${u.email}?`,
      description: "User dan seluruh data terkait akan dihapus permanen.",
      confirmLabel: "Ya, hapus user",
      tone: "danger",
    });
    if (!ok) return;
    try {
      await callAdmin({ action: "delete", user_id: u.id });
      toast.success("User dihapus");
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal hapus");
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <div className="p-4 flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 rounded-full border border-border bg-card/50 px-3 py-2 flex-1 min-w-64">
              <Search className="h-4 w-4 text-muted-foreground" />
              <input
                placeholder="Cari email / nama…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
            </div>
            <button
              onClick={resetFilters}
              className="rounded-full border border-border bg-card/50 px-3 py-2 text-xs text-muted-foreground hover:text-foreground"
            >
              Reset filter
            </button>
            <button
              onClick={() => setCreating(true)}
              className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold text-primary-foreground"
              style={{ background: "var(--gradient-neon)" }}
            >
              <Plus className="h-4 w-4" /> Tambah user
            </button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2 text-xs">
            <label className="flex flex-col gap-1">
              <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Role</span>
              <select
                value={filterRole}
                onChange={(e) => setFilterRole(e.target.value as "all" | Role)}
                className="rounded-lg border border-border bg-card/50 px-2 py-1.5 outline-none"
              >
                <option value="all">Semua</option>
                <option value="admin">Admin</option>
                <option value="editor">Editor</option>
                <option value="user">User</option>
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Fitur min.</span>
              <input
                type="number"
                min={0}
                value={filterFeatureMin}
                onChange={(e) => setFilterFeatureMin(e.target.value)}
                placeholder="0"
                className="rounded-lg border border-border bg-card/50 px-2 py-1.5 outline-none"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Total key min.</span>
              <input
                type="number"
                min={0}
                value={filterKeyMin}
                onChange={(e) => setFilterKeyMin(e.target.value)}
                placeholder="0"
                className="rounded-lg border border-border bg-card/50 px-2 py-1.5 outline-none"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Login dari</span>
              <input
                type="date"
                value={filterLoginFrom}
                onChange={(e) => setFilterLoginFrom(e.target.value)}
                className="rounded-lg border border-border bg-card/50 px-2 py-1.5 outline-none"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Login s/d</span>
              <input
                type="date"
                value={filterLoginTo}
                onChange={(e) => setFilterLoginTo(e.target.value)}
                className="rounded-lg border border-border bg-card/50 px-2 py-1.5 outline-none"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Usia (hari) min.</span>
              <input
                type="number"
                min={0}
                value={filterAgeMin}
                onChange={(e) => setFilterAgeMin(e.target.value)}
                placeholder="0"
                className="rounded-lg border border-border bg-card/50 px-2 py-1.5 outline-none"
              />
            </label>
            <label className="flex flex-col gap-1 col-span-2 md:col-span-1">
              <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Status</span>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value as "all" | "free" | "paid")}
                className="rounded-lg border border-border bg-card/50 px-2 py-1.5 outline-none"
              >
                <option value="all">Semua</option>
                <option value="free">Free User</option>
                <option value="paid">Paid User</option>
              </select>
            </label>
          </div>
        </div>
      </Card>

      <div className="hidden lg:block">
      <Card>
        {loading ? (
          <div className="p-8 flex items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                <tr className="border-b border-border/60">
                  <th className="px-4 py-3">User</th>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3">Akses fitur</th>
                  <th className="px-4 py-3">Total Token/API Key</th>
                  <th className="px-4 py-3">Login terakhir</th>
                  <th className="px-4 py-3">Usia Akun</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((u) => (
                  <tr key={u.id} className="border-b border-border/40 hover:bg-sidebar-accent/20">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        {u.avatar_url ? (
                          <img src={u.avatar_url} className="h-9 w-9 rounded-full object-cover" />
                        ) : (
                          <span
                            className="h-9 w-9 rounded-full grid place-items-center text-primary-foreground font-display text-sm"
                            style={{ background: "var(--gradient-neon)" }}
                          >
                            {(u.display_name || u.email || "U")[0]?.toUpperCase()}
                          </span>
                        )}
                        <div className="min-w-0">
                          <div className="font-medium truncate flex items-center gap-1.5">
                            <span className="truncate">{u.display_name || "—"}</span>
                            {u.tags.map((t) => (
                              <TagBadge key={t} tag={t} />
                            ))}
                          </div>
                          <div className="text-xs text-muted-foreground truncate">{u.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {u.roles.length === 0 && (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                        {u.roles.map((r) => (
                          <span
                            key={r}
                            className={[
                              "text-[10px] font-mono uppercase tracking-widest px-2 py-0.5 rounded-full border",
                              r === "admin"
                                ? "border-primary/50 text-primary bg-primary/10"
                                : r === "editor"
                                  ? "border-accent/50 text-accent bg-accent/10"
                                  : "border-border text-muted-foreground",
                            ].join(" ")}
                          >
                            {r}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {u.roles.includes("admin") ? (
                        <span className="text-primary">Semua fitur</span>
                      ) : (
                        `${u.route_keys.length} / ${ALL_ROUTE_KEYS.length} fitur`
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      <div className="flex flex-col leading-tight">
                        <span className="font-mono text-sm">
                          <span className="text-primary text-base font-semibold">
                            {u.total_active_keys}
                          </span>{" "}
                          <span className="text-muted-foreground">Token/API Key</span>
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground font-mono">
                      <span className="inline-flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {relativeTime(u.last_sign_in_at)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground font-mono">
                      {accountAge(u.created_at)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={[
                          "inline-flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-widest px-2 py-1 rounded-full border w-fit",
                          u.is_paid
                            ? "border-amber-300/60 text-amber-200 bg-amber-400/10"
                            : "border-border text-muted-foreground bg-card/40",
                        ].join(" ")}
                        title={u.is_paid ? "User pernah membayar & masa aktif fitur premium masih tersedia" : "Belum ada pembayaran aktif"}
                      >
                        <span
                          className={[
                            "h-2.5 w-2.5 rounded-full border",
                            u.is_paid
                              ? "bg-amber-300 border-amber-200 shadow-[0_0_8px_rgba(252,211,77,0.7)]"
                              : "bg-white border-white/70",
                          ].join(" ")}
                        />
                        {u.is_paid ? "Paid User" : "Free User"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 justify-end">
                        <button
                          onClick={() => setEditing(u)}
                          className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card/50 px-3 py-1.5 text-xs hover:bg-card"
                        >
                          <UserCog className="h-3.5 w-3.5" /> Kelola
                        </button>
                        <button
                          onClick={() => removeUser(u)}
                          className="inline-flex items-center gap-1.5 rounded-full border border-rose-400/40 text-rose-300 px-3 py-1.5 text-xs hover:bg-rose-500/10"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-10 text-center text-sm text-muted-foreground">
                      Tidak ada user.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      </div>

      {/* Mobile & tablet compact user list. Detail info is dibuka via modal saat nama diklik. */}
      <Card>
        <div className="lg:hidden">
          {loading ? (
            <div className="p-8 flex items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-muted-foreground">Tidak ada user.</div>
          ) : (
            <ul className="divide-y divide-border/50">
              {filtered.map((u) => (
                <li key={u.id} className="flex items-center gap-2 px-3 py-3">
                  <button
                    onClick={() => setMobileDetail(u)}
                    className="flex-1 min-w-0 flex items-center gap-2.5 text-left"
                    title="Lihat detail user"
                  >
                    {u.avatar_url ? (
                      <img src={u.avatar_url} className="h-9 w-9 rounded-full object-cover shrink-0" />
                    ) : (
                      <span
                        className="h-9 w-9 rounded-full grid place-items-center text-primary-foreground font-display text-sm shrink-0"
                        style={{ background: "var(--gradient-neon)" }}
                      >
                        {(u.display_name || u.email || "U")[0]?.toUpperCase()}
                      </span>
                    )}
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate flex items-center gap-1.5">
                        <span className="truncate">{u.display_name || u.email || "—"}</span>
                        {u.tags.map((t) => (
                          <TagBadge key={t} tag={t} />
                        ))}
                      </div>
                      <div className="text-[11px] text-muted-foreground truncate">{u.email}</div>
                    </div>
                  </button>
                  {/* Tablet-only extra columns */}
                  <div className="hidden md:flex items-center gap-4 shrink-0 pr-2">
                    <div className="text-right leading-tight">
                      <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Token/Key</div>
                      <div className="text-sm font-semibold text-primary">{u.total_active_keys}</div>
                    </div>
                    <div className="text-right leading-tight min-w-[7rem]">
                      <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Login terakhir</div>
                      <div className="text-xs font-mono text-muted-foreground inline-flex items-center gap-1 justify-end">
                        <Clock className="h-3 w-3" />
                        {relativeTime(u.last_sign_in_at)}
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => setEditing(u)}
                    className="shrink-0 inline-flex items-center gap-1 rounded-full border border-border bg-card/50 px-2.5 py-1.5 text-[11px] font-medium"
                    title="Kelola user"
                  >
                    <UserCog className="h-3.5 w-3.5" />
                    Kelola
                  </button>
                  <button
                    onClick={() => removeUser(u)}
                    className="shrink-0 inline-flex items-center rounded-full border border-rose-400/40 text-rose-300 px-2 py-1.5"
                    title="Hapus user"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>


      {mobileDetail && (
        <Modal title={mobileDetail.email || mobileDetail.display_name || "Detail user"} onClose={() => setMobileDetail(null)}>
          <div className="p-5 space-y-3 text-sm">
            <DetailRow label="Nama" value={mobileDetail.display_name || "—"} />
            <DetailRow label="Email" value={mobileDetail.email || "—"} />
            <DetailRow label="Role" value={mobileDetail.roles.join(", ") || "—"} />
            <DetailRow
              label="Akses fitur"
              value={
                mobileDetail.roles.includes("admin")
                  ? "Semua fitur"
                  : `${mobileDetail.route_keys.length} / ${ALL_ROUTE_KEYS.length} fitur`
              }
            />
            <DetailRow label="Total Token/API Key" value={String(mobileDetail.total_active_keys)} />
            <DetailRow label="Login terakhir" value={relativeTime(mobileDetail.last_sign_in_at)} />
            <DetailRow label="Usia akun" value={accountAge(mobileDetail.created_at)} />
            <DetailRow label="Status" value={mobileDetail.is_paid ? "Paid User" : "Free User"} />
            {mobileDetail.tags.length > 0 && (
              <DetailRow label="Tag" value={mobileDetail.tags.join(", ")} />
            )}
            <div className="pt-2 flex justify-end">
              <button
                onClick={() => setMobileDetail(null)}
                className="inline-flex items-center gap-2 rounded-full px-5 py-2 text-sm font-semibold text-primary-foreground"
                style={{ background: "var(--gradient-neon)" }}
              >
                OK
              </button>
            </div>
          </div>
        </Modal>
      )}

      {creating && (
        <CreateUserModal
          onClose={() => setCreating(false)}
          onDone={() => {
            setCreating(false);
            load();
          }}
          callAdmin={callAdmin}
        />
      )}
      {editing && (
        <EditUserModal
          user={editing}
          onClose={() => setEditing(null)}
          onDone={() => {
            setEditing(null);
            load();
          }}
          callAdmin={callAdmin}
        />
      )}
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-border/40 pb-1.5">
      <span className="text-[11px] uppercase tracking-widest text-muted-foreground">{label}</span>
      <span className="text-sm text-foreground/95 text-right break-words">{value}</span>
    </div>
  );
}

function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-background/70 backdrop-blur-sm p-4">
      <div className="neumorph w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border/60">
          <div className="font-display text-lg">{title}</div>
          <button onClick={onClose} className="h-8 w-8 grid place-items-center rounded-full border border-border">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

function CreateUserModal({
  onClose,
  onDone,
  callAdmin,
}: {
  onClose: () => void;
  onDone: () => void;
  callAdmin: (b: Record<string, unknown>) => Promise<any>;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState<Role>("user");
  const [routeKeys, setRouteKeys] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await callAdmin({
        action: "create",
        email,
        password,
        display_name: displayName,
        role,
        route_keys: role === "admin" ? [] : routeKeys,
      });
      toast.success("User dibuat");
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal membuat user");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="Tambah user baru" onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <Field label="Email">
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} />
        </Field>
        <Field label="Nama tampilan">
          <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} className={inputCls} />
        </Field>
        <Field label="Password sementara">
          <input type="text" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} className={inputCls} />
        </Field>
        <Field label="Role">
          <RoleSelect value={role} onChange={setRole} />
        </Field>
        {role !== "admin" && (
          <Field label="Akses fitur">
            <RoutePermissionsPicker value={routeKeys} onChange={setRouteKeys} />
          </Field>
        )}
        <button
          type="submit"
          disabled={saving}
          className="mt-2 inline-flex items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
          style={{ background: "var(--gradient-neon)" }}
        >
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          <Plus className="h-4 w-4" /> Buat user
        </button>
      </form>
    </Modal>
  );
}

function EditUserModal({
  user,
  onClose,
  onDone,
  callAdmin,
}: {
  user: ManagedUser;
  onClose: () => void;
  onDone: () => void;
  callAdmin: (b: Record<string, unknown>) => Promise<any>;
}) {
  const [displayName, setDisplayName] = useState(user.display_name ?? "");
  const [role, setRole] = useState<Role>(user.roles[0] ?? "user");
  const [routeKeys, setRouteKeys] = useState<string[]>(user.route_keys);
  const [newPassword, setNewPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [tags, setTags] = useState<UserTag[]>(user.tags ?? []);
  const saveTagsFn = useServerFn(setUserTags);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      // Update profile
      const { error: pErr } = await supabase
        .from("profiles")
        .update({ display_name: displayName })
        .eq("id", user.id);
      if (pErr) throw pErr;

      // Update role: delete existing, insert new
      const { error: dRoleErr } = await supabase.from("user_roles").delete().eq("user_id", user.id);
      if (dRoleErr) throw dRoleErr;
      const { error: iRoleErr } = await supabase.from("user_roles").insert({ user_id: user.id, role });
      if (iRoleErr) throw iRoleErr;

      // Update route permissions
      const { error: dPermErr } = await supabase
        .from("route_permissions")
        .delete()
        .eq("user_id", user.id);
      if (dPermErr) throw dPermErr;
      if (role !== "admin" && routeKeys.length > 0) {
        const { error: iPermErr } = await supabase
          .from("route_permissions")
          .insert(routeKeys.map((k) => ({ user_id: user.id, route_key: k })));
        if (iPermErr) throw iPermErr;
      }

      // Reset password if provided
      if (newPassword) {
        await callAdmin({ action: "reset_password", user_id: user.id, password: newPassword });
      }

      // Update label VIP/VVIP
      const before = [...(user.tags ?? [])].sort().join(",");
      const after = [...tags].sort().join(",");
      if (before !== after) {
        await saveTagsFn({ data: { userId: user.id, tags } });
      }

      toast.success("Perubahan tersimpan");
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal menyimpan");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={`Kelola ${user.email}`} onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <Field label="Nama tampilan">
          <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} className={inputCls} />
        </Field>
        <Field label="Role">
          <RoleSelect value={role} onChange={setRole} />
        </Field>
        <Field label="Label khusus">
          <TagPicker value={tags} onChange={setTags} />
        </Field>
        {role !== "admin" && (
          <Field label="Akses fitur (per halaman)">
            <RoutePermissionsPicker value={routeKeys} onChange={setRouteKeys} />
          </Field>
        )}
        <Field label="Reset password (opsional)">
          <div className="flex items-center gap-2 rounded-2xl border border-border bg-card/50 px-3 py-2.5">
            <KeyRound className="h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Kosongkan jika tidak diubah"
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>
        </Field>
        <button
          type="submit"
          disabled={saving}
          className="mt-2 inline-flex items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
          style={{ background: "var(--gradient-neon)" }}
        >
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          <Save className="h-4 w-4" /> Simpan
        </button>
      </form>
    </Modal>
  );
}

const inputCls =
  "w-full rounded-2xl border border-border bg-card/50 px-3 py-2.5 text-sm outline-none placeholder:text-muted-foreground focus:border-primary/60";

export function TagBadge({ tag }: { tag: UserTag }) {
  const isVvip = tag === "vvip";
  return (
    <span
      className={[
        "inline-flex items-center gap-1 text-[9px] font-mono uppercase tracking-widest px-1.5 py-0.5 rounded-full border",
        isVvip
          ? "border-amber-300/60 text-amber-200 bg-amber-400/10"
          : "border-fuchsia-400/50 text-fuchsia-200 bg-fuchsia-500/10",
      ].join(" ")}
    >
      <Crown className="h-2.5 w-2.5" />
      {tag}
    </span>
  );
}

function TagPicker({ value, onChange }: { value: UserTag[]; onChange: (v: UserTag[]) => void }) {
  function toggle(t: UserTag) {
    onChange(value.includes(t) ? value.filter((x) => x !== t) : [...value, t]);
  }
  const opts: { v: UserTag; label: string; desc: string }[] = [
    { v: "vip", label: "VIP", desc: "User prioritas" },
    { v: "vvip", label: "VVIP", desc: "Top tier / partner" },
  ];
  return (
    <div className="grid grid-cols-2 gap-2">
      {opts.map((o) => {
        const on = value.includes(o.v);
        return (
          <button
            key={o.v}
            type="button"
            onClick={() => toggle(o.v)}
            className={[
              "text-left rounded-2xl border px-3 py-2.5 transition flex items-center gap-2",
              on
                ? "border-primary/60 bg-primary/10"
                : "border-border bg-card/40 hover:bg-card/70",
            ].join(" ")}
          >
            <Crown className={on ? "h-4 w-4 text-primary" : "h-4 w-4 text-muted-foreground"} />
            <div>
              <div className="text-sm font-medium">{o.label}</div>
              <div className="text-[10px] text-muted-foreground leading-tight">{o.desc}</div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function RoleSelect({ value, onChange }: { value: Role; onChange: (r: Role) => void }) {
  const options: { v: Role; label: string; desc: string }[] = [
    { v: "admin", label: "Admin", desc: "Akses penuh & kelola user" },
    { v: "editor", label: "Editor", desc: "Akses ke fitur yang dipilih" },
    { v: "user", label: "User", desc: "Akses ke fitur yang dipilih" },
  ];
  return (
    <div className="grid grid-cols-3 gap-2">
      {options.map((o) => (
        <button
          key={o.v}
          type="button"
          onClick={() => onChange(o.v)}
          className={[
            "text-left rounded-2xl border px-3 py-2.5 transition",
            value === o.v
              ? "border-primary/60 bg-primary/10"
              : "border-border bg-card/40 hover:bg-card/70",
          ].join(" ")}
        >
          <div className="text-sm font-medium">{o.label}</div>
          <div className="text-[10px] text-muted-foreground leading-tight">{o.desc}</div>
        </button>
      ))}
    </div>
  );
}

function RoutePermissionsPicker({
  value,
  onChange,
}: {
  value: string[];
  onChange: (v: string[]) => void;
}) {
  const groups: Record<string, typeof ALL_ROUTE_KEYS> = {};
  ALL_ROUTE_KEYS.forEach((r) => {
    (groups[r.group] ||= []).push(r);
  });
  function toggle(k: string) {
    onChange(value.includes(k) ? value.filter((x) => x !== k) : [...value, k]);
  }
  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onChange(ALL_ROUTE_KEYS.map((r) => r.key))}
          className="text-[10px] font-mono uppercase tracking-widest rounded-full border border-border px-2.5 py-1 hover:bg-card"
        >
          Pilih semua
        </button>
        <button
          type="button"
          onClick={() => onChange([])}
          className="text-[10px] font-mono uppercase tracking-widest rounded-full border border-border px-2.5 py-1 hover:bg-card"
        >
          Kosongkan
        </button>
      </div>
      {Object.entries(groups).map(([g, items]) => (
        <div key={g} className="flex flex-col gap-1.5">
          <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">{g}</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
            {items.map((it) => {
              const on = value.includes(it.key);
              return (
                <button
                  key={it.key}
                  type="button"
                  onClick={() => toggle(it.key)}
                  className={[
                    "flex items-center gap-2 rounded-xl border px-3 py-2 text-sm text-left transition",
                    on ? "border-primary/60 bg-primary/10" : "border-border bg-card/40 hover:bg-card/70",
                  ].join(" ")}
                >
                  <span
                    className={[
                      "h-4 w-4 rounded border grid place-items-center",
                      on ? "bg-primary border-primary" : "border-border",
                    ].join(" ")}
                  >
                    {on && <span className="text-[10px] text-primary-foreground">✓</span>}
                  </span>
                  <span className="flex-1 truncate">{it.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
