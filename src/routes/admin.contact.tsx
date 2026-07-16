import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, Save, LifeBuoy } from "lucide-react";
import { toast } from "sonner";
import { DashboardShell, PageHero } from "@/components/dashboard/shell";
import { Card } from "@/components/dashboard/ui";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/admin/contact")({
  head: () => ({
    meta: [
      { title: "Kontak Support — Admin" },
      { name: "description", content: "Atur email, no telepon, dan WhatsApp support yang tampil di Pusat Bantuan." },
    ],
  }),
  component: AdminContactPage,
});

function AdminContactPage() {
  const { isAdmin, loading: authLoading } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [whatsapp, setWhatsapp] = useState("");

  useEffect(() => {
    (async () => {
      const { data, error } = await (supabase as any)
        .from("app_settings")
        .select("support_email, support_phone, support_whatsapp")
        .eq("id", 1)
        .maybeSingle();
      if (!error && data) {
        setEmail(data.support_email ?? "");
        setPhone(data.support_phone ?? "");
        setWhatsapp(data.support_whatsapp ?? "");
      }
      setLoading(false);
    })();
  }, []);

  async function save() {
    setSaving(true);
    const { error } = await (supabase as any)
      .from("app_settings")
      .upsert({
        id: 1,
        support_email: email.trim() || null,
        support_phone: phone.trim() || null,
        support_whatsapp: whatsapp.trim() || null,
        updated_at: new Date().toISOString(),
      });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Kontak support tersimpan");
  }

  return (
    <DashboardShell>
      <PageHero
        eyebrow="Admin"
        title="Kontak"
        highlight="Support"
        desc="Informasi ini akan tampil di halaman Pusat Bantuan untuk semua user."
      />

      {authLoading || loading ? (
        <Card>
          <div className="p-8 flex items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          </div>
        </Card>
      ) : !isAdmin ? (
        <Card>
          <div className="p-8 text-center text-sm text-muted-foreground">Hanya admin yang dapat mengubah kontak support.</div>
        </Card>
      ) : (
        <Card>
          <div className="p-5 space-y-4 max-w-xl">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl grid place-items-center text-primary-foreground shrink-0" style={{ background: "var(--gradient-neon)" }}>
                <LifeBuoy className="h-5 w-5" />
              </div>
              <div>
                <div className="font-display text-sm">Kontak Support</div>
                <div className="text-[11px] text-muted-foreground">Kosongkan field yang tidak ingin ditampilkan.</div>
              </div>
            </div>

            <Field label="Email">
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="support@domain.com" className={inputCls} />
            </Field>
            <Field label="Nomor Telepon">
              <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+62 ..." className={inputCls} />
            </Field>
            <Field label="Nomor WhatsApp">
              <input value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} placeholder="+62 812xxxx (tanpa spasi untuk link wa.me)" className={inputCls} />
            </Field>

            <button
              onClick={save}
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
              style={{ background: "var(--gradient-neon)" }}
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Simpan
            </button>
          </div>
        </Card>
      )}
    </DashboardShell>
  );
}

const inputCls =
  "w-full rounded-2xl border border-border bg-card/50 px-3 py-2.5 text-sm outline-none focus:border-primary/60";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="text-[11px] uppercase tracking-widest text-muted-foreground mb-1.5">{label}</div>
      {children}
    </label>
  );
}
