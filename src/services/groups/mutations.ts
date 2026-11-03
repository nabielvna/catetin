import "server-only";

import { and, eq, inArray, lt, or, sql } from "drizzle-orm";

import type { DbOrTx, Tx } from "@/database/client";
import { groupMember, groups, obligation, party } from "@/database/schema/index";
import { DomainError } from "@/domain/errors";
import { type Currency, isCurrency } from "@/domain/money";
import { normalizeName } from "@/domain/people";
import { recordActivity } from "@/services/activity";
import { openRequest, pendingRequestFor } from "@/services/approvals/mutations";
import type { Ctx } from "@/services/context";
import {
  activeMembers,
  getMember,
  type GroupRow,
  lockGroup,
  requireAdmin,
  requireMembership,
} from "@/services/groups/access";
import { notifyParties, refreshScope } from "@/services/notifications/parties";
import { assertNotBlocked } from "@/services/people/blocks";
import { canSeeParty, getParty, isActiveUser, resolvePartyId } from "@/services/people/parties";
import { type Effects, mutate } from "@/services/transaction";

export const GROUP_NAME_MAX = 60;

function normalizeGroupName(name: string) {
  const n = name.replace(/\s+/g, " ").trim();
  if (!n || n.length > GROUP_NAME_MAX) throw new DomainError("INVALID_INPUT", { field: "name" });
  return n;
}

const url = (id: string) => `/groups/${id}`;

export async function memberOpenBalance(tx: DbOrTx, groupId: string, partyId: string) {
  const rows = await tx
    .select({
      currency: obligation.currency,
      net: sql<string>`sum(case when ${obligation.creditorId} = ${partyId} then ${obligation.amount} - ${obligation.paid} else -(${obligation.amount} - ${obligation.paid}) end)`,
      open: sql<number>`count(*)::int`,
    })
    .from(obligation)
    .where(
      and(
        eq(obligation.groupId, groupId),
        inArray(obligation.status, ["ACTIVE", "PENDING"]),
        lt(obligation.paid, obligation.amount),
        or(eq(obligation.creditorId, partyId), eq(obligation.debtorId, partyId)),
      ),
    )
    .groupBy(obligation.currency);
  return rows.map((r) => ({ currency: r.currency as Currency, net: Number(r.net), open: r.open }));
}

async function assertZeroBalance(tx: DbOrTx, groupId: string, partyId: string) {
  const rows = await memberOpenBalance(tx, groupId, partyId);
  if (rows.some((r) => r.open > 0)) throw new DomainError("GROUP_BALANCE_NOT_ZERO");
}

export type CreateGroupInput = {
  id: string;
  name: string;
  mode?: "CONFIRM" | "TRUST";
  currency?: Currency;

  memberIds?: string[];

  newManual?: Array<{ id: string; name: string }>;
};

export function createGroup(ctx: Ctx, input: CreateGroupInput): Promise<{ id: string }> {
  return mutate(async (tx, fx) => {
    const name = normalizeGroupName(input.name);
    const currency = input.currency ?? ctx.actor.currency;
    if (!isCurrency(currency)) throw new DomainError("INVALID_INPUT", { field: "currency" });
    const [existing] = await tx.select().from(groups).where(eq(groups.id, input.id));
    if (existing) {
      if (existing.createdBy !== ctx.actor.userId) throw new DomainError("INVALID_INPUT");
      return { id: existing.id };
    }
    await tx
      .insert(groups)
      .values({
        id: input.id,
        name,
        mode: input.mode ?? "CONFIRM",
        trustSince: input.mode === "TRUST" ? ctx.now : null,
        currency,
        createdBy: ctx.actor.userId,
        createdAt: ctx.now,
        lastActivityAt: ctx.now,
      });
    await tx
      .insert(groupMember)
      .values({
        groupId: input.id,
        partyId: ctx.actor.partyId,
        role: "ADMIN",
        status: "ACTIVE",
        invitedBy: ctx.actor.userId,
        joinedAt: ctx.now,
      });
    await recordActivity(tx, ctx, {
      type: "GROUP_CREATED",
      groupId: input.id,
      targetType: "GROUP",
      targetId: input.id,
      data: { name },
    });
    const group = (await tx.select().from(groups).where(eq(groups.id, input.id)))[0]!;
    await addMembersTx(tx, fx, ctx, group, input.memberIds ?? [], input.newManual ?? []);
    fx.refreshUsers([ctx.actor.userId], { scope: "group", groupId: input.id });
    return { id: input.id };
  });
}

async function addMembersTx(
  tx: Tx,
  fx: Effects,
  ctx: Ctx,
  group: GroupRow,
  memberIds: string[],
  newManual: Array<{ id: string; name: string }>,
) {
  const inviter = await getMember(tx, group.id, ctx.actor.partyId);
  if (inviter?.status !== "ACTIVE") throw new DomainError("NOT_FOUND");

  for (const m of newManual) {
    const nm = normalizeName(m.name);
    await tx
      .insert(party)
      .values({
        id: m.id,
        kind: "MANUAL",
        displayName: nm,
        ownerUserId: ctx.actor.userId,
        groupId: group.id,
        createdAt: ctx.now,
        updatedAt: ctx.now,
      })
      .onConflictDoNothing();
    const p = await getParty(tx, m.id);
    if (p.ownerUserId !== ctx.actor.userId) throw new DomainError("INVALID_INPUT");
    memberIds.push(m.id);
  }

  const invitedUsers: string[] = [];
  for (const raw of [...new Set(memberIds)]) {
    const pid = await resolvePartyId(tx, raw);
    if (pid === ctx.actor.partyId) continue;
    if (!(await canSeeParty(tx, ctx.actor, pid))) throw new DomainError("NOT_FOUND");
    await assertNotBlocked(tx, ctx.actor.partyId, [pid]);
    const p = await getParty(tx, pid);
    const existing = await getMember(tx, group.id, pid);
    if (existing && ["ACTIVE", "PENDING", "INVITED"].includes(existing.status)) continue;

    const status = isActiveUser(p) ? "INVITED" : inviter.role === "ADMIN" ? "ACTIVE" : "PENDING";
    await tx
      .insert(groupMember)
      .values({
        groupId: group.id,
        partyId: pid,
        role: "MEMBER",
        status,
        invitedBy: ctx.actor.userId,
        joinedAt: ctx.now,
        leftAt: null,
      })
      .onConflictDoUpdate({
        target: [groupMember.groupId, groupMember.partyId],
        set: { status, role: "MEMBER", invitedBy: ctx.actor.userId, joinedAt: ctx.now, leftAt: null },
      });
    if (p.kind === "MANUAL" && !p.groupId) {
      await tx.update(party).set({ groupId: group.id }).where(eq(party.id, pid));
    }
    if (status === "INVITED") invitedUsers.push(pid);
    if (status === "PENDING") {
      const admins = (await activeMembers(tx, group.id)).filter((x) => x.role === "ADMIN").map((x) => x.partyId);
      await openRequest(tx, ctx, {
        kind: "GROUP_JOIN",
        groupId: group.id,
        targetType: "GROUP_MEMBER",
        targetId: pid,
        payload: { partyId: pid },
        approvers: admins,
        quorum: "ANY",
      });
      await notifyParties(tx, fx, ctx, {
        type: "GROUP_JOIN_REQUESTED",
        partyIds: admins,
        url: url(group.id),
        groupName: group.name,
      });
    }
    await recordActivity(tx, ctx, {
      type: status === "INVITED" ? "GROUP_MEMBER_INVITED" : "GROUP_MEMBER_ADDED",
      groupId: group.id,
      targetType: "PARTY",
      targetId: pid,
    });
  }
  if (invitedUsers.length) {
    await notifyParties(tx, fx, ctx, {
      type: "GROUP_ADDED",
      partyIds: invitedUsers,
      url: url(group.id),
      groupName: group.name,
      data: { mode: group.mode },
    });
  }
  await refreshScope(tx, fx, { partyIds: invitedUsers, groupId: group.id });
}

export function addMembers(
  ctx: Ctx,
  input: { groupId: string; memberIds?: string[]; newManual?: Array<{ id: string; name: string }> },
) {
  return mutate(async (tx, fx) => {
    const group = await lockGroup(tx, input.groupId);
    if (group.archivedAt) throw new DomainError("INVALID_STATE");
    await addMembersTx(tx, fx, ctx, group, input.memberIds ?? [], input.newManual ?? []);
  });
}

export async function joinGroupTx(
  tx: Tx,
  fx: Effects,
  ctx: Ctx,
  group: GroupRow,
  invitedByUserId: string | null,
): Promise<"ACTIVE" | "PENDING"> {
  const me = ctx.actor.partyId;
  const existing = await getMember(tx, group.id, me);
  if (existing?.status === "ACTIVE" || existing?.status === "PENDING") return existing.status;

  let inviterIsAdmin = false;
  if (invitedByUserId) {
    const [inv] = await tx
      .select({ role: groupMember.role, status: groupMember.status })
      .from(groupMember)
      .innerJoin(party, eq(party.id, groupMember.partyId))
      .where(and(eq(groupMember.groupId, group.id), eq(party.userId, invitedByUserId)));
    inviterIsAdmin = inv?.role === "ADMIN" && inv.status === "ACTIVE";
  }
  const status = inviterIsAdmin ? "ACTIVE" : "PENDING";
  await tx
    .insert(groupMember)
    .values({ groupId: group.id, partyId: me, role: "MEMBER", status, invitedBy: invitedByUserId, joinedAt: ctx.now })
    .onConflictDoUpdate({
      target: [groupMember.groupId, groupMember.partyId],
      set: { status, joinedAt: ctx.now, leftAt: null },
    });

  if (status === "PENDING") {
    const admins = (await activeMembers(tx, group.id)).filter((m) => m.role === "ADMIN").map((m) => m.partyId);
    await openRequest(tx, ctx, {
      kind: "GROUP_JOIN",
      groupId: group.id,
      targetType: "GROUP_MEMBER",
      targetId: me,
      payload: { partyId: me },
      approvers: admins,
      quorum: "ANY",
    });
    await notifyParties(tx, fx, ctx, {
      type: "GROUP_JOIN_REQUESTED",
      partyIds: admins,
      url: url(group.id),
      groupName: group.name,
    });
  }
  await recordActivity(tx, ctx, {
    type: status === "ACTIVE" ? "GROUP_MEMBER_JOINED" : "GROUP_JOIN_REQUESTED",
    groupId: group.id,
    targetType: "PARTY",
    targetId: me,
  });
  await refreshScope(tx, fx, { partyIds: [me], groupId: group.id });
  return status;
}

export function respondGroupInvite(ctx: Ctx, input: { groupId: string; accept: boolean }) {
  return mutate(async (tx, fx) => {
    const group = await lockGroup(tx, input.groupId);
    const m = await getMember(tx, group.id, ctx.actor.partyId);
    if (!m || m.status !== "INVITED") throw new DomainError("NOT_FOUND");
    if (!input.accept) {
      await tx
        .update(groupMember)
        .set({ status: "REMOVED", leftAt: ctx.now })
        .where(and(eq(groupMember.groupId, group.id), eq(groupMember.partyId, ctx.actor.partyId)));
      await recordActivity(tx, ctx, { type: "GROUP_INVITE_DECLINED", groupId: group.id });
      return { status: "DECLINED" as const };
    }
    return { status: await joinGroupTx(tx, fx, ctx, group, m.invitedBy) };
  });
}

export function renameGroup(ctx: Ctx, input: { groupId: string; name: string }) {
  return mutate(async (tx, fx) => {
    const name = normalizeGroupName(input.name);
    await lockGroup(tx, input.groupId);
    await requireAdmin(tx, input.groupId, ctx.actor.partyId);
    await tx.update(groups).set({ name }).where(eq(groups.id, input.groupId));
    await recordActivity(tx, ctx, { type: "GROUP_RENAMED", groupId: input.groupId, data: { name } });
    await refreshScope(tx, fx, { partyIds: [], groupId: input.groupId });
  });
}

export function setMemberRole(ctx: Ctx, input: { groupId: string; partyId: string; role: "ADMIN" | "MEMBER" }) {
  return mutate(async (tx, fx) => {
    await lockGroup(tx, input.groupId);
    await requireAdmin(tx, input.groupId, ctx.actor.partyId);
    const target = await getMember(tx, input.groupId, input.partyId);
    if (!target || target.status !== "ACTIVE") throw new DomainError("NOT_FOUND");
    if (input.role === "ADMIN") {
      const p = await getParty(tx, input.partyId);
      if (!isActiveUser(p)) throw new DomainError("INVALID_STATE");
    } else {
      const admins = (await activeMembers(tx, input.groupId)).filter((m) => m.role === "ADMIN");
      if (admins.length <= 1 && target.role === "ADMIN") throw new DomainError("LAST_ADMIN");
    }
    await tx
      .update(groupMember)
      .set({ role: input.role })
      .where(and(eq(groupMember.groupId, input.groupId), eq(groupMember.partyId, input.partyId)));
    await recordActivity(tx, ctx, {
      type: "GROUP_ROLE_CHANGED",
      groupId: input.groupId,
      targetType: "PARTY",
      targetId: input.partyId,
      data: { role: input.role },
    });
    await refreshScope(tx, fx, { partyIds: [input.partyId], groupId: input.groupId });
  });
}

export function removeMember(ctx: Ctx, input: { groupId: string; partyId: string }) {
  return mutate(async (tx, fx) => {
    await lockGroup(tx, input.groupId);
    await requireAdmin(tx, input.groupId, ctx.actor.partyId);
    if (input.partyId === ctx.actor.partyId) throw new DomainError("INVALID_INPUT");
    const target = await getMember(tx, input.groupId, input.partyId);
    if (!target || !["ACTIVE", "INVITED", "PENDING"].includes(target.status)) throw new DomainError("NOT_FOUND");
    await assertZeroBalance(tx, input.groupId, input.partyId);
    await tx
      .update(groupMember)
      .set({ status: "REMOVED", leftAt: ctx.now, role: "MEMBER" })
      .where(and(eq(groupMember.groupId, input.groupId), eq(groupMember.partyId, input.partyId)));
    await recordActivity(tx, ctx, {
      type: "GROUP_MEMBER_REMOVED",
      groupId: input.groupId,
      targetType: "PARTY",
      targetId: input.partyId,
    });
    await refreshScope(tx, fx, { partyIds: [input.partyId], groupId: input.groupId });
  });
}

export function leaveGroup(ctx: Ctx, input: { groupId: string }) {
  return mutate(async (tx, fx) => {
    await lockGroup(tx, input.groupId);
    const { member } = await requireMembership(tx, input.groupId, ctx.actor.partyId);
    await assertZeroBalance(tx, input.groupId, ctx.actor.partyId);
    const others = (await activeMembers(tx, input.groupId)).filter((m) => m.partyId !== ctx.actor.partyId);
    if (member.role === "ADMIN" && others.length > 0 && !others.some((m) => m.role === "ADMIN")) {
      throw new DomainError("LAST_ADMIN");
    }
    await tx
      .update(groupMember)
      .set({ status: "LEFT", leftAt: ctx.now, role: "MEMBER" })
      .where(and(eq(groupMember.groupId, input.groupId), eq(groupMember.partyId, ctx.actor.partyId)));
    await recordActivity(tx, ctx, { type: "GROUP_MEMBER_LEFT", groupId: input.groupId });
    await refreshScope(tx, fx, { partyIds: [ctx.actor.partyId], groupId: input.groupId });
  });
}

export function proposeModeChange(ctx: Ctx, input: { groupId: string; mode: "CONFIRM" | "TRUST" }) {
  return mutate(async (tx, fx) => {
    const group = await lockGroup(tx, input.groupId);
    await requireAdmin(tx, input.groupId, ctx.actor.partyId);
    if (group.mode === input.mode) return { status: "UNCHANGED" as const };
    if (await pendingRequestFor(tx, "GROUP", group.id)) throw new DomainError("CHANGE_PENDING");
    const members = await activeMembers(tx, group.id);
    const parties = await tx
      .select()
      .from(party)
      .where(
        inArray(
          party.id,
          members.map((m) => m.partyId),
        ),
      );
    const approvers = parties.filter((p) => isActiveUser(p) && p.id !== ctx.actor.partyId).map((p) => p.id);
    if (approvers.length === 0) {
      await tx
        .update(groups)
        .set({ mode: input.mode, trustSince: input.mode === "TRUST" ? ctx.now : null })
        .where(eq(groups.id, group.id));
      await recordActivity(tx, ctx, { type: "GROUP_MODE_APPROVED", groupId: group.id, data: { mode: input.mode } });
      await refreshScope(tx, fx, { partyIds: [], groupId: group.id });
      return { status: "APPLIED" as const };
    }
    await openRequest(tx, ctx, {
      kind: "GROUP_MODE",
      groupId: group.id,
      targetType: "GROUP",
      targetId: group.id,
      payload: { mode: input.mode, from: group.mode },
      approvers,
    });
    await recordActivity(tx, ctx, { type: "GROUP_MODE_PROPOSED", groupId: group.id, data: { mode: input.mode } });
    await notifyParties(tx, fx, ctx, {
      type: "GROUP_MODE_PROPOSED",
      partyIds: approvers,
      url: url(group.id),
      groupName: group.name,
      data: { mode: input.mode },
    });
    await refreshScope(tx, fx, { partyIds: [], groupId: group.id });
    return { status: "PROPOSED" as const };
  });
}

export function archiveGroup(ctx: Ctx, input: { groupId: string }) {
  return mutate(async (tx, fx) => {
    await lockGroup(tx, input.groupId);
    await requireAdmin(tx, input.groupId, ctx.actor.partyId);
    const [open] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(obligation)
      .where(
        and(
          eq(obligation.groupId, input.groupId),
          inArray(obligation.status, ["ACTIVE", "PENDING"]),
          lt(obligation.paid, obligation.amount),
        ),
      );
    if ((open?.n ?? 0) > 0) throw new DomainError("GROUP_BALANCE_NOT_ZERO");
    await tx.update(groups).set({ archivedAt: ctx.now }).where(eq(groups.id, input.groupId));
    await recordActivity(tx, ctx, { type: "GROUP_ARCHIVED", groupId: input.groupId });
    await refreshScope(tx, fx, { partyIds: [], groupId: input.groupId });
  });
}
