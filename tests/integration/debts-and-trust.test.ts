import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { db } from "@/database/client";
import { trustAction } from "@/database/schema/approvals";
import { obligation, recurring } from "@/database/schema/debts";
import { runRecurring } from "@/jobs/recurring";
import { newId } from "@/lib/server/ids";
import { decideRequest } from "@/services/approvals/decisions";
import { disputeTrustAction, listDisputable } from "@/services/approvals/disputes";
import { type Ctx, ctxFor } from "@/services/context";
import { updateObligation, voidObligation } from "@/services/debts/mutations";
import { createRecurring, stopRecurring } from "@/services/debts/recurring";
import { createInvite } from "@/services/invites";
import { recordPayment, type RecordPaymentInput, voidSettlement } from "@/services/payments/mutations";
import { proposeOffset } from "@/services/payments/offsets";
import { setBlocked } from "@/services/people/blocks";
import { remindPerson } from "@/services/people/remind";
import { setTrust } from "@/services/people/trust";

import { connected, debt, makeUser, obligationRow, pendingFor, record, TODAY } from "../helpers/factories";

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

async function pairOf() {
  const andi = await makeUser("Andi");
  const budi = await makeUser("Budi");
  const pairId = await connected(andi, budi);
  return { andi, budi, pairId };
}

describe("installments (D-74)", () => {
  it("due date follows the next unpaid installment", async () => {
    const { andi, budi, pairId } = await pairOf();
    const r = await record(
      budi,
      debt(andi, budi, 900_000, { installments: { count: 3, every: "MONTH", firstDue: "2026-10-05" } }),
    );
    expect(r.status).toBe("ACTIVE");
    expect((await obligationRow(r.id)).dueOn).toBe("2026-10-05");
    const p = await pay(andi, pairId, budi.actor.partyId, 400_000);
    expect((await obligationRow(r.id)).dueOn).toBe("2026-11-05");

    expect((await voidSettlement(budi, { id: p.id })).status).toBe("VOIDED");
    expect((await obligationRow(r.id)).dueOn).toBe("2026-10-05");
  });

  it("shortening the term by the creditor needs the debtor's approval; extending is immediate", async () => {
    const { andi, budi } = await pairOf();
    const plan = { count: 3, every: "MONTH" as const, firstDue: "2026-10-05" };
    const r = await record(budi, debt(andi, budi, 900_000, { installments: plan }));
    expect((await updateObligation(andi, { id: r.id, patch: { installments: { ...plan, count: 6 } } })).status).toBe(
      "APPLIED",
    );
    expect(
      (await updateObligation(andi, { id: r.id, patch: { installments: { ...plan, every: "WEEK" } } })).status,
    ).toBe("PROPOSED");
    await decideRequest(budi, { requestId: (await pendingFor(budi, r.id))!, decision: "APPROVE" });
    const row = await obligationRow(r.id);
    expect(row.installments).toMatchObject({ every: "WEEK", count: 3 });
    expect(row.dueOn).toBe("2026-10-05");
  });
});

describe("overpayment becomes a reverse debt (D-75)", () => {
  it("the excess waits too, activates when approved, voided when the payment is cancelled", async () => {
    const { andi, budi, pairId } = await pairOf();
    const d = await record(budi, debt(andi, budi, 80_000));
    const p = await pay(budi, pairId, budi.actor.partyId, 100_000, { allowExcess: true });
    expect(p).toMatchObject({ status: "PENDING", excess: 20_000 });
    const [ex] = await db.select().from(obligation).where(eq(obligation.sourceSettlementId, p.id));
    expect(ex).toMatchObject({ status: "PENDING", amount: 20_000, creditorId: budi.actor.partyId });

    await decideRequest(andi, { requestId: (await pendingFor(andi, p.id))!, decision: "APPROVE" });
    expect((await obligationRow(d.id)).paid).toBe(80_000);
    expect((await obligationRow(ex!.id)).status).toBe("ACTIVE");

    const back = await pay(budi, pairId, andi.actor.partyId, 5_000);
    expect(back.status).toBe("ACTIVE");
    await expect(voidSettlement(andi, { id: p.id })).rejects.toMatchObject({ code: "HAS_PAYMENTS" });
    await voidSettlement(budi, { id: back.id });
    await decideRequest(andi, { requestId: (await pendingFor(andi, back.id))!, decision: "APPROVE" }).catch(() => {});
    const r = await voidSettlement(andi, { id: p.id });
    expect(r.status).toBe("PROPOSED");
    await decideRequest(budi, { requestId: (await pendingFor(budi, p.id))!, decision: "APPROVE" });
    expect((await obligationRow(ex!.id)).status).toBe("VOID");
    expect((await obligationRow(d.id)).paid).toBe(0);
  });

  it("rejected → reverse debt rejected too; with no debt at all it stays OVERPAY", async () => {
    const { andi, budi, pairId } = await pairOf();
    await expect(pay(budi, pairId, budi.actor.partyId, 1_000, { allowExcess: true })).rejects.toMatchObject({
      code: "OVERPAY",
    });
    await record(budi, debt(andi, budi, 10_000));
    const p = await pay(budi, pairId, budi.actor.partyId, 15_000, { allowExcess: true });
    await decideRequest(andi, { requestId: (await pendingFor(andi, p.id))!, decision: "REJECT" });
    const [ex] = await db.select().from(obligation).where(eq(obligation.sourceSettlementId, p.id));
    expect(ex!.status).toBe("REJECTED");
  });
});

describe("recurring debts (D-74)", () => {
  it("debtor starts → active immediately, first period created; the job creates the next periods", async () => {
    const { andi, budi } = await pairOf();
    const id = newId();
    const res = await createRecurring(budi, {
      id,
      creditorId: andi.actor.partyId,
      debtorId: budi.actor.partyId,
      amount: 1_500_000,
      currency: "IDR",
      title: "Kos",
      every: "MONTH",
      startOn: "2026-01-01",
      dueAfterDays: 5,
    });
    expect(res.status).toBe("ACTIVE");
    const made = await db.select().from(obligation).where(eq(obligation.recurringId, id));

    expect(made.length).toBe(3);
    expect(made.every((o) => o.status === "ACTIVE")).toBe(true);
    const [rec] = await db.select().from(recurring).where(eq(recurring.id, id));
    expect(rec!.nextOn > TODAY).toBe(true);

    const later = new Date(new Date(`${rec!.nextOn}T03:00:00Z`).getTime());
    await runRecurring(later);
    await runRecurring(later);
    expect((await db.select().from(obligation).where(eq(obligation.recurringId, id))).length).toBe(4);

    await stopRecurring(andi, { id });
    await runRecurring(new Date(later.getTime() + 60 * 86_400_000));
    expect((await db.select().from(obligation).where(eq(obligation.recurringId, id))).length).toBe(4);
  });

  it("creditor starts → waits for the debtor; approved → period created", async () => {
    const { andi, budi } = await pairOf();
    const id = newId();
    const now = new Date(`${TODAY}T03:00:00Z`);
    const creator = ctxFor(andi.actor, { now });
    const approver = ctxFor(budi.actor, { now });
    const res = await createRecurring(creator, {
      id,
      creditorId: andi.actor.partyId,
      debtorId: budi.actor.partyId,
      amount: 50_000,
      currency: "IDR",
      title: "Netflix",
      every: "MONTH",
      startOn: TODAY,
    });
    expect(res.status).toBe("PENDING");
    expect((await db.select().from(obligation).where(eq(obligation.recurringId, id))).length).toBe(0);
    await decideRequest(approver, { requestId: (await pendingFor(budi, id))!, decision: "APPROVE" });
    expect((await db.select().from(obligation).where(eq(obligation.recurringId, id))).length).toBe(1);
  });
});

describe("mutual trust (D-86)", () => {
  async function trusting() {
    const p = await pairOf();
    expect((await setTrust(p.andi, { partyId: p.budi.actor.partyId, on: true })).state).toBe("I_ASKED");

    const before = await record(p.andi, debt(p.andi, p.budi, 10_000));
    expect(before.status).toBe("PENDING");
    expect((await setTrust(p.budi, { partyId: p.andi.actor.partyId, on: true })).state).toBe("ON");
    return { ...p, oldPending: before.id };
  }

  it("new records take effect immediately and can be disputed", async () => {
    const { andi, budi } = await trusting();
    const later = ctxFor(andi.actor, { now: new Date(Date.now() + 1000) });
    const r = await record(later, debt(andi, budi, 25_000));
    expect(r.status).toBe("ACTIVE");
    const [item] = await listDisputable(budi.actor, new Date(), r.id);
    expect(item).toMatchObject({ kind: "OBLIGATION_CREATE", amount: 25_000 });
    await disputeTrustAction(budi, { id: item!.id, reason: "belum pernah" });
    expect((await obligationRow(r.id)).status).toBe("REJECTED");
    await expect(disputeTrustAction(budi, { id: item!.id })).rejects.toMatchObject({ code: "ALREADY_DECIDED" });
  });

  it("changes to old records still need approval; new records are immediate + a dispute reverts them", async () => {
    const { andi, budi } = await pairOf();
    const t0 = Date.now() + 1000;
    const old = await record(ctxFor(budi.actor, { now: new Date(t0) }), debt(andi, budi, 100_000));
    await setTrust(ctxFor(andi.actor, { now: new Date(t0 + 10) }), { partyId: budi.actor.partyId, on: true });
    await setTrust(ctxFor(budi.actor, { now: new Date(t0 + 20) }), { partyId: andi.actor.partyId, on: true });
    const soon = (ms: number) => ctxFor(andi.actor, { now: new Date(t0 + 100 + ms) });

    expect((await updateObligation(soon(10), { id: old.id, patch: { amount: 150_000 } })).status).toBe("PROPOSED");

    const fresh = await record(soon(20), debt(andi, budi, 40_000, { title: "Tiket" }));
    expect((await updateObligation(soon(30), { id: fresh.id, patch: { amount: 60_000 } })).status).toBe("APPLIED");
    const [upd] = (await listDisputable(budi.actor, new Date(), fresh.id)).filter(
      (x) => x.kind === "OBLIGATION_UPDATE",
    );
    await disputeTrustAction(budi, { id: upd!.id });
    expect((await obligationRow(fresh.id)).amount).toBe(40_000);
  });

  it("a delete via mutual trust can be restored by a dispute; turning off = off for both", async () => {
    const { andi, budi } = await trusting();
    const t = ctxFor(budi.actor, { now: new Date(Date.now() + 1000) });
    const r = await record(ctxFor(andi.actor, { now: new Date(Date.now() + 500) }), debt(andi, budi, 30_000));
    expect((await voidObligation(t, { id: r.id })).status).toBe("VOIDED");
    const item = (await listDisputable(andi.actor, new Date(), r.id)).find((x) => x.kind === "OBLIGATION_VOID");
    await disputeTrustAction(andi, { id: item!.id });
    expect((await obligationRow(r.id)).status).toBe("ACTIVE");

    await setTrust(budi, { partyId: andi.actor.partyId, on: false });
    expect((await record(andi, debt(andi, budi, 1_000))).status).toBe("PENDING");
  });

  it("a payment via mutual trust can be disputed", async () => {
    const { andi, budi, pairId } = await trusting();
    const d = await record(budi, debt(andi, budi, 50_000));
    const p = await pay(ctxFor(budi.actor, { now: new Date(Date.now() + 1000) }), pairId, budi.actor.partyId, 50_000);
    expect(p.status).toBe("ACTIVE");
    const [item] = await listDisputable(andi.actor, new Date(), p.id);
    await disputeTrustAction(andi, { id: item!.id });
    expect((await obligationRow(d.id)).paid).toBe(0);
  });

  it("a dispute after 7 days is rejected", async () => {
    const { andi, budi } = await trusting();
    const r = await record(ctxFor(andi.actor, { now: new Date(Date.now() + 1000) }), debt(andi, budi, 5_000));
    const [row] = await db.select().from(trustAction).where(eq(trustAction.targetId, r.id));
    const late = ctxFor(budi.actor, { now: new Date(Date.now() + 8 * 86_400_000) });
    await expect(disputeTrustAction(late, { id: row!.id })).rejects.toMatchObject({ code: "INVALID_STATE" });
  });
});

describe("block (D-80) & anti-spam (D-81)", () => {
  it("a blocked person can't record/remind/offset, but can still pay", async () => {
    const { andi, budi, pairId } = await pairOf();
    await record(andi, debt(budi, andi, 20_000));
    await record(budi, debt(andi, budi, 10_000));
    await setBlocked(budi, { partyId: andi.actor.partyId, blocked: true });

    await expect(record(andi, debt(andi, budi, 1_000))).rejects.toMatchObject({ code: "BLOCKED" });
    await expect(remindPerson(andi, { partyId: budi.actor.partyId })).rejects.toMatchObject({ code: "BLOCKED" });
    await expect(
      proposeOffset(andi, { id: newId(), pairId, amount: 5_000, currency: "IDR", paidOn: TODAY }),
    ).rejects.toMatchObject({ code: "BLOCKED" });
    await expect(setTrust(andi, { partyId: budi.actor.partyId, on: true })).rejects.toMatchObject({ code: "BLOCKED" });
    const p = await pay(andi, pairId, andi.actor.partyId, 20_000);
    expect(p.status).toBe("PENDING");

    await setBlocked(budi, { partyId: andi.actor.partyId, blocked: false });
    expect((await record(andi, debt(andi, budi, 1_000))).status).toBe("PENDING");
  });

  it("invites max 20 per day", async () => {
    const u = await makeUser("Spam");
    for (let i = 0; i < 20; i++) await createInvite(u, { kind: "CONNECT" });
    await expect(createInvite(u, { kind: "CONNECT" })).rejects.toMatchObject({ code: "RATE_LIMITED" });
  });
});
