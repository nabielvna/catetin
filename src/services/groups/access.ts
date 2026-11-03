import "server-only";

import { and, eq } from "drizzle-orm";

import type { DbOrTx, Tx } from "@/database/client";
import { groupMember, groups, party } from "@/database/schema/index";
import { DomainError } from "@/domain/errors";

export type GroupRow = typeof groups.$inferSelect;
export type MemberRow = typeof groupMember.$inferSelect;

export async function getGroup(tx: DbOrTx, id: string): Promise<GroupRow> {
  const [row] = await tx.select().from(groups).where(eq(groups.id, id));
  if (!row) throw new DomainError("NOT_FOUND");
  return row;
}

export async function lockGroup(tx: Tx, id: string): Promise<GroupRow> {
  const [row] = await tx.select().from(groups).where(eq(groups.id, id)).for("update");
  if (!row) throw new DomainError("NOT_FOUND");
  return row;
}

export async function getMember(tx: DbOrTx, groupId: string, partyId: string): Promise<MemberRow | undefined> {
  const [row] = await tx
    .select()
    .from(groupMember)
    .where(and(eq(groupMember.groupId, groupId), eq(groupMember.partyId, partyId)));
  return row;
}

export async function requireMembership(
  tx: DbOrTx,
  groupId: string,
  partyId: string,
): Promise<{ group: GroupRow; member: MemberRow }> {
  const group = await getGroup(tx, groupId);
  const member = await getMember(tx, groupId, partyId);
  if (!member || member.status !== "ACTIVE") throw new DomainError("NOT_FOUND");
  return { group, member };
}

export async function requireAdmin(tx: DbOrTx, groupId: string, partyId: string) {
  const r = await requireMembership(tx, groupId, partyId);
  if (r.member.role !== "ADMIN") throw new DomainError("FORBIDDEN_ROLE");
  return r;
}

export async function activeMembers(tx: DbOrTx, groupId: string): Promise<MemberRow[]> {
  return tx
    .select()
    .from(groupMember)
    .where(and(eq(groupMember.groupId, groupId), eq(groupMember.status, "ACTIVE")));
}

export async function activeGroupMemberUserIds(tx: DbOrTx, groupId: string): Promise<string[]> {
  const rows = await tx
    .select({ userId: party.userId })
    .from(groupMember)
    .innerJoin(party, eq(party.id, groupMember.partyId))
    .where(and(eq(groupMember.groupId, groupId), eq(groupMember.status, "ACTIVE")));
  return rows.flatMap((r) => (r.userId ? [r.userId] : []));
}

export async function isActiveMember(tx: DbOrTx, groupId: string, partyId: string) {
  const [row] = await tx
    .select({ status: groupMember.status })
    .from(groupMember)
    .where(and(eq(groupMember.groupId, groupId), eq(groupMember.partyId, partyId)));
  return row?.status === "ACTIVE";
}
