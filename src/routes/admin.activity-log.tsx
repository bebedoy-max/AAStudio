import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Loader2, ShieldCheck, Search, RefreshCw, Download } from "lucide-react";
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

function StatusBadge({ status }: { status: string }) {
  if (!status) return <span className="text-muted-foreground">—</span>;
  const map: Record<string, string> = {
    success: "border-emerald-500/40 text-emerald-400 bg-emerald-500/10",
    error: "border-rose-500/40 text-rose-400 bg-rose-500/10",
    partial: "border-amber-500/40 text-amber-400 bg-amber-500/10",
    started: "border-sky-500/40 text-sky-400 bg-sky-500/10",
  };
  const cls = map[status] || "border-border text-muted-foreground";
  return (
    <span className={`text-[10px] font-mono uppercase tracking-widest px-2 py-0.5 rounded-full border ${cls}`}>
      {status}
    </span>
  );
}

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
  const [exportOpen, setExportOpen] = useState(false);
  const [mobileRow, setMobileRow] = useState<LogRow | null>(null);

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

  function fileStamp() {
    const d = new Date();
    const p = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
  }
  function activeFilterSummary() {
    const parts: string[] = [];
    if (category) parts.push(`kategori=${category}`);
    if (actionFilter.trim()) parts.push(`aksi~${actionFilter.trim()}`);
    if (userFilter.trim()) parts.push(`user~${userFilter.trim()}`);
    if (from) parts.push(`from=${from}`);
    if (to) parts.push(`to=${to}`);
    return parts.length ? parts.join(" · ") : "semua data";
  }
  function rowsAsTable() {
    return filtered.map((r) => {
      const p = r.user_id ? profiles[r.user_id] : null;
      return {
        waktu: new Date(r.created_at).toLocaleString("id-ID", {
          dateStyle: "short",
          timeStyle: "medium",
        }),
        nama: p?.display_name || "",
        email: p?.email || r.user_id || "",
        kategori: r.category,
        aksi: r.action,
        detail: r.details ? JSON.stringify(r.details) : "",
      };
    });
  }
  function download(name: string, mime: string, content: string | Blob) {
    const blob = content instanceof Blob ? content : new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function exportCSV() {
    const table = rowsAsTable();
    const headers = ["Waktu", "Nama", "Email/User", "Kategori", "Aksi", "Detail"];
    const esc = (v: string) => `"${(v ?? "").replace(/"/g, '""')}"`;
    const lines = [headers.map(esc).join(",")];
    for (const r of table) {
      lines.push([r.waktu, r.nama, r.email, r.kategori, r.aksi, r.detail].map(esc).join(","));
    }
    download(`log-aktivitas-${fileStamp()}.csv`, "text/csv;charset=utf-8", "\uFEFF" + lines.join("\n"));
    setExportOpen(false);
  }
  function exportTXT() {
    const table = rowsAsTable();
    const head = `Log Aktivitas — filter: ${activeFilterSummary()}\nTotal: ${table.length} entri\n${"=".repeat(72)}\n\n`;
    const body = table
      .map(
        (r) =>
          `[${r.waktu}]\n  User    : ${r.nama} <${r.email}>\n  Kategori: ${r.kategori}\n  Aksi    : ${r.aksi}\n  Detail  : ${r.detail || "—"}`,
      )
      .join("\n\n");
    download(`log-aktivitas-${fileStamp()}.txt`, "text/plain;charset=utf-8", head + body);
    setExportOpen(false);
  }
  function exportPDF() {
    const table = rowsAsTable();
    const rowsHtml = table
      .map(
        (r) =>
          `<tr><td>${r.waktu}</td><td><b>${r.nama || "—"}</b><br/><span class="muted">${r.email}</span></td><td>${r.kategori}</td><td>${r.aksi}</td><td class="detail">${(r.detail || "—").replace(/</g, "&lt;")}</td></tr>`,
      )
      .join("");
    const html = `<!doctype html><html><head><meta charset="utf-8"/><title>Log Aktivitas</title>
<style>
*{box-sizing:border-box}
body{font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#111;margin:24px}
h1{margin:0 0 4px;font-size:18px}
.meta{color:#555;font-size:11px;margin-bottom:12px}
table{width:100%;border-collapse:collapse;font-size:11px}
th,td{border:1px solid #ccc;padding:6px;vertical-align:top;text-align:left}
th{background:#f2f2f2}
.muted{color:#666;font-size:10px}
.detail{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:10px;word-break:break-word;max-width:340px}
@media print{@page{size:A4 landscape;margin:12mm}}
</style></head><body>
<h1>Log Aktivitas</h1>
<div class="meta">Filter: ${activeFilterSummary()} · Total: ${table.length} entri · Dicetak ${new Date().toLocaleString("id-ID")}</div>
<table><thead><tr><th>Waktu</th><th>User</th><th>Kategori</th><th>Aksi</th><th>Detail</th></tr></thead><tbody>${rowsHtml || '<tr><td colspan="5" style="text-align:center;padding:24px;color:#666">Tidak ada data.</td></tr>'}</tbody></table>
<script>window.onload=()=>{setTimeout(()=>window.print(),200);}</script>
</body></html>`;
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.open();
    w.document.write(html);
    w.document.close();
    setExportOpen(false);
  }

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
          <div className="md:col-span-6 flex flex-wrap items-center gap-2">
            <button
              onClick={load}
              className="flex-1 min-w-[12rem] inline-flex items-center justify-center gap-2 rounded-full px-4 py-2 text-sm font-semibold text-primary-foreground"
              style={{ background: "var(--gradient-neon)" }}
            >
              <RefreshCw className="h-4 w-4" /> Terapkan filter
            </button>
            <div className="relative">
              <button
                onClick={() => setExportOpen((v) => !v)}
                className="inline-flex items-center gap-2 rounded-full border border-border bg-card/50 px-4 py-2 text-sm hover:bg-sidebar-accent/60"
                title={`Unduh ${filtered.length} entri sesuai filter`}
              >
                <Download className="h-4 w-4" /> Unduh ({filtered.length})
              </button>
              {exportOpen && (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => setExportOpen(false)} />
                  <div className="absolute right-0 top-full mt-2 z-40 w-56 neumorph p-1">
                    <button onClick={exportCSV} className="w-full text-left px-3 py-2 rounded-lg text-sm hover:bg-sidebar-accent/60">
                      Excel / CSV (.csv)
                    </button>
                    <button onClick={exportPDF} className="w-full text-left px-3 py-2 rounded-lg text-sm hover:bg-sidebar-accent/60">
                      PDF (print)
                    </button>
                    <button onClick={exportTXT} className="w-full text-left px-3 py-2 rounded-lg text-sm hover:bg-sidebar-accent/60">
                      Teks (.txt)
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </Card>

      <Card>
        {loading ? (
          <div className="p-8 flex items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                  <tr className="border-b border-border/60">
                    <th className="px-4 py-3">Waktu</th>
                    <th className="px-4 py-3">User</th>
                    <th className="px-4 py-3">Kategori</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Aksi</th>
                    <th className="px-4 py-3">Detail</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => {
                    const p = r.user_id ? profiles[r.user_id] : null;
                    const status = (r.details?.status as string | undefined) ?? "";
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
                        <td className="px-4 py-2">
                          <StatusBadge status={status} />
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
                      <td colSpan={6} className="px-4 py-10 text-center text-sm text-muted-foreground">
                        Tidak ada log yang cocok dengan filter.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Mobile: hanya waktu + user, tap untuk lihat detail */}
            <div className="md:hidden">
              {filtered.length === 0 ? (
                <div className="px-4 py-10 text-center text-sm text-muted-foreground">
                  Tidak ada log yang cocok dengan filter.
                </div>
              ) : (
                <ul className="divide-y divide-border/40">
                  {filtered.map((r) => {
                    const p = r.user_id ? profiles[r.user_id] : null;
                    const time = new Date(r.created_at).toLocaleString("id-ID", {
                      dateStyle: "short",
                      timeStyle: "short",
                    });
                    return (
                      <li key={r.id}>
                        <button
                          onClick={() => setMobileRow(r)}
                          className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-sidebar-accent/30"
                        >
                          <div className="font-mono text-[11px] text-muted-foreground shrink-0 min-w-[6.5rem]">
                            {time}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="text-sm truncate">{p?.display_name || p?.email || "—"}</div>
                            {p?.display_name && p?.email && (
                              <div className="text-[11px] text-muted-foreground truncate">{p.email}</div>
                            )}
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </>
        )}
      </Card>

      {mobileRow && (() => {
        const p = mobileRow.user_id ? profiles[mobileRow.user_id] : null;
        return (
          <div
            className="fixed inset-0 z-50 grid place-items-center bg-background/70 backdrop-blur-sm p-4"
            onClick={() => setMobileRow(null)}
          >
            <div
              className="neumorph w-full max-w-md max-h-[85vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-5 py-4 border-b border-border/60">
                <div className="font-display text-base">Detail Aktivitas</div>
                <div className="text-xs text-muted-foreground">
                  {new Date(mobileRow.created_at).toLocaleString("id-ID", { dateStyle: "long", timeStyle: "medium" })}
                </div>
              </div>
              <div className="p-5 space-y-3 text-sm">
                <div>
                  <div className="text-[11px] uppercase tracking-widest text-muted-foreground">User</div>
                  <div className="font-medium">{p?.display_name || "—"}</div>
                  <div className="text-xs text-muted-foreground break-all">{p?.email || mobileRow.user_id || "—"}</div>
                </div>
                <div>
                  <div className="text-[11px] uppercase tracking-widest text-muted-foreground">Kategori</div>
                  <div>{mobileRow.category}</div>
                </div>
                <div>
                  <div className="text-[11px] uppercase tracking-widest text-muted-foreground">Aksi</div>
                  <div className="font-mono text-xs">{mobileRow.action}</div>
                </div>
                <div>
                  <div className="text-[11px] uppercase tracking-widest text-muted-foreground">Detail</div>
                  {mobileRow.details ? (
                    <pre className="whitespace-pre-wrap break-words font-mono text-[10px] mt-1 bg-card/40 border border-border/50 rounded-lg p-2">
                      {JSON.stringify(mobileRow.details, null, 2)}
                    </pre>
                  ) : (
                    <div className="text-muted-foreground">—</div>
                  )}
                </div>
                <div className="pt-2 flex justify-end">
                  <button
                    onClick={() => setMobileRow(null)}
                    className="inline-flex items-center gap-2 rounded-full px-5 py-2 text-sm font-semibold text-primary-foreground"
                    style={{ background: "var(--gradient-neon)" }}
                  >
                    OK
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
