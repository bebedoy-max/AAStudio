import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  Plus,
  Trash2,
  Link2,
  Unlink,
  Search,
  CheckCircle2,
  XCircle,
  MoreVertical,
  Pencil,
  Sparkles,
  Share2,
  Users,
  KeyRound,
  X,
} from "lucide-react";
import { DashboardShell, PageHero } from "@/components/dashboard/shell";
import { Field, Input, Select, PrimaryButton, GhostButton } from "@/components/dashboard/ui";
import {
  startTikTokConnect,
  listTikTokAccounts,
  disconnectTikTokAccount,
} from "@/lib/tiktok/tiktok.functions";

function Panel({ className = "", children }: { className?: string; children: React.ReactNode }) {
  return <div className={"neumorph " + className}>{children}</div>;
}

export const Route = createFileRoute("/manage/accounts")({
  component: AccountsPage,
  head: () => ({
    meta: [
      { title: "Account Manager — Creative Studio" },
      { name: "description", content: "Kelola semua akun provider AI dan sosial media dalam satu tempat." },
      { property: "og:title", content: "Account Manager — Creative Studio" },
      { property: "og:description", content: "Kelola semua akun provider AI dan sosial media dalam satu tempat." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

type Category = "provider" | "social" | "other";

type AccountEntry = {
  id: string;
  name: string;
  category: Category;
  logo: string;
  brandColor: string;
  description: string;
  connected: boolean;
  handle?: string;
  connectedAt?: string;
  scopes?: string[];
  isDefault?: boolean;
};

const DEFAULT_ACCOUNTS: AccountEntry[] = [];

const CATEGORY_META: Record<Category, { label: string; icon: typeof Sparkles; hint: string }> = {
  provider: { label: "AI Provider", icon: Sparkles, hint: "Koneksi ke penyedia model AI" },
  social: { label: "Sosial Media", icon: Share2, hint: "Publish & analytics sosial" },
  other: { label: "Lainnya", icon: Users, hint: "Integrasi custom lainnya" },
};

const STORAGE_KEY = "aatools.manage.accounts.v1";

function loadAccounts(): AccountEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const saved = JSON.parse(raw) as AccountEntry[];
    if (!Array.isArray(saved)) return [];
    // Strip stale demo/seed entries from older versions so the manager
    // starts empty until the user connects a real account.
    return saved.filter(
      (a) =>
        !a.isDefault &&
        !a.id.startsWith("tiktok:") &&
        a.handle !== "@demo_tiktok" &&
        !(a.handle ?? "").startsWith("@demo_"),
    );
  } catch {
    return [];
  }
}

function saveAccounts(list: AccountEntry[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {}
}


function AccountsPage() {
  const [accounts, setAccounts] = useState<AccountEntry[]>([]);

  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | Category>("all");
  const [addOpen, setAddOpen] = useState(false);
  const [menuFor, setMenuFor] = useState<string | null>(null);

  const _listTikTok = useServerFn(listTikTokAccounts);
  const _disconnectTikTok = useServerFn(disconnectTikTokAccount);

  const refreshTikTok = async () => {
    try {
      const rows = (await _listTikTok()) as Array<{
        id: string;
        open_id: string;
        display_name: string | null;
        avatar_url: string | null;
        scope: string | null;
        created_at: string;
      }>;
      const mapped: AccountEntry[] = rows.map((r) => ({
        id: `tiktok:${r.id}`,
        name: "TikTok",
        category: "social",
        logo: "https://sf-static.tiktokcdn.com/obj/eden-sg/uhtyvueh7nulogpoguhm/tiktok-icon2.png",
        brandColor: "#ff2d55",
        description: "Akun TikTok terhubung via OAuth resmi.",
        connected: true,
        handle: r.display_name ? `@${r.display_name}` : r.open_id,
        connectedAt: r.created_at,
        scopes: r.scope ? r.scope.split(",") : undefined,
      }));
      setAccounts((prev) => {
        const withoutTikTok = prev.filter((a) => !a.id.startsWith("tiktok:"));
        return [...mapped, ...withoutTikTok];
      });
    } catch (e) {
      // silent — user might not be signed in yet
      console.warn("[TikTok] list failed", (e as Error).message);
    }
  };

  useEffect(() => {
    setAccounts(loadAccounts());
    refreshTikTok();
    const onMsg = (ev: MessageEvent) => {
      const d = ev.data as { source?: string; ok?: boolean } | null;
      if (d && d.source === "tiktok-oauth" && d.ok) refreshTikTok();
    };
    window.addEventListener("message", onMsg);
    // Handle #leonardo_token=... from browser extension
    try {
      const h = window.location.hash;
      const m = h.match(/leonardo_token=([^&]+)/);
      if (m) {
        const token = decodeURIComponent(m[1]);
        if (/^eyJ[\w-]+\.[\w-]+\.[\w-]+$/.test(token)) {
          saveLeonardoIdToken(token);
          window.history.replaceState(null, "", window.location.pathname + window.location.search);
          setTimeout(() => alert("Token Leonardo dari extension berhasil disimpan."), 100);
        }
      }
    } catch {}
    return () => window.removeEventListener("message", onMsg);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // Only persist local (non-DB) accounts to localStorage.
    saveAccounts(accounts.filter((a) => !a.id.startsWith("tiktok:")));
  }, [accounts]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return accounts.filter((a) => {
      if (filter !== "all" && a.category !== filter) return false;
      if (!q) return true;
      return a.name.toLowerCase().includes(q) || a.description.toLowerCase().includes(q);
    });
  }, [accounts, query, filter]);

  const stats = useMemo(() => {
    const total = accounts.length;
    const connected = accounts.filter((a) => a.connected).length;
    const providers = accounts.filter((a) => a.category === "provider").length;
    const social = accounts.filter((a) => a.category === "social").length;
    return { total, connected, providers, social };
  }, [accounts]);

  const toggleConnect = (id: string) => {
    // TikTok is real OAuth: "Putuskan" must remove the DB row + revoke locally.
    if (id.startsWith("tiktok:")) {
      void removeAccount(id);
      return;
    }
    setAccounts((prev) =>
      prev.map((a) =>
        a.id === id
          ? {
              ...a,
              connected: !a.connected,
              handle: !a.connected ? a.handle : undefined,
              connectedAt: !a.connected ? new Date().toISOString() : undefined,
            }
          : a,
      ),
    );
  };

  const removeAccount = async (id: string) => {
    if (id.startsWith("tiktok:")) {
      const dbId = id.replace(/^tiktok:/, "");
      try {
        await _disconnectTikTok({ data: { id: dbId } });
        await refreshTikTok();
      } catch (e) {
        console.error("[TikTok] disconnect failed", (e as Error).message);
      }
      setMenuFor(null);
      return;
    }
    setAccounts((prev) => prev.filter((a) => a.id !== id));
    setMenuFor(null);
  };


  const addAccount = (entry: AccountEntry) => {
    setAccounts((prev) => [...prev, entry]);
    setAddOpen(false);
  };

  return (
    <DashboardShell>
      <PageHero
        eyebrow="Manage"
        title="Account"
        highlight="Manager"
        desc="Sambungkan semua akun provider AI, sosial media, dan integrasi lain ke Creative Studio dalam satu dashboard."
        action={
          <PrimaryButton onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4" />
            Tambah Akun
          </PrimaryButton>
        }
      />

      <div className="h-6" />

      {/* Stat strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <StatChip label="Total Akun" value={stats.total} />
        <StatChip label="Tersambung" value={stats.connected} tone="ok" />
        <StatChip label="AI Provider" value={stats.providers} />
        <StatChip label="Sosial Media" value={stats.social} />
      </div>

      {/* Toolbar */}
      <Panel className="mb-5 p-3 flex flex-col md:flex-row gap-2 md:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Cari akun (Leonardo, TikTok, dst.)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          {(["all", "provider", "social", "other"] as const).map((k) => {
            const active = filter === k;
            const label =
              k === "all" ? "Semua" : k === "provider" ? "Provider" : k === "social" ? "Sosial" : "Lainnya";
            return (
              <button
                key={k}
                onClick={() => setFilter(k)}
                className={[
                  "px-3 py-2 rounded-xl text-xs font-mono uppercase tracking-[0.14em] transition border",
                  active
                    ? "text-primary-foreground border-transparent"
                    : "text-foreground/70 border-border hover:text-foreground hover:bg-sidebar-accent/60",
                ].join(" ")}
                style={active ? { background: "var(--gradient-neon)" } : undefined}
              >
                {label}
              </button>
            );
          })}
        </div>
      </Panel>

      {/* Grid */}
      {filtered.length === 0 ? (
        <Panel className="p-10 text-center">
          <div className="mx-auto h-14 w-14 rounded-2xl grid place-items-center bg-sidebar-accent/60 border border-border mb-3">
            <KeyRound className="h-6 w-6 text-muted-foreground" />
          </div>
          <div className="text-lg font-semibold">Belum ada akun cocok</div>
          <div className="text-sm text-muted-foreground mt-1">Coba ubah kata kunci atau tambah akun baru.</div>
          <div className="mt-4">
            <PrimaryButton onClick={() => setAddOpen(true)}>
              <Plus className="h-4 w-4" />
              Tambah Akun
            </PrimaryButton>
          </div>
        </Panel>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((acc) => (
            <AccountCard
              key={acc.id}
              account={acc}
              menuOpen={menuFor === acc.id}
              onMenuToggle={() => setMenuFor(menuFor === acc.id ? null : acc.id)}
              onToggle={() => toggleConnect(acc.id)}
              onRemove={() => removeAccount(acc.id)}
            />
          ))}
        </div>
      )}

      {addOpen && <AddAccountDialog onClose={() => setAddOpen(false)} onAdd={addAccount} />}
    </DashboardShell>
  );
}

function StatChip({ label, value, tone }: { label: string; value: number; tone?: "ok" }) {
  return (
    <Panel className="p-3.5 flex items-center justify-between">
      <div>
        <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground">{label}</div>
        <div className="text-2xl font-black mt-0.5">{value}</div>
      </div>
      <div
        className={[
          "h-9 w-9 rounded-xl grid place-items-center border",
          tone === "ok" ? "border-emerald-400/40 text-emerald-300" : "border-border text-muted-foreground",
        ].join(" ")}
        style={tone === "ok" ? { background: "rgba(16,185,129,0.08)" } : undefined}
      >
        <CheckCircle2 className="h-4 w-4" />
      </div>
    </Panel>
  );
}

function AccountCard({
  account,
  menuOpen,
  onMenuToggle,
  onToggle,
  onRemove,
}: {
  account: AccountEntry;
  menuOpen: boolean;
  onMenuToggle: () => void;
  onToggle: () => void;
  onRemove: () => void;
}) {
  const CIcon = CATEGORY_META[account.category].icon;
  return (
    <Panel className="p-5 relative overflow-hidden group">
      {/* accent glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-16 -right-16 h-40 w-40 rounded-full blur-3xl opacity-40 group-hover:opacity-60 transition-opacity"
        style={{ background: account.brandColor }}
      />

      <div className="flex items-start gap-3 relative">
        <div
          className="h-14 w-14 rounded-2xl grid place-items-center shrink-0 border border-border bg-sidebar-accent/60 overflow-hidden"
          style={{ boxShadow: `0 0 24px -8px ${account.brandColor}` }}
        >
          <img
            src={account.logo}
            alt={account.name}
            className="h-9 w-9 object-contain"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = "none";
            }}
          />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <div className="text-base font-bold truncate">{account.name}</div>
            {account.isDefault && (
              <span className="text-[9px] font-mono uppercase tracking-[0.2em] px-1.5 py-0.5 rounded-md border border-border text-muted-foreground">
                Default
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 mt-1 text-[10px] font-mono uppercase tracking-[0.16em] text-muted-foreground">
            <CIcon className="h-3 w-3" />
            {CATEGORY_META[account.category].label}
          </div>
        </div>

        <div className="relative">
          <button
            onClick={onMenuToggle}
            className="h-8 w-8 grid place-items-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-sidebar-accent/60 transition"
            aria-label="Menu"
          >
            <MoreVertical className="h-4 w-4" />
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-9 z-20 w-40 rounded-xl border border-border bg-sidebar/95 backdrop-blur-xl p-1 shadow-2xl">
              <button className="w-full flex items-center gap-2 px-2.5 py-2 text-xs rounded-lg hover:bg-sidebar-accent/60 text-left">
                <Pencil className="h-3.5 w-3.5" /> Edit detail
              </button>
              <button
                onClick={onRemove}
                disabled={account.isDefault}
                className="w-full flex items-center gap-2 px-2.5 py-2 text-xs rounded-lg hover:bg-red-500/10 text-red-300 disabled:opacity-40 disabled:cursor-not-allowed text-left"
              >
                <Trash2 className="h-3.5 w-3.5" /> Hapus
              </button>
            </div>
          )}
        </div>
      </div>

      <p className="text-xs text-muted-foreground mt-3 leading-relaxed line-clamp-2">{account.description}</p>

      {/* status row */}
      <div className="mt-4 flex items-center gap-2 text-xs">
        {account.connected ? (
          <>
            <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md border border-emerald-400/40 text-emerald-300 bg-emerald-500/10">
              <CheckCircle2 className="h-3 w-3" />
              Tersambung
            </span>
            {account.handle && <span className="text-muted-foreground truncate">{account.handle}</span>}
          </>
        ) : (
          <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md border border-border text-muted-foreground">
            <XCircle className="h-3 w-3" />
            Belum tersambung
          </span>
        )}
      </div>

      {/* scopes */}
      {account.scopes && account.scopes.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1">
          {account.scopes.map((s) => (
            <span
              key={s}
              className="text-[10px] font-mono px-1.5 py-0.5 rounded border border-border text-muted-foreground"
            >
              {s}
            </span>
          ))}
        </div>
      )}

      {/* actions */}
      <div className="mt-4 flex items-center gap-2">
        {account.connected ? (
          <GhostButton onClick={onToggle} className="flex-1">
            <Unlink className="h-4 w-4" />
            Putuskan
          </GhostButton>
        ) : (
          <PrimaryButton onClick={onToggle} className="flex-1">
            <Link2 className="h-4 w-4" />
            Sambungkan
          </PrimaryButton>
        )}
      </div>
    </Panel>
  );
}

type ConnectStatus = "idle" | "connecting" | "success" | "failed";

type ProviderOption = {
  value: string;
  label: string;
  logo: string;
  brandColor: string;
  description: string;
};

const SOCIAL_OPTIONS: ProviderOption[] = [
  {
    value: "tiktok",
    label: "TikTok",
    logo: "https://sf-static.tiktokcdn.com/obj/eden-sg/uhtyvueh7nulogpoguhm/tiktok-icon2.png",
    brandColor: "#ff2d55",
    description: "Publish otomatis video ke akun TikTok kamu.",
  },
  {
    value: "facebook",
    label: "Facebook",
    logo: "https://cdn-icons-png.flaticon.com/512/733/733547.png",
    brandColor: "#1877f2",
    description: "Kelola dan publikasikan konten ke halaman Facebook.",
  },
  {
    value: "instagram",
    label: "Instagram",
    logo: "https://cdn-icons-png.flaticon.com/512/733/733558.png",
    brandColor: "#e4405f",
    description: "Jadwalkan posting dan reels ke akun Instagram.",
  },
];

const PROVIDER_OPTIONS: ProviderOption[] = [
  {
    value: "google",
    label: "Google",
    logo: "https://cdn-icons-png.flaticon.com/512/300/300221.png",
    brandColor: "#4285f4",
    description: "Akun Google untuk integrasi login, drive, dan layanan Google.",
  },
  {
    value: "leonardo",
    label: "Leonardo",
    logo: "https://cdn.leonardo.ai/assets/leonardo-favicon.png",
    brandColor: "#7c5cff",
    description: "Provider generate image & video AI (Phoenix, Flux, Motion).",
  },
  {
    value: "elevenlabs",
    label: "ElevenLabs",
    logo: "https://cdn-icons-png.flaticon.com/512/4712/4712035.png",
    brandColor: "#1d1d1d",
    description: "Provider text-to-speech dan voice cloning.",
  },
  {
    value: "weavy",
    label: "Weavy",
    logo: "https://cdn-icons-png.flaticon.com/512/4712/4712035.png",
    brandColor: "#6366f1",
    description: "Provider image generation model Weavy.",
  },
  {
    value: "framia",
    label: "Framia",
    logo: "https://cdn-icons-png.flaticon.com/512/4712/4712035.png",
    brandColor: "#06b6d4",
    description: "Provider image-to-video dan motion generation.",
  },
  {
    value: "roboneo",
    label: "Roboneo",
    logo: "https://cdn-icons-png.flaticon.com/512/4712/4712035.png",
    brandColor: "#f97316",
    description: "Provider motion control dan video generation.",
  },
];

function providerOptionsByCategory(category: Category): ProviderOption[] {
  return category === "provider" ? PROVIDER_OPTIONS : SOCIAL_OPTIONS;
}

// -- Leonardo real Cognito connect helpers --

const LS_LEONARDO_KEYS = "aatools.leonardo.keys";
const LS_LEONARDO_SESSION = "aatools.leonardo.session.v1";

type LeoStoredKey = { id: string; key: string; balance: number | null; status: string; note?: string };

function decodeJwtEmail(token: string): string | null {
  try {
    const parts = token.split(".");
    if (parts.length < 2) return null;
    const b = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = b + "=".repeat((4 - (b.length % 4)) % 4);
    const s = typeof atob === "function" ? atob(padded) : "";
    const p = JSON.parse(s) as { email?: string; "cognito:username"?: string };
    return p.email || p["cognito:username"] || null;
  } catch {
    return null;
  }
}

function saveLeonardoIdToken(idToken: string) {
  try {
    const raw = localStorage.getItem(LS_LEONARDO_KEYS);
    const list: LeoStoredKey[] = raw ? (JSON.parse(raw) as LeoStoredKey[]) : [];
    if (list.some((x) => x.key === idToken)) return;
    const email = decodeJwtEmail(idToken) || undefined;
    const entry: LeoStoredKey = {
      id: `leo_${Date.now().toString(36)}`,
      key: idToken,
      balance: null,
      status: "pending",
      note: email,
    };
    localStorage.setItem(LS_LEONARDO_KEYS, JSON.stringify([entry, ...list]));
  } catch {}
}

function saveLeonardoSession(data: { email: string; refreshToken?: string; clientId?: string; expiresIn?: number }) {
  try {
    const raw = localStorage.getItem(LS_LEONARDO_SESSION);
    const map: Record<string, unknown> = raw ? JSON.parse(raw) : {};
    map[data.email] = {
      refreshToken: data.refreshToken,
      clientId: data.clientId,
      expiresAt: Date.now() + (data.expiresIn ?? 3600) * 1000,
      savedAt: Date.now(),
    };
    localStorage.setItem(LS_LEONARDO_SESSION, JSON.stringify(map));
  } catch {}
}

async function loginLeonardoCognito(payload: {
  email: string;
  password: string;
  clientId?: string;
}): Promise<{ ok: boolean; idToken?: string; refreshToken?: string; expiresIn?: number; error?: string }> {
  try {
    const res = await fetch("/api/public/leonardo-cognito", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = (await res.json()) as {
      ok: boolean;
      idToken?: string;
      refreshToken?: string;
      expiresIn?: number;
      error?: string;
    };
    return data;
  } catch (e) {
    return { ok: false, error: `Jaringan gagal: ${(e as Error).message}` };
  }
}

function AddAccountDialog({
  onClose,
  onAdd,
}: {
  onClose: () => void;
  onAdd: (a: AccountEntry) => void;
}) {
  const [category, setCategory] = useState<Category>("social");
  const [provider, setProvider] = useState<string>("tiktok");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<ConnectStatus>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [clientId, setClientId] = useState("");
  const [connectedMeta, setConnectedMeta] = useState<{ email?: string } | null>(null);

  const availableProviders = providerOptionsByCategory(category);
  const selectedProvider = availableProviders.find((p) => p.value === provider) || availableProviders[0];
  const isLeonardo = category === "provider" && provider === "leonardo";
  const isTikTok = category === "social" && provider === "tiktok";
  const _startTikTok = useServerFn(startTikTokConnect);

  const canSubmit = isTikTok
    ? status !== "connecting"
    : identifier.trim().length > 2 && password.trim().length > 0 && status !== "connecting";

  const handleCategoryChange = (value: Category) => {
    setCategory(value);
    const next = providerOptionsByCategory(value);
    setProvider(next[0].value);
    setStatus("idle");
    setErrorMsg(null);
  };

  const handleConnect = async () => {
    if (!canSubmit) return;
    setStatus("connecting");
    setErrorMsg(null);

    if (isTikTok) {
      try {
        const { authorizeUrl } = await _startTikTok();
        const popup = window.open(authorizeUrl, "tiktok-oauth", "width=560,height=760");
        if (!popup) {
          setErrorMsg("Popup diblokir browser. Izinkan popup lalu coba lagi.");
          setStatus("failed");
          return;
        }
        const onMsg = (ev: MessageEvent) => {
          const d = ev.data as { source?: string; ok?: boolean; message?: string; handle?: string } | null;
          if (!d || d.source !== "tiktok-oauth") return;
          window.removeEventListener("message", onMsg);
          if (d.ok) {
            setConnectedMeta({ email: d.handle });
            setStatus("success");
            // Popup pattern → row sudah tersimpan di DB oleh callback.
            // Tutup dialog; parent akan re-fetch via message listener sendiri.
            setTimeout(() => onClose(), 800);
          } else {
            setErrorMsg(d.message || "OAuth TikTok gagal.");
            setStatus("failed");
          }
        };
        window.addEventListener("message", onMsg);
      } catch (e) {
        setErrorMsg((e as Error).message);
        setStatus("failed");
      }
      return;
    }

    if (isLeonardo) {
      const res = await loginLeonardoCognito({
        email: identifier.trim(),
        password,
        clientId: clientId.trim() || undefined,
      });
      if (!res.ok || !res.idToken) {
        setErrorMsg(res.error || "Login Leonardo gagal.");
        setStatus("failed");
        return;
      }
      const email = decodeJwtEmail(res.idToken) || identifier.trim();
      saveLeonardoIdToken(res.idToken);
      saveLeonardoSession({
        email,
        refreshToken: res.refreshToken,
        clientId: clientId.trim() || undefined,
        expiresIn: res.expiresIn,
      });
      setConnectedMeta({ email });
      setStatus("success");
      return;
    }

    // Provider lain masih simulasi sampai backend real dibangun.
    window.setTimeout(() => {
      const ok = password.trim().length >= 4;
      if (!ok) setErrorMsg("Password terlalu pendek untuk demo.");
      setStatus(ok ? "success" : "failed");
    }, 900);
  };

  const handleOk = () => {
    const handle = connectedMeta?.email || (identifier.includes("@")
      ? identifier
      : identifier.replace(/^https?:\/\//, "").split(/[\/?#]/)[0] || identifier);
    onAdd({
      id: `${selectedProvider.value}-${Date.now().toString(36)}`,
      name: selectedProvider.label,
      category,
      logo: selectedProvider.logo,
      brandColor: selectedProvider.brandColor,
      description: selectedProvider.description,
      connected: true,
      handle,
      connectedAt: new Date().toISOString(),
    });
  };

  return (
    <div
      className="fixed inset-0 z-[80] grid place-items-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="neumorph w-full max-w-lg p-6 relative animate-in zoom-in-95 duration-200"
        style={{ background: "var(--gradient-card, hsl(var(--card)))" }}
      >
        <button
          onClick={onClose}
          className="absolute top-3 right-3 h-8 w-8 grid place-items-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-sidebar-accent/60"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="flex items-center gap-2.5 mb-5">
          <div className="h-9 w-9 rounded-full grid place-items-center" style={{ background: "var(--gradient-neon)" }}>
            <Plus className="h-4 w-4 text-primary-foreground" />
          </div>
          <div>
            <div className="text-lg font-bold">Tambah Akun Baru</div>
            <div className="text-xs text-muted-foreground">
              {isTikTok
                ? "OAuth resmi TikTok — kamu akan diarahkan ke tiktok.com untuk login"
                : isLeonardo
                  ? "Login real ke Leonardo.AI via Cognito — JWT tersimpan otomatis"
                  : "Hubungkan akun sosial media atau provider AI"}
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <Field label="Kategori">
            <Select
              value={category}
              onChange={(e) => handleCategoryChange(e.target.value as Category)}
              options={[
                { value: "social", label: "Sosial Media" },
                { value: "provider", label: "AI Provider" },
              ]}
            />
          </Field>

          <Field label="Provider / Platform">
            <Select
              value={provider}
              onChange={(e) => {
                setProvider(e.target.value);
                setStatus("idle");
                setErrorMsg(null);
              }}
              options={availableProviders.map((p) => ({ value: p.value, label: p.label }))}
            />
          </Field>

          {!isTikTok && (
            <>
              <Field label={isLeonardo ? "Email Leonardo" : "Link Profil / Username / Email"}>
                <Input
                  placeholder={isLeonardo ? "email@domain.com" : "mis. https://tiktok.com/@akunku atau email@domain.com"}
                  value={identifier}
                  onChange={(e) => {
                    setIdentifier(e.target.value);
                    if (status !== "idle") setStatus("idle");
                    setErrorMsg(null);
                  }}
                  disabled={status === "connecting" || status === "success"}
                />
              </Field>

              <Field label="Password">
                <Input
                  type="password"
                  placeholder={isLeonardo ? "Password akun Leonardo" : "Password akun"}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (status !== "idle") setStatus("idle");
                    setErrorMsg(null);
                  }}
                  disabled={status === "connecting" || status === "success"}
                />
              </Field>
            </>
          )}

          {isTikTok && (
            <div className="text-[11px] text-muted-foreground leading-relaxed border border-border rounded-lg p-3 bg-sidebar-accent/30">
              <div className="font-semibold text-foreground/80 mb-1">TikTok OAuth (Sandbox / Production)</div>
              Klik <b>Hubungkan</b> → jendela TikTok terbuka → login &amp; approve akses. Setelah selesai, akun otomatis
              muncul di daftar dengan avatar &amp; display name. Token disimpan terenkripsi di server (AES-GCM) — kamu bisa
              publish video / list video langsung dari aplikasi.
            </div>
          )}

          {isLeonardo && (
            <div className="text-[10px] text-muted-foreground leading-relaxed border border-border rounded-lg p-2.5 bg-sidebar-accent/30">
              <div className="font-semibold text-foreground/80 mb-1">Catatan Keamanan</div>
              Password dikirim satu kali ke server aplikasi ini → diteruskan ke AWS Cognito Leonardo → hanya JWT & refresh token yang disimpan
              (tidak menyimpan password). Login non-browser melanggar Terms of Service Leonardo — resiko akun ditandai/banned ada di user.
              Jika akun kamu pakai MFA / Google SSO / password reset, flow ini tidak akan bekerja — pakai paste JWT manual di Token Manager.
            </div>
          )}

          {isLeonardo && (
            <div>
              <button
                type="button"
                onClick={() => setShowAdvanced((v) => !v)}
                className="text-[10px] font-mono uppercase tracking-[0.16em] text-muted-foreground hover:text-foreground"
              >
                {showAdvanced ? "▾ Advanced" : "▸ Advanced (Cognito ClientId)"}
              </button>
              {showAdvanced && (
                <div className="mt-2">
                  <Field label="Cognito ClientId (opsional)">
                    <Input
                      placeholder="Default: 1ni7hsqe1kt40q19cepqhs1jrn"
                      value={clientId}
                      onChange={(e) => setClientId(e.target.value)}
                      disabled={status === "connecting" || status === "success"}
                    />
                  </Field>
                  <div className="text-[10px] text-muted-foreground mt-1 leading-relaxed">
                    Jika error <code>ResourceNotFoundException</code>, buka DevTools di app.leonardo.ai → Network → cari
                    request ke <code>cognito-idp.us-east-1.amazonaws.com</code> → copy nilai <code>ClientId</code> di body request.
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Status */}
          {status !== "idle" && (
            <div
              className={[
                "flex items-start gap-2 text-xs px-3 py-2 rounded-lg border",
                status === "success"
                  ? "border-emerald-400/40 text-emerald-300 bg-emerald-500/10"
                  : status === "failed"
                    ? "border-red-400/40 text-red-300 bg-red-500/10"
                    : "border-border text-muted-foreground bg-sidebar-accent/40",
              ].join(" ")}
            >
              {status === "connecting" && (
                <>
                  <div className="h-3 w-3 mt-0.5 rounded-full border-2 border-current border-t-transparent animate-spin" />
                  Menghubungkan{isLeonardo ? " ke AWS Cognito Leonardo…" : "…"}
                </>
              )}
              {status === "success" && (
                <>
                  <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <div>
                    Tersambung — {connectedMeta?.email ? <span className="font-mono">{connectedMeta.email}</span> : "akun siap ditambahkan"}.
                    {isLeonardo && <div className="text-[10px] opacity-80 mt-0.5">JWT tersimpan ke Token Manager — semua fitur Leonardo langsung aktif.</div>}
                  </div>
                </>
              )}
              {status === "failed" && (
                <>
                  <XCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <div>
                    <div className="font-semibold">Koneksi Gagal</div>
                    <div className="opacity-90 mt-0.5">{errorMsg || "Periksa kredensial dan coba lagi."}</div>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        <div className="mt-5 flex items-center justify-end gap-2">
          <GhostButton onClick={onClose}>Batal</GhostButton>
          {status === "success" ? (
            <PrimaryButton onClick={handleOk}>
              <CheckCircle2 className="h-4 w-4" />
              Ok
            </PrimaryButton>
          ) : (
            <PrimaryButton onClick={handleConnect} disabled={!canSubmit}>
              <Link2 className="h-4 w-4" />
              {status === "connecting" ? "Menghubungkan…" : status === "failed" ? "Coba Lagi" : "Hubungkan"}
            </PrimaryButton>
          )}
        </div>
      </div>
    </div>
  );
}
