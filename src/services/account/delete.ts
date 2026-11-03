import "server-only";

import { and, eq, inArray, sql } from "drizzle-orm";

import { db } from "@/database/client";
import { approvalRequest, approvalVote } from "@/database/schema/approvals";
import { assistantThread } from "@/database/schema/assistant";
import { user } from "@/database/schema/auth";
import { groupMember } from "@/database/schema/groups";
import { invite } from "@/database/schema/invites";
import { notification, pushSubscription } from "@/database/schema/notifications";
import { party, partyAlias } from "@/database/schema/people";
import { DomainError } from "@/domain/errors";
import { recordActivity } from "@/services/activity";
import type { Actor } from "@/services/context";
import { ctxFor } from "@/services/context";

export async function deleteAccount(actor: Actor): Promise<void> {
  const ctx = ctxFor(actor);
  await db.transaction(async (tx) => {
    const lastAdminGroups = await tx.execute<{ group_id: string }>(sql`
      select m.group_id from group_member m
      where m.party_id = ${actor.partyId} and m.role = 'ADMIN' and m.status = 'ACTIVE'
        and not exists (select 1 from group_member o where o.group_id = m.group_id and o.party_id <> m.party_id
          and o.role = 'ADMIN' and o.status = 'ACTIVE')
        and exists (select 1 from group_member o join party p on p.id = o.party_id
          where o.group_id = m.group_id and o.party_id <> m.party_id and o.status = 'ACTIVE' and p.user_id is not null)`);
    if (lastAdminGroups.length > 0) throw new DomainError("LAST_ADMIN");

    const pendingIds = (
      await tx.execute<{ id: string }>(sql`
        select r.id from approval_request r where r.status = 'PENDING' and (
          r.requested_by_party = ${actor.partyId}
          or exists (select 1 from approval_vote v where v.request_id = r.id and v.party_id = ${actor.partyId}))`)
    ).map((r) => r.id);
    if (pendingIds.length) {
      await tx
        .update(approvalRequest)
        .set({ status: "SUPERSEDED", decidedAt: ctx.now, reason: "ACCOUNT_DELETED" })
        .where(inArray(approvalRequest.id, pendingIds));

      await tx.execute(sql`
        update obligation set status = 'REJECTED', closed_at = now()
        where status = 'PENDING' and id in (select target_id from approval_request where id in ${pendingIds} and kind = 'OBLIGATION_CREATE')`);
      await tx.execute(sql`
        update settlement set status = 'REJECTED', closed_at = now()
        where status = 'PENDING' and id in (select target_id from approval_request where id in ${pendingIds} and kind = 'SETTLEMENT_CREATE')`);
    }
    await tx
      .delete(approvalVote)
      .where(and(eq(approvalVote.partyId, actor.partyId), eq(approvalVote.decision, "PENDING")));

    await tx
      .update(groupMember)
      .set({ status: "LEFT", leftAt: ctx.now, role: "MEMBER" })
      .where(
        and(eq(groupMember.partyId, actor.partyId), inArray(groupMember.status, ["ACTIVE", "INVITED", "PENDING"])),
      );
    await tx.update(invite).set({ revokedAt: ctx.now }).where(eq(invite.createdBy, actor.userId));
    await recordActivity(tx, ctx, { type: "ACCOUNT_DELETED", targetType: "PARTY", targetId: actor.partyId });

    await tx.update(party).set({ accountDeletedAt: ctx.now, email: null }).where(eq(party.id, actor.partyId));
    await tx.delete(notification).where(eq(notification.recipientUserId, actor.userId));
    await tx.delete(pushSubscription).where(eq(pushSubscription.userId, actor.userId));
    await tx.delete(partyAlias).where(eq(partyAlias.ownerUserId, actor.userId));
    await tx.delete(assistantThread).where(eq(assistantThread.userId, actor.userId));

    await tx.delete(user).where(eq(user.id, actor.userId));
  });
}
