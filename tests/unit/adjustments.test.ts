import { describe, expect, it } from "vitest";

import { adjustmentsToSplit, breakdown, emptyAdjustments, pctToBps, switchUnit } from "@/domain/adjustments";

const adj = (over: Partial<ReturnType<typeof emptyAdjustments>>) => ({ ...emptyAdjustments(), ...over });

describe("adjustments (D-98)", () => {
  it("Master Chef receipt: Rp discount, service & tax percentages → total Rp201.025", () => {
    const b = breakdown(
      200_000,
      adj({
        discount: { unit: "AMT", raw: "30.000" },
        service: { unit: "PCT", raw: "7,5" },
        tax: { unit: "PCT", raw: "10" },
      }),
      "IDR",
    )!;
    expect([b.discount, b.service, b.tax, b.total]).toEqual([30_000, 12_750, 18_275, 201_025]);
  });

  it("amounts entered exactly", () => {
    const b = breakdown(100_000, adj({ tax: { unit: "AMT", raw: "10rb" } }), "IDR")!;
    expect(b.tax).toBe(10_000);
    expect(b.total).toBe(110_000);
  });

  it("percentage discount", () => {
    expect(breakdown(100_000, adj({ discount: { unit: "PCT", raw: "20" } }), "IDR")!.total).toBe(80_000);
  });

  it("unreadable field → null (form not valid yet)", () => {
    expect(adjustmentsToSplit(adj({ service: { unit: "PCT", raw: "abc" } }), "IDR")).toBeNull();
    expect(adjustmentsToSplit(adj({ tax: { unit: "PCT", raw: "150" } }), "IDR")).toBeNull();
    expect(breakdown(0, emptyAdjustments(), "IDR")).toBeNull();
  });

  it("switching the unit doesn't change the total", () => {
    const a = adj({ service: { unit: "PCT", raw: "7.5" } });
    const f = switchUnit("service", a, 170_000, "IDR");
    expect(f).toEqual({ unit: "AMT", raw: "12.750" });
    expect(switchUnit("service", { ...a, service: f }, 170_000, "IDR")).toEqual({ unit: "PCT", raw: "7.5" });
  });

  it("pctToBps", () => {
    expect(pctToBps("7,5")).toBe(750);
    expect(pctToBps("")).toBe(0);
    expect(pctToBps("-1")).toBeNull();
  });
});

describe("adjustmentLines (D-98)", () => {
  it("breakdown rows + items = total, discount negative", async () => {
    const { adjustmentLines } = await import("@/domain/adjustments");
    const { itemsTotal } = await import("@/domain/debt");
    const a = adj({
      discount: { unit: "AMT", raw: "30.000" },
      service: { unit: "PCT", raw: "7,5" },
      tax: { unit: "PCT", raw: "10" },
    });
    const b = breakdown(200_000, a, "IDR")!;
    const lines = adjustmentLines(b, a, { discount: "Diskon", service: "Service", tax: "Pajak" });
    expect(lines.map((l) => [l.name, l.unitPrice])).toEqual([
      ["Diskon", -30_000],
      ["Service 7,5%", 12_750],
      ["Pajak 10%", 18_275],
    ]);
    const items = [{ name: "Kwetiau", qtyMilli: 1000, unitPrice: 200_000 }, ...lines];
    expect(itemsTotal(items)).toBe(b.total);
  });
});
