import { describe, expect, it } from "vitest";

import { db } from "@/database/client";
import { newId } from "@/lib/server/ids";
import { decideRequest } from "@/services/approvals/decisions";
import type { Ctx } from "@/services/context";
import { forgive } from "@/services/debts/forgive";
import { updateObligation, voidObligation } from "@/services/debts/mutations";
import { recordPayment, type RecordPaymentInput, voidSettlement } from "@/services/payments/mutations";
import { offsetPreview, proposeOffset } from "@/services/payments/offsets";

import { connected, debt, makeUser, obligationRow, pendingFor, record, TODAY } from "../helpers/factories";

async function setup() {
  const andi = await makeUser("Andi");
  const budi = await makeUser("Budi");
  const pairId = await connected(andi, budi);

  const a = await record(budi, debt(andi, budi, 50_000, { dueOn: "2026-10-01", title: "Bensin" }));
  const b = await record(budi, debt(andi, budi, 30_000, { dueOn: "2026-10-05", title: "Makan" }));
  return { andi, budi, pairId, a: a.id, b: b.id };
}

function pay(ctx: Ctx, pairId: string, payerId: string, amount: number, extra: Partial<RecordPaymentInput> = {}) {
  return recordPayment(ctx, {
    id: newId(),
    pairId,
    payerId,
    amount,
    currency: "IDR",
    method: "TRANSFER",
    paidOn: TODAY,
    ...extra,
  });
}

describe("payments", () => {
  it("debtor pays → waits for creditor; auto-allocated to the nearest due date", async () => {
    const { andi, budi, pairId, a, b } = await setup();
    const p = await pay(budi, pairId, budi.actor.partyId, 70_000);
    expect(p.status).toBe("PENDING");
    expect((await obligationRow(a)).paid).toBe(0);
    await decideRequest(andi, { requestId: (await pendingFor(andi, p.id))!, decision: "APPROVE" });
    expect((await obligationRow(a)).paid).toBe(50_000);
    expect((await obligationRow(b)).paid).toBe(20_000);
  });

  it("creditor records receipt → immediate", async () => {
    const { andi, budi, pairId, a } = await setup();
    const p = await pay(andi, pairId, budi.actor.partyId, 50_000);
    expect(p.status).toBe("ACTIVE");
    expect((await obligationRow(a)).paid).toBe(50_000);
  });

  it("overpayment is rejected (including pending ones)", async () => {
    const { budi, pairId } = await setup();
    await expect(pay(budi, pairId, budi.actor.partyId, 80_001)).rejects.toMatchObject({ code: "OVERPAY" });
    await pay(budi, pairId, budi.actor.partyId, 60_000);
    await expect(pay(budi, pairId, budi.actor.partyId, 20_001)).rejects.toMatchObject({ code: "OVERPAY" });
  });

  it("two parallel payments each = remaining → one OVERPAY", async () => {
    const { andi, budi, pairId } = await setup();
    const results = await Promise.allSettled([
      pay(andi, pairId, budi.actor.partyId, 80_000),
      pay(andi, pairId, budi.actor.partyId, 80_000),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect((results.find((r) => r.status === "rejected") as PromiseRejectedResult).reason).toMatchObject({
      code: "OVERPAY",
    });
  });

  it("manual allocation", async () => {
    const { andi, budi, pairId, a, b } = await setup();
    await pay(andi, pairId, budi.actor.partyId, 30_000, { allocations: [{ obligationId: b, amount: 30_000 }] });
    expect((await obligationRow(a)).paid).toBe(0);
    expect((await obligationRow(b)).paid).toBe(30_000);
  });

  it("payment cancelled by creditor → debtor approves, paid goes back", async () => {
    const { andi, budi, pairId, a } = await setup();
    const p = await pay(andi, pairId, budi.actor.partyId, 50_000);
    expect((await voidSettlement(andi, { id: p.id })).status).toBe("PROPOSED");
    await decideRequest(budi, { requestId: (await pendingFor(budi, p.id))!, decision: "APPROVE" });
    expect((await obligationRow(a)).paid).toBe(0);
  });

  it("a debt that has been paid can't be deleted (D-10)", async () => {
    const { andi, budi, pairId, a } = await setup();
    await pay(andi, pairId, budi.actor.partyId, 10_000);
    await expect(voidObligation(andi, { id: a })).rejects.toMatchObject({ code: "HAS_PAYMENTS" });
    await expect(updateObligation(andi, { id: a, patch: { amount: 5_000 } })).rejects.toMatchObject({
      code: "AMOUNT_BELOW_PAID",
    });
  });

  it("approving a payment that now exceeds the remaining amount → auto-rejected", async () => {
    const { andi, budi, pairId, a } = await setup();
    const p = await pay(budi, pairId, budi.actor.partyId, 50_000, {
      allocations: [{ obligationId: a, amount: 50_000 }],
    });

    await expect(updateObligation(andi, { id: a, patch: { amount: 40_000 } })).rejects.toMatchObject({
      code: "AMOUNT_BELOW_PAID",
    });
    const r = await decideRequest(andi, { requestId: (await pendingFor(andi, p.id))!, decision: "APPROVE" });
    expect(r.status).toBe("APPROVED");
  });

  it("forgive: creditor only", async () => {
    const { andi, budi, a } = await setup();
    await expect(forgive(budi, { id: newId(), obligationId: a, paidOn: TODAY })).rejects.toMatchObject({
      code: "FORBIDDEN_ROLE",
    });
    await forgive(andi, { id: newId(), obligationId: a, paidOn: TODAY });
    expect((await obligationRow(a)).paid).toBe(50_000);
  });

  it("cross-currency with an agreed rate", async () => {
    const andi = await makeUser("Andi");
    const budi = await makeUser("Budi");
    const pairId = await connected(andi, budi);
    const d = await record(budi, debt(andi, budi, 162_500));

    const p = await pay(andi, pairId, budi.actor.partyId, 1000, {
      currency: "USD",
      counterCurrency: "IDR",
      rate: "16250",
    });
    expect(p.status).toBe("ACTIVE");
    expect((await obligationRow(d.id)).paid).toBe(162_500);
  });
});

describe("offset", () => {
  it("both directions offset, net balance unchanged", async () => {
    const { andi, budi, pairId, a } = await setup();

    const c = await record(andi, debt(budi, andi, 30_000));
    const preview = await offsetPreview(db, pairId, andi.actor.partyId, budi.actor.partyId);
    expect(preview).toEqual([{ currency: "IDR", max: 30_000 }]);
    const o = await proposeOffset(andi, { id: newId(), pairId, amount: 30_000, currency: "IDR", paidOn: TODAY });
    expect(o.status).toBe("PENDING");
    await decideRequest(budi, { requestId: (await pendingFor(budi, o.id))!, decision: "APPROVE" });
    expect((await obligationRow(c.id)).paid).toBe(30_000);
    expect((await obligationRow(a)).paid).toBe(30_000);
  });

  it("nothing to offset", async () => {
    const { andi, pairId } = await setup();
    await expect(
      proposeOffset(andi, { id: newId(), pairId, amount: 1, currency: "IDR", paidOn: TODAY }),
    ).rejects.toMatchObject({ code: "NOTHING_TO_OFFSET" });
  });
});
