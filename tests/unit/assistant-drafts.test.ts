import { describe, expect, it } from "vitest";

import { type BillInput, type Directory, resolveBill } from "@/domain/assistant-drafts";

const directory: Directory = {
  me: { partyId: "me-id", name: "Me", currency: "USD" },
  people: [{ id: "budi", name: "Budi", state: "USER" }],
  groups: [],
};
const draft: BillInput = { title: "Lunch", payer: "me", participants: ["me", { partyId: "budi" }], mode: "EQUAL" };

describe("bill draft resolution", () => {
  it("shares a new contact identity across participants, payer and items", () => {
    const result = resolveBill(
      {
        ...draft,
        payer: { newPersonName: "Cici" },
        participants: ["me", { newPersonName: "Cici" }, { newPersonName: "cici" }],
        mode: "ITEMS",
        items: [{ name: "Tea", amount: 2.5, assignees: ["new:Cici"] }],
      },
      directory,
      (name) => `new-${name}`,
    );
    expect(result.participants).toEqual(["me-id", "new-cici"]);
    expect(result.payerId).toBe("new-cici");
    expect(result.newPeople).toEqual([{ id: "new-cici", name: "Cici" }]);
    expect(result.items[0]).toMatchObject({ amount: 250, assignees: ["new-cici"] });
  });
  it("drops unknown string references and sums exact amounts in minor units", () => {
    const result = resolveBill(
      {
        ...draft,
        mode: "EXACT",
        exact: [
          { who: "budi", amount: 1.25 },
          { who: "budi", amount: 2 },
          { who: "unknown", amount: 9 },
        ],
      },
      directory,
      (name) => name,
    );
    expect(result.exact).toEqual({ budi: 325 });
    expect(result.mode).toBe("EXACT");
  });
  it("falls back to equal shares when an items draft has no items", () => {
    const result = resolveBill({ ...draft, mode: "ITEMS" }, directory, (name) => name);
    expect(result.mode).toBe("EQUAL");
    expect(result.currency).toBe("USD");
  });
});
