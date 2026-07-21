// Server-only: fulfills a purchase_request after a payment is confirmed.
// Called by the Midtrans notification webhook. Uses service-role client.
//
// - token_bank kind: pulls N keys from token_bank_keys per cart item and
//   appends them (encrypted) to the buyer's user_tokens row; marks bank
//   keys as assigned; inserts token_bank_transactions rows.
// - other kinds (feature subscription): just approves and sets
//   activated_until = now + 30 days.
//
// Idempotent: if the purchase is already approved, does nothing.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { encryptString, decryptString } from "@/lib/tokens/crypto.server";

type LooseClient = {
  from: (t: string) => any;
  rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: any; error: any }>;
};

export type BankProvider =
  | "brain"
  | "weavy"
  | "wavespeed"
  | "magnific"
  | "eleven"
  | "shotstack"
  | "creatomate";

const BANK_STORAGE_KEY: Record<BankProvider, string> = {
  brain: "aatools.brain.geminiKeys",
  weavy: "aatools.weavy.tokens",
  wavespeed: "aatools.wavespeed.keys",
  magnific: "aatools.magnific.keys",
  eleven: "aatools.eleven",
  shotstack: "aatools.shotstack.keys",
  creatomate: "aatools.creatomate.keys",
};

const CART_MARKER = "[TOKEN_BANK_CART]";

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

function parseCartFromNote(note: string | null | undefined): { provider: BankProvider; qty: number }[] | null {
  if (!note) return null;
  const i = note.indexOf(CART_MARKER);
  if (i < 0) return null;
  try {
    const parsed = JSON.parse(note.slice(i + CART_MARKER.length));
    if (!Array.isArray(parsed)) return null;
    const providers = Object.keys(BANK_STORAGE_KEY);
    const out: { provider: BankProvider; qty: number }[] = [];
    for (const r of parsed) {
      const p = String(r?.provider ?? "");
      const q = Math.floor(Number(r?.qty) || 0);
      if (q <= 0 || !providers.includes(p)) continue;
      out.push({ provider: p as BankProvider, qty: q });
    }
    return out.length > 0 ? out : null;
  } catch {
    return null;
  }
}

async function deliverKeysForItem(
  admin: LooseClient,
  params: {
    provider: BankProvider;
    qty: number;
    targetUserId: string;
    purchaseRequestId: string;
    priceIdr: number;
  },
) {
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
    } catch {
      currentJson = null;
    }
  }
  for (const k of picked) currentJson = appendKey(params.provider, currentJson, k.key_value);
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
    kind: "purchase",
    price_idr: perKeyPrice,
    purchase_request_id: params.purchaseRequestId,
    created_by: params.targetUserId,
  }));
  const { error: txErr } = await admin.from("token_bank_transactions").insert(txRows);
  if (txErr) throw new Error(txErr.message);
}

/**
 * Fulfill a purchase after payment confirmation. Idempotent — safe to call
 * repeatedly from webhook retries.
 */
export async function fulfillPurchaseAfterPayment(purchaseRequestId: string) {
  const admin = supabaseAdmin as unknown as LooseClient;

  const { data: prRaw, error } = await admin
    .from("purchase_requests")
    .select("id, user_id, request_kind, token_provider, token_qty, price_idr, status, note, route_key")
    .eq("id", purchaseRequestId)
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
    route_key: string;
  } | null;
  if (!pr) throw new Error("Purchase request not found");
  if (pr.status === "approved") return { ok: true, skipped: "already approved" };

  const isTokenBank = pr.request_kind === "token_bank";

  if (isTokenBank) {
    // Skip if transactions already exist (race).
    const { data: existingTx } = await admin
      .from("token_bank_transactions")
      .select("id")
      .eq("purchase_request_id", pr.id)
      .limit(1);
    if (!(Array.isArray(existingTx) && existingTx.length > 0)) {
      const cart = parseCartFromNote(pr.note);
      const items =
        cart ??
        (pr.token_provider && pr.token_qty
          ? [{ provider: pr.token_provider as BankProvider, qty: pr.token_qty }]
          : null);
      if (!items || items.length === 0) throw new Error("Request is missing token cart items");
      const totalKeys = items.reduce((a, it) => a + it.qty, 0);
      const perKeyPrice = totalKeys > 0 ? Math.round(pr.price_idr / totalKeys) : 0;
      for (const it of items) {
        await deliverKeysForItem(admin, {
          provider: it.provider,
          qty: it.qty,
          targetUserId: pr.user_id,
          purchaseRequestId: pr.id,
          priceIdr: perKeyPrice * it.qty,
        });
      }
    }
  }

  // Approve + activate for 30 days (used by feature-access checks).
  // The pr_on_approved DB trigger writes route_permissions for pr.route_key.
  const activatedUntil = new Date();
  activatedUntil.setDate(activatedUntil.getDate() + 30);
  const { error: uErr } = await admin
    .from("purchase_requests")
    .update({
      status: "approved",
      reviewed_at: new Date().toISOString(),
      activated_until: activatedUntil.toISOString(),
      admin_note: "Auto-approved by Midtrans QRIS payment",
    })
    .eq("id", pr.id);
  if (uErr) throw new Error(uErr.message);

  // Bundle checkouts encode ALL feature route_keys in the note. Grant
  // route_permissions for every listed feature (including the primary) so
  // a single payment activates the whole bundle. The DB trigger already
  // grants pr.route_key — this upsert is idempotent for that key and adds
  // the rest of the bundle.
  const extras = parseExtraFeaturesFromNote(pr.note);
  const allKeys = Array.from(new Set([pr.route_key, ...extras])).filter(Boolean);
  if (allKeys.length > 0) {
    const rows = allKeys.map((rk) => ({
      user_id: pr.user_id,
      route_key: rk,
      expires_at: activatedUntil.toISOString(),
    }));
    const { error: rpErr } = await admin
      .from("route_permissions")
      .upsert(rows, { onConflict: "user_id,route_key" });
    if (rpErr) {
      console.error("[midtrans-fulfill] route_permissions upsert failed", rpErr.message);
      throw new Error(`Gagal aktivasi fitur: ${rpErr.message}`);
    }
  }

  return { ok: true, kind: isTokenBank ? "token_bank" : "subscription" };
}

const FEATURES_MARKER = "[FEATURES:";
function parseExtraFeaturesFromNote(note: string | null): string[] {
  if (!note) return [];
  const i = note.indexOf(FEATURES_MARKER);
  if (i < 0) return [];
  const end = note.indexOf("]", i);
  if (end < 0) return [];
  const csv = note.slice(i + FEATURES_MARKER.length, end);
  return csv
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}
