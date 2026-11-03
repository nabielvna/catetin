import "server-only";

import type { Tx } from "@/database/client";
import { activity } from "@/database/schema/index";
import type { Ctx } from "@/services/context";

export type ActivityInput = {
  type: string;
  pairId?: string | null;
  groupId?: string | null;
  billId?: string | null;
  targetType?: "OBLIGATION" | "SETTLEMENT" | "GROUP" | "BILL" | "PARTY" | "INVITE" | null;
  targetId?: string | null;
  data?: Record<string, unknown>;
};

export async function recordActivity(tx: Tx, ctx: Ctx | null, input: ActivityInput) {
  const [row] = await tx
    .insert(activity)
    .values({
      type: input.type,
      pairId: input.pairId ?? null,
      groupId: input.groupId ?? null,
      billId: input.billId ?? null,
      actorUserId: ctx?.actor.userId ?? null,
      actorPartyId: ctx?.actor.partyId ?? null,
      targetType: input.targetType ?? null,
      targetId: input.targetId ?? null,
      data: input.data ?? {},
      via: ctx?.via ?? "APP",
      createdAt: ctx?.now ?? new Date(),
    })
    .returning({ id: activity.id });
  return row!.id;
}
