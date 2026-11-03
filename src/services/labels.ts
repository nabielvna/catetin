import "server-only";

import { and, eq, inArray, sql } from "drizzle-orm";

import { db, type DbOrTx } from "@/database/client";
import { groupMember, label, obligation, obligationLabel } from "@/database/schema/index";
import { DomainError } from "@/domain/errors";
import { newId } from "@/lib/server/ids";
import type { Ctx } from "@/services/context";
import { mutate } from "@/services/transaction";

export const LABEL_MAX = 30;
export const LABELS_PER_DEBT = 10;

export function normalizeLabel(name: string): string {
  const n = name.replace(/^#+/, "").replace(/\s+/g, " ").trim();
  if (!n || n.length > LABEL_MAX) throw new DomainError("INVALID_INPUT", { field: "label" });
  return n;
}

async function assertCanSee(tx: DbOrTx, ctx: Ctx, obligationId: string) {
  const [o] = await tx.select().from(obligation).where(eq(obligation.id, obligationId));
  if (!o) throw new DomainError("NOT_FOUND");
  const me = ctx.actor.partyId;
  if (o.creditorId === me || o.debtorId === me || o.createdBy === ctx.actor.userId) return;
  if (o.groupId) {
    const [m] = await tx
      .select({ s: groupMember.status })
      .from(groupMember)
      .where(and(eq(groupMember.groupId, o.groupId), eq(groupMember.partyId, me)));
    if (m?.s === "ACTIVE") return;
  }
  throw new DomainError("NOT_FOUND");
}

export function setDebtLabels(ctx: Ctx, input: { obligationId: string; names: string[] }): Promise<string[]> {
  return mutate(async (tx, fx) => {
    await assertCanSee(tx, ctx, input.obligationId);

    const names: string[] = [];
    for (const n of input.names.map(normalizeLabel)) {
      if (!names.some((x) => x.toLowerCase() === n.toLowerCase())) names.push(n);
    }
    if (names.length > LABELS_PER_DEBT) throw new DomainError("INVALID_INPUT", { field: "label" });
    const ids: string[] = [];
    for (const name of names) {
      const [row] = await tx.execute<{ id: string }>(sql`
        insert into ${label} (id, owner_user_id, name, created_at)
        values (${newId()}, ${ctx.actor.userId}, ${name}, ${ctx.now.toISOString()})
        on conflict (owner_user_id, lower(name)) do update set name = excluded.name
        returning id`);
      ids.push(row!.id);
    }
    const mine = tx.select({ id: label.id }).from(label).where(eq(label.ownerUserId, ctx.actor.userId));
    await tx
      .delete(obligationLabel)
      .where(and(eq(obligationLabel.obligationId, input.obligationId), inArray(obligationLabel.labelId, mine)));
    if (ids.length) {
      await tx
        .insert(obligationLabel)
        .values(ids.map((labelId) => ({ labelId, obligationId: input.obligationId, createdAt: ctx.now })))
        .onConflictDoNothing();
    }

    await tx.execute(sql`
      delete from ${label} l where l.owner_user_id = ${ctx.actor.userId}
        and not exists (select 1 from ${obligationLabel} ol where ol.label_id = l.id)`);
    fx.refreshUsers([ctx.actor.userId], { scope: "ledger" });
    return names;
  });
}

export type LabelSummary = { id: string; name: string; count: number };

export async function listLabels(userId: string): Promise<LabelSummary[]> {
  const rows = await db
    .select({ id: label.id, name: label.name, count: sql<number>`count(${obligationLabel.obligationId})::int` })
    .from(label)
    .leftJoin(obligationLabel, eq(obligationLabel.labelId, label.id))
    .where(eq(label.ownerUserId, userId))
    .groupBy(label.id, label.name)
    .orderBy(sql`lower(${label.name})`);
  return rows;
}

export async function labelsForPair(userId: string, pairId: string): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  const rows = await db
    .select({ obligationId: obligationLabel.obligationId, name: label.name })
    .from(obligationLabel)
    .innerJoin(label, eq(label.id, obligationLabel.labelId))
    .innerJoin(obligation, eq(obligation.id, obligationLabel.obligationId))
    .where(and(eq(label.ownerUserId, userId), eq(obligation.pairId, pairId)))
    .orderBy(sql`lower(${label.name})`);
  for (const r of rows) out.set(r.obligationId, [...(out.get(r.obligationId) ?? []), r.name]);
  return out;
}

export async function labelsFor(userId: string, obligationIds: string[]): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  if (obligationIds.length === 0) return out;
  const rows = await db
    .select({ obligationId: obligationLabel.obligationId, name: label.name })
    .from(obligationLabel)
    .innerJoin(label, eq(label.id, obligationLabel.labelId))
    .where(and(eq(label.ownerUserId, userId), inArray(obligationLabel.obligationId, obligationIds)))
    .orderBy(sql`lower(${label.name})`);
  for (const r of rows) out.set(r.obligationId, [...(out.get(r.obligationId) ?? []), r.name]);
  return out;
}
