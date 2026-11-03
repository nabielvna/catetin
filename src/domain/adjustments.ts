import type { ObligationItemInput } from "@/domain/debt";
import { type Currency, type Minor, parseAmount, toInputString } from "@/domain/money";
import { computeSplit, type SplitInput, type SplitResult } from "@/domain/split";

export type AdjUnit = "PCT" | "AMT";
export type AdjField = { unit: AdjUnit; raw: string };
export type Adjustments = { discount: AdjField; service: AdjField; tax: AdjField };
export type AdjKey = keyof Adjustments;

export const emptyAdjustments = (): Adjustments => ({
  discount: { unit: "AMT", raw: "" },
  service: { unit: "PCT", raw: "" },
  tax: { unit: "PCT", raw: "" },
});

export function pctToBps(v: string): number | null {
  if (!v.trim()) return 0;
  const n = Number(v.trim().replace(",", "."));
  return Number.isFinite(n) && n >= 0 && n <= 100 ? Math.round(n * 100) : null;
}

export function bpsToInput(bps: number): string {
  return bps ? String(bps / 100) : "";
}

function amountOf(f: AdjField, currency: Currency): Minor | null {
  if (!f.raw.trim()) return 0;
  return parseAmount(f.raw, currency);
}

export function adjustmentsToSplit(
  a: Adjustments,
  currency: Currency,
): Pick<SplitInput, "discount" | "serviceBps" | "taxBps" | "serviceAmount" | "taxAmount"> | null {
  const out: Pick<SplitInput, "discount" | "serviceBps" | "taxBps" | "serviceAmount" | "taxAmount"> = {};
  if (a.discount.raw.trim()) {
    if (a.discount.unit === "AMT") {
      const v = amountOf(a.discount, currency);
      if (v === null) return null;
      out.discount = v > 0 ? { type: "AMOUNT", value: v } : null;
    } else {
      const bps = pctToBps(a.discount.raw);
      if (bps === null) return null;
      out.discount = bps > 0 ? { type: "PERCENT", bps } : null;
    }
  }
  for (const key of ["service", "tax"] as const) {
    const f = a[key];
    if (f.unit === "AMT") {
      const v = amountOf(f, currency);
      if (v === null) return null;
      out[key === "service" ? "serviceAmount" : "taxAmount"] = v;
    } else {
      const bps = pctToBps(f.raw);
      if (bps === null) return null;
      out[key === "service" ? "serviceBps" : "taxBps"] = bps;
    }
  }
  return out;
}

export function breakdown(subtotal: Minor, a: Adjustments, currency: Currency): SplitResult | null {
  const adj = adjustmentsToSplit(a, currency);
  if (!adj || subtotal <= 0) return null;
  try {
    return computeSplit({ participants: ["_"], mode: "EQUAL", subtotal, ...adj });
  } catch {
    return null;
  }
}

export function switchUnit(key: AdjKey, a: Adjustments, subtotal: Minor, currency: Currency): AdjField {
  const f = a[key];
  const to: AdjUnit = f.unit === "PCT" ? "AMT" : "PCT";
  const b = breakdown(subtotal, a, currency);
  if (!b || !f.raw.trim()) return { unit: to, raw: "" };
  const value = key === "discount" ? b.discount : key === "service" ? b.service : b.tax;
  if (to === "AMT") return { unit: to, raw: value ? toInputString(value, currency) : "" };
  const afterDiscount = b.subtotal - b.discount;
  const base = key === "discount" ? b.subtotal : key === "service" ? afterDiscount : afterDiscount + b.service;
  return { unit: to, raw: base > 0 && value ? String(Math.round((value / base) * 10_000) / 100) : "" };
}

export function adjustmentLines(b: SplitResult, a: Adjustments, names: Record<AdjKey, string>): ObligationItemInput[] {
  const line = (key: AdjKey, unitPrice: Minor): ObligationItemInput => {
    const f = a[key];
    const pct = f.unit === "PCT" && f.raw.trim() ? ` ${f.raw.trim()}%` : "";
    return { name: `${names[key]}${pct}`, qtyMilli: 1000, unitPrice };
  };
  return [
    ...(b.discount ? [line("discount", -b.discount)] : []),
    ...(b.service ? [line("service", b.service)] : []),
    ...(b.tax ? [line("tax", b.tax)] : []),
  ];
}
