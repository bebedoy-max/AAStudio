// Katalog payment gateway yang umum digunakan developer aplikasi Indonesia.
// Setiap provider mendefinisikan schema parameter (field name + label + tipe +
// apakah rahasia). Field `environment` selalu ada (sandbox/production) dan
// dihandle oleh kolom sendiri di tabel `payment_gateways`, jadi TIDAK perlu
// dimasukkan di daftar `fields` di bawah.

export type ProviderField = {
  key: string;
  label: string;
  type?: "text" | "password" | "textarea";
  required?: boolean;
  secret?: boolean;
  placeholder?: string;
  help?: string;
};

export type ProviderDef = {
  id: string;
  name: string;
  category: "aggregator" | "bank_va" | "ewallet";
  docsUrl?: string;
  description?: string;
  /** true kalau tombol "Test koneksi" benar-benar memanggil API provider. */
  liveTestSupported?: boolean;
  fields: ProviderField[];
};

export const PAYMENT_PROVIDERS: ProviderDef[] = [
  {
    id: "midtrans",
    name: "Midtrans",
    category: "aggregator",
    docsUrl: "https://docs.midtrans.com/",
    description: "QRIS, Snap, Core API. Test koneksi live tersedia.",
    liveTestSupported: true,
    fields: [
      { key: "merchant_id", label: "Merchant ID", required: true, placeholder: "M123456" },
      { key: "client_key",  label: "Client Key",  required: true, placeholder: "SB-Mid-client-..." },
      { key: "server_key",  label: "Server Key",  required: true, secret: true, placeholder: "SB-Mid-server-..." },
    ],
  },
  {
    id: "xendit",
    name: "Xendit",
    category: "aggregator",
    docsUrl: "https://developers.xendit.co/",
    description: "Invoice, e-wallet, VA, QRIS.",
    fields: [
      { key: "secret_key", label: "Secret Key (API Key)", required: true, secret: true, placeholder: "xnd_..." },
      { key: "public_key", label: "Public Key", placeholder: "xnd_public_..." },
      { key: "webhook_verification_token", label: "Webhook Verification Token", secret: true },
    ],
  },
  {
    id: "doku",
    name: "DOKU (Jokul)",
    category: "aggregator",
    docsUrl: "https://developers.doku.com/",
    fields: [
      { key: "client_id",  label: "Client ID",  required: true },
      { key: "secret_key", label: "Secret Key", required: true, secret: true },
    ],
  },
  {
    id: "faspay",
    name: "Faspay",
    category: "aggregator",
    docsUrl: "https://docs.faspay.co.id/",
    fields: [
      { key: "merchant_id",   label: "Merchant ID",   required: true },
      { key: "merchant_code", label: "Merchant Code", required: true },
      { key: "user_id",       label: "User ID",       required: true },
      { key: "password",      label: "Password",      required: true, secret: true },
    ],
  },
  {
    id: "finpay",
    name: "Finpay / Finnet",
    category: "aggregator",
    docsUrl: "https://docs.finpay.id/",
    fields: [
      { key: "merchant_id",  label: "Merchant ID",  required: true },
      { key: "merchant_key", label: "Merchant Key", required: true, secret: true },
    ],
  },
  {
    id: "espay",
    name: "Espay",
    category: "aggregator",
    docsUrl: "https://docs.espay.id/",
    fields: [
      { key: "merchant_id",   label: "Merchant ID",   required: true },
      { key: "signature_key", label: "Signature Key", required: true, secret: true },
      { key: "password",      label: "Password",      required: true, secret: true },
    ],
  },
  {
    id: "winpay",
    name: "Winpay",
    category: "aggregator",
    fields: [
      { key: "merchant_id", label: "Merchant ID", required: true },
      { key: "secret_key",  label: "Secret Key",  required: true, secret: true },
    ],
  },
  {
    id: "prismalink",
    name: "Prismalink",
    category: "aggregator",
    fields: [
      { key: "merchant_id", label: "Merchant ID", required: true },
      { key: "terminal_id", label: "Terminal ID", required: true },
      { key: "secret_key",  label: "Secret Key",  required: true, secret: true },
    ],
  },
  {
    id: "ipay88",
    name: "iPay88 / Kaspay",
    category: "aggregator",
    fields: [
      { key: "merchant_code", label: "Merchant Code", required: true },
      { key: "merchant_key",  label: "Merchant Key",  required: true, secret: true },
    ],
  },
  {
    id: "firstpay",
    name: "FirstPay",
    category: "aggregator",
    fields: [
      { key: "merchant_id", label: "Merchant ID", required: true },
      { key: "api_key",     label: "API Key",     required: true, secret: true },
    ],
  },
  {
    id: "truemoney",
    name: "TrueMoney",
    category: "ewallet",
    fields: [
      { key: "merchant_id", label: "Merchant ID", required: true },
      { key: "api_key",     label: "API Key",     required: true, secret: true },
      { key: "secret_key",  label: "Secret Key",  required: true, secret: true },
    ],
  },
  {
    id: "va_bca",
    name: "Virtual Account BCA",
    category: "bank_va",
    docsUrl: "https://developer.bca.co.id/",
    fields: [
      { key: "corporate_id", label: "Corporate ID (BCA_ID)", required: true },
      { key: "va_prefix",    label: "VA Prefix / Company Code", required: true },
      { key: "api_key",      label: "API Key",     required: true, secret: true },
      { key: "secret_key",   label: "Secret Key",  required: true, secret: true },
    ],
  },
  {
    id: "va_bri",
    name: "Virtual Account BRI (BRIVA)",
    category: "bank_va",
    docsUrl: "https://developers.bri.co.id/",
    fields: [
      { key: "client_id",           label: "Client ID",           required: true },
      { key: "client_secret",       label: "Client Secret",       required: true, secret: true },
      { key: "institution_code",    label: "Institution Code",    required: true },
      { key: "brizzi_merchant_id",  label: "Brizzi Merchant ID" },
    ],
  },
  {
    id: "va_mandiri",
    name: "Virtual Account Mandiri",
    category: "bank_va",
    fields: [
      { key: "merchant_id",   label: "Merchant ID",   required: true },
      { key: "client_id",     label: "Client ID",     required: true },
      { key: "client_secret", label: "Client Secret", required: true, secret: true },
    ],
  },
  {
    id: "va_bni",
    name: "Virtual Account BNI",
    category: "bank_va",
    fields: [
      { key: "client_id",     label: "Client ID",     required: true },
      { key: "client_secret", label: "Client Secret", required: true, secret: true },
      { key: "prefix",        label: "VA Prefix",     required: true },
    ],
  },
];

export function getProviderDef(id: string): ProviderDef | undefined {
  return PAYMENT_PROVIDERS.find((p) => p.id === id);
}

/** Mask nilai secret jadi bentuk aman untuk ditampilkan di UI ("••••1234"). */
export function maskSecret(value: string): string {
  if (!value) return "";
  const tail = value.slice(-4);
  return `••••${tail}`;
}