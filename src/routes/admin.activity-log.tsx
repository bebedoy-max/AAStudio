import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Loader2, ShieldCheck, Search, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { DashboardShell, PageHero } from "@/components/dashboard/shell";
import { Card } from "@/components/dashboard/ui";

export const Route = createFileRoute("/admin/activity-log")({
  head: () => ({
    meta: [
      { title: "Log Aktivitas — Admin AA Creative Studio" },
      { name: "description", content: "Lihat semua aktivitas pengguna dengan filter kategori, aksi, user, dan rentang tanggal." },
    ],
  }),
  component: Page,
});

type LogRow = {
  id: string;
  user_id: string | null;
  category: string;
  action: string;
  details: Record<string, unknown> | null;
  user_agent: string | null;
  created_at: string;
};

type Profile = { id: string; email: string | null; display_name: string | null };

const CATEGORIES = ["", "auth", "profile", "generate", "payment", "admin", "system"];

function Page() {
  return (
    <DashboardShell>
      <PageHero
        eyebrow="Admin"
        title="Log"
        highlight="Aktivitas"
        desc="Rekam jejak seluruh aktivitas pengguna: login, generate, profil, pembayaran, dll."
      />
      <Gate />
    </DashboardShell>
  );
}

function Gate() {
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
  return <Body />;
}

function Body() {
  const [rows, setRows] = useState<LogRow[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState("");
  const [actionFilter, setActionFilter] = useState("");
  const [userFilter, setUserFilter] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [limit] = useState(500);

  async function load() {
    setLoading(true);
    let q = supabase
      .from("user_activity_logs" as never)
      .select("id, user_id, category, action, details, user_agent, created_at")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (category) q = q.eq("category", category);
    if (actionFilter.trim()) q = q.ilike("action", `%${actionFilter.trim()}%`);
    if (from) q = q.gte("created_at", new Date(from).toISOString());
    if (to) q = q.lte("created_at", new Date(to + "T23:59:59").toISOString());
    const { data } = await q;
    const list = ((data ?? []) as unknown) as LogRow[];
    setRows(list);

    const ids = Array.from(new Set(list.map((r) => r.user_id).filter(Boolean))) as string[];
    if (ids.length) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, email, display_name")
        .in("id", ids);
      const map: Record<string, Profile> = {};
      ((profs ?? []) as Profile[]).forEach((p) => (map[p.id] = p));
      setProfiles(map);
    } else {
      setProfiles({});
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    const q = userFilter.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => {
      const p = r.user_id ? profiles[r.user_id] : null;
      return (
        p?.email?.toLowerCase().includes(q) ||
        p?.display_name?.toLowerCase().includes(q) ||
        r.user_id?.toLowerCase().includes(q)
      );
    });
  }, [rows, profiles, userFilter]);

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <div className="p-4 grid grid-cols-1 md:grid-cols-6 gap-3">
          <div className="md:col-span-2 flex items-center gap-2 rounded-full border border-border bg-card/50 px-3 py-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <input
              placeholder="Cari user (email/nama)…"
              value={userFilter}
              onChange={(e) => setUserFilter(e.target.value)}
              className="flex-1 bg-transparent text-sm outline-none"
            />
          </div>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="rounded-full border border-border bg-card/50 px-3 py-2 text-sm"
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c ? c : "Semua kategori"}
              </option>
            ))}
          </select>
          <input
            placeholder="Aksi (contains)"
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className="rounded-full border border-border bg-card/50 px-3 py-2 text-sm"
          />
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="rounded-full border border-border bg-card/50 px-3 py-2 text-sm"
          />
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="rounded-full border border-border bg-card/50 px-3 py-2 text-sm"
          />
          <button
            onClick={load}
            className="md:col-span-6 inline-flex items-center justify-center gap-2 rounded-full px-4 py-2 text-sm font-semibold text-primary-foreground"
            style={{ background: "var(--gradient-neon)" }}
          >
            <RefreshCw className="h-4 w-4" /> Terapkan filter
          </button>
        </div>
      </Card>

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
                  <th className="px-4 py-3">Waktu</th>
                  <th className="px-4 py-3">User</th>
                  <th className="px-4 py-3">Kategori</th>
                  <th className="px-4 py-3">Aksi</th>
                  <th className="px-4 py-3">Detail</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const p = r.user_id ? profiles[r.user_id] : null;
                  return (
                    <tr key={r.id} className="border-b border-border/40 align-top">
                      <td className="px-4 py-2 font-mono text-xs whitespace-nowrap">
                        {new Date(r.created_at).toLocaleString("id-ID", {
                          dateStyle: "short",
                          timeStyle: "medium",
                        })}
                      </td>
                      <td className="px-4 py-2 text-xs">
                        <div className="font-medium">{p?.display_name || "—"}</div>
                        <div className="text-muted-foreground">{p?.email ?? r.user_id?.slice(0, 8)}</div>
                      </td>
                      <td className="px-4 py-2">
                        <span className="text-[10px] font-mono uppercase tracking-widest px-2 py-0.5 rounded-full border border-border text-muted-foreground">
                          {r.category}
                        </span>
                      </td>
                      <td className="px-4 py-2 font-mono text-xs">{r.action}</td>
                      <td className="px-4 py-2 text-xs text-muted-foreground max-w-md">
                        {r.details ? (
                          <pre className="whitespace-pre-wrap break-words font-mono text-[10px]">
                            {JSON.stringify(r.details)}
                          </pre>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 text-center text-sm text-muted-foreground">
                      Tidak ada log yang cocok dengan filter.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
