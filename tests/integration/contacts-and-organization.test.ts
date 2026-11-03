import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { db } from "@/database/client";
import { obligation } from "@/database/schema/debts";
import { notification } from "@/database/schema/notifications";
import { party } from "@/database/schema/people";
import { buildDigest, runDigests } from "@/jobs/digest";
import { newId } from "@/lib/server/ids";
import { guessCategory, learnCategory, titleTokens } from "@/services/categories";
import { ctxFor } from "@/services/context";
import { acceptInvite, mergeContact, previewInvite, USER_INVITE_PREFIX } from "@/services/invites";
import { labelsFor, listLabels, setDebtLabels } from "@/services/labels";
import { recordPayment } from "@/services/payments/mutations";
import { deleteManualContact, setContactArchived } from "@/services/people/mutations";
import { listArchivedPeople, listPeople } from "@/services/people/queries";
import { search } from "@/services/search";

import { connected, debt, makeUser, manual, obligationRow, record, TODAY } from "../helpers/factories";

describe("merge duplicate contacts (D-82)", () => {
  it("manual → my manual: records move, the source disappears from the list", async () => {
    const andi = await makeUser("Andi");
    const a = await manual(andi, "Budi");
    const b = await manual(andi, "Budi Kantor");
    const d1 = await record(andi, debt(andi, a.partyId, 10_000));
    const d2 = await record(andi, debt(andi, b.partyId, 5_000));
    expect((await mergeContact(andi, { sourceId: a.partyId, targetId: b.partyId })).status).toBe("MERGED");
    expect((await obligationRow(d1.id)).debtorId).toBe(b.partyId);
    expect((await obligationRow(d2.id)).pairId).toBe((await obligationRow(d1.id)).pairId);
    const people = await listPeople(andi.actor);
    expect(people.map((p) => p.name)).toEqual(["Budi Kantor"]);
    expect(people[0]!.net.IDR).toBe(15_000);
  });

  it("manual → user: they review via a dedicated invite (can dispute)", async () => {
    const andi = await makeUser("Andi");
    const budi = await makeUser("Budi");
    await connected(andi, budi);
    const ph = await manual(andi, "Budi HP lama");
    const ok = await record(andi, debt(andi, ph.partyId, 20_000));
    const wrong = await record(andi, debt(andi, ph.partyId, 7_000, { title: "Salah" }));
    expect((await mergeContact(andi, { sourceId: ph.partyId, targetId: budi.actor.partyId })).status).toBe("PROPOSED");

    const [n] = await db
      .select()
      .from(notification)
      .where(and(eq(notification.recipientUserId, budi.actor.userId), eq(notification.type, "MERGE_PROPOSED")));
    const url = (n!.payload as { url: string }).url;
    const token = url.split("/invite/")[1]!;
    expect(token.startsWith(USER_INVITE_PREFIX)).toBe(true);

    const cici = await makeUser("Cici");
    await expect(previewInvite(token, new Date(), cici.actor.userId)).rejects.toMatchObject({ code: "INVITE_INVALID" });
    const preview = await previewInvite(token, new Date(), budi.actor.userId);
    expect(preview.items).toHaveLength(2);
    await acceptInvite(budi, { token, disputedObligationIds: [wrong.id] });
    expect((await obligationRow(ok.id)).debtorId).toBe(budi.actor.partyId);
    expect((await obligationRow(wrong.id)).status).toBe("REJECTED");
  });
});

describe("delete & archive contacts (D-83)", () => {
  it("no records → can be deleted; has records → can't", async () => {
    const andi = await makeUser("Andi");
    const empty = await manual(andi, "Kosong");
    const used = await manual(andi, "Dipakai");
    await record(andi, debt(andi, used.partyId, 1_000));
    await deleteManualContact(andi, { partyId: empty.partyId });
    await expect(deleteManualContact(andi, { partyId: used.partyId })).rejects.toMatchObject({ code: "HAS_RECORDS" });
    expect((await listPeople(andi.actor)).map((p) => p.name)).toEqual(["Dipakai"]);
  });

  it("archive only at zero balance; reappears when there's a new record", async () => {
    const andi = await makeUser("Andi");
    const c = await manual(andi, "Dodi");
    const d = await record(andi, debt(andi, c.partyId, 3_000));
    await expect(setContactArchived(andi, { partyId: c.partyId, archived: true })).rejects.toMatchObject({
      code: "NOT_SETTLED",
    });
    await recordPayment(andi, {
      id: newId(),
      pairId: (await obligationRow(d.id)).pairId,
      payerId: c.partyId,
      amount: 3_000,
      currency: "IDR",
      method: "CASH",
      paidOn: TODAY,
    });
    await setContactArchived(andi, { partyId: c.partyId, archived: true });
    expect(await listPeople(andi.actor)).toHaveLength(0);
    expect((await listArchivedPeople(andi.actor)).map((p) => p.name)).toEqual(["Dodi"]);
    await record(andi, debt(andi, c.partyId, 500));
    expect(await listPeople(andi.actor)).toHaveLength(1);
  });
});

describe("private labels & category guesses (D-76)", () => {
  it("labels belong only to their creator; searchable", async () => {
    const andi = await makeUser("Andi");
    const budi = await makeUser("Budi");
    await connected(andi, budi);
    const d = await record(andi, debt(andi, budi, 10_000, { title: "Makan siang" }));
    await setDebtLabels(andi, { obligationId: d.id, names: ["#Kantor", "kantor", "arisan"] });
    expect((await labelsFor(andi.actor.userId, [d.id])).get(d.id)).toEqual(["arisan", "Kantor"]);
    expect((await labelsFor(budi.actor.userId, [d.id])).get(d.id)).toBeUndefined();
    expect((await search(andi.actor, "#kantor")).debts.map((x) => x.id)).toEqual([d.id]);
    expect((await search(budi.actor, "#kantor")).debts).toHaveLength(0);
    const cici = await makeUser("Cici");
    await expect(setDebtLabels(cici, { obligationId: d.id, names: ["x"] })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await setDebtLabels(andi, { obligationId: d.id, names: [] });
    expect(await listLabels(andi.actor.userId)).toHaveLength(0);
  });

  it("category learns from the user's choices and beats keywords", async () => {
    const andi = await makeUser("Andi");
    expect(titleTokens("Bayar kopi & Nasi-Goreng!!")).toEqual(["kopi", "nasi", "goreng"]);

    expect(await guessCategory(andi.actor, "kopi kenangan")).toMatchObject({ category: "FOOD", source: "keyword" });
    await learnCategory(db, andi.actor.userId, "kopi kantor", "SHARED");
    await learnCategory(db, andi.actor.userId, "kopi kantor", "SHARED");
    expect(await guessCategory(andi.actor, "kopi kenangan")).toMatchObject({ category: "SHARED", source: "memory" });

    const budi = await makeUser("Budi");
    await connected(andi, budi);
    await record(andi, debt(andi, budi, 1_000, { title: "Iuran futsal", category: "ENTERTAINMENT" }));
    expect(await guessCategory(andi.actor, "futsal minggu")).toMatchObject({ category: "ENTERTAINMENT" });
  });
});

describe("ringkasan email (D-77)", () => {
  it("contains due, overdue, pending; not created when empty", async () => {
    const andi = await makeUser("Andi");
    const budi = await makeUser("Budi");
    await connected(andi, budi);
    expect(await buildDigest(andi.actor, "2026-10-05", "WEEKLY")).toBeNull();
    await record(budi, debt(andi, budi, 50_000, { title: "Lama", dueOn: "2026-09-01" }));
    await record(
      budi,
      debt(andi, budi, 90_000, { title: "HP", installments: { count: 3, every: "MONTH", firstDue: "2026-10-07" } }),
    );
    await record(andi, debt(andi, budi, 1_000));
    const a = await buildDigest(andi.actor, "2026-10-05", "WEEKLY");
    expect(a).toMatchObject({ net: [{ currency: "IDR", amount: 140_000 }], awaiting: 0 });
    expect(a!.overdue.map((l) => l.title)).toEqual(["Lama"]);
    expect(a!.due).toEqual([expect.objectContaining({ title: "HP", amount: 30_000, seq: 1 })]);
    const b = await buildDigest(budi.actor, "2026-10-05", "DAILY");
    expect(b).toMatchObject({ awaiting: 1 });
  });

  it("job: Monday 09:00 local time, once per day", async () => {
    const u = await makeUser("Eka");
    const v = await makeUser("Fani");
    await connected(u, v);
    await db.update(party).set({ displayName: "Eka" }).where(eq(party.id, u.actor.partyId));
    await record(v, debt(u, v, 10_000, { dueOn: "2026-10-06" }));
    await db.execute(
      (await import("drizzle-orm"))
        .sql`update "user" set onboarded_at = now() where id in (${u.actor.userId}, ${v.actor.userId})`,
    );

    const monday9 = new Date("2026-10-05T02:00:00Z");
    await runDigests(monday9);
    await runDigests(monday9);
    const rows = await db
      .select()
      .from(notification)
      .where(and(eq(notification.recipientUserId, u.actor.userId), eq(notification.type, "DIGEST")));
    expect(rows).toHaveLength(1);
    await runDigests(new Date("2026-10-06T02:00:00Z"));
    expect(
      await db
        .select()
        .from(notification)
        .where(and(eq(notification.recipientUserId, u.actor.userId), eq(notification.type, "DIGEST"))),
    ).toHaveLength(1);
  });
});

describe("reverse debts & installments don't disturb each other's balance", () => {
  it("person balance = remaining debt + reverse debt", async () => {
    const andi = await makeUser("Andi");
    const budi = await makeUser("Budi");
    const pairId = await connected(andi, budi);
    await record(budi, debt(andi, budi, 10_000));
    await recordPayment(ctxFor(andi.actor), {
      id: newId(),
      pairId,
      payerId: budi.actor.partyId,
      amount: 12_000,
      currency: "IDR",
      method: "CASH",
      paidOn: TODAY,
      allowExcess: true,
    });
    const [p] = await listPeople(andi.actor);
    expect(p!.net.IDR).toBe(-2_000);
    const rows = await db.select().from(obligation).where(eq(obligation.pairId, pairId));
    expect(rows.find((r) => r.sourceSettlementId)?.status).toBe("ACTIVE");
  });
});

describe("fully trusted group (D-88)", () => {
  it("edit/delete/offset take effect immediately & can be disputed; records from before the group was trusted still need approval", async () => {
    const { createGroup, respondGroupInvite, proposeModeChange } = await import("@/services/groups/mutations");
    const { updateObligation, voidObligation } = await import("@/services/debts/mutations");
    const { decideRequest } = await import("@/services/approvals/decisions");
    const { disputeTrustAction, listDisputable } = await import("@/services/approvals/disputes");
    const { pendingFor } = await import("../helpers/factories");
    const t0 = Date.now() + 1000;
    const at = (c: typeof andi, ms: number) => ctxFor(c.actor, { now: new Date(t0 + ms) });

    const andi = await makeUser("Andi");
    const budi = await makeUser("Budi");
    await connected(andi, budi);
    const g = await createGroup(at(andi, 0), {
      id: newId(),
      name: "Kos",
      mode: "CONFIRM",
      memberIds: [budi.actor.partyId],
    });
    await respondGroupInvite(budi, { groupId: g.id, accept: true });

    const old = await record(at(budi, 10), debt(andi, budi, 40_000, { groupId: g.id }));

    await proposeModeChange(at(andi, 20), { groupId: g.id, mode: "TRUST" });
    await decideRequest(at(budi, 30), { requestId: (await pendingFor(budi, g.id))!, decision: "APPROVE" });

    const fresh = await record(at(andi, 40), debt(andi, budi, 25_000, { groupId: g.id }));
    expect(fresh.status).toBe("ACTIVE");

    expect((await voidObligation(at(budi, 50), { id: fresh.id })).status).toBe("VOIDED");
    const item = (await listDisputable(andi.actor, new Date(t0), fresh.id)).find((x) => x.kind === "OBLIGATION_VOID");
    expect(item).toBeDefined();
    await disputeTrustAction(at(andi, 60), { id: item!.id });
    expect((await obligationRow(fresh.id)).status).toBe("ACTIVE");

    expect((await updateObligation(at(budi, 70), { id: old.id, patch: { amount: 10_000 } })).status).toBe("PROPOSED");
  });
});
