import { CURRENCIES, type Currency } from "@/domain/money";

const REGION_CURRENCY: Record<string, Currency> = {
  ID: "IDR",
  US: "USD",
  SG: "SGD",
  MY: "MYR",
  JP: "JPY",
  KR: "KRW",
  CN: "CNY",
  HK: "HKD",
  TW: "TWD",
  TH: "THB",
  VN: "VND",
  PH: "PHP",
  IN: "INR",
  SA: "SAR",
  AE: "AED",
  AU: "AUD",
  NZ: "NZD",
  GB: "GBP",
  CH: "CHF",
  CA: "CAD",
  DE: "EUR",
  FR: "EUR",
  NL: "EUR",
  ES: "EUR",
  IT: "EUR",
  BE: "EUR",
  AT: "EUR",
  IE: "EUR",
  FI: "EUR",
  PT: "EUR",
};

export function guessCurrency(languages: readonly string[]): Currency {
  for (const lang of languages) {
    const region = lang.split("-")[1]?.toUpperCase();
    if (region && REGION_CURRENCY[region]) return REGION_CURRENCY[region];
    if (lang.toLowerCase().startsWith("id")) return "IDR";
  }
  return "IDR";
}

export function guessTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Jakarta";
  } catch {
    return "Asia/Jakarta";
  }
}

export { CURRENCIES };
