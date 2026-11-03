import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { computeSplit, type SplitInput } from "@/domain/split";

describe("computeSplit", () => {
  it("restaurant example: subtotal 487k, 5% service, 10% tax on subtotal+service", () => {
    const r = computeSplit({
      participants: ["a", "b", "c", "d", "e"],
      mode: "EQUAL",
      subtotal: 487_000,
      serviceBps: 500,
      taxBps: 1000,
    });
    expect(r.service).toBe(24_350);
    expect(r.tax).toBe(51_135);
    expect(r.total).toBe(562_485);
    expect(r.shares.reduce((s, x) => s + x.total, 0)).toBe(r.total);
  });

  it("per item: shared items are split evenly among those who joined", () => {
    const r = computeSplit({
      participants: ["a", "b"],
      mode: "ITEMS",
      items: [
        { id: "1", name: "Nasi goreng", amount: 30_000, assignees: ["a"] },
        { id: "2", name: "Es teh", amount: 10_000, assignees: ["a", "b"] },
      ],
    });
    expect(r.shares.map((s) => s.total)).toEqual([35_000, 5_000]);
  });

  it("an item without participants is rejected", () => {
    expect(() =>
      computeSplit({ participants: ["a"], mode: "ITEMS", items: [{ id: "1", name: "x", amount: 10, assignees: [] }] }),
    ).toThrow("SPLIT_INVALID");
  });

  it("exact amounts must match the subtotal", () => {
    expect(() =>
      computeSplit({ participants: ["a", "b"], mode: "EXACT", subtotal: 100, exact: { a: 60, b: 30 } }),
    ).toThrow("SPLIT_INVALID");
  });

  it("percentages must total 100%", () => {
    expect(() =>
      computeSplit({ participants: ["a", "b"], mode: "PERCENT", subtotal: 100, percent: { a: 5000, b: 4000 } }),
    ).toThrow("SPLIT_INVALID");
  });

  it("a fixed discount is split proportionally", () => {
    const r = computeSplit({
      participants: ["a", "b"],
      mode: "EXACT",
      subtotal: 100_000,
      exact: { a: 75_000, b: 25_000 },
      discount: { type: "AMOUNT", value: 20_000 },
    });
    expect(r.shares.map((s) => s.total)).toEqual([60_000, 20_000]);
  });

  it("item subtotal differs from the entered subtotal", () => {
    expect(() =>
      computeSplit({ participants: ["a"], mode: "EQUAL", subtotal: 99, items: [{ id: "1", name: "x", amount: 100 }] }),
    ).toThrow("ITEMS_MISMATCH");
  });

  it("property: shares always sum to the total, no negative shares", () => {
    const arb = fc.record({
      n: fc.integer({ min: 1, max: 12 }),
      subtotal: fc.integer({ min: 1, max: 100_000_000 }),
      serviceBps: fc.integer({ min: 0, max: 2000 }),
      taxBps: fc.integer({ min: 0, max: 2000 }),
      discBps: fc.integer({ min: 0, max: 10_000 }),
      mode: fc.constantFrom("EQUAL", "SHARES", "PERCENT"),
      weights: fc.array(fc.integer({ min: 1, max: 5 }), { minLength: 12, maxLength: 12 }),
    });
    fc.assert(
      fc.property(arb, ({ n, subtotal, serviceBps, taxBps, discBps, mode, weights }) => {
        const participants = Array.from({ length: n }, (_, i) => `p${i}`);
        const input: SplitInput = {
          participants,
          mode: mode as SplitInput["mode"],
          subtotal,
          serviceBps,
          taxBps,
          discount: { type: "PERCENT", bps: discBps },
        };
        if (mode === "SHARES") input.shares = Object.fromEntries(participants.map((p, i) => [p, weights[i]!]));
        if (mode === "PERCENT") {
          const bps = participants.map(() => Math.floor(10_000 / n));
          bps[0]! += 10_000 - bps.reduce((a, b) => a + b, 0);
          input.percent = Object.fromEntries(participants.map((p, i) => [p, bps[i]!]));
        }
        const r = computeSplit(input);
        expect(r.shares.reduce((s, x) => s + x.total, 0)).toBe(r.total);
        expect(r.shares.reduce((s, x) => s + x.base, 0)).toBe(r.subtotal);
        expect(r.total).toBe(r.subtotal - r.discount + r.service + r.tax);
        expect(r.shares.every((x) => x.total >= 0)).toBe(true);
      }),
    );
  });
});

describe("computeSplit: fixed service/tax amounts (D-98)", () => {
  it("exact amounts from the receipt are used as-is and split proportionally", () => {
    const r = computeSplit({
      participants: ["a", "b"],
      mode: "EXACT",
      subtotal: 200_000,
      exact: { a: 150_000, b: 50_000 },
      discount: { type: "AMOUNT", value: 30_000 },
      serviceAmount: 12_751,
      taxAmount: 18_275,
    });
    expect(r.service).toBe(12_751);
    expect(r.tax).toBe(18_275);
    expect(r.total).toBe(200_000 - 30_000 + 12_751 + 18_275);
    expect(r.shares.reduce((s, x) => s + x.total, 0)).toBe(r.total);
    expect(r.shares[0]!.service).toBeGreaterThan(r.shares[1]!.service);
  });

  it("negative amounts are rejected", () => {
    expect(() => computeSplit({ participants: ["a"], mode: "EQUAL", subtotal: 1000, serviceAmount: -1 })).toThrow();
  });
});
