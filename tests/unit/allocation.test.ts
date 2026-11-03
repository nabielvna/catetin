import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  maxOffset,
  type OpenObligation,
  planAutoAllocation,
  planOffset,
  sortForAllocation,
  validateManualAllocation,
} from "@/domain/allocation";

const ob = (id: string, available: number, dueOn: string | null, occurredOn = "2026-09-01"): OpenObligation => ({
  id,
  available,
  dueOn,
  occurredOn,
  createdAt: 0,
});

describe("automatic allocation order", () => {
  it("nearest due date first, no due date last, then the oldest", () => {
    const sorted = sortForAllocation([
      ob("no-due-old", 10, null, "2026-01-01"),
      ob("due-late", 10, "2026-12-01"),
      ob("due-soon", 10, "2026-10-01"),
      ob("no-due-new", 10, null, "2026-09-01"),
    ]);
    expect(sorted.map((o) => o.id)).toEqual(["due-soon", "due-late", "no-due-old", "no-due-new"]);
  });
});

describe("planAutoAllocation", () => {
  it("fills in order", () => {
    const r = planAutoAllocation([ob("a", 50_000, "2026-10-01"), ob("b", 30_000, "2026-10-05")], 70_000);
    expect(r).toEqual([
      { obligationId: "a", amount: 50_000 },
      { obligationId: "b", amount: 20_000 },
    ]);
  });

  it("overpayment is rejected", () => {
    expect(() => planAutoAllocation([ob("a", 10, null)], 11)).toThrow("OVERPAY");
  });

  it("property: total = amount, nothing exceeds the remaining", () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 0, max: 1_000_000 }), { minLength: 1, maxLength: 15 }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        (avail, frac) => {
          const open = avail.map((a, i) => ob(`o${i}`, a, i % 3 === 0 ? null : `2026-10-${10 + (i % 9)}`));
          const total = avail.reduce((s, a) => s + a, 0);
          fc.pre(total > 0);
          const amount = Math.max(1, Math.floor(total * frac));
          const r = planAutoAllocation(open, amount);
          expect(r.reduce((s, a) => s + a.amount, 0)).toBe(amount);
          for (const a of r) {
            expect(a.amount).toBeGreaterThan(0);
            expect(a.amount).toBeLessThanOrEqual(open.find((o) => o.id === a.obligationId)!.available);
          }
        },
      ),
    );
  });
});

describe("validateManualAllocation", () => {
  const open = [ob("a", 100, null), ob("b", 50, null)];
  it("valid", () => {
    expect(
      validateManualAllocation(
        open,
        [
          { obligationId: "a", amount: 20 },
          { obligationId: "b", amount: 50 },
        ],
        70,
      ),
    ).toHaveLength(2);
  });
  it("exceeds the remaining per debt", () => {
    expect(() => validateManualAllocation(open, [{ obligationId: "b", amount: 60 }], 60)).toThrow("OVERPAY");
  });
  it("total doesn't match", () => {
    expect(() => validateManualAllocation(open, [{ obligationId: "a", amount: 20 }], 30)).toThrow("INVALID_INPUT");
  });
  it("unknown debt", () => {
    expect(() => validateManualAllocation(open, [{ obligationId: "z", amount: 1 }], 1)).toThrow("NOT_FOUND");
  });
});

describe("offset", () => {
  it("balanced in both directions", () => {
    const a = [ob("a1", 30_000, null)];
    const b = [ob("b1", 20_000, null), ob("b2", 30_000, null)];
    expect(maxOffset(a, b)).toBe(30_000);
    const plan = planOffset(a, b, 30_000, 30_000);
    expect(plan.a.reduce((s, x) => s + x.amount, 0)).toBe(30_000);
    expect(plan.b.reduce((s, x) => s + x.amount, 0)).toBe(30_000);
  });
  it("nothing to offset", () => {
    expect(() => planOffset([], [ob("b", 1, null)], 1, 1)).toThrow("NOTHING_TO_OFFSET");
  });
});
