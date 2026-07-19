import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Check as CheckIcon, Image as ImageIcon, Film, Mic, Move3d, Info, Brain } from "lucide-react";
import { DashboardShell, PageHero } from "@/components/dashboard/shell";
import { Card } from "@/components/dashboard/ui";

export const Route = createFileRoute("/manage/routing")({
  head: () => ({ meta: [{ title: "Routing Provider — AA Creative Studio" }, { name: "description", content: "Pilih provider per kapabilitas: Image, Video, Voice Over, Motion Control." }] }),
  component: RoutingPage,
});

type CapKey = "brain" | "image" | "video" | "voice" | "motion";
type ProviderOpt = {
  id: string;
  name: string;
  desc: string;
  models: { name: string; cost: string }[];
  note?: string;
};
type Cap = {
  key: CapKey;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  desc: string;
  providers: ProviderOpt[];
};

// Standard credit / harga acuan publik per provider (angka referensi, bisa berubah sewaktu-waktu di sisi provider).
const CAPS: Cap[] = [
  {
    key: "brain",
    label: "Brain (Text AI)",
    icon: Brain,
    desc: "Otak generator naskah, prompt, caption, scenario — dipakai Storyboard, Naratif, AI Influencer.",
    providers: [
      {
        id: "gemini",
        name: "Google Gemini",
        desc: "Default. Multi-key auto-rotate saat kena 429. Isi API key AIza… di Token Manager → Brain.",
        models: [
          { name: "gemini-2.5-flash", cost: "Free tier: 15 rpm / 1M token/hari" },
          { name: "gemini-flash-latest", cost: "Auto fallback" },
          { name: "gemini-2.5-flash-lite", cost: "Auto fallback" },
        ],
      },
      {
        id: "openai",
        name: "OpenAI GPT",
        desc: "Fallback tier-2 bila semua Gemini kena limit. Butuh key sk-… di Token Manager.",
        models: [
          { name: "gpt-4o-mini", cost: "$0.15 / 1M input · $0.60 / 1M output" },
          { name: "gpt-4.1-mini", cost: "Auto fallback" },
        ],
      },
      {
        id: "claude",
        name: "Anthropic Claude",
        desc: "Belum aktif — coming soon. Rencana: Claude Sonnet 4 untuk caption bernuansa panjang.",
        models: [{ name: "claude-sonnet-4 (planned)", cost: "TBA" }],
        note: "coming-soon",
      },
      {
        id: "perplexity",
        name: "Perplexity",
        desc: "Belum aktif — coming soon. Untuk brain yang butuh live web research.",
        models: [{ name: "sonar-pro (planned)", cost: "TBA" }],
        note: "coming-soon",
      },
    ],
  },
  {
    key: "image",
    label: "Image Generation",
    icon: ImageIcon,
    desc: "Provider untuk generate & edit gambar (Storyboard, Bulk Fashion, Thumbnail).",
    providers: [
      {
        id: "weavy",
        name: "Weavy",
        desc: "Akses multi-model image via 1 token Weavy. Cocok untuk workflow storyboard.",
        models: [
          { name: "Gemini 2.5 Flash Image (Nano Banana)", cost: "~4 cr / image" },
          { name: "Flux 1.1 Pro", cost: "~8 cr / image" },
          { name: "Seedream 4.0", cost: "~6 cr / image" },
        ],
      },
      {
        id: "gemini",
        name: "Gemini Direct",
        desc: "Langsung ke Google AI Studio pakai API key AIza… (paling murah bila key sendiri).",
        models: [
          { name: "gemini-2.5-flash-image", cost: "$0.039 / image (≈ free tier tersedia)" },
          { name: "gemini-3-pro-image", cost: "$0.134 / image" },
        ],
      },
      {
        id: "openai",
        name: "OpenAI Direct",
        desc: "Fallback bila Gemini limit. Butuh key sk-…",
        models: [
          { name: "gpt-image-1 (1024²)", cost: "$0.040 / image" },
          { name: "gpt-image-1 HD (1024²)", cost: "$0.167 / image" },
        ],
      },
    ],
  },
  {
    key: "video",
    label: "Video Generation",
    icon: Film,
    desc: "Provider untuk Image-to-Video & Text-to-Video.",
    providers: [
      {
        id: "wavespeed",
        name: "Wavespeed",
        desc: "Termurah untuk Kling & Seedance i2v. Bayar per detik.",
        models: [
          { name: "Kling v2.1 Standard (i2v)", cost: "$0.05 / detik" },
          { name: "Kling v2.1 Pro (i2v)", cost: "$0.09 / detik" },
          { name: "Seedance Pro (i2v)", cost: "$0.06 / detik" },
          { name: "Wan 2.2 (i2v)", cost: "$0.04 / detik" },
        ],
      },
      {
        id: "weavy",
        name: "Weavy",
        desc: "Video via token pool Weavy. Nyaman bila sudah punya banyak akun.",
        models: [
          { name: "Kling v2.1", cost: "~30 cr / clip 5s" },
          { name: "Kling v1.6", cost: "~18 cr / clip 5s" },
          { name: "Sora / Seedance", cost: "~40 cr / clip 5s" },
        ],
      },
    ],
  },
  {
    key: "voice",
    label: "Voice Over",
    icon: Mic,
    desc: "Provider TTS untuk Naratif Video Maker.",
    providers: [
      {
        id: "elevenlabs",
        name: "ElevenLabs",
        desc: "Kualitas suara terbaik. Bayar per karakter.",
        models: [
          { name: "Multilingual v2", cost: "1 karakter = 1 credit ElevenLabs" },
          { name: "Turbo v2.5 (low latency)", cost: "0.5 karakter = 1 credit" },
          { name: "Free tier", cost: "10.000 karakter / bulan gratis" },
        ],
      },
    ],
  },
  {
    key: "motion",
    label: "Motion Control",
    icon: Move3d,
    desc: "Provider untuk Kling Motion Control (character + reference video).",
    providers: [
      {
        id: "weavy",
        name: "Weavy",
        desc: "Default. Motion Control via Kling melalui token Weavy.",
        models: [{ name: "Kling Motion Control", cost: "~35 cr / clip 5s" }],
      },
      {
        id: "wavespeed",
        name: "Wavespeed",
        desc: "Kling Motion Control via Wavespeed API. Support V2.6 & V3.0 (Pro/Std).",
        models: [
          { name: "Kling V3.0 Pro / Std", cost: "84 / 63 cr per clip" },
          { name: "Kling V2.6 Pro / Std", cost: "56 / 21 cr per clip" },
        ],
      },
      {
        id: "roboneo",
        name: "Roboneo",
        desc: "Kling Motion Control via Roboneo (Meitu gateway). Hanya Kling V2.6 Standard.",
        models: [{ name: "Kling V2.6 Standard", cost: "Gratis (kuota akun Roboneo)" }],
      },
      {
        id: "magnific",
        name: "Magnific",
        desc: "Kling Motion Control langsung via api.magnific.com. Butuh Freepik/Magnific API key (FPSX…).",
        models: [{ name: "Kling Motion Transfer", cost: "~50 Freepik cr / clip 5s" }],
      },
    ],
  },
];

const LS_ROUTING = "aatools.routing.v2";
type RoutingState = Record<CapKey, string>;
const DEFAULT_ROUTING: RoutingState = { brain: "gemini", image: "weavy", video: "wavespeed", voice: "elevenlabs", motion: "weavy" };

function RoutingPage() {
  const [routing, setRouting] = useState<RoutingState>(DEFAULT_ROUTING);
  const [savedAt, setSavedAt] = useState<string>("");

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = localStorage.getItem(LS_ROUTING);
      if (raw) setRouting({ ...DEFAULT_ROUTING, ...JSON.parse(raw) });
    } catch {
      /* ignore */
    }
  }, []);

  const setCap = (cap: CapKey, id: string) => {
    const next = { ...routing, [cap]: id };
    setRouting(next);
    if (typeof window !== "undefined") localStorage.setItem(LS_ROUTING, JSON.stringify(next));
    setSavedAt(new Date().toLocaleTimeString());
  };

  return (
    <DashboardShell>
      <PageHero
        eyebrow="Manage"
        title="Routing"
        highlight="Provider"
        desc="Pilih provider per kapabilitas — Image, Video, Voice Over, Motion Control. Tersimpan lokal di browser."
      />

      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
        <Info className="h-3.5 w-3.5" />
        <span>
          Info model & biaya di bawah adalah harga acuan resmi provider per Juli 2026. Harga aktual mengikuti dashboard masing-masing.
        </span>
        {savedAt && <span className="ml-auto text-emerald-400">Tersimpan {savedAt}</span>}
      </div>

      {/* Mobile: compact dropdown per capability */}
      <div className="md:hidden flex flex-col gap-3">
        {CAPS.map((cap) => {
          const Icon = cap.icon;
          const activeProv = cap.providers.find((p) => p.id === routing[cap.key]);
          return (
            <div key={cap.key} className="neumorph p-3">
              <div className="flex items-center gap-2 mb-2">
                <Icon className="h-4 w-4 text-primary" />
                <div className="text-sm font-display text-foreground">{cap.label}</div>
              </div>
              <select
                value={routing[cap.key]}
                onChange={(e) => setCap(cap.key, e.target.value)}
                className="w-full rounded-xl border border-border bg-card/50 px-3 py-2.5 text-sm font-medium outline-none focus:border-primary/60"
              >
                {cap.providers.map((p) => (
                  <option
                    key={p.id}
                    value={p.id}
                    disabled={p.note === "coming-soon"}
                    className="bg-[oklch(0.19_0.055_275)]"
                  >
                    {p.name}
                    {p.note === "coming-soon" ? " (coming soon)" : ""}
                  </option>
                ))}
              </select>
              {activeProv && (
                <div className="mt-1.5 text-[10px] font-mono text-muted-foreground">
                  Aktif: <span className="text-primary">{activeProv.name}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Desktop: full card layout */}
      <div className="hidden md:flex flex-col gap-5">
      {CAPS.map((cap) => {
        const Icon = cap.icon;
        return (
          <Card key={cap.key}>
            <div className="flex items-start gap-2 mb-4">
              <Icon className="h-5 w-5 text-primary mt-0.5" />
              <div>
                <div className="font-display text-lg text-foreground">{cap.label}</div>
                <div className="text-xs text-muted-foreground mt-0.5">{cap.desc}</div>
              </div>
              <div className="ml-auto text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                Aktif: <span className="text-primary">{cap.providers.find((p) => p.id === routing[cap.key])?.name || "-"}</span>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {cap.providers.map((p) => {
                const on = routing[cap.key] === p.id;
                const soon = p.note === "coming-soon";
                return (
                  <button
                    key={p.id}
                    onClick={() => !soon && setCap(cap.key, p.id)}
                    disabled={soon}
                    className={[
                      "neumorph p-4 text-left transition relative flex flex-col gap-3",
                      soon ? "opacity-50 cursor-not-allowed" : on ? "neon-border glow-cyan" : "hover:border-primary/40",
                    ].join(" ")}
                  >
                    <div className="flex items-center justify-between">
                      <div className="font-display text-base text-foreground">{p.name}</div>
                      {soon && (
                        <span className="text-[9px] font-mono uppercase tracking-widest px-2 py-0.5 rounded-full border border-amber-500/40 text-amber-300 bg-amber-500/10">
                          Coming Soon
                        </span>
                      )}
                      {!soon && on && (
                        <span
                          className="h-6 w-6 rounded-full grid place-items-center text-primary-foreground"
                          style={{ background: "var(--gradient-neon)" }}
                        >
                          <CheckIcon className="h-3.5 w-3.5" />
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-muted-foreground leading-relaxed">{p.desc}</div>
                    <div className="mt-1 space-y-1.5">
                      <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Model & Cost</div>
                      {p.models.map((m) => (
                        <div
                          key={m.name}
                          className="flex items-center justify-between gap-2 rounded-lg border border-border/60 bg-card/30 px-2.5 py-1.5"
                        >
                          <span className="text-[11px] text-foreground/85 truncate">{m.name}</span>
                          <span className="text-[10px] font-mono text-emerald-300 whitespace-nowrap">{m.cost}</span>
                        </div>
                      ))}
                    </div>
                  </button>
                );
              })}
            </div>
          </Card>
        );
      })}
      </div>

    </DashboardShell>
  );
}
