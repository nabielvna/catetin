import "server-only";

import { eq } from "drizzle-orm";

import { bill, billShare } from "@/database/schema/bills";
import { isLocalDate, type LocalDate } from "@/domain/dates";
import { isCategory, TITLE_MAX } from "@/domain/debt";
import { DomainError } from "@/domain/errors";
import { type Currency, isCurrency } from "@/domain/money";
import { computeSplit, type SplitInput } from "@/domain/split";
import { newId } from "@/lib/server/ids";
import { recordActivity } from "@/services/activity";
import type { Ctx } from "@/services/context";
import { createObligationTx } from "@/services/debts/mutations";
import { getGroup, getMember } from "@/services/groups/access";
import { notifyParties, refreshScope } from "@/services/notifications/parties";
import {
  canSeeParty,
  ensurePair,
  getParties,
  isActiveUser,
  lockPairs,
  orderPair,
  resolvePartyId,
} from "@/services/people/parties";
import { mutate } from "@/services/transaction";

export type CreateBillInput = {
  id: string;
  title: string;
  occurredOn: LocalDate;
  dueOn?: LocalDate | null;
  currency: Currency;
  category?: string | null;
  groupId?: string | null;

  payerId: string;
  split: SplitInput;
  receiptFileId?: string | null;
};

export type BillShareResult = {
  partyId: string;
  total: number;
  obligationId: string | null;
  infoOnly: boolean;
  status: "PENDING" | "ACTIVE" | "REJECTED" | "VOID" | null;
};

export function createBill(ctx: Ctx, input: CreateBillInput): Promise<{ id: string; shares: BillShareResult[] }> {
  return mutate(async (tx, fx) => {
    const title = input.title.trim();
    if (!title || title.length > TITLE_MAX) throw new DomainError("INVALID_INPUT", { field: "title" });
    if (!isLocalDate(input.occurredOn)) throw new DomainError("INVALID_INPUT", { field: "occurredOn" });
    if (input.dueOn && !isLocalDate(input.dueOn)) throw new DomainError("INVALID_INPUT", { field: "dueOn" });
    if (!isCurrency(input.currency)) throw new DomainError("INVALID_INPUT", { field: "currency" });
    if (input.category && !isCategory(input.category)) throw new DomainError("INVALID_INPUT", { field: "category" });

    const [existing] = await tx.select().from(bill).where(eq(bill.id, input.id));
    if (existing) {
      if (existing.createdBy !== ctx.actor.userId) throw new DomainError("INVALID_INPUT");
      const shares = await tx.select().from(billShare).where(eq(billShare.billId, existing.id));
      return {
        id: existing.id,
        shares: shares.map((s) => ({
          partyId: s.partyId,
          total: s.total,
          obligationId: s.obligationId,
          infoOnly: s.infoOnly,
          status: null,
        })),
      };
    }

    const me = ctx.actor.partyId;
    const payerId = await resolvePartyId(tx, input.payerId);
    const participants = await Promise.all(input.split.participants.map((p) => resolvePartyId(tx, p)));
    const remap = new Map(input.split.participants.map((p, i) => [p, participants[i]!]));
    const split = computeSplit({
      ...input.split,
      participants,
      items: input.split.items?.map((it) => ({ ...it, assignees: it.assignees?.map((a) => remap.get(a) ?? a) })),
      exact: remapRecord(input.split.exact, remap),
      percent: remapRecord(input.split.percent, remap),
      shares: remapRecord(input.split.shares, remap),
    });

    const group = input.groupId ? await getGroup(tx, input.groupId) : null;
    if (group) {
      if (group.archivedAt) throw new DomainError("INVALID_STATE");
      if ((await getMember(tx, group.id, me))?.status !== "ACTIVE") throw new DomainError("NOT_FOUND");
    }
    const everyone = [...new Set([payerId, ...participants])];
    for (const pid of everyone) {
      if (!(await canSeeParty(tx, ctx.actor, pid))) throw new DomainError("NOT_FOUND");
    }
    const parties = await getParties(tx, everyone);
    const isGroupMember = async (pid: string) =>
      group ? (await getMember(tx, group.id, pid))?.status === "ACTIVE" : false;

    const plan: Array<{ partyId: string; total: number; record: boolean }> = [];
    for (const s of split.shares) {
      if (s.partyId === payerId || s.total === 0) {
        plan.push({ partyId: s.partyId, total: s.total, record: false });
        continue;
      }
      let record = s.partyId === me || payerId === me;
      if (!record) {
        const bothUsers = isActiveUser(parties.get(s.partyId)!) && isActiveUser(parties.get(payerId)!);
        const bothMembers = (await isGroupMember(s.partyId)) && (await isGroupMember(payerId));
        record = bothUsers || bothMembers;
      }
      plan.push({ partyId: s.partyId, total: s.total, record });
    }

    const toRecord = plan.filter((p) => p.record);
    const pairKeys = toRecord.map((p) => orderPair(p.partyId, payerId)).sort((a, b) => (a.join() < b.join() ? -1 : 1));
    const pairs = [];
    for (const [a, b] of pairKeys) pairs.push(await ensurePair(tx, a, b));
    await lockPairs(
      tx,
      pairs.map((p) => p.id),
    );

    await tx
      .insert(bill)
      .values({
        id: input.id,
        groupId: group?.id ?? null,
        title,
        occurredOn: input.occurredOn,
        currency: input.currency,
        payerPartyId: payerId,
        subtotal: split.subtotal,
        discount: split.discount,
        service: split.service,
        tax: split.tax,
        total: split.total,
        splitMode: input.split.mode,
        input: { ...input.split, participants, dueOn: input.dueOn ?? null, category: input.category ?? null },
        receiptFileId: input.receiptFileId ?? null,
        createdBy: ctx.actor.userId,
        createdVia: ctx.via,
        createdAt: ctx.now,
      });

    const results: BillShareResult[] = [];
    for (const s of split.shares) {
      const p = plan.find((x) => x.partyId === s.partyId)!;
      let obligationId: string | null = null;
      let status: BillShareResult["status"] = null;
      if (p.record) {
        obligationId = newId();
        const r = await createObligationTx(
          tx,
          fx,
          ctx,
          {
            id: obligationId,
            creditorId: payerId,
            debtorId: s.partyId,
            amount: s.total,
            currency: input.currency,
            title,
            category: input.category ?? "SHARED",
            occurredOn: input.occurredOn,
            dueOn: input.dueOn ?? null,
            groupId: group?.id ?? null,
          },
          { billId: input.id, trustedRelation: true, silent: true },
        );
        status = r.status;
      }
      await tx
        .insert(billShare)
        .values({
          billId: input.id,
          partyId: s.partyId,
          base: s.base,
          discount: s.discount,
          service: s.service,
          tax: s.tax,
          total: s.total,
          obligationId,
          infoOnly: s.partyId !== payerId && s.total > 0 && !p.record,
        });
      results.push({
        partyId: s.partyId,
        total: s.total,
        obligationId,
        infoOnly: s.partyId !== payerId && s.total > 0 && !p.record,
        status,
      });
    }

    const activityId = await recordActivity(tx, ctx, {
      type: "BILL_CREATED",
      groupId: group?.id,
      billId: input.id,
      targetType: "BILL",
      targetId: input.id,
      data: { total: split.total, currency: input.currency, title, participants: participants.length },
    });

    const needApproval = results.filter((r) => r.status === "PENDING").map((r) => r.partyId);
    const others = [...everyone].filter((p) => !needApproval.includes(p));
    const common = {
      activityId,
      url: `/bills/${input.id}`,
      data: { title, amount: split.total, currency: input.currency },
      groupName: group?.name,
    };
    await notifyParties(tx, fx, ctx, { ...common, type: "OBLIGATION_PROPOSED", partyIds: needApproval });
    await notifyParties(tx, fx, ctx, { ...common, type: "BILL_CREATED", partyIds: others });
    await refreshScope(tx, fx, { partyIds: everyone, groupId: group?.id });
    return { id: input.id, shares: results };
  });
}

function remapRecord<T>(rec: Record<string, T> | undefined, remap: Map<string, string>) {
  if (!rec) return undefined;
  return Object.fromEntries(Object.entries(rec).map(([k, v]) => [remap.get(k) ?? k, v]));
}
