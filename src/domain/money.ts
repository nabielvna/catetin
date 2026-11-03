import { DomainError } from "@/domain/errors";

// Integer amounts in the currency's smallest unit.
export type Minor = number;

export const MAX_MINOR = 1_000_000_000_000;

// prettier-ignore
export const CURRENCIES = [
  "AED", "AFN", "ALL", "AMD", "AOA", "ARS", "AUD", "AWG", "AZN", "BAM", "BBD", "BDT",
  "BGN", "BHD", "BIF", "BMD", "BND", "BOB", "BRL", "BSD", "BTN", "BWP", "BYN", "BZD",
  "CAD", "CDF", "CHF", "CLP", "CNY", "COP", "CRC", "CUP", "CVE", "CZK", "DJF", "DKK",
  "DOP", "DZD", "EGP", "ERN", "ETB", "EUR", "FJD", "FKP", "GBP", "GEL", "GHS", "GIP",
  "GMD", "GNF", "GTQ", "GYD", "HKD", "HNL", "HTG", "HUF", "IDR", "ILS", "INR", "IQD",
  "IRR", "ISK", "JMD", "JOD", "JPY", "KES", "KGS", "KHR", "KMF", "KRW", "KWD", "KYD",
  "KZT", "LAK", "LBP", "LKR", "LRD", "LSL", "LYD", "MAD", "MDL", "MGA", "MKD", "MMK",
  "MNT", "MOP", "MRU", "MUR", "MVR", "MWK", "MXN", "MYR", "MZN", "NAD", "NGN", "NIO",
  "NOK", "NPR", "NZD", "OMR", "PAB", "PEN", "PGK", "PHP", "PKR", "PLN", "PYG", "QAR",
  "RON", "RSD", "RUB", "RWF", "SAR", "SBD", "SCR", "SDG", "SEK", "SGD", "SHP", "SLE",
  "SOS", "SRD", "SSP", "STN", "SYP", "SZL", "THB", "TJS", "TMT", "TND", "TOP", "TRY",
  "TTD", "TWD", "TZS", "UAH", "UGX", "USD", "UYU", "UZS", "VES", "VND", "VUV", "WST",
  "XAF", "XCD", "XCG", "XOF", "XPF", "YER", "ZAR", "ZMW", "ZWG",
] as const;

export type Currency = (typeof CURRENCIES)[number];

export function isCurrency(value: string): value is Currency {
  return (CURRENCIES as readonly string[]).includes(value);
}

// IDR uses whole rupiah in this app, despite its ISO exponent of 2.
const EXPONENT_OVERRIDES: Partial<Record<Currency, number>> = { IDR: 0, JPY: 0, KRW: 0, VND: 0, TWD: 0 };

export function currencyExponent(currency: Currency): number {
  const override = EXPONENT_OVERRIDES[currency];
  if (override !== undefined) return override;
  return new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions().maximumFractionDigits ?? 2;
}

export function toMajor(minor: Minor, currency: Currency): number {
  return minor / 10 ** currencyExponent(currency);
}

export function fromMajor(amount: number, currency: Currency): Minor {
  return Math.round(amount * 10 ** currencyExponent(currency));
}

export function assertValidAmount(amount: Minor): void {
  if (!Number.isSafeInteger(amount) || amount <= 0 || amount > MAX_MINOR) {
    throw new DomainError("INVALID_INPUT", { field: "amount" });
  }
}

const MULTIPLIERS: Array<[RegExp, bigint]> = [
  [/(miliar|milyar|m)$/, 1_000_000_000n],
  [/(juta|jt)$/, 1_000_000n],
  [/(ribu|rb|k)$/, 1_000n],
];

export function parseAmount(input: string, currency: Currency): Minor | null {
  const exp = currencyExponent(currency);
  let text = input.trim().toLowerCase().replace(/\s+/g, "");
  if (!text) return null;

  text = text.replace(/^(rp\.?|us\$|s\$|rm|[a-z]{3}(?=[\d.,])|[^\d.,a-z-]+)/, "");

  let multiplier = 1n;
  for (const [re, m] of MULTIPLIERS) {
    if (re.test(text)) {
      multiplier = m;
      text = text.replace(re, "");
      break;
    }
  }

  if (!/^\d[\d.,]*$/.test(text)) return null;

  const decimalSep = detectDecimalSeparator(text, exp, multiplier > 1n);
  let intPart: string;
  let fracPart = "";
  if (decimalSep) {
    const idx = text.lastIndexOf(decimalSep);
    intPart = text.slice(0, idx);
    fracPart = text.slice(idx + 1);
    if (!/^\d*$/.test(fracPart)) return null;
  } else {
    intPart = text;
  }

  if (/[.,]/.test(intPart) && !/^\d{1,3}([.,]\d{3})+$/.test(intPart)) return null;
  intPart = intPart.replace(/[.,]/g, "");
  if (!/^\d+$/.test(intPart)) return null;

  const scale = 10n ** BigInt(fracPart.length);
  const scaled = BigInt(intPart + fracPart) * multiplier * 10n ** BigInt(exp);
  if (scaled % scale !== 0n) return null;
  const minor = scaled / scale;
  if (minor <= 0n || minor > BigInt(MAX_MINOR)) return null;
  return Number(minor);
}

function detectDecimalSeparator(text: string, exponent: number, hasMultiplier: boolean): "." | "," | null {
  const dots = (text.match(/\./g) ?? []).length;
  const commas = (text.match(/,/g) ?? []).length;
  if (dots === 0 && commas === 0) return null;
  if (dots > 0 && commas > 0) {
    return text.lastIndexOf(".") > text.lastIndexOf(",") ? "." : ",";
  }
  const sep = dots > 0 ? "." : ",";
  const count = dots + commas;
  if (count > 1) return null;
  const digitsAfter = text.length - text.lastIndexOf(sep) - 1;
  if (hasMultiplier) return sep;
  if (exponent === 0) return null;
  return digitsAfter === 3 ? null : sep;
}

export type SignDisplay = "auto" | "always" | "never";

export function formatMoney(minor: Minor, currency: Currency, locale = "id-ID", sign: SignDisplay = "auto"): string {
  const exp = currencyExponent(currency);
  const abs = Math.abs(minor);
  const parts = new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    currencyDisplay: "symbol",
    minimumFractionDigits: exp,
    maximumFractionDigits: exp,
  }).formatToParts(abs / 10 ** exp);

  const body = parts
    .filter((p, i) => {
      if (p.type !== "literal" || p.value.trim() !== "") return true;

      const prev = parts[i - 1]?.type;
      const next = parts[i + 1]?.type;
      return !(prev === "currency" || next === "currency");
    })
    .map((p) => p.value)
    .join("");

  if (sign === "never" || minor === 0) return body;
  if (minor < 0) return `−${body}`;
  return sign === "always" ? `+${body}` : body;
}

export function formatNumber(minor: Minor, currency: Currency, locale = "id-ID"): string {
  const exp = currencyExponent(currency);
  return new Intl.NumberFormat(locale, { minimumFractionDigits: exp, maximumFractionDigits: exp }).format(
    Math.abs(minor) / 10 ** exp,
  );
}

export function currencySymbol(currency: Currency, locale = "id-ID"): string {
  return (
    new Intl.NumberFormat(locale, { style: "currency", currency }).formatToParts(0).find((p) => p.type === "currency")
      ?.value ?? currency
  );
}

export function toInputString(minor: Minor, currency: Currency): string {
  const exp = currencyExponent(currency);
  if (exp === 0) return new Intl.NumberFormat("id-ID").format(minor);
  return (minor / 10 ** exp).toFixed(exp);
}

// Equal rounding remainders follow input order.
export function allocateByWeights(total: Minor, weights: readonly number[]): Minor[] {
  if (weights.length === 0) return [];
  if (weights.some((w) => !Number.isSafeInteger(w) || w < 0)) {
    throw new DomainError("INVALID_INPUT", { field: "weights" });
  }
  const bigWeights = weights.map((w) => BigInt(w));
  const sum = bigWeights.reduce((a, b) => a + b, 0n);
  if (sum === 0n) {
    if (total === 0) return weights.map(() => 0);
    throw new DomainError("INVALID_INPUT", { field: "weights" });
  }
  const T = BigInt(total);
  const sign = T < 0n ? -1n : 1n;
  const absT = T * sign;
  const base = bigWeights.map((w) => (absT * w) / sum);
  const rema = bigWeights.map((w, i) => ({ i, r: (absT * w) % sum }));
  let left = absT - base.reduce((a, b) => a + b, 0n);
  rema.sort((a, b) => (a.r === b.r ? a.i - b.i : a.r > b.r ? -1 : 1));
  for (const { i } of rema) {
    if (left === 0n) break;
    base[i] = (base[i] ?? 0n) + 1n;
    left -= 1n;
  }
  return base.map((b) => Number(b * sign));
}

export function splitEvenly(total: Minor, n: number): Minor[] {
  return allocateByWeights(
    total,
    Array.from({ length: n }, () => 1),
  );
}

export function isValidRate(rate: string): boolean {
  return /^\d{1,12}(\.\d{1,10})?$/.test(rate) && !/^0+(\.0+)?$/.test(rate);
}

export function convert(minor: Minor, from: Currency, to: Currency, rate: string): Minor {
  if (from === to) return minor;
  if (!isValidRate(rate)) throw new DomainError("INVALID_RATE");
  const [intPart, fracPart = ""] = rate.split(".");
  const num = BigInt((intPart ?? "0") + fracPart);
  const den = 10n ** BigInt(fracPart.length);
  const expDiff = currencyExponent(to) - currencyExponent(from);
  let n = BigInt(minor) * num;
  let d = den;
  if (expDiff >= 0) n *= 10n ** BigInt(expDiff);
  else d *= 10n ** BigInt(-expDiff);
  const q = (n * 2n + d) / (2n * d);
  return Number(q);
}

export type MoneyByCurrency = Partial<Record<Currency, Minor>>;

export function addTo(acc: MoneyByCurrency, currency: Currency, minor: Minor): MoneyByCurrency {
  acc[currency] = (acc[currency] ?? 0) + minor;
  return acc;
}

export function nonZeroEntries(m: MoneyByCurrency): Array<[Currency, Minor]> {
  return (Object.entries(m) as Array<[Currency, Minor]>).filter(([, v]) => v !== 0);
}
