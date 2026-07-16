// Live feed of the current user's purchase requests, used by the header
// notification bell. Polls Supabase directly (RLS scopes to auth.uid()).
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { decodeCartFromNote, type CartItem } from "@/components/token-bank/buy-dialog";

export type PurchaseRow = {
  id: string;
  user_id: string;
  route_key: string;
  price_idr: number;
  payment_method_id: string | null;
  payment_method_name: string | null;
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
  kind: "token_bank" | "subscription" | "other";
  title: string;
};

function classify(row: PurchaseRow): PurchaseView {
  const cart = decodeCartFromNote(row.note);
  const isTokenBank = row.route_key.startsWith("token_bank") || !!cart;
  const kind: PurchaseView["kind"] = isTokenBank
    ? "token_bank"
    : row.route_key === "subscription"
      ? "subscription"
      : "other";
  const title = isTokenBank
    ? "Pembelian Token/API Key"
    : kind === "subscription"
      ? "Aktivasi Langganan"
      : row.route_key;
  return { ...row, cart, kind, title };
}

export function usePurchaseFeed(pollMs = 20_000): {
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
    async function load() {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from("purchase_requests")
          .select(
            "id, user_id, route_key, price_idr, payment_method_id, payment_method_name, note, status, admin_note, reviewed_at, activated_until, created_at, updated_at",
          )
          .eq("user_id", user!.id)
          .order("created_at", { ascending: false })
          .limit(20);
        if (error) throw error;
        if (!alive) return;
        setItems(((data ?? []) as PurchaseRow[]).map(classify));
      } catch (e) {
        console.warn("[purchase-feed]", e);
      } finally {
        if (alive) setLoading(false);
      }
    }
    load();
    const t = setInterval(load, pollMs);
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => {
      alive = false;
      clearInterval(t);
      window.removeEventListener("focus", onFocus);
    };
  }, [user, pollMs]);

  const refresh = () => {
    // Trigger a manual reload by nudging the interval — cheap and safe.
    if (!user) return;
    void supabase
      .from("purchase_requests")
      .select(
        "id, user_id, route_key, price_idr, payment_method_id, payment_method_name, note, status, admin_note, reviewed_at, activated_until, created_at, updated_at",
      )
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(20)
      .then(({ data }) => {
        setItems(((data ?? []) as PurchaseRow[]).map(classify));
      });
  };

  return { items, loading, refresh };
}

export function rupiah(n: number) {
  return "Rp " + (n || 0).toLocaleString("id-ID");
}
