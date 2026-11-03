import { describe, expect, it } from "vitest";

import { summarize } from "@/domain/balance";
import {
  assertItemsMatch,
  diffObligation,
  isMetadataOnly,
  lineTotal,
  type ObligationSnapshot,
  suggestCategory,
} from "@/domain/debt";

const base: ObligationSnapshot = {
  amount: 50_000,
  currency: "IDR",
  dueOn: "2026-10-01",
  title: "Bensin",
  note: null,
  category: "TRANSPORT",
  occurredOn: "2026-09-27",
  itemsKey: "",
};

describe("diffObligation", () => {
  it("metadata only", () => {
    const { change, changedFields } = diffObligation(base, { title: "Bensin + parkir" });
    expect(isMetadataOnly(change)).toBe(true);
    expect(changedFields).toEqual(["title"]);
  });
  it("amount & due date", () => {
    const { change } = diffObligation(base, { amount: 60_000, dueOn: null });
    expect(change.amount).toEqual({ from: 50_000, to: 60_000 });
    expect(change.dueOn).toEqual({ from: "2026-10-01", to: null });
  });
  it("currency can't be changed", () => {
    expect(() => diffObligation(base, { currency: "USD" })).toThrow("CURRENCY_CHANGE");
  });
  it("same values aren't considered changed", () => {
    expect(diffObligation(base, { amount: 50_000, title: "Bensin" }).changedFields).toEqual([]);
  });
});

describe("item", () => {
  it("decimal qty is rounded", () => {
    expect(lineTotal({ name: "x", qtyMilli: 500, unitPrice: 15_333 })).toBe(7_667);
  });
  it("item total must equal the amount", () => {
    const items = [
      { name: "a", qtyMilli: 2000, unitPrice: 10_000 },
      { name: "b", qtyMilli: 1000, unitPrice: 5_000 },
    ];
    expect(() => assertItemsMatch(items, 25_000)).not.toThrow();
    expect(() => assertItemsMatch(items, 20_000)).toThrow("ITEMS_MISMATCH");
  });
});

describe("category", () => {
  it.each([
    ["Makan siang di warteg", "FOOD"],
    ["bensin pertalite", "TRANSPORT"],
    ["Bayar kos Oktober", "RENT"],
    ["token listrik", "BILLS"],
    ["pinjem dulu", "CASH_LOAN"],
    ["sesuatu", null],
  ])("%s → %s", (title, cat) => {
    expect(suggestCategory(title)).toBe(cat);
  });
});

describe("balance", () => {
  it("per currency from one person's point of view", () => {
    const s = summarize("me", [
      { creditorId: "me", debtorId: "budi", currency: "IDR", remaining: 350_000 },
      { creditorId: "citra", debtorId: "me", currency: "IDR", remaining: 80_000 },
      { creditorId: "me", debtorId: "budi", currency: "USD", remaining: 1000 },
      { creditorId: "x", debtorId: "y", currency: "IDR", remaining: 999 },
    ]);
    expect(s.net).toEqual({ IDR: 270_000, USD: 1000 });
    expect(s.owedToMe).toEqual({ IDR: 350_000, USD: 1000 });
    expect(s.iOwe).toEqual({ IDR: 80_000 });
  });
});
