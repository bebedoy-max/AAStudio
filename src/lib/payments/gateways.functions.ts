// Admin-only CRUD + test koneksi untuk konfigurasi payment gateway.
// Kredensial disimpan ter-enkripsi (AES-GCM) di kolom `config_ciphertext`.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { PAYMENT_PROVIDERS, getProviderDef, maskSecret } from "./providers-catalog";

type LooseClient = { from: (t: string) => any; rpc: (fn: string, args?: any) => Promise<any> };

async function assertAdmin(context: { supabase: unknown; userId: string }) {
  const db = context.supabase as LooseClient;
  const { data, error } = await db.rpc("has_role", { _user_id: context.userId, _role: "admin" });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden");
}

async function invalidateProviderCache(provider: string) {
  try {
    if (provider === "midtrans") {
      const mod = await import("@/lib/midtrans/midtrans.server");
      mod.invalidateMidtransConfigCache();
    }
  } catch {
    /* non-fatal */
  }
}

/**
 * Kalau Midtrans dikonfigurasi via env var (MIDTRANS_SERVER_KEY) tapi belum
 * ada baris di tabel `payment_gateways`, seed satu baris otomatis supaya
 * admin bisa lihat + edit di UI. Hanya berjalan pertama kali (idempotent).
 */
async function autoSeedMidtransFromEnv(db: LooseClient, userId: string) {
  try {
    const key = process.env.MIDTRANS_SERVER_KEY;
    if (!key) return;
    const { data: existing } = await db
      .from("payment_gateways")
      .select("id")
      .eq("provider", "midtrans")
      .limit(1)
      .maybeSingle();
    if (existing) return;
    const isProd = (process.env.MIDTRANS_MODE ?? "production").toLowerCase() === "production";
    const config: Record<string, string> = { server_key: key };
    if (process.env.MIDTRANS_CLIENT_KEY) config.client_key = process.env.MIDTRANS_CLIENT_KEY;
    if (process.env.MIDTRANS_MERCHANT_ID) config.merchant_id = process.env.MIDTRANS_MERCHANT_ID;
    const { encryptString } = await import("@/lib/tokens/crypto.server");
    const ciphertext = await encryptString(JSON.stringify(config));
    await db.from("payment_gateways").insert({
      provider: "midtrans",
      label: `Midtrans ${isProd ? "Production" : "Sandbox"} (env)`,
      environment: isProd ? "production" : "sandbox",
      is_active: true,
      config_ciphertext: ciphertext,
      masked_hint: buildMaskedHint("midtrans", config),
      created_by: userId,
    });
  } catch (e) {
    console.warn("[payment_gateways] auto-seed midtrans dari env gagal", e);
  }
}

export type GatewayListItem = {
  id: string;
  provider: string;
  label: string;
  environment: "sandbox" | "production";
  is_active: boolean;
  masked_hint: Record<string, string>;
  last_test_at: string | null;
  last_test_status: string | null;
  last_test_message: string | null;
  created_at: string;
  updated_at: string;
};

export const listPaymentGateways = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<GatewayListItem[]> => {
    await assertAdmin(context);
    const db = context.supabase as unknown as LooseClient;
    await autoSeedMidtransFromEnv(db, context.userId);
    const { data, error } = await db
      .from("payment_gateways")
      .select("id, provider, label, environment, is_active, masked_hint, last_test_at, last_test_status, last_test_message, created_at, updated_at")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as GatewayListItem[];
  });

function buildMaskedHint(provider: string, config: Record<string, string>): Record<string, string> {
  const def = getProviderDef(provider);
  if (!def) return {};
  const hint: Record<string, string> = {};
  for (const f of def.fields) {
    const v = config[f.key];
    if (typeof v === "string" && v.length > 0) {
      hint[f.key] = f.secret ? maskSecret(v) : v.length > 32 ? v.slice(0, 32) + "…" : v;
    }
  }
  return hint;
}

export const upsertPaymentGateway = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: {
    id?: string;
    provider: string;
    label: string;
    environment: "sandbox" | "production";
    is_active?: boolean;
    config: Record<string, string>;
  }) => {
    if (!data.provider) throw new Error("provider required");
    if (!getProviderDef(data.provider)) throw new Error(`Unknown provider: ${data.provider}`);
    if (!data.label || data.label.length > 120) throw new Error("label required (<=120 chars)");
    if (data.environment !== "sandbox" && data.environment !== "production") {
      throw new Error("environment must be sandbox|production");
    }
    if (!data.config || typeof data.config !== "object") throw new Error("config required");
    return data;
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const def = getProviderDef(data.provider)!;
    const db = context.supabase as unknown as LooseClient;

    // Untuk mode edit: field secret yang dibiarkan kosong = "tidak berubah",
    // jadi kita perlu merge dengan config lama.
    let mergedConfig: Record<string, string> = {};
    if (data.id) {
      const { data: existingRow, error: exErr } = await db
        .from("payment_gateways")
        .select("config_ciphertext")
        .eq("id", data.id)
        .maybeSingle();
      if (exErr) throw new Error(exErr.message);
      if (existingRow?.config_ciphertext) {
        const { decryptString } = await import("@/lib/tokens/crypto.server");
        try {
          mergedConfig = JSON.parse(await decryptString(existingRow.config_ciphertext)) as Record<string, string>;
        } catch {
          mergedConfig = {};
        }
      }
    }
    for (const f of def.fields) {
      const incoming = data.config[f.key];
      if (typeof incoming === "string" && incoming.length > 0) {
        mergedConfig[f.key] = incoming.trim();
      }
    }

    // Validasi required.
    for (const f of def.fields) {
      if (f.required && !mergedConfig[f.key]) {
        throw new Error(`Field wajib: ${f.label}`);
      }
    }

    const { encryptString } = await import("@/lib/tokens/crypto.server");
    const ciphertext = await encryptString(JSON.stringify(mergedConfig));
    const masked = buildMaskedHint(data.provider, mergedConfig);

    const payload = {
      provider: data.provider,
      label: data.label.trim(),
      environment: data.environment,
      is_active: data.is_active ?? true,
      config_ciphertext: ciphertext,
      masked_hint: masked,
      updated_at: new Date().toISOString(),
    };

    if (data.id) {
      const { error } = await db.from("payment_gateways").update(payload).eq("id", data.id);
      if (error) throw new Error(error.message);
      await invalidateProviderCache(data.provider);
      return { ok: true, id: data.id };
    }
    const { data: ins, error } = await db
      .from("payment_gateways")
      .insert({ ...payload, created_by: context.userId })
      .select("id")
      .maybeSingle();
    if (error) throw new Error(error.message);
    await invalidateProviderCache(data.provider);
    return { ok: true, id: (ins as { id: string } | null)?.id };
  });

export const deletePaymentGateway = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => {
    if (!d.id) throw new Error("id required");
    return d;
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const db = context.supabase as unknown as LooseClient;
    const { data: existing } = await db
      .from("payment_gateways")
      .select("provider")
      .eq("id", data.id)
      .maybeSingle();
    const { error } = await db.from("payment_gateways").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    if (existing && (existing as { provider: string }).provider) {
      await invalidateProviderCache((existing as { provider: string }).provider);
    }
    return { ok: true };
  });

export const togglePaymentGateway = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; is_active: boolean }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const db = context.supabase as unknown as LooseClient;
    const { data: row, error } = await db
      .from("payment_gateways")
      .update({ is_active: data.is_active, updated_at: new Date().toISOString() })
      .eq("id", data.id)
      .select("provider")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (row && (row as { provider: string }).provider) {
      await invalidateProviderCache((row as { provider: string }).provider);
    }
    return { ok: true };
  });

export type GatewayTestResult = { ok: boolean; message: string };

async function testMidtrans(config: Record<string, string>, env: "sandbox" | "production"): Promise<GatewayTestResult> {
  const serverKey = config.server_key;
  if (!serverKey) return { ok: false, message: "server_key kosong" };
  const base = env === "production" ? "https://api.midtrans.com" : "https://api.sandbox.midtrans.com";
  const b64 = btoa(serverKey + ":");
  const url = `${base}/v2/aa-test-nonexistent-${Date.now()}/status`;
  const res = await fetch(url, {
    headers: { accept: "application/json", authorization: `Basic ${b64}` },
  });
  // 404 => kredensial valid tapi order tidak ada (harapan kita).
  // 401 => kredensial salah.
  if (res.status === 401) return { ok: false, message: "Server Key ditolak Midtrans (401)" };
  if (res.status === 404 || res.status === 200) {
    return { ok: true, message: `Terkoneksi ke Midtrans (${env})` };
  }
  const body = await res.text();
  return { ok: false, message: `Midtrans HTTP ${res.status}: ${body.slice(0, 160)}` };
}

export const testPaymentGateway = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }): Promise<GatewayTestResult> => {
    await assertAdmin(context);
    const db = context.supabase as unknown as LooseClient;
    const { data: row, error } = await db
      .from("payment_gateways")
      .select("provider, environment, config_ciphertext")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Gateway tidak ditemukan");
    const { decryptString } = await import("@/lib/tokens/crypto.server");
    let config: Record<string, string>;
    try {
      config = JSON.parse(await decryptString(row.config_ciphertext)) as Record<string, string>;
    } catch {
      return { ok: false, message: "Gagal dekripsi konfigurasi (TOKEN_ENCRYPTION_KEY berubah?)" };
    }

    let result: GatewayTestResult;
    try {
      if (row.provider === "midtrans") {
        result = await testMidtrans(config, row.environment);
      } else {
        const def = getProviderDef(row.provider);
        const missing = def?.fields.filter((f) => f.required && !config[f.key]).map((f) => f.label) ?? [];
        if (missing.length > 0) {
          result = { ok: false, message: `Field belum diisi: ${missing.join(", ")}` };
        } else {
          result = {
            ok: true,
            message: `Konfigurasi ${def?.name ?? row.provider} tersimpan. Live charge belum diimplementasikan.`,
          };
        }
      }
    } catch (e) {
      result = { ok: false, message: e instanceof Error ? e.message : String(e) };
    }

    await db
      .from("payment_gateways")
      .update({
        last_test_at: new Date().toISOString(),
        last_test_status: result.ok ? "ok" : "failed",
        last_test_message: result.message.slice(0, 500),
      })
      .eq("id", data.id);

    return result;
  });

export { PAYMENT_PROVIDERS };