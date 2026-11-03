import { describe, expect, it } from "vitest";

import { bpsToInput } from "@/domain/adjustments";
import {
  dedupeOverlaps,
  isUsableScan,
  normalizeScan,
  type RawScan,
  receiptAdjustments,
  receiptAmount,
  totalMismatch,
} from "@/domain/receipt";
import { computeSplit } from "@/domain/split";

const empty: RawScan = {
  kind: "RECEIPT",
  merchant: null,
  date: null,
  currency: null,
  items: [],
  subtotal: null,
  discount: null,
  servicePercent: null,
  serviceAmount: null,
  taxPercent: null,
  taxAmount: null,
  rounding: null,
  total: null,
  category: null,
  method: null,
  note: null,
};
const scan = (over: Partial<RawScan>) => normalizeScan({ ...empty, ...over }, "IDR", "2026-09-29");

describe("normalizeScan", () => {
  it("restaurant receipt: items, 5% service, 10% tax on subtotal+service → form total = receipt total", () => {
    const r = scan({
      merchant: "  Warung   Sate Pak Kumis ",
      date: "2026-09-28",
      currency: "idr",
      items: [
        { name: "Sate Ayam", quantity: 2, total: 70000 },
        { name: "Es Teh", quantity: 1, total: 10000 },
      ],
      subtotal: 80000,
      serviceAmount: 4000,
      taxAmount: 8400,
      total: 92400,
    });
    expect(r.merchant).toBe("Warung Sate Pak Kumis");
    expect(r.currency).toBe("IDR");
    expect(r.items).toEqual([
      { name: "Sate Ayam ×2", amount: 70000, photo: 1 },
      { name: "Es Teh", amount: 10000, photo: 1 },
    ]);
    expect(r.serviceBps).toBe(500);
    expect(r.taxBps).toBe(1000);
    const split = computeSplit({
      participants: ["a"],
      mode: "EQUAL",
      subtotal: r.subtotal!,
      serviceBps: r.serviceBps,
      taxBps: r.taxBps,
    });
    expect(totalMismatch(split.total, r)).toBe(0);
  });

  it("tax computed by the cashier on the subtotal only: percentage derived from the amount so the total still matches", () => {
    const r = scan({ subtotal: 100000, serviceAmount: 5000, taxPercent: 10, taxAmount: 10000, total: 115000 });
    expect(r.taxBps).not.toBe(1000);
    const split = computeSplit({
      participants: ["a"],
      mode: "EQUAL",
      subtotal: 100000,
      serviceBps: r.serviceBps,
      taxBps: r.taxBps,
    });
    expect(totalMismatch(split.total, r)).toBe(0);
  });

  it("printed percentage is used when there's no amount", () => {
    expect(scan({ subtotal: 50000, taxPercent: 11 }).taxBps).toBe(1100);
  });

  it("currency with decimals → smallest unit", () => {
    const r = scan({ currency: "USD", items: [{ name: "Burger", quantity: null, total: 12.5 }], total: 13.75 });
    expect(r.currency).toBe("USD");
    expect(r.items[0]!.amount).toBe(1250);
    expect(r.total).toBe(1375);
  });

  it("drops nonsensical data", () => {
    const r = scan({
      currency: "XYZ",
      date: "2026-12-01",
      items: [
        { name: "", quantity: null, total: 5000 },
        { name: "Refund", quantity: null, total: -3000 },
        { name: "OK", quantity: null, total: 5000 },
      ],
      discount: 999999,
      category: "OTHER",
      method: "BITCOIN",
    });
    expect(r.currency).toBe("IDR");
    expect(r.date).toBeNull();
    expect(r.items).toEqual([{ name: "OK", amount: 5000, photo: 1 }]);
    expect(r.subtotal).toBe(5000);
    expect(r.discount).toBe(0);
    expect(r.category).toBeNull();
    expect(r.method).toBeNull();
  });

  it("a negative discount on the receipt counts as a discount", () => {
    expect(scan({ subtotal: 100000, discount: -10000 }).discount).toBe(10000);
  });
});

describe("receiptAmount & isUsableScan", () => {
  it("printed total wins; if missing it's computed from the breakdown", () => {
    expect(receiptAmount(scan({ subtotal: 100000, total: 111000 }))).toBe(111000);
    expect(receiptAmount(scan({ subtotal: 100000, discount: 10000, taxPercent: 10 }))).toBe(99000);
  });

  it("a transfer proof only needs the amount", () => {
    const r = scan({ kind: "TRANSFER", total: 250000, method: "TRANSFER", note: "BCA ke Budi" });
    expect(isUsableScan(r)).toBe(true);
    expect(r.method).toBe("TRANSFER");
  });

  it("a photo that isn't a receipt / has no amount can't be used", () => {
    expect(isUsableScan(scan({ kind: "OTHER", total: 1000 }))).toBe(false);
    expect(isUsableScan(scan({ merchant: "Toko" }))).toBe(false);
  });
});

describe("totalMismatch", () => {
  const r = scan({ subtotal: 500000, total: 500000 });
  it("small rounding is ignored", () => {
    expect(totalMismatch(500500, r)).toBe(0);
  });
  it("a misread item is detected", () => {
    expect(totalMismatch(488000, r)).toBe(-12000);
  });
  it("rounding rows on the receipt are counted", () => {
    const rr = scan({ subtotal: 99800, rounding: 200, total: 100000 });
    expect(totalMismatch(99800, rr)).toBe(0);
  });
  it("no printed total → no warning", () => {
    expect(totalMismatch(1, scan({ subtotal: 5000 }))).toBe(0);
  });
});

it("bpsToInput", () => {
  expect(bpsToInput(1100)).toBe("11");
  expect(bpsToInput(1050)).toBe("10.5");
  expect(bpsToInput(0)).toBe("");
});

describe("receiptAdjustments (D-98)", () => {
  it("percentage used when it yields exactly the receipt amount", () => {
    const r = scan({ subtotal: 200000, discount: 30000, serviceAmount: 12750, taxAmount: 18275, total: 201025 });
    expect(receiptAdjustments(r)).toEqual({
      discount: { unit: "AMT", raw: "30.000" },
      service: { unit: "PCT", raw: "7.5" },
      tax: { unit: "PCT", raw: "10" },
    });
  });
  it("percentage doesn't fit (tax on subtotal only) → printed amount as-is", () => {
    const r = scan({ subtotal: 100000, serviceAmount: 5000, taxAmount: 10000, total: 115000 });
    expect(receiptAdjustments(r).tax).toEqual({ unit: "AMT", raw: "10.000" });
  });
});

describe("dedupeOverlaps (D-99)", () => {
  const it_ = (name: string, amount: number, photo: number) => ({ name, amount, photo });

  it("row at a photo overlap read twice → removed because items then match the subtotal", () => {
    const items = [it_("Sate Ayam ×2", 70000, 1), it_("Es Teh", 8000, 1), it_("Es Teh", 8000, 2), it_("Nasi", 6000, 2)];
    const r = dedupeOverlaps(items, 84000);
    expect(r.removed).toEqual([it_("Es Teh", 8000, 2)]);
    expect(r.items.map((x) => x.name)).toEqual(["Sate Ayam ×2", "Es Teh", "Nasi"]);
  });

  it("a genuinely repeated order stays safe (total already matches)", () => {
    const items = [it_("Es Teh", 8000, 1), it_("Es Teh", 8000, 2)];
    const r = dedupeOverlaps(items, 16000);
    expect(r.removed).toEqual([]);
    expect(r.items.some((x) => x.suspect)).toBe(false);
  });

  it("doesn't match the subtotal → only marked 'Dobel?'", () => {
    const items = [it_("Es Teh", 8000, 1), it_("Es Teh", 8000, 2), it_("Roti", 5000, 2)];
    const r = dedupeOverlaps(items, 12000);
    expect(r.removed).toEqual([]);
    expect(r.items.filter((x) => x.suspect).map((x) => x.name)).toEqual(["Es Teh"]);
  });

  it("must be exactly equal: different quantity or price is not a candidate", () => {
    const items = [it_("Es Teh ×2", 16000, 1), it_("Es Teh", 8000, 2), it_("Es Teh", 9000, 2)];
    const r = dedupeOverlaps(items, 17000);
    expect(r.removed).toEqual([]);
    expect(r.items.some((x) => x.suspect)).toBe(false);
  });

  it("unreadable subtotal → candidates marked, not removed", () => {
    const r = dedupeOverlaps([it_("Kopi", 20000, 1), it_("Kopi", 20000, 2)], null);
    expect(r.removed).toEqual([]);
    expect(r.items[1]!.suspect).toBe(true);
  });

  it("only one photo → nothing touched", () => {
    const items = [it_("Es Teh", 8000, 1), it_("Es Teh", 8000, 1)];
    expect(dedupeOverlaps(items, 8000)).toEqual({ items, removed: [] });
  });

  it("used by normalizeScan: removed names are recorded in `deduped`", () => {
    const r = scan({
      items: [
        { name: "Kopi", quantity: null, total: 20000, photo: 1 },
        { name: "Kopi", quantity: null, total: 20000, photo: 2 },
        { name: "Roti", quantity: null, total: 15000, photo: 2 },
      ],
      subtotal: 35000,
    });
    expect(r.items).toHaveLength(2);
    expect(r.deduped).toEqual(["Kopi"]);
  });
});
