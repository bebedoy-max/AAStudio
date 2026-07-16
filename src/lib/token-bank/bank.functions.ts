// Token Bank server functions: admin CRUD + purchase fulfillment.
// New tables (token_bank_*) are not in the generated Supabase types until the
// migration is applied — we cast the clients to a loose interface here.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type BankProvider =
  | "brain"
  | "weavy"
  | "wavespeed"
  | "magnific"
  | "eleven"
  | "shotstack"
  | "creatomate";

const PROVIDERS: readonly BankProvider[] = [
  "brain",
  "weavy",
  "wavespeed",
  "magnific",
  "eleven",
  "shotstack",
  "creatomate",
] as const;

function assertProvider(p: string): asserts p is BankProvider {
  if (!(PROVIDERS as readonly string[]).includes(p))
    throw new Error(`Unknown provider: ${p}`);
}

const STORAGE_KEY: Record<BankProvider, string> = {
  brain: "aatools.brain.geminiKeys",
  weavy: "aatools.weavy.tokens",
  wavespeed: "aatools.wavespeed.keys",
  magnific: "aatools.magnific.keys",
  eleven: "aatools.eleven",
  shotstack: "aatools.shotstack.keys",
  creatomate: "aatools.creatomate.keys",
};

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function appendKey(provider: BankProvider, currentJson: string | null, keyValue: string): string {
  switch (provider) {
    case "brain": {
      const arr: string[] = currentJson ? (JSON.parse(currentJson) as string[]) : [];
      if (!arr.includes(keyValue)) arr.push(keyValue);
      return JSON.stringify(arr);
    }
    case "weavy": {
      type T = { id: string; token: string; credits: number | null; status: string };
      const arr: T[] = currentJson ? (JSON.parse(currentJson) as T[]) : [];
      if (!arr.some((t) => t.token === keyValue))
        arr.push({ id: uid(), token: keyValue, credits: null, status: "pending" });
      return JSON.stringify(arr);
    }
    case "wavespeed":
    case "magnific":
    case "shotstack":
    case "creatomate": {
      type T = { id: string; key: string; balance: number | null; status: string };
      const arr: T[] = currentJson ? (JSON.parse(currentJson) as T[]) : [];
      if (!arr.some((k) => k.key === keyValue))
        arr.push({ id: uid(), key: keyValue, balance: null, status: "pending" });
      return JSON.stringify(arr);
    }
    case "eleven": {
      type Cfg = { keys: string[]; voice?: string; customVoice?: string };
      const cfg: Cfg = currentJson
        ? (JSON.parse(currentJson) as Cfg)
        : { keys: [], voice: "", customVoice: "" };
      if (!Array.isArray(cfg.keys)) cfg.keys = [];
      if (!cfg.keys.includes(keyValue)) cfg.keys.push(keyValue);
      return JSON.stringify(cfg);
    }
  }
}

// Loose client shape — accepts arbitrary table names / columns.
type LooseClient = {
  from: (t: string) => any;
  rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: any; error: any }>;
};

async function requireAdmin(ctx: { supabase: unknown; userId: string }) {
  const db = ctx.supabase as LooseClient;
  const { data, error } = await db.rpc("has_role", { _user_id: ctx.userId, _role: "admin" });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden: admin only");
}

export const listBankInventory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context);
    const db = context.supabase as unknown as LooseClient;
    const { data, error } = await db
      .from("token_bank_keys")
      .select("id, provider, key_value, label, status, assigned_to, assigned_at, created_at")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as {
      id: string;
      provider: BankProvider;
      key_value: string;
      label: string | null;
      status: string;
      assigned_to: string | null;
      assigned_at: string | null;
      created_at: string;
    }[];
  });

export const addBankKeys = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { provider: string; keys: string[]; label?: string }) => {
    assertProvider(data.provider);
    if (!Array.isArray(data.keys) || data.keys.length === 0) throw new Error("keys required");
    const cleaned = Array.from(new Set(data.keys.map((k) => k.trim()).filter(Boolean)));
    if (cleaned.length === 0) throw new Error("keys empty");
    return { provider: data.provider as BankProvider, keys: cleaned, label: data.label ?? null };
  })
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const db = context.supabase as unknown as LooseClient;
    const rows = data.keys.map((k) => ({
      provider: data.provider,
      key_value: k,
      label: data.label,
      created_by: context.userId,
    }));
    const { error } = await db.from("token_bank_keys").insert(rows);
    if (error) throw new Error(error.message);
    return { ok: true, added: rows.length };
  });

export const deleteBankKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string }) => {
    if (!data.id) throw new Error("id required");
    return data;
  })
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const db = context.supabase as unknown as LooseClient;
    const { error } = await db.from("token_bank_keys").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listBankPrices = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = context.supabase as unknown as LooseClient;
    const { data, error } = await db.from("token_bank_prices").select("*");
    if (error) throw new Error(error.message);
    return (data ?? []) as {
      provider: BankProvider;
      price_idr: number;
      is_active: boolean;
      updated_at: string;
    }[];
  });

/** Authenticated: available-key counts per provider (needs service role to bypass RLS on token_bank_keys for non-admin users). */
export const listBankStock = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = context.supabase as unknown as LooseClient;
    // Primary path: security-definer RPC (no service role needed).
    const { data, error } = await db.rpc("token_bank_available_counts", {});
    if (!error && Array.isArray(data)) {
      const counts: Record<string, number> = {};
      for (const r of data as { provider: string; available: number }[]) {
        counts[r.provider] = Number(r.available) || 0;
      }
      return counts;
    }
    // Fallback for admins if RPC not yet applied — needs service role.
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const admin = supabaseAdmin as unknown as LooseClient;
      const { data: rows, error: e2 } = await admin
        .from("token_bank_keys")
        .select("provider, status");
      if (e2) throw new Error(e2.message);
      const counts: Record<string, number> = {};
      for (const r of (rows ?? []) as { provider: string; status: string }[]) {
        if (r.status === "available") counts[r.provider] = (counts[r.provider] ?? 0) + 1;
      }
      return counts;
    } catch {
      // Return empty rather than blocking the buy dialog entirely.
      return {} as Record<string, number>;
    }
  });

export const setBankPrice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { provider: string; price_idr: number; is_active: boolean }) => {
    assertProvider(data.provider);
    if (!Number.isFinite(data.price_idr) || data.price_idr < 0) throw new Error("price invalid");
    return {
      provider: data.provider as BankProvider,
      price_idr: Math.round(data.price_idr),
      is_active: !!data.is_active,
    };
  })
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const db = context.supabase as unknown as LooseClient;
    const { error } = await db.from("token_bank_prices").upsert(
      {
        provider: data.provider,
        price_idr: data.price_idr,
        is_active: data.is_active,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "provider" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

async function deliverKeysToUser(params: {
  provider: BankProvider;
  qty: number;
  targetUserId: string;
  actorUserId: string;
  kind: "transfer" | "purchase";
  priceIdr: number;
  purchaseRequestId?: string | null;
}) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const admin = supabaseAdmin as unknown as LooseClient;
  const { encryptString, decryptString } = await import("@/lib/tokens/crypto.server");

  const { data: keys, error: kErr } = await admin
    .from("token_bank_keys")
    .select("id, key_value")
    .eq("provider", params.provider)
    .eq("status", "available")
    .order("created_at", { ascending: true })
    .limit(params.qty);
  if (kErr) throw new Error(kErr.message);
  const picked = (keys ?? []) as { id: string; key_value: string }[];
  if (picked.length < params.qty) {
    throw new Error(
      `Stok tidak cukup: butuh ${params.qty}, tersedia ${picked.length} untuk ${params.provider}`,
    );
  }

  const storageKey = STORAGE_KEY[params.provider];
  const { data: existing } = await admin
    .from("user_tokens")
    .select("ciphertext")
    .eq("user_id", params.targetUserId)
    .eq("storage_key", storageKey)
    .maybeSingle();

  let currentJson: string | null = null;
  const existingRow = existing as { ciphertext?: string } | null;
  if (existingRow?.ciphertext) {
    try {
      currentJson = await decryptString(existingRow.ciphertext);
    } catch (e) {
      console.warn("[token-bank] existing user_tokens decrypt failed, overwriting", e);
      currentJson = null;
    }
  }

  for (const k of picked) {
    currentJson = appendKey(params.provider, currentJson, k.key_value);
  }
  const ciphertext = await encryptString(currentJson!);

  const { error: upErr } = await admin.from("user_tokens").upsert(
    {
      user_id: params.targetUserId,
      storage_key: storageKey,
      ciphertext,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,storage_key" },
  );
  if (upErr) throw new Error(upErr.message);

  const ids = picked.map((k) => k.id);
  const { error: mkErr } = await admin
    .from("token_bank_keys")
    .update({
      status: "assigned",
      assigned_to: params.targetUserId,
      assigned_at: new Date().toISOString(),
    })
    .in("id", ids);
  if (mkErr) throw new Error(mkErr.message);

  const perKeyPrice = params.qty > 0 ? Math.round(params.priceIdr / params.qty) : 0;
  const txRows = picked.map((k) => ({
    key_id: k.id,
    provider: params.provider,
    user_id: params.targetUserId,
    kind: params.kind,
    price_idr: perKeyPrice,
    purchase_request_id: params.purchaseRequestId ?? null,
    created_by: params.actorUserId,
  }));
  const { error: txErr } = await admin.from("token_bank_transactions").insert(txRows);
  if (txErr) throw new Error(txErr.message);

  return { delivered: picked.length };
}

export const transferBankKeys = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { provider: string; qty: number; targetUserId: string }) => {
    assertProvider(data.provider);
    if (!data.targetUserId) throw new Error("targetUserId required");
    const qty = Math.max(1, Math.floor(Number(data.qty) || 1));
    return { provider: data.provider as BankProvider, qty, targetUserId: data.targetUserId };
  })
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    return await deliverKeysToUser({
      provider: data.provider,
      qty: data.qty,
      targetUserId: data.targetUserId,
      actorUserId: context.userId,
      kind: "transfer",
      priceIdr: 0,
    });
  });

export const fulfillTokenPurchase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { purchaseRequestId: string }) => {
    if (!data.purchaseRequestId) throw new Error("purchaseRequestId required");
    return data;
  })
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as unknown as LooseClient;

    const { data: prRaw, error } = await admin
      .from("purchase_requests")
      .select("id, user_id, request_kind, token_provider, token_qty, price_idr, status")
      .eq("id", data.purchaseRequestId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    const pr = prRaw as {
      id: string;
      user_id: string;
      request_kind: string | null;
      token_provider: string | null;
      token_qty: number | null;
      price_idr: number;
      status: string;
    } | null;
    if (!pr) throw new Error("Purchase request not found");
    if (pr.request_kind !== "token_bank") return { ok: true, skipped: "not a token_bank request" };
    if (!pr.token_provider || !pr.token_qty)
      throw new Error("Request is missing token_provider or token_qty");

    const { data: existingTx } = await admin
      .from("token_bank_transactions")
      .select("id")
      .eq("purchase_request_id", pr.id)
      .limit(1);
    if (Array.isArray(existingTx) && existingTx.length > 0)
      return { ok: true, skipped: "already fulfilled" };

    await deliverKeysToUser({
      provider: pr.token_provider as BankProvider,
      qty: pr.token_qty,
      targetUserId: pr.user_id,
      actorUserId: context.userId,
      kind: "purchase",
      priceIdr: pr.price_idr,
      purchaseRequestId: pr.id,
    });
    return { ok: true };
  });

export const searchUsersForTransfer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { q: string }) => ({ q: String(data.q ?? "").trim().slice(0, 100) }))
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    if (!data.q) return [];
    const db = context.supabase as unknown as LooseClient;
    const like = `%${data.q}%`;
    const { data: rows, error } = await db
      .from("profiles")
      .select("id, email, display_name")
      .or(`email.ilike.${like},display_name.ilike.${like}`)
      .limit(10);
    if (error) throw new Error(error.message);
    return (rows ?? []) as { id: string; email: string | null; display_name: string | null }[];
  });

export const PROVIDER_LABELS: Record<BankProvider, string> = {
  brain: "Brain (Gemini)",
  weavy: "Weavy",
  wavespeed: "Wavespeed",
  magnific: "Magnific",
  eleven: "ElevenLabs",
  shotstack: "Shotstack",
  creatomate: "Creatomate",
};

export const BANK_PROVIDERS = PROVIDERS;
