import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { db } from "@/database/client";
import { obligation } from "@/database/schema/debts";
import { groupMember } from "@/database/schema/groups";
import { pair, party } from "@/database/schema/people";
import { newId } from "@/lib/server/ids";
import { decideRequest } from "@/services/approvals/decisions";
import { createBill } from "@/services/bills/mutations";
import type { Ctx } from "@/services/context";
import {
  addMembers,
  createGroup,
  leaveGroup,
  proposeModeChange,
  removeMember,
  respondGroupInvite,
} from "@/services/groups/mutations";
import { acceptInvite, createInvite, previewInvite } from "@/services/invites";
import { recordPayment } from "@/services/payments/mutations";

import { connected, debt, makeUser, manual, obligationRow, pendingFor, record, TODAY } from "../helpers/factories";

async function memberStatus(groupId: string, partyId: string) {
  const [m] = await db
    .select()
    .from(groupMember)
    .where(and(eq(groupMember.groupId, groupId), eq(groupMember.partyId, partyId)));
  return m?.status;
}

async function groupOf(admin: Ctx, members: Ctx[], mode: "CONFIRM" | "TRUST" = "CONFIRM") {
  for (const m of members) await connected(admin, m);
  const g = await createGroup(admin, {
    id: newId(),
    name: "Kos Melati",
    mode,
    memberIds: members.map((m) => m.actor.partyId),
  });
  for (const m of members) await respondGroupInvite(m, { groupId: g.id, accept: true });
  return g.id;
}

describe("groups", () => {
  it("invite by admin → member right after accepting", async () => {
    const andi = await makeUser("Andi");
    const budi = await makeUser("Budi");
    await connected(andi, budi);
    const g = await createGroup(andi, { id: newId(), name: "Trip", memberIds: [budi.actor.partyId] });
    expect(await memberStatus(g.id, budi.actor.partyId)).toBe("INVITED");
    await respondGroupInvite(budi, { groupId: g.id, accept: true });
    expect(await memberStatus(g.id, budi.actor.partyId)).toBe("ACTIVE");
  });

  it("invite by a regular member → waits for admin approval (D-41)", async () => {
    const andi = await makeUser("Andi");
    const budi = await makeUser("Budi");
    const citra = await makeUser("Citra");
    const g = await groupOf(andi, [budi]);
    await connected(budi, citra);
    await addMembers(budi, { groupId: g, memberIds: [citra.actor.partyId] });
    await respondGroupInvite(citra, { groupId: g, accept: true });
    expect(await memberStatus(g, citra.actor.partyId)).toBe("PENDING");
    const reqId = await pendingFor(andi, citra.actor.partyId);
    await decideRequest(andi, { requestId: reqId!, decision: "APPROVE" });
    expect(await memberStatus(g, citra.actor.partyId)).toBe("ACTIVE");
  });

  it("recording on behalf of others in a group (D-42)", async () => {
    const andi = await makeUser("Andi");
    const budi = await makeUser("Budi");
    const citra = await makeUser("Citra");
    const g = await groupOf(andi, [budi, citra]);

    const r = await record(andi, debt(citra, budi, 40_000, { groupId: g }));
    expect(r.status).toBe("PENDING");
    expect(await pendingFor(budi, r.id)).toBeDefined();

    await expect(record(andi, debt(citra, budi, 1))).rejects.toMatchObject({ code: "FORBIDDEN_ROLE" });
  });

  it("trusted group: a new debt is active immediately", async () => {
    const andi = await makeUser("Andi");
    const budi = await makeUser("Budi");
    const g = await groupOf(andi, [budi], "TRUST");
    const r = await record(andi, debt(andi, budi, 40_000, { groupId: g }));
    expect(r.status).toBe("ACTIVE");
  });

  it("changing the mode needs every member's approval", async () => {
    const andi = await makeUser("Andi");
    const budi = await makeUser("Budi");
    const citra = await makeUser("Citra");
    const g = await groupOf(andi, [budi, citra]);
    expect((await proposeModeChange(andi, { groupId: g, mode: "TRUST" })).status).toBe("PROPOSED");
    const reqB = await pendingFor(budi, g);
    const reqC = await pendingFor(citra, g);
    expect((await decideRequest(budi, { requestId: reqB!, decision: "APPROVE" })).status).toBe("PENDING");
    expect((await decideRequest(citra, { requestId: reqC!, decision: "APPROVE" })).status).toBe("APPROVED");
    const r = await record(andi, debt(andi, budi, 1_000, { groupId: g }));
    expect(r.status).toBe("ACTIVE");
  });

  it("can't leave/be removed while the balance isn't zero (D-40)", async () => {
    const andi = await makeUser("Andi");
    const budi = await makeUser("Budi");
    const g = await groupOf(andi, [budi], "TRUST");
    const r = await record(andi, debt(andi, budi, 40_000, { groupId: g }));
    await expect(leaveGroup(budi, { groupId: g })).rejects.toMatchObject({ code: "GROUP_BALANCE_NOT_ZERO" });
    await expect(removeMember(andi, { groupId: g, partyId: budi.actor.partyId })).rejects.toMatchObject({
      code: "GROUP_BALANCE_NOT_ZERO",
    });
    const [p] = await db.select().from(obligation).where(eq(obligation.id, r.id));
    await recordPayment(andi, {
      id: newId(),
      pairId: p!.pairId,
      payerId: budi.actor.partyId,
      amount: 40_000,
      currency: "IDR",
      method: "CASH",
      paidOn: TODAY,
    });
    await leaveGroup(budi, { groupId: g });
    expect(await memberStatus(g, budi.actor.partyId)).toBe("LEFT");
  });
});

describe("invites & claims", () => {
  it("claiming a manual contact: records move, disputed ones become REJECTED (D-11)", async () => {
    const andi = await makeUser("Andi");
    const { partyId: budiManual, pairId } = await manual(andi, "Budi Kantor");
    const d1 = await record(andi, debt(andi, budiManual, 50_000, { title: "Bensin" }));
    const d2 = await record(andi, debt(andi, budiManual, 20_000, { title: "Salah catat" }));
    const d3 = await record(andi, debt(budiManual, andi, 5_000, { title: "Parkir" }));

    const inv = await createInvite(andi, { kind: "CLAIM", partyId: budiManual });
    const budi = await makeUser("Budi");
    const preview = await previewInvite(inv.token);
    expect(preview.items).toHaveLength(3);
    expect(preview.items.find((i) => i.id === d1.id)?.direction).toBe("I_OWE");

    const res = await acceptInvite(budi, { token: inv.token, disputedObligationIds: [d2.id] });
    expect(res.redirect).toBe(`/people/${andi.actor.partyId}`);
    expect((await obligationRow(d1.id)).debtorId).toBe(budi.actor.partyId);
    expect((await obligationRow(d2.id)).status).toBe("REJECTED");
    expect((await obligationRow(d3.id)).creditorId).toBe(budi.actor.partyId);
    const [pr] = await db.select().from(pair).where(eq(pair.id, pairId));
    expect([pr!.partyLow, pr!.partyHigh].sort()).toEqual([andi.actor.partyId, budi.actor.partyId].sort());
    const [ph] = await db.select().from(party).where(eq(party.id, budiManual));
    expect(ph!.mergedInto).toBe(budi.actor.partyId);

    const other = await makeUser("Lain");
    await expect(acceptInvite(other, { token: inv.token })).rejects.toMatchObject({ code: "INVITE_INVALID" });
  });

  it("claim when a pair record already exists → merged", async () => {
    const andi = await makeUser("Andi");
    const budi = await makeUser("Budi");
    const existingPair = await connected(andi, budi);
    const { partyId: dup } = await manual(andi, "Budi (lama)");
    const d = await record(andi, debt(andi, dup, 10_000));
    const inv = await createInvite(andi, { kind: "CLAIM", partyId: dup });
    await acceptInvite(budi, { token: inv.token });
    expect((await obligationRow(d.id)).pairId).toBe(existingPair);
  });

  it("accepting your own invite is rejected", async () => {
    const andi = await makeUser("Andi");
    const { partyId } = await manual(andi, "X");
    const inv = await createInvite(andi, { kind: "CLAIM", partyId });
    await expect(acceptInvite(andi, { token: inv.token })).rejects.toMatchObject({ code: "SELF_INVITE" });
  });

  it("QR connect: both people get a pair record right away; expires in 10 minutes", async () => {
    const andi = await makeUser("Andi");
    const budi = await makeUser("Budi");
    const inv = await createInvite(andi, { kind: "CONNECT" });
    await acceptInvite(budi, { token: inv.token });
    const r = await record(andi, debt(andi, budi, 1_000));
    expect(r.status).toBe("PENDING");
    const late = await createInvite(andi, { kind: "CONNECT" });
    const citra = await makeUser("Citra");
    const future = { ...citra, now: new Date(Date.now() + 11 * 60_000) };
    await expect(acceptInvite(future, { token: late.token })).rejects.toMatchObject({ code: "INVITE_INVALID" });
  });

  it("two people accepting a single-use invite at once → one fails", async () => {
    const andi = await makeUser("Andi");
    const inv = await createInvite(andi, { kind: "CONNECT" });
    const [b, c] = [await makeUser("Budi"), await makeUser("Citra")];
    const results = await Promise.allSettled([
      acceptInvite(b, { token: inv.token }),
      acceptInvite(c, { token: inv.token }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  });

  it("group link", async () => {
    const andi = await makeUser("Andi");
    const g = await createGroup(andi, { id: newId(), name: "Trip Bali" });
    const inv = await createInvite(andi, { kind: "GROUP", groupId: g.id });
    const budi = await makeUser("Budi");
    const res = await acceptInvite(budi, { token: inv.token });
    expect(res.groupStatus).toBe("ACTIVE");
  });
});

describe("split bill", () => {
  it("I paid; mixed participants (friend, manual contact, group member)", async () => {
    const andi = await makeUser("Andi");
    const budi = await makeUser("Budi");
    await connected(andi, budi);
    const { partyId: dodi } = await manual(andi, "Dodi");
    const b = await createBill(andi, {
      id: newId(),
      title: "Makan malam",
      occurredOn: TODAY,
      currency: "IDR",
      payerId: andi.actor.partyId,
      split: {
        participants: [andi.actor.partyId, budi.actor.partyId, dodi],
        mode: "EQUAL",
        subtotal: 300_000,
        serviceBps: 500,
        taxBps: 1000,
      },
    });
    const total = b.shares.reduce((s, x) => s + x.total, 0);
    expect(total).toBe(346_500);
    const budiShare = b.shares.find((s) => s.partyId === budi.actor.partyId)!;
    expect(budiShare.status).toBe("PENDING");
    const dodiShare = b.shares.find((s) => s.partyId === dodi)!;
    expect(dodiShare.status).toBe("ACTIVE");
    expect(b.shares.find((s) => s.partyId === andi.actor.partyId)!.obligationId).toBeNull();
  });

  it("someone else paid: a share with a manual contact is info only (D-17.5)", async () => {
    const andi = await makeUser("Andi");
    const budi = await makeUser("Budi");
    const citra = await makeUser("Citra");
    await connected(andi, budi);
    await connected(andi, citra);
    const { partyId: dodi } = await manual(andi, "Dodi");
    const b = await createBill(andi, {
      id: newId(),
      title: "Pizza",
      occurredOn: TODAY,
      currency: "IDR",
      payerId: citra.actor.partyId,
      split: {
        participants: [andi.actor.partyId, budi.actor.partyId, citra.actor.partyId, dodi],
        mode: "EQUAL",
        subtotal: 200_000,
      },
    });
    const by = (id: string) => b.shares.find((s) => s.partyId === id)!;
    expect(by(andi.actor.partyId).status).toBe("ACTIVE");
    expect(by(budi.actor.partyId).status).toBe("PENDING");
    expect(by(dodi).infoOnly).toBe(true);
  });

  it("two parallel bills on the same pair don't deadlock", async () => {
    const andi = await makeUser("Andi");
    const budi = await makeUser("Budi");
    const citra = await makeUser("Citra");
    await connected(andi, budi);
    await connected(andi, citra);
    const mk = (order: Ctx[]) =>
      createBill(andi, {
        id: newId(),
        title: "Paralel",
        occurredOn: TODAY,
        currency: "IDR",
        payerId: andi.actor.partyId,
        split: { participants: order.map((c) => c.actor.partyId), mode: "EQUAL", subtotal: 90_000 },
      });
    const results = await Promise.allSettled([mk([andi, budi, citra]), mk([andi, citra, budi])]);
    expect(results.every((r) => r.status === "fulfilled")).toBe(true);
  });
});
