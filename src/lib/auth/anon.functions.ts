// Guest account provisioning: lets visitors on public pages (mis. /motionmode)
// membeli token tanpa registrasi. Server membuat akun "aanon_xxxxxx" via
// service role lalu mengembalikan kredensialnya sekali saja ke browser, yang
// menyimpannya di localStorage sebagai identitas tamu.
import { createServerFn } from "@tanstack/react-start";

export const createGuestAccount = createServerFn({ method: "POST" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const alphabet = "abcdefghijkmnpqrstuvwxyz23456789";
  const randomSuffix = (len: number) => {
    const bytes = new Uint8Array(len);
    crypto.getRandomValues(bytes);
    let out = "";
    for (const b of bytes) out += alphabet[b % alphabet.length];
    return out;
  };
  const randomPassword = () => {
    const bytes = new Uint8Array(24);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  };

  let lastError = "";
  for (let attempt = 0; attempt < 5; attempt++) {
    const handle = `aanon_${randomSuffix(8)}`;
    const email = `${handle}@aatools.app`;
    const password = randomPassword();
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { display_name: handle, is_guest: true },
    });
    if (!error && data?.user) {
      return { handle, email, password, userId: data.user.id };
    }
    lastError = error?.message ?? "unknown error";
  }
  throw new Error(`Gagal membuat akun tamu: ${lastError}`);
});
