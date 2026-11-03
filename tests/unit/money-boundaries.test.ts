import { describe, expect, it } from "vitest";

import { assert, DomainError, isDomainError } from "@/domain/errors";
import {
  allocateByWeights,
  assertValidAmount,
  convert,
  currencyExponent,
  fromMajor,
  isCurrency,
  isValidRate,
  MAX_MINOR,
  parseAmount,
  toInputString,
  toMajor,
} from "@/domain/money";

describe("money boundaries and error contracts", () => {
  it("keeps domain errors distinguishable and serializable", () => {
    const error = new DomainError("INVALID_INPUT", { field: "amount", max: MAX_MINOR });
    expect(isDomainError(error)).toBe(true);
    expect(isDomainError(new Error("INVALID_INPUT"))).toBe(false);
    expect(error.name).toBe("DomainError");
    expect(error.message).toBe("INVALID_INPUT");
    expect(error.params).toEqual({ field: "amount", max: MAX_MINOR });
    expect(() => assert(false, "OVERPAY", { max: 10 })).toThrow("OVERPAY");
    expect(() => assert(true, "OVERPAY")).not.toThrow();
  });

  it.each([0, -1, 0.5, NaN, Infinity, MAX_MINOR + 1, Number.MAX_SAFE_INTEGER])(
    "rejects invalid amount %s",
    (amount) => {
      expect(() => assertValidAmount(amount)).toThrow("INVALID_INPUT");
    },
  );

  it("accepts both ends of the valid amount range", () => {
    expect(() => assertValidAmount(1)).not.toThrow();
    expect(() => assertValidAmount(MAX_MINOR)).not.toThrow();
    expect(parseAmount(String(MAX_MINOR), "IDR")).toBe(MAX_MINOR);
    expect(parseAmount(String(MAX_MINOR + 1), "IDR")).toBeNull();
  });

  it("uses the currency's smallest unit", () => {
    expect(isCurrency("IDR")).toBe(true);
    expect(isCurrency("idr")).toBe(false);
    expect(currencyExponent("IDR")).toBe(0);
    expect(currencyExponent("USD")).toBe(2);
    expect(currencyExponent("KWD")).toBe(3);
    expect(toMajor(1234, "USD")).toBe(12.34);
    expect(fromMajor(12.34, "USD")).toBe(1234);
  });

  it.each(["IDR", "USD"] as const)("round trips form values for %s", (currency) => {
    expect(parseAmount(toInputString(1234, currency), currency)).toBe(1234);
  });

  it("preserves legacy ambiguous three-decimal grouping behavior", () => {
    expect(toInputString(1234, "KWD")).toBe("1.234");
    expect(parseAmount("1.234", "KWD")).toBe(1_234_000);
  });

  it("allocates signed totals and large weights without losing units", () => {
    expect(allocateByWeights(-5, [1, 1])).toEqual([-3, -2]);
    expect(allocateByWeights(MAX_MINOR, [Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER])).toEqual([
      MAX_MINOR / 2,
      MAX_MINOR / 2,
    ]);
    expect(allocateByWeights(0, [0, 0])).toEqual([0, 0]);
    expect(() => allocateByWeights(1, [0, 0])).toThrow("INVALID_INPUT");
    expect(() => allocateByWeights(1, [0.5])).toThrow("INVALID_INPUT");
  });

  it("validates rates and rounds conversions half up", () => {
    expect(isValidRate("0.0000000001")).toBe(true);
    for (const rate of ["0", "0.0", "-1", "1e2", "NaN", "1.00000000001"]) {
      expect(isValidRate(rate)).toBe(false);
    }
    expect(convert(1, "IDR", "USD", "0.005")).toBe(1);
    expect(convert(1000, "USD", "IDR", "16250.5")).toBe(162505);
    expect(() => convert(1, "USD", "IDR", "0")).toThrow("INVALID_RATE");
  });
});
