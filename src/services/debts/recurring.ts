import "server-only";

import { and, eq, inArray, sql } from "drizzle-orm";

import { type DbOrTx, type Tx } from "@/database/client";
import { obligation, recurring } from "@/database/schema/debts";
import { type LocalDate, todayIn } from "@/domain/dates";
import { isCategory, NOTE_MAX, TITLE_MAX } from "@/domain/debt";
import { DomainError } from "@/domain/errors";
import { assertValidAmount, type Currency, isCurrency, type Minor } from "@/domain/money";
import { requiredApprovers } from "@/domain/policy";
import { assertValidRecurring, dueFor, dueOccurrences, occurrenceOn, type RecurringPeriod } from "@/domain/recurring";
import { newId } from "@/lib/server/ids";
import { loadActor } from "@/services/account/profile";
import { recordActivity } from "@/services/activity";
import { closeRequest, openRequest, pendingRequestFor } from "@/services/approvals/mutations";
import { type Ctx, ctxFor } from "@/services/context";
import { createObligationTx } from "@/services/debts/mutations";
import { type Effects } from "@/services/effects";
import { getGroup, getMember } from "@/services/groups/access";
import { notifyParties, refreshScope } from "@/services/notifications/parties";
import { assertNotBlocked, blockersOf } from "@/services/people/blocks";
import { canSeeParty, ensurePair, getParties, isActiveUser, lockPair, resolvePartyId } from "@/services/people/parties";
import { recordTrustActions, trustSinceOf } from "@/services/people/trust";
import { mutate } from "@/services/transaction";

export type RecurringRow = typeof recurring.$inferSelect;

export type CreateRecurringInput = {
  id: string;
  creditorId: string;
  debtorId: string;
  amount: Minor;
  currency: Currency;
  title: string;
  note?: string | null;
  category?: string | null;
  every: RecurringPeriod;
  startOn: LocalDate;
  dueAfterDays?: number | null;
  groupId?: string | null;
};

export function createRecurring(ctx: Ctx, input: CreateRecurringInput): Promise<{ id: string; status: string }> {
  return mutate(async (tx, fx) => {
    assertValidAmount(input.amount);
    assertValidRecurring(input);
    if (!isCurrency(input.currency)) throw new DomainError("INVALID_INPUT", { field: "currency" });
    const title = input.title.trim();
    if (!title || title.length > TITLE_MAX) throw new DomainError("INVALID_INPUT", { field: "title" });
    if (input.note && input.note.length > NOTE_MAX) throw new DomainError("INVALID_INPUT", { field: "note" });
    if (input.category && !isCategory(input.category)) throw new DomainError("INVALID_INPUT", { field: "category" });

    const [existing] = await tx.select().from(recurring).where(eq(recurring.id, input.id));
    if (existing) {
      if (existing.createdBy !== ctx.actor.userId) throw new DomainError("INVALID_INPUT");
      return { id: existing.id, status: existing.status };
    }

    const me = ctx.actor.partyId;
    const creditorId = await resolvePartyId(tx, input.creditorId);
    const debtorId = await resolvePartyId(tx, input.debtorId);
    if (creditorId === debtorId) throw new DomainError("SELF_PAIR");

    if (me !== creditorId && me !== debtorId) throw new DomainError("FORBIDDEN_ROLE");
    const other = me === creditorId ? debtorId : creditorId;
    if (!(await canSeeParty(tx, ctx.actor, other))) throw new DomainError("NOT_FOUND");
    await assertNotBlocked(tx, me, [other]);

    const group = input.groupId ? await getGroup(tx, input.groupId) : null;
    if (group) {
      if (group.archivedAt) throw new DomainError("INVALID_STATE");
      for (const pid of [creditorId, debtorId]) {
        if ((await getMember(tx, group.id, pid))?.status !== "ACTIVE") throw new DomainError("NOT_GROUP_MEMBER");
      }
    }

    const parties = await getParties(tx, [creditorId, debtorId]);
    const pairRow = await lockPair(tx, (await ensurePair(tx, creditorId, debtorId)).id);
    const { approvers, trusted } = requiredApprovers({
      action: { kind: "RECURRING_CREATE" },
      actorPartyId: me,
      creditor: { id: creditorId, isUser: isActiveUser(parties.get(creditorId)!) },
      debtor: { id: debtorId, isUser: isActiveUser(parties.get(debtorId)!) },
      groupMode: group?.mode ?? null,
      groupTrustSince: group?.trustSince ?? null,
      trustSince: trustSinceOf(pairRow),
    });
    const status = approvers.length > 0 ? "PENDING" : "ACTIVE";

    const [row] = await tx
      .insert(recurring)
      .values({
        id: input.id,
        pairId: pairRow.id,
        creditorId,
        debtorId,
        groupId: group?.id ?? null,
        amount: input.amount,
        currency: input.currency,
        title,
        note: input.note?.trim() || null,
        category: input.category ?? null,
        every: input.every,
        startOn: input.startOn,
        nextOn: input.startOn,
        dueAfterDays: input.dueAfterDays ?? null,
        timezone: ctx.actor.timezone,
        status,
        createdBy: ctx.actor.userId,
        createdVia: ctx.via,
        createdAt: ctx.now,
      })
      .returning();

    const display = { title, amount: input.amount, currency: input.currency };
    const activityId = await recordActivity(tx, ctx, {
      type: status === "PENDING" ? "RECURRING_PROPOSED" : "RECURRING_STARTED",
      pairId: pairRow.id,
      groupId: group?.id,
      targetType: "PARTY",
      targetId: other,
      data: { ...display, every: input.every, recurringId: input.id },
    });
    if (status === "PENDING") {
      await openRequest(tx, ctx, {
        kind: "RECURRING_CREATE",
        pairId: pairRow.id,
        groupId: group?.id,
        targetType: "RECURRING",
        targetId: input.id,
        approvers,
      });
      await notifyParties(tx, fx, ctx, {
        type: "RECURRING_PROPOSED",
        partyIds: approvers,
        activityId,
        url: "/inbox",
        data: { ...display, mode: input.every },
      });
    } else {
      await notifyParties(tx, fx, ctx, {
        type: "RECURRING_STARTED",
        partyIds: [other].filter((p) => !trusted.includes(p)),
        activityId,
        url: `/people/${me}`,
        data: { ...display, mode: input.every },
      });
      await recordTrustActions(tx, fx, ctx, {
        pairId: pairRow.id,
        kind: "RECURRING_CREATE",
        targetType: "RECURRING",
        targetId: input.id,
        trusted,
        display,
        url: `/people/${me}`,
      });
      await generateDueTx(tx, fx, row!, ctx.now);
    }
    await refreshScope(tx, fx, { partyIds: [creditorId, debtorId], groupId: group?.id, pairId: pairRow.id });
    return { id: input.id, status };
  });
}

export async function generateDueTx(tx: Tx, fx: Effects, rec0: RecurringRow, now: Date): Promise<number> {
  await lockPair(tx, rec0.pairId);
  const [rec] = await tx.select().from(recurring).where(eq(recurring.id, rec0.id)).for("update");
  if (!rec || rec.status !== "ACTIVE") return 0;

  const today = todayIn(rec.timezone, now);
  const { indexes, next } = dueOccurrences(rec.startOn, rec.every as RecurringPeriod, rec.occurrences, today);
  if (next === rec.occurrences) return 0;

  const stop = async (reason: string) => {
    await tx.update(recurring).set({ status: "STOPPED", stoppedAt: now }).where(eq(recurring.id, rec.id));
    await recordActivity(tx, null, {
      type: "RECURRING_STOPPED",
      pairId: rec.pairId,
      groupId: rec.groupId,
      data: { recurringId: rec.id, title: rec.title, reason },
    });
  };

  const actor = rec.createdBy ? await loadActor(rec.createdBy, tx) : null;
  if (!actor) {
    await stop("CREATOR_GONE");
    return 0;
  }
  const other = actor.partyId === rec.creditorId ? rec.debtorId : rec.creditorId;
  if ((await blockersOf(tx, actor.partyId, [other])).length > 0) {
    await stop("BLOCKED");
    return 0;
  }

  let groupId = rec.groupId;
  if (groupId) {
    const g = await getGroup(tx, groupId);
    if (g.archivedAt || (await getMember(tx, groupId, actor.partyId))?.status !== "ACTIVE") groupId = null;
  }

  const ctx = ctxFor(actor, { now });
  let created = 0;
  for (const n of indexes) {
    const on = occurrenceOn(rec.startOn, rec.every as RecurringPeriod, n);
    const id = newId();
    await createObligationTx(
      tx,
      fx,
      ctx,
      {
        id,
        creditorId: rec.creditorId,
        debtorId: rec.debtorId,
        amount: rec.amount,
        currency: rec.currency as Currency,
        title: rec.title,
        note: rec.note,
        category: rec.category,
        occurredOn: on,
        dueOn: dueFor(on, rec.dueAfterDays),
        groupId,
      },
      { recurringId: rec.id, trustedRelation: true, silent: true },
    );
    await notifyParties(tx, fx, null, {
      type: "RECURRING_CREATED",
      partyIds: [rec.creditorId, rec.debtorId],
      url: `/debts/${id}`,
      data: { title: rec.title, amount: rec.amount, currency: rec.currency },
      creditorId: rec.creditorId,
      debtorId: rec.debtorId,
      counterpartOf: (rid) => (rid === rec.creditorId ? rec.debtorId : rec.creditorId),
      dedupeBase: `rec:${rec.id}:${n}`,
    });
    created++;
  }
  await tx
    .update(recurring)
    .set({ occurrences: next, nextOn: occurrenceOn(rec.startOn, rec.every as RecurringPeriod, next) })
    .where(eq(recurring.id, rec.id));
  await refreshScope(tx, fx, { partyIds: [rec.creditorId, rec.debtorId], groupId, pairId: rec.pairId });
  return created;
}

export function stopRecurring(ctx: Ctx, input: { id: string }): Promise<void> {
  return mutate(async (tx, fx) => {
    const [r0] = await tx.select().from(recurring).where(eq(recurring.id, input.id));
    if (!r0) throw new DomainError("NOT_FOUND");
    await lockPair(tx, r0.pairId);
    const [r] = await tx.select().from(recurring).where(eq(recurring.id, input.id)).for("update");
    const me = ctx.actor.partyId;
    if (!r || (r.creditorId !== me && r.debtorId !== me)) throw new DomainError("NOT_FOUND");
    if (r.status !== "ACTIVE" && r.status !== "PENDING") throw new DomainError("INVALID_STATE");
    if (r.status === "PENDING") {
      const req = await pendingRequestFor(tx, "RECURRING", r.id);
      if (req) await closeRequest(tx, req.id, r.createdBy === ctx.actor.userId ? "CANCELLED" : "REJECTED", ctx.now);
    }
    await tx
      .update(recurring)
      .set({ status: "STOPPED", stoppedAt: ctx.now, stoppedBy: me })
      .where(eq(recurring.id, r.id));
    const other = me === r.creditorId ? r.debtorId : r.creditorId;
    const activityId = await recordActivity(tx, ctx, {
      type: "RECURRING_STOPPED",
      pairId: r.pairId,
      groupId: r.groupId,
      targetType: "PARTY",
      targetId: other,
      data: { recurringId: r.id, title: r.title },
    });
    await notifyParties(tx, fx, ctx, {
      type: "RECURRING_STOPPED",
      partyIds: [other],
      activityId,
      url: `/people/${me}`,
      data: { title: r.title, amount: r.amount, currency: r.currency },
    });
    await refreshScope(tx, fx, { partyIds: [r.creditorId, r.debtorId], groupId: r.groupId, pairId: r.pairId });
  });
}

export async function activateRecurringTx(tx: Tx, fx: Effects, id: string, now: Date) {
  const [r] = await tx
    .update(recurring)
    .set({ status: "ACTIVE" })
    .where(and(eq(recurring.id, id), eq(recurring.status, "PENDING")))
    .returning();
  if (r) await generateDueTx(tx, fx, r, now);
}

export async function closeRecurringTx(tx: Tx, id: string, status: "REJECTED" | "STOPPED", now: Date) {
  await tx
    .update(recurring)
    .set({ status, stoppedAt: now })
    .where(and(eq(recurring.id, id), inArray(recurring.status, ["PENDING", "ACTIVE"])));
}

export async function getRecurring(tx: DbOrTx, id: string): Promise<RecurringRow> {
  const [row] = await tx.select().from(recurring).where(eq(recurring.id, id));
  if (!row) throw new DomainError("NOT_FOUND");
  return row;
}

export async function unpaidGenerated(tx: DbOrTx, recurringId: string) {
  return tx
    .select()
    .from(obligation)
    .where(and(eq(obligation.recurringId, recurringId), eq(obligation.status, "ACTIVE"), sql`${obligation.paid} = 0`));
}

export type RecurringItem = {
  id: string;
  title: string;
  amount: number;
  currency: Currency;
  every: RecurringPeriod;
  nextOn: string;
  status: "PENDING" | "ACTIVE";
  direction: "THEY_OWE" | "I_OWE";
  dueAfterDays: number | null;
  mine: boolean;
};

export async function listRecurringForPair(tx: DbOrTx, pairId: string, me: string, userId: string) {
  const rows = await tx
    .select()
    .from(recurring)
    .where(and(eq(recurring.pairId, pairId), inArray(recurring.status, ["PENDING", "ACTIVE"])))
    .orderBy(recurring.nextOn);
  return rows.map((r): RecurringItem => ({
    id: r.id,
    title: r.title,
    amount: r.amount,
    currency: r.currency as Currency,
    every: r.every as RecurringPeriod,
    nextOn: r.nextOn,
    status: r.status as "PENDING" | "ACTIVE",
    direction: r.creditorId === me ? "THEY_OWE" : "I_OWE",
    dueAfterDays: r.dueAfterDays,
    mine: r.createdBy === userId,
  }));
}
