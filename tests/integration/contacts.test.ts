import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { db } from "@/database/client";
import { activity, groupMember, obligation, pair, party } from "@/database/schema";
import { newId } from "@/lib/server/ids";
import { requireMembership } from "@/services/groups/access";
import { createGroup } from "@/services/groups/mutations";
import { assertNotBlocked, setBlocked } from "@/services/people/blocks";
import {
  createManualContact,
  deleteManualContact,
  renamePerson,
  setContactArchived,
  setContactEmail,
} from "@/services/people/mutations";
import { canSeeParty, namesFor } from "@/services/people/parties";
import { getPerson, listArchivedPeople, listPeople } from "@/services/people/queries";
import { setTrust, trustSinceBetween } from "@/services/people/trust";

import { connected, makeUser, manual, TODAY } from "../helpers/factories";

describe("contact access and lifecycle", () => {
  it("creates one normalized contact and audit entry when retried", async () => {
    const owner = await makeUser("Ani");
    const input = { id: newId(), name: "  Budi\t Santoso ", email: " BUDI@Example.com " };
    const first = await createManualContact(owner, input);
    expect(await createManualContact(owner, input)).toEqual(first);
    const [row] = await db.select().from(party).where(eq(party.id, first.partyId));
    expect(row).toMatchObject({
      displayName: "Budi Santoso",
      email: "budi@example.com",
      ownerUserId: owner.actor.userId,
    });
    expect(
      await db
        .select()
        .from(activity)
        .where(and(eq(activity.type, "CONTACT_CREATED"), eq(activity.targetId, first.partyId))),
    ).toHaveLength(1);
    expect((await listPeople(owner.actor)).map((p) => p.partyId)).toContain(first.partyId);
  });

  it("does not reveal or mutate another owner's private contact", async () => {
    const owner = await makeUser("Ani");
    const stranger = await makeUser("Cici");
    const contact = await manual(owner, "Budi");
    expect(await canSeeParty(db, stranger.actor, contact.partyId)).toBe(false);
    expect(await getPerson(stranger.actor, contact.partyId)).toBeNull();
    await expect(renamePerson(stranger, { partyId: contact.partyId, name: "Changed" })).rejects.toThrow("NOT_FOUND");
    await expect(setContactEmail(stranger, { partyId: contact.partyId, email: "x@example.com" })).rejects.toThrow(
      "NOT_FOUND",
    );
    await expect(deleteManualContact(stranger, { partyId: contact.partyId })).rejects.toThrow("NOT_FOUND");
    await expect(createManualContact(stranger, { id: contact.partyId, name: "Changed" })).rejects.toThrow(
      "INVALID_INPUT",
    );
    expect((await getPerson(owner.actor, contact.partyId))?.header.name).toBe("Budi");
  });

  it("keeps nicknames private to the viewer", async () => {
    const ani = await makeUser("Ani");
    const budi = await makeUser("Budi");
    const cici = await makeUser("Cici");
    await connected(ani, budi);
    await connected(cici, budi);
    await renamePerson(ani, { partyId: budi.actor.partyId, name: "Budi Kantor" });
    expect((await namesFor(db, ani.actor.userId, [budi.actor.partyId])).get(budi.actor.partyId)).toBe("Budi Kantor");
    expect((await namesFor(db, cici.actor.userId, [budi.actor.partyId])).get(budi.actor.partyId)).toBe("Budi");
  });

  it("archives settled contacts and restores them to the list", async () => {
    const owner = await makeUser("Ani");
    const contact = await manual(owner, "Budi");
    await setContactArchived(owner, { partyId: contact.partyId, archived: true });
    expect((await listPeople(owner.actor)).map((p) => p.partyId)).not.toContain(contact.partyId);
    expect((await listArchivedPeople(owner.actor)).map((p) => p.partyId)).toContain(contact.partyId);
    await setContactArchived(owner, { partyId: contact.partyId, archived: false });
    expect((await listPeople(owner.actor)).map((p) => p.partyId)).toContain(contact.partyId);
    await deleteManualContact(owner, { partyId: contact.partyId });
    const [row] = await db.select().from(party).where(eq(party.id, contact.partyId));
    expect(row?.deletedAt).not.toBeNull();
    expect(row?.email).toBeNull();
  });

  it("prevents archive and deletion while an unpaid record remains", async () => {
    const owner = await makeUser("Ani");
    const contact = await manual(owner, "Budi");
    await db
      .insert(obligation)
      .values({
        id: newId(),
        pairId: contact.pairId,
        creditorId: owner.actor.partyId,
        debtorId: contact.partyId,
        amount: 10000,
        currency: "IDR",
        title: "Lunch",
        occurredOn: TODAY,
        status: "ACTIVE",
        createdBy: owner.actor.userId,
      });
    await expect(setContactArchived(owner, { partyId: contact.partyId, archived: true })).rejects.toThrow(
      "NOT_SETTLED",
    );
    await expect(deleteManualContact(owner, { partyId: contact.partyId })).rejects.toThrow("HAS_RECORDS");
  });

  it("requires active group membership and hides unrelated groups", async () => {
    const owner = await makeUser("Ani");
    const member = await makeUser("Budi");
    const stranger = await makeUser("Cici");
    const group = await createGroup(owner, { id: newId(), name: "Trip" });
    await db
      .insert(groupMember)
      .values({ groupId: group.id, partyId: member.actor.partyId, role: "MEMBER", status: "ACTIVE" });
    expect(await canSeeParty(db, owner.actor, member.actor.partyId)).toBe(true);
    await expect(requireMembership(db, group.id, stranger.actor.partyId)).rejects.toThrow("NOT_FOUND");
    await db
      .update(groupMember)
      .set({ status: "LEFT" })
      .where(and(eq(groupMember.groupId, group.id), eq(groupMember.partyId, member.actor.partyId)));
    expect(await canSeeParty(db, owner.actor, member.actor.partyId)).toBe(false);
    expect(
      await db
        .select()
        .from(pair)
        .where(and(eq(pair.partyLow, owner.actor.partyId), eq(pair.partyHigh, stranger.actor.partyId))),
    ).toHaveLength(0);
  });
  it("blocking clears mutual trust and prevents new requests from the blocked user", async () => {
    const ani = await makeUser("Ani");
    const budi = await makeUser("Budi");
    await connected(ani, budi);
    await setTrust(ani, { partyId: budi.actor.partyId, on: true });
    await setTrust(budi, { partyId: ani.actor.partyId, on: true });
    expect(await trustSinceBetween(db, ani.actor.partyId, budi.actor.partyId)).not.toBeNull();
    await setBlocked(ani, { partyId: budi.actor.partyId, blocked: true });
    expect(await trustSinceBetween(db, ani.actor.partyId, budi.actor.partyId)).toBeNull();
    await expect(assertNotBlocked(db, budi.actor.partyId, [ani.actor.partyId])).rejects.toThrow("BLOCKED");
    expect(await canSeeParty(db, budi.actor, ani.actor.partyId)).toBe(true);
    await setBlocked(ani, { partyId: budi.actor.partyId, blocked: false });
    await expect(assertNotBlocked(db, budi.actor.partyId, [ani.actor.partyId])).resolves.toBeUndefined();
  });
});
