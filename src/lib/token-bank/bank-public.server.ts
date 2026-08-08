// Public Token Bank catalog reads (harga + jumlah stok).
// Dipakai oleh pembeli anonim/tamu di halaman publik seperti /motionmode,
// jadi harus bisa jalan TANPA service role key: pakai publishable client +
// policy anon dulu, baru fallback ke admin client bila tersedia.
// Nilai yang dikembalikan non-sensitif (provider, harga, jumlah stok) —
// key_value tidak pernah keluar dari server.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export type BankPriceRow = {
  provider: string;
  price_idr: number;
  is_active: boolean;
  updated_at: string;
};

function publishableClient(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input: RequestInfo | URL, init?: RequestInit) => {
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

async function adminClient(): Promise<SupabaseClient | null> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return supabaseAdmin as unknown as SupabaseClient;
  } catch {
    return null;
  }
}

export async function fetchBankPrices(): Promise<BankPriceRow[]> {
  const errors: string[] = [];
  const anon = publishableClient();
  if (anon) {
    const { data, error } = await anon
      .from("token_bank_prices")
      .select("provider, price_idr, is_active, updated_at");
    // Query anon berhasil (walau kosong) = katalog memang belum diisi admin.
    if (!error) return (data ?? []) as BankPriceRow[];
    errors.push(error.message);
  }
  const admin = await adminClient();
  if (admin) {
    const { data, error } = await admin
      .from("token_bank_prices")
      .select("provider, price_idr, is_active, updated_at");
    if (error) throw new Error(error.message);
    return (data ?? []) as BankPriceRow[];
  }
  if (!anon) {
    throw new Error(
      "Konfigurasi Supabase belum lengkap di server (SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY).",
    );
  }
  if (errors.length) throw new Error(errors[0]);
  return [];
}

export async function fetchBankStock(): Promise<Record<string, number>> {
  const anon = publishableClient();
  if (anon) {
    // Security-definer RPC: mengembalikan jumlah key available per provider
    // tanpa membuka isi tabel token_bank_keys ke anon.
    const { data, error } = await anon.rpc("token_bank_available_counts");
    if (!error && Array.isArray(data)) {
      const counts: Record<string, number> = {};
      for (const r of data as { provider: string; available: number }[]) {
        counts[r.provider] = Number(r.available) || 0;
      }
      return counts;
    }
  }
  const admin = await adminClient();
  if (admin) {
    const { data: rows, error } = await admin
      .from("token_bank_keys")
      .select("provider")
      .eq("status", "available");
    if (error) throw new Error(error.message);
    const counts: Record<string, number> = {};
    for (const r of (rows ?? []) as { provider: string }[]) {
      counts[r.provider] = (counts[r.provider] ?? 0) + 1;
    }
    return counts;
  }
  return {};
}
