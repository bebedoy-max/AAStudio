// Magnific provider client.
// Legacy: JANGAN panggil API untuk cek — endpoint apapun menghanguskan credit.
// Anggap key valid saat disimpan; error kredit habis muncul saat generate Motion Control.

export async function checkMagnificKey(_apiKey: string): Promise<{ ok: boolean; balance: string }> {
  // Matches legacy semantics: no probe call.
  return { ok: true, balance: "—" };
}
