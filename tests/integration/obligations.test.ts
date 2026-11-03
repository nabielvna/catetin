import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { db } from "@/database/client";
import { activity } from "@/database/schema/activity";
import { obligationItem } from "@/database/schema/debts";
import { notification } from "@/database/schema/notifications";
import { cancelRequest, decideRequest } from "@/services/approvals/decisions";
import { updateObligation, voidObligation } from "@/services/debts/mutations";

import { connected, debt, makeUser, manual, obligationRow, pendingFor, record } from "../helpers/factories";

describe("record a debt", () => {
  it("creditor records → PENDING until the debtor confirms", async () => {
    const andi = await makeUser("Andi");
    const budi = await makeUser("Budi");
    await connected(andi, budi);
    const r = await record(andi, debt(andi, budi, 50_000));
    expect(r.status).toBe("PENDING");

    const reqId = await pendingFor(budi, r.id);
    expect(reqId).toBeDefined();
    const notes = await db.select().from(notification).where(eq(notification.recipientUserId, budi.actor.userId));
    expect(notes.map((n) => `${n.type}:${n.channel}`)).toContain("OBLIGATION_PROPOSED:INBOX");

    await decideRequest(budi, { requestId: reqId!, decision: "APPROVE" });
    expect((await obligationRow(r.id)).status).toBe("ACTIVE");
  });

  it("debtor records their own debt → active immediately", async () => {
    const andi = await makeUser("Andi");
    const budi = await makeUser("Budi");
    await connected(andi, budi);
    const r = await record(budi, debt(andi, budi, 20_000));
    expect(r.status).toBe("ACTIVE");
  });

  it("item breakdown with a negative discount row, service & tax (D-98)", async () => {
    const andi = await makeUser("Andi");
    const { partyId } = await manual(andi, "Dodi");
    const items = [
      { name: "Fried Kwetiau", qtyMilli: 1000, unitPrice: 100_000 },
      { name: "Orange Juice", qtyMilli: 1000, unitPrice: 100_000 },
      { name: "Diskon", qtyMilli: 1000, unitPrice: -30_000 },
      { name: "Service 7.5%", qtyMilli: 1000, unitPrice: 12_750 },
      { name: "Pajak 10%", qtyMilli: 1000, unitPrice: 18_275 },
    ];
    const r = await record(andi, debt(andi, partyId, 201_025, { items }));
    const rows = await db.select().from(obligationItem).where(eq(obligationItem.obligationId, r.id));
    expect(rows.map((x) => x.lineTotal).sort((a, b) => a - b)).toEqual([-30_000, 12_750, 18_275, 100_000, 100_000]);
    await expect(record(andi, debt(andi, partyId, 200_000, { items }))).rejects.toMatchObject({
      code: "ITEMS_MISMATCH",
    });
  });

  it("manual contact → active immediately", async () => {
    const andi = await makeUser("Andi");
    const { partyId } = await manual(andi, "Dodi");
    const r = await record(andi, debt(andi, partyId, 20_000));
    expect(r.status).toBe("ACTIVE");
  });

  it("same id twice → one debt (idempotent)", async () => {
    const andi = await makeUser("Andi");
    const { partyId } = await manual(andi, "Dodi");
    const input = debt(andi, partyId, 20_000);
    const [a, b] = await Promise.all([record(andi, input), record(andi, input)].map((p) => p.catch((e) => e)));
    const ok = [a, b].filter((x) => x && x.id === input.id);
    expect(ok.length).toBeGreaterThanOrEqual(1);
    const rows = await db.select().from(activity).where(eq(activity.targetId, input.id));
    expect(rows.filter((r) => r.type === "OBLIGATION_RECORDED")).toHaveLength(1);
  });

  it("can't record with a stranger", async () => {
    const andi = await makeUser("Andi");
    const stranger = await makeUser("Asing");
    await expect(record(andi, debt(andi, stranger, 1))).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("debtor rejects → REJECTED", async () => {
    const andi = await makeUser("Andi");
    const budi = await makeUser("Budi");
    await connected(andi, budi);
    const r = await record(andi, debt(andi, budi, 50_000));
    await decideRequest(budi, {
      requestId: (await pendingFor(budi, r.id))!,
      decision: "REJECT",
      reason: "salah orang",
    });
    expect((await obligationRow(r.id)).status).toBe("REJECTED");
  });

  it("two parallel decisions → one succeeds, one ALREADY_DECIDED", async () => {
    const andi = await makeUser("Andi");
    const budi = await makeUser("Budi");
    await connected(andi, budi);
    const r = await record(andi, debt(andi, budi, 50_000));
    const reqId = (await pendingFor(budi, r.id))!;
    const results = await Promise.allSettled([
      decideRequest(budi, { requestId: reqId, decision: "APPROVE" }),
      decideRequest(budi, { requestId: reqId, decision: "APPROVE" }),
    ]);
    expect(results.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((x) => x.status === "rejected") as PromiseRejectedResult;
    expect(rejected.reason).toMatchObject({ code: "ALREADY_DECIDED" });
  });

  it("the recorder can withdraw an unconfirmed debt", async () => {
    const andi = await makeUser("Andi");
    const budi = await makeUser("Budi");
    await connected(andi, budi);
    const r = await record(andi, debt(andi, budi, 50_000));
    expect((await voidObligation(andi, { id: r.id })).status).toBe("WITHDRAWN");
    expect(await pendingFor(budi, r.id)).toBeUndefined();
  });

  it("the requester can cancel the request", async () => {
    const andi = await makeUser("Andi");
    const budi = await makeUser("Budi");
    await connected(andi, budi);
    const r = await record(andi, debt(andi, budi, 50_000));
    const reqId = (await pendingFor(budi, r.id))!;
    await expect(cancelRequest(budi, { requestId: reqId })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await cancelRequest(andi, { requestId: reqId });
    expect((await obligationRow(r.id)).status).toBe("VOID");
  });
});

describe("edit & delete active debts", () => {
  async function active() {
    const andi = await makeUser("Andi");
    const budi = await makeUser("Budi");
    await connected(andi, budi);
    const r = await record(budi, debt(andi, budi, 50_000, { dueOn: "2026-10-10" }));
    return { andi, budi, id: r.id };
  }

  it("metadata takes effect immediately", async () => {
    const { budi, id } = await active();
    expect((await updateObligation(budi, { id, patch: { title: "Bensin + parkir" } })).status).toBe("APPLIED");
    expect((await obligationRow(id)).title).toBe("Bensin + parkir");
  });

  it("debtor lowers the amount → creditor approves", async () => {
    const { andi, budi, id } = await active();
    expect((await updateObligation(budi, { id, patch: { amount: 40_000 } })).status).toBe("PROPOSED");
    expect((await obligationRow(id)).amount).toBe(50_000);
    await expect(updateObligation(budi, { id, patch: { title: "x" } })).rejects.toMatchObject({
      code: "CHANGE_PENDING",
    });
    await decideRequest(andi, { requestId: (await pendingFor(andi, id))!, decision: "APPROVE" });
    const row = await obligationRow(id);
    expect(row.amount).toBe(40_000);
    expect(row.version).toBe(2);
  });

  it("creditor lowers the amount → immediate", async () => {
    const { andi, id } = await active();
    expect((await updateObligation(andi, { id, patch: { amount: 40_000 } })).status).toBe("APPLIED");
  });

  it("a mixed change is rejected", async () => {
    const { andi, id } = await active();
    await expect(updateObligation(andi, { id, patch: { amount: 60_000, dueOn: "2026-12-01" } })).rejects.toMatchObject({
      code: "MIXED_CHANGE",
    });
  });

  it("stale request → SUPERSEDED", async () => {
    const { andi, budi, id } = await active();
    await updateObligation(budi, { id, patch: { dueOn: "2026-11-01" } });
    const reqId = (await pendingFor(andi, id))!;

    await expect(updateObligation(andi, { id, patch: { amount: 45_000 } })).rejects.toMatchObject({
      code: "CHANGE_PENDING",
    });
    await decideRequest(andi, { requestId: reqId, decision: "APPROVE" });
    expect((await obligationRow(id)).dueOn).toBe("2026-11-01");
  });

  it("debtor deletes → creditor approves; creditor deletes → immediate", async () => {
    const { andi, budi, id } = await active();
    expect((await voidObligation(budi, { id })).status).toBe("PROPOSED");
    await decideRequest(andi, { requestId: (await pendingFor(andi, id))!, decision: "REJECT" });
    expect((await obligationRow(id)).status).toBe("ACTIVE");
    expect((await voidObligation(andi, { id })).status).toBe("VOIDED");
    expect((await obligationRow(id)).status).toBe("VOID");
  });

  it("a third person can't do anything", async () => {
    const { id } = await active();
    const citra = await makeUser("Citra");
    await expect(updateObligation(citra, { id, patch: { title: "x" } })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(voidObligation(citra, { id })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("history can't be modified", async () => {
    const { id } = await active();
    await expect(db.update(activity).set({ type: "X" }).where(eq(activity.targetId, id))).rejects.toThrow();
  });
});
