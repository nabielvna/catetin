import { and, eq, inArray } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { db } from "@/database/client";
import { obligation } from "@/database/schema/debts";
import { newId } from "@/lib/server/ids";
import { decideRequest } from "@/services/approvals/decisions";
import type { Ctx } from "@/services/context";
import { createGroup, respondGroupInvite } from "@/services/groups/mutations";
import { proposeSimplify, simplifyPreview } from "@/services/groups/simplify";

import { connected, debt, makeUser, pendingFor, record } from "../helpers/factories";

async function trustGroup(admin: Ctx, members: Ctx[]) {
  for (const m of members) await connected(admin, m);
  const g = await createGroup(admin, {
    id: newId(),
    name: "Trip",
    mode: "TRUST",
    memberIds: members.map((m) => m.actor.partyId),
  });
  for (const m of members) await respondGroupInvite(m, { groupId: g.id, accept: true });
  return g.id;
}

async function openBalance(groupId: string, partyId: string) {
  const rows = await db
    .select()
    .from(obligation)
    .where(
      and(eq(obligation.groupId, groupId), eq(obligation.status, "ACTIVE"), inArray(obligation.currency, ["IDR"])),
    );
  return rows.reduce(
    (s, o) => s + (o.creditorId === partyId ? o.amount - o.paid : o.debtorId === partyId ? -(o.amount - o.paid) : 0),
    0,
  );
}

describe("simplify group debts (D-39) & circular (D-45)", () => {
  it("chain: applies after everyone affected agrees, everyone's balance unchanged", async () => {
    const andi = await makeUser("Andi");
    const budi = await makeUser("Budi");
    const citra = await makeUser("Citra");
    const g = await trustGroup(andi, [budi, citra]);

    await record(andi, debt(budi, andi, 10_000, { groupId: g }));
    await record(andi, debt(citra, budi, 10_000, { groupId: g }));

    const [p] = await simplifyPreview(andi.actor, g);
    expect(p).toMatchObject({ current: 2, simplified: 1 });
    const before = await Promise.all([andi, budi, citra].map((x) => openBalance(g, x.actor.partyId)));

    expect((await proposeSimplify(andi, { groupId: g, currency: "IDR" })).status).toBe("PROPOSED");

    expect((await simplifyPreview(andi.actor, g))[0]!.current).toBe(2);
    await decideRequest(budi, { requestId: (await pendingFor(budi, g))!, decision: "APPROVE" });
    expect((await simplifyPreview(andi.actor, g))[0]!.current).toBe(2);
    await decideRequest(citra, { requestId: (await pendingFor(citra, g))!, decision: "APPROVE" });

    const after = await Promise.all([andi, budi, citra].map((x) => openBalance(g, x.actor.partyId)));
    expect(after).toEqual(before);
    const [p2] = await simplifyPreview(andi.actor, g);
    expect(p2).toMatchObject({ current: 1, simplified: 1 });
    expect(p2!.transfers[0]).toMatchObject({ from: andi.actor.partyId, to: citra.actor.partyId, amount: 10_000 });
  });

  it("cycle: everything settled without transfers", async () => {
    const andi = await makeUser("Andi");
    const budi = await makeUser("Budi");
    const citra = await makeUser("Citra");
    const g = await trustGroup(andi, [budi, citra]);
    await record(andi, debt(budi, andi, 10_000, { groupId: g }));
    await record(andi, debt(citra, budi, 10_000, { groupId: g }));
    await record(andi, debt(andi, citra, 10_000, { groupId: g }));
    await proposeSimplify(andi, { groupId: g, currency: "IDR" });
    await decideRequest(budi, { requestId: (await pendingFor(budi, g))!, decision: "APPROVE" });
    await decideRequest(citra, { requestId: (await pendingFor(citra, g))!, decision: "APPROVE" });
    expect(await simplifyPreview(andi.actor, g)).toEqual([]);
  });

  it("someone rejects → nothing changes", async () => {
    const andi = await makeUser("Andi");
    const budi = await makeUser("Budi");
    const citra = await makeUser("Citra");
    const g = await trustGroup(andi, [budi, citra]);
    await record(andi, debt(budi, andi, 10_000, { groupId: g }));
    await record(andi, debt(citra, budi, 10_000, { groupId: g }));
    await proposeSimplify(andi, { groupId: g, currency: "IDR" });
    await decideRequest(budi, { requestId: (await pendingFor(budi, g))!, decision: "REJECT" });
    expect((await simplifyPreview(andi.actor, g))[0]!.current).toBe(2);
  });
});
