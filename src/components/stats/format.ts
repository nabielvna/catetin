type T = (key: string, values?: Record<string, string | number>) => string;

export const DASH = "–";

export function days(t: T, n: number | null): string {
  return n === null ? DASH : t("days", { count: n });
}

export function within(t: T, minutes: number | null): string {
  if (minutes === null) return DASH;
  if (minutes < 60) return t("minutes", { count: Math.max(1, minutes) });
  if (minutes < 60 * 24) return t("hours", { count: Math.round(minutes / 60) });
  return t("daysApprox", { count: Math.round(minutes / (60 * 24)) });
}

export function age(t: T, d: number): string {
  if (d < 60) return t("age.days", { count: d });
  if (d < 730) return t("age.months", { count: Math.round(d / 30) });
  return t("age.years", { count: Math.round(d / 365) });
}

export function times(t: T, n: number | null, locale: string): string {
  if (n === null) return DASH;
  return t("times", { count: new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(n) });
}
