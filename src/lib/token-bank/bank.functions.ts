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
  | "creatomate"
  | "roboneo"
  | "framia"
  | "firefly";

const PROVIDERS: readonly BankProvider[] = [
  "brain",
  "weavy",
  "wavespeed",
  "magnific",
  "roboneo",
  "framia",
  "firefly",
  "eleven",
  "shotstack",
  "creatomate",
] as const;

function assertProvider(p: string): asserts p is BankProvider {
  if (!(PROVIDERS as readonly string[]).includes(p))
    throw new Error(`Unknown provider: ${p}`);
}

export const BANK_STORAGE_KEY: Record<BankProvider, string> = {
  brain: "aatools.brain.geminiKeys",
  weavy: "aatools.weavy.tokens",
  wavespeed: "aatools.wavespeed.keys",
  magnific: "aatools.magnific.keys",
  roboneo: "aatools.roboneo.keys",
  framia: "aatools.framia.keys",
  firefly: "aatools.firefly.keys",
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
    case "creatomate":
    case "roboneo":
    case "framia":
    case "firefly": {
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
    const BASE = "id, provider, key_value, label, status, assigned_to, assigned_at, created_at";
    // Credit columns are optional (added by a later manual migration).
    let res = await db
      .from("token_bank_keys")
      .select(`${BASE}, credit_status, credit_detail, credit_checked_at`)
      .order("created_at", { ascending: false });
    if (res.error) {
      res = await db
        .from("token_bank_keys")
        .select(BASE)
        .order("created_at", { ascending: false });
    }
    if (res.error) throw new Error(res.error.message);
    const rows = (res.data ?? []) as {
      id: string;
      provider: BankProvider;
      key_value: string;
      label: string | null;
      status: string;
      assigned_to: string | null;
      assigned_at: string | null;
      created_at: string;
      credit_status?: string | null;
      credit_detail?: string | null;
      credit_checked_at?: string | null;
    }[];
    // Attach assigned user info (email + display name) via a batched profiles lookup.
    const assignedIds = Array.from(
      new Set(rows.map((r) => r.assigned_to).filter((x): x is string => !!x)),
    );
    let byId: Record<string, { email: string | null; display_name: string | null }> = {};
    if (assignedIds.length) {
      const { data: profs } = await db
        .from("profiles")
        .select("id, email, display_name")
        .in("id", assignedIds);
      byId = Object.fromEntries(
        ((profs ?? []) as { id: string; email: string | null; display_name: string | null }[]).map(
          (p) => [p.id, { email: p.email, display_name: p.display_name }],
        ),
      );
    }
    return rows.map((r) => ({
      ...r,
      credit_status: r.credit_status ?? null,
      credit_detail: r.credit_detail ?? null,
      credit_checked_at: r.credit_checked_at ?? null,
      assigned_email: r.assigned_to ? byId[r.assigned_to]?.email ?? null : null,
      assigned_display_name: r.assigned_to ? byId[r.assigned_to]?.display_name ?? null : null,
    }));
  });

/** Persist the result of a credit/validity check so it survives reloads. */
export const saveBankKeyChecks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { items: { id: string; status: string; detail: string }[] }) => {
    const items = (data.items ?? [])
      .map((i) => ({
        id: String(i.id ?? "").trim(),
        status: String(i.status ?? "").slice(0, 20),
        detail: String(i.detail ?? "").slice(0, 300),
      }))
      .filter((i) => i.id);
    if (items.length === 0) throw new Error("items required");
    return { items };
  })
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const db = context.supabase as unknown as LooseClient;
    const now = new Date().toISOString();
    for (const it of data.items) {
      const { error } = await db
        .from("token_bank_keys")
        .update({ credit_status: it.status, credit_detail: it.detail, credit_checked_at: now })
        .eq("id", it.id);
      if (error) throw new Error(error.message);
    }
    return { ok: true, saved: data.items.length, checkedAt: now };
  });

export const addBankKeys = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: {
      provider: string;
      keys: string[];
      label?: string;
      checks?: { key: string; status: string; detail: string }[];
    }) => {
      assertProvider(data.provider);
      if (!Array.isArray(data.keys) || data.keys.length === 0) throw new Error("keys required");
      const cleaned = Array.from(new Set(data.keys.map((k) => k.trim()).filter(Boolean)));
      if (cleaned.length === 0) throw new Error("keys empty");
      return {
        provider: data.provider as BankProvider,
        keys: cleaned,
        label: data.label ?? null,
        checks: (data.checks ?? []).map((c) => ({
          key: String(c.key ?? ""),
          status: String(c.status ?? "").slice(0, 20),
          detail: String(c.detail ?? "").slice(0, 300),
        })),
      };
    },
  )
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const db = context.supabase as unknown as LooseClient;
    const checkByKey = new Map(data.checks.map((c) => [c.key, c]));
    const now = new Date().toISOString();
    const base = data.keys.map((k) => ({
      provider: data.provider,
      key_value: k,
      label: data.label,
      created_by: context.userId,
    }));
    const withChecks = base.map((r) => {
      const c = checkByKey.get(r.key_value);
      return c
        ? { ...r, credit_status: c.status, credit_detail: c.detail, credit_checked_at: now }
        : r;
    });
    let res = await db.from("token_bank_keys").insert(withChecks).select("id, key_value");
    if (res.error) {
      // Credit columns not migrated yet — fall back to the plain insert.
      res = await db.from("token_bank_keys").insert(base).select("id, key_value");
    }
    if (res.error) throw new Error(res.error.message);
    return {
      ok: true,
      added: base.length,
      inserted: (res.data ?? []) as { id: string; key_value: string }[],
    };
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

export const deleteBankKeys = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { ids: string[] }) => {
    if (!Array.isArray(data.ids) || data.ids.length === 0) throw new Error("ids required");
    return { ids: data.ids.filter(Boolean) };
  })
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const db = context.supabase as unknown as LooseClient;
    const { error } = await db.from("token_bank_keys").delete().in("id", data.ids);
    if (error) throw new Error(error.message);
    return { ok: true, deleted: data.ids.length };
  });

export const deleteAllBankKeys = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { provider: string; includeAssigned?: boolean }) => {
    assertProvider(data.provider);
    return {
      provider: data.provider as BankProvider,
      includeAssigned: !!data.includeAssigned,
    };
  })
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const db = context.supabase as unknown as LooseClient;
    let q = db.from("token_bank_keys").delete().eq("provider", data.provider);
    if (!data.includeAssigned) q = q.eq("status", "available");
    const { error } = await q;
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const restoreAssignedBankKeys = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { provider: string; keys: string[] }) => {
    assertProvider(data.provider);
    const keys = Array.from(new Set((data.keys ?? []).map((k) => String(k).trim()).filter(Boolean)));
    if (keys.length === 0) throw new Error("keys required");
    return { provider: data.provider as BankProvider, keys };
  })
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const db = context.supabase as unknown as LooseClient;

    const { data: assignedRaw, error: readErr } = await db
      .from("token_bank_keys")
      .select("id, key_value")
      .eq("provider", data.provider)
      .eq("status", "assigned")
      .in("key_value", data.keys)
      .order("created_at", { ascending: false });
    if (readErr) throw new Error(readErr.message);

    const assigned = (assignedRaw ?? []) as { id: string; key_value: string }[];
    const keepByKey = new Map<string, { id: string; key_value: string }>();
    const duplicateIds: string[] = [];
    for (const row of assigned) {
      if (keepByKey.has(row.key_value)) duplicateIds.push(row.id);
      else keepByKey.set(row.key_value, row);
    }

    if (duplicateIds.length > 0) {
      const { error: delErr } = await db.from("token_bank_keys").delete().in("id", duplicateIds);
      if (delErr) throw new Error(delErr.message);
    }

    const keepIds = Array.from(keepByKey.values()).map((r) => r.id);
    if (keepIds.length === 0) return { ok: true, restored: [] as { id: string; key_value: string }[] };

    const { data: restored, error } = await db
      .from("token_bank_keys")
      .update({ status: "available", assigned_to: null, assigned_at: null })
      .in("id", keepIds)
      .select("id, key_value");
    if (error) throw new Error(error.message);
    return { ok: true, restored: (restored ?? []) as { id: string; key_value: string }[] };
  });

export const listBankPrices = createServerFn({ method: "GET" })
  .handler(async () => {
    // Katalog pembelian bersifat publik (bisa diakses tamu tanpa login).
    const { fetchBankPrices } = await import("./bank-public.server");
    return (await fetchBankPrices()) as unknown as {
      provider: BankProvider;
      price_idr: number;
      is_active: boolean;
      updated_at: string;
    }[];
  });

/** Public aggregate stock counts; key values are never returned. */
export const listBankStock = createServerFn({ method: "GET" })
  .handler(async () => {
    const { fetchBankStock } = await import("./bank-public.server");
    return await fetchBankStock();
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
  ids?: string[]; // when provided, use these specific bank_key ids (must all be available)
  targetUserId: string;
  actorUserId: string;
  kind: "transfer" | "purchase";
  priceIdr: number;
  purchaseRequestId?: string | null;
  adminDb: LooseClient; // caller's admin-authenticated supabase (RLS-honored)
}) {
  const { encryptString, decryptString } = await import("@/lib/tokens/crypto.server");
  const adminDb = params.adminDb;

  // Read stock via the caller's admin session — the admin has full RLS
  // access to token_bank_keys (policy: admin-all), so no service role needed.
  let pickQ = adminDb
    .from("token_bank_keys")
    .select("id, key_value")
    .eq("provider", params.provider)
    .eq("status", "available");
  if (params.ids && params.ids.length > 0) {
    pickQ = pickQ.in("id", params.ids);
  } else {
    pickQ = pickQ.order("created_at", { ascending: true }).limit(params.qty);
  }
  const { data: keys, error: kErr } = await pickQ;
  if (kErr) throw new Error(kErr.message);
  const picked = (keys ?? []) as { id: string; key_value: string }[];
  const need = params.ids && params.ids.length > 0 ? params.ids.length : params.qty;
  if (picked.length < need) {
    throw new Error(
      `Stok tidak cukup: butuh ${need}, tersedia ${picked.length} untuk ${params.provider}`,
    );
  }

  // user_tokens is scoped to auth.uid() in RLS — cross-user writes need service role.
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const admin = supabaseAdmin as unknown as LooseClient;

  const storageKey = BANK_STORAGE_KEY[params.provider];
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

  const denom = params.ids && params.ids.length > 0 ? params.ids.length : params.qty;
  const perKeyPrice = denom > 0 ? Math.round(params.priceIdr / denom) : 0;
  const txRows = picked.map((k) => ({
    key_id: k.id,
    provider: params.provider,
    user_id: params.targetUserId,
    kind: params.kind,
    price_idr: perKeyPrice,
    purchase_request_id: params.purchaseRequestId ?? null,
    created_by: params.actorUserId,
  }));
  const { error: txErr } = await adminDb.from("token_bank_transactions").insert(txRows);
  if (txErr) throw new Error(txErr.message);

  // Key yang sudah dikirim langsung dihapus dari bank supaya tidak bisa
  // dikirim / dibeli dua kali (transaksi tetap tercatat, key_id -> NULL).
  const { error: delErr } = await adminDb.from("token_bank_keys").delete().in("id", ids);
  if (delErr) throw new Error(delErr.message);

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
      adminDb: context.supabase as unknown as LooseClient,
    });
  });

/** Transfer specific bank_key rows (by id) to a target user. Groups by provider automatically. */
export const transferBankKeysByIds = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { ids: string[]; targetUserId: string }) => {
    if (!data.targetUserId) throw new Error("targetUserId required");
    const ids = Array.from(new Set((data.ids ?? []).map((s) => String(s).trim()).filter(Boolean)));
    if (ids.length === 0) throw new Error("ids required");
    return { ids, targetUserId: data.targetUserId };
  })
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const db = context.supabase as unknown as LooseClient;
    const { data: rows, error } = await db
      .from("token_bank_keys")
      .select("id, provider, status")
      .in("id", data.ids);
    if (error) throw new Error(error.message);
    const list = (rows ?? []) as { id: string; provider: BankProvider; status: string }[];
    const notAvail = list.filter((r) => r.status !== "available");
    if (notAvail.length > 0) {
      throw new Error(`${notAvail.length} key sudah tidak available — refresh dulu.`);
    }
    if (list.length !== data.ids.length) {
      throw new Error("Sebagian key tidak ditemukan.");
    }
    const byProvider = new Map<BankProvider, string[]>();
    for (const r of list) {
      const arr = byProvider.get(r.provider) ?? [];
      arr.push(r.id);
      byProvider.set(r.provider, arr);
    }
    let delivered = 0;
    for (const [provider, ids] of byProvider.entries()) {
      const r = await deliverKeysToUser({
        provider,
        qty: ids.length,
        ids,
        targetUserId: data.targetUserId,
        actorUserId: context.userId,
        kind: "transfer",
        priceIdr: 0,
        adminDb: db,
      });
      delivered += r.delivered;
    }
    return { ok: true, delivered };
  });

const CART_MARKER = "[TOKEN_BANK_CART]";
function parseCartFromNote(note: string | null | undefined): { provider: BankProvider; qty: number }[] | null {
  if (!note) return null;
  const i = note.indexOf(CART_MARKER);
  if (i < 0) return null;
  try {
    const parsed = JSON.parse(note.slice(i + CART_MARKER.length));
    if (!Array.isArray(parsed)) return null;
    const out: { provider: BankProvider; qty: number }[] = [];
    for (const r of parsed) {
      const p = String(r?.provider ?? "");
      const q = Math.floor(Number(r?.qty) || 0);
      if (q <= 0) continue;
      if (!(PROVIDERS as readonly string[]).includes(p)) continue;
      out.push({ provider: p as BankProvider, qty: q });
    }
    return out.length > 0 ? out : null;
  } catch {
    return null;
  }
}

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
      .select("id, user_id, request_kind, token_provider, token_qty, price_idr, status, note")
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
      note: string | null;
    } | null;
    if (!pr) throw new Error("Purchase request not found");
    if (pr.request_kind !== "token_bank") return { ok: true, skipped: "not a token_bank request" };

    const { data: existingTx } = await admin
      .from("token_bank_transactions")
      .select("id")
      .eq("purchase_request_id", pr.id)
      .limit(1);
    if (Array.isArray(existingTx) && existingTx.length > 0)
      return { ok: true, skipped: "already fulfilled" };

    // Prefer multi-provider cart embedded in note; fall back to legacy
    // single-provider token_provider/token_qty columns.
    const cart = parseCartFromNote(pr.note);
    const items =
      cart ??
      (pr.token_provider && pr.token_qty
        ? [{ provider: pr.token_provider as BankProvider, qty: pr.token_qty }]
        : null);
    if (!items || items.length === 0)
      throw new Error("Request is missing token cart items");

    const totalKeys = items.reduce((a, it) => a + it.qty, 0);
    const perKeyPrice = totalKeys > 0 ? Math.round(pr.price_idr / totalKeys) : 0;
    let delivered = 0;
    for (const it of items) {
      const r = await deliverKeysToUser({
        provider: it.provider,
        qty: it.qty,
        targetUserId: pr.user_id,
        actorUserId: context.userId,
        kind: "purchase",
        // Attribute price per-key so every transaction row carries a value.
        priceIdr: perKeyPrice * it.qty,
        purchaseRequestId: pr.id,
        adminDb: context.supabase as unknown as LooseClient,
      });
      delivered += r.delivered;
    }
    return { ok: true, delivered };
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

/** Satu baris = satu transaksi (pembelian/transfer), bukan per key. */
export type BankTxRow = {
  id: string;
  provider: BankProvider;
  kind: string;
  /** Jumlah key dalam transaksi ini. */
  qty: number;
  /** Total harga key (tanpa kode unik). */
  price_idr: number;
  /** Kode unik yang ditambahkan sistem pada nominal pembayaran. */
  unique_code: number;
  /** Yang benar-benar dibayar pembeli = price_idr + unique_code. */
  total_idr: number;
  created_at: string;
  user_id: string;
  order_id: string | null;
  purchase_request_id: string | null;
  user_email: string | null;
  user_display_name: string | null;
};

export const listBankTransactions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: {
      provider?: string | null;
      kind?: string | null;
      userId?: string | null;
      dateFrom?: string | null;
      dateTo?: string | null;
    }) => ({
      provider: data.provider ?? null,
      kind: data.kind ?? null,
      userId: data.userId ?? null,
      dateFrom: data.dateFrom ?? null,
      dateTo: data.dateTo ?? null,
    }),
  )
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const db = context.supabase as unknown as LooseClient;
    let q = db
      .from("token_bank_transactions")
      .select("id, provider, kind, price_idr, created_at, user_id, key_id, purchase_request_id")
      .order("created_at", { ascending: false })
      .limit(5000);
    if (data.provider) q = q.eq("provider", data.provider);
    if (data.kind) q = q.eq("kind", data.kind);
    if (data.userId) q = q.eq("user_id", data.userId);
    if (data.dateFrom) q = q.gte("created_at", data.dateFrom);
    if (data.dateTo) q = q.lte("created_at", data.dateTo);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    const list = (rows ?? []) as {
      id: string;
      provider: BankProvider;
      kind: string;
      price_idr: number;
      created_at: string;
      user_id: string;
      key_id: string | null;
      purchase_request_id: string | null;
    }[];

    // Profil pembeli
    const uids = Array.from(new Set(list.map((r) => r.user_id).filter(Boolean)));
    let byId: Record<string, { email: string | null; display_name: string | null }> = {};
    if (uids.length) {
      const { data: profs } = await db
        .from("profiles")
        .select("id, email, display_name")
        .in("id", uids);
      byId = Object.fromEntries(
        ((profs ?? []) as { id: string; email: string | null; display_name: string | null }[]).map(
          (p) => [p.id, { email: p.email, display_name: p.display_name }],
        ),
      );
    }

    // Kode unik + order id dari purchase_requests
    const prIds = Array.from(
      new Set(list.map((r) => r.purchase_request_id).filter((v): v is string => !!v)),
    );
    let prById: Record<string, { code: number; orderId: string | null }> = {};
    if (prIds.length) {
      const { data: prs } = await db
        .from("purchase_requests")
        .select("id, price_idr, gopay_expected_amount, temanqris_order_id")
        .in("id", prIds);
      prById = Object.fromEntries(
        (
          (prs ?? []) as {
            id: string;
            price_idr: number | null;
            gopay_expected_amount: number | null;
            temanqris_order_id: string | null;
          }[]
        ).map((p) => {
          const raw = Math.round((p.gopay_expected_amount ?? 0) - (p.price_idr ?? 0));
          return [p.id, { code: raw > 0 ? raw : 0, orderId: p.temanqris_order_id ?? p.id }];
        }),
      );
    }

    // Gabungkan per transaksi: satu purchase_request (atau satu batch transfer).
    const groups = new Map<string, BankTxRow>();
    const codeCounted = new Set<string>();
    for (const r of list) {
      const batchKey = r.purchase_request_id
        ? `pr:${r.purchase_request_id}:${r.provider}`
        : `tr:${r.kind}:${r.provider}:${r.user_id}:${r.created_at.slice(0, 19)}`;
      let g = groups.get(batchKey);
      if (!g) {
        const pr = r.purchase_request_id ? prById[r.purchase_request_id] : undefined;
        let code = 0;
        if (r.purchase_request_id && pr && !codeCounted.has(r.purchase_request_id)) {
          code = pr.code;
          codeCounted.add(r.purchase_request_id);
        }
        g = {
          id: batchKey,
          provider: r.provider,
          kind: r.kind,
          qty: 0,
          price_idr: 0,
          unique_code: code,
          total_idr: 0,
          created_at: r.created_at,
          user_id: r.user_id,
          order_id: pr?.orderId ?? null,
          purchase_request_id: r.purchase_request_id,
          user_email: byId[r.user_id]?.email ?? null,
          user_display_name: byId[r.user_id]?.display_name ?? null,
        };
        groups.set(batchKey, g);
      }
      g.qty += 1;
      g.price_idr += r.price_idr || 0;
    }
    const out = Array.from(groups.values()).map((g) => ({
      ...g,
      total_idr: g.price_idr + g.unique_code,
    }));
    out.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
    return out as BankTxRow[];
  });


export const resetBankTransactions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context);
    const db = context.supabase as unknown as LooseClient;
    const { error } = await db
      .from("token_bank_transactions")
      .delete()
      .not("id", "is", null);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const PROVIDER_LABELS: Record<BankProvider, string> = {
  brain: "Brain (Gemini)",
  weavy: "Weavy",
  wavespeed: "Wavespeed",
  magnific: "Magnific",
  roboneo: "Roboneo",
  framia: "Framia",
  firefly: "Adobe Firefly",
  eleven: "ElevenLabs",
  shotstack: "Shotstack",
  creatomate: "Creatomate",
};

export const BANK_PROVIDERS = PROVIDERS;
