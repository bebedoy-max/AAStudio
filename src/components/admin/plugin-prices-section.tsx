import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/dashboard/ui";
import {
  PLUGIN_CATALOG,
  pluginAccess,
  pluginName,
  pluginPrice,
  type PluginConfig,
} from "@/lib/plugins/catalog";
import { Loader2, Save, Puzzle, Info } from "lucide-react";
import { toast } from "sonner";
import { useDirty } from "@/lib/hooks/use-dirty";

function formatRupiah(n: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(n || 0);
}

export function PluginPricesSection() {
  const [cfg, setCfg] = useState<PluginConfig>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { dirty, markSaved } = useDirty(cfg, !loading);

  useEffect(() => {
    (async () => {
      const { data } = await (supabase as any)
        .from("app_settings")
        .select("plugin_config")
        .eq("id", 1)
        .maybeSingle();
      if (data?.plugin_config) setCfg(data.plugin_config as PluginConfig);
      setLoading(false);
    })();
  }, []);

  const premium = useMemo(
    () => PLUGIN_CATALOG.filter((p) => pluginAccess(p, cfg) === "premium"),
    [cfg],
  );

  function setPrice(id: string, value: number) {
    setCfg((prev) => ({ ...prev, [id]: { ...prev[id], priceIdr: value } }));
  }

  async function save() {
    setSaving(true);
    const { error } = await (supabase as any).from("app_settings").upsert({
      id: 1,
      plugin_config: cfg,
      updated_at: new Date().toISOString(),
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    markSaved();
    toast.success("Harga Plug-IN tersimpan");
  }

  if (loading)
    return (
      <Card>
        <div className="p-8 grid place-items-center">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        </div>
      </Card>
    );

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <div className="p-4 flex items-start gap-3 text-xs text-muted-foreground">
          <Info className="h-4 w-4 mt-[1px] text-primary shrink-0" />
          <p>
            Hanya plug-in dengan status <span className="text-foreground">Premium</span> di Admin →
            Plug-IN Config yang bisa diberi harga. Ubah statusnya di sana bila plug-in tidak muncul
            di daftar ini.
          </p>
        </div>
      </Card>

      {premium.length === 0 ? (
        <Card>
          <div className="p-10 text-center text-sm text-muted-foreground">
            Belum ada plug-in berstatus Premium.
          </div>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {premium.map((p) => {
            const price = pluginPrice(p, cfg);
            return (
              <Card key={p.id}>
                <div className="p-4 flex flex-wrap items-center gap-3">
                  <div
                    className="h-10 w-10 rounded-2xl grid place-items-center text-white shrink-0"
                    style={{ background: p.accent }}
                  >
                    <Puzzle className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-display text-base truncate">{pluginName(p, cfg)}</div>
                    <div className="text-[11px] text-muted-foreground truncate">
                      {p.provider} · {price > 0 ? formatRupiah(price) : "Harga belum diatur"}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Rp</span>
                    <input
                      type="number"
                      min={0}
                      step={1000}
                      value={cfg[p.id]?.priceIdr ?? 0}
                      onChange={(e) => setPrice(p.id, Number(e.target.value))}
                      className="w-40 rounded-2xl border border-border bg-card/50 px-3 py-2 text-sm outline-none focus:border-primary/60"
                    />
                  </div>
                </div>
              </Card>
            );
          })}

          <div className="flex justify-end">
            <button
              onClick={save}
              disabled={saving || !dirty}
              className="inline-flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-60"
              style={{ background: "var(--gradient-neon)" }}
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Simpan Harga
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
