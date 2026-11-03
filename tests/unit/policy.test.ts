import { describe, expect, it } from "vitest";

import { type PartyRef, type PolicyAction, requiredApprovers } from "@/domain/policy";

const C: PartyRef = { id: "creditor", isUser: true };
const D: PartyRef = { id: "debtor", isUser: true };
const X = "third-party";

function approvers(
  action: PolicyAction,
  actor: string,
  opts: { creditor?: PartyRef; debtor?: PartyRef; groupMode?: "CONFIRM" | "TRUST" } = {},
) {
  return requiredApprovers({
    action,
    actorPartyId: actor,
    creditor: opts.creditor ?? C,
    debtor: opts.debtor ?? D,
    groupMode: opts.groupMode ?? null,
  }).approvers;
}

describe("approval matrix (the disadvantaged party approves)", () => {
  type Row = [string, PolicyAction, string, string[]];
  const rows: Row[] = [
    ["creditor records debt → debtor approves", { kind: "OBLIGATION_CREATE" }, C.id, [D.id]],
    ["debtor records own debt → immediate", { kind: "OBLIGATION_CREATE" }, D.id, []],
    ["third party records → debtor approves", { kind: "OBLIGATION_CREATE" }, X, [D.id]],
    [
      "amount raised by creditor → debtor",
      { kind: "OBLIGATION_UPDATE", change: { amount: { from: 100, to: 200 } } },
      C.id,
      [D.id],
    ],
    [
      "amount raised by debtor → immediate",
      { kind: "OBLIGATION_UPDATE", change: { amount: { from: 100, to: 200 } } },
      D.id,
      [],
    ],
    [
      "amount lowered by debtor → creditor",
      { kind: "OBLIGATION_UPDATE", change: { amount: { from: 200, to: 100 } } },
      D.id,
      [C.id],
    ],
    [
      "amount lowered by creditor → immediate",
      { kind: "OBLIGATION_UPDATE", change: { amount: { from: 200, to: 100 } } },
      C.id,
      [],
    ],
    [
      "due date moved earlier by creditor → debtor",
      { kind: "OBLIGATION_UPDATE", change: { dueOn: { from: "2026-10-10", to: "2026-10-01" } } },
      C.id,
      [D.id],
    ],
    [
      "due date added by creditor → debtor",
      { kind: "OBLIGATION_UPDATE", change: { dueOn: { from: null, to: "2026-10-01" } } },
      C.id,
      [D.id],
    ],
    [
      "due date moved later by debtor → creditor",
      { kind: "OBLIGATION_UPDATE", change: { dueOn: { from: "2026-10-01", to: "2026-10-10" } } },
      D.id,
      [C.id],
    ],
    [
      "due date removed by debtor → creditor",
      { kind: "OBLIGATION_UPDATE", change: { dueOn: { from: "2026-10-01", to: null } } },
      D.id,
      [C.id],
    ],
    ["metadata only → immediate", { kind: "OBLIGATION_UPDATE", change: { metadata: true } }, D.id, []],
    ["debt deleted by debtor → creditor", { kind: "OBLIGATION_VOID" }, D.id, [C.id]],
    ["debt deleted by creditor → immediate", { kind: "OBLIGATION_VOID" }, C.id, []],
    ["debtor records payment → creditor", { kind: "PAYMENT_CREATE" }, D.id, [C.id]],
    ["creditor records payment received → immediate", { kind: "PAYMENT_CREATE" }, C.id, []],
    ["forgiven by creditor → immediate", { kind: "FORGIVE" }, C.id, []],
    ["offset by debtor → creditor", { kind: "OFFSET_CREATE" }, D.id, [C.id]],
    ["offset by creditor → debtor", { kind: "OFFSET_CREATE" }, C.id, [D.id]],
    ["payment cancelled by creditor → debtor", { kind: "SETTLEMENT_VOID", settlementKind: "PAYMENT" }, C.id, [D.id]],
    ["payment cancelled by debtor → immediate", { kind: "SETTLEMENT_VOID", settlementKind: "PAYMENT" }, D.id, []],
    ["offset cancelled → the other party", { kind: "SETTLEMENT_VOID", settlementKind: "OFFSET" }, D.id, [C.id]],
  ];

  it.each(rows)("%s", (_name, action, actor, expected) => {
    expect(approvers(action, actor)).toEqual(expected);
  });

  it.each(rows)("a manual contact is never an approver: %s", (_name, action, actor) => {
    const manualC = { id: C.id, isUser: false };
    const manualD = { id: D.id, isUser: false };
    const result = approvers(action, actor, { creditor: manualC, debtor: manualD });
    expect(result).toEqual([]);
  });
});

describe("extra rules", () => {
  it("a change that disadvantages both parties is rejected", () => {
    expect(() =>
      approvers(
        {
          kind: "OBLIGATION_UPDATE",
          change: { amount: { from: 100, to: 200 }, dueOn: { from: "2026-10-01", to: "2026-10-10" } },
        },
        C.id,
      ),
    ).toThrow("MIXED_CHANGE");
  });

  it("the debtor can't forgive", () => {
    expect(() => approvers({ kind: "FORGIVE" }, D.id)).toThrow("FORBIDDEN_ROLE");
  });

  it("a third party can't record a payment", () => {
    expect(() => approvers({ kind: "PAYMENT_CREATE" }, X)).toThrow("FORBIDDEN_ROLE");
  });

  it("a debt to yourself is rejected", () => {
    expect(() => approvers({ kind: "OBLIGATION_CREATE" }, C.id, { debtor: { id: C.id, isUser: true } })).toThrow(
      "SELF_PAIR",
    );
  });

  describe("trusted group (D-88)", () => {
    const since = new Date("2026-09-01T00:00:00Z");
    const full = (action: PolicyAction, actor: string, targetCreatedAt?: Date) =>
      requiredApprovers({
        action,
        actorPartyId: actor,
        creditor: C,
        debtor: D,
        groupMode: "TRUST",
        groupTrustSince: since,
        targetCreatedAt,
      });
    const fresh = new Date("2026-09-10T00:00:00Z");
    const old = new Date("2026-08-01T00:00:00Z");

    it("every action takes effect immediately & can be disputed by the skipped party", () => {
      expect(full({ kind: "OBLIGATION_CREATE" }, C.id)).toMatchObject({ approvers: [], trusted: [D.id] });
      expect(full({ kind: "OBLIGATION_CREATE" }, X)).toMatchObject({ approvers: [], trusted: [D.id] });
      expect(full({ kind: "PAYMENT_CREATE" }, D.id)).toMatchObject({ approvers: [], trusted: [C.id] });
      expect(full({ kind: "OFFSET_CREATE" }, D.id)).toMatchObject({ approvers: [], trusted: [C.id] });
      expect(
        full({ kind: "OBLIGATION_UPDATE", change: { amount: { from: 200, to: 100 } } }, D.id, fresh),
      ).toMatchObject({ approvers: [], trusted: [C.id] });
      expect(full({ kind: "OBLIGATION_VOID" }, D.id, fresh)).toMatchObject({ approvers: [], trusted: [C.id] });
    });

    it("changes to records from before the group became trusted still need approval", () => {
      expect(full({ kind: "OBLIGATION_VOID" }, D.id, old)).toMatchObject({ approvers: [C.id], trusted: [] });
      expect(full({ kind: "SETTLEMENT_VOID", settlementKind: "PAYMENT" }, C.id, old)).toMatchObject({
        approvers: [D.id],
        trusted: [],
      });
    });

    it("a needs-confirmation group is not included", () => {
      expect(approvers({ kind: "OBLIGATION_CREATE" }, C.id, { groupMode: "CONFIRM" })).toEqual([D.id]);
    });
  });
});
