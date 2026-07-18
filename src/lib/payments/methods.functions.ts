// Public server fn: kembalikan daftar metode pembayaran yang aktif untuk
// ditampilkan di dialog checkout. TIDAK mengembalikan kredensial apa pun.
import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { methodsForProvider } from "./method-catalog";

export type ActivePaymentMethod = {
  gatewayId: string;
  provider: string; // 'midtrans' | 'doku'
  providerLabel: string;
  environment: "sandbox" | "production";
  methodCode: string; // e.g. QRIS, VIRTUAL_ACCOUNT_BCA
  methodLabel: string; // untuk UI
  kind: "qris" | "va" | "ewallet" | "card" | "convenience" | "direct_debit";
};

function publicClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY missing");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        const h = new Headers(init?.headers);
        if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) {
          h.delete("Authorization");
        }
        h.set("apikey", key);
        return fetch(input, { ...init, headers: h });
      },
    },
  });
}

export const listActivePaymentMethods = createServerFn({ method: "GET" }).handler(
  async (): Promise<ActivePaymentMethod[]> => {
    // Coba pakai publishable client + policy anon SELECT dulu; kalau gagal
    // (mis. policy belum ada), fallback ke admin client — nilai yang di-return
    // memang non-sensitif (label + environment + method code), jadi aman.
    type Row = { id: string; provider: string; label: string; environment: string; is_active: boolean };
    let rows: Row[] = [];
    try {
      const pub = publicClient();
      const { data } = await pub
        .from("payment_gateways")
        .select("id, provider, label, environment, is_active")
        .eq("is_active", true);
      rows = (data as Row[] | null) ?? [];
    } catch {
      rows = [];
    }
    if (rows.length === 0) {
      try {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        type LooseClient = { from: (t: string) => any };
        const admin = supabaseAdmin as unknown as LooseClient;
        const { data } = await admin
          .from("payment_gateways")
          .select("id, provider, label, environment, is_active")
          .eq("is_active", true);
        rows = ((data as Row[] | null) ?? []);
      } catch {
        rows = [];
      }
    }

    const out: ActivePaymentMethod[] = [];
    for (const g of rows ?? []) {
      const methods = methodsForProvider(g.provider);
      for (const m of methods) {
        out.push({
          gatewayId: g.id,
          provider: g.provider,
          providerLabel: g.label,
          environment: g.environment === "production" ? "production" : "sandbox",
          methodCode: m.code,
          methodLabel: m.label,
          kind: m.kind,
        });
      }
    }
    return out;
  },
);
