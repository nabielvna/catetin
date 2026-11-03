import "server-only";

import { and, eq, inArray, sql } from "drizzle-orm";

import type { DbOrTx, Tx } from "@/database/client";
import { db } from "@/database/client";
import { approvalRequest } from "@/database/schema/approvals";
import { settlement, settlementAllocation } from "@/database/schema/payments";
import { party } from "@/database/schema/people";
import { todayIn } from "@/domain/dates";
import { DomainError } from "@/domain/errors";
import type { Currency } from "@/domain/money";
import { currentTransferCount, fingerprint, netBalances, simplifyTransfers, type Transfer } from "@/domain/simplify";
import { messagesFor } from "@/i18n/messages";
import { newId } from "@/lib/server/ids";
import { recordActivity } from "@/services/activity";
import { openRequest } from "@/services/approvals/mutations";
import type { Actor, Ctx } from "@/services/context";
import { createObligationTx } from "@/services/debts/mutations";
import { type Effects } from "@/services/effects";
import { lockGroup, requireMembership } from "@/services/groups/access";
import { notifyParties, refreshScope } from "@/services/notifications/parties";
import { applyAllocations } from "@/services/payments/allocations";
import { ensurePair, isActiveUser, lockPairs, orderPair } from "@/services/people/parties";
import { mutate } from "@/services/transaction";

type OpenRow = {
  id: string;
  pairId: string;
  creditorId: string;
  debtorId: string;
  remaining: number;
  reserved: number;
};

async function openInGroup(tx: DbOrTx, groupId: string, currency: Currency): Promise<OpenRow[]> {
  const rows = await tx.execute<{
    id: string;
    pair_id: string;
    creditor_id: string;
    debtor_id: string;
    remaining: string;
    reserved: string;
  }>(sql`
    select o.id, o.pair_id, o.creditor_id, o.debtor_id, (o.amount - o.paid) as remaining,
      coalesce((select sum(sa.amount) from settlement_allocation sa join settlement s on s.id = sa.settlement_id
        where sa.obligation_id = o.id and s.status = 'PENDING'), 0) as reserved
    from obligation o
    where o.group_id = ${groupId} and o.currency = ${currency} and o.status = 'ACTIVE' and o.paid < o.amount`);
  return rows.map((r) => ({
    id: r.id,
    pairId: r.pair_id,
    creditorId: r.creditor_id,
    debtorId: r.debtor_id,
    remaining: Number(r.remaining),
    reserved: Number(r.reserved),
  }));
}

export type SimplifyPreview = {
  currency: Currency;
  current: number;
  simplified: number;
  transfers: Array<{ from: string; to: string; fromName: string; toName: string; amount: number }>;
  blockedByPending: boolean;
  pendingRequestId: string | null;
  pendingIsMine: boolean;
};

export async function simplifyPreview(actor: Actor, groupId: string): Promise<SimplifyPreview[]> {
  await requireMembership(db, groupId, actor.partyId);
  const currencies = await db.execute<{ currency: Currency }>(sql`
    select distinct currency from obligation where group_id = ${groupId} and status = 'ACTIVE' and paid < amount`);
  const out: SimplifyPreview[] = [];
  for (const { currency } of currencies) {
    const open = await openInGroup(db, groupId, currency);
    const transfers = simplifyTransfers(netBalances(open));
    const ids = [...new Set(transfers.flatMap((t) => [t.from, t.to]))];
    const names = ids.length
      ? await db.execute<{ id: string; name: string }>(sql`
          select p.id, coalesce((select name from party_alias where owner_user_id = ${actor.userId} and party_id = p.id), p.display_name) as name
          from party p where p.id in ${ids}`)
      : [];
    const nm = new Map(names.map((n) => [n.id, n.name]));
    const [pending] = await db
      .select({ id: approvalRequest.id, by: approvalRequest.requestedByParty })
      .from(approvalRequest)
      .where(
        and(
          eq(approvalRequest.targetType, "GROUP_SIMPLIFY"),
          eq(approvalRequest.targetId, groupId),
          eq(approvalRequest.status, "PENDING"),
          sql`${approvalRequest.payload}->>'currency' = ${currency}`,
        ),
      );
    out.push({
      currency,
      current: currentTransferCount(open),
      simplified: transfers.length,
      transfers: transfers.map((t) => ({ ...t, fromName: nm.get(t.from) ?? "?", toName: nm.get(t.to) ?? "?" })),
      blockedByPending: open.some((o) => o.reserved > 0),
      pendingRequestId: pending?.id ?? null,
      pendingIsMine: pending?.by === actor.partyId,
    });
  }
  return out;
}

export function proposeSimplify(ctx: Ctx, input: { groupId: string; currency: Currency }) {
  return mutate(async (tx, fx) => {
    const group = await lockGroup(tx, input.groupId);
    await requireMembership(tx, group.id, ctx.actor.partyId);
    const [already] = await tx
      .select({ id: approvalRequest.id })
      .from(approvalRequest)
      .where(
        and(
          eq(approvalRequest.targetType, "GROUP_SIMPLIFY"),
          eq(approvalRequest.targetId, group.id),
          eq(approvalRequest.status, "PENDING"),
        ),
      );
    if (already) throw new DomainError("CHANGE_PENDING");
    const open = await openInGroup(tx, group.id, input.currency);
    if (open.some((o) => o.reserved > 0)) throw new DomainError("CHANGE_PENDING");
    const transfers = simplifyTransfers(netBalances(open));
    if (transfers.length >= currentTransferCount(open)) throw new DomainError("INVALID_STATE");
    const affected = [...new Set(open.flatMap((o) => [o.creditorId, o.debtorId]))];
    const parties = await tx.select().from(party).where(inArray(party.id, affected));
    const approvers = parties.filter((p) => isActiveUser(p) && p.id !== ctx.actor.partyId).map((p) => p.id);
    const payload = { currency: input.currency, fingerprint: fingerprint(open), transfers };
    if (approvers.length === 0) {
      await executeSimplify(tx, fx, ctx, group.id, group.name, input.currency, payload.fingerprint);
      return { status: "APPLIED" as const };
    }
    await openRequest(tx, ctx, {
      kind: "GROUP_SIMPLIFY",
      groupId: group.id,
      targetType: "GROUP_SIMPLIFY",
      targetId: group.id,
      payload,
      approvers,
    });
    await recordActivity(tx, ctx, {
      type: "GROUP_SIMPLIFY_PROPOSED",
      groupId: group.id,
      data: { currency: input.currency, count: transfers.length },
    });
    await notifyParties(tx, fx, ctx, {
      type: "GROUP_SIMPLIFY_PROPOSED",
      partyIds: approvers,
      url: `/groups/${group.id}`,
      groupName: group.name,
      data: { count: transfers.length },
    });
    await refreshScope(tx, fx, { partyIds: affected, groupId: group.id });
    return { status: "PROPOSED" as const };
  });
}

export async function executeSimplify(
  tx: Tx,
  fx: Effects,
  ctx: Ctx,
  groupId: string,
  groupName: string,
  currency: Currency,
  expectedFingerprint: string,
): Promise<boolean> {
  const open0 = await openInGroup(tx, groupId, currency);
  const transfers0 = simplifyTransfers(netBalances(open0));
  const pairIds = [...new Set(open0.map((o) => o.pairId))];
  const newPairs: string[] = [];
  for (const t of transfers0) newPairs.push((await ensurePair(tx, t.from, t.to)).id);
  await lockPairs(tx, [...pairIds, ...newPairs]);
  const open = await openInGroup(tx, groupId, currency);
  if (fingerprint(open) !== expectedFingerprint || open.some((o) => o.reserved > 0)) return false;
  const transfers: Transfer[] = simplifyTransfers(netBalances(open));
  const today = todayIn(ctx.actor.timezone, ctx.now);

  const buckets = new Map<string, OpenRow[]>();
  for (const o of open) {
    const key = `${o.pairId}|${o.debtorId}|${o.creditorId}`;
    buckets.set(key, [...(buckets.get(key) ?? []), o]);
  }
  for (const rows of buckets.values()) {
    const first = rows[0]!;
    const id = newId();
    const amount = rows.reduce((s, r) => s + r.remaining, 0);
    await tx
      .insert(settlement)
      .values({
        id,
        pairId: first.pairId,
        kind: "NETTING",
        payerId: first.debtorId,
        payeeId: first.creditorId,
        amount,
        currency,
        paidOn: today,
        status: "ACTIVE",
        groupId,
        createdBy: ctx.actor.userId,
        createdVia: "SIMPLIFY",
        createdAt: ctx.now,
        activatedAt: ctx.now,
      });
    const allocations = rows.map((r) => ({ obligationId: r.id, amount: r.remaining }));
    await tx.insert(settlementAllocation).values(allocations.map((a) => ({ settlementId: id, ...a })));
    await applyAllocations(tx, allocations, ctx.now);
  }

  const title = messagesFor(ctx.actor.locale).simplify.debtTitle.replace("{group}", groupName);
  const simplifyCtx: Ctx = { ...ctx, via: "SIMPLIFY" };
  for (const t of transfers) {
    orderPair(t.from, t.to);
    await createObligationTx(
      tx,
      fx,
      simplifyCtx,
      {
        id: newId(),
        creditorId: t.to,
        debtorId: t.from,
        amount: t.amount,
        currency,
        title,
        category: "SHARED",
        occurredOn: today,
        groupId,
      },
      { trustedRelation: true, silent: true, preApproved: true },
    );
  }
  await recordActivity(tx, ctx, {
    type: "GROUP_SIMPLIFIED",
    groupId,
    data: { currency, before: currentTransferCount(open), after: transfers.length },
  });
  await refreshScope(tx, fx, { partyIds: [...new Set(open.flatMap((o) => [o.creditorId, o.debtorId]))], groupId });
  return true;
}
