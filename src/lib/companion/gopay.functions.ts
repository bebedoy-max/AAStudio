// Server fn tipis: tetapkan nominal unik GoPay untuk pesanan milik user login.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assignGopayAmountForUser } from "./gopay.server";

export const ensureGopayAmount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ purchaseId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) =>
    assignGopayAmountForUser(context.supabase, context.userId, data.purchaseId),
  );
