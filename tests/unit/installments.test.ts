import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { diffObligation } from "@/domain/debt";
import {
  addPeriods,
  compareDueShapes,
  effectiveDueOn,
  type InstallmentPlan,
  nextInstallment,
  scheduleOf,
} from "@/domain/installments";
import { type PolicyInput, requiredApprovers } from "@/domain/policy";
import { dueOccurrences, occurrenceOn } from "@/domain/recurring";

const plan: InstallmentPlan = { count: 3, every: "MONTH", firstDue: "2026-01-31" };

describe("installments (D-74)", () => {
  it("monthly dates return to the 31st after February", () => {
    expect(scheduleOf(1000, plan).map((i) => i.dueOn)).toEqual(["2026-01-31", "2026-02-28", "2026-03-31"]);
    expect(addPeriods("2024-02-29", "YEAR", 1)).toBe("2025-02-28");
    expect(addPeriods("2026-12-15", "MONTH", 1)).toBe("2027-01-15");
    expect(addPeriods("2026-09-28", "WEEK", 2)).toBe("2026-10-12");
  });

  it("split evenly, rounding remainder in the last installment; sum always = amount", () => {
    expect(scheduleOf(1000, plan).map((i) => i.amount)).toEqual([333, 333, 334]);
    fc.assert(
      fc.property(fc.integer({ min: 2, max: 120 }), fc.integer({ min: 120, max: 1e12 }), (count, amount) => {
        const s = scheduleOf(amount, { count, every: "WEEK", firstDue: "2026-01-01" });
        return s.length === count && s.reduce((a, b) => a + b.amount, 0) === amount && s.every((i) => i.amount > 0);
      }),
    );
  });

  it("payments close the earliest installment first", () => {
    expect(nextInstallment(1000, plan, 0)).toMatchObject({ seq: 1, dueAmount: 333 });
    expect(nextInstallment(1000, plan, 400)).toMatchObject({ seq: 2, dueAmount: 266, dueOn: "2026-02-28" });
    expect(nextInstallment(1000, plan, 1000)).toBeNull();
    expect(effectiveDueOn(1000, plan, null, 700)).toBe("2026-03-31");
    expect(effectiveDueOn(1000, null, "2026-05-01", 700)).toBe("2026-05-01");
  });

  it("schedule comparison per date", () => {
    const one = { amount: 900, dueOn: "2026-03-31", installments: null };
    const three = { amount: 900, dueOn: null, installments: plan };

    expect(compareDueShapes(one, three)).toBe("MORE");
    expect(compareDueShapes(three, one)).toBe("LESS");
    expect(compareDueShapes(three, { ...three, installments: { ...plan, count: 6 } })).toBe("LESS");
    expect(compareDueShapes(three, { ...three, amount: 1200 })).toBe("MORE");
    expect(compareDueShapes(three, three)).toBe("SAME");
    expect(compareDueShapes(one, { ...one, amount: 1200, dueOn: "2026-06-30" })).toBe("MIXED");
  });

  it("changing installments: the disadvantaged party is computed from the schedule", () => {
    const current = {
      amount: 900,
      currency: "IDR" as const,
      dueOn: "2026-01-31",
      title: "HP",
      note: null,
      category: null,
      occurredOn: "2026-01-01",
      itemsKey: "[]",
      installments: plan,
    };
    const input = (patch: Parameters<typeof diffObligation>[1]): PolicyInput => ({
      action: { kind: "OBLIGATION_UPDATE", change: diffObligation(current, patch).change },
      actorPartyId: "c",
      creditor: { id: "c", isUser: true },
      debtor: { id: "d", isUser: true },
    });

    expect(requiredApprovers(input({ installments: { ...plan, count: 6 } })).approvers).toEqual([]);

    expect(requiredApprovers(input({ installments: { ...plan, every: "WEEK" } })).approvers).toEqual(["d"]);

    expect(diffObligation(current, { title: "HP baru" }).change.schedule).toBeUndefined();
  });
});

describe("recurring debts (D-74)", () => {
  it("the n-th date is computed from the start date", () => {
    expect(occurrenceOn("2026-01-31", "MONTH", 2)).toBe("2026-03-31");
  });

  it("catches up at most 3 missed periods", () => {
    expect(dueOccurrences("2026-01-01", "MONTH", 0, "2026-01-01")).toEqual({ indexes: [0], next: 1 });
    expect(dueOccurrences("2026-01-01", "MONTH", 1, "2026-01-31")).toEqual({ indexes: [], next: 1 });
    expect(dueOccurrences("2026-01-01", "WEEK", 0, "2026-03-01")).toEqual({ indexes: [6, 7, 8], next: 9 });
  });
});

describe("mutual trust (D-86)", () => {
  const since = new Date("2026-09-01T00:00:00Z");
  const base = { creditor: { id: "c", isUser: true }, debtor: { id: "d", isUser: true }, trustSince: since };

  it("new records take effect immediately; skipped parties are recorded", () => {
    const r = requiredApprovers({ ...base, action: { kind: "OBLIGATION_CREATE" }, actorPartyId: "c" });
    expect(r).toMatchObject({ approvers: [], trusted: ["d"] });
    const o = requiredApprovers({ ...base, action: { kind: "OFFSET_CREATE" }, actorPartyId: "d" });
    expect(o).toMatchObject({ approvers: [], trusted: ["c"] });
  });

  it("changes to old records still need approval", () => {
    const change = { amount: { from: 100, to: 50 } };
    const old = requiredApprovers({
      ...base,
      action: { kind: "OBLIGATION_UPDATE", change },
      actorPartyId: "d",
      targetCreatedAt: new Date("2026-08-01T00:00:00Z"),
    });
    expect(old).toMatchObject({ approvers: ["c"], trusted: [] });
    const fresh = requiredApprovers({
      ...base,
      action: { kind: "OBLIGATION_UPDATE", change },
      actorPartyId: "d",
      targetCreatedAt: new Date("2026-09-02T00:00:00Z"),
    });
    expect(fresh).toMatchObject({ approvers: [], trusted: ["c"] });
  });

  it("a third party isn't part of mutual trust", () => {
    const r = requiredApprovers({ ...base, action: { kind: "OBLIGATION_CREATE" }, actorPartyId: "x" });
    expect(r).toMatchObject({ approvers: ["d"], trusted: [] });
  });

  it("actions that don't disadvantage anyone else aren't recorded as 'trusted'", () => {
    const r = requiredApprovers({ ...base, action: { kind: "OBLIGATION_CREATE" }, actorPartyId: "d" });
    expect(r).toMatchObject({ approvers: [], trusted: [] });
  });
});
