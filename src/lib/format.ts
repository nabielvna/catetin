import { type Currency, currencySymbol, formatMoney, formatNumber, type SignDisplay } from "@/domain/money";

export function intlLocale(locale: string): string {
  return locale === "en" ? "en-US" : "id-ID";
}

export function money(minor: number, currency: Currency | string, locale: string, sign: SignDisplay = "auto") {
  return formatMoney(minor, currency as Currency, intlLocale(locale), sign);
}

export function moneyParts(minor: number, currency: Currency | string, locale: string) {
  return {
    symbol: currencySymbol(currency as Currency, intlLocale(locale)),
    number: formatNumber(minor, currency as Currency, intlLocale(locale)),
  };
}

const MONTHS: Record<string, string[]> = {
  id: ["JAN", "FEB", "MAR", "APR", "MEI", "JUN", "JUL", "AGU", "SEP", "OKT", "NOV", "DES"],
  en: ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"],
};

export function dateBlock(date: string, locale: string) {
  const [, m, d] = date.split("-");
  return { day: d ?? "", month: (MONTHS[locale] ?? MONTHS.id!)[Number(m) - 1] ?? "" };
}

export function formatDate(
  date: string,
  locale: string,
  opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" },
) {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  return new Intl.DateTimeFormat(intlLocale(locale), { ...opts, timeZone: "UTC" }).format(
    new Date(Date.UTC(y, m - 1, d)),
  );
}

export function relativeTime(iso: string, locale: string, now = Date.now()): string {
  const diff = (new Date(iso).getTime() - now) / 1000;
  const rtf = new Intl.RelativeTimeFormat(intlLocale(locale), { numeric: "auto", style: "long" });
  const abs = Math.abs(diff);
  if (abs < 60) return rtf.format(Math.round(diff), "second");
  if (abs < 3600) return rtf.format(Math.round(diff / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), "hour");
  if (abs < 86400 * 7) return rtf.format(Math.round(diff / 86400), "day");
  return new Intl.DateTimeFormat(intlLocale(locale), { day: "numeric", month: "short" }).format(new Date(iso));
}
