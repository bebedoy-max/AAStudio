// Live feed of the current user's purchase requests, used by the header
// notification bell. Polls Supabase directly (RLS scopes to auth.uid()).
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { decodeCartFromNote, type CartItem } from "@/components/token-bank/buy-dialog";

type LooseClient = { from: (table: string) => any };

export type PurchaseRow = {
  id: string;
  user_id: string;
  route_key: string;
  price_idr: number;
  payment_method_id: string | null;
  payment_method_name: string | null;
  payment_provider: string | null;
  temanqris_order_id: string | null;
  temanqris_qr_image: string | null;
  temanqris_payment_url: string | null;
  temanqris_total_amount: number | null;
  temanqris_expires_at: string | null;
  note: string | null;
  status: "pending" | "approved" | "rejected";
  admin_note: string | null;
  reviewed_at: string | null;
  activated_until: string | null;
  created_at: string;
  updated_at: string;
};

export type PurchaseView = PurchaseRow & {
  cart: CartItem[] | null;
  kind: "token_bank" | "subscription" | "premium" | "other";
  title: string;
};

function classify(row: PurchaseRow): PurchaseView {
  const cart = decodeCartFromNote(row.note);
  const isTokenBank = row.route_key.startsWith("token_bank") || !!cart;
  const kind: PurchaseView["kind"] = isTokenBank
    ? "token_bank"
    : row.route_key === "subscription"
      ? "subscription"
      : "premium";
  const title = isTokenBank
    ? "Pembelian Token/API Key"
    : kind === "subscription"
      ? "Aktivasi Langganan"
      : "Pembelian Fitur Premium";
  return { ...row, cart, kind, title };
}

const PENDING_TTL_MS = 60 * 60 * 1000; // 1 jam
function hidePendingExpired(row: PurchaseRow): boolean {
  if (row.status !== "pending") return true;
  const created = new Date(row.created_at).getTime();
  return Number.isFinite(created) && Date.now() - created < PENDING_TTL_MS;
}

// Egress: `temanqris_qr_image` is a base64 QR data-URL (tens of KB per row).
// It is only ever rendered inside the purchase detail dialog, so it is NOT
// fetched in this polled list — the dialog loads it lazily for one row.
const FEED_COLUMNS =
  "id, user_id, route_key, price_idr, payment_method_id, payment_method_name, payment_provider, temanqris_order_id, temanqris_payment_url, temanqris_total_amount, temanqris_expires_at, note, status, admin_note, reviewed_at, activated_until, created_at, updated_at";

async function fetchFeed(userId: string): Promise<PurchaseView[]> {
  const db = supabase as unknown as LooseClient;
  const { data, error } = await db
    .from("purchase_requests")
    .select(FEED_COLUMNS)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) throw error;
  return ((data ?? []) as PurchaseRow[]).filter(hidePendingExpired).map(classify);
}

export function usePurchaseFeed(pollMs = 60_000): {
  items: PurchaseView[];
  loading: boolean;
  refresh: () => void;
} {
  const { user } = useAuth();
  const [items, setItems] = useState<PurchaseView[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user) {
      setItems([]);
      return;
    }
    let alive = true;
    let lastLoadAt = 0;
    async function load() {
      lastLoadAt = Date.now();
      setLoading(true);
      try {
        const rows = await fetchFeed(user!.id);
        if (!alive) return;
        setItems(rows);
      } catch (e) {
        console.warn("[purchase-feed]", e);
      } finally {
        if (alive) setLoading(false);
      }
    }
    load();
    // Only poll while the tab is visible — a hidden tab does not need updates.
    const t = setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      void load();
    }, pollMs);
    // Refresh on focus, but coalesce rapid focus/blur cycles.
    const onFocus = () => {
      if (Date.now() - lastLoadAt < 10_000) return;
      void load();
    };
    window.addEventListener("focus", onFocus);
    return () => {
      alive = false;
      clearInterval(t);
      window.removeEventListener("focus", onFocus);
    };
  }, [user, pollMs]);

  const refresh = () => {
    if (!user) return;
    void fetchFeed(user.id)
      .then(setItems)
      .catch((e) => console.warn("[purchase-feed]", e));
  };


  return { items, loading, refresh };
}

export function rupiah(n: number) {
  return "Rp " + (n || 0).toLocaleString("id-ID");
}
