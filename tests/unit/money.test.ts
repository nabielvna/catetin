import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { allocateByWeights, convert, formatMoney, parseAmount, splitEvenly } from "@/domain/money";

describe("parseAmount", () => {
  it.each([
    ["150000", 150_000],
    ["150.000", 150_000],
    ["150,000", 150_000],
    ["Rp 150.000", 150_000],
    ["rp150.000", 150_000],
    ["150rb", 150_000],
    ["150 ribu", 150_000],
    ["150k", 150_000],
    ["1,5jt", 1_500_000],
    ["1.5jt", 1_500_000],
    ["2 juta", 2_000_000],
    ["1.500.000", 1_500_000],
    ["1,25jt", 1_250_000],
    ["IDR 20000", 20_000],
  ])("IDR %s → %i", (input, expected) => {
    expect(parseAmount(input, "IDR")).toBe(expected);
  });

  it.each([
    ["10", 1000],
    ["10.50", 1050],
    ["10,50", 1050],
    ["1,000", 100_000],
    ["1,234.56", 123_456],
    ["1.234,56", 123_456],
    ["$12.5", 1250],
    ["USD 7", 700],
  ])("USD %s → %i", (input, expected) => {
    expect(parseAmount(input, "USD")).toBe(expected);
  });

  it.each(["", "abc", "0", "-5", "1,2,3rb", "10.5555", "rp", "1.5"])("invalid: %s", (input) => {
    const cur = input === "10.5555" ? "USD" : "IDR";
    expect(parseAmount(input, cur)).toBeNull();
  });

  it("rejects amounts above the limit", () => {
    expect(parseAmount("2000 miliar", "IDR")).toBeNull();
  });
});

describe("formatMoney", () => {
  it("IDR without space & decimals", () => {
    expect(formatMoney(50_000, "IDR")).toBe("Rp50.000");
  });
  it("plus/minus signs", () => {
    expect(formatMoney(50_000, "IDR", "id-ID", "always")).toBe("+Rp50.000");
    expect(formatMoney(-30_000, "IDR")).toBe("−Rp30.000");
  });
  it("USD with cents", () => {
    expect(formatMoney(1050, "USD", "en-US")).toBe("$10.50");
  });
});

describe("allocateByWeights", () => {
  it("sum always exact & deterministic", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 1_000_000_000 }),
        fc.array(fc.integer({ min: 0, max: 1_000_000 }), { minLength: 1, maxLength: 20 }),
        (total, weights) => {
          fc.pre(weights.some((w) => w > 0));
          const r = allocateByWeights(total, weights);
          expect(r.reduce((a, b) => a + b, 0)).toBe(total);
          expect(r.every((v) => v >= 0)).toBe(true);
          weights.forEach((w, i) => {
            if (w === 0) expect(r[i]).toBe(0);
          });
          expect(allocateByWeights(total, weights)).toEqual(r);
        },
      ),
    );
  });

  it("split evenly: remainder to the earliest", () => {
    expect(splitEvenly(100, 3)).toEqual([34, 33, 33]);
  });
});

describe("convert", () => {
  it("USD → IDR with an agreed rate", () => {
    expect(convert(1000, "USD", "IDR", "16250")).toBe(162_500);
  });
  it("IDR → USD rounded half up", () => {
    expect(convert(100_000, "IDR", "USD", "0.0000615")).toBe(615);
  });
  it("same currency unchanged", () => {
    expect(convert(123, "IDR", "IDR", "2")).toBe(123);
  });
  it("invalid rate is rejected", () => {
    expect(() => convert(1, "USD", "IDR", "0")).toThrow("INVALID_RATE");
    expect(() => convert(1, "USD", "IDR", "-1")).toThrow("INVALID_RATE");
  });
});
