// Client-safe catalog of payment methods per provider. Digunakan oleh
// picker di UI dan oleh server fn `listActivePaymentMethods`.
// TIDAK berisi kredensial apa pun.

export type MethodKind =
  | "qris"
  | "va"
  | "ewallet"
  | "card"
  | "convenience"
  | "direct_debit";

export type MethodDef = {
  code: string; // dikirim ke provider (mis. DOKU payment_method_types)
  label: string; // untuk UI
  kind: MethodKind;
};

export const DOKU_METHODS: MethodDef[] = [
  { code: "VIRTUAL_ACCOUNT_BCA", label: "VA BCA", kind: "va" },
  { code: "VIRTUAL_ACCOUNT_MANDIRI", label: "VA Mandiri", kind: "va" },
  { code: "VIRTUAL_ACCOUNT_BRI", label: "VA BRI", kind: "va" },
  { code: "VIRTUAL_ACCOUNT_BANK_NEGARA_INDONESIA", label: "VA BNI", kind: "va" },
  { code: "VIRTUAL_ACCOUNT_BANK_CIMB", label: "VA CIMB", kind: "va" },
  { code: "VIRTUAL_ACCOUNT_BANK_PERMATA", label: "VA Permata", kind: "va" },
  { code: "VIRTUAL_ACCOUNT_BANK_DKI", label: "VA Bank DKI", kind: "va" },
  { code: "EMONEY_OVO", label: "OVO", kind: "ewallet" },
  { code: "EMONEY_DANA", label: "DANA", kind: "ewallet" },
  { code: "EMONEY_SHOPEEPAY", label: "ShopeePay", kind: "ewallet" },
  { code: "EMONEY_LINKAJA", label: "LinkAja", kind: "ewallet" },
  { code: "QRIS", label: "QRIS", kind: "qris" },
  { code: "CREDIT_CARD", label: "Kartu Kredit / Debit", kind: "card" },
  { code: "DIRECT_DEBIT_BRI", label: "BRI Direct Debit", kind: "direct_debit" },
  { code: "DIRECT_DEBIT_MANDIRI", label: "Mandiri Direct Debit", kind: "direct_debit" },
  { code: "ONLINE_TO_OFFLINE_ALFA", label: "Alfamart / Alfamidi", kind: "convenience" },
];

export const MIDTRANS_METHODS: MethodDef[] = [
  { code: "QRIS", label: "QRIS (Midtrans)", kind: "qris" },
];

export function methodsForProvider(provider: string): MethodDef[] {
  if (provider === "doku") return DOKU_METHODS;
  if (provider === "midtrans") return MIDTRANS_METHODS;
  return [];
}
