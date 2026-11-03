// Calendar dates have no time zone. Callers supply the instant for the local date.
export type LocalDate = string;

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isLocalDate(value: string): value is LocalDate {
  const m = ISO_DATE.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (y < 1970 || y > 2100) return false;
  const date = new Date(Date.UTC(y, mo - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d;
}

export const DEFAULT_TIMEZONE = "Asia/Jakarta";

export function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export function todayIn(tz: string, now: Date): LocalDate {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function hourIn(tz: string, now: Date): number {
  const h = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", hourCycle: "h23" }).format(now);
  return Number(h);
}

function toUtc(date: LocalDate): number {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  return Date.UTC(y, m - 1, d);
}

function fromUtc(ms: number): LocalDate {
  return new Date(ms).toISOString().slice(0, 10);
}

export function addDays(date: LocalDate, days: number): LocalDate {
  return fromUtc(toUtc(date) + days * 86_400_000);
}

export function diffDays(a: LocalDate, b: LocalDate): number {
  return Math.round((toUtc(b) - toUtc(a)) / 86_400_000);
}

export function endOfMonth(date: LocalDate): LocalDate {
  const [y, m] = date.split("-").map(Number) as [number, number];
  return fromUtc(Date.UTC(y, m, 0));
}

export function compareDates(a: LocalDate, b: LocalDate): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
