import "server-only";

import { and, eq, inArray, sql } from "drizzle-orm";

import type { DbOrTx, Tx } from "@/database/client";
import { APPROVAL_KINDS, approvalRequest, approvalVote } from "@/database/schema/index";
import { newId } from "@/lib/server/ids";
import type { Ctx } from "@/services/context";

export type ApprovalKind = (typeof APPROVAL_KINDS)[number];
export type ApprovalRow = typeof approvalRequest.$inferSelect;
export type TargetType = "OBLIGATION" | "SETTLEMENT" | "GROUP" | "GROUP_MEMBER" | "GROUP_SIMPLIFY" | "RECURRING";

export type OpenRequestInput = {
  kind: ApprovalKind;
  pairId?: string | null;
  groupId?: string | null;
  targetType: TargetType;
  targetId: string;
  payload?: Record<string, unknown>;
  baseVersion?: number | null;
  approvers: string[];

  quorum?: "ALL" | "ANY";
};

export async function openRequest(tx: Tx, ctx: Ctx, input: OpenRequestInput): Promise<ApprovalRow> {
  const [req] = await tx
    .insert(approvalRequest)
    .values({
      id: newId(),
      kind: input.kind,
      pairId: input.pairId ?? null,
      groupId: input.groupId ?? null,
      targetType: input.targetType,
      targetId: input.targetId,
      payload: { ...(input.payload ?? {}), quorum: input.quorum ?? "ALL" },
      baseVersion: input.baseVersion ?? null,
      requestedBy: ctx.actor.userId,
      requestedByParty: ctx.actor.partyId,
      status: "PENDING",
      createdAt: ctx.now,
    })
    .returning();
  await tx.insert(approvalVote).values(input.approvers.map((partyId) => ({ requestId: req!.id, partyId })));
  return req!;
}

export async function pendingRequestFor(
  tx: DbOrTx,
  targetType: TargetType,
  targetId: string,
): Promise<ApprovalRow | undefined> {
  const [row] = await tx
    .select()
    .from(approvalRequest)
    .where(
      and(
        eq(approvalRequest.targetType, targetType),
        eq(approvalRequest.targetId, targetId),
        eq(approvalRequest.status, "PENDING"),
      ),
    );
  return row;
}

export async function votersOf(tx: DbOrTx, requestId: string) {
  return tx.select().from(approvalVote).where(eq(approvalVote.requestId, requestId));
}

export async function supersedePending(
  tx: Tx,
  targets: Array<{ targetType: TargetType; targetId: string }>,
  now: Date,
  reason: string,
): Promise<ApprovalRow[]> {
  if (targets.length === 0) return [];
  const out: ApprovalRow[] = [];
  for (const type of new Set(targets.map((t) => t.targetType))) {
    const ids = targets.filter((t) => t.targetType === type).map((t) => t.targetId);
    const rows = await tx
      .update(approvalRequest)
      .set({ status: "SUPERSEDED", decidedAt: now, reason })
      .where(
        and(
          eq(approvalRequest.targetType, type),
          inArray(approvalRequest.targetId, ids),
          eq(approvalRequest.status, "PENDING"),
        ),
      )
      .returning();
    out.push(...rows);
  }
  return out;
}

export async function closeRequest(
  tx: Tx,
  id: string,
  status: "APPROVED" | "REJECTED" | "CANCELLED" | "SUPERSEDED",
  now: Date,
  reason?: string | null,
) {
  await tx
    .update(approvalRequest)
    .set({ status, decidedAt: now, reason: reason ?? null })
    .where(and(eq(approvalRequest.id, id), eq(approvalRequest.status, "PENDING")));
}

export async function countAwaiting(tx: DbOrTx, partyId: string): Promise<number> {
  const [row] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(approvalVote)
    .innerJoin(approvalRequest, eq(approvalRequest.id, approvalVote.requestId))
    .where(
      and(
        eq(approvalVote.partyId, partyId),
        eq(approvalVote.decision, "PENDING"),
        eq(approvalRequest.status, "PENDING"),
      ),
    );
  return row?.n ?? 0;
}
