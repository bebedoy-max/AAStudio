// Server functions to pull/push/delete per-user encrypted API tokens.
// The set of allowed storage keys is fixed so no arbitrary keys leak into DB.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const ALLOWED_TOKEN_KEYS = [
  "aatools.brain.geminiKeys",
  "aatools.brain.openaiKeys",
  "aatools.brain.checks",
  "aatools.weavy.tokens",
  "aatools.wavespeed.keys",
  "aatools.magnific.keys",
  "aatools.eleven",
  "aatools.eleven.checks",
  "aatools.shotstack.keys",
  "aatools.creatomate.keys",
  "aatools.weavy.activeId",
] as const;

export type TokenStorageKey = (typeof ALLOWED_TOKEN_KEYS)[number];

function assertKey(k: string): asserts k is TokenStorageKey {
  if (!(ALLOWED_TOKEN_KEYS as readonly string[]).includes(k)) {
    throw new Error(`Unknown token storage key: ${k}`);
  }
}

export const pullUserTokens = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await (supabase as unknown as {
      from: (t: string) => {
        select: (c: string) => {
          eq: (
            col: string,
            v: string,
          ) => Promise<{ data: { storage_key: string; ciphertext: string }[] | null; error: { message: string } | null }>;
        };
      };
    })
      .from("user_tokens")
      .select("storage_key, ciphertext")
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    const { decryptString } = await import("./crypto.server");
    const out: Record<string, string> = {};
    for (const row of data ?? []) {
      try {
        out[row.storage_key] = await decryptString(row.ciphertext);
      } catch (e) {
        console.warn("[user_tokens] failed to decrypt", row.storage_key, e);
      }
    }
    return out;
  });

export const pushUserToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { storageKey: string; value: string }) => {
    assertKey(data.storageKey);
    if (typeof data.value !== "string") throw new Error("value must be string");
    if (data.value.length > 100_000) throw new Error("value too large");
    return { storageKey: data.storageKey as TokenStorageKey, value: data.value };
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { encryptString } = await import("./crypto.server");
    const ciphertext = await encryptString(data.value);
    const db = supabase as unknown as {
      from: (t: string) => {
        upsert: (
          v: Record<string, unknown>,
          o: { onConflict: string },
        ) => Promise<{ error: { message: string } | null }>;
        delete: () => {
          eq: (
            c: string,
            v: string,
          ) => { eq: (c: string, v: string) => Promise<{ error: { message: string } | null }> };
        };
      };
    };
    const { error } = await db.from("user_tokens").upsert(
      {
        user_id: userId,
        storage_key: data.storageKey,
        ciphertext,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,storage_key" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteUserToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { storageKey: string }) => {
    assertKey(data.storageKey);
    return { storageKey: data.storageKey as TokenStorageKey };
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const db = supabase as unknown as {
      from: (t: string) => {
        delete: () => {
          eq: (
            c: string,
            v: string,
          ) => { eq: (c: string, v: string) => Promise<{ error: { message: string } | null }> };
        };
      };
    };
    const { error } = await db
      .from("user_tokens")
      .delete()
      .eq("user_id", userId)
      .eq("storage_key", data.storageKey);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
