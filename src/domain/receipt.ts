import { type Adjustments, bpsToInput } from "@/domain/adjustments";
import { compareDates, isLocalDate, type LocalDate } from "@/domain/dates";
import { type Category, isCategory } from "@/domain/debt";
import { type Currency, currencyExponent, isCurrency, MAX_MINOR, type Minor, toInputString } from "@/domain/money";

export const SCAN_MAX_PHOTOS = 3;
export const SCAN_MAX_ITEMS = 60;
export const SCAN_METHODS = ["CASH", "TRANSFER", "EWALLET", "CARD"] as const;
export type ScanMethod = (typeof SCAN_METHODS)[number];

export type RawScan = {
  kind: "RECEIPT" | "TRANSFER" | "OTHER";
  merchant: string | null;
  date: string | null;
  currency: string | null;

  items: Array<{ name: string; quantity: number | null; total: number; photo?: number | null }>;
  subtotal: number | null;
  discount: number | null;
  servicePercent: number | null;
  serviceAmount: number | null;
  taxPercent: number | null;
  taxAmount: number | null;
  rounding: number | null;
  total: number | null;
  category: string | null;
  method: string | null;
  note: string | null;
};

export type ReceiptItem = { name: string; amount: Minor; photo: number; suspect?: boolean };

export type Receipt = {
  kind: "RECEIPT" | "TRANSFER" | "OTHER";
  merchant: string | null;
  date: LocalDate | null;
  currency: Currency;

  items: ReceiptItem[];

  deduped: string[];
  subtotal: Minor | null;
  discount: Minor;
  serviceBps: number;
  taxBps: number;

  serviceAmount: Minor | null;
  taxAmount: Minor | null;
  rounding: Minor;
  total: Minor | null;
  category: Category | null;
  method: ScanMethod | null;
  note: string | null;
};

const clean = (s: string | null | undefined, max: number): string | null => {
  const v = (s ?? "").replace(/\s+/g, " ").trim().slice(0, max);
  return v ? v : null;
};

function toMinor(v: number | null | undefined, currency: Currency, allowNegative = false): Minor | null {
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  const m = Math.round(v * 10 ** currencyExponent(currency));
  if (Math.abs(m) > MAX_MINOR || (!allowNegative && m < 0)) return null;
  return m;
}

function toBps(percent: number, derived: boolean): number {
  let bps = Math.round(percent * 100);
  if (derived && Math.abs(bps - Math.round(bps / 50) * 50) <= 5) bps = Math.round(bps / 50) * 50;
  return bps;
}

// Printed amounts take precedence because receipt tax bases can differ.
function percentOf(printed: number | null, amount: Minor | null, base: Minor): number {
  if (amount && amount > 0 && base > 0) {
    const p = (amount / base) * 100;
    if (p <= 100) return toBps(p, true);
  }
  if (typeof printed === "number" && Number.isFinite(printed) && printed > 0 && printed <= 100)
    return toBps(printed, false);
  return 0;
}

export function normalizeScan(raw: RawScan, fallback: Currency, today: LocalDate): Receipt {
  const code = clean(raw.currency, 3)?.toUpperCase() ?? "";
  const currency = isCurrency(code) ? code : fallback;

  const parsed = (raw.items ?? [])
    .map((it) => {
      const amount = toMinor(it.total, currency);
      let name = clean(it.name, 90);
      const q = it.quantity;
      if (name && typeof q === "number" && Number.isInteger(q) && q > 1 && !/[×x]\s*\d+\s*$/i.test(name))
        name = `${name} ×${q}`;
      const photo = typeof it.photo === "number" && Number.isInteger(it.photo) && it.photo > 0 ? it.photo : 1;
      return name && amount && amount > 0 ? { name, amount, photo } : null;
    })
    .filter((x): x is ReceiptItem => x !== null)
    .slice(0, SCAN_MAX_ITEMS);

  const printedSubtotal = toMinor(raw.subtotal, currency) || null;
  const { items, removed } = dedupeOverlaps(parsed, printedSubtotal);
  const itemsTotal = items.reduce((s, it) => s + it.amount, 0);
  const subtotal = printedSubtotal || itemsTotal || null;
  const discountRaw = toMinor(raw.discount === null ? null : Math.abs(raw.discount), currency) ?? 0;
  const discount = subtotal && discountRaw < subtotal ? discountRaw : 0;
  const afterDiscount = (subtotal ?? 0) - discount;
  const serviceAmount = toMinor(raw.serviceAmount, currency) || null;
  const taxAmount = toMinor(raw.taxAmount, currency) || null;
  const serviceBps = percentOf(raw.servicePercent, serviceAmount, afterDiscount);
  const service = Math.round((afterDiscount * serviceBps) / 10_000);
  const taxBps = percentOf(raw.taxPercent, taxAmount, afterDiscount + (serviceAmount ?? service));
  const total = toMinor(raw.total, currency) || null;

  const date = raw.date && isLocalDate(raw.date) && compareDates(raw.date, today) <= 0 ? raw.date : null;
  const category = raw.category && isCategory(raw.category) && raw.category !== "OTHER" ? raw.category : null;
  const method = (SCAN_METHODS as readonly string[]).includes(raw.method ?? "") ? (raw.method as ScanMethod) : null;
  const kind = raw.kind === "RECEIPT" || raw.kind === "TRANSFER" ? raw.kind : "OTHER";

  return {
    kind,
    merchant: clean(raw.merchant, 100),
    date,
    currency,
    items,
    deduped: removed.map((it) => it.name),
    subtotal,
    discount,
    serviceBps,
    taxBps,
    serviceAmount,
    taxAmount,
    rounding: toMinor(raw.rounding, currency, true) ?? 0,
    total,
    category,
    method,
    note: clean(raw.note, 200),
  };
}

export function receiptAmount(r: Receipt): Minor | null {
  if (r.total) return r.total;
  if (!r.subtotal) return null;
  const after = r.subtotal - r.discount;
  const service = r.serviceAmount ?? Math.round((after * r.serviceBps) / 10_000);
  const tax = r.taxAmount ?? Math.round(((after + service) * r.taxBps) / 10_000);
  return after + service + tax + r.rounding || null;
}

export function isUsableScan(r: Receipt): boolean {
  return r.kind !== "OTHER" && receiptAmount(r) !== null;
}

export function totalMismatch(computed: Minor, r: Receipt): Minor {
  if (!r.total) return 0;
  const diff = computed + r.rounding - r.total;
  const unit = 10 ** currencyExponent(r.currency);
  const tolerance = Math.max(unit, Math.round(r.total * 0.002));
  return Math.abs(diff) <= tolerance ? 0 : diff;
}

export function receiptAdjustments(r: Receipt): Adjustments {
  const input = (m: Minor) => toInputString(m, r.currency);
  const after = (r.subtotal ?? 0) - r.discount;
  const pick = (bps: number, printed: Minor | null, base: Minor) =>
    printed !== null && Math.round((base * bps) / 10_000) !== printed
      ? { unit: "AMT" as const, raw: input(printed) }
      : { unit: "PCT" as const, raw: bpsToInput(bps) };
  const service = pick(r.serviceBps, r.serviceAmount, after);
  const serviceValue = r.serviceAmount ?? Math.round((after * r.serviceBps) / 10_000);
  return {
    discount: { unit: "AMT", raw: r.discount ? input(r.discount) : "" },
    service,
    tax: pick(r.taxBps, r.taxAmount, after + serviceValue),
  };
}

const SEAM = 8;

const MAX_CANDIDATES = 12;

export function dedupeOverlaps(
  items: ReceiptItem[],
  subtotal: Minor | null,
): { items: ReceiptItem[]; removed: ReceiptItem[] } {
  const byPhoto = new Map<number, number[]>();
  items.forEach((it, i) => byPhoto.set(it.photo, [...(byPhoto.get(it.photo) ?? []), i]));
  const candidates: number[] = [];
  for (const [photo, idx] of byPhoto) {
    const prev = byPhoto.get(photo - 1);
    if (!prev) continue;
    const tail = prev.slice(-SEAM).map((i) => items[i]!);
    for (const i of idx.slice(0, SEAM)) {
      const it = items[i]!;
      if (tail.some((p) => p.name === it.name && p.amount === it.amount)) candidates.push(i);
    }
  }
  if (candidates.length === 0) return { items, removed: [] };

  const total = items.reduce((s, it) => s + it.amount, 0);
  const excess = subtotal !== null ? total - subtotal : 0;

  if (subtotal !== null && excess <= 0) return { items, removed: [] };
  let pick: number[] | null = null;
  if (excess > 0 && candidates.length <= MAX_CANDIDATES) {
    for (let mask = 1; mask < 1 << candidates.length; mask++) {
      const chosen = candidates.filter((_, b) => mask & (1 << b));
      if (chosen.reduce((s, i) => s + items[i]!.amount, 0) !== excess) continue;
      if (!pick || chosen.length < pick.length) pick = chosen;
    }
  }
  if (pick) {
    const drop = new Set(pick);
    return { items: items.filter((_, i) => !drop.has(i)), removed: pick.map((i) => items[i]!) };
  }
  const flagged = new Set(candidates);
  return { items: items.map((it, i) => (flagged.has(i) ? { ...it, suspect: true } : it)), removed: [] };
}
