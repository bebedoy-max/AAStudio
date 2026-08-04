import { useState } from "react";
import { Coins, Plus } from "lucide-react";
import { useProviderCredit } from "@/lib/providers/credit-summary";
import { TokenFillDialog } from "@/components/tokens/token-fill-dialog";


const PROVIDER_LABEL: Record<string, string> = {
  brain: "Brain",
  weavy: "Weavy",
  wavespeed: "Wavespeed",
  magnific: "Magnific",
  roboneo: "Roboneo",
  framia: "Framia",
  leonardo: "Leonardo",
  firefly: "Firefly",
  dola: "Dola",
  eleven: "ElevenLabs",
  topaz: "Topaz",
  render: "Render",
};

/** Token key yang dipakai Token Manager (beberapa provider tidak punya tab sendiri). */
const TOKEN_TAB: Record<string, string> = { topaz: "magnific" };

export type GenStatus = "idle" | "processing" | "sukses" | "gagal";

/** Ambang minimum sisa credit per provider sebelum tombol isi token diberi peringatan. */
const LOW_CREDIT: Record<string, number> = {
  weavy: 20,
  roboneo: 40,
  leonardo: 1000,
  framia: 60,
};

/** True bila token kosong atau sisa credit di bawah ambang provider. */
function isLowToken(provider: string, tokens: number, credits: number | null) {
  if (tokens === 0) return true;
  const min = LOW_CREDIT[provider];
  if (min == null || credits == null) return false;
  return credits < min;
}

function statusTone(status: GenStatus) {
  if (status === "sukses") return "border-emerald-500/40 bg-emerald-500/10 text-emerald-300";
  if (status === "gagal") return "border-rose-500/40 bg-rose-500/10 text-rose-300";
  if (status === "processing") return "border-amber-500/40 bg-amber-500/10 text-amber-300";
  return "border-border bg-card/60 text-muted-foreground";
}

/**
 * Bar info generate: baris atas = Cost / Token / Sisa credit,
 * baris bawah = Status + tombol pil isi token provider aktif.
 */
export function GenMetaBar({
  provider,
  cost,
  status = "idle",
  note,
  className,
}: {
  provider: string;
  cost?: number | null;
  status?: GenStatus;
  note?: string;
  className?: string;
}) {
  const { tokens, credits } = useProviderCredit(provider);
  const label = PROVIDER_LABEL[provider] ?? provider;
  const tab = TOKEN_TAB[provider] ?? provider;
  const [fillOpen, setFillOpen] = useState(false);
  const low = isLowToken(provider, tokens, credits);

  return (
    <div
      className={
        "rounded-2xl border border-border/70 bg-card/50 px-3 py-2 backdrop-blur-sm " + (className || "")
      }
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span>
          Cost: <b className="font-mono tabular-nums text-foreground">{cost == null ? "—" : cost.toLocaleString("id-ID")}</b> credits
        </span>
        <span className="text-border">·</span>
        <span>
          Token: <b className="font-mono tabular-nums text-fuchsia-300">{tokens}</b>
        </span>
        <span className="text-border">·</span>
        <span>
          Sisa credit:{" "}
          <b className="font-mono tabular-nums text-emerald-400">
            {credits == null ? "—" : credits.toLocaleString("id-ID")}
          </b>
        </span>
        {note && <span className="text-muted-foreground/80">{note}</span>}
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground">Status:</span>
        <span
          className={
            "inline-flex items-center rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider " +
            statusTone(status)
          }
        >
          {status}
        </span>
        <button
          type="button"
          onClick={() => setFillOpen(true)}
          className={"inline-flex items-center gap-1 rounded-full border border-primary/50 bg-primary/10 px-2.5 py-0.5 text-[11px] font-semibold text-primary transition-colors hover:bg-primary/20" + (low ? " token-low-alert" : "")}
          title={`Isi token ${label}`}
        >
          <Plus className="h-3 w-3" />
          <Coins className="h-3 w-3" />
          Isi Token {label}
        </button>
      </div>
      {fillOpen && <TokenFillDialog provider={tab} onClose={() => setFillOpen(false)} />}
    </div>
  );

}

/** Satu baris tabel multi-provider. */
function MetaRow({ slot, provider }: { slot: string; provider: string }) {
  const { tokens, credits } = useProviderCredit(provider);
  const label = PROVIDER_LABEL[provider] ?? provider;
  const tab = TOKEN_TAB[provider] ?? provider;
  const [fillOpen, setFillOpen] = useState(false);
  const low = isLowToken(provider, tokens, credits);

  return (
    <>
      <div className="contents">
        <div className="px-2 py-1 text-muted-foreground">{slot}</div>
        <div className="px-2 py-1 font-semibold text-foreground">{label}</div>
        <div className="px-2 py-1 text-right font-mono tabular-nums text-fuchsia-300">{tokens}</div>
        <div className="px-2 py-1 text-right font-mono tabular-nums text-emerald-400">
          {credits == null ? "—" : credits.toLocaleString("id-ID")}
        </div>
        <div className="px-2 py-1 text-right">
          <button
            type="button"
            onClick={() => setFillOpen(true)}
            className={"inline-flex items-center gap-1 rounded-full border border-primary/50 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary transition-colors hover:bg-primary/20" + (low ? " token-low-alert" : "")}
            title={`Isi token ${label}`}
          >
            <Plus className="h-3 w-3" />
            <Coins className="h-3 w-3" />
            Isi
          </button>
        </div>
      </div>
      {fillOpen && <TokenFillDialog provider={tab} onClose={() => setFillOpen(false)} />}
    </>
  );
}

/** Versi ringkas horizontal (dipakai di layar lebar). */
function MetaChip({ slot, provider }: { slot: string; provider: string }) {
  const { tokens, credits } = useProviderCredit(provider);
  const label = PROVIDER_LABEL[provider] ?? provider;
  const tab = TOKEN_TAB[provider] ?? provider;
  const [fillOpen, setFillOpen] = useState(false);
  const low = isLowToken(provider, tokens, credits);

  return (
    <>
      <div className="flex items-center gap-1.5 whitespace-nowrap">
        <span className="text-muted-foreground">{slot}:</span>
        <span className="font-semibold text-foreground">{label}</span>
        <span className="font-mono tabular-nums text-fuchsia-300">{tokens}</span>
        <span className="text-border">/</span>
        <span className="font-mono tabular-nums text-emerald-400">
          {credits == null ? "—" : credits.toLocaleString("id-ID")}
        </span>
        <button
          type="button"
          onClick={() => setFillOpen(true)}
          className={"inline-flex items-center gap-1 rounded-full border border-primary/50 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary transition-colors hover:bg-primary/20" + (low ? " token-low-alert" : "")}
          title={`Isi token ${label}`}
        >
          <Plus className="h-3 w-3" />
          <Coins className="h-3 w-3" />
          Isi
        </button>
      </div>
      {fillOpen && <TokenFillDialog provider={tab} onClose={() => setFillOpen(false)} />}
    </>
  );
}


/**
 * Versi tabel untuk halaman multi-model (image + video + voice).
 * Ringkas, satu baris per slot provider.
 */
export function GenMetaTable({
  items,
  cost,
  status = "idle",
  className,
}: {
  items: Array<{ slot: string; provider: string }>;
  cost?: number | null;
  status?: GenStatus;
  className?: string;
}) {
  return (
    <div
      className={
        "rounded-2xl border border-border/70 bg-card/50 p-2 backdrop-blur-sm lg:flex lg:flex-1 lg:flex-wrap lg:items-center lg:gap-x-4 lg:gap-y-1 lg:px-3 " +
        (className || "")
      }
    >
      {/* Mobile / tablet: tabel vertikal */}
      <div className="grid grid-cols-[auto_1fr_auto_auto_auto] items-center text-[11px] lg:hidden">
        <div className="px-2 pb-1 font-mono text-[9px] uppercase tracking-wider text-muted-foreground">Slot</div>
        <div className="px-2 pb-1 font-mono text-[9px] uppercase tracking-wider text-muted-foreground">Provider</div>
        <div className="px-2 pb-1 text-right font-mono text-[9px] uppercase tracking-wider text-muted-foreground">Token</div>
        <div className="px-2 pb-1 text-right font-mono text-[9px] uppercase tracking-wider text-muted-foreground">Credit</div>
        <div className="px-2 pb-1 text-right font-mono text-[9px] uppercase tracking-wider text-muted-foreground">Aksi</div>
        {items.map((it) => (
          <MetaRow key={it.slot + it.provider} slot={it.slot} provider={it.provider} />
        ))}
      </div>

      {/* Desktop: memanjang ke samping */}
      <div className="hidden lg:flex lg:flex-wrap lg:items-center lg:gap-x-4 lg:gap-y-1 text-[11px]">
        {items.map((it) => (
          <MetaChip key={it.slot + it.provider} slot={it.slot} provider={it.provider} />
        ))}
      </div>

      <div className="mt-1 flex flex-wrap items-center gap-2 border-t border-border/60 px-2 pt-1.5 text-[11px] text-muted-foreground lg:mt-0 lg:border-l lg:border-t-0 lg:pt-0 lg:pl-4">

        <span>
          Cost: <b className="font-mono tabular-nums text-foreground">{cost == null ? "—" : cost.toLocaleString("id-ID")}</b> credits
        </span>
        <span className="text-border">·</span>
        <span>Status:</span>
        <span
          className={
            "inline-flex items-center rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider " +
            statusTone(status)
          }
        >
          {status}
        </span>
      </div>
    </div>
  );
}
