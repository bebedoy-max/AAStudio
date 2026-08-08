import { useState } from "react";
import { createPortal } from "react-dom";
import { ShoppingBag, X } from "lucide-react";
import {
  LS,
  SummaryCtx,
  SummaryDialog,
  BrainPane,
  WeavyPane,
  ProviderKeyPane,
  ElevenPane,
  RenderPane,
  ImportModal,
  type SummaryPayload,
} from "@/routes/manage.tokens";
import { BuyTokenDialog } from "@/components/token-bank/buy-dialog";

const LABEL: Record<string, string> = {
  brain: "Brain (Gemini)",
  weavy: "Weavy",
  wavespeed: "Wavespeed",
  magnific: "Magnific",
  roboneo: "Roboneo",
  framia: "Framia",
  leonardo: "Leonardo.ai",
  firefly: "Adobe Firefly",
  dola: "Dola",
  eleven: "ElevenLabs",
  render: "Render",
};

/** Provider tanpa tab sendiri → dipetakan ke pane provider lain. */
const TOKEN_TAB: Record<string, string> = { topaz: "magnific" };

function Pane({ provider, onOpenImport }: { provider: string; onOpenImport: () => void }) {
  switch (provider) {
    case "brain":
      return <BrainPane />;
    case "weavy":
      return <WeavyPane onOpenImport={onOpenImport} />;
    case "eleven":
      return <ElevenPane />;
    case "render":
      return <RenderPane />;
    case "wavespeed":
      return (
        <ProviderKeyPane
          provider="wavespeed"
          lsKey={LS.wavespeed}
          singlePlaceholder="wsk_live_..."
          bulkPlaceholder={"wsk_live_XXX...\nwsk_live_YYY..."}
          helper="Balance dicek via api.wavespeed.ai/api/v3/balance."
        />
      );
    case "magnific":
      return (
        <ProviderKeyPane
          provider="magnific"
          lsKey={LS.magnific}
          singlePlaceholder="FPSX... (Magnific/Freepik API key)"
          bulkPlaceholder={"FPSX-XXXX...\nFPSX-YYYY..."}
          helper="Magnific dipakai untuk Motion Control (Kling motion transfer)."
        />
      );
    case "roboneo":
      return (
        <ProviderKeyPane
          provider="roboneo"
          lsKey={LS.roboneo}
          singlePlaceholder="_v2NGMz... (Roboneo access-token)"
          bulkPlaceholder={"_v2NGMzMThk...\n_v2ABCDEF..."}
          helper="Roboneo access-token = login-session token. Multi-token auto-rotate."
        />
      );
    case "dola":
      return (
        <ProviderKeyPane
          provider="dola"
          lsKey={LS.dola}
          singlePlaceholder="sessionid=...; sid_guard=...; msToken=... (cookie penuh dola.com)"
          bulkPlaceholder={"sessionid=aaa...; sid_guard=...\nsessionid=bbb...; sid_guard=..."}
          helper="Dola memakai cookie session (bukan API key). Multi-cookie auto-rotate."
        />
      );
    case "firefly":
      return (
        <ProviderKeyPane
          provider="firefly"
          lsKey={LS.firefly}
          singlePlaceholder="eyJhbGciOiJSUzI1NiIsIng1dSI6... (Adobe Firefly Bearer token)"
          bulkPlaceholder={"eyJhbGciOiJS...\neyJhbGciOiJS..."}
          helper="Firefly Bearer = IMS access token dari firefly.adobe.com (~24 jam)."
        />
      );
    case "framia":
      return (
        <ProviderKeyPane
          provider="framia"
          lsKey={LS.framia}
          singlePlaceholder="eyJhbGciOiJSUzI1NiIsInR5c... (Framia Bearer JWT)"
          bulkPlaceholder={"eyJhbGciOiJS...\neyJhbGciOiJS..."}
          helper="Framia Bearer JWT = auth0 session token (~24 jam). Multi-token auto-rotate."
        />
      );
    case "leonardo":
      return (
        <ProviderKeyPane
          provider="leonardo"
          lsKey={LS.leonardo}
          singlePlaceholder="eyJraWQiOi... (Leonardo Cognito Bearer JWT)"
          bulkPlaceholder={"eyJraWQi...\neyJraWQi..."}
          helper="Leonardo Cognito ID token (~1 jam). Multi-token auto-rotate."
        />
      );
    default:
      return (
        <div className="rounded-xl border border-border bg-card/50 p-4 text-sm text-muted-foreground">
          Provider ini belum punya form token.
        </div>
      );
  }
}

/** Popup isi token provider aktif — tanpa pindah halaman. */
export function TokenFillDialog({ provider, onClose }: { provider: string; onClose: () => void }) {
  const tab = TOKEN_TAB[provider] ?? provider;
  const [summary, setSummary] = useState<SummaryPayload | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [buyOpen, setBuyOpen] = useState(false);

  if (typeof document === "undefined") return null;

  return createPortal(
    <SummaryCtx.Provider value={setSummary}>
      <div
        className="fixed inset-0 z-[9999] flex items-center justify-center overflow-y-auto bg-background/80 p-4 backdrop-blur-sm"
        onClick={onClose}
      >
        <div
          className="w-full max-w-2xl rounded-2xl border border-border bg-card p-5 shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Isi Token</div>
              <div className="font-display text-lg text-foreground">{LABEL[tab] ?? tab}</div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setBuyOpen(true)}
                className="btn-gold-glow inline-flex items-center gap-2 rounded-full border border-primary/50 bg-primary/10 px-5 py-2.5 text-sm font-semibold text-primary transition-colors hover:bg-primary/20"
                title="Beli token"
              >
                <ShoppingBag className="h-4 w-4" />
                Beli Token
              </button>
              <button
                onClick={onClose}
                className="rounded-full border border-border p-1.5 text-muted-foreground hover:bg-sidebar-accent/40"
                aria-label="Tutup"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>


          <Pane provider={tab} onOpenImport={() => setShowImport(true)} />
        </div>
      </div>

      {showImport && <ImportModal onClose={() => setShowImport(false)} />}
      {summary && <SummaryDialog payload={summary} onClose={() => setSummary(null)} />}
      {buyOpen && <BuyTokenDialog onClose={() => setBuyOpen(false)} />}
    </SummaryCtx.Provider>,
    document.body,
  );
}
