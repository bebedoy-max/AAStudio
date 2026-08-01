// QRIS (EMVCo) parser/builder — mengubah payload QRIS STATIS milik merchant
// (mis. GoPay Merchant) menjadi QRIS DINAMIS bernominal tetap.
//
// Ringkas cara kerjanya:
//   - Payload QRIS adalah rangkaian TLV: tag(2) + length(2) + value(length).
//   - Tag 01 = Point of Initiation Method: "11" statis, "12" dinamis (sekali pakai).
//   - Tag 54 = Transaction Amount (angka desimal, titik sebagai pemisah).
//   - Tag 63 = CRC16-CCITT (FALSE) atas seluruh payload termasuk "6304".
// Jadi: set 01 -> 12, sisipkan 54 sebelum tag 58 (Country Code), hitung ulang CRC.

export type QrisTag = { tag: string; value: string };

export function parseQris(payload: string): QrisTag[] {
  const out: QrisTag[] = [];
  let i = 0;
  while (i + 4 <= payload.length) {
    const tag = payload.slice(i, i + 2);
    const len = Number(payload.slice(i + 2, i + 4));
    if (!/^\d{2}$/.test(tag) || !Number.isFinite(len)) break;
    const value = payload.slice(i + 4, i + 4 + len);
    if (value.length < len) break;
    out.push({ tag, value });
    i += 4 + len;
  }
  return out;
}

export function buildQris(tags: QrisTag[]): string {
  return tags.map((t) => `${t.tag}${String(t.value.length).padStart(2, "0")}${t.value}`).join("");
}

/** CRC16-CCITT (FALSE): poly 0x1021, init 0xFFFF. */
export function crc16(input: string): string {
  let crc = 0xffff;
  for (let i = 0; i < input.length; i++) {
    crc ^= input.charCodeAt(i) << 8;
    for (let b = 0; b < 8; b++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

/** Ambil nama merchant (tag 59) & kota (60) untuk ditampilkan di UI. */
export function readMerchant(payload: string): { name: string | null; city: string | null } {
  const tags = parseQris(payload);
  const get = (t: string) => tags.find((x) => x.tag === t)?.value ?? null;
  return { name: get("59"), city: get("60") };
}

export type QrisValidation =
  | { ok: true; merchantName: string | null; city: string | null; isStatic: boolean }
  | { ok: false; error: string };

/** Validasi payload QRIS: struktur TLV, tag wajib, dan CRC. */
export function validateQris(raw: string): QrisValidation {
  const payload = raw.trim();
  if (payload.length < 20) return { ok: false, error: "Payload terlalu pendek untuk QRIS." };
  if (!payload.startsWith("000201")) {
    return { ok: false, error: "Bukan payload QRIS (tidak dimulai dengan 000201)." };
  }
  const crcIndex = payload.lastIndexOf("6304");
  if (crcIndex < 0) return { ok: false, error: "Tag CRC (63) tidak ditemukan." };
  const expected = crc16(payload.slice(0, crcIndex + 4));
  const actual = payload.slice(crcIndex + 4, crcIndex + 8).toUpperCase();
  if (expected !== actual) {
    return { ok: false, error: `CRC tidak valid (harus ${expected}, terbaca ${actual}).` };
  }
  const tags = parseQris(payload);
  const get = (t: string) => tags.find((x) => x.tag === t)?.value ?? null;
  if (!get("58")) return { ok: false, error: "Tag negara (58) tidak ditemukan." };
  return {
    ok: true,
    merchantName: get("59"),
    city: get("60"),
    isStatic: (get("01") ?? "11") === "11",
  };
}

/**
 * Ubah QRIS statis menjadi dinamis dengan nominal tetap.
 * `amount` dalam rupiah (integer). Mengembalikan payload siap dirender jadi QR.
 */
export function toDynamicQris(rawPayload: string, amount: number): string {
  const payload = rawPayload.trim();
  const check = validateQris(payload);
  if (!check.ok) throw new Error(check.error);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Nominal tidak valid.");

  const crcIndex = payload.lastIndexOf("6304");
  const body = payload.slice(0, crcIndex); // tanpa tag 63
  const tags = parseQris(body).filter((t) => t.tag !== "54");

  const withMode = tags.map((t) => (t.tag === "01" ? { tag: "01", value: "12" } : t));
  const amountTag: QrisTag = { tag: "54", value: String(Math.round(amount)) };

  // Sisipkan tag 54 tepat sebelum 58 (urutan tag QRIS harus menaik).
  const idx58 = withMode.findIndex((t) => t.tag === "58");
  const ordered =
    idx58 >= 0
      ? [...withMode.slice(0, idx58), amountTag, ...withMode.slice(idx58)]
      : [...withMode, amountTag];

  const rebuilt = buildQris(ordered) + "6304";
  return rebuilt + crc16(rebuilt);
}
