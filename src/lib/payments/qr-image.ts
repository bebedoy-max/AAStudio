// Helper QR khusus browser: render payload jadi data-URL PNG, dan decode
// gambar QR (screenshot / hasil unduh QRIS statis) jadi payload teks.

export async function renderQrDataUrl(text: string, size = 320): Promise<string> {
  const QR = await import("qrcode");
  const toDataURL = (QR as unknown as { toDataURL: typeof import("qrcode").toDataURL }).toDataURL;
  return await toDataURL(text, {
    errorCorrectionLevel: "M",
    margin: 2,
    width: size,
    color: { dark: "#0b0b0f", light: "#ffffff" },
  });
}

/** Decode QR dari file gambar. Mengembalikan null kalau tidak terbaca. */
export async function decodeQrFromFile(file: File): Promise<string | null> {
  const [{ default: jsQR }, bitmap] = await Promise.all([import("jsqr"), createImageBitmap(file)]);
  // Coba beberapa skala — QR dari screenshot sering terlalu kecil/besar.
  for (const scale of [1, 2, 0.5]) {
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) break;
    ctx.drawImage(bitmap, 0, 0, w, h);
    const { data } = ctx.getImageData(0, 0, w, h);
    const found = jsQR(data, w, h, { inversionAttempts: "attemptBoth" });
    if (found?.data) return found.data;
  }
  return null;
}
