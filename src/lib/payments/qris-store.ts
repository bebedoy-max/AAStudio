// Akses baris singleton `companion_qris` (payload QRIS statis merchant).
import { supabase } from "@/integrations/supabase/client";

export type CompanionQrisRow = {
  static_payload: string | null;
  merchant_name: string | null;
  merchant_city: string | null;
  active: boolean;
  updated_at: string | null;
};

export async function getCompanionQris(): Promise<CompanionQrisRow | null> {
  const { data } = await supabase
    .from("companion_qris" as never)
    .select("static_payload, merchant_name, merchant_city, active, updated_at")
    .eq("id" as never, 1 as never)
    .maybeSingle();
  return (data as CompanionQrisRow | null) ?? null;
}

export async function saveCompanionQris(input: {
  static_payload: string | null;
  merchant_name: string | null;
  merchant_city: string | null;
  active: boolean;
}): Promise<void> {
  const { error } = await supabase
    .from("companion_qris" as never)
    .upsert({ id: 1, ...input, updated_at: new Date().toISOString() } as never)
    .eq("id" as never, 1 as never);
  if (error) throw new Error(error.message);
}
