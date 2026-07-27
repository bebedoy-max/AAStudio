// Character slot generator — sama recipe seperti Bulk Fashion (Weavy NB2 / GPT-Image-2)
// dan Wavespeed edit endpoints — dengan 1 front photo sebagai reference identitas.
// Prompt per-slot memaksa AI mengubah HANYA sudut/pose/framing, identitas dijaga.

import { generateWeavyBulkOne } from "@/lib/providers/weavy-bulk-fashion";
import {
  getAllWavespeedKeys,
  wsUploadMedia,
  wsPost,
  wsPoll,
  WAVESPEED_API,
  isWavespeedRotatableError,
} from "@/lib/providers/wavespeed";

const CHAR_DIRECTIVE =
  "PENTING (character consistency): Gambar referensi adalah karakter yang identitasnya WAJIB dipertahankan 100% — wajah, kulit, warna & bentuk mata, hidung, bibir, alis, rambut / hijab, bentuk tubuh, warna outfit. Jangan ubah identitas. Yang boleh berubah HANYA sudut pandang / pose / framing sesuai instruksi. Background netral studio bersih, pencahayaan lembut merata, tanpa teks / watermark / logo. Instruksi: ";

export const SLOT_PROMPTS: Record<string, string> = {
  full_body_front:
    "Karakter yang sama, full body tampak depan, berdiri natural menghadap kamera, framing kaki sampai kepala.",
  full_body_back:
    "Karakter yang sama, full body tampak dari BELAKANG, berdiri natural, framing kaki sampai kepala.",
  left_side:
    "Karakter yang sama, tampak SAMPING KIRI (profil kiri) 90°, full body, berdiri natural.",
  right_side:
    "Karakter yang sama, tampak SAMPING KANAN (profil kanan) 90°, full body, berdiri natural.",
  face_close_up:
    "Wajah karakter yang sama, CLOSE-UP potret dari bahu ke atas, menghadap kamera, ekspresi netral relax.",
  smile:
    "Wajah karakter yang sama, tersenyum natural (bukan grinning), close-up potret dari bahu ke atas, mata memandang kamera.",
  neutral:
    "Wajah karakter yang sama, ekspresi NETRAL relax (mulut tertutup, tidak senyum), close-up potret dari bahu ke atas.",
  sitting:
    "Karakter yang sama, pose DUDUK di kursi / bangku netral, full body, tangan rileks di paha, menghadap kamera.",
  standing:
    "Karakter yang sama, pose BERDIRI natural menghadap kamera, tangan di samping badan, full body.",
  walking:
    "Karakter yang sama, sedang BERJALAN santai ke arah kamera, full body, angle 3/4, kaki dalam gerakan.",
  hand_detail:
    "Detail TANGAN karakter yang sama (bentuk jari, kuku, tekstur kulit) — close-up macro kedua tangan.",
  outfit:
    "OUTFIT karakter yang sama ditampilkan pada mannequin studio (tanpa wajah), flat / 3/4 view.",
  hair:
    "Detail STYLE RAMBUT / HIJAB karakter yang sama — close-up dari belakang dan samping.",
  accessory:
    "Detail ACCESSORY (perhiasan / kacamata / tas) yang dipakai karakter — close-up macro.",
  pose_library:
    "Karakter yang sama dalam VARIASI POSE dinamis (tangan bergerak, badan sedikit menyamping), full body.",
};

async function urlToFile(url: string, name = "front.jpg"): Promise<File> {
  const res = await fetch(url);
  const blob = await res.blob();
  return new File([blob], name, { type: blob.type || "image/jpeg" });
}

export type CharacterSlotProvider = "weavy" | "wavespeed" | "framia";

export type SlotGenOpts = {
  provider: CharacterSlotProvider;
  modelKey: string; // weavy: "nanobanana2" | "gptimage2" ; wavespeed: "ws:google/nano-banana-2/edit" dst.
  quality: string;
  ratio: string;
  slotKey: string;
  frontUrl: string; // blob: atau remote
};

async function runWavespeedSlot(opts: SlotGenOpts, prompt: string): Promise<string> {
  const keys = getAllWavespeedKeys();
  if (keys.length === 0) throw new Error("Belum ada Wavespeed API key di Token Manager");
  const modelId = opts.modelKey.replace(/^ws:/, "");
  const file = await urlToFile(opts.frontUrl, `front_${Date.now()}.jpg`);
  let lastErr: Error | null = null;
  for (const key of keys) {
    try {
      const frontUploaded = await wsUploadMedia(file, `front_${Date.now()}.jpg`, key);
      const payload: Record<string, unknown> = {
        prompt,
        images: [frontUploaded],
        aspect_ratio: opts.ratio,
      };
      if (/gpt-image/.test(modelId)) payload.quality = opts.quality;
      if (/nano-banana/.test(modelId)) payload.resolution = opts.quality;
      const data = await wsPost(modelId, payload, key);
      const getUrl = data.urls?.get || `${WAVESPEED_API}/predictions/${data.id}/result`;
      return await wsPoll(getUrl, key, { timeoutMs: 300000 });
    } catch (e) {
      lastErr = e instanceof Error ? e : new Error(String(e));
      if (!isWavespeedRotatableError(lastErr.message)) throw lastErr;
    }
  }
  throw lastErr ?? new Error("Semua Wavespeed key gagal / habis credit");
}

export async function generateCharacterSlot(opts: SlotGenOpts): Promise<string> {
  const prompt =
    CHAR_DIRECTIVE + (SLOT_PROMPTS[opts.slotKey] || `Karakter yang sama, angle ${opts.slotKey}`);
  if (opts.provider === "weavy") {
    const file = await urlToFile(opts.frontUrl, `front_${Date.now()}.jpg`);
    // Recipe bulk-fashion menerima 2 image inputs. Kirim front photo di kedua slot
    // untuk memperkuat identitas — model tetap menghasilkan 1 gambar sesuai prompt angle.
    return generateWeavyBulkOne({
      modelKey: opts.modelKey,
      prompt,
      quality: opts.quality,
      ratio: opts.ratio,
      charFile: file,
      outfitFile: file,
    });
  }
  if (opts.provider === "framia") {
    const { generateFramiaImage } = await import("@/lib/providers/framia-image");
    return generateFramiaImage({
      modelKey: opts.modelKey,
      prompt,
      aspectRatio: opts.ratio,
      resolution: opts.quality,
      referenceUrls: [opts.frontUrl],
    });
  }
  return runWavespeedSlot(opts, prompt);
}

// Model catalog untuk UI (mirror Bulk Fashion — hanya model yang mendukung
// multi image reference: NB2 & GPT-Image-2).
export type QualityOpt = { v: string; label: string; default?: boolean };
export type ModelOpt = { key: string; label: string; qualities: QualityOpt[] };
export const CHAR_MODEL_CATALOG: Record<CharacterSlotProvider, ModelOpt[]> = {
  weavy: [
    {
      key: "nanobanana2",
      label: "Gemini Nano Banana 2 (Weavy)",
      qualities: [
        { v: "0.5K", label: "0.5K" },
        { v: "1K", label: "1K", default: true },
        { v: "2K", label: "2K" },
        { v: "4K", label: "4K" },
      ],
    },
    {
      key: "gptimage2",
      label: "Image GPT 2 (Weavy)",
      qualities: [
        { v: "low", label: "Low" },
        { v: "medium", label: "Medium", default: true },
        { v: "high", label: "High" },
      ],
    },
  ],
  wavespeed: [
    {
      key: "ws:google/nano-banana-2/edit",
      label: "Nano Banana 2 Edit (Wavespeed)",
      qualities: [
        { v: "1K", label: "1K", default: true },
        { v: "2K", label: "2K" },
      ],
    },
    {
      key: "ws:google/nano-banana-pro/edit",
      label: "Nano Banana Pro (Wavespeed)",
      qualities: [{ v: "default", label: "Standard", default: true }],
    },
    {
      key: "ws:openai/gpt-image-2/edit",
      label: "GPT-Image-2 Edit (Wavespeed)",
      qualities: [
        { v: "low", label: "Low" },
        { v: "medium", label: "Medium", default: true },
        { v: "high", label: "High" },
      ],
    },
  ],
  framia: [
    {
      key: "framia:nano-banana-lite-edit",
      label: "Nano Banana Lite Edit (Framia)",
      qualities: [
        { v: "1K", label: "1K (~1 cr)", default: true },
        { v: "2K", label: "2K (~2 cr)" },
      ],
    },
    {
      key: "framia:nano-banana-edit",
      label: "Nano Banana Edit (Framia)",
      qualities: [
        { v: "1K", label: "1K (~2 cr)", default: true },
        { v: "2K", label: "2K (~3 cr)" },
      ],
    },
    {
      key: "framia:nano-banana-2-edit",
      label: "Nano Banana 2 Edit (Framia)",
      qualities: [
        { v: "1K", label: "1K (~3 cr)", default: true },
        { v: "2K", label: "2K (~4 cr)" },
      ],
    },
    {
      key: "framia:nano-banana-pro-edit",
      label: "Nano Banana Pro Edit (Framia)",
      qualities: [{ v: "default", label: "Standard (~5 cr)", default: true }],
    },
    {
      key: "framia:gpt-image-2-edit",
      label: "GPT Image 2 Edit (Framia)",
      qualities: [
        { v: "2K", label: "2K (~5 cr)", default: true },
        { v: "4K", label: "4K (~8 cr)" },
      ],
    },
    {
      key: "framia:seedream-4-edit",
      label: "Seedream 4.0 Edit (Framia)",
      qualities: [
        { v: "1K", label: "1K (~3 cr)", default: true },
        { v: "2K", label: "2K (~4 cr)" },
      ],
    },
    {
      key: "framia:seedream-5-pro-edit",
      label: "Seedream 5 Pro Edit (Framia)",
      qualities: [
        { v: "1K", label: "1K (~4 cr)", default: true },
        { v: "2K", label: "2K (~5 cr)" },
      ],
    },
  ],

};

export function getActiveProvider(): CharacterSlotProvider {
  if (typeof window === "undefined") return "weavy";
  try {
    const raw = localStorage.getItem("aatools.routing.v2");
    if (raw) {
      const routed = (JSON.parse(raw) as { image?: string })?.image;
      if (routed === "wavespeed" || routed === "framia" || routed === "weavy") return routed;
    }
  } catch {}
  const p =
    localStorage.getItem("aatools.activeProvider") ||
    localStorage.getItem("aatools:activeProvider") ||
    "weavy";
  if (p === "wavespeed" || p === "framia") return p;
  return "weavy";
}
