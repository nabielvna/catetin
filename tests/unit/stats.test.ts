import { describe, expect, it } from "vitest";

import {
  computePersonStats,
  computeStats,
  lastMonths,
  median,
  periodStart,
  statCurrencies,
  type StatObligation,
  type StatsInput,
} from "@/domain/stats";

const TODAY = "2026-10-05";
let n = 0;
function ob(over: Partial<StatObligation>): StatObligation {
  n += 1;
  return {
    id: `o${n}`,
    pairId: `pair-${over.counterpartId ?? "budi"}`,
    title: "Bensin",
    counterpartId: "budi",
    counterpartName: "Budi",
    groupId: null,
    groupName: null,
    billId: null,
    direction: "THEY_OWE",
    amount: 10_000,
    paid: 0,
    currency: "IDR",
    category: "FOOD",
    labels: [],
    status: "ACTIVE",
    occurredOn: "2026-09-01",
    dueOn: null,
    createdOn: "2026-09-01",
    installments: false,
    settledOn: null,
    ...over,
  };
}
const empty = (over: Partial<StatsInput> = {}): StatsInput => ({
  obligations: [],
  allocations: [],
  settlements: [],
  reminders: [],
  votes: [],
  bills: [],
  ...over,
});
const opts = { period: "all" as const, currency: "IDR" as const, today: TODAY };

describe("stats (D-112)", () => {
  it("periods and months", () => {
    expect(periodStart("month", TODAY)).toBe("2026-10-01");
    expect(periodStart("quarter", TODAY)).toBe("2026-08-01");
    expect(periodStart("year", TODAY)).toBe("2026-01-01");
    expect(periodStart("all", TODAY)).toBeNull();
    expect(lastMonths("2026-02-10", 3)).toEqual(["2025-12", "2026-01", "2026-02"]);
    expect(median([5, 1, 100])).toBe(5);
    expect(median([2, 4])).toBe(3);
    expect(median([])).toBeNull();
  });

  it("settle time is the median, on-time only counts debts with a due date, reminders while open", () => {
    const input = empty({
      obligations: [
        ob({ paid: 10_000, occurredOn: "2026-09-01", settledOn: "2026-09-05", dueOn: "2026-09-10" }),
        ob({ paid: 10_000, occurredOn: "2026-09-01", settledOn: "2026-09-13", dueOn: "2026-09-08" }),
        ob({ paid: 10_000, occurredOn: "2024-01-01", settledOn: "2026-09-01" }),
        ob({ direction: "I_OWE", paid: 5_000, amount: 5_000, occurredOn: "2026-09-02", settledOn: "2026-09-04" }),
        ob({ amount: 7_000, occurredOn: "2026-06-01" }),
        ob({ status: "PENDING", amount: 99_000 }),
      ],
      reminders: [
        { pairId: "pair-budi", byMe: true, on: "2026-09-03" },
        { pairId: "pair-budi", byMe: true, on: "2026-09-12" },
        { pairId: "pair-budi", byMe: false, on: "2026-09-03" },
      ],
      votes: [
        { counterpartId: "budi", byMe: false, minutes: 120, on: "2026-09-02" },
        { counterpartId: "budi", byMe: true, minutes: 10, on: "2026-09-02" },
      ],
    });
    const s = computeStats(input, opts);
    expect(s.habits.them).toMatchObject({
      settledCount: 3,
      medianDays: 12,
      fastestDays: 4,
      dueCount: 2,
      onTime: 1,
      avgLateDays: 5,
      confirmMinutes: 120,
      openCount: 1,
      openAmount: 7_000,
      oldestOpenDays: 126,
    });

    expect(s.habits.them.remindersAvg).toBe(1);
    expect(s.habits.me).toMatchObject({ settledCount: 1, medianDays: 2, confirmMinutes: 10 });
    expect(s.summary).toMatchObject({ lent: 37_000, lentCount: 4, borrowed: 5_000, borrowedCount: 1 });
    expect(s.aging.find((a) => a.bucket === "90+")).toEqual({ bucket: "90+", amount: 7_000, count: 1 });
    expect(s.oldestOpen).toMatchObject({ days: 126 });
  });

  it("period limits what counts; balance over time follows payment dates", () => {
    const a = ob({ amount: 50_000, paid: 20_000, occurredOn: "2026-08-10" });
    const b = ob({ amount: 10_000, occurredOn: "2026-10-02", direction: "I_OWE" });
    const input = empty({
      obligations: [a, b],
      allocations: [{ obligationId: a.id, amount: 20_000, paidOn: "2026-09-15" }],
      settlements: [
        {
          kind: "PAYMENT",
          method: "TRANSFER",
          direction: "IN",
          amount: 20_000,
          currency: "IDR",
          paidOn: "2026-09-15",
          status: "ACTIVE",
          counterpartId: "budi",
        },
      ],
    });
    const month = computeStats(input, { ...opts, period: "month" });
    expect(month.summary).toMatchObject({ lent: 0, borrowed: 10_000, received: 0 });
    const all = computeStats(input, opts);
    expect(all.summary).toMatchObject({ lent: 50_000, borrowed: 10_000, received: 20_000 });
    expect(all.balance.map((p) => [p.month, p.balance])).toEqual([
      ["2026-05", 0],
      ["2026-06", 0],
      ["2026-07", 0],
      ["2026-08", 50_000],
      ["2026-09", 30_000],
      ["2026-10", 20_000],
    ]);
    expect(all.months.find((m) => m.month === "2026-08")).toEqual({ month: "2026-08", lent: 50_000, borrowed: 0 });
    expect(all.facts.topMethod).toEqual({ method: "TRANSFER", share: 100 });
  });

  it("categories & labels say who, per direction; groups say who paid first", () => {
    const input = empty({
      obligations: [
        ob({ category: "FOOD", amount: 30_000, labels: ["kantor"] }),
        ob({ category: "FOOD", amount: 5_000, counterpartId: "citra", counterpartName: "Citra" }),
        ob({ category: "FOOD", amount: 4_000, counterpartId: "citra", counterpartName: "Citra" }),
        ob({ category: null, amount: 8_000, direction: "I_OWE", groupId: "kos", groupName: "Kos", billId: "b1" }),
      ],
      bills: [
        {
          groupId: "kos",
          payerId: "eko",
          payerName: "Eko",
          payerIsMe: false,
          occurredOn: "2026-09-01",
          currency: "IDR",
        },
      ],
    });
    const s = computeStats(input, opts);
    const food = s.categories.find((c) => c.key === "FOOD")!;
    expect(food).toMatchObject({ amount: 39_000, count: 3, top: { name: "Citra", count: 2 } });
    expect(food.in.map((p) => p.name)).toEqual(["Budi", "Citra"]);
    expect(s.categories.find((c) => c.key === "OTHER")!.out).toEqual([
      { id: "budi", name: "Budi", count: 1, amount: 8_000 },
    ]);
    expect(s.labels).toMatchObject([{ key: "kantor", amount: 30_000 }]);
    expect(s.groups).toEqual([
      {
        id: "kos",
        name: "Kos",
        count: 1,
        amount: 8_000,
        topCategory: { key: "OTHER", share: 100 },
        topPayer: { name: "Eko", isMe: false, count: 1 },
      },
    ]);
    expect(s.facts.bills).toEqual({ count: 1, avgShare: 8_000 });
  });

  it("one person, one currency at a time", () => {
    const input = empty({
      obligations: [
        ob({ amount: 10_000 }),
        ob({ amount: 3_000, direction: "I_OWE", category: "TRANSPORT" }),
        ob({ amount: 7, currency: "USD" }),
        ob({ amount: 50_000, counterpartId: "citra", counterpartName: "Citra" }),
      ],
    });
    const p = computePersonStats(input, "budi", opts);
    expect(p.summary).toMatchObject({ lent: 10_000, lentCount: 1, borrowed: 3_000 });
    expect(p.categoriesIn.map((c) => c.key)).toEqual(["FOOD"]);
    expect(p.categoriesOut.map((c) => c.key)).toEqual(["TRANSPORT"]);
    expect(p.avgIn).toBe(10_000);
    expect(statCurrencies(input, "USD")).toEqual(["USD", "IDR"]);
    expect(statCurrencies(input, "IDR")).toEqual(["IDR", "USD"]);
  });
});
