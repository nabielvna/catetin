import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { db } from "@/database/client";
import { invite, party } from "@/database/schema";
import { acceptInvite, createInvite, previewInvite, revokeInvite } from "@/services/invites";
import { listPeople } from "@/services/people/queries";

import { makeUser, manual } from "../helpers/factories";

describe("contact invitations", () => {
  it("does not let another owner invite a private manual contact", async () => {
    const owner = await makeUser("Ani");
    const stranger = await makeUser("Cici");
    const contact = await manual(owner, "Budi");
    await expect(createInvite(stranger, { kind: "CLAIM", partyId: contact.partyId })).rejects.toThrow("NOT_FOUND");
  });
  it("revokes the token and rejects expired invitations", async () => {
    const owner = await makeUser("Ani");
    const contact = await manual(owner, "Budi");
    const created = await createInvite(owner, { kind: "CLAIM", partyId: contact.partyId });
    await expect(previewInvite(created.token, new Date(created.expiresAt.getTime() + 1))).rejects.toThrow(
      "INVITE_INVALID",
    );
    await revokeInvite(owner, { partyId: contact.partyId });
    await expect(previewInvite(created.token)).rejects.toThrow("INVITE_INVALID");
  });
  it("rejects self-acceptance without consuming the invitation", async () => {
    const owner = await makeUser("Ani");
    const created = await createInvite(owner, { kind: "CONNECT" });
    await expect(acceptInvite(owner, { token: created.token })).rejects.toThrow("SELF_INVITE");
    const rows = await db.select().from(invite).where(eq(invite.createdBy, owner.actor.userId));
    expect(rows[0]?.useCount).toBe(0);
  });
  it("claims one manual contact and keeps the inviter's private nickname", async () => {
    const owner = await makeUser("Ani");
    const claimant = await makeUser("Budi Santoso");
    const contact = await manual(owner, "Budi Kantor");
    const created = await createInvite(owner, { kind: "CLAIM", partyId: contact.partyId });
    await acceptInvite(claimant, { token: created.token });
    const [old] = await db.select().from(party).where(eq(party.id, contact.partyId));
    expect(old?.mergedInto).toBe(claimant.actor.partyId);
    expect(await listPeople(owner.actor)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ partyId: claimant.actor.partyId, name: "Budi Kantor", state: "USER" }),
      ]),
    );
    await expect(acceptInvite(claimant, { token: created.token })).rejects.toThrow("INVITE_INVALID");
  });
  it("allows only one account to claim a token when acceptance races", async () => {
    const owner = await makeUser("Ani");
    const first = await makeUser("Budi");
    const second = await makeUser("Cici");
    const contact = await manual(owner, "Contact");
    const created = await createInvite(owner, { kind: "CLAIM", partyId: contact.partyId });
    const outcomes = await Promise.allSettled([
      acceptInvite(first, { token: created.token }),
      acceptInvite(second, { token: created.token }),
    ]);
    expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome.status === "rejected")).toHaveLength(1);
    const [old] = await db.select().from(party).where(eq(party.id, contact.partyId));
    expect([first.actor.partyId, second.actor.partyId]).toContain(old?.mergedInto);
  });
});
