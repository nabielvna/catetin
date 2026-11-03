import "server-only";

import { eq, inArray } from "drizzle-orm";

import type { DbOrTx, Tx } from "@/database/client";
import { obligation, obligationItem } from "@/database/schema/debts";
import { isLocalDate, type LocalDate } from "@/domain/dates";
import {
  assertItemsMatch,
  diffObligation,
  isCategory,
  isMetadataOnly,
  lineTotal,
  NOTE_MAX,
  type ObligationItemInput,
  type ObligationPatch,
  TITLE_MAX,
} from "@/domain/debt";
import { DomainError } from "@/domain/errors";
import { assertValidPlan, effectiveDueOn, type InstallmentPlan, isInstallmentPlan } from "@/domain/installments";
import { assertValidAmount, type Currency, isCurrency, type Minor } from "@/domain/money";
import { requiredApprovers } from "@/domain/policy";
import { newId } from "@/lib/server/ids";
import { recordActivity } from "@/services/activity";
import { closeRequest, openRequest, pendingRequestFor, supersedePending } from "@/services/approvals/mutations";
import { learnCategory } from "@/services/categories";
import type { Ctx } from "@/services/context";
import { reservedAmount } from "@/services/debts/queries";
import { type Effects } from "@/services/effects";
import { getGroup, getMember, type GroupRow } from "@/services/groups/access";
import { notifyParties, refreshScope } from "@/services/notifications/parties";
import { assertNotBlocked } from "@/services/people/blocks";
import {
  canSeeParty,
  ensurePair,
  getParties,
  isActiveUser,
  lockPair,
  type PartyRow,
  resolvePartyId,
  touchPair,
} from "@/services/people/parties";
import { recordTrustActions, trustSinceOf } from "@/services/people/trust";
import { mutate } from "@/services/transaction";

export type ObligationRow = typeof obligation.$inferSelect;

export type CreateObligationInput = {
  id: string;
  creditorId: string;
  debtorId: string;
  amount: Minor;
  currency: Currency;
  title: string;
  note?: string | null;
  category?: string | null;
  occurredOn: LocalDate;
  dueOn?: LocalDate | null;
  groupId?: string | null;
  items?: ObligationItemInput[];

  installments?: InstallmentPlan | null;
};

export function validateObligationFields(input: {
  amount?: Minor;
  currency?: string;
  title?: string;
  note?: string | null;
  category?: string | null;
  occurredOn?: string;
  dueOn?: string | null;
}) {
  if (input.amount !== undefined) assertValidAmount(input.amount);
  if (input.currency !== undefined && !isCurrency(input.currency)) {
    throw new DomainError("INVALID_INPUT", { field: "currency" });
  }
  if (input.title !== undefined) {
    const t = input.title.trim();
    if (t.length === 0 || t.length > TITLE_MAX) throw new DomainError("INVALID_INPUT", { field: "title" });
  }
  if (input.note && input.note.length > NOTE_MAX) throw new DomainError("INVALID_INPUT", { field: "note" });
  if (input.category && !isCategory(input.category)) {
    throw new DomainError("INVALID_INPUT", { field: "category" });
  }
  if (input.occurredOn !== undefined && !isLocalDate(input.occurredOn)) {
    throw new DomainError("INVALID_INPUT", { field: "occurredOn" });
  }
  if (input.dueOn && !isLocalDate(input.dueOn)) throw new DomainError("INVALID_INPUT", { field: "dueOn" });
}

export async function getObligation(tx: DbOrTx, id: string): Promise<ObligationRow> {
  const [row] = await tx.select().from(obligation).where(eq(obligation.id, id));
  if (!row) throw new DomainError("NOT_FOUND");
  return row;
}

async function loadForMutation(tx: Tx, ctx: Ctx, id: string) {
  const ob0 = await getObligation(tx, id);
  const pairRow = await lockPair(tx, ob0.pairId);
  const ob = await getObligation(tx, id);
  const isParty = ob.creditorId === ctx.actor.partyId || ob.debtorId === ctx.actor.partyId;
  if (!isParty && ob.createdBy !== ctx.actor.userId) throw new DomainError("NOT_FOUND");
  const parties = await getParties(tx, [ob.creditorId, ob.debtorId]);
  return { ob, pairRow, creditor: parties.get(ob.creditorId)!, debtor: parties.get(ob.debtorId)! };
}

export function planOf(ob: Pick<ObligationRow, "installments">): InstallmentPlan | null {
  return isInstallmentPlan(ob.installments) ? ob.installments : null;
}

export async function snapshotOf(tx: DbOrTx, ob: ObligationRow) {
  const items = await tx
    .select()
    .from(obligationItem)
    .where(eq(obligationItem.obligationId, ob.id))
    .orderBy(obligationItem.position);
  return {
    amount: ob.amount,
    dueOn: planOf(ob) ? null : ob.dueOn,
    installments: planOf(ob),
    title: ob.title,
    note: ob.note,
    category: ob.category,
    occurredOn: ob.occurredOn,
    items: items.map((i) => ({ name: i.name, qtyMilli: i.qtyMilli, unitPrice: i.unitPrice })),
  };
}

function groupModeFor(group: GroupRow | null) {
  return group ? group.mode : null;
}

function urlFor(id: string) {
  return `/debts/${id}`;
}

export type CreateOptions = {
  billId?: string | null;

  recurringId?: string | null;

  sourceSettlementId?: string | null;
  forceStatus?: "PENDING" | "ACTIVE";

  trustedRelation?: boolean;

  silent?: boolean;

  preApproved?: boolean;
};

export async function createObligationTx(
  tx: Tx,
  fx: Effects,
  ctx: Ctx,
  raw: CreateObligationInput,
  opts: CreateOptions = {},
): Promise<{ id: string; status: ObligationRow["status"]; created: boolean }> {
  validateObligationFields(raw);
  const items = raw.items ?? [];
  assertItemsMatch(items, raw.amount);
  const plan = raw.installments ?? null;
  if (plan) assertValidPlan(plan, raw.amount);

  const [existing] = await tx.select().from(obligation).where(eq(obligation.id, raw.id));
  if (existing) {
    if (existing.createdBy !== ctx.actor.userId) throw new DomainError("INVALID_INPUT");
    return { id: existing.id, status: existing.status, created: false };
  }

  const creditorId = await resolvePartyId(tx, raw.creditorId);
  const debtorId = await resolvePartyId(tx, raw.debtorId);
  if (creditorId === debtorId) throw new DomainError("SELF_PAIR");
  const me = ctx.actor.partyId;
  const actorIsParty = me === creditorId || me === debtorId;

  const group = raw.groupId ? await getGroup(tx, raw.groupId) : null;
  if (group) {
    if (group.archivedAt) throw new DomainError("INVALID_STATE");
    const actorMember = await getMember(tx, group.id, me);
    if (actorMember?.status !== "ACTIVE") throw new DomainError("NOT_FOUND");
  }

  if (!opts.trustedRelation) {
    if (actorIsParty) {
      const other = me === creditorId ? debtorId : creditorId;
      if (!(await canSeeParty(tx, ctx.actor, other))) throw new DomainError("NOT_FOUND");
    } else {
      if (!group) throw new DomainError("FORBIDDEN_ROLE");
    }
    if (group) {
      for (const pid of [creditorId, debtorId]) {
        const m = await getMember(tx, group.id, pid);
        if (m?.status !== "ACTIVE") throw new DomainError("NOT_GROUP_MEMBER");
      }
    }
  }

  if (!opts.preApproved && !opts.forceStatus) await assertNotBlocked(tx, me, [creditorId, debtorId]);

  const parties = await getParties(tx, [creditorId, debtorId]);
  const creditor = parties.get(creditorId)!;
  const debtor = parties.get(debtorId)!;

  const pairRow = await lockPair(tx, (await ensurePair(tx, creditorId, debtorId)).id);

  const { approvers, trusted } =
    opts.preApproved || opts.recurringId || opts.forceStatus
      ? { approvers: [] as string[], trusted: [] as string[] }
      : requiredApprovers({
          action: { kind: "OBLIGATION_CREATE" },
          actorPartyId: me,
          creditor: { id: creditorId, isUser: isActiveUser(creditor) },
          debtor: { id: debtorId, isUser: isActiveUser(debtor) },
          groupMode: groupModeFor(group),
          groupTrustSince: group?.trustSince ?? null,
          trustSince: trustSinceOf(pairRow),
        });
  const status = opts.forceStatus ?? (approvers.length > 0 ? "PENDING" : "ACTIVE");

  await tx
    .insert(obligation)
    .values({
      id: raw.id,
      pairId: pairRow.id,
      creditorId,
      debtorId,
      groupId: group?.id ?? null,
      billId: opts.billId ?? null,
      amount: raw.amount,
      currency: raw.currency,
      title: raw.title.trim(),
      note: raw.note?.trim() || null,
      category: raw.category ?? null,
      occurredOn: raw.occurredOn,
      dueOn: effectiveDueOn(raw.amount, plan, raw.dueOn ?? null, 0),
      installments: plan,
      recurringId: opts.recurringId ?? null,
      sourceSettlementId: opts.sourceSettlementId ?? null,
      status,
      createdBy: ctx.actor.userId,
      createdVia: ctx.via,
      createdAt: ctx.now,
      updatedAt: ctx.now,
      activatedAt: status === "ACTIVE" ? ctx.now : null,
    });
  await insertItems(tx, raw.id, items);

  if (!opts.recurringId && !opts.forceStatus && !opts.preApproved && ctx.via !== "MIGRATION") {
    await learnCategory(tx, ctx.actor.userId, raw.title, raw.category);
  }

  if (approvers.length > 0 && !opts.forceStatus) {
    await openRequest(tx, ctx, {
      kind: "OBLIGATION_CREATE",
      pairId: pairRow.id,
      groupId: group?.id,
      targetType: "OBLIGATION",
      targetId: raw.id,
      approvers,
    });
  }

  const activityId = await recordActivity(tx, ctx, {
    type: status === "PENDING" ? "OBLIGATION_PROPOSED" : "OBLIGATION_RECORDED",
    pairId: pairRow.id,
    groupId: group?.id,
    billId: opts.billId,
    targetType: "OBLIGATION",
    targetId: raw.id,
    data: { amount: raw.amount, currency: raw.currency, title: raw.title.trim() },
  });
  await touchPair(tx, pairRow.id, ctx.now);

  if (!opts.silent) {
    const common = {
      activityId,
      url: urlFor(raw.id),
      data: { amount: raw.amount, currency: raw.currency, title: raw.title.trim() },
      creditorId,
      debtorId,
      groupName: group?.name,
      counterpartOf: (rid: string) => (actorIsParty ? undefined : rid === creditorId ? debtorId : creditorId),
    };
    if (approvers.length > 0) {
      await notifyParties(tx, fx, ctx, { ...common, type: "OBLIGATION_PROPOSED", partyIds: approvers });
    }
    const infoRecipients = [creditorId, debtorId].filter((p) => !approvers.includes(p) && !trusted.includes(p));
    await notifyParties(tx, fx, ctx, { ...common, type: "OBLIGATION_RECORDED", partyIds: infoRecipients });
  }
  await recordTrustActions(tx, fx, ctx, {
    pairId: pairRow.id,
    kind: "OBLIGATION_CREATE",
    targetType: "OBLIGATION",
    targetId: raw.id,
    trusted,
    display: { title: raw.title.trim(), amount: raw.amount, currency: raw.currency },
    url: urlFor(raw.id),
    notify: !opts.silent,
  });
  await refreshScope(tx, fx, { partyIds: [creditorId, debtorId], groupId: group?.id, pairId: pairRow.id });

  return { id: raw.id, status, created: true };
}

async function insertItems(tx: Tx, obligationId: string, items: ObligationItemInput[]) {
  if (items.length === 0) return;
  await tx
    .insert(obligationItem)
    .values(
      items.map((it, i) => ({
        id: newId(),
        obligationId,
        position: i,
        name: it.name.trim().slice(0, TITLE_MAX),
        qtyMilli: it.qtyMilli,
        unitPrice: it.unitPrice,
        lineTotal: lineTotal(it),
      })),
    );
}

async function replaceItems(tx: Tx, obligationId: string, items: ObligationItemInput[]) {
  await tx.delete(obligationItem).where(eq(obligationItem.obligationId, obligationId));
  await insertItems(tx, obligationId, items);
}

export async function itemsKeyOf(tx: DbOrTx, obligationId: string): Promise<string> {
  const rows = await tx
    .select()
    .from(obligationItem)
    .where(eq(obligationItem.obligationId, obligationId))
    .orderBy(obligationItem.position);
  return itemsKey(rows.map((r) => ({ name: r.name, qtyMilli: r.qtyMilli, unitPrice: r.unitPrice })));
}

export function itemsKey(items: readonly ObligationItemInput[]): string {
  return JSON.stringify(items.map((i) => [i.name.trim(), i.qtyMilli, i.unitPrice]));
}

export function createObligation(ctx: Ctx, input: CreateObligationInput) {
  return mutate((tx, fx) => createObligationTx(tx, fx, ctx, input));
}

export type UpdateObligationInput = {
  id: string;
  patch: {
    amount?: Minor;
    dueOn?: LocalDate | null;
    title?: string;
    note?: string | null;
    category?: string | null;
    occurredOn?: LocalDate;

    installments?: InstallmentPlan | null;
  };

  items?: ObligationItemInput[];
};

export type UpdateResult = { status: "APPLIED" | "PROPOSED" | "UNCHANGED" };

export async function updateObligation(ctx: Ctx, input: UpdateObligationInput): Promise<UpdateResult> {
  return mutate(async (tx, fx) => {
    validateObligationFields(input.patch);
    const { ob, pairRow, creditor, debtor } = await loadForMutation(tx, ctx, input.id);
    const current = {
      amount: ob.amount,
      currency: ob.currency as Currency,
      dueOn: ob.dueOn,
      title: ob.title,
      note: ob.note,
      category: ob.category,
      occurredOn: ob.occurredOn,
      itemsKey: await itemsKeyOf(tx, ob.id),
      installments: planOf(ob),
    };
    const nextPlan = input.patch.installments !== undefined ? input.patch.installments : current.installments;
    if (nextPlan) assertValidPlan(nextPlan, input.patch.amount ?? ob.amount);
    const patch: ObligationPatch = {
      ...input.patch,
      title: input.patch.title?.trim(),
      note: input.patch.note === undefined ? undefined : input.patch.note?.trim() || null,
      itemsKey: input.items ? itemsKey(input.items) : undefined,
    };
    const { change, changedFields } = diffObligation(current, patch);
    if (changedFields.length === 0) return { status: "UNCHANGED" };
    if (changedFields.includes("category")) {
      await learnCategory(tx, ctx.actor.userId, patch.title ?? ob.title, patch.category);
    }

    const newAmount = patch.amount ?? ob.amount;
    const items = input.items;
    if (items) assertItemsMatch(items, newAmount);
    else if (patch.amount !== undefined && current.itemsKey !== "[]") {
      throw new DomainError("ITEMS_MISMATCH");
    }

    const isParty = ob.creditorId === ctx.actor.partyId || ob.debtorId === ctx.actor.partyId;
    const scope = { partyIds: [ob.creditorId, ob.debtorId], groupId: ob.groupId, pairId: ob.pairId };

    if (ob.status === "PENDING") {
      if (ob.createdBy !== ctx.actor.userId) throw new DomainError("INVALID_STATE");
      await applyPatch(tx, ctx, ob, patch, items);
      const activityId = await recordActivity(tx, ctx, {
        type: "OBLIGATION_EDITED",
        pairId: ob.pairId,
        groupId: ob.groupId,
        targetType: "OBLIGATION",
        targetId: ob.id,
        data: { fields: changedFields },
      });
      await notifyParties(tx, fx, ctx, {
        type: "OBLIGATION_CHANGED",
        partyIds: [ob.creditorId, ob.debtorId],
        activityId,
        url: urlFor(ob.id),
        data: { title: patch.title ?? ob.title, changes: changedFields },
      });
      await refreshScope(tx, fx, scope);
      return { status: "APPLIED" };
    }

    if (ob.status !== "ACTIVE") throw new DomainError("INVALID_STATE");
    if (!isParty) throw new DomainError("FORBIDDEN_ROLE");
    if (await pendingRequestFor(tx, "OBLIGATION", ob.id)) throw new DomainError("CHANGE_PENDING");

    const reserved = await reservedAmount(tx, ob.id);
    if (newAmount < ob.paid + reserved) {
      throw new DomainError("AMOUNT_BELOW_PAID", { min: ob.paid + reserved });
    }

    const obGroup = ob.groupId ? await getGroup(tx, ob.groupId) : null;
    const { approvers, trusted } = requiredApprovers({
      action: { kind: "OBLIGATION_UPDATE", change },
      actorPartyId: ctx.actor.partyId,
      creditor: { id: creditor.id, isUser: isActiveUser(creditor) },
      debtor: { id: debtor.id, isUser: isActiveUser(debtor) },
      groupMode: groupModeFor(obGroup),
      groupTrustSince: obGroup?.trustSince ?? null,
      trustSince: trustSinceOf(pairRow),
      targetCreatedAt: ob.createdAt,
    });

    if (approvers.length === 0) {
      const before = trusted.length > 0 ? await snapshotOf(tx, ob) : null;
      await applyPatch(tx, ctx, ob, patch, items);
      const activityId = await recordActivity(tx, ctx, {
        type: isMetadataOnly(change) ? "OBLIGATION_METADATA_CHANGED" : "OBLIGATION_CHANGED",
        pairId: ob.pairId,
        groupId: ob.groupId,
        targetType: "OBLIGATION",
        targetId: ob.id,
        data: { fields: changedFields, before: pick(current, changedFields), after: pick(patch, changedFields) },
      });
      await notifyParties(tx, fx, ctx, {
        type: isMetadataOnly(change) ? "METADATA_CHANGED" : "OBLIGATION_CHANGED",
        partyIds: [ob.creditorId, ob.debtorId].filter((p) => !trusted.includes(p)),
        activityId,
        url: urlFor(ob.id),
        data: { title: patch.title ?? ob.title, changes: changedFields },
      });
      await recordTrustActions(tx, fx, ctx, {
        pairId: ob.pairId,
        kind: "OBLIGATION_UPDATE",
        targetType: "OBLIGATION",
        targetId: ob.id,
        trusted,
        payload: { before, afterVersion: ob.version + 1, fields: changedFields },
        display: { title: patch.title ?? ob.title, amount: newAmount, currency: ob.currency },
        url: urlFor(ob.id),
      });
      await refreshScope(tx, fx, scope);
      return { status: "APPLIED" };
    }

    await openRequest(tx, ctx, {
      kind: "OBLIGATION_UPDATE",
      pairId: ob.pairId,
      groupId: ob.groupId,
      targetType: "OBLIGATION",
      targetId: ob.id,
      baseVersion: ob.version,
      payload: { patch, items: items ?? null, before: pick(current, changedFields), fields: changedFields },
      approvers,
    });
    const activityId = await recordActivity(tx, ctx, {
      type: "OBLIGATION_CHANGE_PROPOSED",
      pairId: ob.pairId,
      groupId: ob.groupId,
      targetType: "OBLIGATION",
      targetId: ob.id,
      data: { fields: changedFields, before: pick(current, changedFields), after: pick(patch, changedFields) },
    });
    await notifyParties(tx, fx, ctx, {
      type: "CHANGE_PROPOSED",
      partyIds: approvers,
      activityId,
      url: urlFor(ob.id),
      data: { title: ob.title, changes: changedFields, amount: newAmount, currency: ob.currency },
    });
    await refreshScope(tx, fx, scope);
    return { status: "PROPOSED" };
  });
}

function pick(obj: Record<string, unknown>, fields: string[]) {
  return Object.fromEntries(fields.filter((f) => f !== "itemsKey").map((f) => [f, obj[f] ?? null]));
}

export async function applyPatch(
  tx: Tx,
  ctx: Ctx,
  ob: ObligationRow,
  patch: ObligationPatch,
  items: ObligationItemInput[] | null | undefined,
) {
  const set: Partial<typeof obligation.$inferInsert> = { updatedAt: ctx.now, version: ob.version + 1 };
  if (patch.amount !== undefined) set.amount = patch.amount;
  if (patch.dueOn !== undefined) set.dueOn = patch.dueOn;
  if (patch.title !== undefined) set.title = patch.title;
  if (patch.note !== undefined) set.note = patch.note;
  if (patch.category !== undefined) set.category = patch.category;
  if (patch.occurredOn !== undefined) set.occurredOn = patch.occurredOn;
  if (patch.installments !== undefined) set.installments = patch.installments;
  const plan = patch.installments !== undefined ? patch.installments : planOf(ob);
  if (plan) {
    set.dueOn = effectiveDueOn(patch.amount ?? ob.amount, plan, null, ob.paid);
  } else if (patch.installments === null && patch.dueOn === undefined) {
    set.dueOn = null;
  }

  await tx.update(obligation).set(set).where(eq(obligation.id, ob.id));
  if (items) await replaceItems(tx, ob.id, items);
}

export type VoidResult = { status: "VOIDED" | "WITHDRAWN" | "PROPOSED" };

export async function voidObligation(ctx: Ctx, input: { id: string; reason?: string | null }): Promise<VoidResult> {
  return mutate(async (tx, fx) => {
    const { ob, pairRow, creditor, debtor } = await loadForMutation(tx, ctx, input.id);
    const scope = { partyIds: [ob.creditorId, ob.debtorId], groupId: ob.groupId, pairId: ob.pairId };

    if (ob.status === "PENDING") {
      if (ob.createdBy !== ctx.actor.userId) throw new DomainError("INVALID_STATE");
      await tx
        .update(obligation)
        .set({ status: "VOID", closedAt: ctx.now, updatedAt: ctx.now })
        .where(eq(obligation.id, ob.id));
      const req = await pendingRequestFor(tx, "OBLIGATION", ob.id);
      if (req) await closeRequest(tx, req.id, "CANCELLED", ctx.now);
      await recordActivity(tx, ctx, {
        type: "OBLIGATION_WITHDRAWN",
        pairId: ob.pairId,
        groupId: ob.groupId,
        targetType: "OBLIGATION",
        targetId: ob.id,
      });
      await refreshScope(tx, fx, scope);
      return { status: "WITHDRAWN" };
    }

    if (ob.status !== "ACTIVE") throw new DomainError("INVALID_STATE");
    const isParty = ob.creditorId === ctx.actor.partyId || ob.debtorId === ctx.actor.partyId;
    if (!isParty) throw new DomainError("FORBIDDEN_ROLE");

    if (ob.paid > 0 || (await reservedAmount(tx, ob.id)) > 0) {
      throw new DomainError("HAS_PAYMENTS");
    }
    if (await pendingRequestFor(tx, "OBLIGATION", ob.id)) throw new DomainError("CHANGE_PENDING");

    const obGroup = ob.groupId ? await getGroup(tx, ob.groupId) : null;
    const { approvers, trusted } = requiredApprovers({
      action: { kind: "OBLIGATION_VOID" },
      actorPartyId: ctx.actor.partyId,
      creditor: { id: creditor.id, isUser: isActiveUser(creditor) },
      debtor: { id: debtor.id, isUser: isActiveUser(debtor) },
      groupMode: groupModeFor(obGroup),
      groupTrustSince: obGroup?.trustSince ?? null,
      trustSince: trustSinceOf(pairRow),
      targetCreatedAt: ob.createdAt,
    });

    if (approvers.length === 0) {
      await markVoid(tx, ctx, ob);
      const activityId = await recordActivity(tx, ctx, {
        type: "OBLIGATION_VOIDED",
        pairId: ob.pairId,
        groupId: ob.groupId,
        targetType: "OBLIGATION",
        targetId: ob.id,
        data: { reason: input.reason ?? null },
      });
      await notifyParties(tx, fx, ctx, {
        type: "OBLIGATION_VOIDED",
        partyIds: [ob.creditorId, ob.debtorId].filter((p) => !trusted.includes(p)),
        activityId,
        url: urlFor(ob.id),
        data: { title: ob.title, amount: ob.amount, currency: ob.currency, reason: input.reason ?? null },
      });
      await recordTrustActions(tx, fx, ctx, {
        pairId: ob.pairId,
        kind: "OBLIGATION_VOID",
        targetType: "OBLIGATION",
        targetId: ob.id,
        trusted,
        payload: { afterVersion: ob.version + 1 },
        display: { title: ob.title, amount: ob.amount, currency: ob.currency },
        url: urlFor(ob.id),
      });
      await refreshScope(tx, fx, scope);
      return { status: "VOIDED" };
    }

    await openRequest(tx, ctx, {
      kind: "OBLIGATION_VOID",
      pairId: ob.pairId,
      groupId: ob.groupId,
      targetType: "OBLIGATION",
      targetId: ob.id,
      baseVersion: ob.version,
      payload: { reason: input.reason ?? null },
      approvers,
    });
    const activityId = await recordActivity(tx, ctx, {
      type: "OBLIGATION_VOID_PROPOSED",
      pairId: ob.pairId,
      groupId: ob.groupId,
      targetType: "OBLIGATION",
      targetId: ob.id,
      data: { reason: input.reason ?? null },
    });
    await notifyParties(tx, fx, ctx, {
      type: "VOID_PROPOSED",
      partyIds: approvers,
      activityId,
      url: urlFor(ob.id),
      data: { title: ob.title, amount: ob.amount, currency: ob.currency, reason: input.reason ?? null },
    });
    await refreshScope(tx, fx, scope);
    return { status: "PROPOSED" };
  });
}

export async function markVoid(tx: Tx, ctx: Ctx, ob: ObligationRow) {
  await tx
    .update(obligation)
    .set({ status: "VOID", closedAt: ctx.now, updatedAt: ctx.now, version: ob.version + 1 })
    .where(eq(obligation.id, ob.id));
  await supersedePending(tx, [{ targetType: "OBLIGATION", targetId: ob.id }], ctx.now, "TARGET_VOIDED");
}

export type ObligationParties = { creditor: PartyRow; debtor: PartyRow };

export async function obligationsByIds(tx: DbOrTx, ids: string[]) {
  if (ids.length === 0) return [];
  return tx.select().from(obligation).where(inArray(obligation.id, ids));
}
