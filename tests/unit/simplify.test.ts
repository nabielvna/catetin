import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { currentTransferCount, netBalances, simplifyTransfers } from "@/domain/simplify";

describe("simplify debts", () => {
  it("chain A→B→C becomes A→C", () => {
    const obs = [
      { creditorId: "B", debtorId: "A", remaining: 10 },
      { creditorId: "C", debtorId: "B", remaining: 10 },
    ];
    expect(currentTransferCount(obs)).toBe(2);
    expect(simplifyTransfers(netBalances(obs))).toEqual([{ from: "A", to: "C", amount: 10 }]);
  });

  it("cycle A→B→C→A disappears entirely (D-45)", () => {
    const obs = [
      { creditorId: "B", debtorId: "A", remaining: 10 },
      { creditorId: "C", debtorId: "B", remaining: 10 },
      { creditorId: "A", debtorId: "C", remaining: 10 },
    ];
    expect(simplifyTransfers(netBalances(obs))).toEqual([]);
  });

  it("property: everyone's net balance stays the same & max n−1 transfers", () => {
    const ids = ["a", "b", "c", "d", "e"];
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            c: fc.constantFrom(...ids),
            d: fc.constantFrom(...ids),
            v: fc.integer({ min: 1, max: 100_000 }),
          }),
          { maxLength: 25 },
        ),
        (raw) => {
          const obs = raw.filter((x) => x.c !== x.d).map((x) => ({ creditorId: x.c, debtorId: x.d, remaining: x.v }));
          const before = netBalances(obs);
          const transfers = simplifyTransfers(before);
          const after = netBalances(
            transfers.map((t) => ({ creditorId: t.to, debtorId: t.from, remaining: t.amount })),
          );
          for (const id of ids) expect(after.get(id) ?? 0).toBe(before.get(id) ?? 0);
          expect(transfers.length).toBeLessThanOrEqual(
            Math.max(0, [...before.values()].filter((v) => v !== 0).length - 1),
          );
        },
      ),
    );
  });
});
